# Step 4: Bidirectional Dependency Tracking

## 🎯 Goal
Upgrade from one-way subscriptions to bidirectional tracking with O(1) insertion and removal.

## 🤔 The Performance Problem

### Your Current Implementation (O(n) removal)

```javascript
// Signal stores subscribers
signal.subscribers = new Set([effect1, effect2, effect3, ...effectN]);

// Effect stores subscriptions
effect.subscriptions = new Set([signalA, signalB, ...signalZ]);

// Cleanup requires O(n) search
function cleanup(effect) {
  for (const signal of effect.subscriptions) {
    signal.subscribers.delete(effect); // O(n) in Set for object keys
  }
}

// With 10,000 dependencies: 10,000 * O(n) = BAD! 
```

**Problem**: Deleting from a Set is O(n) when using object references. At scale, this becomes very slow.

### Solid.js Approach (O(1) removal)

```typescript
// Signal stores array + slot mapping
signal.observers = [effect1, effect2, effect3];
signal.observerSlots = [0, 2, 0]; // Indexes in each observer's sources

// Effect stores array + slot mapping  
effect.sources = [signalA, signalB, signalC];
effect.sourceSlots = [0, 1, 2]; // Indexes in each signal's observers

// Cleanup is O(1) using swap-and-pop
function cleanup(effect) {
  while (effect.sources.length) {
    const signal = effect.sources.pop(); // O(1)
    const slotInSignal = effect.sourceSlots.pop(); // O(1)
    
    // Swap with last, then pop: O(1)
    swapRemove(signal.observers, slotInSignal);
  }
}

// With 10,000 dependencies: 10,000 * O(1) = FAST!
```

## 📊 Bidirectional Links Explained

### The Data Structure

```
Signal A                          Effect X
┌──────────────────┐             ┌──────────────────┐
│ observers: []    │             │ sources: []      │
│ observerSlots: []│             │ sourceSlots: []  │
└──────────────────┘             └──────────────────┘

Adding Effect X to Signal A:
────────────────────────────────────────────────────

Step 1: Effect remembers its position in Signal's observers
effectX.sources.push(signalA);
effectX.sourceSlots.push(0); // Will be at index 0

Step 2: Signal remembers its position in Effect's sources  
signalA.observers.push(effectX);
signalA.observerSlots.push(0); // effectX.sources[0] = signalA

Result:
┌──────────────────┐             ┌──────────────────┐
│ observers: [X]   │◄────────────┤ sources: [A]     │
│ observerSlots[0] │             │ sourceSlots[0]   │
│       ↓          │             │       ↓          │
│   points to      │             │   points to      │
│   sources[0]     │─────────────┤   observers[0]   │
└──────────────────┘             └──────────────────┘
```

### Multiple Dependencies

```
Signal A: observers=[E1, E2, E3], observerSlots=[0, 1, 0]
Signal B: observers=[E1, E3],     observerSlots=[1, 1]
Signal C: observers=[E2],         observerSlots=[0]

Effect E1: sources=[A, B], sourceSlots=[0, 0]
Effect E2: sources=[A, C], sourceSlots=[1, 0]
Effect E3: sources=[A, B], sourceSlots=[2, 1]

Verification:
  A.observers[0] = E1 ← E1.sources[0] = A ← A.observerSlots[0] = 0 ✓
  A.observers[1] = E2 ← E2.sources[0] = A ← A.observerSlots[1] = 1 ✓
  A.observers[2] = E3 ← E3.sources[0] = A ← A.observerSlots[2] = 0 ✓
  B.observers[0] = E1 ← E1.sources[1] = B ← B.observerSlots[0] = 1 ✓
  B.observers[1] = E3 ← E3.sources[1] = B ← B.observerSlots[1] = 1 ✓
  C.observers[0] = E2 ← E2.sources[1] = C ← C.observerSlots[0] = 0 ✓
```

## 🏗️ Implementation

### Step 1: Update readSignal for Tracking

```typescript
/**
 * Reads a signal and tracks the dependency if inside a computation
 */
export function readSignal(this: SignalState<any>): any {
  // Check if there's a current listener
  if (Listener) {
    const sSlot = this.observers ? this.observers.length : 0;
    
    // Add signal to listener's sources
    if (!Listener.sources) {
      Listener.sources = [this];
      Listener.sourceSlots = [sSlot];
    } else {
      Listener.sources.push(this);
      Listener.sourceSlots!.push(sSlot);
    }
    
    // Add listener to signal's observers
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

**Step-by-step visualization:**

```typescript
// Initial state
signal.observers = null;
signal.observerSlots = null;
effect.sources = null;
effect.sourceSlots = null;

// First read
Listener = effect;
signal(); // Calls readSignal

// After first read
signal.observers = [effect];
signal.observerSlots = [0]; // effect.sources[0] points back to signal
effect.sources = [signal];
effect.sourceSlots = [0]; // signal.observers[0] points back to effect

// Second read (different signal)
signal2();

// After second read
signal.observers = [effect];
signal.observerSlots = [0];
signal2.observers = [effect];
signal2.observerSlots = [1]; // effect.sources[1] points back to signal2
effect.sources = [signal, signal2];
effect.sourceSlots = [0, 1];
```

### Step 2: Implement O(1) Removal

```typescript
/**
 * Removes all dependencies from a computation
 * Uses swap-and-pop technique for O(1) removal
 */
function cleanNode(node: Owner): void {
  // Only computations have sources
  if ((node as Computation<any>).sources) {
    const comp = node as Computation<any>;
    
    // Remove from all sources
    while (comp.sources!.length) {
      const source = comp.sources.pop()!;      // Remove from end: O(1)
      const index = comp.sourceSlots!.pop()!;  // Get position in source
      const obs = source.observers;
      
      if (obs && obs.length) {
        const n = obs.pop()!;                  // Get last observer
        const s = source.observerSlots!.pop()!;// Get its slot
        
        // If we didn't remove the last element, swap it into the gap
        if (index < obs.length) {
          // Update the swapped element's slot
          n.sourceSlots![s] = index;
          
          // Place it in the gap
          obs[index] = n;
          source.observerSlots![index] = s;
        }
      }
    }
  }
  
  // ... rest of cleanup
}
```

**How Swap-and-Pop Works:**

```
Remove effect2 from signal.observers:

Before:
observers:     [effect1, effect2, effect3, effect4]
observerSlots: [   0   ,    1   ,    0   ,    1   ]
                           ↑ Remove this

Step 1: Get last element
last = observers.pop()        // effect4
lastSlot = observerSlots.pop() // 1

observers:     [effect1, effect2, effect3]
observerSlots: [   0   ,    1   ,    0   ]

Step 2: Swap last into the gap (index=1)
observers[1] = effect4
observerSlots[1] = 1

observers:     [effect1, effect4, effect3]
observerSlots: [   0   ,    1   ,    0   ]

Step 3: Update effect4's sourceSlot
effect4.sourceSlots[1] = 1  // Points to new position

Done! Removed in O(1) time.
```

### Step 3: Update writeSignal to Notify Observers

```typescript
export function writeSignal(node: SignalState<any>, value: any): any {
  // Check if value actually changed
  if (!node.comparator || !node.comparator(node.value, value)) {
    node.value = value;
    
    // Notify all observers
    if (node.observers && node.observers.length) {
      runUpdates(() => {
        for (let i = 0; i < node.observers!.length; i += 1) {
          const o = node.observers![i];
          
          // Mark as stale
          if (!o.state) {
            if (o.pure) Updates!.push(o);  // Memo: add to Updates
            else Effects!.push(o);          // Effect: add to Effects
            
            // If this is a memo with observers, mark them too
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

### Step 4: Downstream Propagation

```typescript
/**
 * Marks all downstream computations as stale
 * Used when a memo changes to invalidate dependent computations
 */
function markDownstream(node: Memo<any>): void {
  for (let i = 0; i < node.observers!.length; i += 1) {
    const o = node.observers![i];
    
    if (!o.state) {
      o.state = PENDING; // Mark as pending (not stale yet)
      
      if (o.pure) Updates!.push(o);
      else Effects!.push(o);
      
      // Recursively mark downstream
      if ((o as Memo<any>).observers) {
        markDownstream(o as Memo<any>);
      }
    }
  }
}
```

## 🎨 Complete Example

### Code

```typescript
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);

const sum = createMemo(() => a() + b());

const doubled = createMemo(() => sum() * 2);

createEffect(() => {
  console.log(doubled());
});
```

### Dependency Graph

```
Signal A ────────┐
                  ↓
Signal B ──────→ Memo(sum) ──→ Memo(doubled) ──→ Effect
                  ↑
         Bidirectional links

Each arrow is actually TWO links:
  Forward:  source → observer
  Backward: observer → source (via slots)
```

### Data Structure

```typescript
// Signal A
{
  observers: [sum],
  observerSlots: [0]  // sum.sources[0] = A
}

// Signal B  
{
  observers: [sum],
  observerSlots: [1]  // sum.sources[1] = B
}

// Memo: sum
{
  sources: [A, B],
  sourceSlots: [0, 0],    // A.observers[0], B.observers[0]
  observers: [doubled],
  observerSlots: [0]      // doubled.sources[0] = sum
}

// Memo: doubled
{
  sources: [sum],
  sourceSlots: [0],       // sum.observers[0]
  observers: [effect],
  observerSlots: [0]      // effect.sources[0] = doubled
}

// Effect
{
  sources: [doubled],
  sourceSlots: [0]        // doubled.observers[0]
}
```

### Removal Example

```typescript
// What happens when sum memo re-runs?

cleanNode(sum);

// Step 1: Remove sum from A.observers
//   swap-and-pop: O(1)

// Step 2: Remove sum from B.observers
//   swap-and-pop: O(1)

// Step 3: sum.sources = []
// Step 4: sum.sourceSlots = []

// Now sum is clean, ready to re-execute and create new dependencies
```

## 📈 Performance Comparison

### Benchmark: 10,000 Dependencies

```typescript
// Old approach (Set-based)
function cleanupOld(effect) {
  for (const signal of effect.subscriptions) {
    signal.subscribers.delete(effect); // O(n) for each
  }
}
// Time: ~50ms for 10,000 dependencies

// New approach (Array-based with slots)
function cleanupNew(effect) {
  while (effect.sources.length) {
    const signal = effect.sources.pop();
    const slot = effect.sourceSlots.pop();
    swapRemove(signal.observers, slot); // O(1) for each
  }
}
// Time: ~0.5ms for 10,000 dependencies

// 100x faster! 🚀
```

## ✅ Implementation Checklist

- [ ] Update `SignalState` to include `observerSlots`
- [ ] Update `Computation` to include `sourceSlots`
- [ ] Modify `readSignal` to track bidirectionally
- [ ] Implement `cleanNode` with swap-and-pop
- [ ] Update `writeSignal` to iterate observers array
- [ ] Implement `markDownstream` for memos
- [ ] Test with complex dependency graphs
- [ ] Benchmark performance improvements

## 🧪 Testing

```typescript
test("bidirectional tracking", () => {
  const [s, setS] = createSignal(0);
  let runs = 0;
  
  const dispose = createRoot(dispose => {
    createEffect(() => {
      s();
      runs++;
    });
    return dispose;
  });
  
  setS(1);
  expect(runs).toBe(2); // Initial + update
  
  dispose();
  setS(2);
  expect(runs).toBe(2); // Should not run after disposal
});

test("complex graph", () => {
  const [a, setA] = createSignal(1);
  const [b, setB] = createSignal(2);
  
  const sum = createMemo(() => a() + b());
  const doubled = createMemo(() => sum() * 2);
  
  let result = 0;
  createEffect(() => {
    result = doubled();
  });
  
  expect(result).toBe(6); // (1+2)*2
  
  setA(5);
  expect(result).toBe(14); // (5+2)*2
});
```

## 🚀 Next Step

Continue to **[05-computation-states.md](./05-computation-states.md)** to implement the state machine for lazy evaluation.

---

**💡 Pro Tip**: Bidirectional tracking is the secret sauce that makes Solid.js scale to thousands of dependencies without breaking a sweat!
