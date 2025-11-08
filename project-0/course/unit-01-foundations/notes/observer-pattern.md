# The Observer Pattern in Reactive Systems

A deep dive into how the Observer pattern forms the foundation of reactive programming in Solid.js.

---

## Table of Contents

1. [Classic Observer Pattern](#classic-observer-pattern)
2. [Evolution to Signals](#evolution-to-signals)
3. [Automatic Subscription](#automatic-subscription)
4. [Bidirectional Tracking](#bidirectional-tracking)
5. [Memory Management](#memory-management)
6. [Performance Optimization](#performance-optimization)
7. [Real-World Implementation](#real-world-implementation)

---

## Classic Observer Pattern

### Definition

The Observer pattern is a behavioral design pattern where an object (subject) maintains a list of dependents (observers) and notifies them automatically of state changes.

### Components

1. **Subject (Observable)**
   - Maintains list of observers
   - Provides subscribe/unsubscribe methods
   - Notifies observers of changes

2. **Observer**
   - Implements update method
   - Reacts to subject changes

3. **Client**
   - Creates subjects and observers
   - Establishes subscriptions

### Classic Implementation

```javascript
// Subject (Observable)
class Subject {
  constructor() {
    this.observers = [];
  }
  
  subscribe(observer) {
    this.observers.push(observer);
    return () => this.unsubscribe(observer);
  }
  
  unsubscribe(observer) {
    this.observers = this.observers.filter(o => o !== observer);
  }
  
  notify(data) {
    this.observers.forEach(observer => observer.update(data));
  }
  
  setState(newState) {
    this.state = newState;
    this.notify(newState);
  }
}

// Observer
class Observer {
  constructor(name) {
    this.name = name;
  }
  
  update(data) {
    console.log(`${this.name} received:`, data);
  }
}

// Usage
const subject = new Subject();
const observer1 = new Observer('Observer 1');
const observer2 = new Observer('Observer 2');

subject.subscribe(observer1);
subject.subscribe(observer2);

subject.setState('Hello'); 
// Observer 1 received: Hello
// Observer 2 received: Hello
```

### Characteristics

**Pros:**
- ✅ Loose coupling
- ✅ Dynamic subscription
- ✅ Broadcast communication

**Cons:**
- ❌ Manual subscription management
- ❌ Memory leaks if not cleaned up
- ❌ Difficult to track dependencies

---

## Evolution to Signals

### From Classes to Functions

Signals modernize the Observer pattern using functional programming:

```javascript
// Signal version
function createSubject(initialValue) {
  let value = initialValue;
  const observers = new Set();
  
  return {
    get: () => value,
    set: (newValue) => {
      value = newValue;
      observers.forEach(fn => fn(value));
    },
    subscribe: (fn) => {
      observers.add(fn);
      return () => observers.delete(fn);
    }
  };
}

// Usage
const count = createSubject(0);

const unsubscribe = count.subscribe(value => {
  console.log('Count:', value);
});

count.set(5); // Count: 5
unsubscribe();
count.set(10); // No log
```

### Accessor Pattern

Signals use getters as functions:

```javascript
// Traditional object property
const obj = { count: 0 };
console.log(obj.count); // Property access

// Signal accessor
const [count, setCount] = createSignal(0);
console.log(count()); // Function call
```

**Benefits:**
- Can execute code on read
- Enable automatic tracking
- No proxy overhead

---

## Automatic Subscription

### The Problem with Manual Subscription

```javascript
// Manual subscription is error-prone
const count = createSubject(0);
const double = createSubject(0);

// Must remember to subscribe
const unsub = count.subscribe(value => {
  double.set(value * 2);
});

// Must remember to unsubscribe
// (easy to forget!)
```

### Automatic Solution

```javascript
// Global tracking context
let currentListener = null;

function createSignal(initialValue) {
  let value = initialValue;
  const observers = new Set();
  
  const read = () => {
    // Automatic subscription!
    if (currentListener) {
      observers.add(currentListener);
    }
    return value;
  };
  
  const write = (newValue) => {
    value = newValue;
    observers.forEach(fn => fn());
  };
  
  return [read, write];
}

function createEffect(fn) {
  const execute = () => {
    currentListener = execute;
    fn();
    currentListener = null;
  };
  execute();
}

// Usage - completely automatic!
const [count, setCount] = createSignal(0);

createEffect(() => {
  console.log('Count:', count());
  // Automatically subscribed!
});

setCount(5); // Logs: "Count: 5"
```

### How It Works

**Step-by-step trace:**

1. Effect starts executing
   ```javascript
   currentListener = execute;
   ```

2. Effect calls count()
   ```javascript
   count() // Reads signal
   ```

3. Signal sees currentListener
   ```javascript
   if (currentListener) {
     observers.add(currentListener);
   }
   ```

4. Subscription established!

5. Effect completes
   ```javascript
   currentListener = null;
   ```

### Dependency Graph

```
Effect execution:
  currentListener = execute
  fn() {
    signalA()  ← Subscribes execute to signalA
    signalB()  ← Subscribes execute to signalB
  }
  currentListener = null

Result:
  signalA.observers = [execute]
  signalB.observers = [execute]
```

---

## Bidirectional Tracking

### The Problem

With automatic subscription, we need cleanup:

```javascript
createEffect(() => {
  if (condition()) {
    signalA();
  } else {
    signalB();
  }
});

// First run: subscribed to signalA
// After condition changes: should unsubscribe from signalA
```

### Forward Tracking (Signal → Observers)

```javascript
// Signals track their observers
signal.observers = [effect1, effect2];
```

### Backward Tracking (Observer → Sources)

```javascript
// Observers track their sources
effect.sources = [signal1, signal2];
```

### Complete Implementation

```javascript
function createSignal(initialValue) {
  let value = initialValue;
  const observers = new Set();
  
  const read = () => {
    if (currentListener) {
      // Forward: Add to signal's observers
      observers.add(currentListener);
      
      // Backward: Add to listener's sources
      if (!currentListener.sources) {
        currentListener.sources = new Set();
      }
      currentListener.sources.add(read);
    }
    return value;
  };
  
  read.removeObserver = (listener) => {
    observers.delete(listener);
  };
  
  const write = (newValue) => {
    value = newValue;
    observers.forEach(fn => fn());
  };
  
  return [read, write];
}

function createEffect(fn) {
  const execute = () => {
    // Clean up old subscriptions
    if (execute.sources) {
      execute.sources.forEach(signal => {
        signal.removeObserver(execute);
      });
      execute.sources.clear();
    }
    
    currentListener = execute;
    fn();
    currentListener = null;
  };
  
  execute();
}
```

### Cleanup Flow

```
Effect re-runs:
1. Loop through execute.sources
2. Remove execute from each signal's observers
3. Clear execute.sources
4. Execute function (re-establishes subscriptions)
```

---

## Memory Management

### Memory Leak Example

```javascript
// Bad: Infinite growth
const signals = [];

setInterval(() => {
  const [s, set] = createSignal(0);
  signals.push(s);
  
  createEffect(() => {
    console.log(s());
  });
  // Effect never cleaned up!
}, 1000);

// After 1 minute: 60 signals, 60 effects
// After 1 hour: 3600 signals, 3600 effects
// Memory grows forever!
```

### Solution: Ownership and Disposal

```javascript
function createRoot(fn) {
  const owner = {
    owned: [],
    cleanups: []
  };
  
  const prevOwner = currentOwner;
  currentOwner = owner;
  
  const dispose = () => {
    // Dispose all owned computations
    owner.owned.forEach(comp => comp.dispose());
    // Run cleanup functions
    owner.cleanups.forEach(fn => fn());
  };
  
  try {
    return fn(dispose);
  } finally {
    currentOwner = prevOwner;
  }
}

// Usage
const dispose = createRoot((dispose) => {
  const [count, setCount] = createSignal(0);
  
  createEffect(() => {
    console.log(count());
  });
  
  return dispose;
});

// Later: clean up everything
dispose();
```

### Hierarchical Ownership

```
Root
 ├─ Effect 1
 │   ├─ Memo 1
 │   │   └─ Effect 2
 │   └─ Signal 1
 └─ Effect 3
     └─ Memo 2

Disposing Root automatically disposes entire tree!
```

---

## Performance Optimization

### Problem: Redundant Updates

```javascript
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);

createEffect(() => {
  console.log(a() + b());
});

// Without optimization:
setA(10); // Logs sum
setB(20); // Logs sum
// Two updates for two changes
```

### Solution 1: Batching

```javascript
batch(() => {
  setA(10);
  setB(20);
});
// Logs sum once
```

### Solution 2: Stale Marking

```javascript
// Instead of running immediately:
signal.write = (value) => {
  this.value = value;
  // Mark observers as stale
  observers.forEach(obs => obs.state = STALE);
  // Schedule update
  scheduleUpdate();
};

// Run all stale computations in batch
function scheduleUpdate() {
  queueMicrotask(() => {
    staleComputations.forEach(comp => comp.execute());
  });
}
```

### Solution 3: Dependency Levels

```javascript
// Track dependency depth
signal1 (level 0)
   ↓
memo1 (level 1)
   ↓
memo2 (level 2)
   ↓
effect (level 3)

// Update in order: 0 → 1 → 2 → 3
// Ensures each computation runs once
```

---

## Real-World Implementation

### Solid.js Approach

From the source code analysis:

```typescript
interface SignalState<T> {
  value: T;
  observers: Computation[] | null;
  observerSlots: number[] | null;  // Bidirectional indices
  comparator?: (prev: T, next: T) => boolean;
}

interface Computation {
  fn: () => void;
  state: 0 | 1 | 2;  // Fresh, Stale, Pending
  sources: SignalState[] | null;
  sourceSlots: number[] | null;  // Bidirectional indices
  owner: Owner | null;
}
```

**Key Insights:**

1. **Bidirectional Arrays**
   - observers/observerSlots
   - sources/sourceSlots
   - O(1) add/remove

2. **State Machine**
   - 0: Fresh (up to date)
   - 1: Stale (needs update)
   - 2: Pending (checking dependencies)

3. **Owner Hierarchy**
   - Automatic cleanup
   - Context propagation
   - Memory safety

### Complete Example

```javascript
// Simplified Solid.js-style implementation
let currentOwner = null;
let currentListener = null;
const updateQueue = new Set();

function createSignal(initialValue) {
  const state = {
    value: initialValue,
    observers: [],
    observerSlots: []
  };
  
  const read = () => {
    if (currentListener) {
      const index = state.observers.length;
      state.observers.push(currentListener);
      state.observerSlots.push(currentListener.sources.length);
      
      currentListener.sources.push(state);
      currentListener.sourceSlots.push(index);
    }
    return state.value;
  };
  
  const write = (newValue) => {
    if (state.value === newValue) return;
    state.value = newValue;
    
    for (let i = 0; i < state.observers.length; i++) {
      const observer = state.observers[i];
      observer.state = 1; // Mark stale
      updateQueue.add(observer);
    }
    
    flush();
  };
  
  return [read, write];
}

function createEffect(fn) {
  const computation = {
    fn,
    state: 0,
    sources: [],
    sourceSlots: [],
    owner: currentOwner
  };
  
  if (currentOwner) {
    currentOwner.owned.push(computation);
  }
  
  update(computation);
}

function update(computation) {
  cleanupSources(computation);
  
  currentListener = computation;
  computation.fn();
  currentListener = null;
  
  computation.state = 0; // Mark fresh
}

function cleanupSources(computation) {
  for (let i = 0; i < computation.sources.length; i++) {
    const source = computation.sources[i];
    const slot = computation.sourceSlots[i];
    
    // Remove from source's observers (O(1) swap with last)
    const last = source.observers.length - 1;
    if (slot < last) {
      const lastObserver = source.observers[last];
      source.observers[slot] = lastObserver;
      source.observerSlots[slot] = source.observerSlots[last];
      lastObserver.sourceSlots[source.observerSlots[last]] = slot;
    }
    source.observers.length--;
    source.observerSlots.length--;
  }
  
  computation.sources.length = 0;
  computation.sourceSlots.length = 0;
}

function flush() {
  const queue = Array.from(updateQueue);
  updateQueue.clear();
  
  for (const computation of queue) {
    if (computation.state === 1) {
      update(computation);
    }
  }
}
```

---

## Summary

### Key Takeaways

1. **Observer Pattern Foundation**
   - Signals are subjects
   - Effects are observers
   - Automatic subscription

2. **Automatic Tracking**
   - Global currentListener
   - Established during execution
   - No manual management

3. **Bidirectional Links**
   - Forward: Signal → Observers
   - Backward: Observer → Sources
   - Efficient cleanup

4. **Memory Management**
   - Owner hierarchy
   - Automatic disposal
   - Cleanup functions

5. **Performance**
   - Batching updates
   - Stale marking
   - Dependency ordering

### Evolution Path

```
Classic Observer Pattern
  ↓
Functional Signals
  ↓
Automatic Subscription
  ↓
Bidirectional Tracking
  ↓
Owner Hierarchy
  ↓
Fine-Grained Reactivity
```

### Modern Reactive Systems

The Observer pattern evolved into fine-grained reactive systems by:

1. Making subscription automatic
2. Adding bidirectional tracking
3. Implementing smart cleanup
4. Optimizing update propagation
5. Adding ownership for safety

---

## Further Reading

- **Lesson 2:** [The Signal Pattern](../lessons/lesson-02-signal-pattern.md)
- **Exercise:** [Implement Observer Pattern](../exercises/02-observer-pattern.md)
- **Source:** [Solid.js signal.ts](https://github.com/solidjs/solid/blob/main/packages/solid/src/reactive/signal.ts)

---

**Understanding the Observer pattern is crucial for mastering reactive programming. This pattern is the beating heart of Solid.js's reactivity system!**
