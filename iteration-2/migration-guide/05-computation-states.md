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
  setFirstName("Jane"); // fullName = "Jane Doe" (inconsistent!)
  setLastName("Smith"); // fullName = "Jane Smith" (correct)
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
export const STALE = 1; // Needs recomputation
export const PENDING = 2; // Waiting for upstream

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

  state: ComputationState; // ← Add this
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
            if (o.pure) Updates!.push(o); // Memos first
            else Effects!.push(o); // Effects second

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
        if (
          source !== ignore &&
          (!source.updatedAt || source.updatedAt < ExecCount)
        ) {
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

````typescript
/**
 * Updates a computation with TOPOLOGICAL ORDERING
 *
 * Topological ordering means: **Parents update before children**
 * This prevents glitches by ensuring consistent values.
 *
 * How it works:
 * 1. Start with the computation that needs updating (e.g., quadrupled)
 * 2. Walk UP the ownership chain collecting stale ancestors (e.g., doubled, sum)
 * 3. Process in REVERSE order = parents first (sum → doubled → quadrupled)
 *
 * Example:
 * ```
 * signal
 *   ↓
 * sum (owner of doubled)        ← Level 1 (grandparent)
 *   ↓
 * doubled (owner of quadrupled) ← Level 2 (parent)
 *   ↓
 * quadrupled                    ← Level 3 (child)
 * ```
 *
 * When quadrupled needs updating:
 * - ancestors = [quadrupled, doubled, sum]  ← Collected bottom-up
 * - Process: sum → doubled → quadrupled     ← Execute top-down (reversed)
 */
function runTop(node: Computation<any>): void {
  // Fast path: Already up-to-date?
  if (node.state === 0) return;

  // If pending, just check upstream and return
  if (node.state === PENDING) return lookUpstream(node);

  /**
   * PHASE 1: COLLECT ANCESTORS (Walk UP the chain)
   * ===============================================
   * We start with the current node and walk up the ownership chain,
   * collecting any ancestors that are stale (outdated).
   *
   * Think of it like climbing a family tree to find who needs updating.
   */
  const ancestors = [node]; // Start with current node (e.g., [quadrupled])

  /**
   * Walk up the ownership chain:
   * - node.owner = parent computation that owns this one
   * - Keep going until we hit the root or find a current ancestor
   *
   * Example walk:
   * 1. node = quadrupled (updatedAt = 0, ExecCount = 1) → 0 < 1 ✓ stale
   * 2. node = doubled (updatedAt = 0, ExecCount = 1) → 0 < 1 ✓ stale
   * 3. node = sum (updatedAt = 1, ExecCount = 1) → 1 < 1 ✗ current, STOP
   *
   * Result: ancestors = [quadrupled, doubled, sum]
   */
  while (
    (node = node.owner as Computation<any>) &&
    (!node.updatedAt || node.updatedAt < ExecCount)
  ) {
    // Only add if it needs updating (not CLEAN)
    if (node.state) ancestors.push(node);
  }

  /**
   * Now ancestors contains (bottom-up):
   * [child, parent, grandparent, ...]
   * Example: [quadrupled, doubled, sum]
   */

  /**
   * PHASE 2: UPDATE TOP-DOWN (Process in order)
   * ============================================
   * We collected children first (bottom-up), but now we process
   * parents first (top-down) to ensure consistency.
   *
   * Why? If we updated quadrupled first, it would read stale doubled!
   * By updating sum → doubled → quadrupled, each sees consistent parents.
   */
  for (let i = ancestors.length - 1; i >= 0; i--) {
    /**
     * Process in REVERSE order (top-down):
     * i = 2: sum        ← Grandparent first
     * i = 1: doubled    ← Parent second
     * i = 0: quadrupled ← Child last
     *
     * This guarantees: Parents are always CLEAN when children read them!
     */
    node = ancestors[i];

    if (node.state === STALE) {
      // Fully outdated - recompute now
      updateComputation(node);
    } else if (node.state === PENDING) {
      // Waiting for dependencies - check them first
      const updates = Updates;
      Updates = null;
      runUpdates(() => lookUpstream(node, ancestors[0]), false);
      Updates = updates;
    }
  }

  /**
   * Result: All ancestors are now CLEAN and consistent!
   * ✅ sum.value = 15
   * ✅ doubled.value = 30 (uses fresh sum)
   * ✅ quadrupled.value = 60 (uses fresh doubled)
   *
   * No glitches - all values are consistent! 🎉
   */
}
````

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

    node.updatedAt = time; // Mark as updated
    node.state = 0; // Mark as clean
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
  setX(5); // sum.state = STALE
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

### How runTop Guarantees Correct Execution Order

The **two-phase algorithm** (collect bottom-up, execute top-down) provides strong ordering guarantees:

#### The Guarantee

**Property:** When a computation executes, ALL its dependencies have already been updated to their latest values.

**Why it works:**

1. **Ownership hierarchy reflects dependencies**: If B depends on A, then A is B's owner (or ancestor)
2. **Bottom-up collection**: Walking up the owner chain collects ALL ancestors
3. **Top-down execution**: Processing in reverse ensures parents before children

#### Proof by Example

```typescript
// Dependency graph:
// signal → sum → doubled → quadrupled
//
// Ownership:
// sum.owner = null (root)
// doubled.owner = sum
// quadrupled.owner = doubled

const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);

const sum = createMemo(() => {
  console.log("Computing sum");
  return a() + b(); // Depends on: a, b
});

const doubled = createMemo(() => {
  console.log("Computing doubled");
  return sum() * 2; // Depends on: sum
});

const quadrupled = createMemo(() => {
  console.log("Computing quadrupled");
  return doubled() * 2; // Depends on: doubled
});

// When quadrupled is accessed:
quadrupled();

// Phase 1: Collect ancestors (bottom-up walk)
const ancestors = [];
let node = quadrupled;
ancestors.push(node); // [quadrupled]

node = node.owner; // doubled
ancestors.push(node); // [quadrupled, doubled]

node = node.owner; // sum
ancestors.push(node); // [quadrupled, doubled, sum]

node = node.owner; // null (stop)

// Phase 2: Execute top-down (reverse iteration)
for (let i = ancestors.length - 1; i >= 0; i--) {
  updateComputation(ancestors[i]);
}

// Execution order:
// i = 2: sum updates        ← All dependencies (a, b) are fresh
// i = 1: doubled updates    ← sum is now fresh (just updated)
// i = 0: quadrupled updates ← doubled is now fresh (just updated)
```

**The invariant:** At each step `i`, we update `ancestors[i]`, and all its dependencies (`ancestors[i+1]`, `ancestors[i+2]`, etc.) have already been updated in previous iterations.

#### Real-World Example: E-Commerce Shopping Cart

Let's see a complex real-world scenario with multiple dependencies:

```typescript
// ============================================
// SCENARIO: E-Commerce Shopping Cart System
// ============================================

// Base signals (user input)
const [items, setItems] = createSignal([
  { id: 1, name: "Laptop", price: 1000, quantity: 1 },
  { id: 2, name: "Mouse", price: 50, quantity: 2 },
  { id: 3, name: "Keyboard", price: 100, quantity: 1 },
]);

const [discountCode, setDiscountCode] = createSignal("SAVE20"); // 20% off
const [shippingZone, setShippingZone] = createSignal("domestic");
const [taxRate, setTaxRate] = createSignal(0.08); // 8% sales tax

// ============================================
// LEVEL 1: Basic calculations (depend on signals)
// ============================================

const subtotal = createMemo(() => {
  console.log("📊 Computing subtotal");
  return items().reduce((sum, item) => {
    return sum + item.price * item.quantity;
  }, 0);
  // Depends on: items
});
// subtotal.owner = null (root level)

const discountAmount = createMemo(() => {
  console.log("💰 Computing discount");
  const code = discountCode();
  const sub = subtotal();

  if (code === "SAVE20") return sub * 0.2;
  if (code === "SAVE10") return sub * 0.1;
  return 0;
  // Depends on: discountCode, subtotal
});
// discountAmount.owner = subtotal (has subtotal as ancestor)

const shippingCost = createMemo(() => {
  console.log("🚚 Computing shipping");
  const zone = shippingZone();
  const sub = subtotal();

  if (sub > 500) return 0; // Free shipping over $500
  if (zone === "domestic") return 10;
  if (zone === "international") return 50;
  return 25;
  // Depends on: shippingZone, subtotal
});
// shippingCost.owner = subtotal

// ============================================
// LEVEL 2: Intermediate calculations
// ============================================

const subtotalAfterDiscount = createMemo(() => {
  console.log("💵 Computing subtotal after discount");
  return subtotal() - discountAmount();
  // Depends on: subtotal, discountAmount
});
// subtotalAfterDiscount.owner = discountAmount

const taxableAmount = createMemo(() => {
  console.log("📋 Computing taxable amount");
  return subtotalAfterDiscount() + shippingCost();
  // Depends on: subtotalAfterDiscount, shippingCost
});
// taxableAmount.owner = subtotalAfterDiscount

// ============================================
// LEVEL 3: Final calculations
// ============================================

const taxAmount = createMemo(() => {
  console.log("🧾 Computing tax");
  return taxableAmount() * taxRate();
  // Depends on: taxableAmount, taxRate
});
// taxAmount.owner = taxableAmount

const totalCost = createMemo(() => {
  console.log("💳 Computing TOTAL");
  return taxableAmount() + taxAmount();
  // Depends on: taxableAmount, taxAmount
});
// totalCost.owner = taxAmount

// ============================================
// LEVEL 4: UI updates (effects)
// ============================================

createEffect(() => {
  console.log("\n🎨 Updating cart summary UI:");
  console.log(`  Subtotal: $${subtotal().toFixed(2)}`);
  console.log(`  Discount: -$${discountAmount().toFixed(2)}`);
  console.log(`  Shipping: $${shippingCost().toFixed(2)}`);
  console.log(`  Tax: $${taxAmount().toFixed(2)}`);
  console.log(`  ════════════════════════════`);
  console.log(`  TOTAL: $${totalCost().toFixed(2)}\n`);
});

// ============================================
// USER UPDATES CART
// ============================================

console.log("\n🛒 User adds 2 more laptops...\n");

setItems([
  { id: 1, name: "Laptop", price: 1000, quantity: 3 }, // Changed: 1 → 3
  { id: 2, name: "Mouse", price: 50, quantity: 2 },
  { id: 3, name: "Keyboard", price: 100, quantity: 1 },
]);

// ============================================
// WHAT HAPPENS: Topological Ordering in Action
// ============================================

/*
Dependency Graph:

    items, discountCode, shippingZone, taxRate (SIGNALS)
      ↓         ↓              ↓            ↓
    subtotal ←─┴──────────────┘            │
      ↓  ↓                                  │
      │  discountAmount                     │
      │     ↓                               │
      │  subtotalAfterDiscount              │
      │     ↓              ↓                │
      └─→ taxableAmount ←─ shippingCost    │
            ↓                               │
          taxAmount ←───────────────────────┘
            ↓       ↓
          totalCost ←┘
            ↓
          effect (UI update)

Ownership Hierarchy:

  null (root)
    └─ subtotal
        ├─ discountAmount
        │   └─ subtotalAfterDiscount
        │       └─ taxableAmount
        │           └─ taxAmount
        │               └─ totalCost
        │                   └─ effect
        └─ shippingCost

*/

// When effect is accessed (to re-run):
// runTop(effect) is called

// PHASE 1: Collect ancestors (walk UP the ownership chain)
let node = effect;
const ancestors = [effect]; // Start with effect

node = node.owner; // taxAmount
if (node.state === STALE || node.state === PENDING) {
  ancestors.push(node); // [effect, taxAmount]
}

node = node.owner; // totalCost
if (node.state === STALE || node.state === PENDING) {
  ancestors.push(node); // [effect, taxAmount, totalCost]
}

node = node.owner; // taxableAmount
if (node.state === STALE || node.state === PENDING) {
  ancestors.push(node); // [effect, taxAmount, totalCost, taxableAmount]
}

node = node.owner; // subtotalAfterDiscount
if (node.state === STALE || node.state === PENDING) {
  ancestors.push(node); // [..., subtotalAfterDiscount]
}

node = node.owner; // discountAmount
if (node.state === STALE || node.state === PENDING) {
  ancestors.push(node); // [..., discountAmount]
}

node = node.owner; // subtotal
if (node.state === STALE || node.state === PENDING) {
  ancestors.push(node); // [..., subtotal]
}

node = node.owner; // null (stop)

// Result: [effect, taxAmount, totalCost, taxableAmount,
//          subtotalAfterDiscount, discountAmount, subtotal]

// PHASE 2: Execute top-down (REVERSE order)
for (let i = ancestors.length - 1; i >= 0; i--) {
  updateComputation(ancestors[i]);
}

/*
Execution Order (what you'll see in console):

i = 6: 📊 Computing subtotal
       → subtotal = 3200 (3 laptops + mouse + keyboard)
       → subtotal.state = CLEAN ✅
       → All downstream can now safely read this value

i = 5: 💰 Computing discount
       → discountAmount = 640 (20% of 3200)
       → Uses fresh subtotal (3200) ✅
       → discountAmount.state = CLEAN ✅

i = 4: 💵 Computing subtotal after discount
       → subtotalAfterDiscount = 2560 (3200 - 640)
       → Uses fresh subtotal (3200) ✅
       → Uses fresh discountAmount (640) ✅
       → subtotalAfterDiscount.state = CLEAN ✅

       🚚 Computing shipping
       → shippingCost = 0 (free over $500)
       → Uses fresh subtotal (3200) ✅
       → shippingCost.state = CLEAN ✅

i = 3: 📋 Computing taxable amount
       → taxableAmount = 2560 (2560 + 0)
       → Uses fresh subtotalAfterDiscount (2560) ✅
       → Uses fresh shippingCost (0) ✅
       → taxableAmount.state = CLEAN ✅

i = 2: 🧾 Computing tax
       → taxAmount = 204.80 (2560 * 0.08)
       → Uses fresh taxableAmount (2560) ✅
       → taxAmount.state = CLEAN ✅

i = 1: 💳 Computing TOTAL
       → totalCost = 2764.80 (2560 + 204.80)
       → Uses fresh taxableAmount (2560) ✅
       → Uses fresh taxAmount (204.80) ✅
       → totalCost.state = CLEAN ✅

i = 0: 🎨 Updating cart summary UI
       → Subtotal: $3200.00 ✅
       → Discount: -$640.00 ✅
       → Shipping: $0.00 ✅
       → Tax: $204.80 ✅
       → TOTAL: $2764.80 ✅
       → effect.state = CLEAN ✅
*/

// ============================================
// THE GUARANTEE IN ACTION
// ============================================

/*
At EVERY step, the computation sees ONLY fresh, consistent data:

✅ subtotal: reads fresh items signal
✅ discountAmount: reads fresh subtotal (just updated)
✅ subtotalAfterDiscount: reads fresh subtotal & discountAmount
✅ shippingCost: reads fresh subtotal
✅ taxableAmount: reads fresh subtotalAfterDiscount & shippingCost
✅ taxAmount: reads fresh taxableAmount
✅ totalCost: reads fresh taxableAmount & taxAmount
✅ effect: reads ALL fresh values

NO GLITCHES! 🎉

Without topological ordering, you might see:
❌ totalCost computed with old subtotal
❌ taxAmount computed with old taxableAmount
❌ effect displays inconsistent values
❌ UI shows wrong total!

With topological ordering:
✅ Execution flows top-down through dependency graph
✅ Each computation sees latest values from ALL dependencies
✅ UI always displays consistent, correct state
✅ Users see correct total: $2764.80
*/
```

#### Why This Matters in Production

In the e-commerce example:

1. **Correctness**: Users see accurate totals (critical for payments!)
2. **Consistency**: No intermediate states where discount applies but shipping doesn't
3. **Performance**: Each computation runs exactly once per update
4. **Predictability**: Same inputs always produce same outputs in same order
5. **Debugging**: Clear execution flow makes issues easier to trace

**Without topological ordering:**

- Effect might see `subtotal = 3200` but `discountAmount = 200` (old value)
- Displayed total would be WRONG
- User might see incorrect price and lose trust
- Payment processing could use wrong amount

**With topological ordering:**

- Effect ALWAYS sees all fresh values
- Displayed total is CORRECT
- User confidence maintained
- Correct amount charged

### Critical Insight: Memo Caching Across Multiple Effects

**Your question is EXACTLY RIGHT!** 🎯

When multiple effects read the same memos, the memos **compute only ONCE** and are cached for all subsequent reads in that update cycle.

#### Example: Multiple Effects Sharing Memos

```typescript
const [items, setItems] = createSignal([
  { id: 1, name: "Laptop", price: 1000, quantity: 1 },
]);

const subtotal = createMemo(() => {
  console.log("💰 Computing subtotal");
  return items().reduce((sum, item) => sum + item.price * item.quantity, 0);
});

const tax = createMemo(() => {
  console.log("🧾 Computing tax");
  return subtotal() * 0.08;
});

const total = createMemo(() => {
  console.log("💳 Computing total");
  return subtotal() + tax();
});

// ============================================
// EFFECT 1: Cart Summary UI
// ============================================
createEffect(() => {
  console.log("\n🎨 Effect 1: Updating cart summary");
  console.log(`  Subtotal: $${subtotal().toFixed(2)}`);
  console.log(`  Tax: $${tax().toFixed(2)}`);
  console.log(`  Total: $${total().toFixed(2)}`);
});

// ============================================
// EFFECT 2: Analytics Tracking
// ============================================
createEffect(() => {
  console.log("\n📊 Effect 2: Tracking analytics");
  console.log(`  Cart value: $${subtotal().toFixed(2)}`);
  console.log(`  Tax amount: $${tax().toFixed(2)}`);
  // Send to analytics service
});

// ============================================
// EFFECT 3: Checkout Button State
// ============================================
const [shippingAddress, setShippingAddress] = createSignal(null);

createEffect(() => {
  console.log("\n🔘 Effect 3: Updating checkout button");
  const hasAddress = shippingAddress() !== null;
  const cartTotal = total(); // ← Reads same memo!
  console.log(`  Can checkout: ${hasAddress && cartTotal > 0}`);
  console.log(`  Total: $${cartTotal.toFixed(2)}`);
});

// ============================================
// USER UPDATES CART
// ============================================
console.log("\n\n🛒 User adds item...\n");

setItems([{ id: 1, name: "Laptop", price: 1000, quantity: 2 }]);
```

#### What Happens: Memo Computation Counts

```
🛒 User adds item...

// ============================================
// UPDATE CYCLE BEGINS
// ============================================

// Mark Phase:
// - subtotal.state = STALE
// - tax.state = STALE (depends on subtotal)
// - total.state = STALE (depends on subtotal + tax)
// - effect1.state = STALE
// - effect2.state = STALE
// - effect3.state = STALE

// ============================================
// FLUSH UPDATES (Memos)
// ============================================

💰 Computing subtotal  ← Computed ONCE
   subtotal.value = 2000
   subtotal.state = CLEAN ✅

🧾 Computing tax  ← Computed ONCE
   tax.value = 160
   tax.state = CLEAN ✅

💳 Computing total  ← Computed ONCE
   total.value = 2160
   total.state = CLEAN ✅

// ============================================
// FLUSH EFFECTS (Side Effects)
// ============================================

🎨 Effect 1: Updating cart summary
   subtotal() → 2000 (CACHED! No recomputation) ✅
   tax() → 160 (CACHED! No recomputation) ✅
   total() → 2160 (CACHED! No recomputation) ✅
   Subtotal: $2000.00
   Tax: $160.00
   Total: $2160.00

📊 Effect 2: Tracking analytics
   subtotal() → 2000 (CACHED! No recomputation) ✅
   tax() → 160 (CACHED! No recomputation) ✅
   Cart value: $2000.00
   Tax amount: $160.00

🔘 Effect 3: Updating checkout button
   total() → 2160 (CACHED! No recomputation) ✅
   Can checkout: false
   Total: $2160.00

// ============================================
// RESULT: Memos computed ONCE, read MANY times
// ============================================

Computation Count:
✅ subtotal: 1 computation, 3 reads (effect1, effect2, effect3)
✅ tax: 1 computation, 2 reads (effect1, effect2)
✅ total: 1 computation, 2 reads (effect1, effect3)

Total computations: 3 (not 7!)
🎉 Massive performance win!
```

#### Why This Works: State Machine + ExecCount

The key is the **CLEAN state**:

```typescript
// First read (e.g., effect1):
function readSignal() {
  if (this.state === STALE) {
    // Need to recompute
    runTop(this);
    // Now: this.state = CLEAN ✅
  }
  return this.value; // Return cached value
}

// Second read (e.g., effect2):
function readSignal() {
  if (this.state === STALE) {
    // ❌ state is CLEAN, skip this!
  }
  return this.value; // Return cached value ✅
}

// Third read (e.g., effect3):
function readSignal() {
  if (this.state === STALE) {
    // ❌ state is CLEAN, skip this!
  }
  return this.value; // Return cached value ✅
}
```

#### Real-World Impact

Consider a complex dashboard with 10 effects:

```typescript
const expensiveMemo = createMemo(() => {
  console.log("⏱️ Expensive computation (1 second)");
  let result = 0;
  for (let i = 0; i < 100000000; i++) {
    result += Math.sqrt(i);
  }
  return result;
});

// 10 different effects all read the same memo:
createEffect(() => {
  console.log("Effect 1:", expensiveMemo());
});

createEffect(() => {
  console.log("Effect 2:", expensiveMemo());
});

// ... 8 more effects ...

createEffect(() => {
  console.log("Effect 10:", expensiveMemo());
});

setSignal(newValue);

// ============================================
// WITHOUT CACHING (naive implementation):
// ============================================
// ⏱️ Expensive computation (1 second)
// Effect 1: ...
// ⏱️ Expensive computation (1 second)
// Effect 2: ...
// ... 8 more seconds ...
// ⏱️ Expensive computation (1 second)
// Effect 10: ...
//
// Total time: 10 SECONDS! ❌

// ============================================
// WITH CACHING (Solid.js implementation):
// ============================================
// ⏱️ Expensive computation (1 second)
// Effect 1: ... (reads cached value)
// Effect 2: ... (reads cached value)
// ... 8 more effects ...
// Effect 10: ... (reads cached value)
//
// Total time: 1 SECOND! ✅
// 10x performance improvement!
```

#### The Complete Picture

```typescript
// Update cycle with multiple effects:

setItems(newValue);

// 1️⃣ MARK PHASE:
//    All dependent memos → STALE
//    All dependent effects → STALE

// 2️⃣ FLUSH UPDATES (Memos):
//    For each memo in Updates queue:
//      if (memo.state === STALE) {
//        recompute();
//        memo.state = CLEAN; ← Key!
//      }

// 3️⃣ FLUSH EFFECTS:
//    For each effect in Effects queue:
//      effect.fn(); ← Runs user code
//        When effect reads memo:
//          if (memo.state === CLEAN) {
//            return cached value; ← Fast!
//          }

// Result:
// - Each memo computes ONCE
// - All effects read cached values
// - Consistent data across all effects
// - Optimal performance
```

#### Key Takeaways

1. **Memos compute once per update cycle** regardless of how many effects read them
2. **First read triggers computation** (if STALE), subsequent reads are cached
3. **State machine enables caching**: STALE → compute → CLEAN → cache
4. **All effects see same values**: consistent, no glitches
5. **Massive performance benefit**: 10 effects = 1 computation, not 10

This is why memos are so powerful in Solid.js! They automatically optimize computations across your entire application, ensuring each value is calculated exactly once per update, no matter how many places read it. 🚀

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

````typescript
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
  ExecCount++; // For glitch prevention

  try {
    // Phase 1: Mark phase (add to queues)
    const result = fn();

    // Phase 2: Flush Updates (memos) with topological ordering
    for (let i = 0; i < Updates.length; i++) {
      const node = Updates[i]!;
      runTop(node); // Updates upstream first if needed
    }

    // Phase 3: Flush Effects (only if init=true)
    if (init) {
      for (let i = 0; i < Effects.length; i++) {
        const node = Effects[i]!;
        runTop(node); // Updates upstream first if needed
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
 * Run computation with TOPOLOGICAL ORDERING
 *
 * Topological ordering means: **Parents update before children**
 * This prevents glitches by ensuring consistent values.
 *
 * How it works:
 * 1. Start with the computation that needs updating (e.g., quadrupled)
 * 2. Walk UP the ownership chain collecting stale ancestors (e.g., doubled, sum)
 * 3. Process in REVERSE order = parents first (sum → doubled → quadrupled)
 *
 * Example:
 * ```
 * signal
 *   ↓
 * sum (owner of doubled)        ← Level 1 (grandparent)
 *   ↓
 * doubled (owner of quadrupled) ← Level 2 (parent)
 *   ↓
 * quadrupled                    ← Level 3 (child)
 * ```
 *
 * When quadrupled needs updating:
 * - ancestors = [quadrupled, doubled, sum]  ← Collected bottom-up
 * - Process: sum → doubled → quadrupled     ← Execute top-down (reversed)
 */
function runTop(node: Computation<any>): void {
  // Fast path: Already up-to-date?
  if (node.state === CLEAN) return;

  // If pending, just check upstream and return
  if (node.state === PENDING) {
    const prevUpdates = Updates;
    Updates = null;
    runUpdates(() => lookUpstream(node), false);
    Updates = prevUpdates;
    return;
  }

  /**
   * PHASE 1: COLLECT ANCESTORS (Walk UP the chain)
   * ===============================================
   * We start with the current node and walk up the ownership chain,
   * collecting any ancestors that are stale (outdated).
   *
   * Think of it like climbing a family tree to find who needs updating.
   */
  const ancestors: Computation<any>[] = [node]; // Start with current node (e.g., [quadrupled])
  let current = node.owner as Computation<any>;

  /**
   * Walk up the ownership chain:
   * - current = parent computation that owns this one
   * - Keep going until we hit the root or find a current ancestor
   *
   * Example walk:
   * 1. current = quadrupled (updatedAt = 0, ExecCount = 1) → 0 < 1 ✓ stale
   * 2. current = doubled (updatedAt = 0, ExecCount = 1) → 0 < 1 ✓ stale
   * 3. current = sum (updatedAt = 1, ExecCount = 1) → 1 < 1 ✗ current, STOP
   *
   * Result: ancestors = [quadrupled, doubled, sum]
   */
  while (current && (!current.updatedAt || current.updatedAt < ExecCount)) {
    // Only add if it needs updating (not CLEAN)
    if (current.state !== CLEAN) {
      ancestors.push(current);
    }
    current = current.owner as Computation<any>;
  }

  /**
   * Now ancestors contains (bottom-up):
   * [child, parent, grandparent, ...]
   * Example: [quadrupled, doubled, sum]
   */

  /**
   * PHASE 2: UPDATE TOP-DOWN (Process in order)
   * ============================================
   * We collected children first (bottom-up), but now we process
   * parents first (top-down) to ensure consistency.
   *
   * Why? If we updated quadrupled first, it would read stale doubled!
   * By updating sum → doubled → quadrupled, each sees consistent parents.
   */
  for (let i = ancestors.length - 1; i >= 0; i--) {
    /**
     * Process in REVERSE order (top-down):
     * i = 2: sum        ← Grandparent first
     * i = 1: doubled    ← Parent second
     * i = 0: quadrupled ← Child last
     *
     * This guarantees: Parents are always CLEAN when children read them!
     */
    const ancestor = ancestors[i]!;

    if (ancestor.state === STALE) {
      // Fully outdated - recompute now
      updateComputation(ancestor);
    } else if (ancestor.state === PENDING) {
      // Waiting for dependencies - check them first
      const prevUpdates = Updates;
      Updates = null;
      runUpdates(() => lookUpstream(ancestor), false);
      Updates = prevUpdates;
    }
  }

  /**
   * Result: All ancestors are now CLEAN and consistent!
   * ✅ sum.value = 15
   * ✅ doubled.value = 30 (uses fresh sum)
   * ✅ quadrupled.value = 60 (uses fresh doubled)
   *
   * No glitches - all values are consistent! 🎉
   */
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
````

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

setA(5); // Triggers writeSignal

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
const value = doubled(); // ← Computation happens HERE
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
doubled(); // ← Access triggers recomputation

// Internally:
function readSignal() {
  if (this.state === STALE) {
    updateComputation(this); // Compute NOW
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
    updateComputation(effect); // Compute during flush
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
doubled(); // Logs "Computing!" → Returns 10
doubled(); // Returns 10 (cached, no log)
doubled(); // Returns 10 (cached, no log)

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
  setCount(i); // Memo marked STALE each time
}

// Only computes ONCE on access!
const result = expensive(); // ← 1 second (not 100 seconds!)
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

setCount(5); // Memo marked STALE, NOT computed yet!
console.log("Between updates");
doubled(); // NOW it computes!
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

setCount(5); // Effect flushes IMMEDIATELY!
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

setCount(1); // NOT computed yet!
setCount(2); // Still not computed!
setCount(3); // Still not computed!
console.log("Memos not computed yet!");

expensive(); // NOW it computes ONCE with final value!

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

setCount(1); // Runs immediately! (expensive!)
setCount(2); // Runs again! (expensive!)
setCount(3); // Runs again! (expensive!)
// 3 expensive computations!
```

### Performance Comparison

| Scenario                | Memo                  | Effect           |
| ----------------------- | --------------------- | ---------------- |
| Signal updated          | Marked STALE          | Runs immediately |
| Multiple updates        | Marks STALE each time | Runs each time   |
| Never accessed          | Never computes ✅     | Always runs ❌   |
| Accessed once           | Computes once ✅      | N/A              |
| Accessed multiple times | Returns cached ✅     | N/A              |
| **Best for**            | Derived values        | Side effects     |

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
