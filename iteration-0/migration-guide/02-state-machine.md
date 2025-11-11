# Step 2: State Machine Implementation

## 🎓 What We're Building

In this step, we'll implement a **state machine** to track computation states. This is one of Solid.js's key optimizations that your current implementation lacks.

## 🤔 Why a State Machine?

### Your Current Approach

```javascript
// No explicit state tracking
const effect = {
  execute: () => {
    /* ... */
  },
  subscriptions: new Set(),
  cleanups: [],
};

// Effects just run whenever signaled
if (currentBatchEffects !== null) {
  currentBatchEffects.add(effect); // Will run
}
```

**Problems:**

- ❌ No way to know if computation is up-to-date
- ❌ Can't skip unnecessary updates
- ❌ No distinction between "stale" and "pending"
- ❌ Can't optimize based on state

### Solid.js's State Machine

```typescript
const computation = {
  state: CLEAN, // or STALE or PENDING
  // ...
};

// Smart decisions based on state
if (computation.state === CLEAN) {
  // Skip! Already up-to-date
  return;
}

if (computation.state === STALE) {
  // Update needed
  updateComputation(computation);
}

if (computation.state === PENDING) {
  // Dependency is stale, check upstream
  lookUpstream(computation);
}
```

**Benefits:**

- ✅ Skip unnecessary computations
- ✅ Smarter update propagation
- ✅ Better performance
- ✅ Foundation for lazy evaluation

## 📊 State Machine Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    State Lifecycle                        │
└──────────────────────────────────────────────────────────┘

    Created
       ↓
   ┌──────┐
   │STALE │ ← computation needs to run
   └──────┘
       ↓
    Execute
       ↓
   ┌──────┐
   │CLEAN │ ← computation is up-to-date
   └──────┘
       ↓
  Dependency changes
       ↓
   ┌──────────┐
   │  STALE   │ ← needs update
   └──────────┘
       ↓
  Another dependency changes
       ↓
   ┌──────────┐
   │ PENDING  │ ← waiting for dependency to update
   └──────────┘
       ↓
  Dependency updates
       ↓
   ┌──────────┐
   │  STALE   │ ← ready to update
   └──────────┘
       ↓
    Execute
       ↓
   ┌──────┐
   │CLEAN │
   └──────┘
```

### State Transitions Explained

**CLEAN (0)**: "I'm up-to-date"

```typescript
// Computation has run with current dependency values
// No need to re-run
if (computation.state === CLEAN) {
  return computation.value; // Use cached value
}
```

**STALE (1)**: "I need to update"

```typescript
// A dependency changed
// Need to re-execute the computation
if (computation.state === STALE) {
  updateComputation(computation);
}
```

**PENDING (2)**: "I'm waiting"

```typescript
// A dependency is STALE but hasn't updated yet
// Need to check if it will affect me
if (computation.state === PENDING) {
  lookUpstream(computation); // Check dependencies
}
```

## 💻 Implementation

### 2.1 Create State Management Module

Create `src/reactive/state.ts`:

```typescript
import type { Computation, ComputationState, SignalState, Memo } from "./types";
import { CLEAN, STALE, PENDING } from "./types";

/**
 * Global execution counter.
 * Incremented on each update cycle to track staleness.
 *
 * Why? If computation.updatedAt < ExecCount, it's stale.
 */
export let ExecCount = 0;

/**
 * Increments the execution counter.
 * Call this at the start of each update cycle.
 */
export function incrementExecCount(): void {
  ExecCount++;
}

/**
 * Marks a computation as STALE.
 * This means a dependency changed and it needs to re-run.
 *
 * @param node - The computation to mark
 * @param state - The new state (default: STALE)
 */
export function markStale<T>(
  node: Computation<T>,
  state: ComputationState = STALE
): void {
  // Don't mark if already stale or more urgent
  if (node.state !== CLEAN) return;

  node.state = state;

  // If this is a memo with observers, mark them too
  if ((node as Memo<T>).observers) {
    markDownstream(node as Memo<T>);
  }
}

/**
 * Marks all downstream computations as needing update.
 * This is called when a signal or memo changes.
 *
 * Visual example:
 *
 *     Signal A
 *        ↓
 *     Memo B (observers)
 *       ↙   ↘
 *  Memo C   Effect D
 *
 * When Signal A changes:
 * 1. Mark Memo B as STALE
 * 2. Mark Memo C and Effect D as PENDING
 *
 * @param node - The memo whose observers should be marked
 */
export function markDownstream<T>(node: Memo<T>): void {
  if (!node.observers) return;

  for (let i = 0; i < node.observers.length; i++) {
    const observer = node.observers[i];

    // Skip if already marked
    if (observer.state !== CLEAN) continue;

    // Mark as PENDING (will become STALE when parent updates)
    observer.state = PENDING;

    // If observer is a memo, mark its observers too
    if ((observer as Memo<any>).observers) {
      markDownstream(observer as Memo<any>);
    }
  }
}

/**
 * Checks if a computation needs updating by looking at its dependencies.
 * This is called when a computation is PENDING.
 *
 * Process:
 * 1. Check each source (dependency)
 * 2. If source is STALE, update it first
 * 3. If source is PENDING, recurse
 * 4. When all sources are CLEAN, computation can update
 *
 * @param node - The computation to check
 * @param ignore - Computation to skip (prevents cycles)
 */
export function lookUpstream<T>(
  node: Computation<T>,
  ignore?: Computation<any>
): void {
  // Mark as CLEAN (will be marked STALE if needed)
  node.state = CLEAN;

  if (!node.sources) return;

  for (let i = 0; i < node.sources.length; i++) {
    const source = node.sources[i] as Memo<any>;

    // Skip signals (they don't have sources)
    if (!source.sources) continue;

    const state = source.state;

    if (state === STALE) {
      // Source is stale, update it first
      if (
        source !== ignore &&
        (!source.updatedAt || source.updatedAt < ExecCount)
      ) {
        runTop(source);
      }
    } else if (state === PENDING) {
      // Source is pending, check recursively
      lookUpstream(source, ignore);
    }
  }
}

/**
 * Updates a computation by running it and updating its value.
 * This is where the actual computation happens.
 *
 * @param node - The computation to update
 */
export function updateComputation<T>(node: Computation<T>): void {
  if (!node.fn) return;

  // Clean up old dependencies
  cleanNode(node);

  const time = ExecCount;

  // Run the computation (we'll implement this in step 4)
  runComputation(node, node.value, time);
}

/**
 * Runs a computation from the top of the dependency tree.
 * This ensures all dependencies are up-to-date before running.
 *
 * @param node - The computation to run
 */
export function runTop<T>(node: Computation<T>): void {
  // If already clean, nothing to do
  if (node.state === CLEAN) return;

  // If pending, check dependencies
  if (node.state === PENDING) {
    lookUpstream(node);
    return;
  }

  // Build ancestor chain (all stale computations above this)
  const ancestors: Computation<any>[] = [node];
  let current: Computation<any> | Owner | null = node;

  while ((current = current.owner as Computation<any>)) {
    if (!current.updatedAt || current.updatedAt < ExecCount) {
      if (current.state) {
        ancestors.push(current);
      }
    }
  }

  // Update from top to bottom
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestor = ancestors[i];

    if (ancestor.state === STALE) {
      updateComputation(ancestor);
    } else if (ancestor.state === PENDING) {
      lookUpstream(ancestor, ancestors[0]);
    }
  }
}

/**
 * Cleans up a computation's old dependencies.
 * Removes it from each source's observers list.
 *
 * @param node - The computation to clean
 */
export function cleanNode(node: Owner): void {
  let i: number;

  // Remove from sources' observers
  if ((node as Computation<any>).sources) {
    const comp = node as Computation<any>;

    while (comp.sources!.length) {
      const source = comp.sources!.pop()!;
      const index = comp.sourceSlots!.pop()!;
      const observers = source.observers;

      if (observers && observers.length) {
        // Swap with last and pop (O(1) removal)
        const last = observers.pop()!;
        const lastSlot = source.observerSlots!.pop()!;

        if (index < observers.length) {
          // Update swapped element's slot
          last.sourceSlots![lastSlot] = index;
          observers[index] = last;
          source.observerSlots![index] = lastSlot;
        }
      }
    }
  }

  // Clean up owned computations
  if (node.owned) {
    for (i = node.owned.length - 1; i >= 0; i--) {
      cleanNode(node.owned[i]);
    }
    node.owned = null;
  }

  // Run cleanup functions
  if (node.cleanups) {
    for (i = node.cleanups.length - 1; i >= 0; i--) {
      node.cleanups[i]();
    }
    node.cleanups = null;
  }

  // Reset state
  (node as Computation<any>).state = CLEAN;
}

/**
 * Placeholder for runComputation (implemented in step 4)
 */
function runComputation<T>(
  node: Computation<T>,
  value: any,
  time: number
): void {
  // Will implement in step 4
  console.log("runComputation called (placeholder)");
}
```

### 2.2 State Tracking Example

Create `src/examples/state-machine.ts`:

```typescript
import type { Computation } from "../reactive/types";
import { CLEAN, STALE, PENDING } from "../reactive/types";
import { markStale, markDownstream } from "../reactive/state";

/**
 * Example: How state machine prevents unnecessary updates
 */

// Simulated computation
const computation: Partial<Computation<number>> = {
  state: CLEAN,
  value: 10,
  updatedAt: 0,
};

console.log("📊 State Machine Example\n");

// Scenario 1: Computation is CLEAN
console.log("1. Computation is CLEAN (up-to-date)");
console.log("   State:", computation.state === CLEAN ? "CLEAN" : "OTHER");
console.log("   Action: Skip update, use cached value");
console.log("   Value:", computation.value);
console.log();

// Scenario 2: Dependency changes, mark STALE
console.log("2. Dependency changed, marking STALE");
computation.state = STALE;
console.log("   State:", computation.state === STALE ? "STALE" : "OTHER");
console.log("   Action: Need to re-run computation");
console.log();

// Scenario 3: Another dependency changes while STALE
console.log("3. Another dependency changed (already STALE)");
const prevState = computation.state;
markStale(computation as Computation<number>);
console.log("   Previous State:", prevState === STALE ? "STALE" : "OTHER");
console.log("   New State:", computation.state === STALE ? "STALE" : "OTHER");
console.log("   Action: Still STALE (no redundant marking)");
console.log();

// Scenario 4: Computation runs, becomes CLEAN
console.log("4. Computation executes");
computation.state = CLEAN;
computation.value = 20;
console.log("   State:", computation.state === CLEAN ? "CLEAN" : "OTHER");
console.log("   Value:", computation.value);
console.log("   Action: Cached and ready");
console.log();

console.log("✅ State machine prevents redundant work!");
```

Run:

```bash
npm run build && node dist/examples/state-machine.js
```

## 🔍 Comparison: Your Code vs State Machine

### Your Current Approach

```javascript
// Effect is added to queue regardless
function write(newValue) {
  // ...
  if (currentBatchEffects !== null) {
    for (const subscriber of subscribersSnapshot)
      currentBatchEffects.add(subscriber); // Always added
  }
}
```

**What happens:**

```
Signal A changes
  → Effect X added to queue
Signal B changes (also triggers Effect X)
  → Effect X added to queue (Set deduplicates)
  → Effect X runs once ✓

But if Effect X is ALREADY up-to-date?
  → Still added to queue ✗
  → Still runs unnecessarily ✗
```

### New Approach with State Machine

```typescript
function writeSignal<T>(node: SignalState<T>, value: T): void {
  // ...
  if (node.observers) {
    for (const observer of node.observers) {
      // Check state first!
      if (observer.state !== CLEAN) continue; // Skip if already queued

      observer.state = STALE; // Mark as needing update

      if (observer.pure) {
        Updates.push(observer); // Add to memo queue
      } else {
        Effects.push(observer); // Add to effect queue
      }
    }
  }
}
```

**What happens:**

```
Signal A changes
  → Check Effect X state: CLEAN
  → Mark Effect X as STALE
  → Add to queue

Signal B changes (also triggers Effect X)
  → Check Effect X state: STALE (already marked!)
  → Skip (already in queue) ✓

Effect X runs
  → State becomes CLEAN
  → Value cached

Signal C changes (doesn't affect Effect X)
  → Effect X state: CLEAN
  → Skip completely (not affected) ✓
```

## 📊 Performance Impact

### Benchmark Scenario

```typescript
// 1000 signals, 1 effect depends on all of them
const signals = Array.from({ length: 1000 }, () => createSignal(0));
const effect = createEffect(() => {
  signals.forEach(([get]) => get());
});

// Update all signals
batch(() => {
  signals.forEach(([_, set]) => set(1));
});
```

**Your approach (no state machine):**

```
- Add effect to queue: 1000 times
- Set deduplicates: Still O(1000) operations
- Effect runs: 1 time
Total: ~1000 operations
```

**State machine approach:**

```
- Check state: 1 time (first signal)
- Mark STALE: 1 time
- Skip remaining: 999 times (just state check)
- Effect runs: 1 time
Total: ~1000 operations BUT much lighter (state check vs Set operation)
```

**Real performance gain comes from skipping unnecessary updates:**

```typescript
// Effect depends on A but not B
createEffect(() => console.log(a()));

setA(1); // Effect runs ✓
setB(1); // Your approach: effect added to queue
// State machine: state is CLEAN, skip entirely ✓
```

## ✅ Testing

Create `src/tests/step2-state-machine.ts`:

```typescript
import type { Computation } from "../reactive/types";
import { CLEAN, STALE, PENDING } from "../reactive/types";
import {
  markStale,
  markDownstream,
  ExecCount,
  incrementExecCount,
} from "../reactive/state";

console.log("🧪 State Machine Tests\n");

// Test 1: State transitions
{
  console.log("Test 1: State transitions");

  const comp: Partial<Computation<number>> = {
    state: CLEAN,
    updatedAt: 0,
  };

  console.assert(comp.state === CLEAN, "Initial state should be CLEAN");

  markStale(comp as Computation<number>);
  console.assert(comp.state === STALE, "After markStale, should be STALE");

  comp.state = CLEAN;
  comp.state = PENDING;
  console.assert(comp.state === PENDING, "Can set to PENDING");

  console.log("✓ State transitions work\n");
}

// Test 2: Skip marking if already stale
{
  console.log("Test 2: Skip redundant marking");

  const comp: Partial<Computation<number>> = {
    state: STALE,
  };

  markStale(comp as Computation<number>);
  console.assert(comp.state === STALE, "Should still be STALE");
  console.log("✓ Redundant marking skipped\n");
}

// Test 3: ExecCount tracking
{
  console.log("Test 3: ExecCount tracking");

  const initial = ExecCount;
  incrementExecCount();
  console.assert(ExecCount === initial + 1, "ExecCount should increment");
  console.log("✓ ExecCount works\n");
}

console.log("✅ All state machine tests passed!");
```

Run:

```bash
npm run build && node dist/tests/step2-state-machine.js
```

## 🎯 What We Achieved

- ✅ State machine implemented (CLEAN/STALE/PENDING)
- ✅ Smart update tracking
- ✅ Foundation for lazy evaluation
- ✅ Performance optimizations enabled
- ✅ Execution counter for staleness detection

## 🔗 Next Steps

Now that we can track computation state, we'll implement the **Computation Node Structure** in Step 3, which uses these states to manage the reactive graph.

---

**Navigation**: [← Previous: Step 1](./01-typescript-setup.md) | [Next: Step 3 →](./03-computation-nodes.md)
