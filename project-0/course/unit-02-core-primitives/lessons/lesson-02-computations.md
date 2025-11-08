# Lesson 2: Computations - Effects and Memos

## Table of Contents

1. [Computation Interface](#computation-interface)
2. [Pure vs Impure Computations](#pure-vs-impure-computations)
3. [createEffect Implementation](#createeffect-implementation)
4. [createMemo Implementation](#creatememo-implementation)
5. [createComputed vs createRenderEffect](#createcomputed-vs-createrendereffect)
6. [Scheduling and Execution](#scheduling-and-execution)
7. [Complete Implementation](#complete-implementation)

---

## Computation Interface

### The Full Structure

From Solid.js source code:

```typescript
interface Computation<T> {
  fn: EffectFunction<T>;
  state: 0 | 1 | 2;              // FRESH, STALE, PENDING
  sources: SignalState<any>[] | null;
  sourceSlots: number[] | null;
  value?: T;
  owned: Computation<any>[] | null;
  owner: Owner | null;
  context: any;
  pure: boolean;
  user?: boolean;                // User-created effect
  cleanups: (() => void)[] | null;
  suspense?: SuspenseContextType;
}
```

### Field-by-Field Explanation

#### **fn: EffectFunction<T>**
The function to execute.

```javascript
const computation = {
  fn: () => console.log(count()),
  // ... other fields
};
```

#### **state: 0 | 1 | 2**
Current computation state:
- `0` (FRESH): Up to date
- `1` (STALE): Needs re-execution
- `2` (PENDING): Checking if stale

```javascript
const FRESH = 0;
const STALE = 1;
const PENDING = 2;
```

#### **sources: SignalState[] | null**
Signals this computation depends on.

```javascript
// Effect depends on signalA and signalB
computation.sources = [signalA._state, signalB._state];
```

#### **sourceSlots: number[] | null**
Indices into each source's observers array (bidirectional tracking).

```javascript
// computation is at index 0 in signalA's observers
// and at index 1 in signalB's observers
computation.sourceSlots = [0, 1];
```

#### **value?: T**
Cached value (memos only).

```javascript
const memo = createMemo(() => expensive());
// memo.computation.value = result of expensive()
```

#### **owned: Computation[] | null**
Child computations created during this computation's execution.

```javascript
createEffect(() => {
  // This effect is owned by parent
  createEffect(() => {
    // This nested effect is owned by parent effect
  });
});
```

#### **owner: Owner | null**
The owner that created this computation.

#### **pure: boolean**
If true, can have observers (memos). If false, side effects only (effects).

```javascript
// Memo - pure
const double = createMemo(() => count() * 2);
// double.computation.pure = true

// Effect - impure
createEffect(() => console.log(count()));
// effect.computation.pure = false
```

---

## Pure vs Impure Computations

### Pure Computations (Memos)

**Characteristics:**
- ✅ Can have observers
- ✅ Value is cached
- ✅ Re-executes when dependencies change
- ✅ Returns a value
- ✅ No side effects (ideally)

**Example:**
```javascript
const [count, setCount] = createSignal(0);

const doubled = createMemo(() => {
  console.log('Computing doubled');
  return count() * 2;
});

console.log(doubled()); // Computing doubled, 0
console.log(doubled()); // 0 (cached, no recompute)

setCount(5);
console.log(doubled()); // Computing doubled, 10
```

### Impure Computations (Effects)

**Characteristics:**
- ✅ Cannot have observers
- ✅ No cached value
- ✅ Re-executes when dependencies change
- ✅ Performs side effects
- ✅ Returns nothing (void)

**Example:**
```javascript
const [count, setCount] = createSignal(0);

createEffect(() => {
  console.log('Count is now:', count());
  // Side effect - updating DOM, logging, API calls, etc.
});
```

### Comparison Table

| Feature | Memo (Pure) | Effect (Impure) |
|---------|------------|-----------------|
| Can be observed | ✅ Yes | ❌ No |
| Cached value | ✅ Yes | ❌ No |
| Returns value | ✅ Yes | ❌ No |
| Side effects | ❌ Avoid | ✅ Expected |
| Use case | Derived data | DOM updates, API calls |

---

## createEffect Implementation

### Basic Structure

```javascript
function createEffect(fn, initialValue, options) {
  const owner = Owner;
  const computation = {
    fn,
    state: FRESH,
    sources: null,
    sourceSlots: null,
    value: initialValue,
    owned: null,
    owner,
    context: null,
    pure: false,
    user: true,
    cleanups: null
  };
  
  // Register with owner
  if (owner) {
    if (!owner.owned) owner.owned = [];
    owner.owned.push(computation);
  }
  
  // Schedule first execution
  if (ExecCount) {
    Updates.push(computation);
  } else {
    queueMicrotask(() => runTop(computation));
  }
  
  return computation;
}
```

### Execution Flow

```javascript
function runTop(computation) {
  // Clean up old dependencies
  cleanupSources(computation);
  
  const prevListener = Listener;
  const prevOwner = Owner;
  
  Listener = computation;
  Owner = computation;
  
  try {
    computation.fn(computation.value);
  } catch (err) {
    handleError(err);
  } finally {
    Listener = prevListener;
    Owner = prevOwner;
  }
  
  computation.state = FRESH;
}
```

### Complete Example

```javascript
const FRESH = 0;
const STALE = 1;

let Listener = null;
let Owner = null;
let ExecCount = 0;
const Updates = [];
const Effects = [];

function createEffect(fn) {
  const computation = {
    fn,
    state: FRESH,
    sources: null,
    sourceSlots: null,
    owned: null,
    owner: Owner,
    pure: false,
    cleanups: null
  };
  
  if (Owner) {
    if (!Owner.owned) Owner.owned = [];
    Owner.owned.push(computation);
  }
  
  // Initial run
  runTop(computation);
  
  return computation;
}

function runTop(computation) {
  cleanupSources(computation);
  
  const prevListener = Listener;
  const prevOwner = Owner;
  
  Listener = computation;
  Owner = computation;
  
  try {
    computation.fn();
  } catch (err) {
    console.error(err);
  } finally {
    Listener = prevListener;
    Owner = prevOwner;
  }
  
  computation.state = FRESH;
}

function cleanupSources(computation) {
  if (computation.sources) {
    while (computation.sources.length) {
      const source = computation.sources.pop();
      const slot = computation.sourceSlots.pop();
      
      removeObserver(source, slot);
    }
  }
}

function removeObserver(signal, index) {
  const observers = signal.observers;
  const last = observers.length - 1;
  
  if (index < last) {
    const lastObs = observers[last];
    observers[index] = lastObs;
    signal.observerSlots[index] = signal.observerSlots[last];
    lastObs.sourceSlots[signal.observerSlots[last]] = index;
  }
  
  observers.pop();
  signal.observerSlots.pop();
}
```

---

## createMemo Implementation

### Basic Structure

```javascript
function createMemo(fn, initialValue, options) {
  const owner = Owner;
  
  const computation = {
    fn,
    state: FRESH,
    sources: null,
    sourceSlots: null,
    value: initialValue,
    owned: null,
    owner,
    context: null,
    pure: true,      // Key difference!
    observers: null,
    observerSlots: null,
    comparator: options?.equals
  };
  
  if (owner) {
    if (!owner.owned) owner.owned = [];
    owner.owned.push(computation);
  }
  
  // Run immediately to compute initial value
  updateComputation(computation);
  
  return readSignal.bind(computation);
}
```

### Reading a Memo

```javascript
function readSignal() {
  const computation = this; // Bound to memo computation
  
  // If stale, recompute
  if (computation.state === STALE) {
    updateComputation(computation);
  }
  
  // Track dependency
  if (Listener) {
    const index = computation.observers.length;
    computation.observers.push(Listener);
    computation.observerSlots.push(Listener.sources.length);
    
    Listener.sources.push(computation);
    Listener.sourceSlots.push(index);
  }
  
  return computation.value;
}
```

### Update Computation

```javascript
function updateComputation(computation) {
  cleanupSources(computation);
  
  const prevListener = Listener;
  const prevOwner = Owner;
  
  Listener = computation;
  Owner = computation;
  
  let nextValue;
  try {
    nextValue = computation.fn(computation.value);
  } catch (err) {
    handleError(err);
  } finally {
    Listener = prevListener;
    Owner = prevOwner;
  }
  
  // Check equality
  const equal = computation.comparator
    ? computation.comparator(computation.value, nextValue)
    : computation.value === nextValue;
  
  if (!equal) {
    computation.value = nextValue;
    
    // Notify observers (memos can have observers)
    if (computation.observers) {
      for (let i = 0; i < computation.observers.length; i++) {
        const observer = computation.observers[i];
        observer.state = STALE;
        
        if (observer.pure) {
          Updates.push(observer);
        } else {
          Effects.push(observer);
        }
      }
    }
  }
  
  computation.state = FRESH;
}
```

### Complete Example

```javascript
function createMemo(fn, initialValue) {
  const computation = {
    fn,
    state: FRESH,
    sources: null,
    sourceSlots: null,
    value: initialValue,
    owned: null,
    owner: Owner,
    pure: true,
    observers: null,
    observerSlots: null
  };
  
  if (Owner) {
    if (!Owner.owned) Owner.owned = [];
    Owner.owned.push(computation);
  }
  
  // Compute initial value
  updateComputation(computation);
  
  // Return accessor function
  const read = () => {
    if (computation.state === STALE) {
      updateComputation(computation);
    }
    
    if (Listener) {
      const index = computation.observers 
        ? computation.observers.length 
        : 0;
      
      if (!computation.observers) {
        computation.observers = [];
        computation.observerSlots = [];
      }
      
      computation.observers.push(Listener);
      computation.observerSlots.push(Listener.sources.length);
      
      if (!Listener.sources) {
        Listener.sources = [];
        Listener.sourceSlots = [];
      }
      
      Listener.sources.push(computation);
      Listener.sourceSlots.push(index);
    }
    
    return computation.value;
  };
  
  return read;
}
```

---

## createComputed vs createRenderEffect

### createComputed

**Timing:** Runs **synchronously** during update propagation.

**Use case:** When you need immediate updates before effects run.

```javascript
function createComputed(fn) {
  const computation = {
    fn,
    state: FRESH,
    sources: null,
    sourceSlots: null,
    owned: null,
    owner: Owner,
    pure: false,
    user: false  // System effect
  };
  
  if (Owner) {
    if (!Owner.owned) Owner.owned = [];
    Owner.owned.push(computation);
  }
  
  // Run immediately, synchronously
  runTop(computation);
  
  return computation;
}
```

### createRenderEffect

**Timing:** Runs during the **render phase** (before DOM commits).

**Use case:** Direct DOM manipulation, refs.

```javascript
function createRenderEffect(fn) {
  const computation = {
    fn,
    state: FRESH,
    sources: null,
    sourceSlots: null,
    owned: null,
    owner: Owner,
    pure: false,
    user: false
  };
  
  if (Owner) {
    if (!Owner.owned) Owner.owned = [];
    Owner.owned.push(computation);
  }
  
  // Add to render queue
  if (ExecCount) {
    Updates.push(computation);
  } else {
    runTop(computation);
  }
  
  return computation;
}
```

### Timing Comparison

```javascript
const [count, setCount] = createSignal(0);

createComputed(() => {
  console.log('1. Computed runs synchronously');
});

createRenderEffect(() => {
  console.log('2. Render effect runs during render');
});

createEffect(() => {
  console.log('3. Effect runs after render (microtask)');
});

setCount(1);

// Output order:
// 1. Computed runs synchronously
// 2. Render effect runs during render
// 3. Effect runs after render (microtask)
```

### When to Use Which

| Type | Timing | Use Case |
|------|--------|----------|
| **createComputed** | Synchronous | Immediate sync updates |
| **createRenderEffect** | During render | DOM manipulation, refs |
| **createEffect** | After render (async) | Side effects, API calls |
| **createMemo** | Lazy | Derived data |

---

## Scheduling and Execution

### Update Queue System

```javascript
const Updates = [];  // Memos and computed
const Effects = [];  // Effects

let ExecCount = 0;
let Pending = false;

function runUpdates() {
  if (Pending) return;
  Pending = true;
  
  queueMicrotask(() => {
    ExecCount++;
    
    // Run all pending updates (memos first)
    for (let i = 0; i < Updates.length; i++) {
      const computation = Updates[i];
      if (computation.state === STALE) {
        updateComputation(computation);
      }
    }
    Updates.length = 0;
    
    // Then run effects
    for (let i = 0; i < Effects.length; i++) {
      const computation = Effects[i];
      if (computation.state === STALE) {
        runTop(computation);
      }
    }
    Effects.length = 0;
    
    ExecCount--;
    Pending = false;
  });
}
```

### Batching Multiple Updates

```javascript
function batch(fn) {
  ExecCount++;
  try {
    fn();
  } finally {
    ExecCount--;
    if (ExecCount === 0) {
      runUpdates();
    }
  }
}

// Example
batch(() => {
  setSignal1(value1);
  setSignal2(value2);
  setSignal3(value3);
  // All effects run once after batch
});
```

---

## Complete Implementation

Here's a complete, working implementation:

```javascript
// Constants
const FRESH = 0;
const STALE = 1;
const PENDING = 2;

// Global state
let Listener = null;
let Owner = null;
let ExecCount = 0;
let Pending = false;

const Updates = [];
const Effects = [];

// Effect implementation
function createEffect(fn, initialValue) {
  const computation = {
    fn,
    state: FRESH,
    sources: null,
    sourceSlots: null,
    value: initialValue,
    owned: null,
    owner: Owner,
    pure: false,
    user: true,
    cleanups: null
  };
  
  if (Owner) {
    if (!Owner.owned) Owner.owned = [];
    Owner.owned.push(computation);
  }
  
  if (ExecCount) {
    Effects.push(computation);
    computation.state = STALE;
  } else {
    queueMicrotask(() => runTop(computation));
  }
  
  return () => disposeComputation(computation);
}

// Memo implementation
function createMemo(fn, initialValue, options = {}) {
  const computation = {
    fn,
    state: FRESH,
    sources: null,
    sourceSlots: null,
    value: initialValue,
    owned: null,
    owner: Owner,
    pure: true,
    observers: null,
    observerSlots: null,
    comparator: options.equals
  };
  
  if (Owner) {
    if (!Owner.owned) Owner.owned = [];
    Owner.owned.push(computation);
  }
  
  updateComputation(computation);
  
  return () => {
    if (computation.state === STALE) {
      updateComputation(computation);
    }
    
    if (Listener) {
      const index = computation.observers 
        ? computation.observers.length 
        : 0;
      
      if (!computation.observers) {
        computation.observers = [];
        computation.observerSlots = [];
      }
      
      computation.observers.push(Listener);
      computation.observerSlots.push(Listener.sources ? Listener.sources.length : 0);
      
      if (!Listener.sources) {
        Listener.sources = [];
        Listener.sourceSlots = [];
      }
      
      Listener.sources.push(computation);
      Listener.sourceSlots.push(index);
    }
    
    return computation.value;
  };
}

// Computed implementation
function createComputed(fn, initialValue) {
  const computation = {
    fn,
    state: FRESH,
    sources: null,
    sourceSlots: null,
    value: initialValue,
    owned: null,
    owner: Owner,
    pure: false,
    user: false
  };
  
  if (Owner) {
    if (!Owner.owned) Owner.owned = [];
    Owner.owned.push(computation);
  }
  
  runTop(computation);
  
  return () => disposeComputation(computation);
}

// Core execution functions
function runTop(computation) {
  cleanupSources(computation);
  
  const prevListener = Listener;
  const prevOwner = Owner;
  
  Listener = computation;
  Owner = computation;
  
  try {
    computation.fn(computation.value);
  } catch (err) {
    handleError(err);
  } finally {
    Listener = prevListener;
    Owner = prevOwner;
  }
  
  computation.state = FRESH;
}

function updateComputation(computation) {
  cleanupSources(computation);
  
  const prevListener = Listener;
  const prevOwner = Owner;
  
  Listener = computation;
  Owner = computation;
  
  let nextValue;
  try {
    nextValue = computation.fn(computation.value);
  } catch (err) {
    handleError(err);
    return;
  } finally {
    Listener = prevListener;
    Owner = prevOwner;
  }
  
  const equal = computation.comparator
    ? computation.comparator(computation.value, nextValue)
    : computation.value === nextValue;
  
  if (!equal) {
    computation.value = nextValue;
    
    if (computation.observers && computation.observers.length) {
      for (let i = 0; i < computation.observers.length; i++) {
        const observer = computation.observers[i];
        observer.state = STALE;
        
        if (observer.pure) {
          Updates.push(observer);
        } else {
          Effects.push(observer);
        }
      }
    }
  }
  
  computation.state = FRESH;
}

function cleanupSources(computation) {
  if (computation.sources) {
    while (computation.sources.length) {
      const source = computation.sources.pop();
      const slot = computation.sourceSlots.pop();
      
      if (source.observers) {
        const observers = source.observers;
        const last = observers.length - 1;
        
        if (slot < last) {
          const lastObs = observers[last];
          observers[slot] = lastObs;
          source.observerSlots[slot] = source.observerSlots[last];
          lastObs.sourceSlots[source.observerSlots[last]] = slot;
        }
        
        observers.pop();
        source.observerSlots.pop();
      }
    }
  }
}

function disposeComputation(computation) {
  cleanupSources(computation);
  
  if (computation.owned) {
    for (let i = 0; i < computation.owned.length; i++) {
      disposeComputation(computation.owned[i]);
    }
    computation.owned = null;
  }
  
  if (computation.cleanups) {
    for (let i = 0; i < computation.cleanups.length; i++) {
      computation.cleanups[i]();
    }
    computation.cleanups = null;
  }
}

function handleError(err) {
  console.error('Error in computation:', err);
  throw err;
}

function runUpdates() {
  if (Pending) return;
  Pending = true;
  
  queueMicrotask(() => {
    ExecCount++;
    
    for (let i = 0; i < Updates.length; i++) {
      const computation = Updates[i];
      if (computation.state === STALE) {
        updateComputation(computation);
      }
    }
    Updates.length = 0;
    
    for (let i = 0; i < Effects.length; i++) {
      const computation = Effects[i];
      if (computation.state === STALE) {
        runTop(computation);
      }
    }
    Effects.length = 0;
    
    ExecCount--;
    Pending = false;
  });
}

function batch(fn) {
  ExecCount++;
  try {
    fn();
  } finally {
    ExecCount--;
    if (ExecCount === 0) {
      runUpdates();
    }
  }
}

// Export
export {
  createEffect,
  createMemo,
  createComputed,
  batch
};
```

---

## Summary

### Key Takeaways

1. **Computations are the foundation**
   - Effects for side effects
   - Memos for derived data
   - Different timing for different needs

2. **Pure vs Impure**
   - Pure (memos) can have observers
   - Impure (effects) cannot
   - Purity enables optimization

3. **Execution Timing**
   - createComputed: Synchronous
   - createRenderEffect: During render
   - createEffect: After render (async)
   - createMemo: Lazy (on read)

4. **State Machine**
   - FRESH: Up to date
   - STALE: Needs update
   - PENDING: Checking dependencies

### What You've Learned

- ✅ Complete Computation interface
- ✅ Pure vs impure differences
- ✅ All effect types
- ✅ Memo caching strategy
- ✅ Scheduling system
- ✅ Production implementation

### Next Steps

Continue to Lesson 3: Ownership and Lifecycle

---

## Further Reading

- **Next:** [Lesson 3: Ownership and Lifecycle](./lesson-03-ownership-lifecycle.md)
- **Exercise:** [Effect Types Exercise](../exercises/02-effect-types.md)
- **Source:** [Solid.js signal.ts (lines 380-470)](https://github.com/solidjs/solid/blob/main/packages/solid/src/reactive/signal.ts)
