# Exercise 1: Complete Signal Implementation

**Difficulty:** ⭐⭐⭐ Advanced  
**Time:** 3-4 hours

## Objectives

Build a production-grade signal implementation with:
- Full SignalState interface
- Bidirectional tracking
- Custom comparators
- Debug information

## Requirements

### Part 1: Basic Signal (30 min)

Implement `createSignal` with bidirectional tracking:

```javascript
function createSignal(initialValue, options = {}) {
  // Your implementation here
}

// Test
const [count, setCount] = createSignal(0);
console.log(count()); // 0
setCount(5);
console.log(count()); // 5
```

### Part 2: Custom Comparators (30 min)

Add support for custom equality functions:

```javascript
const [obj, setObj] = createSignal(
  { x: 1 },
  { equals: (a, b) => a.x === b.x }
);

setObj({ x: 1 }); // No update (deep equal)
setObj({ x: 2 }); // Updates
```

### Part 3: Bidirectional Tracking (60 min)

Implement O(1) observer add/remove:

```javascript
// Signal should track observers
// Observers should track sources
// Removal should be O(1) using swap trick
```

### Part 4: Debug Names (30 min)

Add development mode features:

```javascript
const [count, setCount] = createSignal(0, { name: 'counter' });

// Should be visible in dev tools
console.log(count._state.name); // 'counter'
```

### Part 5: Functional Updates (30 min)

Support function updaters:

```javascript
const [count, setCount] = createSignal(0);

setCount(c => c + 1);
setCount(c => c * 2);
```

## Starter Code

```javascript
const FRESH = 0;
const STALE = 1;

let Listener = null;

function createSignal(initialValue, options = {}) {
  const state = {
    value: initialValue,
    observers: null,
    observerSlots: null,
    comparator: options.equals,
    name: options.name
  };
  
  const read = () => {
    // TODO: Implement tracking
    return state.value;
  };
  
  const write = (nextValue) => {
    // TODO: Implement updates
    state.value = nextValue;
    return nextValue;
  };
  
  read._state = state;
  
  return [read, write];
}

// TODO: Implement helper functions
function trackSignal(state, listener) {
  // Add bidirectional links
}

function notifyObservers(state) {
  // Notify all observers
}
```

## Test Cases

```javascript
// Test 1: Basic functionality
const [a, setA] = createSignal(1);
assert(a() === 1);
setA(2);
assert(a() === 2);

// Test 2: Functional updates
const [b, setB] = createSignal(0);
setB(x => x + 1);
assert(b() === 1);

// Test 3: Custom equality
const [c, setC] = createSignal(
  { x: 1 },
  { equals: (a, b) => a.x === b.x }
);
let updates = 0;
createEffect(() => {
  c();
  updates++;
});
setC({ x: 1 }); // Should not trigger
assert(updates === 1);

// Test 4: Bidirectional tracking
const [d, setD] = createSignal(0);
const dispose = createEffect(() => d());
// Check that effect is in signal's observers
assert(d._state.observers.length === 1);
dispose();
// Check that effect is removed
assert(d._state.observers.length === 0);
```

## Solution

<details>
<summary>Click to see solution</summary>

```javascript
const FRESH = 0;
const STALE = 1;

let Listener = null;
const Effects = [];

function createSignal(initialValue, options = {}) {
  const state = {
    value: initialValue,
    observers: null,
    observerSlots: null,
    comparator: options.equals !== undefined 
      ? options.equals 
      : (a, b) => a === b,
    name: options.name
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
    
    const equal = state.comparator === false
      ? false
      : state.comparator(state.value, nextValue);
    
    if (!equal) {
      state.value = nextValue;
      
      if (state.observers && state.observers.length) {
        for (let i = 0; i < state.observers.length; i++) {
          Effects.push(state.observers[i]);
        }
        runEffects();
      }
    }
    
    return nextValue;
  };
  
  read._state = state;
  
  return [read, write];
}

function createEffect(fn) {
  const computation = {
    fn,
    sources: null,
    sourceSlots: null
  };
  
  function execute() {
    cleanupSources(computation);
    
    const prevListener = Listener;
    Listener = computation;
    
    try {
      fn();
    } finally {
      Listener = prevListener;
    }
  }
  
  execute();
  
  return () => cleanupSources(computation);
}

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
      lastObs.sourceSlots[source.observerSlots[last]] = slot;
    }
    
    source.observers.pop();
    source.observerSlots.pop();
  }
}

function runEffects() {
  while (Effects.length) {
    const effect = Effects.shift();
    
    cleanupSources(effect);
    
    const prevListener = Listener;
    Listener = effect;
    
    try {
      effect.fn();
    } finally {
      Listener = prevListener;
    }
  }
}
```

</details>

## Reflection Questions

1. Why is bidirectional tracking important?
2. How does the comparator prevent unnecessary updates?
3. What are the performance implications of O(1) removal?
4. When would you use `equals: false`?

## Next Steps

- Complete Exercise 2: Effect Types
- Study the full Solid.js implementation
- Optimize for production use
