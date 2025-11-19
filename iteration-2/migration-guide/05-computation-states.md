# Step 5: Computation State Machine

## 🎯 Goal
Implement lazy evaluation with a state machine to prevent unnecessary recomputations and ensure glitch-free updates.

## 🤔 The Problem: Eager Recomputation

### Your Current Implementation

```javascript
// Every signal change triggers immediate recomputation
function write(newValue) {
  value = newValue;
  
  for (const subscriber of subscribers) {
    subscriber.execute(); // ← Always runs, even if not accessed
  }
}
```

**Problems:**
1. **Wasteful**: Recomputes even if value never read
2. **Glitches**: Temporary inconsistent states
3. **No priorities**: All effects treated equally

### Example: The Glitch Problem

```javascript
const [firstName, setFirstName] = createSignal("John");
const [lastName, setLastName] = createSignal("Doe");

const fullName = createMemo(() => {
  return `${firstName()} ${lastName()}`;
});

createEffect(() => {
  console.log(fullName());
});

// Update both
batch(() => {
  setFirstName("Jane");  // fullName = "Jane Doe" (inconsistent!)
  setLastName("Smith");  // fullName = "Jane Smith" (correct)
});

// With eager execution:
// Logs: "Jane Doe" (wrong!) then "Jane Smith"

// With lazy + states:
// Logs: "Jane Smith" (only the final, correct value)
```

## 📊 The State Machine

### Three States

```
┌──────────┐
│  CLEAN   │  State = 0
│  (0)     │  Computation is up-to-date
└──────────┘  Can be read without recomputation
      ↑
      │ recompute
      │
      ↓
┌──────────┐  write signal ┌──────────┐
│  STALE   │◄──────────────│ PENDING  │
│  (1)     │               │  (2)     │
└──────────┘               └──────────┘
Needs full                 Waiting for
recomputation             upstream to
                          update first
```

### State Transitions

```typescript
// Initial state
computation.state = 0; // CLEAN

// Signal dependency changes
writeSignal(signal, newValue);
  → computation.state = STALE;  // Mark for recomputation

// When computation is accessed
if (computation.state === STALE) {
  // Check upstream dependencies first
  for (source of computation.sources) {
    if (source.state === STALE) {
      computation.state = PENDING; // Wait for upstream
      updateComputation(source);   // Update upstream first
    }
  }
  
  // Now update this computation
  updateComputation(computation);
  computation.state = 0; // CLEAN
}
```

## 🏗️ Implementation

### Step 1: Constants

```typescript
// reactive.ts

/**
 * Computation states
 */
export const STALE = 1;    // Needs recomputation
export const PENDING = 2;  // Waiting for upstream

/**
 * Global execution counter for topological ordering
 * Incremented on each update cycle
 */
let ExecCount = 0;
```

### Step 2: Update Computation Structure

```typescript
export interface Computation<Init, Next extends Init = Init> extends Owner {
  fn: EffectFunction<Init, Next>;
  
  state: ComputationState;  // ← Add this
  updatedAt: number | null; // ← Add this (for glitch prevention)
  
  sources: SignalState<any>[] | null;
  sourceSlots: number[] | null;
  value?: Init;
  pure: boolean;
  // ... other fields
}
```

### Step 3: Mark Computations as STALE

```typescript
export function writeSignal(node: SignalState<any>, value: any): any {
  // Check if value changed
  if (!node.comparator || !node.comparator(node.value, value)) {
    node.value = value;
    
    // Notify observers
    if (node.observers && node.observers.length) {
      runUpdates(() => {
        for (let i = 0; i < node.observers!.length; i += 1) {
          const o = node.observers![i];
          
          // Only mark if not already stale
          if (!o.state) {
            // Add to appropriate queue
            if (o.pure) Updates!.push(o);  // Memos first
            else Effects!.push(o);          // Effects second
            
            // Propagate to downstream
            if ((o as Memo<any>).observers) {
              markDownstream(o as Memo<any>);
            }
          }
          
          o.state = STALE; // ← Mark as needing update
        }
      }, false);
    }
  }
  
  return value;
}
```

### Step 4: Check State Before Reading

```typescript
export function readSignal(this: SignalState<any> | Memo<any>): any {
  // If this is a memo, check if it needs updating
  if ((this as Memo<any>).sources && (this as Memo<any>).state) {
    const memo = this as Memo<any>;
    
    if (memo.state === STALE) {
      // Fully recompute
      updateComputation(memo);
    } else if (memo.state === PENDING) {
      // Check upstream first
      const updates = Updates;
      Updates = null;
      runUpdates(() => lookUpstream(memo), false);
      Updates = updates;
    }
  }
  
  // Track dependency
  if (Listener) {
    const sSlot = this.observers ? this.observers.length : 0;
    
    if (!Listener.sources) {
      Listener.sources = [this];
      Listener.sourceSlots = [sSlot];
    } else {
      Listener.sources.push(this);
      Listener.sourceSlots!.push(sSlot);
    }
    
    if (!this.observers) {
      this.observers = [Listener];
      this.observerSlots = [Listener.sources.length - 1];
    } else {
      this.observers.push(Listener);
      this.observerSlots!.push(Listener.sources.length - 1);
    }
  }
  
  return this.value;
}
```

### Step 5: Look Upstream for PENDING

```typescript
/**
 * Recursively updates upstream dependencies
 * Used when a computation is PENDING
 */
function lookUpstream(node: Computation<any>, ignore?: Computation<any>): void {
  // Clear pending state
  node.state = 0;
  
  // Check each source
  for (let i = 0; i < node.sources!.length; i += 1) {
    const source = node.sources![i] as Memo<any>;
    
    // Only check memos (signals are always current)
    if (source.sources) {
      const state = source.state;
      
      if (state === STALE) {
        // Source needs updating and we haven't updated it yet
        if (source !== ignore && 
            (!source.updatedAt || source.updatedAt < ExecCount)) {
          runTop(source);
        }
      } else if (state === PENDING) {
        // Source is pending, recurse
        lookUpstream(source, ignore);
      }
    }
  }
}
```

### Step 6: Run with Topological Ordering

```typescript
/**
 * Updates a computation, checking upstream first
 * Ensures topological order (dependencies before dependents)
 */
function runTop(node: Computation<any>): void {
  // Already clean?
  if (node.state === 0) return;
  
  // Still pending? Look upstream
  if (node.state === PENDING) return lookUpstream(node);
  
  // Collect ancestors that need updating
  const ancestors = [node];
  
  while ((node = node.owner as Computation<any>) && 
         (!node.updatedAt || node.updatedAt < ExecCount)) {
    if (node.state) ancestors.push(node);
  }
  
  // Update from top down (parents before children)
  for (let i = ancestors.length - 1; i >= 0; i--) {
    node = ancestors[i];
    
    if (node.state === STALE) {
      updateComputation(node);
    } else if (node.state === PENDING) {
      const updates = Updates;
      Updates = null;
      runUpdates(() => lookUpstream(node, ancestors[0]), false);
      Updates = updates;
    }
  }
}
```

### Step 7: Update Computation with State Management

```typescript
function updateComputation(node: Computation<any>): void {
  if (!node.fn) return;
  
  // Clean up old dependencies
  cleanNode(node);
  
  const time = ExecCount;
  
  // Run the computation
  runComputation(node, node.value, time);
}

function runComputation(
  node: Computation<any>,
  value: any,
  time: number
): void {
  let nextValue;
  
  const owner = Owner;
  const listener = Listener;
  
  Listener = Owner = node;
  
  try {
    nextValue = node.fn(value);
  } catch (err) {
    handleError(err);
    return;
  } finally {
    Listener = listener;
    Owner = owner;
  }
  
  // Update if not already updated this cycle
  if (!node.updatedAt || node.updatedAt <= time) {
    // If this is a memo, notify observers
    if (node.updatedAt != null && "observers" in node) {
      writeSignal(node as Memo<any>, nextValue, true);
    } else {
      node.value = nextValue;
    }
    
    node.updatedAt = time;  // Mark as updated
    node.state = 0;         // Mark as clean
  }
}
```

## 🎨 Example: State Machine in Action

### Code

```typescript
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);

const sum = createMemo(() => {
  console.log("Computing sum");
  return a() + b();
});

const doubled = createMemo(() => {
  console.log("Computing doubled");
  return sum() * 2;
});

createEffect(() => {
  console.log("Result:", doubled());
});
```

### Execution Flow

```
Initial:
  sum.state = 0 (CLEAN)
  doubled.state = 0 (CLEAN)
  effect.state = 0 (CLEAN)

setA(5):
  1. writeSignal(a, 5)
  2. sum.state = STALE
  3. Add sum to Updates queue
  
  4. markDownstream(sum)
  5. doubled.state = PENDING
  6. Add doubled to Updates queue
  
  7. markDownstream(doubled)
  8. effect.state = PENDING
  9. Add effect to Effects queue

Flush Updates:
  10. runTop(sum)
      - sum.state === STALE
      - updateComputation(sum)
      - Logs: "Computing sum"
      - sum.value = 7
      - sum.state = 0 (CLEAN)
      - sum.updatedAt = ExecCount
  
  11. runTop(doubled)
      - doubled.state === PENDING
      - lookUpstream(doubled)
        - Check sum: state = 0, updatedAt = ExecCount ✓
      - updateComputation(doubled)
      - Logs: "Computing doubled"
      - doubled.value = 14
      - doubled.state = 0 (CLEAN)

Flush Effects:
  12. runTop(effect)
      - effect.state === PENDING
      - lookUpstream(effect)
        - Check doubled: state = 0 ✓
      - updateComputation(effect)
      - Logs: "Result: 14"
      - effect.state = 0 (CLEAN)

Final state:
  All computations CLEAN
  All values consistent
  No glitches! 🎉
```

## 🔍 Why This Matters

### 1. Lazy Evaluation

```typescript
const expensive = createMemo(() => {
  console.log("Expensive computation");
  return heavyCalculation();
});

// Signal changes, but memo not read
setSignal(newValue);
// memo.state = STALE, but NOT computed yet

// Only computed when accessed
console.log(expensive()); // ← Now it computes
```

### 2. Glitch Prevention

```typescript
const [x, setX] = createSignal(1);
const [y, setY] = createSignal(2);

const sum = createMemo(() => x() + y());
const product = createMemo(() => sum() * 2);

batch(() => {
  setX(5);  // sum.state = STALE
  setY(10); // sum already STALE
});

// sum only computes once with final values: (5 + 10) * 2 = 30
// Without states: would compute (5 + 2) * 2 = 14, then (5 + 10) * 2 = 30
```

### 3. Topological Ordering

```typescript
//     A
//    / \
//   B   C
//    \ /
//     D

setA(newValue);

// Update order: A → B → C → D
// Guaranteed: parents before children
// D always sees consistent B and C values
```

## ✅ Implementation Checklist

- [ ] Add `state` and `updatedAt` to Computation
- [ ] Add `ExecCount` global counter
- [ ] Update `writeSignal` to mark STALE
- [ ] Implement `readSignal` state checking
- [ ] Implement `lookUpstream` for PENDING
- [ ] Implement `runTop` with topological ordering
- [ ] Update `runComputation` to set state and timestamp
- [ ] Test with complex dependency graphs

## 🧪 Testing

```typescript
test("lazy evaluation", () => {
  const [s, setS] = createSignal(0);
  let computes = 0;
  
  const memo = createMemo(() => {
    computes++;
    return s() * 2;
  });
  
  setS(1); // memo.state = STALE
  expect(computes).toBe(0); // Not computed yet
  
  memo(); // Force read
  expect(computes).toBe(1); // Now computed
});

test("no glitches", () => {
  const [a, setA] = createSignal(1);
  const [b, setB] = createSignal(2);
  
  const sum = createMemo(() => a() + b());
  
  const results: number[] = [];
  createEffect(() => {
    results.push(sum());
  });
  
  results.length = 0; // Reset
  
  batch(() => {
    setA(5);
    setB(10);
  });
  
  expect(results).toEqual([15]); // Only final value, no intermediate
});
```

## 🔄 The Complete runUpdates Implementation

Now that we have states, here's the **complete** `runUpdates` that handles everything:

```typescript
/**
 * Core update cycle - orchestrates marking and flushing
 * This is what makes the state machine work!
 */
function runUpdates<T>(fn: () => T, init: boolean): T {
  // Prevent nested flush cycles
  if (Updates) {
    return fn();
  }
  
  // Initialize queues and increment timestamp
  Updates = [];
  Effects = [];
  ExecCount++;  // For glitch prevention
  
  try {
    // Phase 1: Mark phase (add to queues)
    const result = fn();
    
    // Phase 2: Flush Updates (memos) with topological ordering
    for (let i = 0; i < Updates.length; i++) {
      const node = Updates[i]!;
      runTop(node);  // Updates upstream first if needed
    }
    
    // Phase 3: Flush Effects (only if init=true)
    if (init) {
      for (let i = 0; i < Effects.length; i++) {
        const node = Effects[i]!;
        runTop(node);  // Updates upstream first if needed
      }
    }
    
    return result;
  } finally {
    // Cleanup
    Updates = null;
    if (init) Effects = null;
  }
}

/**
 * Run computation with topological ordering
 * Ensures parents update before children
 */
function runTop(node: Computation<any>): void {
  // Already clean? Nothing to do
  if (node.state === CLEAN) return;
  
  // If PENDING, check upstream first
  if (node.state === PENDING) {
    const prevUpdates = Updates;
    Updates = null;
    runUpdates(() => lookUpstream(node), false);
    Updates = prevUpdates;
    return;
  }
  
  // Collect ancestors that need updating
  const ancestors: Computation<any>[] = [node];
  let current = node.owner as Computation<any>;
  
  while (current && (!current.updatedAt || current.updatedAt < ExecCount)) {
    if (current.state !== CLEAN) {
      ancestors.push(current);
    }
    current = current.owner as Computation<any>;
  }
  
  // Update from top down (parents before children)
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestor = ancestors[i]!;
    
    if (ancestor.state === STALE) {
      updateComputation(ancestor);
    } else if (ancestor.state === PENDING) {
      const prevUpdates = Updates;
      Updates = null;
      runUpdates(() => lookUpstream(ancestor), false);
      Updates = prevUpdates;
    }
  }
}

/**
 * Check if upstream dependencies need updating
 * Used for PENDING computations
 */
function lookUpstream(node: Computation<any>): void {
  node.state = CLEAN;
  
  for (let i = 0; i < node.sources!.length; i++) {
    const source = node.sources![i] as Memo<any>;
    
    // Skip signals (they're always current)
    if (!source.sources) continue;
    
    const state = source.state;
    if (state === STALE) {
      // Source needs updating and hasn't been updated yet
      if (!source.updatedAt || source.updatedAt < ExecCount) {
        runTop(source);
      }
    } else if (state === PENDING) {
      // Source is pending, recurse
      lookUpstream(source);
    }
  }
}
```

### How It All Works Together

```typescript
// Complete flow with states:
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);

const sum = createMemo(() => a() + b());
const doubled = createMemo(() => sum() * 2);

createEffect(() => {
  console.log(doubled());
});

// Initial: all CLEAN
// sum.state = 0
// doubled.state = 0
// effect.state = 0

setA(5);  // Triggers writeSignal

// ┌─ writeSignal ────────────────────────────────────┐
// │ 1. a.value = 5                                   │
// │ 2. runUpdates(() => { ... }, true)               │
// └──────────────────────────────────────────────────┘
//
// ┌─ runUpdates Phase 1: Initialize ─────────────────┐
// │ Updates = []                                     │
// │ Effects = []                                     │
// │ ExecCount++ (now = 1)                            │
// └──────────────────────────────────────────────────┘
//
// ┌─ runUpdates Phase 2: Mark ───────────────────────┐
// │ fn() executes:                                   │
// │   sum.state = STALE                              │
// │   Updates.push(sum)                              │
// │   markDownstream(sum):                           │
// │     doubled.state = PENDING                      │
// │     Updates.push(doubled)                        │
// │     markDownstream(doubled):                     │
// │       effect.state = PENDING                     │
// │       Effects.push(effect)                       │
// └──────────────────────────────────────────────────┘
//
// ┌─ runUpdates Phase 3: Flush Updates ──────────────┐
// │ for (sum in Updates):                            │
// │   runTop(sum):                                   │
// │     sum.state === STALE                          │
// │     updateComputation(sum)                       │
// │     sum.value = 7                                │
// │     sum.state = CLEAN                            │
// │     sum.updatedAt = 1                            │
// │                                                  │
// │ for (doubled in Updates):                        │
// │   runTop(doubled):                               │
// │     doubled.state === PENDING                    │
// │     lookUpstream(doubled):                       │
// │       check sum: state=CLEAN, updatedAt=1 ✓      │
// │     updateComputation(doubled)                   │
// │     doubled.value = 14                           │
// │     doubled.state = CLEAN                        │
// └──────────────────────────────────────────────────┘
//
// ┌─ runUpdates Phase 4: Flush Effects ──────────────┐
// │ for (effect in Effects):                         │
// │   runTop(effect):                                │
// │     effect.state === PENDING                     │
// │     lookUpstream(effect):                        │
// │       check doubled: state=CLEAN ✓               │
// │     updateComputation(effect)                    │
// │     console.log(14)  ← Side effect!              │
// │     effect.state = CLEAN                         │
// └──────────────────────────────────────────────────┘
//
// ┌─ runUpdates Phase 5: Cleanup ────────────────────┐
// │ Updates = null                                   │
// │ Effects = null                                   │
// └──────────────────────────────────────────────────┘
//
// Final: all CLEAN again, consistent values! ✨
```

### Why This Achieves All Six Goals

1. **Lazy Evaluation** ✅
   - Computations marked STALE but only update during flush
   - If never accessed, never computed

2. **State Machine** ✅
   - CLEAN → STALE → PENDING → CLEAN cycle
   - Clear lifecycle management

3. **Glitch Prevention** ✅
   - ExecCount timestamp ensures we see updates once
   - lookUpstream checks prevent reading stale values

4. **Topological Ordering** ✅
   - runTop walks up owner chain
   - Updates parents before children

5. **Performance** ✅
   - Batch updates in runUpdates
   - Process once per cycle, not per signal change

6. **Correctness** ✅
   - PENDING state ensures upstream consistency
   - Only see final, stable values

## ⏱️ Critical: When Do Computations Actually Execute?

### The Lazy Evaluation Model

Solid.js memos use **pull-based lazy evaluation**. This is crucial to understand:

```typescript
const [count, setCount] = createSignal(0);

const doubled = createMemo(() => {
  console.log("Computing doubled");
  return count() * 2;
});

console.log("1. Before update");
setCount(5);
console.log("2. After update (memo NOT computed yet!)");
console.log("3. Accessing memo...");
const value = doubled();  // ← Computation happens HERE
console.log("4. Got value:", value);

// Output:
// 1. Before update
// 2. After update (memo NOT computed yet!)
// 3. Accessing memo...
// Computing doubled  ← Only computes when accessed!
// 4. Got value: 10
```

### Two Execution Paths

#### Path 1: On-Access (Memos)

```typescript
// Memo marked STALE by signal update
doubled();  // ← Access triggers recomputation

// Internally:
function readSignal() {
  if (this.state === STALE) {
    updateComputation(this);  // Compute NOW
  }
  return this.value;
}
```

**When:** On read/access  
**Who:** Calling code (effect, another memo, or user)  
**Trigger:** Reading the value

#### Path 2: During Flush (Effects)

```typescript
// Effect marked STALE by signal update
// Effects run during flush (microtask in our implementation)

// Internally (in completeUpdates):
for (const effect of Effects) {
  if (effect.state === STALE) {
    updateComputation(effect);  // Compute during flush
  }
}
```

**When:** During queue flush (microtask)  
**Who:** Reactive system  
**Trigger:** Queue processing

### The Key Difference

```typescript
const [count, setCount] = createSignal(0);

// MEMO: Lazy (pull)
const doubled = createMemo(() => count() * 2);

// EFFECT: Eager flush (push)
createEffect(() => console.log(doubled()));

setCount(5);
// → Memo: Marked STALE, waiting...
// → Effect: Marked STALE, added to Effects queue
// → (Microtask): Effect flushes
//   → Effect accesses doubled()
//   → Doubled recomputes (on-access!)
//   → Effect logs the value
```

### Multiple Accesses = One Computation

```typescript
const [count, setCount] = createSignal(0);
const doubled = createMemo(() => {
  console.log("Computing!");
  return count() * 2;
});

setCount(5);

// Multiple accesses in same cycle:
doubled();  // Logs "Computing!" → Returns 10
doubled();  // Returns 10 (cached, no log)
doubled();  // Returns 10 (cached, no log)

// State after first access: CLEAN
// Subsequent reads see CLEAN state → return cached value
```

### Why This Matters

**Performance:**
```typescript
const expensive = createMemo(() => {
  // Imagine this takes 1 second
  return heavyComputation();
});

// Signal updated 100 times
for (let i = 0; i < 100; i++) {
  setCount(i);  // Memo marked STALE each time
}

// Only computes ONCE on access!
const result = expensive();  // ← 1 second (not 100 seconds!)
```

**Never Accessed = Never Computed:**
```typescript
const unused = createMemo(() => {
  console.log("This will never run!");
  return count() * 2;
});

setCount(1);
setCount(2);
setCount(3);
// No logs! Memo never accessed = never computed

// This is pure laziness - ultimate optimization!
```

## 🔑 Critical Difference: Memos vs Effects

Now that you understand lazy evaluation, it's crucial to understand how memos differ from effects:

### Memos: Lazy (Pull-based)

```typescript
const [count, setCount] = createSignal(0);

const doubled = createMemo(() => {
  console.log("Computing doubled");
  return count() * 2;
});

setCount(5);  // Memo marked STALE, NOT computed yet!
console.log("Between updates");
doubled();    // NOW it computes!
console.log("After access");

// Output:
// Between updates
// Computing doubled  ← Happens on access!
// After access
```

**Trigger:** Access (reading the value)  
**Timing:** On-demand, when read  
**Purpose:** Cached derived values  
**Optimization:** Never accessed = never computed

### Effects: Eager (Push-based)

```typescript
const [count, setCount] = createSignal(0);

createEffect(() => {
  console.log("Effect sees:", count());
});

setCount(5);  // Effect flushes IMMEDIATELY!
// ↑ Effect already ran (synchronously)
console.log("After update");

// Output:
// Effect sees: 0  ← Initial run
// Effect sees: 5  ← Ran synchronously in setCount!
// After update
```

**Trigger:** Signal update  
**Timing:** Synchronous flush  
**Purpose:** Side effects  
**Guarantee:** Always runs (can't skip)

### Why This Matters

```typescript
const [count, setCount] = createSignal(0);

// Memo: Only computes if accessed
const expensive = createMemo(() => {
  console.log("Expensive computation");
  let result = 0;
  for (let i = 0; i < 1000000; i++) {
    result += Math.sqrt(i);
  }
  return result;
});

setCount(1);  // NOT computed yet!
setCount(2);  // Still not computed!
setCount(3);  // Still not computed!
console.log("Memos not computed yet!");

expensive();  // NOW it computes ONCE with final value!

// VS

// Effect: Always runs on change
createEffect(() => {
  console.log("Effect runs");
  let result = 0;
  for (let i = 0; i < 1000000; i++) {
    result += Math.sqrt(i);
  }
  return result;
});

setCount(1);  // Runs immediately! (expensive!)
setCount(2);  // Runs again! (expensive!)
setCount(3);  // Runs again! (expensive!)
// 3 expensive computations!
```

### Performance Comparison

| Scenario | Memo | Effect |
|----------|------|--------|
| Signal updated | Marked STALE | Runs immediately |
| Multiple updates | Marks STALE each time | Runs each time |
| Never accessed | Never computes ✅ | Always runs ❌ |
| Accessed once | Computes once ✅ | N/A |
| Accessed multiple times | Returns cached ✅ | N/A |
| **Best for** | Derived values | Side effects |

### Use Cases

**Use Memos When:**
```typescript
// Deriving values
const fullName = createMemo(() => `${first()} ${last()}`);

// Expensive computations
const filtered = createMemo(() => items().filter(predicate));

// Complex calculations
const stats = createMemo(() => calculateStatistics(data()));
```

**Use Effects When:**
```typescript
// DOM updates
createEffect(() => {
  element.textContent = message();
});

// Logging/debugging
createEffect(() => {
  console.log("State changed:", state());
});

// External sync
createEffect(() => {
  saveToLocalStorage(data());
});
```

### Key Insight

**Memos are performance optimizations** (lazy, cached)  
**Effects are for side effects** (eager, always run)

Choose based on your needs:
- Need a derived value? → Memo
- Need a side effect? → Effect
- Want to skip computation? → Memo (it might not run!)
- Must always execute? → Effect (it will always run!)

## 🚀 Next Step

Continue to **[06-effect-scheduling.md](./06-effect-scheduling.md)** to implement proper effect queuing and execution order.

---

**💡 Pro Tip**: States are what make Solid.js "pull-based" while still being reactive. Lazy + precise = fast!
