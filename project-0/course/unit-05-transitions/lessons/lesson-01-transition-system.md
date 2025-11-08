# Lesson 1: The Transition System

## Introduction

Transitions are one of Solid.js's most sophisticated features, enabling **concurrent rendering** where urgent updates (like typing in an input) stay responsive while non-urgent updates (like filtering a large list) happen in the background.

This lesson explores the `TransitionState` structure and how Solid.js orchestrates concurrent updates without blocking the UI.

## The Problem Transitions Solve

### Without Transitions

```javascript
const [filter, setFilter] = createSignal('');
const [data, setData] = createSignal(largeDataSet);

// When user types, BOTH updates happen synchronously
function handleInput(e) {
  setFilter(e.target.value);        // Urgent - must be instant
  setData(filterData(e.target.value)); // Expensive - blocks UI!
}
```

**Result:** UI freezes while filtering happens.

### With Transitions

```javascript
const [filter, setFilter] = createSignal('');
const [data, setData] = createSignal(largeDataSet);
const [isPending, startTransition] = useTransition();

function handleInput(e) {
  setFilter(e.target.value);          // Happens immediately
  startTransition(() => {
    setData(filterData(e.target.value)); // Deferred, non-blocking
  });
}
```

**Result:** Input updates instantly, filtering happens in background.

## TransitionState Interface

From the Solid.js source code:

```typescript
export interface TransitionState {
  sources: Set<SignalState<any>>;       // Signals modified in transition
  effects: Computation<any>[];          // Effects to run after transition
  promises: Set<Promise<any>>;          // Async operations in flight
  disposed: Set<Computation<any>>;      // Computations cleaned up
  queue: Set<Computation<any>>;         // Scheduled updates
  scheduler?: (fn: () => void) => unknown;  // Custom scheduler
  running: boolean;                     // Is transition active?
  done?: Promise<void>;                 // Resolves when complete
  resolve?: () => void;                 // Promise resolver
}
```

### Field Breakdown

#### 1. `sources: Set<SignalState<any>>`

Tracks all signals that have been written during the transition.

```javascript
const [count, setCount] = createSignal(0);
const [name, setName] = createSignal('');

startTransition(() => {
  setCount(c => c + 1);  // count added to sources
  setName('Alice');      // name added to sources
});

// Transition.sources = Set([countSignal, nameSignal])
```

**Why?** Solid needs to know which signals have "transition values" (`tValue`) vs regular values.

#### 2. `effects: Computation<any>[]`

Collects effects that should run after the transition commits.

```javascript
createEffect(() => {
  // Inside transition, this effect is deferred
  console.log('Count:', count());
});

startTransition(() => {
  setCount(5);
  // Effect added to Transition.effects, not run immediately
});

// Later, when transition commits, effect runs
```

**Why?** Effects during transitions must wait until all transition updates stabilize.

#### 3. `promises: Set<Promise<any>>`

Tracks async operations that must complete before transition finishes.

```javascript
startTransition(async () => {
  const data = await fetchData();  // Promise added to set
  setResults(data);
});

// Transition won't complete until promise resolves
```

**Why?** Transitions wait for async operations to maintain consistency.

#### 4. `disposed: Set<Computation<any>>`

Records computations that were cleaned up during the transition.

```javascript
startTransition(() => {
  setShowA(false);  // ComponentA unmounts
  setShowB(true);   // ComponentB mounts
});

// ComponentA's effects added to disposed
// They won't run even if their dependencies change
```

**Why?** Prevents disposed computations from running during transition updates.

#### 5. `queue: Set<Computation<any>>`

When a scheduler is enabled, tracks computations scheduled for async execution.

```javascript
enableScheduling(requestIdleCallback);

startTransition(() => {
  setLargeData(processData());
  // Computations queued for idle time
});
```

**Why?** Allows yielding to browser between computation batches.

#### 6. `running: boolean`

Indicates whether the transition is actively updating.

```javascript
Transition.running = true;   // During update phase
Transition.running = false;  // While waiting for promises
```

**Why?** Different behavior needed during active vs waiting phases.

#### 7. `done: Promise<void>` & `resolve: () => void`

Provides a way to await transition completion.

```javascript
const transition = startTransition(() => {
  setData(newData);
});

await transition;  // Waits for commit
console.log('Transition complete!');
```

## The Double-Buffering Technique

Transitions use **double buffering** - maintaining two values per signal:

```typescript
interface SignalState<T> {
  value: T;      // Current committed value (visible)
  tValue?: T;    // Transition value (computing)
  // ...
}

interface Computation<T> {
  state: ComputationState;   // Current state
  tState?: ComputationState; // Transition state
  // ...
}
```

### How It Works

```javascript
const [count, setCount] = createSignal(0);

// Normal update
setCount(5);
// count.value = 5 (shown immediately)

// Transition update
startTransition(() => {
  setCount(10);
  // count.value = 5 (still shown)
  // count.tValue = 10 (computing in background)
});

// After transition commits:
// count.value = 10 (now shown)
// delete count.tValue
```

### Reading During Transitions

```javascript
function readSignal(signal) {
  const runningTransition = Transition && Transition.running;
  
  if (runningTransition && Transition.sources.has(signal)) {
    return signal.tValue;  // Read transition value
  }
  
  return signal.value;  // Read committed value
}
```

**Key Insight:** Code inside a transition sees transition values; code outside sees committed values.

## Transition Lifecycle

```
1. START
   ├─ Create TransitionState
   ├─ Set running = true
   └─ Execute update function

2. UPDATE PHASE
   ├─ Collect modified sources
   ├─ Update tValues and tStates
   ├─ Defer effects to effects array
   └─ Track promises

3. WAITING PHASE (if promises exist)
   ├─ Set running = false
   ├─ Wait for promises to resolve
   └─ May receive new updates

4. COMMIT PHASE
   ├─ Copy tValues to values
   ├─ Copy tStates to states
   ├─ Clean disposed computations
   ├─ Run deferred effects
   ├─ Resolve done promise
   └─ Set Transition = null
```

## Source Code Walkthrough

Let's trace through the actual Solid.js implementation:

### Starting a Transition

```typescript
export function startTransition(fn: () => unknown): Promise<void> {
  // Already in transition? Just run fn and return existing promise
  if (Transition && Transition.running) {
    fn();
    return Transition.done!;
  }
  
  const l = Listener;
  const o = Owner;
  
  return Promise.resolve().then(() => {
    // Restore context
    Listener = l;
    Owner = o;
    
    let t: TransitionState | undefined;
    
    // Create transition state if scheduler exists
    if (Scheduler || SuspenseContext) {
      t = Transition || (Transition = {
        sources: new Set(),
        effects: [],
        promises: new Set(),
        disposed: new Set(),
        queue: new Set(),
        running: true
      });
      
      t.done || (t.done = new Promise(res => (t!.resolve = res)));
      t.running = true;
    }
    
    // Run updates in transition context
    runUpdates(fn, false);
    
    Listener = Owner = null;
    return t ? t.done : undefined;
  });
}
```

### Writing During Transition

```typescript
export function writeSignal(node: SignalState<any>, value: any) {
  if (!node.comparator || !node.comparator(node.value, value)) {
    if (Transition) {
      const TransitionRunning = Transition.running;
      
      if (TransitionRunning || Transition.sources.has(node)) {
        Transition.sources.add(node);  // Track this source
        node.tValue = value;            // Set transition value
      }
      
      if (!TransitionRunning) {
        node.value = value;  // Also update committed value if not running
      }
    } else {
      node.value = value;  // Normal update
    }
    
    // Notify observers...
  }
}
```

### Committing Transition

From `completeUpdates()`:

```typescript
if (!Transition.promises.size && !Transition.queue.size) {
  // No more pending work - commit!
  const sources = Transition.sources;
  const disposed = Transition.disposed;
  
  Effects!.push.apply(Effects, Transition.effects);
  res = Transition.resolve;
  
  // Update states
  for (const e of Effects!) {
    if ('tState' in e) {
      e.state = e.tState!;
      delete e.tState;
    }
  }
  
  Transition = null;
  
  runUpdates(() => {
    // Clean up disposed
    for (const d of disposed) cleanNode(d);
    
    // Commit all source values
    for (const v of sources) {
      v.value = v.tValue;
      
      if (v.owned) {
        for (let i = 0; i < v.owned.length; i++)
          cleanNode(v.owned[i]);
      }
      
      if (v.tOwned) v.owned = v.tOwned;
      
      delete v.tValue;
      delete v.tOwned;
      v.tState = 0;
    }
    
    setTransPending(false);
  }, false);
  
  if (res) res();  // Resolve done promise
}
```

## Mental Model

Think of transitions like **branching in Git**:

- **Main branch** (`value`): What users see
- **Feature branch** (`tValue`): What's being computed
- **Merge**: Committing the transition

```
main:      A ──────────────────> A'
                                  ↑
                                merge
                                  │
feature:        B ─> C ─> D ──────┘

Timeline:
- User sees A (committed)
- We compute B, C, D in background
- After D completes, merge to main
- User sees A' (which is D)
```

## Why Double Buffering?

### Without Double Buffering

```javascript
setFilter('abc');
setData(filterData('abc'));  // Blocks for 500ms
// UI frozen for 500ms!
```

### With Double Buffering

```javascript
setFilter('abc');  // Updates immediately
startTransition(() => {
  setData(filterData('abc'));  // Computes in background
});
// UI stays responsive!
// Old data shown until new data ready
```

## Key Insights

1. **Transitions are invisible to most code**
   - Regular computations don't know they're in a transition
   - Only the reactivity core handles `tValue` vs `value`

2. **Transitions delay commits, not computation**
   - Work still happens immediately
   - Just doesn't become visible until ready

3. **Multiple updates can batch**
   ```javascript
   startTransition(() => {
     setA(1);
     setB(2);
     setC(3);
   });
   // All committed atomically
   ```

4. **Transitions compose**
   ```javascript
   startTransition(() => {
     startTransition(() => {
       setData(x);  // Same transition context
     });
   });
   ```

5. **Suspense boundaries extend transitions**
   - If suspended during transition, promise tracked
   - Transition waits for suspense to resolve

## Practical Example

```javascript
const [query, setQuery] = createSignal('');
const [results, setResults] = createSignal([]);
const [isPending, startTransition] = useTransition();

// Search handler
function handleSearch(e) {
  const value = e.target.value;
  
  // Update input immediately (urgent)
  setQuery(value);
  
  // Search in background (non-urgent)
  startTransition(() => {
    const filtered = expensiveSearch(value);
    setResults(filtered);
  });
}

return (
  <div>
    <input 
      value={query()} 
      onInput={handleSearch}
    />
    
    {isPending() && <div>Searching...</div>}
    
    <ul classList={{ dimmed: isPending() }}>
      <For each={results()}>
        {item => <li>{item.name}</li>}
      </For>
    </ul>
  </div>
);
```

**What happens:**
1. User types → `query` updates instantly
2. Input shows typed character immediately
3. `startTransition` begins
4. `isPending()` returns `true`
5. Old results stay visible (dimmed)
6. Search runs without blocking
7. New results computed
8. Transition commits
9. New results shown
10. `isPending()` returns `false`

## When to Use Transitions

✅ **Use transitions for:**
- Filtering/sorting large lists
- Complex computations
- Route transitions
- Non-urgent visual updates

❌ **Don't use for:**
- User input (typing, clicking)
- Animations
- Critical updates
- Small, fast operations

## Exercise Preview

In the exercises, you'll:
1. Implement a basic transition system
2. Build double buffering
3. Handle promises in transitions
4. Create the `useTransition` hook

## Summary

- **Transitions** enable concurrent rendering
- **TransitionState** tracks sources, effects, promises
- **Double buffering** (`value` + `tValue`) keeps UI responsive
- **Lifecycle**: Start → Update → Wait → Commit
- Transitions are **transparent** to most code
- Use for **non-urgent** updates

## Next Lesson

**Lesson 2: startTransition Deep Dive** - Implement the full transition mechanism step by step.

## References

- Solid.js source: `packages/solid/src/reactive/signal.ts`
- Lines: 1080-1150 (startTransition)
- Lines: 1300-1380 (completeUpdates)
