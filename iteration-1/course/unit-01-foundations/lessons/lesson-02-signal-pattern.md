# Lesson 2: The Signal Pattern

## Table of Contents
1. [Understanding Signals](#understanding-signals)
2. [The Observer Pattern Foundation](#the-observer-pattern-foundation)
3. [Dependency Tracking Fundamentals](#dependency-tracking-fundamentals)
4. [Signal Lifecycle](#signal-lifecycle)
5. [Solid.js Signal Architecture](#solidjs-signal-architecture)
6. [Memory and Performance](#memory-and-performance)
7. [Summary](#summary)

---

## Understanding Signals

### What is a Signal?

A **signal** is the fundamental building block of reactive programming. It's a container for a value that:

1. **Stores** a single value
2. **Tracks** who depends on it (observers)
3. **Notifies** observers when the value changes
4. **Provides** reactive read/write access

Think of a signal as a "smart variable" that knows when it's being used and can alert dependents when it changes.

### Anatomy of a Signal

```javascript
// Creating a signal
const [count, setCount] = createSignal(0);

// Reading (reactive - tracks dependencies)
console.log(count()); // 0

// Writing (triggers updates)
setCount(5); // All observers notified

// Functional update
setCount(prev => prev + 1); // 6
```

### Signal vs Regular Variable

**Regular Variable:**
```javascript
let count = 0;

// Assignment
count = 5;

// Reading
console.log(count); // 5

// No automatic updates
function display() {
  console.log(count);
}

count = 10;
display(); // Must manually call
```

**Signal:**
```javascript
const [count, setCount] = createSignal(0);

// Reactive effect automatically reruns
createEffect(() => {
  console.log(count()); // Logs: 0
});

setCount(10); // Automatically logs: 10
```

### The Two-Part API

Signals return a tuple `[getter, setter]`:

```javascript
const [value, setValue] = createSignal(initialValue);
```

**Getter (Accessor):**
- Function that returns current value
- Tracks dependency when called
- Pure (no side effects)

**Setter:**
- Function that updates the value
- Triggers observer notifications
- Can accept value or updater function

---

## The Observer Pattern Foundation

### Classic Observer Pattern

The Observer pattern is a behavioral design pattern where:
- **Subject:** Object being observed
- **Observers:** Objects interested in changes
- **Subscribe:** Observers register interest
- **Notify:** Subject alerts observers of changes

```javascript
class Subject {
  constructor() {
    this.observers = [];
  }
  
  subscribe(observer) {
    this.observers.push(observer);
  }
  
  unsubscribe(observer) {
    this.observers = this.observers.filter(o => o !== observer);
  }
  
  notify(data) {
    this.observers.forEach(observer => observer.update(data));
  }
}

class Observer {
  update(data) {
    console.log('Received:', data);
  }
}

// Usage
const subject = new Subject();
const observer1 = new Observer();
const observer2 = new Observer();

subject.subscribe(observer1);
subject.subscribe(observer2);

subject.notify('Hello'); 
// Both observers receive: "Hello"
```

### Observer Pattern in Signals

Signals implement the Observer pattern:

```javascript
// Simplified signal implementation
function createSimpleSignal(initialValue) {
  let value = initialValue;
  const subscribers = new Set();
  
  // Getter (reactive read)
  function read() {
    // If there's a current listener, subscribe it
    if (currentListener) {
      subscribers.add(currentListener);
    }
    return value;
  }
  
  // Setter (notifies observers)
  function write(newValue) {
    value = newValue;
    // Notify all subscribers
    subscribers.forEach(fn => fn());
  }
  
  return [read, write];
}
```

### Automatic Subscription

Unlike classic Observer pattern where you manually subscribe, signals automatically track dependencies:

```javascript
// Manual subscription (Classic Observer)
const subject = new Subject();
const observer = new Observer();
subject.subscribe(observer); // Manual

// Automatic subscription (Signals)
const [count] = createSignal(0);
createEffect(() => {
  console.log(count()); // Automatically subscribes!
});
```

---

## Dependency Tracking Fundamentals

### The Tracking Context

Solid.js uses a **tracking context** to automatically register dependencies:

```javascript
// Global tracking context
let currentListener = null;

// When an effect runs, it becomes the current listener
function createEffect(fn) {
  const effect = () => {
    currentListener = effect;
    fn();
    currentListener = null;
  };
  effect();
}

// When a signal is read, it registers the current listener
function createSignal(initialValue) {
  let value = initialValue;
  const subscribers = new Set();
  
  const read = () => {
    if (currentListener) {
      subscribers.add(currentListener);
    }
    return value;
  };
  
  const write = (newValue) => {
    value = newValue;
    subscribers.forEach(fn => fn());
  };
  
  return [read, write];
}
```

### How Tracking Works

Let's trace through an example:

```javascript
const [count, setCount] = createSignal(0);
const [doubled, setDoubled] = createSignal(0);

createEffect(() => {
  setDoubled(count() * 2);
});
```

**Step-by-step execution:**

1. **Effect Creation**
   ```javascript
   currentListener = effect;
   ```

2. **Effect Runs**
   ```javascript
   setDoubled(count() * 2);
   ```

3. **count() Called**
   - Reads value: 0
   - Sees currentListener is effect
   - Adds effect to subscribers
   - Returns 0

4. **Expression Evaluates**
   ```javascript
   0 * 2 = 0
   ```

5. **setDoubled Called**
   - Updates doubled to 0

6. **Effect Completes**
   ```javascript
   currentListener = null;
   ```

**Result:** Effect is now subscribed to count!

### Dependency Graph Example

```javascript
const [firstName, setFirstName] = createSignal("John");
const [lastName, setLastName] = createSignal("Doe");

const fullName = createMemo(() => 
  `${firstName()} ${lastName()}`
);

createEffect(() => {
  console.log(`Hello, ${fullName()}!`);
});
```

**Dependency Graph:**
```
firstName ────┐
              ↓
           fullName ──→ effect
              ↑
lastName ─────┘
```

**Tracking:**
- `fullName` depends on `firstName` and `lastName`
- `effect` depends on `fullName`
- Transitive: `effect` indirectly depends on both name signals

### Multiple Dependencies

An effect can depend on multiple signals:

```javascript
const [x, setX] = createSignal(0);
const [y, setY] = createSignal(0);
const [z, setZ] = createSignal(0);

createEffect(() => {
  const sum = x() + y() + z();
  console.log('Sum:', sum);
});
```

**Dependency Graph:**
```
x ──┐
    ↓
y ──→ effect
    ↑
z ──┘
```

Changing any signal triggers the effect.

### Conditional Dependencies

Dependencies can be dynamic:

```javascript
const [useA, setUseA] = createSignal(true);
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);

createEffect(() => {
  const value = useA() ? a() : b();
  console.log('Value:', value);
});
```

**Initially:**
```
useA ──┐
       ↓
a  ────→ effect
```

**After `setUseA(false)`:**
```
useA ──┐
       ↓
b  ────→ effect
```

Dependencies track only what's actually accessed!

---

## Signal Lifecycle

### Creation

```javascript
const [signal, setSignal] = createSignal(initialValue, options);
```

**During creation:**
1. Initialize value
2. Create empty observers list
3. Set up getter/setter functions
4. Apply options (equals, name, etc.)

### Reading (Tracking)

```javascript
const value = signal();
```

**During read:**
1. Check if there's a current listener
2. If yes, add listener to observers
3. Return current value

### Writing (Notification)

```javascript
setSignal(newValue);
```

**During write:**
1. Compare old and new values
2. If different (per comparator):
   - Update stored value
   - Mark all observers as stale
   - Schedule observer updates

### Cleanup

```javascript
onCleanup(() => {
  // Cleanup code
});
```

**During disposal:**
1. Remove from owner's owned list
2. Run cleanup functions
3. Unsubscribe from all dependencies
4. Remove all observers
5. Free memory

---

## Solid.js Signal Architecture

### SignalState Interface

From Solid.js source code:

```typescript
export interface SignalState<T> {
  value: T;                          // Current value
  observers: Computation<any>[] | null;     // Who depends on this
  observerSlots: number[] | null;           // Bidirectional indices
  tValue?: T;                        // Transition value
  comparator?: (prev: T, next: T) => boolean; // Equality check
  name?: string;                     // Debug name
}
```

### Bidirectional Tracking

Solid uses a sophisticated bidirectional tracking system:

**Signal → Observers (Forward)**
```javascript
signal.observers = [effect1, effect2, effect3];
signal.observerSlots = [0, 1, 0]; // Index in each observer's sources
```

**Observer → Sources (Backward)**
```javascript
effect.sources = [signalA, signalB];
effect.sourceSlots = [2, 0]; // Index in each signal's observers
```

This allows efficient:
- **Add:** O(1) append to arrays
- **Remove:** O(1) swap with last element
- **Update:** Know exactly what changed

### Example: Bidirectional Links

```javascript
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);

createEffect(() => {
  console.log(a() + b());
});
```

**After setup:**

```javascript
// Signal A's state
a.observers = [effect];
a.observerSlots = [0]; // effect.sources[0] = a

// Signal B's state
b.observers = [effect];
b.observerSlots = [1]; // effect.sources[1] = b

// Effect's state
effect.sources = [a, b];
effect.sourceSlots = [0, 0]; // a.observers[0], b.observers[0]
```

### The Owner Concept

Every signal and computation has an **owner** (the reactive scope that created it):

```typescript
export interface Owner {
  owned: Computation<any>[] | null;  // Child computations
  cleanups: (() => void)[] | null;   // Cleanup functions
  owner: Owner | null;               // Parent owner
  context: any | null;               // Context data
}
```

**Owner hierarchy:**
```
Root
 ├─ Effect 1
 │   ├─ Memo 1
 │   └─ Effect 2
 └─ Effect 3
     └─ Memo 2
```

**Benefits:**
- Automatic cleanup on parent disposal
- Context propagation
- Memory leak prevention

### Comparison Function

Signals can have custom equality comparators:

```javascript
// Default: Reference equality
const [obj, setObj] = createSignal({ x: 1 });

// Custom: Deep equality
const [state, setState] = createSignal(
  { x: 1, y: 2 },
  { equals: (a, b) => a.x === b.x && a.y === b.y }
);

setState({ x: 1, y: 2 }); // No update (deep equal)

// Disable comparison
const [forced, setForced] = createSignal(0, { equals: false });
setForced(0); // Always triggers update
```

---

## Memory and Performance

### Memory Structure

**Per Signal:**
- Value: 8 bytes (pointer)
- Observers array: 24 bytes + (8 bytes × count)
- ObserverSlots array: 24 bytes + (4 bytes × count)
- **Total base:** ~56 bytes + subscriber data

**Example:**
- 1000 signals with 5 observers each
- Memory: ~1000 × (56 + 60) = ~116 KB

### Performance Characteristics

**Read (Get):**
- Time: O(1)
- Work: Check listener, add to observers

**Write (Set):**
- Time: O(n) where n = number of observers
- Work: Compare values, notify observers

**Subscribe:**
- Time: O(1)
- Work: Append to arrays

**Unsubscribe:**
- Time: O(1)
- Work: Swap with last element and pop

### Optimization: Batching

```javascript
// Without batching
setA(1); // Triggers effects
setB(2); // Triggers effects
setC(3); // Triggers effects

// With batching
batch(() => {
  setA(1);
  setB(2);
  setC(3);
  // All effects run once after batch
});
```

### Optimization: Untracking

```javascript
createEffect(() => {
  const x = signal();
  
  // Don't track this read
  const y = untrack(() => anotherSignal());
  
  console.log(x + y);
});

// Effect only reruns when signal changes
// Not when anotherSignal changes
```

### Memory Leaks Prevention

**Problem:**
```javascript
const [count, setCount] = createSignal(0);

// Creates subscription but never cleans up
const interval = setInterval(() => {
  console.log(count());
}, 1000);

// Memory leak! Effect keeps running forever
```

**Solution:**
```javascript
createRoot(dispose => {
  const [count, setCount] = createSignal(0);
  
  createEffect(() => {
    const interval = setInterval(() => {
      console.log(count());
    }, 1000);
    
    onCleanup(() => clearInterval(interval));
  });
  
  // Later: cleanup
  dispose();
});
```

---

## Summary

### Key Concepts

1. **Signals are Smart Containers**
   - Store values reactively
   - Track who depends on them
   - Notify on changes

2. **Observer Pattern Foundation**
   - Subjects (signals) maintain observers
   - Automatic subscription via tracking context
   - Efficient notification system

3. **Dependency Tracking**
   - Automatic via current listener
   - Dynamic based on execution
   - Bidirectional for efficiency

4. **Lifecycle Management**
   - Creation → Reading → Writing → Cleanup
   - Owner hierarchy for automatic cleanup
   - Memory management critical

5. **Solid.js Architecture**
   - SignalState interface
   - Bidirectional tracking
   - Owner concept
   - Custom comparators

### What You've Learned

- ✅ Signal anatomy and purpose
- ✅ Observer pattern implementation
- ✅ Automatic dependency tracking
- ✅ Signal lifecycle stages
- ✅ Solid.js internal architecture
- ✅ Memory and performance considerations

### Design Principles

1. **Simplicity:** Signals are just getters/setters
2. **Automatic:** Dependency tracking is implicit
3. **Efficient:** O(1) operations where possible
4. **Safe:** Automatic cleanup prevents leaks
5. **Flexible:** Custom comparators and options

### Common Patterns

**State Signal:**
```javascript
const [count, setCount] = createSignal(0);
```

**Derived Computation:**
```javascript
const doubled = createMemo(() => count() * 2);
```

**Side Effect:**
```javascript
createEffect(() => {
  console.log('Count:', count());
});
```

**Cleanup:**
```javascript
createEffect(() => {
  const timer = setInterval(/* ... */);
  onCleanup(() => clearInterval(timer));
});
```

### Next Steps

Now you understand signals conceptually. In Lesson 3, we'll:
1. Implement a signal system from scratch
2. Handle edge cases
3. Add optimization features
4. Test our implementation

### Questions to Ponder

1. How would you implement untracking?
2. What could cause memory leaks in signals?
3. When should you use custom comparators?
4. How could you visualize signal dependencies?

---

## Further Reading

- **Next Lesson:** [Building Your First Signal](./lesson-03-building-first-signal.md)
- **Deep Dive:** [Observer Pattern](../notes/observer-pattern.md)
- **Source Code:** Solid.js signal.ts (lines 220-260)
- **Exercise:** [Implement Basic Signal](../exercises/01-basic-signal.md)

---

**Ready to build?** In the next lesson, we'll implement our own signal system from scratch, bringing all these concepts to life!
