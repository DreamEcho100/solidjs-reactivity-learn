# Step 1: Core Architecture Understanding

## 🎯 Goal
Understand the fundamental architectural differences between your implementation and Solid.js.

## 📊 Architecture Comparison

### Your Current Architecture

```
┌─────────────────────────────────────┐
│         Global Context              │
├─────────────────────────────────────┤
│ listeners: Effect[]                 │
│ currentCleanups: Function[]         │
│ currentBatchEffects: Set<Effect>?   │
│ batchDepth: number                  │
└─────────────────────────────────────┘
           │
           ├── Signal
           │   ├── value: T
           │   ├── subscribers: Set<Effect>
           │   └── equals: Function
           │
           └── Effect
               ├── execute: Function
               ├── subscriptions: Set<Signal>
               └── cleanups: Function[]
```

### Solid.js Architecture

```
┌─────────────────────────────────────┐
│         Global Context              │
├─────────────────────────────────────┤
│ Owner: Owner | null                 │
│ Listener: Computation | null        │
│ Updates: Computation[]              │
│ Effects: Computation[]              │
│ Transition: TransitionState         │
│ Scheduler: Function                 │
└─────────────────────────────────────┘
           │
           ├── SignalState<T>
           │   ├── value: T
           │   ├── observers: Computation[]
           │   ├── observerSlots: number[]
           │   ├── tValue?: T (transition)
           │   └── comparator?: Function
           │
           ├── Computation<T>
           │   ├── fn: Function
           │   ├── state: 0 | 1 | 2
           │   ├── sources: SignalState[]
           │   ├── sourceSlots: number[]
           │   ├── observers: Computation[]
           │   ├── observerSlots: number[]
           │   ├── value?: T
           │   ├── owned: Computation[]
           │   ├── cleanups: Function[]
           │   ├── owner: Owner
           │   ├── context: any
           │   └── pure: boolean
           │
           └── Owner
               ├── owned: Computation[]
               ├── cleanups: Function[]
               ├── owner: Owner | null
               └── context: any
```

## 🔍 Key Architectural Differences

### 1. **Unified Computation Model**

**Your Implementation:**
```typescript
// Separate types for different reactive primitives
type Effect = {
  execute: () => void;
  subscriptions: Set<SignalGetter>;
  cleanups: (() => void)[];
};

// Memos are built on top of effects
function createMemo(fn) {
  const [signal, setSignal] = createSignal(undefined);
  createEffect(() => setSignal(fn()));
  return signal;
}
```

**Solid.js:**
```typescript
// Single Computation type for ALL reactive computations
interface Computation<T> extends Owner {
  fn: (prev: T) => T;
  state: ComputationState;
  sources: SignalState[];
  observers: Computation[];
  value?: T;
  pure: boolean; // true for memos, false for effects
  // ... more fields
}

// Memos ARE computations with pure=true
// Effects ARE computations with pure=false
```

**Why This Matters:**
- **Simpler code**: One type handles effects, memos, and render effects
- **Better performance**: No wrapper overhead
- **More features**: Memos can have observers (computed from memos)

### 2. **Ownership Hierarchy**

**Your Implementation:**
```typescript
// No ownership - effects are independent
const listeners = []; // Flat stack

createEffect(() => {
  createEffect(() => {
    // No relationship tracked between parent and child
  });
});
```

**Solid.js:**
```typescript
// Owner tracks children
let Owner: Owner | null = null;

interface Owner {
  owned: Computation[] | null;  // Child computations
  owner: Owner | null;           // Parent owner
  cleanups: (() => void)[];      // Cleanup functions
  context: any;                  // Context values
}

createEffect(() => {
  // Owner is set to this effect
  createEffect(() => {
    // This effect's owner is the parent effect
    // Automatic disposal when parent disposes!
  });
});
```

**Why This Matters:**
- **Memory safety**: Child computations automatically dispose
- **Context propagation**: Values flow down the tree
- **Debugging**: Can inspect the entire reactive graph

### 3. **Bidirectional Graph Links**

**Your Implementation:**
```typescript
// One-way links only
signal.subscribers = [effect1, effect2]; // Signal → Effects ✅
effect.subscriptions = [signalA, signalB]; // Effect → Signals ✅

// But no positional tracking
// To remove effect from signal: O(n) search
```

**Solid.js:**
```typescript
// Two-way links WITH position tracking
signal.observers = [effect1, effect2, effect3];
signal.observerSlots = [0, 1, 0]; // Position in each observer's sources

effect.sources = [signalA, signalB];
effect.sourceSlots = [2, 0]; // Position in each signal's observers

// To remove: O(1) swap with last element!
```

**Visual Example:**
```
Signal A                    Effect
observers: [E1, E2, E3]     sources: [A, B]
observerSlots: [0, 1, 0] ←→ sourceSlots: [2, 0]
              ↓                           ↓
         E1.sources[0]=A            A.observers[2]=Effect
         E2.sources[1]=A            
         E3.sources[0]=A            
```

**Why This Matters:**
- **Performance**: O(1) removal vs O(n)
- **Correctness**: No stale subscriptions
- **Scale**: Thousands of dependencies no problem

### 4. **State Machine for Computations**

**Your Implementation:**
```typescript
// No explicit state - just run when needed
effect.execute(); // Always recomputes
```

**Solid.js:**
```typescript
enum ComputationState {
  Clean = 0,    // Up to date
  STALE = 1,    // Needs recomputation
  PENDING = 2   // Waiting for upstream updates
}

// Only recompute if STALE
if (computation.state === STALE) {
  updateComputation(computation);
}
```

**State Transitions:**
```
        Signal Update
            ↓
   [0] ────────────→ [1 STALE]
    ↑                    ↓
    │              Check Upstream
    │                    ↓
    │              Upstream STALE?
    │              ╱            ╲
    └─────── NO ──┘              └── YES → [2 PENDING]
   Recompute                              Wait...
```

**Why This Matters:**
- **Lazy evaluation**: Only recompute when accessed
- **Glitch-free**: Prevents temporary inconsistent states
- **Efficiency**: Skip unnecessary work

### 5. **Multi-Queue Effect System**

**Your Implementation:**
```typescript
// Single Set for all effects
currentBatchEffects = new Set<Effect>();

// All effects treated equally
for (const effect of effects) {
  effect.execute();
}
```

**Solid.js:**
```typescript
// Multiple queues for different priorities
let Updates: Computation[] | null = null;  // Pure computations (memos)
let Effects: Computation[] | null = null;  // Side effects

// Process in order:
// 1. Updates (memos) first - compute derived values
// 2. Effects second - run side effects with stable values

function completeUpdates() {
  if (Updates) runQueue(Updates);  // Memos first
  if (Effects) runEffects(Effects); // Then effects
}
```

**Execution Flow:**
```
Signal Change
     ↓
Add to Updates queue (if computation.pure)
Add to Effects queue (if !computation.pure)
     ↓
Flush Updates
     ↓
[Memo1, Memo2, Memo3] ← All memos compute
     ↓
Flush Effects
     ↓
[Effect1, Effect2] ← Run with stable memo values
```

**Why This Matters:**
- **Correctness**: Effects see consistent derived state
- **Predictability**: Memos always update before effects
- **Performance**: Batch similar work together

## 🛠️ Migration Strategy

### Phase 1: Add Types (Next Step)
Define all the TypeScript interfaces without implementing them yet.

### Phase 2: Parallel Implementation
Keep your current code working while building the new system alongside.

### Phase 3: Gradual Migration
Replace one primitive at a time:
1. Signals
2. Effects
3. Memos
4. Batch

### Phase 4: Test & Validate
Ensure all existing tests pass with new implementation.

## 📝 Key Takeaways

1. **Computation is central**: Everything is a Computation in Solid.js
2. **Ownership prevents leaks**: Parent-child relationships auto-cleanup
3. **Bidirectional is faster**: O(1) operations at scale
4. **States enable laziness**: Don't recompute unless needed
5. **Multiple queues ensure order**: Memos before effects

## ✅ Checkpoint

Before moving to the next step, make sure you understand:

- [ ] Why Computation unifies effects and memos
- [ ] How ownership prevents memory leaks
- [ ] Why bidirectional links are faster
- [ ] What the three computation states mean
- [ ] Why memos process before effects

## 🚀 Next Step

Continue to **[02-type-system.md](./02-type-system.md)** to define all the TypeScript types and interfaces you'll need.

---

**💡 Pro Tip**: Don't rush this step. A solid understanding of the architecture will make the implementation much easier!
