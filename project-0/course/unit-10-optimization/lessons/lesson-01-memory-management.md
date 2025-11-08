# Lesson 1: Memory Management in Reactive Systems

## Introduction

Memory management is crucial in long-running reactive applications. Unlike simple applications where garbage collection handles everything, reactive systems create complex webs of dependencies that can prevent proper cleanup. This lesson explores how Solid.js handles memory management and how to prevent leaks.

## Understanding Memory Leaks in Reactive Systems

### What Causes Leaks?

```javascript
// ❌ Memory Leak Example
function createLeak() {
  const [data, setData] = createSignal([]);
  
  // This effect never gets cleaned up!
  createEffect(() => {
    console.log('Data changed:', data());
  });
  
  // Component unmounts, but effect still runs
  // The signal, effect, and all data remain in memory
}

// Called 1000 times = 1000 leaked effects
for (let i = 0; i < 1000; i++) {
  createLeak();
}
```

**Why this leaks:**
1. Effect subscribes to signal
2. Signal maintains reference to effect (observer)
3. Effect maintains reference to signal (source)
4. No cleanup = circular reference never breaks
5. Garbage collector can't reclaim memory

### The Ownership Model

Solid.js prevents leaks through **ownership**:

```javascript
// Correct pattern
function createNoLeak() {
  return createRoot(dispose => {
    const [data, setData] = createSignal([]);
    
    createEffect(() => {
      console.log('Data changed:', data());
    });
    
    // Return cleanup function
    return dispose;
  });
}

// Usage
const cleanup1 = createNoLeak();
const cleanup2 = createNoLeak();

// When done, clean up
cleanup1(); // Frees all memory from first instance
cleanup2(); // Frees all memory from second instance
```

## The cleanNode Algorithm

### Core Implementation

Let's understand Solid.js's cleanup algorithm from the source:

```typescript
// From signal.ts
function cleanNode(node: Computation<any>) {
  // Step 1: Remove from all source signals
  if (node.sources) {
    while (node.sources.length) {
      const source = node.sources.pop()!;
      const index = node.sourceSlots.pop()!;
      
      // Remove this node from source's observers
      // Uses swap-and-pop for O(1) removal
      if (source.observers) {
        const last = source.observers.length - 1;
        
        if (index < last) {
          // Swap with last element
          const lastObserver = source.observers[last];
          const lastSlot = source.observerSlots![last];
          
          source.observers[index] = lastObserver;
          source.observerSlots![index] = lastSlot;
          
          // Update the swapped observer's source slot
          lastObserver.sourceSlots![lastSlot] = index;
        }
        
        // Remove last element
        source.observers.pop();
        source.observerSlots!.pop();
      }
    }
  }
  
  // Step 2: Clean all owned computations
  if (node.owned) {
    for (let i = node.owned.length - 1; i >= 0; i--) {
      cleanNode(node.owned[i]);
    }
    node.owned = null;
  }
  
  // Step 3: Run cleanup functions
  if (node.cleanups) {
    for (let i = node.cleanups.length - 1; i >= 0; i--) {
      node.cleanups[i]();
    }
    node.cleanups = null;
  }
  
  // Step 4: Clear state
  node.state = STALE;
  node.updatedAt = null;
  node.context = null;
}
```

### Visual Breakdown

```
Before cleanup:
Signal A ←─┬─→ Effect 1
           ├─→ Effect 2
           └─→ Effect 3

Effect 1 owns:
  └─→ Effect 1a
  └─→ Effect 1b

cleanNode(Effect 1):

Step 1: Remove from sources
Signal A ←─┬─→ Effect 2
           └─→ Effect 3
[Effect 1 removed from Signal A's observers]

Step 2: Clean owned
  cleanNode(Effect 1a)
  cleanNode(Effect 1b)

Step 3: Run cleanups
  cleanup1()
  cleanup2()

Step 4: Clear state
  Effect 1.state = STALE
  Effect 1.sources = null
  Effect 1.owned = null
  Effect 1.cleanups = null

Result: Effect 1 fully disconnected, ready for GC
```

### Swap-and-Pop Optimization

The `swap-and-pop` technique is brilliant for O(1) removal:

```javascript
// Why not just splice()?
function naiveRemove(array, index) {
  array.splice(index, 1); // O(n) - shifts all elements
}

// Solid.js approach - O(1)
function swapAndPop(observers, observerSlots, index) {
  const last = observers.length - 1;
  
  if (index < last) {
    // Step 1: Move last element to removed position
    observers[index] = observers[last];
    observerSlots[index] = observerSlots[last];
    
    // Step 2: Update the moved observer's back-reference
    const movedObserver = observers[index];
    const movedSlot = observerSlots[index];
    movedObserver.sourceSlots[movedSlot] = index;
  }
  
  // Step 3: Remove last element (O(1))
  observers.pop();
  observerSlots.pop();
}
```

**Performance comparison:**
- Array with 1000 elements
- Remove index 50
- `splice()`: ~950 operations (shift remaining elements)
- `swap-and-pop`: 3 operations (swap, update, pop)

## Disposal Patterns

### Manual Disposal

```javascript
// Pattern 1: Explicit root
function createComponent() {
  const dispose = createRoot((dispose) => {
    const [count, setCount] = createSignal(0);
    
    createEffect(() => {
      console.log('Count:', count());
    });
    
    return dispose;
  });
  
  return { dispose };
}

const component = createComponent();

// Later...
component.dispose(); // Clean up everything
```

### Automatic Disposal with Ownership

```javascript
// Pattern 2: Owner hierarchy
createRoot((dispose) => {
  const [items, setItems] = createSignal([]);
  
  // This effect owns all its nested computations
  createEffect(() => {
    items().forEach(item => {
      // Each createEffect here is owned by the parent effect
      createEffect(() => {
        console.log('Item:', item);
      });
    });
  });
  
  // When parent effect re-runs, old child effects are cleaned
  setItems([1, 2, 3]); // Creates 3 child effects
  setItems([4, 5]);    // Cleans 3 effects, creates 2 new ones
  
  // Cleanup everything
  dispose();
});
```

### onCleanup Pattern

```javascript
// Pattern 3: Cleanup callbacks
createEffect(() => {
  const timer = setInterval(() => {
    console.log('Tick');
  }, 1000);
  
  // Register cleanup
  onCleanup(() => {
    clearInterval(timer);
    console.log('Timer cleared');
  });
});

// When effect re-runs or is disposed, onCleanup runs first
```

### Cleanup Order

```javascript
createRoot((dispose) => {
  console.log('1. Create root');
  
  onCleanup(() => console.log('6. Root cleanup'));
  
  createEffect(() => {
    console.log('2. Effect runs');
    
    onCleanup(() => console.log('5. Effect cleanup'));
    
    // Owned computation
    createEffect(() => {
      console.log('3. Nested effect runs');
      
      onCleanup(() => console.log('4. Nested cleanup'));
    });
  });
  
  dispose();
});

// Output:
// 1. Create root
// 2. Effect runs
// 3. Nested effect runs
// 4. Nested cleanup (deepest first)
// 5. Effect cleanup (parent)
// 6. Root cleanup (last)
```

## Common Memory Leak Patterns

### Pattern 1: Event Listeners

```javascript
// ❌ Leak
createEffect(() => {
  const element = document.getElementById('button');
  element.addEventListener('click', handleClick);
  // Listener never removed!
});

// ✅ Fixed
createEffect(() => {
  const element = document.getElementById('button');
  const handler = () => handleClick();
  
  element.addEventListener('click', handler);
  
  onCleanup(() => {
    element.removeEventListener('click', handler);
  });
});
```

### Pattern 2: Timers

```javascript
// ❌ Leak
createEffect(() => {
  setInterval(() => {
    console.log('Tick');
  }, 1000);
  // Timer runs forever!
});

// ✅ Fixed
createEffect(() => {
  const id = setInterval(() => {
    console.log('Tick');
  }, 1000);
  
  onCleanup(() => clearInterval(id));
});
```

### Pattern 3: External Subscriptions

```javascript
// ❌ Leak
createEffect(() => {
  const subscription = externalSource.subscribe(data => {
    console.log(data);
  });
  // Subscription never unsubscribed!
});

// ✅ Fixed
createEffect(() => {
  const subscription = externalSource.subscribe(data => {
    console.log(data);
  });
  
  onCleanup(() => subscription.unsubscribe());
});
```

### Pattern 4: Large Data Structures

```javascript
// ❌ Leak
const [cache] = createSignal(new Map());

createEffect(() => {
  const data = fetchData();
  cache().set(data.id, data); // Cache grows forever!
});

// ✅ Fixed with LRU
class LRUCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }
  
  set(key, value) {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}

const [cache] = createSignal(new LRUCache(100));
```

### Pattern 5: Circular References

```javascript
// ❌ Potential leak
function createCircular() {
  const [a, setA] = createSignal();
  const [b, setB] = createSignal();
  
  createEffect(() => {
    setB(a()); // b depends on a
  });
  
  createEffect(() => {
    setA(b()); // a depends on b - CIRCULAR!
  });
}

// ✅ Break the circle
function createNonCircular() {
  const [a, setA] = createSignal();
  const [b, setB] = createSignal();
  
  createEffect(() => {
    setB(untrack(a)); // Use untrack to break dependency
  });
  
  createEffect(() => {
    setA(b());
  });
}
```

## Profiling Memory Usage

### Browser DevTools

```javascript
// 1. Take heap snapshot before
// 2. Run your code
// 3. Take heap snapshot after
// 4. Compare

function profileMemory() {
  // Force GC if available
  if (global.gc) global.gc();
  
  const before = performance.memory.usedJSHeapSize;
  
  // Your code
  const disposers = [];
  for (let i = 0; i < 1000; i++) {
    disposers.push(createComponent());
  }
  
  const afterCreate = performance.memory.usedJSHeapSize;
  console.log('Memory used:', afterCreate - before);
  
  // Cleanup
  disposers.forEach(d => d());
  
  if (global.gc) global.gc();
  
  const afterCleanup = performance.memory.usedJSHeapSize;
  console.log('Memory leaked:', afterCleanup - before);
}
```

### Custom Memory Tracker

```javascript
class MemoryTracker {
  constructor() {
    this.allocations = new Map();
    this.nextId = 0;
  }
  
  track(obj, type) {
    const id = this.nextId++;
    this.allocations.set(id, {
      type,
      size: this.estimateSize(obj),
      stack: new Error().stack
    });
    return id;
  }
  
  release(id) {
    this.allocations.delete(id);
  }
  
  estimateSize(obj) {
    // Rough estimation
    const json = JSON.stringify(obj);
    return json.length * 2; // UTF-16 chars
  }
  
  report() {
    const byType = new Map();
    
    for (const [id, info] of this.allocations) {
      const current = byType.get(info.type) || { count: 0, size: 0 };
      byType.set(info.type, {
        count: current.count + 1,
        size: current.size + info.size
      });
    }
    
    console.table(Array.from(byType.entries()).map(([type, stats]) => ({
      type,
      count: stats.count,
      sizeKB: (stats.size / 1024).toFixed(2)
    })));
  }
}

// Usage
const tracker = new MemoryTracker();

function createTrackedSignal(value) {
  const [get, set] = createSignal(value);
  const id = tracker.track({ value }, 'signal');
  
  onCleanup(() => tracker.release(id));
  
  return [get, set];
}
```

### WeakRef and FinalizationRegistry

```javascript
// Modern approach for leak detection
const registry = new FinalizationRegistry((id) => {
  console.warn(`Object ${id} was garbage collected`);
});

function createTrackedComputation(fn) {
  const id = Math.random().toString(36);
  const dispose = createRoot((dispose) => {
    createEffect(fn);
    
    // Track with WeakRef
    const weakRef = new WeakRef(dispose);
    registry.register(dispose, id);
    
    return dispose;
  });
  
  return dispose;
}

// If dispose is never called and object is GC'd, we'll see a warning
```

## Memory-Efficient Patterns

### Pattern 1: Object Pooling

```javascript
class ComputationPool {
  constructor() {
    this.pool = [];
  }
  
  acquire() {
    return this.pool.pop() || {};
  }
  
  release(obj) {
    // Clear all properties
    for (const key in obj) {
      delete obj[key];
    }
    this.pool.push(obj);
  }
}

const pool = new ComputationPool();

function createPooledEffect(fn) {
  const computation = pool.acquire();
  
  // Initialize computation
  Object.assign(computation, {
    fn,
    sources: [],
    sourceSlots: [],
    // ... other properties
  });
  
  onCleanup(() => {
    pool.release(computation);
  });
}
```

### Pattern 2: Lazy Initialization

```javascript
// Don't create unless needed
function createLazyMemo(fn) {
  let memo;
  let initialized = false;
  
  return () => {
    if (!initialized) {
      memo = createMemo(fn);
      initialized = true;
    }
    return memo();
  };
}
```

### Pattern 3: Structural Sharing

```javascript
// Reuse unchanged objects
function updateWithSharing(oldObj, newObj) {
  const result = {};
  let changed = false;
  
  for (const key in newObj) {
    if (oldObj[key] === newObj[key]) {
      result[key] = oldObj[key]; // Reuse
    } else {
      result[key] = newObj[key];
      changed = true;
    }
  }
  
  return changed ? result : oldObj;
}

const [state, setState] = createSignal({ a: 1, b: 2 });

// Only creates new object if values changed
setState(prev => updateWithSharing(prev, { a: 1, b: 3 }));
```

## Testing for Leaks

### Automated Leak Detection

```javascript
import { test, expect } from 'vitest';

test('component cleans up properly', () => {
  let effectRuns = 0;
  
  const dispose = createRoot((dispose) => {
    const [count, setCount] = createSignal(0);
    
    createEffect(() => {
      count();
      effectRuns++;
    });
    
    setCount(1);
    setCount(2);
    
    return dispose;
  });
  
  expect(effectRuns).toBe(3);
  
  dispose();
  
  // Try to trigger effect (shouldn't work)
  // In real scenario, you'd check that count signal has no observers
});

test('detects orphaned computations', () => {
  const orphans = [];
  
  // Monkey-patch to detect orphans
  const originalCleanNode = globalThis.cleanNode;
  globalThis.cleanNode = (node) => {
    if (node.observers?.length > 0) {
      orphans.push(node);
    }
    originalCleanNode(node);
  };
  
  // Your test code...
  
  expect(orphans).toHaveLength(0);
  
  globalThis.cleanNode = originalCleanNode;
});
```

## Best Practices

### ✅ Do's

1. **Always use createRoot for top-level components**
   ```javascript
   const app = createRoot((dispose) => {
     // Your app logic
     return dispose;
   });
   ```

2. **Register cleanup for external resources**
   ```javascript
   createEffect(() => {
     const sub = api.subscribe();
     onCleanup(() => sub.unsubscribe());
   });
   ```

3. **Prefer owned computations over manual management**
   ```javascript
   // ✅ Automatic cleanup
   createEffect(() => {
     items().forEach(item => {
       createEffect(() => process(item));
     });
   });
   ```

4. **Use WeakMap for metadata**
   ```javascript
   const metadata = new WeakMap();
   metadata.set(component, { created: Date.now() });
   // Automatically cleaned when component is GC'd
   ```

### ❌ Don'ts

1. **Don't forget to call dispose**
   ```javascript
   // ❌
   createRoot(() => {
     // Never disposed!
   });
   ```

2. **Don't create unbounded collections**
   ```javascript
   // ❌
   const cache = new Map();
   createEffect(() => {
     cache.set(id(), data()); // Grows forever
   });
   ```

3. **Don't keep references to disposed computations**
   ```javascript
   // ❌
   let globalEffect;
   createRoot((dispose) => {
     globalEffect = createEffect(() => {}); // Disposed but referenced
     dispose();
   });
   ```

4. **Don't create effects in loops without cleanup**
   ```javascript
   // ❌
   for (let i = 0; i < 1000; i++) {
     createEffect(() => {}); // 1000 orphaned effects
   }
   ```

## Summary

Key takeaways:

1. **Ownership model** prevents most leaks automatically
2. **cleanNode** algorithm efficiently disconnects computations
3. **onCleanup** handles external resources
4. **Profiling tools** help detect leaks early
5. **Best practices** minimize memory usage

## Next Steps

- **Exercise 1:** Build a memory profiler
- **Exercise 2:** Find and fix leaks in sample apps
- **Lesson 2:** Performance optimization techniques
