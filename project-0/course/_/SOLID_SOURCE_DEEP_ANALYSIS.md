# SolidJS Reactive System - Deep Source Analysis

## Overview

This document provides a comprehensive analysis of the four core files in SolidJS's reactive system:
1. `signal.ts` - Core reactive primitives
2. `array.ts` - Reactive array utilities
3. `observable.ts` - Observable interop
4. `scheduler.ts` - Task scheduling system

---

## 1. signal.ts - The Heart of Reactivity

### Key Data Structures

#### SignalState<T>
```typescript
interface SignalState<T> {
  value: T;                    // Current value
  observers: Computation[] | null;     // Who's watching this signal
  observerSlots: number[] | null;      // Indices for fast removal
  tValue?: T;                  // Transition value (for concurrent mode)
  comparator?: (prev: T, next: T) => boolean;  // Custom equality
  name?: string;               // For debugging
}
```

**Key Insight:** Signals use a slot-based system for efficient observer management. When a signal has 1000 observers and one unsubscribes, Solid doesn't search through the array—it uses the slot index.

#### Computation<Init, Next>
```typescript
interface Computation<Init, Next> extends Owner {
  fn: EffectFunction<Init, Next>;      // The function to execute
  state: ComputationState;              // 0=clean, 1=stale, 2=pending
  tState?: ComputationState;            // Transition state
  sources: SignalState[] | null;        // Dependencies
  sourceSlots: number[] | null;         // Indices in sources' observer lists
  value?: Init;                         // Last computed value
  updatedAt: number | null;             // Timestamp for topological sort
  pure: boolean;                        // True for memos/computeds
  user?: boolean;                       // True for effects (user-facing)
  suspense?: SuspenseContextType;       // For async coordination
}
```

**Key Insight:** Computations are both observers (they watch signals) and observable (other computations can watch memos). They form a directed acyclic graph (DAG).

#### Owner
```typescript
interface Owner {
  owned: Computation[] | null;    // Child computations
  cleanups: (() => void)[] | null; // Cleanup functions
  owner: Owner | null;             // Parent owner
  context: any | null;             // Context object
  sourceMap?: SourceMapValue[];    // For DevTools
  name?: string;                   // For debugging
}
```

**Key Insight:** The Owner hierarchy enables automatic memory management. When you dispose a component, all its effects, memos, and nested components are automatically cleaned up.

### Core Algorithm: Dependency Tracking

#### Reading a Signal (Tracking Phase)
```typescript
function readSignal(this: SignalState<any>) {
  // 1. If this is a memo and it's stale, recompute
  if (this.sources && this.state) {
    if (this.state === STALE) updateComputation(this);
    else lookUpstream(this);
  }
  
  // 2. If there's a listener (running computation), subscribe
  if (Listener) {
    const sSlot = this.observers ? this.observers.length : 0;
    
    // Add this signal to listener's dependencies
    if (!Listener.sources) {
      Listener.sources = [this];
      Listener.sourceSlots = [sSlot];
    } else {
      Listener.sources.push(this);
      Listener.sourceSlots.push(sSlot);
    }
    
    // Add listener to this signal's observers
    if (!this.observers) {
      this.observers = [Listener];
      this.observerSlots = [Listener.sources.length - 1];
    } else {
      this.observers.push(Listener);
      this.observerSlots.push(Listener.sources.length - 1);
    }
  }
  
  // 3. Return the value
  return Transition?.running && Transition.sources.has(this) 
    ? this.tValue 
    : this.value;
}
```

**Key Insight:** The global `Listener` variable is the secret sauce. When a computation runs, it becomes the `Listener`. Any signal read during that time automatically subscribes the computation.

#### Writing a Signal (Notification Phase)
```typescript
function writeSignal(node: SignalState<any>, value: any) {
  let current = node.value;
  
  // 1. Check if value actually changed
  if (!node.comparator || !node.comparator(current, value)) {
    // 2. Update the value
    if (Transition?.running) {
      Transition.sources.add(node);
      node.tValue = value;  // Transition value
    } else {
      node.value = value;
    }
    
    // 3. Mark all observers as stale
    if (node.observers && node.observers.length) {
      runUpdates(() => {
        for (let i = 0; i < node.observers.length; i++) {
          const o = node.observers[i];
          
          // Skip if disposed during transition
          if (Transition?.disposed.has(o)) continue;
          
          // Mark as stale
          o.state = STALE;
          
          // Add to update queue
          if (o.pure) Updates.push(o);  // Memos/computeds first
          else Effects.push(o);          // Effects later
          
          // Recursively mark downstream
          if (o.observers) markDownstream(o);
        }
      }, false);
    }
  }
  
  return value;
}
```

**Key Insight:** Solid uses a two-phase update:
1. **Marking phase:** Mark all affected computations as STALE
2. **Execution phase:** Run Updates (memos) first, then Effects (side effects)

This prevents the "diamond problem" where a computation runs multiple times for one logical change.

### The Update Cycle

```
Signal Change
     ↓
Mark Phase (synchronous)
  → Mark all observers STALE
  → Add to Updates or Effects queue
  → Recursively mark downstream
     ↓
Execution Phase (batched)
  → Sort by timestamp (topological order)
  → Run Updates queue (memos/computeds)
  → Run Effects queue (side effects)
     ↓
Complete
```

### Context Switching Pattern

```typescript
function runComputation(node: Computation, value: any) {
  const owner = Owner;
  const listener = Listener;
  
  // Switch context
  Listener = Owner = node;
  
  try {
    return node.fn(value);
  } finally {
    // Restore context
    Listener = listener;
    Owner = owner;
  }
}
```

**Key Insight:** By switching the global `Listener` and `Owner`, Solid ensures that:
- Any signals read during `node.fn()` automatically subscribe to `node`
- Any effects created during `node.fn()` become children of `node`

---

## 2. array.ts - Efficient List Reconciliation

### The Challenge

Reactively rendering lists is hard because:
- Can't just recreate all items (loses state, expensive)
- Need to figure out what changed (moved, added, removed)
- Must be O(n) for common cases

### Two Strategies

#### mapArray - Key by Value
```typescript
mapArray(list, (value, index) => <Item value={value} />)
```

Use when:
- Items are primitives or have stable identity
- Order changes frequently
- Need index as an accessor

**Algorithm:**
1. Fast path: Empty arrays
2. Fast path: New list (no reconciliation needed)
3. Skip common prefix
4. Skip common suffix
5. Build map of remaining new items
6. Match old items to new positions
7. Create new items where needed

#### indexArray - Key by Index
```typescript
indexArray(list, (value, index) => <Item value={value()} />)
```

Use when:
- Items don't have stable identity
- Mostly appends/pops
- Need value as an accessor

**Algorithm:**
1. Fast paths (same as mapArray)
2. Update existing items (just change signal value)
3. Create/dispose items as length changes

### Reconciliation Deep Dive

```typescript
// Build map of all indices in newItems
newIndices = new Map<T, number>();
newIndicesNext = new Array(newEnd + 1);
for (j = newEnd; j >= start; j--) {
  item = newItems[j];
  i = newIndices.get(item);
  newIndicesNext[j] = i === undefined ? -1 : i;
  newIndices.set(item, j);  // Latest position
}

// Match old items to new positions
for (i = start; i <= end; i++) {
  item = items[i];
  j = newIndices.get(item);
  if (j !== undefined && j !== -1) {
    // Found it! Move to temp array
    temp[j] = mapped[i];
    tempdisposers[j] = disposers[i];
    j = newIndicesNext[j];  // Next occurrence
    newIndices.set(item, j);
  } else {
    // Not found, dispose
    disposers[i]();
  }
}
```

**Key Insight:** The map stores the *rightmost* occurrence of each item, and `newIndicesNext` creates a linked list of all occurrences. This handles duplicate items correctly.

---

## 3. observable.ts - Interoperability

### Purpose

Bridge between Solid's signals and Observable-based libraries (RxJS, etc.).

### Signal → Observable

```typescript
const [count, setCount] = createSignal(0);
const count$ = observable(count);  // Now usable with RxJS
from(count$).pipe(map(x => x * 2)).subscribe(console.log);
```

**Implementation:**
```typescript
function observable<T>(input: Accessor<T>): Observable<T> {
  return {
    subscribe(observer) {
      const handler = typeof observer === "function" 
        ? observer 
        : observer.next?.bind(observer);
      
      const dispose = createRoot(disposer => {
        createEffect(() => {
          const v = input();
          untrack(() => handler(v));  // Call outside tracking
        });
        return disposer;
      });
      
      return { unsubscribe: dispose };
    },
    [Symbol.observable]() { return this; }
  };
}
```

**Key Insight:** Creates an effect that calls the observer whenever the signal changes, but wraps the observer call in `untrack()` to prevent the observer from accidentally subscribing to signals.

### Observable → Signal

```typescript
const count$ = interval(1000);
const count = from(count$);  // Now a signal
```

**Implementation:**
```typescript
function from<T>(producer: Producer<T>, initialValue?: T): Accessor<T> {
  const [s, set] = createSignal(initialValue, { equals: false });
  
  if ("subscribe" in producer) {
    const unsub = producer.subscribe(v => set(() => v));
    onCleanup(() => 
      "unsubscribe" in unsub ? unsub.unsubscribe() : unsub()
    );
  } else {
    const clean = producer(set);
    onCleanup(clean);
  }
  
  return s;
}
```

**Key Insight:** Uses `equals: false` because the signal is just a proxy—equality checking should happen in the observable library, not Solid.

---

## 4. scheduler.ts - Browser Integration

### The Problem

Running effects immediately can:
- Block the main thread
- Cause redundant work (multiple updates in one frame)
- Starve browser tasks (input, rendering)

### The Solution: MessageChannel Scheduler

```typescript
const channel = new MessageChannel();
const port = channel.port2;

scheduleCallback = () => port.postMessage(null);

channel.port1.onmessage = () => {
  const currentTime = performance.now();
  deadline = currentTime + yieldInterval;  // 5ms by default
  
  const hasMoreWork = flushWork(currentTime);
  if (hasMoreWork) port.postMessage(null);  // Schedule again
};
```

**Why MessageChannel?**
- `setTimeout(fn, 0)` is clamped to 4ms after 5 nested calls
- `requestAnimationFrame` is too slow (only runs at display refresh rate)
- `requestIdleCallback` may never run if the page is busy
- MessageChannel posts messages that run immediately after current task

### Yielding to the Browser

```typescript
function workLoop(initialTime: number) {
  let currentTime = initialTime;
  
  while (currentTask !== null) {
    // Check if we should yield
    if (currentTask.expirationTime > currentTime && shouldYieldToHost()) {
      break;  // Let browser do its thing
    }
    
    // Run the task
    const callback = currentTask.fn;
    if (callback) {
      callback(currentTask.expirationTime <= currentTime);  // didTimeout
    }
    
    taskQueue.shift();
    currentTask = taskQueue[0] || null;
    currentTime = performance.now();
  }
  
  return currentTask !== null;  // More work?
}
```

### Smart Yielding with isInputPending

```typescript
shouldYieldToHost = () => {
  const currentTime = performance.now();
  
  if (currentTime >= deadline) {  // 5ms elapsed
    if (navigator.scheduling?.isInputPending?.()) {
      return true;  // User is trying to interact!
    }
    
    // Only yield if we've really gone too long
    return currentTime >= maxDeadline;  // 300ms
  }
  
  return false;  // Still have time
};
```

**Key Insight:** Modern browsers support `isInputPending()`, which tells us if the user has pressed a key or moved the mouse. This lets us be more aggressive (300ms chunks) when the user isn't interacting, but yield quickly (5ms) when they are.

### Priority Queue

```typescript
function enqueue(taskQueue: Task[], task: Task) {
  // Binary search to find insertion point
  let m = 0, n = taskQueue.length - 1;
  
  while (m <= n) {
    const k = (n + m) >> 1;  // Midpoint
    const cmp = task.expirationTime - taskQueue[k].expirationTime;
    
    if (cmp > 0) m = k + 1;
    else if (cmp < 0) n = k - 1;
    else return k;
  }
  
  taskQueue.splice(m, 0, task);
}
```

**Key Insight:** Tasks are sorted by expiration time, so urgent tasks run first. The insertion uses binary search for O(log n) complexity.

---

## Integration: How It All Works Together

### Example: Button Click Updates Counter

```typescript
const [count, setCount] = createSignal(0);
const doubled = createMemo(() => count() * 2);
createEffect(() => console.log('Count:', count(), 'Doubled:', doubled()));

// User clicks button
setCount(c => c + 1);
```

**Step-by-step:**

1. **setCount called**
   - `writeSignal(countSignal, 1)`
   - Comparator check: `0 !== 1` ✓

2. **Mark Phase**
   - Mark `doubled` memo as STALE
   - Add `doubled` to `Updates` queue
   - Mark `effect` as STALE
   - Add `effect` to `Effects` queue

3. **Execution Phase**
   - Process `Updates` queue:
     - Run `doubled` memo
     - It reads `count()`, gets `1`
     - Computes `1 * 2 = 2`
     - Comparator check: `0 !== 2` ✓
     - Marks own observers (the effect) as STALE
   
   - Process `Effects` queue:
     - Run effect
     - Reads `count()` → 1
     - Reads `doubled()` → 2
     - Logs: "Count: 1 Doubled: 2"

4. **Cleanup**
   - Clear queues
   - Call DevHooks.afterUpdate()
   - Done!

**Total reads:** 3 (count twice, doubled once)
**Total computations:** 2 (memo once, effect once)
**User-visible updates:** 1 (one console.log)

### Why This is Fast

1. **No virtual DOM diffing**: Changes propagate directly to computations that care
2. **No component re-renders**: Only effects run, components aren't involved
3. **Optimal work**: Each computation runs exactly once per logical change
4. **Topological sorting**: Dependencies always compute before dependents
5. **Batching**: Multiple signal changes in one synchronous block = one update cycle

---

## Design Principles Learned

### 1. Fine-Grained Reactivity
- Track at the signal level, not component level
- Only re-run computations that depend on changed signals
- No unnecessary work

### 2. Explicit Ownership
- Every computation has an owner
- Disposal is automatic via ownership tree
- No memory leaks from forgotten cleanup

### 3. Two-Phase Updates
- Mark phase: Figure out what needs updating
- Execute phase: Do the updates in topological order
- Prevents glitches and redundant work

### 4. Global Context
- `Listener` and `Owner` are global variables
- Context switching enables automatic tracking
- Simple and fast

### 5. Slot-Based Bookkeeping
- O(1) observer subscription/unsubscription
- No array scanning
- Scales to large graphs

### 6. Browser-Friendly Scheduling
- Use MessageChannel for immediate scheduling
- Yield to browser regularly
- Respect input events

### 7. Transition Support
- Parallel state for concurrent updates
- Graceful degradation if transitions interrupted
- Non-blocking updates

---

## Common Patterns

### Pattern 1: Memo for Expensive Computations
```typescript
const data = createMemo(() => {
  return expensiveOperation(input());
});
```

### Pattern 2: Effect for Side Effects
```typescript
createEffect(() => {
  document.title = `Count: ${count()}`;
});
```

### Pattern 3: Cleanup for Resources
```typescript
createEffect(() => {
  const ws = new WebSocket(url());
  onCleanup(() => ws.close());
});
```

### Pattern 4: Untrack for One-Time Reads
```typescript
createEffect(() => {
  const id = untrack(() => props.id);  // Read once
  const data = fetchData(id);          // Track this
  // ...
});
```

### Pattern 5: Batch for Multiple Updates
```typescript
batch(() => {
  setCount(1);
  setName("Alice");
  setEmail("alice@example.com");
});
// Only one update cycle!
```

---

## Performance Characteristics

### Time Complexity
- Signal read: **O(1)**
- Signal write: **O(observers)**
- Computation run: **O(dependencies + descendants)**
- Subscribe/unsubscribe: **O(1)** (thanks to slots)
- Array reconciliation: **O(n)** for common cases, **O(n log n)** worst case

### Space Complexity
- Per signal: **O(observers)**
- Per computation: **O(dependencies)**
- Update queue: **O(changed computations)**

### Comparison to Other Frameworks
- **React:** O(component tree size) per update
- **Vue 3:** O(changed templates) per update
- **Solid:** O(changed signals + dependent computations) per update

Solid is typically 2-10x faster than React for equivalent updates.

---

## Advanced Topics to Explore

### 1. Transitions
- Concurrent mode
- Non-blocking updates
- Suspense coordination

### 2. Resources
- Async data fetching
- Loading states
- Error handling

### 3. Server-Side Rendering
- Serialization of signals
- Hydration of reactive graph
- Context preservation

### 4. DevTools Integration
- Source maps for debugging
- Component tree visualization
- Signal tracking

---

## Conclusion

SolidJS's reactive system is a masterclass in:
- **Simplicity:** Global context variables, straightforward algorithms
- **Performance:** O(1) operations, minimal overhead, smart batching
- **Correctness:** No glitches, proper topological ordering, automatic cleanup
- **Integration:** Works with browser scheduling, observables, async primitives

By understanding these four files deeply, you understand the heart of modern fine-grained reactivity.
