# Reactivity Glossary

A comprehensive reference of terms used throughout the Solid.js Reactive System course.

---

## Core Concepts

### Reactivity
The automatic propagation of changes through a system. When a value changes, all dependent computations automatically update without manual intervention.

**Example:**
```javascript
const [count, setCount] = createSignal(0);
const doubled = createMemo(() => count() * 2);
// When count changes, doubled automatically updates
```

### Signal
A reactive primitive that stores a value and notifies observers when it changes. The fundamental building block of reactive programming.

**Characteristics:**
- Stores a single value
- Tracks dependencies automatically
- Notifies observers on change
- Provides getter/setter API

**Example:**
```javascript
const [count, setCount] = createSignal(0);
console.log(count()); // 0 (getter)
setCount(5);          // setter
```

### Computation
A reactive function that automatically re-executes when its dependencies change. Includes effects, memos, and components.

**Types:**
- **Pure:** Can have observers (memos)
- **Impure:** Side effects (effects, render effects)

---

## Tracking and Dependencies

### Dependency
A relationship where one computation depends on a signal or another computation. When the dependency changes, the dependent computation updates.

**Example:**
```javascript
const [a, setA] = createSignal(1);
const b = createMemo(() => a() * 2); // b depends on a
```

### Dependency Tracking
The automatic process of recording which computations depend on which signals during execution.

**How it works:**
1. Computation runs
2. Becomes current listener
3. Signal reads register the listener
4. Dependency relationship established

### Tracking Context
The global state that tracks which computation is currently executing, enabling automatic dependency collection.

**Implementation:**
```javascript
let currentListener = null; // The tracking context
```

### Observer
A computation that subscribes to signals and re-executes when they change.

**Example:**
```javascript
createEffect(() => {
  console.log(count()); // This effect observes count
});
```

### Observable (Subject)
A signal or computation that can be observed. It maintains a list of its observers.

---

## Reactive Primitives

### createSignal
Creates a reactive state value with getter and setter functions.

**Signature:**
```typescript
function createSignal<T>(
  initialValue: T,
  options?: { equals?: (prev: T, next: T) => boolean }
): [get: () => T, set: (value: T | ((prev: T) => T)) => void]
```

**Usage:**
```javascript
const [count, setCount] = createSignal(0);
```

### createEffect
Creates a reactive computation that runs immediately and re-runs when dependencies change.

**Signature:**
```typescript
function createEffect(fn: () => void): () => void
```

**Usage:**
```javascript
createEffect(() => {
  console.log('Count:', count());
});
```

**Timing:** Runs after rendering (asynchronous)

### createMemo
Creates a cached computed value that only recomputes when dependencies change.

**Signature:**
```typescript
function createMemo<T>(fn: () => T): () => T
```

**Usage:**
```javascript
const doubled = createMemo(() => count() * 2);
```

**Characteristics:**
- Lazy evaluation
- Cached result
- Pure computation

### createComputed
Like createEffect but runs synchronously during the reactive computation phase.

**Usage:**
```javascript
createComputed(() => {
  // Runs before render
});
```

**Timing:** Runs immediately (synchronous)

### createRenderEffect
Runs during the render phase as DOM elements are created and updated.

**Use case:** Direct DOM manipulation

---

## Advanced Concepts

### Batching
Grouping multiple signal updates to run effects only once after all updates complete.

**Without batching:**
```javascript
setA(1); // Triggers effects
setB(2); // Triggers effects again
```

**With batching:**
```javascript
batch(() => {
  setA(1);
  setB(2);
  // Effects run once after batch
});
```

### Untracking
Reading a signal without establishing a dependency relationship.

**Usage:**
```javascript
createEffect(() => {
  const tracked = signal1();
  const untracked = untrack(() => signal2());
  // Only signal1 is a dependency
});
```

### Owner
The reactive scope that created a computation. Owners form a hierarchy and enable automatic cleanup.

**Structure:**
```
Root Owner
  ├─ Effect 1
  │   └─ Memo 1
  └─ Effect 2
```

### Cleanup
Functions that run when a computation re-executes or is disposed, preventing memory leaks.

**Usage:**
```javascript
createEffect(() => {
  const timer = setInterval(() => {}, 1000);
  onCleanup(() => clearInterval(timer));
});
```

---

## Execution Model

### Push Model
A reactive model where changes immediately propagate to dependents (proactive).

**Flow:**
```
Signal changes → Notify observers → Effects run
```

### Pull Model
A reactive model where values are computed only when requested (lazy).

**Flow:**
```
Request value → Check if stale → Recompute if needed
```

### Hybrid Model
Solid.js's approach: push notifications with pull execution.

**Flow:**
```
Signal changes → Mark observers stale → Compute when accessed
```

### Fine-Grained Reactivity
A reactive model where individual values update independently, minimizing unnecessary work.

**Contrast with coarse-grained:**
- **Coarse:** Component-level updates (React)
- **Fine:** Value-level updates (Solid)

---

## State Management

### State
The current values in your reactive system. Can be signals, memos, or derived computations.

**Types:**
- **Source state:** Signals (writable)
- **Derived state:** Memos (computed)

### Immutability
The practice of not modifying state directly but creating new values.

**Example:**
```javascript
// Mutable (avoid)
const obj = signal({ x: 1 });
obj().x = 2; // Doesn't trigger reactivity

// Immutable (correct)
setObj({ ...obj(), x: 2 }); // Triggers reactivity
```

### Reconciliation
The process of determining what changed and updating only those parts. Not needed in fine-grained systems!

---

## Patterns and Best Practices

### Accessor
A function that returns a value, typically a signal getter or memo.

**Usage:**
```javascript
const count = createSignal(0)[0]; // accessor
```

### Setter
A function that updates a value, typically from createSignal.

**Usage:**
```javascript
const setCount = createSignal(0)[1]; // setter
```

### Derived State
State computed from other state using createMemo.

**Example:**
```javascript
const fullName = createMemo(() => 
  `${firstName()} ${lastName()}`
);
```

### Effect Cleanup
The practice of cleaning up resources when effects re-run or dispose.

**Pattern:**
```javascript
createEffect(() => {
  const resource = acquire();
  onCleanup(() => resource.release());
});
```

---

## Performance Terms

### Stale
A computation whose dependencies have changed and needs re-execution.

**State values:**
- `0`: Fresh
- `1`: Stale
- `2`: Pending

### Memoization
Caching the result of a computation to avoid redundant calculations.

### Batching
See [Batching](#batching) above.

### Scheduling
Coordinating when effects run to optimize performance.

---

## Solid.js Specific

### SignalState
Internal interface representing a signal's state in Solid.js.

**Structure:**
```typescript
interface SignalState<T> {
  value: T;
  observers: Computation[] | null;
  observerSlots: number[] | null;
  comparator?: (prev: T, next: T) => boolean;
}
```

### Computation
Internal interface for reactive computations.

**Structure:**
```typescript
interface Computation<T> {
  fn: () => T;
  state: 0 | 1 | 2; // Fresh, Stale, Pending
  sources: SignalState[] | null;
  sourceSlots: number[] | null;
  owned: Computation[] | null;
  owner: Owner | null;
}
```

### Transition
Concurrent update mechanism for smooth UI updates.

**Usage:**
```javascript
startTransition(() => {
  // Non-urgent updates
});
```

### Resource
Reactive wrapper for async data loading.

**States:**
- unresolved
- pending
- ready
- refreshing
- errored

---

## Common Pitfalls

### Memory Leak
When resources are not properly cleaned up, causing memory to grow unbounded.

**Cause:**
```javascript
createEffect(() => {
  setInterval(() => {}, 1000);
  // Missing onCleanup!
});
```

### Infinite Loop
When an effect modifies its own dependency without guards.

**Cause:**
```javascript
createEffect(() => {
  setCount(count() + 1); // Infinite!
});
```

**Fix:**
```javascript
createEffect(() => {
  if (count() < 10) {
    setCount(count() + 1);
  }
});
```

### Stale Closure
Capturing old values in closures instead of reading signals.

**Problem:**
```javascript
const val = count(); // Captured value
setTimeout(() => console.log(val), 1000);
```

**Fix:**
```javascript
setTimeout(() => console.log(count()), 1000);
```

---

## Related Patterns

### Observer Pattern
Design pattern where observers subscribe to subjects for notifications.

### Publish-Subscribe
Pattern where publishers emit events and subscribers receive them.

### Functional Reactive Programming (FRP)
Programming paradigm for reactive dataflow and propagation of change.

### Data Binding
Synchronizing data between model and view automatically.

---

## Comparison with Other Systems

### React
- **Model:** Coarse-grained (components)
- **Update:** Virtual DOM reconciliation
- **Dependencies:** Manual (useEffect deps)

### Vue
- **Model:** Fine-grained (refs)
- **Update:** Dependency tracking
- **Dependencies:** Automatic (ref access)

### Solid
- **Model:** Fine-grained (signals)
- **Update:** Direct DOM updates
- **Dependencies:** Automatic (signal calls)

### Svelte
- **Model:** Compiler-based
- **Update:** Compiled update code
- **Dependencies:** Static analysis

---

## Further Reading

For deeper understanding of any term:

1. Search in course lessons
2. Check Solid.js documentation
3. Review source code
4. Explore exercises

---

## Quick Reference

### Signal Lifecycle
```
Create → Read → Write → Cleanup
```

### Effect Lifecycle
```
Create → Execute → Track → Re-execute → Dispose
```

### Dependency Flow
```
Signal → Computation → Effect → DOM
```

### Update Propagation
```
Write Signal → Mark Stale → Schedule → Execute
```

---

**Tip:** Bookmark this page for quick reference throughout the course!
