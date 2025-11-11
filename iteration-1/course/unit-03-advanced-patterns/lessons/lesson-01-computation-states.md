# Lesson 1: Computation States and Update Propagation

## Table of Contents

1. [Computation State Machine](#computation-state-machine)
2. [State Transitions](#state-transitions)
3. [lookUpstream Algorithm](#lookupstream-algorithm)
4. [markDownstream Propagation](#markdownstream-propagation)
5. [Preventing Infinite Loops](#preventing-infinite-loops)
6. [Update Ordering](#update-ordering)
7. [Complete Implementation](#complete-implementation)

---

## Computation State Machine

### The Three States

```javascript
const FRESH = 0;   // Up to date, no re-computation needed
const STALE = 1;   // Dependencies changed, needs update
const PENDING = 2; // Checking if dependencies actually changed
```

### State Flow Diagram

```
FRESH ──signal change──> STALE ──check deps──> PENDING ──needs update──> FRESH
   ↑                                                 |
   |                                                 |
   └────────────── no actual change ────────────────┘
```

### Why Three States?

**FRESH (0):** Computation is up to date
```javascript
computation.state = FRESH;
// Don't need to run
```

**STALE (1):** A dependency changed
```javascript
// Signal updated
for (const observer of signal.observers) {
  observer.state = STALE;
}
```

**PENDING (2):** Checking if update is really needed
```javascript
// Check if any source actually changed
computation.state = PENDING;
if (sourcesHaveChanged()) {
  recompute();
} else {
  computation.state = FRESH; // No actual change
}
```

### Benefits

1. **Avoid unnecessary updates**
   - PENDING state checks if update is actually needed
   - Saves computation when intermediate values cancel out

2. **Handle diamond dependencies**
   ```
      A
     / \
    B   C
     \ /
      D
   ```
   - A changes → B and C become STALE
   - D becomes STALE from both B and C
   - D checks PENDING → only runs once

3. **Optimize update propagation**
   - Mark STALE quickly (O(1))
   - Check PENDING lazily (on read)
   - Run only when necessary

---

## State Transitions

### Full State Transition Table

| Current | Event | Next | Action |
|---------|-------|------|--------|
| FRESH | Dependency changed | STALE | Mark for update |
| FRESH | Read | FRESH | Return cached value |
| STALE | Read | PENDING | Check if update needed |
| PENDING | Sources changed | FRESH | Recompute |
| PENDING | Sources unchanged | FRESH | Skip recompute |
| Any | Dispose | - | Clean up |

### Transition Examples

#### 1. Simple Update

```javascript
const [count, setCount] = createSignal(0);
const doubled = createMemo(() => count() * 2);

// Initially
doubled._computation.state = FRESH;  // 0

// Update signal
setCount(5);
doubled._computation.state = STALE;  // Marked stale

// Read memo
doubled();
doubled._computation.state = PENDING; // Check needed
doubled._computation.state = FRESH;   // Updated to 10
```

#### 2. Diamond Dependency

```javascript
const [a, setA] = createSignal(1);
const b = createMemo(() => a());
const c = createMemo(() => a());
const d = createMemo(() => b() + c());

// Initial state: all FRESH

setA(2);
// b.state = STALE (from a)
// c.state = STALE (from a)
// d.state = STALE (from b)
// d.state = STALE (from c) - already stale

d();
// d.state = PENDING
// Check b: b.state = PENDING → FRESH (recomputes)
// Check c: c.state = PENDING → FRESH (recomputes)
// d needs update, recompute
// d.state = FRESH
```

#### 3. Cancelled Update

```javascript
const [a, setA] = createSignal(1);
const b = createMemo(() => a() > 0 ? 1 : 0);
const c = createMemo(() => b() * 10);

setA(2);
// b.state = STALE
// c.state = STALE

c();
// c.state = PENDING
// Check b: b.state = PENDING
//   b recomputes: a()=2, still > 0, returns 1 (unchanged!)
//   b.state = FRESH
// c's dependency didn't actually change
// c.state = FRESH (no recompute needed!)
```

---

## lookUpstream Algorithm

### Purpose

Check if any dependencies actually changed before recomputing.

### Algorithm

```javascript
function lookUpstream(computation) {
  // Already checked or fresh
  if (computation.state === FRESH) {
    return false;
  }
  
  // Mark as checking
  computation.state = PENDING;
  
  // Check all sources
  for (const source of computation.sources) {
    // If source is a computation, check it recursively
    if (source.computation) {
      lookUpstream(source.computation);
      
      // If source updated, we need to update too
      if (source.computation.state === STALE) {
        computation.state = STALE;
        return true;
      }
    }
    
    // Check source version
    if (source.version !== computation.sourceVersions[i]) {
      computation.state = STALE;
      return true;
    }
  }
  
  // No changes found
  computation.state = FRESH;
  return false;
}
```

### Example

```javascript
const [a, setA] = createSignal(1);
const b = createMemo(() => a());
const c = createMemo(() => b());

setA(1); // Same value!
// b.state = STALE
// c.state = STALE

c();
// lookUpstream(c):
//   c.state = PENDING
//   Check b: lookUpstream(b)
//     b.state = PENDING
//     Check a: version unchanged
//     b recomputes: returns 1 (same)
//     b.state = FRESH
//   b didn't change
//   c.state = FRESH (no recompute!)
```

### Optimization

```javascript
function lookUpstream(computation) {
  if (computation.state === FRESH) return false;
  
  computation.state = PENDING;
  
  // Early exit on first stale source
  for (let i = 0; i < computation.sources.length; i++) {
    const source = computation.sources[i];
    
    if (source.observers) {  // It's a computation
      if (lookUpstream(source)) {
        computation.state = STALE;
        return true;
      }
    }
  }
  
  computation.state = FRESH;
  return false;
}
```

---

## markDownstream Propagation

### Purpose

Quickly mark all dependent computations as STALE when a signal changes.

### Algorithm

```javascript
function markDownstream(signal) {
  if (!signal.observers) return;
  
  for (const observer of signal.observers) {
    if (observer.state === FRESH) {
      observer.state = STALE;
      
      // If observer is a memo, mark its observers too
      if (observer.pure && observer.observers) {
        markDownstream(observer);
      }
      
      // Queue effect for execution
      if (!observer.pure) {
        Effects.push(observer);
      }
    }
  }
}
```

### Example

```javascript
     A (signal)
    / \
   B   C (memos)
    \ /
     D (effect)

A changes:
1. markDownstream(A)
   - B.state = STALE → markDownstream(B)
     - D.state = STALE → queue D
   - C.state = STALE → markDownstream(C)
     - D.state = already STALE
```

### Handling Cycles

```javascript
function markDownstream(signal, visited = new Set()) {
  if (visited.has(signal)) return;  // Cycle detected
  visited.add(signal);
  
  if (!signal.observers) return;
  
  for (const observer of signal.observers) {
    if (observer.state === FRESH) {
      observer.state = STALE;
      
      if (observer.pure && observer.observers) {
        markDownstream(observer, visited);
      }
      
      if (!observer.pure) {
        queueEffect(observer);
      }
    }
  }
}
```

---

## Preventing Infinite Loops

### Problem

```javascript
const [a, setA] = createSignal(0);

createEffect(() => {
  setA(a() + 1);  // Infinite loop!
});
```

### Solution 1: Track Execution Count

```javascript
const MAX_ITERATIONS = 1000;
let execCount = 0;

function runComputation(computation) {
  execCount++;
  
  if (execCount > MAX_ITERATIONS) {
    throw new Error('Infinite loop detected');
  }
  
  try {
    computation.fn();
  } finally {
    execCount--;
  }
}
```

### Solution 2: Track Signal Writes

```javascript
const writesThisCycle = new Set();

function writeSignal(signal, value) {
  if (writesThisCycle.has(signal)) {
    console.warn('Signal written multiple times in one cycle');
  }
  
  writesThisCycle.add(signal);
  signal.value = value;
  markDownstream(signal);
}

function endCycle() {
  writesThisCycle.clear();
}
```

### Solution 3: Batch Updates

```javascript
let batchDepth = 0;
const pendingWrites = [];

function batch(fn) {
  batchDepth++;
  try {
    fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      flushUpdates();
    }
  }
}

function writeSignal(signal, value) {
  if (batchDepth > 0) {
    pendingWrites.push({ signal, value });
  } else {
    signal.value = value;
    markDownstream(signal);
  }
}
```

### Best Practice

```javascript
// ❌ Bad: Writes in effect
createEffect(() => {
  setA(a() + 1);
});

// ✅ Good: External trigger
function increment() {
  setA(a() + 1);
}

createEffect(() => {
  console.log('A changed:', a());
});
```

---

## Update Ordering

### Priority System

```javascript
const Updates = [];   // High priority (memos, computed)
const Effects = [];   // Low priority (effects)

function runUpdates() {
  // Run memos first (sync)
  while (Updates.length) {
    const computation = Updates.shift();
    if (computation.state === STALE) {
      updateComputation(computation);
    }
  }
  
  // Then run effects (async)
  queueMicrotask(() => {
    while (Effects.length) {
      const effect = Effects.shift();
      if (effect.state === STALE) {
        runComputation(effect);
      }
    }
  });
}
```

### Topological Sort

For complex dependency graphs:

```javascript
function topologicalSort(computations) {
  const sorted = [];
  const visited = new Set();
  const visiting = new Set();
  
  function visit(computation) {
    if (visited.has(computation)) return;
    if (visiting.has(computation)) {
      throw new Error('Cycle detected');
    }
    
    visiting.add(computation);
    
    if (computation.sources) {
      for (const source of computation.sources) {
        if (source.computation) {
          visit(source.computation);
        }
      }
    }
    
    visiting.delete(computation);
    visited.add(computation);
    sorted.push(computation);
  }
  
  computations.forEach(visit);
  return sorted;
}
```

### Example

```javascript
const [a, setA] = createSignal(1);
const b = createMemo(() => a() * 2);
const c = createMemo(() => a() + 1);
const d = createMemo(() => b() + c());

// Dependency graph:
//   a
//  / \
// b   c
//  \ /
//   d

// Update order: a → b → c → d
// OR: a → c → b → d
// Both valid topological orders
```

---

## Complete Implementation

```javascript
const FRESH = 0;
const STALE = 1;
const PENDING = 2;

let ExecCount = 0;
const Updates = [];
const Effects = [];

function createSignal(initialValue) {
  const state = {
    value: initialValue,
    version: 0,
    observers: null,
    observerSlots: null
  };
  
  const read = () => {
    if (Listener) {
      trackSignal(state, Listener);
    }
    return state.value;
  };
  
  const write = (nextValue) => {
    if (typeof nextValue === 'function') {
      nextValue = nextValue(state.value);
    }
    
    if (state.value !== nextValue) {
      state.value = nextValue;
      state.version++;
      markDownstream(state);
      runUpdates();
    }
    
    return nextValue;
  };
  
  read._state = state;
  return [read, write];
}

function markDownstream(signal) {
  if (!signal.observers) return;
  
  for (const observer of signal.observers) {
    if (observer.state === FRESH) {
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
  }
}

function lookUpstream(computation) {
  if (computation.state === FRESH) return false;
  
  computation.state = PENDING;
  
  for (let i = 0; i < computation.sources.length; i++) {
    const source = computation.sources[i];
    
    if (source.computation && source.computation.state !== FRESH) {
      if (lookUpstream(source.computation)) {
        computation.state = STALE;
        return true;
      }
    }
  }
  
  computation.state = FRESH;
  return false;
}

function updateComputation(computation) {
  if (computation.state !== STALE) {
    if (lookUpstream(computation)) {
      runComputation(computation);
    }
    return;
  }
  
  runComputation(computation);
}

function runComputation(computation) {
  cleanupSources(computation);
  
  const prevListener = Listener;
  Listener = computation;
  
  ExecCount++;
  if (ExecCount > 1000) {
    throw new Error('Infinite loop detected');
  }
  
  try {
    const nextValue = computation.fn(computation.value);
    
    if (computation.pure) {
      if (computation.value !== nextValue) {
        computation.value = nextValue;
        if (computation.observers) {
          markDownstream(computation);
        }
      }
    }
  } finally {
    Listener = prevListener;
    ExecCount--;
  }
  
  computation.state = FRESH;
}

function runUpdates() {
  // Memos first
  while (Updates.length) {
    const computation = Updates.shift();
    if (computation.state === STALE) {
      updateComputation(computation);
    }
  }
  
  // Effects async
  if (Effects.length) {
    queueMicrotask(() => {
      while (Effects.length) {
        const effect = Effects.shift();
        if (effect.state === STALE) {
          runComputation(effect);
        }
      }
    });
  }
}
```

---

## Summary

### Key Takeaways

1. **Three-State Machine**
   - FRESH: Up to date
   - STALE: Needs checking
   - PENDING: Checking now
   - Optimizes unnecessary updates

2. **Update Propagation**
   - markDownstream: Fast STALE marking
   - lookUpstream: Lazy checking
   - Only run when necessary

3. **Infinite Loop Prevention**
   - Track execution count
   - Batch updates
   - Proper effect design

4. **Update Ordering**
   - Memos before effects
   - Topological sort for complex graphs
   - Consistent execution order

### What You've Learned

- ✅ Computation state machine
- ✅ State transition logic
- ✅ lookUpstream algorithm
- ✅ markDownstream propagation
- ✅ Infinite loop prevention
- ✅ Update ordering strategies
- ✅ Complete implementation

### Next Steps

Continue to Lesson 2: Conditional Reactivity

---

## Further Reading

- **Next:** [Lesson 2: Conditional Reactivity](./lesson-02-conditional-reactivity.md)
- **Exercise:** [State Machine Exercise](../exercises/01-state-machine.md)
- **Source:** [Solid.js signal.ts (update logic)](https://github.com/solidjs/solid/blob/main/packages/solid/src/reactive/signal.ts)
