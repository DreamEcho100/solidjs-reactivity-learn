# Step 6: Effect Scheduling & Multi-Queue System

## 🎯 Goal
Implement a proper scheduling system with separate queues for memos (Updates) and effects (Effects) to ensure correct execution order.

## 🤔 The Problem: Mixed Execution

### Your Current Implementation

```javascript
// Single Set for all effects
currentBatchEffects = new Set();

// All effects mixed together
setSignalA(1); // Adds effectX, memoY
setSignalB(2); // Adds effectZ, memoW

// Execution order is undefined!
for (const effect of currentBatchEffects) {
  effect.execute(); // Could be memo or effect, random order
}
```

**Problems:**
1. Effects might run before memos finish computing
2. Effects see inconsistent derived state
3. No guarantee of stable reads

### Example: The Inconsistency Problem

```javascript
const [first, setFirst] = createSignal("John");
const [last, setLast] = createSignal("Doe");

const fullName = createMemo(() => `${first()} ${last()}`);

createEffect(() => {
  // Might see "Jane Doe" if memo hasn't updated yet!
  document.title = fullName();
});

batch(() => {
  setFirst("Jane");
  setLast("Smith");
});

// Without proper scheduling:
// Effect might run before memo computes
// Title could be "Jane Doe" (wrong!) or "Jane Smith" (correct) - race condition!
```

## 📊 Multi-Queue Architecture

### Solid.js Approach

```
Signal Updates
       ↓
   ┌────────┐
   │UPDATES │ ← Pure computations (memos)
   │Queue   │   Priority: Compute derived values
   └────────┘
       ↓
   All memos computed
       ↓
   ┌────────┐
   │EFFECTS │ ← Side effects
   │Queue   │   Priority: Run after stable values
   └────────┘
       ↓
   Done!

Guarantee: Effects ALWAYS see final memo values
```

### Queue Types

```typescript
/**
 * Updates: Pure computations (memos, computed values)
 * - Run first
 * - Can have observers
 * - Must finish before Effects
 */
let Updates: Computation<any>[] | null = null;

/**
 * Effects: Side effects (DOM updates, console.log, etc.)
 * - Run second
 * - Cannot have observers
 * - See stable computed values
 */
let Effects: Computation<any>[] | null = null;
```

## 🏗️ Implementation

### Step 1: Define Global Queues

```typescript
// reactive.ts

/**
 * Queue for pure computations (memos)
 * Processed first to ensure derived values are up-to-date
 */
let Updates: Computation<any>[] | null = null;

/**
 * Queue for side effects
 * Processed after Updates to see stable values
 */
let Effects: Computation<any>[] | null = null;

/**
 * Execution counter for topological ordering
 */
let ExecCount = 0;

/**
 * Current effect runner function
 * Can be swapped to change effect execution behavior
 */
let runEffects = runQueue;
```

### Step 2: Separate Memos from Effects

```typescript
export function writeSignal(node: SignalState<any>, value: any): any {
  if (!node.comparator || !node.comparator(node.value, value)) {
    node.value = value;
    
    if (node.observers && node.observers.length) {
      runUpdates(() => {
        for (let i = 0; i < node.observers!.length; i += 1) {
          const o = node.observers![i];
          
          if (!o.state) {
            // ← KEY DIFFERENCE: Route to different queues
            if (o.pure) {
              Updates!.push(o);  // Memos go to Updates
            } else {
              Effects!.push(o);  // Effects go to Effects
            }
            
            // Mark downstream
            if ((o as Memo<any>).observers) {
              markDownstream(o as Memo<any>);
            }
          }
          
          o.state = STALE;
        }
      }, false);
    }
  }
  
  return value;
}
```

### Step 3: Process Queues in Order

```typescript
/**
 * Core update cycle
 * Sets up queues, runs function, then completes updates
 */
function runUpdates<T>(fn: () => T, init: boolean): T {
  // Already in an update? Just run the function
  if (Updates) return fn();
  
  let wait = false;
  
  // Initialize queues
  if (!init) Updates = [];
  if (Effects) wait = true;
  else Effects = [];
  
  ExecCount++; // Increment for this update cycle
  
  try {
    const res = fn();
    completeUpdates(wait);
    return res;
  } catch (err) {
    if (!wait) Effects = null;
    Updates = null;
    handleError(err);
  }
}

/**
 * Completes an update cycle by flushing both queues
 */
function completeUpdates(wait: boolean): void {
  // 1. Process Updates (memos) first
  if (Updates) {
    runQueue(Updates);
    Updates = null;
  }
  
  if (wait) return;
  
  // 2. Process Effects second
  const e = Effects!;
  Effects = null;
  
  if (e.length) {
    runUpdates(() => runEffects(e), false);
  }
}
```

### Step 4: Running Queues

```typescript
/**
 * Processes a queue of computations
 */
function runQueue(queue: Computation<any>[]): void {
  for (let i = 0; i < queue.length; i++) {
    runTop(queue[i]);
  }
}

/**
 * Special runner for user effects (separate from render effects)
 */
function runUserEffects(queue: Computation<any>[]): void {
  let i, userLength = 0;
  
  // Separate render effects from user effects
  for (i = 0; i < queue.length; i++) {
    const e = queue[i];
    if (!e.user) {
      runTop(e); // Run render effects immediately
    } else {
      queue[userLength++] = e; // Collect user effects
    }
  }
  
  // Run user effects after render effects
  for (i = 0; i < userLength; i++) {
    runTop(queue[i]);
  }
}
```

### Step 5: Effect Types

```typescript
/**
 * Creates a computed effect (runs before render)
 */
export function createComputed<Next>(
  fn: EffectFunction<undefined | NoInfer<Next>, Next>
): void {
  const c = createComputation(fn, undefined!, true, STALE);
  updateComputation(c);
}

/**
 * Creates a render effect (runs during render)
 */
export function createRenderEffect<Next>(
  fn: EffectFunction<undefined | NoInfer<Next>, Next>
): void {
  const c = createComputation(fn, undefined!, false, STALE);
  updateComputation(c);
}

/**
 * Creates a user effect (runs after render)
 */
export function createEffect<Next>(
  fn: EffectFunction<undefined | NoInfer<Next>, Next>
): void {
  runEffects = runUserEffects; // Switch to user effect runner
  const c = createComputation(fn, undefined!, false, STALE);
  c.user = true; // Mark as user effect
  
  if (Effects) {
    Effects.push(c);
  } else {
    updateComputation(c);
  }
}
```

## 🎨 Execution Flow Example

### Code

```typescript
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);

// Memo 1 (pure)
const sum = createMemo(() => {
  console.log("1. Computing sum");
  return a() + b();
});

// Memo 2 (pure)  
const doubled = createMemo(() => {
  console.log("2. Computing doubled");
  return sum() * 2;
});

// Effect (not pure)
createEffect(() => {
  console.log("3. Effect:", doubled());
});

// Update both signals
batch(() => {
  setA(5);
  setB(10);
});
```

### Queue States

```
After batch(() => { setA(5); setB(10); }):

Updates Queue:
  [sum, doubled]  ← Both memos queued
  
Effects Queue:
  [effect]        ← Effect queued

Processing:
  
Step 1: Flush Updates
  runQueue([sum, doubled])
    runTop(sum)
      → Logs: "1. Computing sum"
      → sum.value = 15
      → sum.state = 0
    
    runTop(doubled)
      → Logs: "2. Computing doubled"
      → doubled.value = 30
      → doubled.state = 0
  
  Updates = null

Step 2: Flush Effects
  runEffects([effect])
    runTop(effect)
      → Reads doubled() = 30 (stable value!)
      → Logs: "3. Effect: 30"
      → effect.state = 0
  
  Effects = null

Done! All queues empty.
```

## 🔍 Why Separate Queues Matter

### Example 1: Diamond Dependency

```typescript
//       A
//      / \
//     B   C  (memos)
//      \ /
//       D   (effect)

const [a, setA] = createSignal(1);
const b = createMemo(() => a() * 2);
const c = createMemo(() => a() * 3);

createEffect(() => {
  console.log(b() + c()); // Must see consistent b and c
});

setA(5);

// Without separate queues:
// Possible execution: b updates → effect runs (sees b=10, c=3) → c updates
// Result: Inconsistent! Effect saw wrong values.

// With separate queues:
// 1. b updates (b=10)
// 2. c updates (c=15)
// 3. effect runs (sees b=10, c=15)
// Result: Consistent! ✓
```

### Example 2: Cascading Updates

```typescript
const [trigger, setTrigger] = createSignal(false);
const [count, setCount] = createSignal(0);

createEffect(() => {
  if (trigger()) {
    setCount(c => c + 1); // Cascading update in effect
  }
});

createEffect(() => {
  console.log("Count:", count());
});

setTrigger(true);

// Execution:
// 1. First effect runs, calls setCount
// 2. Second effect queued
// 3. Second effect runs with updated count
// All in correct order!
```

## 📊 Scheduling Priorities

```
Priority Level 1: createComputed
  - Runs immediately when created
  - Updates queue: [computation]
  - Used for derived values that should always be current

Priority Level 2: createRenderEffect  
  - Runs during render phase
  - Effects queue: [renderEffect]
  - Used for DOM updates before visible

Priority Level 3: createEffect (user: false)
  - Runs in effects queue
  - Regular priority
  - For most side effects

Priority Level 4: createEffect (user: true)
  - Runs after render effects
  - Deferred until render complete
  - For non-critical side effects
```

## ✅ Implementation Checklist

- [ ] Add `Updates` and `Effects` global queues
- [ ] Update `writeSignal` to route by `pure` flag
- [ ] Implement `runUpdates` with queue initialization
- [ ] Implement `completeUpdates` to process both queues
- [ ] Implement `runQueue` for basic queue processing
- [ ] Implement `runUserEffects` for priority handling
- [ ] Add effect type functions (createComputed, createRenderEffect)
- [ ] Test with diamond dependencies
- [ ] Test with cascading updates

## 🧪 Testing

```typescript
test("memos before effects", () => {
  const [s, setS] = createSignal(1);
  const log: string[] = [];
  
  const memo = createMemo(() => {
    log.push("memo");
    return s() * 2;
  });
  
  createEffect(() => {
    log.push("effect");
    memo();
  });
  
  log.length = 0;
  setS(2);
  
  expect(log).toEqual(["memo", "effect"]);
  // Memo always runs before effect
});

test("consistent diamond reads", () => {
  const [a, setA] = createSignal(1);
  const b = createMemo(() => a() * 2);
  const c = createMemo(() => a() * 3);
  
  let result = 0;
  createEffect(() => {
    result = b() + c();
  });
  
  setA(5);
  expect(result).toBe(25); // 10 + 15, both memos updated
});
```

## 🚀 Next Step

Continue to **[07-memo-implementation.md](./07-memo-implementation.md)** to implement production-ready memos that can have observers.

---

**💡 Pro Tip**: Queue separation is the secret to Solid's "glitch-free" updates. Memos first, effects second = always consistent!
