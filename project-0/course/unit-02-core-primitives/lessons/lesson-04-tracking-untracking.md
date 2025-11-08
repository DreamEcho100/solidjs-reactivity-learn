# Lesson 4: Tracking and Untracking

## Table of Contents

1. [Listener Context Mechanics](#listener-context-mechanics)
2. [Context-Aware Dependency Collection](#context-aware-dependency-collection)
3. [untrack() Implementation](#untrack-implementation)
4. [Common Tracking Pitfalls](#common-tracking-pitfalls)
5. [Dynamic Dependencies](#dynamic-dependencies)
6. [Advanced Patterns](#advanced-patterns)
7. [Complete Implementation](#complete-implementation)

---

## Listener Context Mechanics

### What is the Listener?

The `Listener` is a global variable that holds the currently executing computation. When a signal is read, it registers the `Listener` as a dependency.

```javascript
let Listener = null;  // Currently executing computation
```

### How Tracking Works

```
1. Effect starts → Set Listener = effect
2. Signal read → Register Listener as observer
3. Effect ends → Set Listener = null
```

### Visual Flow

```javascript
let Listener = null;

const [count, setCount] = createSignal(0);

createEffect(() => {
  // Before: Listener = null
  
  // Effect execution begins
  // Listener = this effect
  
  const value = count();  // Signal reads Listener
  // count adds this effect to its observers
  
  console.log(value);
  
  // Effect execution ends
  // Listener = null
});
```

### Implementation

```javascript
let Listener = null;

function createEffect(fn) {
  const computation = {
    fn,
    sources: null,
    sourceSlots: null
  };
  
  function execute() {
    const prevListener = Listener;
    Listener = computation;
    
    try {
      fn();
    } finally {
      Listener = prevListener;
    }
  }
  
  execute();
  return computation;
}

function createSignal(initialValue) {
  let value = initialValue;
  const observers = [];
  const observerSlots = [];
  
  const read = () => {
    // Track dependency
    if (Listener) {
      const index = observers.length;
      observers.push(Listener);
      observerSlots.push(Listener.sources ? Listener.sources.length : 0);
      
      if (!Listener.sources) {
        Listener.sources = [];
        Listener.sourceSlots = [];
      }
      
      Listener.sources.push({ observers, observerSlots });
      Listener.sourceSlots.push(index);
    }
    
    return value;
  };
  
  const write = (nextValue) => {
    value = nextValue;
    
    // Notify observers
    for (let i = 0; i < observers.length; i++) {
      // Re-execute each observer
    }
  };
  
  return [read, write];
}
```

---

## Context-Aware Dependency Collection

### Nested Effects

When effects are nested, each has its own tracking context:

```javascript
const [outer, setOuter] = createSignal('outer');
const [inner, setInner] = createSignal('inner');

createEffect(() => {
  // Listener = Effect1
  console.log('Outer:', outer());  // outer tracks Effect1
  
  createEffect(() => {
    // Listener = Effect2
    console.log('Inner:', inner());  // inner tracks Effect2
    console.log('Outer:', outer());   // outer tracks Effect2
    // Listener restored to Effect1
  });
  
  // Listener = Effect1
});
```

### Tracking Stack

```javascript
// Stack of listeners
const ListenerStack = [];

function pushListener(computation) {
  if (Listener) {
    ListenerStack.push(Listener);
  }
  Listener = computation;
}

function popListener() {
  Listener = ListenerStack.length > 0 
    ? ListenerStack.pop() 
    : null;
}

function createEffect(fn) {
  const computation = { fn, sources: null, sourceSlots: null };
  
  function execute() {
    pushListener(computation);
    
    try {
      fn();
    } finally {
      popListener();
    }
  }
  
  execute();
  return computation;
}
```

### Context Preservation

```javascript
const [signal, setSignal] = createSignal(0);

createEffect(() => {
  // Context 1
  console.log('Effect 1:', signal());
  
  setTimeout(() => {
    // Context lost! Listener = null
    // This won't track signal
    console.log('Delayed:', signal());
  }, 1000);
});
```

**Solution:** Capture context explicitly:

```javascript
createEffect(() => {
  const currentListener = Listener;
  
  setTimeout(() => {
    const prevListener = Listener;
    Listener = currentListener;
    
    try {
      console.log('Delayed:', signal());  // Now tracked!
    } finally {
      Listener = prevListener;
    }
  }, 1000);
});
```

---

## untrack() Implementation

### What is untrack()?

`untrack()` runs a function without tracking any signal reads.

### Basic Implementation

```javascript
function untrack(fn) {
  const prevListener = Listener;
  Listener = null;
  
  try {
    return fn();
  } finally {
    Listener = prevListener;
  }
}
```

### Usage Examples

#### 1. Avoid Unnecessary Dependencies

```javascript
const [userId, setUserId] = createSignal(1);
const [userData, setUserData] = createSignal(null);

createEffect(() => {
  const id = userId();  // Tracked
  
  // Don't track userData read
  const cached = untrack(() => userData());
  
  if (cached && cached.id === id) {
    console.log('Using cached data');
    return;
  }
  
  // Fetch new data
  fetchUser(id).then(setUserData);
});
```

#### 2. Reading Signals for Logging

```javascript
const [count, setCount] = createSignal(0);

createEffect(() => {
  // This is tracked
  const value = count();
  
  // This is not tracked (for debugging)
  untrack(() => {
    console.log('Debug info:', {
      value,
      timestamp: Date.now()
    });
  });
});
```

#### 3. Conditional Logic with Signals

```javascript
const [show, setShow] = createSignal(true);
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);

createEffect(() => {
  if (show()) {
    // Track 'a' when shown
    console.log('A:', a());
  } else {
    // Don't track 'b' at all
    untrack(() => {
      console.log('B (untracked):', b());
    });
  }
});

// setB(3) won't trigger effect
```

#### 4. Initial Value Comparison

```javascript
const [value, setValue] = createSignal(10);

createEffect((prevValue) => {
  const current = value();
  
  // Don't create dependency on 'value' for comparison
  const prev = untrack(() => prevValue);
  
  if (prev !== undefined && current !== prev) {
    console.log(`Changed from ${prev} to ${current}`);
  }
  
  return current;
});
```

### Common Patterns

#### Reading Multiple Signals Once

```javascript
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);
const [c, setC] = createSignal(3);

createEffect(() => {
  // Only track 'a'
  const valueA = a();
  
  // Don't track b and c
  const [valueB, valueC] = untrack(() => [b(), c()]);
  
  console.log(valueA + valueB + valueC);
});

// Only setA() triggers this effect
```

#### Sampling Signals

```javascript
function sample(signal) {
  return untrack(signal);
}

const [count, setCount] = createSignal(0);

createEffect(() => {
  // Read current value without tracking
  const current = sample(count);
  console.log('Sample:', current);
});
```

---

## Common Tracking Pitfalls

### Pitfall 1: Lost Context in Async

```javascript
// ❌ Wrong: Async tracking is lost
const [signal, setSignal] = createSignal(0);

createEffect(async () => {
  await delay(100);
  console.log(signal());  // Not tracked!
});

// ✅ Correct: Read before async
createEffect(async () => {
  const value = signal();  // Tracked
  await delay(100);
  console.log(value);
});
```

### Pitfall 2: Destructuring Props

```javascript
// ❌ Wrong: Destructuring loses reactivity
function Component({ count }) {
  createEffect(() => {
    console.log(count);  // Not reactive!
  });
}

// ✅ Correct: Access properties in reactive context
function Component(props) {
  createEffect(() => {
    console.log(props.count);  // Reactive!
  });
}
```

### Pitfall 3: Caching Signals

```javascript
const [signal, setSignal] = createSignal(0);

// ❌ Wrong: Cached value never updates
const cached = signal();
createEffect(() => {
  console.log(cached);  // Always 0
});

// ✅ Correct: Call signal each time
createEffect(() => {
  console.log(signal());  // Updates
});
```

### Pitfall 4: Conditional Tracking

```javascript
const [condition, setCondition] = createSignal(true);
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);

createEffect(() => {
  if (condition()) {
    console.log('A:', a());
  }
  // When condition = false, 'a' is no longer tracked
  // Effect won't run when 'a' changes
});

// ✅ Solution: on() helper (covered in Unit 3)
```

### Pitfall 5: Array Methods

```javascript
const [items, setItems] = createSignal([1, 2, 3]);

// ❌ Wrong: Iteration loses tracking
createEffect(() => {
  const arr = items();
  arr.forEach(item => {
    // Each item is not individually tracked
    console.log(item);
  });
});

// ✅ Correct: Use reactive map (covered in Unit 6)
```

---

## Dynamic Dependencies

### What are Dynamic Dependencies?

Dependencies that change based on runtime conditions.

### Example 1: Conditional Dependencies

```javascript
const [useA, setUseA] = createSignal(true);
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);

createEffect(() => {
  if (useA()) {
    console.log('Using A:', a());
  } else {
    console.log('Using B:', b());
  }
});

// Dependencies:
// useA=true  → tracks: useA, a
// useA=false → tracks: useA, b
```

### Example 2: Array Iteration

```javascript
const [ids, setIds] = createSignal([1, 2, 3]);
const [data, setData] = createSignal({ 1: 'a', 2: 'b', 3: 'c' });

createEffect(() => {
  ids().forEach(id => {
    console.log(data()[id]);
  });
});

// Adding/removing IDs changes which data properties are tracked
```

### Example 3: Object Property Access

```javascript
const [obj, setObj] = createSignal({ x: 1, y: 2 });
const [key, setKey] = createSignal('x');

createEffect(() => {
  const k = key();
  const value = obj()[k];
  console.log(`${k} = ${value}`);
});

// Changing key changes which property is accessed
```

### Managing Dynamic Dependencies

```javascript
function createDynamicEffect(fn) {
  const computation = {
    fn,
    sources: null,
    sourceSlots: null
  };
  
  function execute() {
    // Clean up old dependencies
    cleanupSources(computation);
    
    // Set up new tracking context
    const prevListener = Listener;
    Listener = computation;
    
    try {
      fn();
    } finally {
      Listener = prevListener;
    }
  }
  
  execute();
  return computation;
}
```

---

## Advanced Patterns

### Pattern 1: on() Helper

Control exactly what triggers re-execution:

```javascript
function on(deps, fn, options = {}) {
  const defer = options.defer;
  
  return (prev) => {
    // Only track dependencies
    const values = Array.isArray(deps) 
      ? deps.map(d => d()) 
      : [deps()];
    
    // Execute function without tracking
    if (defer && prev === undefined) {
      return undefined;
    }
    
    return untrack(() => fn(values, prev));
  };
}

// Usage
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);

createEffect(
  on(a, (value) => {
    // Only re-runs when 'a' changes
    // Can read 'b' without tracking it
    console.log('A:', value, 'B:', b());
  })
);
```

### Pattern 2: createSelector

O(2) complexity for item selection:

```javascript
function createSelector(source, fn) {
  const map = new Map();
  
  return (key) => {
    // Track source
    const s = source();
    
    // Don't track individual reads
    return untrack(() => {
      if (!map.has(key)) {
        const memo = createMemo(() => fn(key, s));
        map.set(key, memo);
      }
      return map.get(key)();
    });
  };
}

// Usage
const [selected, setSelected] = createSignal(1);
const [items, setItems] = createSignal([1, 2, 3, 4, 5]);

const isSelected = createSelector(selected, (k, s) => k === s);

createEffect(() => {
  items().forEach(item => {
    // Only re-runs for the selected item
    if (isSelected(item)) {
      console.log('Selected:', item);
    }
  });
});
```

### Pattern 3: Lazy Evaluation

```javascript
function lazy(fn) {
  let cached;
  let hasValue = false;
  
  return () => {
    if (!hasValue) {
      cached = untrack(fn);
      hasValue = true;
    }
    return cached;
  };
}

// Usage
const [expensive, setExpensive] = createSignal(() => {
  console.log('Computing...');
  return veryExpensiveCalculation();
});

const lazyValue = lazy(expensive);

createEffect(() => {
  // Only computes when accessed
  if (someCondition()) {
    console.log(lazyValue());
  }
});
```

### Pattern 4: debounce with Tracking

```javascript
function createDebouncedEffect(fn, delay) {
  let timeoutId;
  let pendingArgs;
  
  createEffect(() => {
    // Track dependencies immediately
    const args = fn();
    
    clearTimeout(timeoutId);
    
    // Execute after delay without re-tracking
    timeoutId = setTimeout(() => {
      untrack(() => {
        // Use captured args
        console.log('Debounced:', args);
      });
    }, delay);
  });
}

// Usage
const [search, setSearch] = createSignal('');

createDebouncedEffect(() => search(), 300);
```

---

## Complete Implementation

Here's a complete implementation with tracking and untracking:

```javascript
// Global listener context
let Listener = null;

// Stack for nested contexts
const ListenerStack = [];

function pushListener(computation) {
  if (Listener) {
    ListenerStack.push(Listener);
  }
  Listener = computation;
}

function popListener() {
  Listener = ListenerStack.length > 0 
    ? ListenerStack.pop() 
    : null;
}

// Untrack implementation
function untrack(fn) {
  const prevListener = Listener;
  Listener = null;
  
  try {
    return fn();
  } finally {
    Listener = prevListener;
  }
}

// Get current listener
function getListener() {
  return Listener;
}

// Check if currently tracking
function isTracking() {
  return Listener !== null;
}

// Track explicitly
function track(computation, fn) {
  const prevListener = Listener;
  Listener = computation;
  
  try {
    return fn();
  } finally {
    Listener = prevListener;
  }
}

// Signal with tracking
function createSignal(initialValue) {
  const state = {
    value: initialValue,
    observers: null,
    observerSlots: null
  };
  
  const read = () => {
    if (Listener) {
      const index = state.observers ? state.observers.length : 0;
      
      if (!state.observers) {
        state.observers = [];
        state.observerSlots = [];
      }
      
      state.observers.push(Listener);
      state.observerSlots.push(
        Listener.sources ? Listener.sources.length : 0
      );
      
      if (!Listener.sources) {
        Listener.sources = [];
        Listener.sourceSlots = [];
      }
      
      Listener.sources.push(state);
      Listener.sourceSlots.push(index);
    }
    
    return state.value;
  };
  
  const write = (nextValue) => {
    if (typeof nextValue === 'function') {
      nextValue = nextValue(state.value);
    }
    
    if (state.value !== nextValue) {
      state.value = nextValue;
      
      if (state.observers) {
        for (let i = 0; i < state.observers.length; i++) {
          const observer = state.observers[i];
          // Queue for update
          queueUpdate(observer);
        }
      }
    }
    
    return nextValue;
  };
  
  read._state = state;
  
  return [read, write];
}

// Effect with tracking
function createEffect(fn) {
  const computation = {
    fn,
    sources: null,
    sourceSlots: null,
    owned: null,
    owner: null
  };
  
  function execute() {
    cleanupSources(computation);
    
    pushListener(computation);
    
    try {
      fn();
    } catch (err) {
      console.error('Error in effect:', err);
    } finally {
      popListener();
    }
  }
  
  execute();
  
  return () => disposeComputation(computation);
}

// Cleanup sources
function cleanupSources(computation) {
  if (!computation.sources) return;
  
  while (computation.sources.length) {
    const source = computation.sources.pop();
    const slot = computation.sourceSlots.pop();
    
    if (!source.observers) continue;
    
    const last = source.observers.length - 1;
    
    if (slot !== last) {
      const lastObs = source.observers[last];
      source.observers[slot] = lastObs;
      source.observerSlots[slot] = source.observerSlots[last];
      
      if (lastObs.sourceSlots) {
        lastObs.sourceSlots[source.observerSlots[last]] = slot;
      }
    }
    
    source.observers.pop();
    source.observerSlots.pop();
  }
}

// Dispose computation
function disposeComputation(computation) {
  cleanupSources(computation);
  
  if (computation.owned) {
    computation.owned.forEach(disposeComputation);
    computation.owned = null;
  }
}

// Queue update
const Updates = [];
let Pending = false;

function queueUpdate(computation) {
  if (!Updates.includes(computation)) {
    Updates.push(computation);
  }
  
  if (!Pending) {
    Pending = true;
    queueMicrotask(runUpdates);
  }
}

function runUpdates() {
  while (Updates.length) {
    const computation = Updates.shift();
    
    cleanupSources(computation);
    
    pushListener(computation);
    
    try {
      computation.fn();
    } catch (err) {
      console.error('Error in update:', err);
    } finally {
      popListener();
    }
  }
  
  Pending = false;
}

// Export
export {
  untrack,
  track,
  getListener,
  isTracking,
  createSignal,
  createEffect
};
```

---

## Summary

### Key Takeaways

1. **Listener Context**
   - Global Listener tracks current computation
   - Set during computation execution
   - Used for automatic dependency tracking

2. **untrack()**
   - Temporarily disables tracking
   - Essential for optimization
   - Prevents unwanted dependencies

3. **Dynamic Dependencies**
   - Dependencies can change at runtime
   - Automatically cleaned up and re-tracked
   - Powerful but requires understanding

4. **Common Pitfalls**
   - Lost context in async
   - Destructuring props
   - Caching signal values
   - Conditional tracking issues

### What You've Learned

- ✅ Listener context mechanics
- ✅ Context-aware dependency collection
- ✅ untrack() implementation and usage
- ✅ Common tracking pitfalls
- ✅ Dynamic dependency management
- ✅ Advanced tracking patterns
- ✅ Complete implementation

### Next Steps

You've completed Unit 2! Move on to Unit 3: Advanced Computation Patterns

---

## Further Reading

- **Next Unit:** [Unit 3: Advanced Computation Patterns](../../unit-03-advanced-patterns/README.md)
- **Exercise:** [Tracking Exercise](../exercises/04-tracking-patterns.md)
- **Source:** [Solid.js signal.ts (tracking logic)](https://github.com/solidjs/solid/blob/main/packages/solid/src/reactive/signal.ts)
