# Lesson 2: Effect Scheduling and Queue Management

## Table of Contents

1. [runQueue vs runUpdates](#runqueue-vs-runupdates)
2. [Updates Queue (Memos)](#updates-queue-memos)
3. [Effects Queue](#effects-queue)
4. [Execution Order](#execution-order)
5. [User Effects vs System Effects](#user-effects-vs-system-effects)
6. [Complete runEffects Implementation](#complete-runeffects-implementation)

---

## runQueue vs runUpdates

### Two Execution Strategies

```javascript
// From signal.ts
let runEffects = runQueue;  // Default strategy

// Strategy 1: runQueue (Sync)
function runQueue(fn) {
  fn();  // Execute immediately
}

// Strategy 2: scheduleQueue (Async with scheduler)
function scheduleQueue(fn) {
  requestCallback(fn, { timeout: 250 });
}
```

### When to Use Each

**runQueue (Sync):**
- User interactions need immediate feedback
- Critical UI updates
- Development mode (easier debugging)

**scheduleQueue (Async):**
- Non-critical updates
- Performance optimization
- Prevents blocking main thread

### Setting the Strategy

```javascript
// Enable async scheduling
runEffects = scheduleQueue;

// Or create custom strategy
function customRunEffects(fn) {
  if (isHighPriority()) {
    fn();  // Run immediately
  } else {
    requestCallback(fn, { timeout: 5000 });
  }
}

runEffects = customRunEffects;
```

---

## Updates Queue (Memos)

### The Updates Array

```javascript
let Updates = null;  // Memos to update

function initUpdates() {
  Updates = [];
}
```

### Adding to Updates

```javascript
function markDownstream(node) {
  for (const observer of node.observers) {
    if (observer.state === FRESH) {
      observer.state = STALE;
      
      if (observer.pure) {
        // It's a memo - add to Updates
        Updates.push(observer);
        
        // Cascade to its observers
        if (observer.observers) {
          markDownstream(observer);
        }
      } else {
        // It's an effect - add to Effects
        Effects.push(observer);
      }
    }
  }
}
```

### Processing Updates

```javascript
function runUpdates() {
  if (!Updates || Updates.length === 0) return;
  
  // Process all memos synchronously
  while (Updates.length) {
    const computation = Updates.shift();
    
    if (computation.state !== FRESH) {
      updateComputation(computation);
    }
  }
}
```

### Why Memos Run First

```
Signal changes:
  ↓
Memo A updates (pure computation)
  ↓
Memo B updates (depends on A)
  ↓
Effect runs (depends on B)

Correct order ensured by running memos first!
```

---

## Effects Queue

### The Effects Array

```javascript
let Effects = null;

function initEffects() {
  Effects = [];
}
```

### Queuing Effects

```javascript
function queueEffect(effect) {
  if (!Effects) initEffects();
  
  // Check if already queued
  if (!Effects.includes(effect)) {
    Effects.push(effect);
  }
}
```

### Running Effects

```javascript
function runEffects() {
  if (!Effects || Effects.length === 0) return;
  
  // Use configured strategy
  runEffects(() => {
    while (Effects.length) {
      const effect = Effects.shift();
      
      if (effect.state !== FRESH) {
        runComputation(effect);
      }
    }
  });
}
```

---

## Execution Order

### Complete Update Flow

```javascript
function writeSignal(signal, value) {
  // 1. Update value
  signal.value = value;
  
  // 2. Mark all observers as STALE
  if (signal.observers) {
    runUpdates(() => {
      for (const observer of signal.observers) {
        observer.state = STALE;
        
        if (observer.pure) {
          Updates.push(observer);
          if (observer.observers) {
            markDownstream(observer);
          }
        } else {
          Effects.push(observer);
        }
      }
      
      // 3. Run memos (Updates)
      if (Updates.length) {
        while (Updates.length) {
          const memo = Updates.shift();
          if (memo.state !== FRESH) {
            updateComputation(memo);
          }
        }
      }
      
      // 4. Schedule effects
      if (Effects.length) {
        runEffects();
      }
    }, false);
  }
}
```

### Example Flow

```javascript
const [a, setA] = createSignal(1);
const b = createMemo(() => a() * 2);
const c = createMemo(() => b() + 1);

createEffect(() => {
  console.log('Result:', c());
});

setA(5);

// Execution order:
// 1. a.value = 5
// 2. b marked STALE, added to Updates
// 3. c marked STALE, added to Updates
// 4. effect marked STALE, added to Effects
// 5. b updates: b.value = 10
// 6. c updates: c.value = 11
// 7. effect runs: "Result: 11"
```

---

## User Effects vs System Effects

### The user Flag

```javascript
interface Computation {
  // ... other properties
  user?: boolean;  // true for user-created effects
}
```

### Creating User Effects

```javascript
function createEffect(fn) {
  const computation = {
    fn,
    state: FRESH,
    sources: null,
    sourceSlots: null,
    owned: null,
    owner: Owner,
    user: true,  // Mark as user effect
    pure: false
  };
  
  runComputation(computation);
  return computation;
}
```

### Creating System Effects

```javascript
function createRenderEffect(fn) {
  const computation = {
    fn,
    state: FRESH,
    sources: null,
    sourceSlots: null,
    owned: null,
    owner: Owner,
    user: false,  // System effect
    pure: false
  };
  
  runComputation(computation);
  return computation;
}
```

### Different Queuing

```javascript
function queueEffect(effect) {
  if (effect.user) {
    // User effects: async
    Effects.push(effect);
  } else {
    // System effects: sync
    runComputation(effect);
  }
}
```

---

## Complete runEffects Implementation

### Full Implementation

```javascript
// Global state
let Owner = null;
let Listener = null;
let Updates = null;
let Effects = null;
let ExecCount = 0;

// Execution strategy
let runEffects = runQueue;

function runQueue(fn, sync) {
  if (sync) {
    fn();
  } else {
    queueMicrotask(fn);
  }
}

function runUpdates(fn, sync = true) {
  const prevUpdates = Updates;
  const prevEffects = Effects;
  
  Updates = [];
  Effects = [];
  ExecCount++;
  
  try {
    fn();
  } finally {
    // Process all memos
    completeUpdates(prevUpdates, sync);
    
    // Restore previous queues
    Updates = prevUpdates;
    Effects = prevEffects;
  }
}

function completeUpdates(wait, sync) {
  // 1. Process Updates (memos)
  if (Updates.length) {
    runQueue(() => {
      for (let i = 0; i < Updates.length; i++) {
        const comp = Updates[i];
        if (comp.state !== FRESH) {
          updateComputation(comp);
        }
      }
    }, true);  // Always sync for memos
  }
  
  // 2. Process Effects
  if (Effects.length) {
    runQueue(() => {
      runEffectQueue(Effects);
    }, sync);
  }
}

function runEffectQueue(queue) {
  for (let i = 0; i < queue.length; i++) {
    const effect = queue[i];
    
    if (effect.state !== FRESH) {
      runComputation(effect);
    }
  }
}

function runComputation(computation) {
  if (computation.fn === null) return;
  
  cleanupSources(computation);
  
  const prevOwner = Owner;
  const prevListener = Listener;
  
  Owner = Listener = computation;
  
  try {
    const value = computation.fn(computation.value);
    
    if (computation.pure) {
      if (computation.value !== value) {
        computation.value = value;
        computation.updatedAt = ExecCount;
        
        if (computation.observers && computation.observers.length) {
          runUpdates(() => {
            for (const observer of computation.observers) {
              observer.state = STALE;
              
              if (observer.pure) {
                Updates.push(observer);
              } else {
                Effects.push(observer);
              }
              
              if (observer.observers) {
                markDownstream(observer);
              }
            }
          }, false);
        }
      }
    }
  } finally {
    Owner = prevOwner;
    Listener = prevListener;
  }
  
  computation.state = FRESH;
}

function updateComputation(computation) {
  const state = computation.state;
  
  if (state === FRESH) return;
  
  if (state === PENDING) {
    return lookUpstream(computation);
  }
  
  if (computation.suspense && untrack(computation.suspense.inFallback)) {
    return computation.suspense.effects.push(computation);
  }
  
  const ancestors = [computation];
  while ((computation = computation.owner) && (!computation.updatedAt || computation.updatedAt < ExecCount)) {
    if (computation.state) ancestors.push(computation);
  }
  
  for (let i = ancestors.length - 1; i >= 0; i--) {
    computation = ancestors[i];
    if (computation.state === STALE) {
      runComputation(computation);
    } else if (computation.state === PENDING) {
      const updateState = Updates;
      Updates = null;
      lookUpstream(computation, ancestors[0]);
      Updates = updateState;
    }
  }
}

function lookUpstream(node, ignore) {
  node.state = PENDING;
  
  for (let i = 0; i < node.sources.length; i++) {
    const source = node.sources[i];
    if (source.sources) {
      const state = source.state;
      if (state === STALE) {
        if (source !== ignore && (!source.updatedAt || source.updatedAt < ExecCount)) {
          runTop(source);
        }
      } else if (state === PENDING) {
        lookUpstream(source, ignore);
      }
    }
  }
  
  if (node.state === PENDING) {
    node.state = FRESH;
  }
}

function runTop(node) {
  if (node.state === 0) return;
  if (node.state === PENDING) return lookUpstream(node);
  
  const ancestors = [node];
  while ((node = node.owner) && (!node.updatedAt || node.updatedAt < ExecCount)) {
    if (node.state) ancestors.push(node);
  }
  
  for (let i = ancestors.length - 1; i >= 0; i--) {
    node = ancestors[i];
    if (node.state === STALE) {
      updateComputation(node);
    } else if (node.state === PENDING) {
      lookUpstream(node, ancestors[0]);
    }
  }
}
```

---

## Summary

### Key Takeaways

1. **Two Queues:** Updates (memos) and Effects
2. **Execution Order:** Memos always run before effects
3. **Strategies:** Sync (runQueue) vs Async (scheduleQueue)
4. **User vs System:** Different handling for different effect types
5. **ExecCount:** Prevents duplicate execution

### What You've Learned

- ✅ Queue management strategies
- ✅ Execution order guarantees
- ✅ User vs system effects
- ✅ Complete scheduling flow
- ✅ Integration with state machine

### Next Steps

Continue to Lesson 3: Batching and Update Strategies

---

## Further Reading

- **Next:** [Lesson 3: Batching Updates](./lesson-03-batching-updates.md)
- **Previous:** [Lesson 1: MessageChannel Scheduling](./lesson-01-messagechannel-scheduling.md)
- **Source:** [Solid.js signal.ts (runUpdates)](https://github.com/solidjs/solid/blob/main/packages/solid/src/reactive/signal.ts)
