# Visual Diagrams & Illustrations

## 🎨 Understanding Through Visuals

This document contains ASCII diagrams to help visualize complex reactive concepts.

## 1. Overall System Architecture

### Your Current System
```
┌─────────────────────────────────────────────────────────┐
│                    Global Context                       │
├─────────────────────────────────────────────────────────┤
│  listeners: Effect[]                                    │
│  currentBatchEffects: Set<Effect>                       │
│  batchDepth: number                                     │
└─────────────────────────────────────────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
    ┌────▼─────┐                    ┌───▼────┐
    │  Signal  │                    │ Effect │
    ├──────────┤                    ├────────┤
    │ value: T │                    │execute │
    │subscribers│◄───────────────────┤subscr. │
    └──────────┘                    │cleanups│
                                    └────────┘
```

### Solid.js System
```
┌──────────────────────────────────────────────────────────────┐
│                      Global Context                          │
├──────────────────────────────────────────────────────────────┤
│  Owner: Owner | null                                         │
│  Listener: Computation | null                                │
│  Updates: Computation[] (memos)                              │
│  Effects: Computation[] (effects)                            │
│  ExecCount: number                                           │
│  Transition: TransitionState                                 │
└──────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
   ┌────▼──────┐                              ┌────▼────────┐
   │SignalState│                              │ Computation │
   ├───────────┤                              ├─────────────┤
   │ value: T  │                              │ fn: Function│
   │ observers │◄──────────┐                  │ state: 0|1|2│
   │ observer  │           │                  │ sources     │
   │   Slots   │           └──────────────────┤ sourceSlots │
   │ tValue?: T│                              │ observers   │
   └───────────┘                              │ observerSlots│
                                              │ owner: Owner │
                                              │ owned: Comp[]│
                                              │ value?: T    │
                                              └──────────────┘
```

## 2. Ownership Tree

### Example Tree Structure
```
createRoot(dispose => {
  createEffect(() => {
    const memo = createMemo(() => {});
    createEffect(() => {});
  });
  return dispose;
});

Results in:

        Root
         │
         ├── owned: [Effect1]
         │
    Effect1
         │
         ├── owner: Root
         ├── owned: [Memo1, Effect2]
         │
    ┌────┴────┐
    │         │
  Memo1    Effect2
    │         │
    ├── owner: Effect1
    └── owner: Effect1

Disposal:
  Root.dispose()
    └──> Effect1.dispose()
           ├──> Memo1.dispose()
           └──> Effect2.dispose()
```

### Memory Leak Prevention
```
Without Ownership:
─────────────────────
createEffect(() => {
  createEffect(() => {}); // Orphaned!
});
signal.set(1); // Creates 2nd child
signal.set(2); // Creates 3rd child
signal.set(3); // Creates 4th child

Result: [Child1, Child2, Child3, Child4] all running! 😱

With Ownership:
───────────────
Parent Effect
  │
  └── owned: [Child]

signal.set(1):
  1. cleanNode(Parent)
  2. cleanNode(Child) ← Disposed!
  3. Parent.owned = null
  4. Parent re-executes
  5. NEW Child created
  6. Parent.owned = [NewChild]

Result: Only 1 child at a time! ✅
```

## 3. Bidirectional Tracking

### One-Way (Your Current)
```
Signal A
  ├── subscribers: Set([E1, E2, E3])
  
Effect E1
  └── subscriptions: Set([A, B])

Remove E1 from A:
  A.subscribers.delete(E1)  ← O(n) search in Set

With 10,000 effects: SLOW! 🐌
```

### Bidirectional (Solid.js)
```
Signal A                     Effect E1
  ├── observers: [E1, E2]      ├── sources: [A, B]
  └── observerSlots: [0, 1]    └── sourceSlots: [0, 0]
           │                              │
           └──────────┬───────────────────┘
                      │
            "E1 is at A.observers[0]"
            "A is at E1.sources[0]"

Remove E1 from A:
  1. slot = E1.sourceSlots[0]  // 0
  2. last = A.observers.pop()  // E2
  3. A.observers[0] = last     // Swap
  4. E2.sourceSlots[x] = 0     // Update slot

Result: O(1) removal! 🚀
```

### Detailed Slot Mapping
```
Setup:
  Signal A observes [E1, E2, E3]
  Signal B observes [E1, E3]
  Signal C observes [E2]

  E1 reads A, B
  E2 reads A, C
  E3 reads A, B

Resulting Structure:

A.observers:     [E1, E2, E3]
A.observerSlots: [0,  0,  0]
                  │   │   │
         E1.src[0]│   │   └──E3.src[0]
                  └───────E2.src[0]

B.observers:     [E1, E3]
B.observerSlots: [1,  1]
                  │   │
         E1.src[1]│   └──E3.src[1]

C.observers:     [E2]
C.observerSlots: [1]
                  │
         E2.src[1]

E1.sources:      [A,  B]
E1.sourceSlots:  [0,  0]
                  │   │
         A.obs[0]│   └──B.obs[0]

E2.sources:      [A,  C]
E2.sourceSlots:  [1,  0]
                  │   │
         A.obs[1]│   └──C.obs[0]

E3.sources:      [A,  B]
E3.sourceSlots:  [2,  1]
                  │   │
         A.obs[2]│   └──B.obs[1]
```

## 4. State Machine

### State Transition Diagram
```
                    ┌────────────┐
          ┌─────────│   CLEAN    │
          │         │    (0)     │
          │         └──────┬─────┘
          │                │
          │                │ Signal.write()
          │                │
          │         ┌──────▼─────┐     Check upstream
          │         │   STALE    │────────────────┐
          │         │    (1)     │                │
          │         └──────┬─────┘                │
          │                │                      │
          │                │ Read + upstream OK   │
Recompute │                │                      │
          │         ┌──────▼─────┐                │
          │         │  PENDING   │◄───────────────┘
          │         │    (2)     │  Upstream STALE
          │         └──────┬─────┘
          │                │
          │                │ Upstream updated
          └────────────────┘
```

### Example: Diamond Dependency
```
Initial State:
       A(0)
      ╱    ╲
   B(0)    C(0)
      ╲    ╱
       D(0)

All CLEAN

setA(5):
       A(0)         
      ╱    ╲
   B(1)    C(1)   ← Mark STALE
      ╲    ╱
       D(2)       ← Mark PENDING

Flush Updates:
       A(0)
      ╱    ╲
   B(0)    C(0)   ← Update, become CLEAN
      ╲    ╱
       D(2)       ← Still PENDING

Flush Effects:
       A(0)
      ╱    ╲
   B(0)    C(0)
      ╲    ╱
       D(0)       ← Update, become CLEAN

No glitches! D always sees consistent B and C.
```

## 5. Queue System

### Single Queue (Your Current)
```
batch(() => {
  setA(1);
  setB(2);
});

currentBatchEffects: Set {
  Memo1,
  Effect1,
  Memo2,
  Effect2
}

Flush (random order):
  Memo1  ← might not be first!
  Effect1 ← might see stale Memo2
  Memo2
  Effect2

Possible glitch! 😱
```

### Dual Queue (Solid.js)
```
batch(() => {
  setA(1);
  setB(2);
});

Updates: [Memo1, Memo2]
Effects: [Effect1, Effect2]

Flush Updates first:
  Memo1  ← compute
  Memo2  ← compute

Then flush Effects:
  Effect1 ← sees stable Memo1 and Memo2
  Effect2 ← sees stable Memo1 and Memo2

No glitches! ✅
```

### Visual Flow
```
Signal Changes
      │
      ▼
┌───────────┐
│ writeSignal│
└─────┬─────┘
      │
      ├─────────────────┬─────────────┐
      │                 │             │
  pure=true        pure=false     pure=true
      │                 │             │
      ▼                 ▼             ▼
┌──────────┐      ┌──────────┐  ┌──────────┐
│ Updates  │      │ Effects  │  │ Updates  │
│  Queue   │      │  Queue   │  │  Queue   │
└────┬─────┘      └────┬─────┘  └────┬─────┘
     │                 │             │
     └─────────────────┴─────────────┘
                       │
                       ▼
              ┌────────────────┐
              │ completeUpdates│
              └────────┬───────┘
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
    ┌─────────┐               ┌─────────┐
    │runQueue │               │runQueue │
    │(Updates)│               │(Effects)│
    └─────────┘               └─────────┘
         │                           │
     All memos                   All effects
     computed                    see stable
                                 values
```

## 6. Cleanup Process

### Your Current (Manual)
```
effect.subscriptions: Set([signalA, signalB])

cleanup(effect):
  for (signal of effect.subscriptions):
    signal.subscribers.delete(effect)  ← O(n)
  effect.subscriptions.clear()

With 1000 signals: 1000 × O(n) = SLOW
```

### Solid.js (Automatic + Fast)
```
effect.sources:     [signalA, signalB]
effect.sourceSlots: [2, 0]

cleanNode(effect):
  while (effect.sources.length):
    signal = effect.sources.pop()     ← O(1)
    slot = effect.sourceSlots.pop()   ← O(1)
    
    last = signal.observers.pop()     ← O(1)
    if (slot < signal.observers.length):
      signal.observers[slot] = last   ← O(1) swap
      last.sourceSlots[x] = slot      ← O(1) update

With 1000 signals: 1000 × O(1) = FAST

PLUS: Automatic via ownership tree!
```

### Ownership Cleanup Tree
```
Parent disposes:

Root
 │
 ├─ Effect1
 │   ├─ Memo1 ──────┐
 │   └─ Effect2 ─┐  │
 │               │  │
 Disposal order: │  │
                 3  2
                 │  │
                 ▼  ▼
           [Effect2, Memo1, Effect1, Root]
           
Bottom-up: children before parents
```

## 7. Concurrent Mode (Transitions)

### Normal Update
```
signal.value = 5
      │
      ├─ observers marked STALE
      ├─ queued in Effects
      └─ runUpdates() ← blocks!

UI frozen until complete 😱
```

### With Transition
```
startTransition(() => {
  signal.value = 5
});

signal.tValue = 5  ← temporary value
signal.value unchanged

      │
      ├─ observers marked STALE
      ├─ queued in Transition.queue
      └─ scheduled (non-blocking)

UI stays responsive! ✅

Later (when idle):
  Transition completes
  signal.value = signal.tValue
  UI updates smoothly
```

### Visual State
```
Before Transition:
  Signal: { value: 1, tValue: undefined }
  
During Transition:
  Signal: { value: 1, tValue: 5 }
  ├─ Normal reads: get value (1)
  └─ Transition reads: get tValue (5)
  
After Transition:
  Signal: { value: 5, tValue: undefined }
```

## 8. Complete Example: Data Flow

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

batch(() => {
  setA(5);
  setB(10);
});
```

### Data Flow Diagram
```
Step 1: Initial creation
  a ──┐
      ├──> sum ──> doubled ──> effect
  b ──┘
  
Step 2: batch() starts
  ExecCount++
  Updates = []
  Effects = []

Step 3: setA(5)
  a.value = 5
  sum.state = STALE
  Updates.push(sum)
  
Step 4: setB(10)
  b.value = 10
  sum.state = STALE (already!)
  (not added again)

Step 5: markDownstream(sum)
  doubled.state = PENDING
  Updates.push(doubled)
  
Step 6: markDownstream(doubled)
  effect.state = PENDING
  Effects.push(effect)

Step 7: batch() ends
  completeUpdates()
  
Step 8: Flush Updates
  runQueue([sum, doubled])
    sum: STALE → recompute → CLEAN
      Logs: "Computing sum"
      sum.value = 15
    doubled: PENDING → lookUpstream → recompute → CLEAN
      Logs: "Computing doubled"
      doubled.value = 30
      
Step 9: Flush Effects
  runQueue([effect])
    effect: PENDING → lookUpstream → recompute → CLEAN
      Logs: "Result: 30"

Final state:
  All CLEAN
  All values consistent
  Logged in correct order
```

---

**💡 Tip**: Print these diagrams and keep them nearby while implementing. Visual understanding makes complex concepts much easier!
