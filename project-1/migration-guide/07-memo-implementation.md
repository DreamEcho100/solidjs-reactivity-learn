# Step 7: Production-Ready Memo Implementation

## 🎯 Goal
Implement memos as first-class computations that can have observers, enabling efficient derived value chains.

## 🤔 The Difference

### Your Current Implementation
```javascript
function createMemo(fn, opts) {
  const [signal, setSignal] = createSignal(undefined, opts);
  
  createEffect(() => {
    const value = fn();
    setSignal(value);
  });
  
  return signal;
}
```

**Problems:**
- Wrapper overhead (signal + effect)
- Memo can't have observers directly
- Extra layer of indirection
- Less efficient

### Solid.js Approach
```typescript
// Memo IS a Computation AND a SignalState
interface Memo<T> extends SignalState<T>, Computation<T> {
  value: T; // Required (not optional)
  observers: Computation[] | null; // Can have observers!
  pure: true; // Always pure
}
```

## 🏗️ Implementation

### Step 1: Memo Type (Already Done in Step 2)

```typescript
export interface Memo<Prev, Next = Prev> 
  extends SignalState<Next>, Computation<Next> {
  value: Next;
  tOwned?: Computation<Prev | Next, Next>[]; // For transitions
}
```

### Step 2: Create Memo Function

```typescript
export function createMemo<Next extends Prev, Prev = Next>(
  fn: EffectFunction<undefined | NoInfer<Prev>, Next>
): Accessor<Next>;
export function createMemo<Next extends Prev, Init = Next, Prev = Next>(
  fn: EffectFunction<Init | Prev, Next>,
  value: Init,
  options?: MemoOptions<Next>
): Accessor<Next>;
export function createMemo<Next extends Prev, Init, Prev>(
  fn: EffectFunction<Init | Prev, Next>,
  value?: Init,
  options?: MemoOptions<Next>
): Accessor<Next> {
  options = options ? Object.assign({}, signalOptions, options) : signalOptions;

  // Create as computation
  const c: Partial<Memo<Init, Next>> = createComputation(
    fn,
    value!,
    true, // pure = true
    0,    // Start clean (will update immediately)
    options
  ) as Partial<Memo<Init, Next>>;

  // Add signal properties
  c.observers = null;
  c.observerSlots = null;
  c.comparator = options.equals || undefined;
  
  // Initial computation
  updateComputation(c as Memo<Init, Next>);
  
  // Return bound read function
  return readSignal.bind(c as Memo<Init, Next>);
}
```

### Step 3: Update readSignal for Memos

```typescript
export function readSignal(this: SignalState<any> | Memo<any>): any {
  // Check if this is a memo that needs updating
  if ((this as Memo<any>).sources && (this as Memo<any>).state) {
    const memo = this as Memo<any>;
    
    if (memo.state === STALE) {
      // Fully stale, needs recomputation
      updateComputation(memo);
    } else if (memo.state === PENDING) {
      // Waiting for upstream, check dependencies
      const updates = Updates;
      Updates = null;
      runUpdates(() => lookUpstream(memo), false);
      Updates = updates;
    }
  }
  
  // Track dependency (same as before)
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

### Step 4: Memo-Specific Signal Writing

```typescript
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
    if (node.pure) {
      // Pure computation failed, mark stale and clean owned
      node.state = STALE;
      node.owned && node.owned.forEach(cleanNode);
      node.owned = null;
    }
    node.updatedAt = time + 1;
    return handleError(err);
  } finally {
    Listener = listener;
    Owner = owner;
  }
  
  if (!node.updatedAt || node.updatedAt <= time) {
    // If this is a memo with observers, write as signal
    if (node.updatedAt != null && "observers" in node) {
      writeSignal(node as Memo<any>, nextValue, true);
    } else {
      // Regular effect, just store value
      node.value = nextValue;
    }
    
    node.updatedAt = time;
  }
}
```

## 🎨 Complete Example

### Chained Memos

```typescript
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);

// Memo 1: depends on signals
const sum = createMemo(() => {
  console.log("Computing sum");
  return a() + b();
});

// Memo 2: depends on memo 1
const doubled = createMemo(() => {
  console.log("Computing doubled");
  return sum() * 2;
});

// Memo 3: depends on memo 2
const plusTen = createMemo(() => {
  console.log("Computing plusTen");
  return doubled() + 10;
});

// Effect: depends on memo 3
createEffect(() => {
  console.log("Result:", plusTen());
});

// Update signals
batch(() => {
  setA(5);
  setB(10);
});

// Logs:
// Computing sum
// Computing doubled
// Computing plusTen
// Result: 40
```

### Dependency Graph

```
Signal A ──┐
           ├──> Memo(sum) ──> Memo(doubled) ──> Memo(plusTen) ──> Effect
Signal B ──┘

All memos are in Updates queue
Effect is in Effects queue

Execution order guaranteed:
1. sum (STALE)
2. doubled (PENDING → recompute)
3. plusTen (PENDING → recompute)
4. effect (PENDING → recompute)
```

## 🔍 Why This Matters

### 1. Efficient Chains

```typescript
// Without first-class memos (your current):
const a = createSignal(1);
const b = createMemo(() => a() * 2);     // Signal + Effect
const c = createMemo(() => b() * 2);     // Signal + Effect
const d = createMemo(() => c() * 2);     // Signal + Effect

// 3 signals + 3 effects = 6 reactive nodes
// Each memo is TWO primitives

// With first-class memos (Solid.js):
const a = createSignal(1);
const b = createMemo(() => a() * 2);     // Memo
const c = createMemo(() => b() * 2);     // Memo  
const d = createMemo(() => c() * 2);     // Memo

// 1 signal + 3 memos = 4 reactive nodes
// Each memo is ONE primitive
// 33% less overhead!
```

### 2. Direct Observation

```typescript
const count = createSignal(0);
const doubled = createMemo(() => count() * 2);

// Memo can have multiple observers
createEffect(() => console.log("A:", doubled()));
createEffect(() => console.log("B:", doubled()));
createEffect(() => console.log("C:", doubled()));

// doubled.observers = [effectA, effectB, effectC]
// When count changes:
// 1. doubled recomputes ONCE
// 2. All effects see new value
```

### 3. Lazy Evaluation

```typescript
const [trigger, setTrigger] = createSignal(false);

const expensive = createMemo(() => {
  console.log("Expensive computation");
  return heavyCalculation();
});

// Memo created but NOT computed yet
// expensive.state = 0 (clean from initial run)

setTrigger(true); // Some other signal changes
// expensive.state = 0 still (not dependent on trigger)
// No recomputation!

// Only computes when read
if (trigger()) {
  expensive(); // NOW it might recompute if stale
}
```

## ✅ Implementation Checklist

- [ ] Memo extends both SignalState and Computation
- [ ] createMemo creates unified object
- [ ] readSignal checks state before reading
- [ ] Memos added to Updates queue (pure=true)
- [ ] writeSignal called for memo changes
- [ ] Memo observers notified on value change
- [ ] Test memo chains
- [ ] Test lazy evaluation

## 🧪 Testing

```typescript
test("memo is a first-class computation", () => {
  const [s, setS] = createSignal(1);
  const memo = createMemo(() => s() * 2);
  
  // Memo has computation properties
  expect(memo).toHaveProperty('sources');
  expect(memo).toHaveProperty('state');
  
  // And signal properties
  expect(memo).toHaveProperty('observers');
});

test("memo can have observers", () => {
  const [s, setS] = createSignal(1);
  const memo = createMemo(() => s() * 2);
  
  let value = 0;
  createEffect(() => { value = memo(); });
  
  // Memo has the effect as observer
  expect(memo.observers).toContain(effect);
  
  setS(5);
  expect(value).toBe(10);
});

test("memo chains efficiently", () => {
  const [s, setS] = createSignal(1);
  let computations = 0;
  
  const a = createMemo(() => { computations++; return s() * 2; });
  const b = createMemo(() => { computations++; return a() * 2; });
  const c = createMemo(() => { computations++; return b() * 2; });
  
  computations = 0;
  setS(2);
  
  // Read c, which triggers chain
  const result = c();
  
  expect(computations).toBe(3); // Each computed once
  expect(result).toBe(16); // 2 * 2 * 2 * 2
});
```

## 🚀 Next Step

Continue to **[08-root-and-context.md](./08-root-and-context.md)** to implement reactive scopes and context propagation.

---

**💡 Pro Tip**: First-class memos are key to Solid's efficiency. They eliminate wrapper overhead and enable direct observation!
