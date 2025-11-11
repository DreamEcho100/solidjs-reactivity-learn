# Lesson 1: Signals Deep Dive

## Table of Contents
1. [SignalState Interface Complete](#signalstate-interface-complete)
2. [Bidirectional Tracking Implementation](#bidirectional-tracking-implementation)
3. [Equality Comparators](#equality-comparators)
4. [Transition Support](#transition-support)
5. [Development Mode Features](#development-mode-features)
6. [Performance Optimizations](#performance-optimizations)
7. [Complete Implementation](#complete-implementation)

---

## SignalState Interface Complete

### The Full Structure

From Solid.js source code, here's the complete SignalState:

```typescript
export interface SignalState<T> extends SourceMapValue {
  value: T;                                    // Current value
  observers: Computation<any>[] | null;        // Who depends on this
  observerSlots: number[] | null;              // Indices in each observer
  tValue?: T;                                  // Transition value
  comparator?: (prev: T, next: T) => boolean;  // Equality check
  name?: string;                               // Debug name
  internal?: boolean;                          // Internal signal flag
}
```

### Field-by-Field Explanation

#### **value: T**
The current value of the signal.

```javascript
const [count, setCount] = createSignal(5);
// Internally: signal.value = 5
```

#### **observers: Computation[] | null**
Array of computations that depend on this signal.

```javascript
const [signal, setSignal] = createSignal(0);

createEffect(() => signal());  // Effect 1
createEffect(() => signal());  // Effect 2

// Internally: signal.observers = [effect1, effect2]
```

#### **observerSlots: number[] | null**
Parallel array storing indices into each observer's sources array.

```javascript
// signal.observers = [effect1, effect2]
// signal.observerSlots = [0, 1]
// Means: effect1.sources[0] = signal
//        effect2.sources[1] = signal
```

This enables O(1) removal!

#### **tValue?: T**
Transition value for concurrent rendering.

```javascript
startTransition(() => {
  setCount(10);
  // signal.tValue = 10 (temporary)
  // signal.value stays old until transition commits
});
```

#### **comparator?: (prev, next) => boolean**
Custom equality function.

```javascript
const [obj, setObj] = createSignal(
  { x: 1 },
  { equals: (a, b) => a.x === b.x }
);

setObj({ x: 1 }); // No update (deep equal)
```

#### **name?: string**
Debug name (development mode).

```javascript
const [count, setCount] = createSignal(0, { name: 'counter' });
// Makes debugging easier
```

#### **internal?: boolean**
Marks internal signals (not shown in dev tools).

---

## Bidirectional Tracking Implementation

### Why Bidirectional?

**Problem:** Need to:
1. Signal → Find all observers (for notification)
2. Observer → Find all sources (for cleanup)

**Solution:** Maintain both directions with index-based linking.

### The Algorithm

```javascript
function readHandler(signal, computation) {
  // Add computation to signal's observers
  const signalIndex = signal.observers.length;
  signal.observers.push(computation);
  
  // Store where this computation is in observer's sources
  signal.observerSlots.push(computation.sources.length);
  
  // Add signal to computation's sources
  computation.sources.push(signal);
  
  // Store where this signal is in signal's observers
  computation.sourceSlots.push(signalIndex);
}
```

### Visual Representation

```
Signal A:
  observers = [Comp1, Comp2]
  observerSlots = [0, 1]
                   ↓    ↓
Comp1:              |    |
  sources = [SignalA]    |
  sourceSlots = [0] ←────┘
                         |
Comp2:                   |
  sources = [X, SignalA] |
  sourceSlots = [?, 1] ←─┘
```

### O(1) Removal

When removing Comp1 from Signal A:

```javascript
function removeObserver(signal, index) {
  const last = signal.observers.length - 1;
  
  if (index < last) {
    // Swap with last
    const lastObs = signal.observers[last];
    signal.observers[index] = lastObs;
    signal.observerSlots[index] = signal.observerSlots[last];
    
    // Update the swapped observer's slot reference
    lastObs.sourceSlots[signal.observerSlots[last]] = index;
  }
  
  // Remove last
  signal.observers.pop();
  signal.observerSlots.pop();
}
```

### Complete Implementation

```javascript
function createSignal(initialValue, options = {}) {
  const state = {
    value: initialValue,
    observers: [],
    observerSlots: [],
    comparator: options.equals || ((a, b) => a === b),
    name: options.name,
    internal: options.internal
  };
  
  // Read handler
  const read = () => {
    if (currentListener && !currentListener.pure || currentListener.state === PENDING) {
      const index = state.observers.length;
      
      // Forward link: signal -> observer
      state.observers.push(currentListener);
      state.observerSlots.push(currentListener.sources.length);
      
      // Backward link: observer -> signal
      currentListener.sources.push(state);
      currentListener.sourceSlots.push(index);
    }
    
    return state.value;
  };
  
  // Write handler
  const write = (nextValue) => {
    if (typeof nextValue === 'function') {
      nextValue = nextValue(state.value);
    }
    
    // Check equality
    if (!state.comparator(state.value, nextValue)) {
      state.value = nextValue;
      
      // Notify all observers
      if (state.observers.length) {
        for (let i = 0; i < state.observers.length; i++) {
          const observer = state.observers[i];
          observer.state = STALE;
          
          if (observer.pure) {
            Updates.push(observer);
          } else {
            Effects.push(observer);
          }
        }
        
        runUpdates();
      }
    }
    
    return nextValue;
  };
  
  // Expose read handler for cleanup
  read._state = state;
  
  return [read, write];
}
```

---

## Equality Comparators

### Default: Reference Equality

```javascript
const [obj, setObj] = createSignal({ x: 1 });

setObj({ x: 1 }); // Triggers update (different reference)
```

### Custom: Deep Equality

```javascript
const deepEquals = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const [state, setState] = createSignal(
  { x: 1, y: 2 },
  { equals: deepEquals }
);

setState({ x: 1, y: 2 }); // No update (deep equal)
```

### Always Update

```javascript
const [value, setValue] = createSignal(0, { equals: false });

setValue(0); // Always triggers update
```

### Structural Comparison

```javascript
function structuralEquals(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  
  if (keysA.length !== keysB.length) return false;
  
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  
  return true;
}

const [point, setPoint] = createSignal(
  { x: 0, y: 0 },
  { equals: structuralEquals }
);
```

---

## Transition Support

### Transition Values (tValue)

Transitions allow non-urgent updates to be deferred:

```javascript
const [count, setCount] = createSignal(0);

startTransition(() => {
  setCount(5);
  // signal.tValue = 5 (new value)
  // signal.value = 0 (old value still shown)
});

// Later, when transition commits:
// signal.value = signal.tValue
```

### Implementation

```javascript
function writeWithTransition(signal, nextValue) {
  if (Transition && Transition.running) {
    // Store in tValue
    if (!signal.comparator(signal.tValue, nextValue)) {
      signal.tValue = nextValue;
      
      // Add to transition's sources
      Transition.sources.add(signal);
      
      // Mark observers but don't run yet
      markObserversStale(signal);
    }
  } else {
    // Normal update
    if (!signal.comparator(signal.value, nextValue)) {
      signal.value = nextValue;
      notifyObservers(signal);
    }
  }
}
```

---

## Development Mode Features

### Signal Names

```javascript
const [count, setCount] = createSignal(0, { name: 'counter' });

// In dev tools:
// counter: 0
```

### Source Maps

Solid.js tracks signal creation for debugging:

```typescript
interface SourceMapValue {
  value: unknown;
  name?: string;
  graph?: Owner;  // Who created this signal
}
```

### Dev Hooks

```javascript
if (IS_DEV) {
  DevHooks.afterCreateSignal?.(signal);
}
```

### Internal Signals

Hide implementation details:

```javascript
const [internal, setInternal] = createSignal(0, { internal: true });
// Not shown in dev tools
```

---

## Performance Optimizations

### 1. Inline Caching

```javascript
// Store last value to avoid comparator call
let lastValue = initialValue;

const write = (nextValue) => {
  if (nextValue !== lastValue) {  // Fast path
    if (!comparator(value, nextValue)) {
      lastValue = nextValue;
      value = nextValue;
      notify();
    }
  }
};
```

### 2. Null Checks

```javascript
// Avoid iteration if no observers
if (observers && observers.length) {
  for (let i = 0; i < observers.length; i++) {
    observers[i].notify();
  }
}
```

### 3. Array Preallocation

```javascript
// Preallocate for common case
const observers = new Array(4);  // Most signals have 1-4 observers
let observerCount = 0;
```

### 4. Batch Notifications

```javascript
// Collect all stale observers
const stale = new Set();

for (const signal of changedSignals) {
  for (const obs of signal.observers) {
    stale.add(obs);
  }
}

// Run each once
for (const obs of stale) {
  obs.update();
}
```

---

## Complete Implementation

Here's a production-grade signal implementation:

```javascript
const STALE = 1;
const PENDING = 2;

let currentListener = null;
let Updates = [];
let Effects = [];

function createSignal(initialValue, options = {}) {
  const state = {
    value: initialValue,
    observers: null,
    observerSlots: null,
    tValue: undefined,
    comparator: options.equals !== undefined 
      ? options.equals 
      : (a, b) => a === b,
    name: options.name,
    internal: options.internal
  };
  
  const read = () => {
    // Track dependency
    if (currentListener) {
      if (!state.observers) {
        state.observers = [];
        state.observerSlots = [];
      }
      
      const index = state.observers.length;
      state.observers.push(currentListener);
      state.observerSlots.push(currentListener.sources.length);
      
      currentListener.sources.push(state);
      currentListener.sourceSlots.push(index);
      
      // Dev mode
      if (IS_DEV && !state.internal) {
        trackRead(state, currentListener);
      }
    }
    
    return state.value;
  };
  
  const write = (nextValue) => {
    // Unwrap function
    if (typeof nextValue === 'function') {
      nextValue = nextValue(state.value);
    }
    
    // Check equality
    const equal = state.comparator === false 
      ? false 
      : state.comparator(state.value, nextValue);
    
    if (!equal) {
      state.value = nextValue;
      
      // Notify observers
      if (state.observers && state.observers.length) {
        for (let i = 0; i < state.observers.length; i++) {
          const observer = state.observers[i];
          observer.state = STALE;
          
          if (observer.pure) {
            Updates.push(observer);
          } else {
            Effects.push(observer);
          }
        }
        
        runUpdates();
      }
      
      // Dev mode
      if (IS_DEV && !state.internal) {
        trackWrite(state, nextValue);
      }
    }
    
    return nextValue;
  };
  
  // Expose state for internal use
  read._state = state;
  
  // Dev mode
  if (IS_DEV) {
    DevHooks.afterCreateSignal?.(state);
  }
  
  return [read, write];
}

function runUpdates() {
  // Run memos first (Updates queue)
  while (Updates.length) {
    const update = Updates.shift();
    if (update.state === STALE) {
      updateComputation(update);
    }
  }
  
  // Then effects (Effects queue)
  while (Effects.length) {
    const effect = Effects.shift();
    if (effect.state === STALE) {
      updateComputation(effect);
    }
  }
}
```

---

## Summary

### Key Takeaways

1. **SignalState is Complex**
   - 7 fields with specific purposes
   - Bidirectional tracking is crucial
   - Transition support for concurrency
   - Dev mode features for debugging

2. **Bidirectional Tracking**
   - O(1) add and remove
   - Index-based linking
   - Enables efficient cleanup
   - Critical for performance

3. **Equality Comparators**
   - Default: reference equality
   - Custom: any comparison function
   - false: always update
   - Prevents unnecessary updates

4. **Performance Matters**
   - Inline caching
   - Null checks
   - Array preallocation
   - Batch notifications

### What You've Learned

- ✅ Complete SignalState structure
- ✅ Bidirectional tracking algorithm
- ✅ Equality comparator patterns
- ✅ Transition support basics
- ✅ Development mode features
- ✅ Performance optimizations

### Next Steps

Continue to Lesson 2 where we'll explore computations (effects and memos) in detail.

---

## Further Reading

- **Next Lesson:** [Computations - Effects and Memos](./lesson-02-computations.md)
- **Exercise:** [Complete Signal Implementation](../exercises/01-complete-signal.md)
- **Source:** [Solid.js signal.ts (lines 220-260)](https://github.com/solidjs/solid/blob/main/packages/solid/src/reactive/signal.ts)

---

**You now understand signals at a production level!** The complexity is necessary for performance and features, but the core concept remains: reactive values that notify observers on change.
