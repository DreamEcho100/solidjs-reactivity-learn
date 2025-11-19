# 🎓 Computation States - The Complete Beginner's Guide

**Understanding lazy evaluation and glitch-free updates from scratch**

---

## 📖 Table of Contents

1. [The Problem: Wasted Work](#the-problem-wasted-work)
2. [What is a State Machine?](#what-is-a-state-machine)
3. [The Three States Explained](#the-three-states)
4. [The Glitch Problem](#the-glitch-problem)
5. [How States Prevent Glitches](#how-states-prevent-glitches)
6. [Complete Walkthrough](#complete-walkthrough)
7. [Real-World Examples](#real-world-examples)

---

## 🚨 The Problem: Wasted Work

### Imagine a Kitchen 🍳

You're a chef, and you make a signature dish:

```
Ingredients (Signals):
┌─────────────┐
│ Eggs: 2     │ ──┐
│ Milk: 1 cup │ ──┼──→ 🍳 Omelette Recipe (Memo)
│ Cheese: 50g │ ──┘       ↓
└─────────────┘      🍽️ Serve to Customer (Effect)
```

#### **Problem 1: Cooking Too Early** 😰

```
Current System:
──────────────
Boss: "We're getting new eggs!"
You: *immediately start cooking* 🍳
Boss: "Wait! Also new milk!"
You: *throw away omelette, start over* 😱
Boss: "And new cheese too!"
You: *throw away omelette AGAIN, start over* 😭

Result: Made 3 omelettes, only needed 1!
```

#### **Problem 2: Serving Inconsistent Food** 🤢

```
Customer orders omelette with:
- Fresh eggs ✅
- Fresh milk ✅

You cook omelette with:
- Fresh eggs ✅
- OLD milk ❌ ← Not updated yet!

Customer gets sick! 🤮
```

### In Programming Terms

```javascript
const [eggs, setEggs] = createSignal(2);
const [milk, setMilk] = createSignal("1 cup");

const omelette = createMemo(() => {
  console.log("🍳 Cooking omelette...");
  return `Omelette with ${eggs()} eggs and ${milk()} milk`;
});

// Update ingredients
setEggs(3); // ← Cooks omelette immediately! (waste)
setMilk("2 cups"); // ← Cooks AGAIN! (waste)
setEggs(4); // ← Cooks AGAIN! (waste)

// We cooked 3 times when we only needed to cook once! 😰
```

**What we need:** A way to say "ingredients changed, but don't cook until someone orders!"

---

## 🎮 What is a State Machine?

### Think of a Traffic Light 🚦

A state machine is like a traffic light that can only be in ONE state at a time:

```
   🔴 RED         State 1: "STOP"
   ↓   ↑         Can change to: GREEN
   ↓   ↑
   🟢 GREEN       State 2: "GO"
   ↓   ↑         Can change to: YELLOW
   ↓   ↑
   🟡 YELLOW      State 3: "CAUTION"
                 Can change to: RED
```

**Rules:**

- Can only be in ONE state at a time
- Can only change in specific ways
- Each state means something specific

### In Our Reactive System

Instead of traffic lights, we have **computation states**:

```
Computation = A memo or effect that watches signals

States:
🟢 CLEAN   = "I'm up-to-date, ready to read!"
🟡 STALE   = "My dependencies changed, I need to recalculate!"
🔵 PENDING = "Waiting for my dependencies to update first!"
```

---

## 🎯 The Three States Explained

### State 1: CLEAN (0) 🟢

```
🟢 CLEAN = "Everything is up-to-date!"

Like a freshly cooked meal 🍳
┌─────────────────────────┐
│ Ingredients: ✅         │
│ Recipe followed: ✅     │
│ Ready to serve: ✅      │
└─────────────────────────┘

In code:
─────────
memo.state = 0  (CLEAN)
memo.value = 42  ← This value is correct and current

When you read memo():
→ Returns value immediately (no recalculation needed)
→ Fast! ⚡
```

### State 2: STALE (1) 🟡

```
🟡 STALE = "I'm outdated, need to recalculate!"

Like ingredients that changed 🥚→🥚🥚
┌─────────────────────────┐
│ Ingredients: ❌ Changed!│
│ Old meal: 🍳            │
│ Need to cook again!     │
└─────────────────────────┘

In code:
─────────
memo.state = 1  (STALE)
memo.value = 42  ← This might be wrong now!

A dependency signal changed!

When you read memo():
→ Must recalculate before returning
→ Takes time, but ensures correct value
```

### State 3: PENDING (2) 🔵

```
🔵 PENDING = "Waiting for ingredients to be ready!"

Like waiting for ingredients to arrive 🚚
┌─────────────────────────┐
│ Waiting for:            │
│ - Fresh eggs 🥚 (coming)│
│ - New milk 🥛 (coming)  │
│ Can't cook yet! ⏳      │
└─────────────────────────┘

In code:
─────────
memo.state = 2  (PENDING)

Something upstream changed, but upstream hasn't
recalculated yet!

When you read memo():
→ First, update all upstream dependencies
→ Then recalculate myself
→ Ensures no glitches!
```

---

## 🎨 Visual: State Transitions

### The State Machine Diagram

```
                    ┌──────────────┐
         ┌──────────│   🟢 CLEAN   │◄────────┐
         │          │   State: 0   │         │
         │          │  "Up-to-date"│         │
         │          └──────────────┘         │
         │                  │                │
         │                  │ Dependency     │ Finished
         │                  │ changed        │ updating
         │                  ↓                │
         │          ┌──────────────┐         │
         │          │   🟡 STALE   │─────────┤
         │          │   State: 1   │         │
         │          │"Need update" │         │
         │          └──────────────┘         │
         │                  │                │
         │                  │ Reading, but   │
         │ Update           │ upstream is    │
         │ upstream         │ also STALE     │
         │ first            ↓                │
         │          ┌──────────────┐         │
         └─────────►│  🔵 PENDING  │         │
                    │   State: 2   │         │
                    │"Waiting..."  │         │
                    └──────────────┘─────────┘
```

### State Transition Examples

#### **Scenario 1: Simple Update**

```javascript
const [count, setCount] = createSignal(5);
const doubled = createMemo(() => count() * 2);

// Initial state
doubled.state = 0  (🟢 CLEAN)
doubled.value = 10

// Signal changes
setCount(10);
↓
doubled.state = 1  (🟡 STALE)  ← Marked for update

// Someone reads it
doubled();
↓
(recalculates)
↓
doubled.state = 0  (🟢 CLEAN)  ← Back to clean
doubled.value = 20
```

#### **Scenario 2: Chained Dependencies**

```javascript
const [num, setNum] = createSignal(5);
const doubled = createMemo(() => num() * 2);
const quadrupled = createMemo(() => doubled() * 2);

// Initial state
num = 5
doubled = 10  (🟢 CLEAN)
quadrupled = 20  (🟢 CLEAN)

// Signal changes
setNum(10);
↓
doubled.state = 1  (🟡 STALE)
quadrupled.state = 2  (🔵 PENDING)  ← Waiting for doubled!

// Someone reads quadrupled
quadrupled();
↓
"Wait, doubled is STALE, update it first!"
↓
doubled.state = 0  (🟢 CLEAN)
doubled.value = 20
↓
"Now I can update!"
↓
quadrupled.state = 0  (🟢 CLEAN)
quadrupled.value = 40
```

---

## 🐛 The Glitch Problem

### What is a "Glitch"?

A **glitch** is when you see **inconsistent temporary values** during updates.

### Real-World Analogy: The Race Condition 🏃‍♂️

Imagine two delivery drivers updating your address:

```
Your Profile:
┌──────────────────┐
│ Street: Oak St   │ ← Driver 1 updates this first
│ City: Boston     │ ← Driver 2 updates this second
│ Zip: 02101       │
└──────────────────┘

Without States (Eager):
───────────────────────
Driver 1 delivers: "Street changed to Elm St!"
Your app shows:
  📍 Elm St, Boston, 02101  ← WRONG! Elm St is in NYC!

Driver 2 delivers: "City changed to NYC!"
Your app shows:
  📍 Elm St, NYC, 10001  ← CORRECT!

User saw WRONG address for a moment! 😱


With States (Lazy):
───────────────────
Driver 1 arrives: "Street will change..."
Driver 2 arrives: "City will change..."
App: "Wait for BOTH, then update!"
Your app shows:
  📍 Elm St, NYC, 10001  ← CORRECT from the start! ✅

User only sees correct address! 😊
```

### Code Example: The Glitch

```javascript
const [firstName, setFirstName] = createSignal("John");
const [lastName, setLastName] = createSignal("Doe");

const fullName = createMemo(() => {
  return `${firstName()} ${lastName()}`;
});

createEffect(() => {
  console.log("Name:", fullName());
});

// Initial: "Name: John Doe" ✅

// Update both names
setFirstName("Jane"); // ← Changes immediately!
setLastName("Smith"); // ← Changes immediately!

// WITHOUT states (Eager):
// ───────────────────────
// After setFirstName:
//   fullName recalculates → "Jane Doe" ❌ GLITCH!
//   Effect logs: "Name: Jane Doe"
//
// After setLastName:
//   fullName recalculates → "Jane Smith" ✅ CORRECT
//   Effect logs: "Name: Jane Smith"
//
// User saw: "Jane Doe" then "Jane Smith"
// That's 2 logs, 1 is WRONG! 😱

// WITH states (Lazy):
// ──────────────────
// After setFirstName:
//   fullName.state = STALE (not recalculated yet)
//
// After setLastName:
//   fullName.state = STALE (still not recalculated)
//
// Effect runs:
//   Reads fullName() → NOW it recalculates
//   fullName → "Jane Smith" ✅ CORRECT
//   Effect logs: "Name: Jane Smith"
//
// User saw: "Jane Smith" only once
// Always CORRECT! ✅ 😊
```

---

## 🛡️ How States Prevent Glitches

### The Magic: Lazy Evaluation + Topological Ordering

**Lazy Evaluation** = Don't recalculate until someone actually reads the value

**Topological Ordering** = Update parents before children

### Visual: Update Propagation

```
Dependency Graph:
─────────────────

  📦 firstName    📦 lastName
      ↓               ↓
      └───────┬───────┘
              ↓
         💡 fullName
              ↓
         👁️ Effect


WITHOUT States (Eager - Bad):
──────────────────────────────

Step 1: setFirstName("Jane")
        📦 firstName ✨ changed
            ↓
        💡 fullName 🔴 recalculates immediately
           → "Jane Doe" ❌ GLITCH!
            ↓
        👁️ Effect 🔴 runs
           → Logs "Jane Doe" ❌

Step 2: setLastName("Smith")
        📦 lastName ✨ changed
            ↓
        💡 fullName 🔴 recalculates again
           → "Jane Smith" ✅
            ↓
        👁️ Effect 🔴 runs again
           → Logs "Jane Smith" ✅

Result: 2 logs, 1 wrong! 😱


WITH States (Lazy - Good):
──────────────────────────

Step 1: setFirstName("Jane")
        📦 firstName ✨ changed
            ↓
        💡 fullName 🟡 marked STALE (no recalculation!)
            ↓
        👁️ Effect 🔵 marked PENDING

Step 2: setLastName("Smith")
        📦 lastName ✨ changed
            ↓
        💡 fullName 🟡 still STALE (still no recalculation!)
            ↓
        👁️ Effect 🔵 still PENDING

Step 3: Flush updates (all at once)
        👁️ Effect wants to run
            ↓
        "Wait, fullName is STALE!"
            ↓
        💡 fullName 🟢 recalculates NOW
           → Reads firstName() → "Jane" ✅
           → Reads lastName() → "Smith" ✅
           → Result: "Jane Smith" ✅
           → state = CLEAN
            ↓
        👁️ Effect 🟢 runs once
           → Logs "Jane Smith" ✅

Result: 1 log, always correct! 😊
```

---

## 🎬 Complete Walkthrough: Multi-Level Updates

Let's trace a complex example step by step:

### Code

```javascript
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);

const sum = createMemo(() => {
  console.log("💡 Computing sum");
  return a() + b();
});

const doubled = createMemo(() => {
  console.log("💡 Computing doubled");
  return sum() * 2;
});

createEffect(() => {
  console.log("👁️ Effect:", doubled());
});

// Later...
setA(5);
setB(10);
```

### Dependency Graph

```
  📦 a      📦 b
      ↘    ↙
      💡 sum
          ↓
      💡 doubled
          ↓
      👁️ effect
```

### Part 1: Initial Setup

```
After first render:
───────────────────

State Table:
╔══════════╦═══════╦═══════╦═════════╗
║ Node     ║ State ║ Value ║ Status  ║
╠══════════╬═══════╬═══════╬═════════╣
║ a        ║ N/A   ║ 1     ║ Signal  ║
║ b        ║ N/A   ║ 2     ║ Signal  ║
║ sum      ║ 🟢 0  ║ 3     ║ CLEAN   ║
║ doubled  ║ 🟢 0  ║ 6     ║ CLEAN   ║
║ effect   ║ 🟢 0  ║ -     ║ CLEAN   ║
╚══════════╩═══════╩═══════╩═════════╝

Console:
💡 Computing sum
💡 Computing doubled
👁️ Effect: 6
```

### Part 2: setA(5) is Called

```
📦 Signal 'a' changes: 1 → 5
│
└─ "Notify my observers!"
   Observers: [sum]

Step 1: Mark sum as STALE
────────────────────────
sum.state = 0 → 1 (🟡 STALE)
Add sum to Updates queue

Step 2: Mark downstream as PENDING
──────────────────────────────────
sum has observers: [doubled]

For each observer of sum:
  doubled.state = 0 → 2 (🔵 PENDING)
  Add doubled to Updates queue

Step 3: Mark further downstream
───────────────────────────────
doubled has observers: [effect]

For each observer of doubled:
  effect.state = 0 → 2 (🔵 PENDING)
  Add effect to Effects queue

State Table After setA(5):
╔══════════╦═══════╦═══════╦═════════╗
║ Node     ║ State ║ Value ║ Status  ║
╠══════════╬═══════╬═══════╬═════════╣
║ a        ║ N/A   ║ 5     ║ ✨ NEW  ║
║ b        ║ N/A   ║ 2     ║ Signal  ║
║ sum      ║ 🟡 1  ║ 3     ║ STALE   ║
║ doubled  ║ 🔵 2  ║ 6     ║ PENDING ║
║ effect   ║ 🔵 2  ║ -     ║ PENDING ║
╚══════════╩═══════╩═══════╩═════════╝

Queues:
Updates: [sum, doubled]
Effects: [effect]
```

### Part 3: setB(10) is Called

```
📦 Signal 'b' changes: 2 → 10
│
└─ "Notify my observers!"
   Observers: [sum]

Step 1: Check sum's state
─────────────────────────
sum.state = 1 (🟡 STALE)
Already STALE! No need to mark again.
Already in queue? Yes!

Step 2: Propagate downstream
────────────────────────────
sum's observers: [doubled]
doubled.state = 2 (🔵 PENDING)
Already marked! No changes needed.

State Table After setB(10):
╔══════════╦═══════╦═══════╦═════════╗
║ Node     ║ State ║ Value ║ Status  ║
╠══════════╬═══════╬═══════╬═════════╣
║ a        ║ N/A   ║ 5     ║ Signal  ║
║ b        ║ N/A   ║ 10    ║ ✨ NEW  ║
║ sum      ║ 🟡 1  ║ 3     ║ STALE   ║
║ doubled  ║ 🔵 2  ║ 6     ║ PENDING ║
║ effect   ║ 🔵 2  ║ -     ║ PENDING ║
╚══════════╩═══════╩═══════╩═════════╝

Queues (unchanged):
Updates: [sum, doubled]
Effects: [effect]

Console: (nothing yet - all lazy!)
```

### Part 4: Flushing Updates (Memos)

```
Process Updates Queue: [sum, doubled]
───────────────────────────────────

Update 1: Process 'sum'
───────────────────────
1. Check state: sum.state === 1 (🟡 STALE)
2. Run updateComputation(sum):
   ├─ Execute: () => a() + b()
   ├─ Reads a() → 5
   ├─ Reads b() → 10
   ├─ Result: 15
   ├─ sum.value = 3 → 15
   └─ sum.state = 1 → 0 (🟢 CLEAN)

Console:
💡 Computing sum

State After Update 1:
╔══════════╦═══════╦═══════╦═════════╗
║ Node     ║ State ║ Value ║ Status  ║
╠══════════╬═══════╬═══════╬═════════╣
║ sum      ║ 🟢 0  ║ 15    ║ ✨ NEW  ║
║ doubled  ║ 🔵 2  ║ 6     ║ PENDING ║
║ effect   ║ 🔵 2  ║ -     ║ PENDING ║
╚══════════╩═══════╩═══════╩═════════╝


Update 2: Process 'doubled'
───────────────────────────
1. Check state: doubled.state === 2 (🔵 PENDING)
2. First, check upstream (lookUpstream):
   ├─ Check sum.state → 0 (🟢 CLEAN) ✅
   └─ sum is up-to-date!
3. Now run updateComputation(doubled):
   ├─ Execute: () => sum() * 2
   ├─ Reads sum() → 15
   ├─ Result: 30
   ├─ doubled.value = 6 → 30
   └─ doubled.state = 2 → 0 (🟢 CLEAN)

Console:
💡 Computing doubled

State After Update 2:
╔══════════╦═══════╦═══════╦═════════╗
║ Node     ║ State ║ Value ║ Status  ║
╠══════════╬═══════╬═══════╬═════════╣
║ sum      ║ 🟢 0  ║ 15    ║ CLEAN   ║
║ doubled  ║ 🟢 0  ║ 30    ║ ✨ NEW  ║
║ effect   ║ 🔵 2  ║ -     ║ PENDING ║
╚══════════╩═══════╩═══════╩═════════╝

Updates Queue: [] (empty)
```

### Part 5: Flushing Effects

```
Process Effects Queue: [effect]
───────────────────────────────

Update: Process 'effect'
────────────────────────
1. Check state: effect.state === 2 (🔵 PENDING)
2. First, check upstream (lookUpstream):
   ├─ Check doubled.state → 0 (🟢 CLEAN) ✅
   └─ doubled is up-to-date!
3. Now run updateComputation(effect):
   ├─ Execute: () => console.log("Effect:", doubled())
   ├─ Reads doubled() → 30
   ├─ Logs to console
   └─ effect.state = 2 → 0 (🟢 CLEAN)

Console:
👁️ Effect: 30

Final State:
╔══════════╦═══════╦═══════╦═════════╗
║ Node     ║ State ║ Value ║ Status  ║
╠══════════╬═══════╬═══════╬═════════╣
║ a        ║ N/A   ║ 5     ║ Signal  ║
║ b        ║ N/A   ║ 10    ║ Signal  ║
║ sum      ║ 🟢 0  ║ 15    ║ CLEAN   ║
║ doubled  ║ 🟢 0  ║ 30    ║ CLEAN   ║
║ effect   ║ 🟢 0  ║ -     ║ CLEAN   ║
╚══════════╩═══════╩═══════╩═════════╝

Effects Queue: [] (empty)

✅ All computations CLEAN
✅ All values consistent
✅ No glitches!
```

### Summary of Console Output

```
Total Console Logs:
───────────────────
💡 Computing sum       ← Only once!
💡 Computing doubled   ← Only once!
👁️ Effect: 30         ← Only once, with correct value!

Without States Would Have Been:
────────────────────────────────
💡 Computing sum       ← After setA(5)
💡 Computing doubled
👁️ Effect: 12         ← WRONG! (5 + 2) * 2
💡 Computing sum       ← After setB(10)
💡 Computing doubled
👁️ Effect: 30         ← Correct

6 logs vs 3 logs - 50% reduction! 🚀
And no glitches! ✅
```

---

## 🏭 Real-World Example: Shopping Cart

Let's see a practical example:

### Code

```javascript
// Product prices (signals)
const [applePrice, setApplePrice] = createSignal(1.0);
const [bananaPrice, setBananaPrice] = createSignal(0.5);
const [orangePrice, setOrangePrice] = createSignal(0.75);

// Quantities (signals)
const [appleQty, setAppleQty] = createSignal(2);
const [bananaQty, setBananaQty] = createSignal(3);
const [orangeQty, setOrangeQty] = createSignal(1);

// Subtotals (memos)
const appleTotal = createMemo(() => applePrice() * appleQty());
const bananaTotal = createMemo(() => bananaPrice() * bananaQty());
const orangeTotal = createMemo(() => orangePrice() * orangeQty());

// Cart total (memo)
const cartTotal = createMemo(() => {
  return appleTotal() + bananaTotal() + orangeTotal();
});

// Tax (memo)
const tax = createMemo(() => cartTotal() * 0.1);

// Grand total (memo)
const grandTotal = createMemo(() => cartTotal() + tax());

// Update UI (effect)
createEffect(() => {
  document.getElementById("total").textContent = `$${grandTotal().toFixed(2)}`;
});
```

### Dependency Graph

```
Signals:                                    Memos:
📦 applePrice   📦 appleQty                💡 appleTotal
📦 bananaPrice  📦 bananaQty      ────→    💡 bananaTotal    ────→  💡 cartTotal  ────→  💡 tax
📦 orangePrice  📦 orangeQty                💡 orangeTotal               ↓                  ↓
                                                                    💡 grandTotal
                                                                          ↓
                                                                    👁️ Effect (UI)
```

### Scenario: Black Friday Sale! 🛍️

```javascript
// Sale: Update all prices at once!
setApplePrice(0.5); // 50% off!
setBananaPrice(0.25); // 50% off!
setOrangePrice(0.4); // ~45% off!
```

### What Happens WITHOUT States (Eager):

```
Step 1: setApplePrice(0.50)
───────────────────────────
appleTotal recalculates → $1.00 ✅
cartTotal recalculates → $3.40 ❌ (WRONG - only apples updated!)
tax recalculates → $0.34 ❌
grandTotal recalculates → $3.74 ❌
Effect runs → Shows "$3.74" ❌ GLITCH!

Step 2: setBananaPrice(0.25)
─────────────────────────────
bananaTotal recalculates → $0.75 ✅
cartTotal recalculates → $2.50 ❌ (WRONG - oranges still old price!)
tax recalculates → $0.25 ❌
grandTotal recalculates → $2.75 ❌
Effect runs → Shows "$2.75" ❌ GLITCH!

Step 3: setOrangePrice(0.40)
─────────────────────────────
orangeTotal recalculates → $0.40 ✅
cartTotal recalculates → $2.15 ✅ (FINALLY correct!)
tax recalculates → $0.22 ✅
grandTotal recalculates → $2.37 ✅
Effect runs → Shows "$2.37" ✅

User saw: "$3.74" → "$2.75" → "$2.37"
          ❌        ❌        ✅
Confusing and wrong! 😱
```

### What Happens WITH States (Lazy):

```
Step 1: setApplePrice(0.50)
───────────────────────────
appleTotal.state → 🟡 STALE
cartTotal.state → 🔵 PENDING
tax.state → 🔵 PENDING
grandTotal.state → 🔵 PENDING
effect.state → 🔵 PENDING

(No recalculations yet!)

Step 2: setBananaPrice(0.25)
─────────────────────────────
bananaTotal.state → 🟡 STALE
(Everything else already PENDING)

(Still no recalculations!)

Step 3: setOrangePrice(0.40)
─────────────────────────────
orangeTotal.state → 🟡 STALE
(Everything else already PENDING)

(Still no recalculations!)

Step 4: Flush all updates
─────────────────────────
Effect wants to run → Needs grandTotal
grandTotal needs → cartTotal, tax
cartTotal needs → appleTotal, bananaTotal, orangeTotal

Update order (topological):
1. appleTotal → $1.00 ✅
2. bananaTotal → $0.75 ✅
3. orangeTotal → $0.40 ✅
4. cartTotal → $2.15 ✅
5. tax → $0.22 ✅
6. grandTotal → $2.37 ✅
7. Effect → Shows "$2.37" ✅

User saw: "$2.37"
          ✅
Only correct value! 😊
```

---

## 🧮 Key Concepts Summary

### 1. **Lazy Evaluation**

```
Don't recalculate until someone reads the value

📦 Signal changes
    ↓
💡 Memo marked STALE (not recalculated)
    ↓
... time passes ...
    ↓
Someone reads memo() ← NOW it recalculates!
```

### 2. **State Machine**

```
🟢 CLEAN   → "I'm up-to-date!"
🟡 STALE   → "I need to update!"
🔵 PENDING → "Waiting for dependencies!"
```

### 3. **Glitch Prevention**

```
Update all signals first (mark as STALE)
Then flush all updates at once
Result: Only see final, consistent values
```

### 4. **Topological Ordering**

```
Always update parents before children

     A
    / \
   B   C
    \ /
     D

Order: A → B → C → D
D always sees consistent B and C!
```

---

## 🎯 Mental Models

### Model 1: The Restaurant Kitchen

```
🍳 Chef's State Machine:

🟢 CLEAN   = "All ingredients fresh, meal ready"
🟡 STALE   = "Ingredients changed, need to cook"
🔵 PENDING = "Waiting for ingredients to be prepared"

Without states:
- Cook immediately when ANY ingredient changes
- Waste food
- Serve inconsistent meals

With states:
- Wait for ALL ingredients to update
- Cook once with all fresh ingredients
- Serve consistent, correct meals
```

### Model 2: The Spreadsheet

```
Excel Spreadsheet:

When you change cell A1:
- Cells depending on A1 are marked (🟡 STALE)
- Excel doesn't recalculate immediately
- When you look at cell C1, THEN it recalculates
- Shows correct, final value

Same thing in Solid.js!
```

### Model 3: The Traffic Control System

```
🚦 Traffic Light States:

Can only be in ONE state at a time
Changes follow specific rules
Each state has clear meaning

💡 Computation States:

Can only be in ONE state at a time
Changes follow specific rules
Each state has clear meaning

Same principle!
```

---

## 💡 Why This Matters

### Performance Benefits

```
Without States:
───────────────
Update 3 signals → 3 recalculations
Each recalculation triggers downstream
Exponential growth! 😱

Example: 3 signals → 15 recalculations

With States:
────────────
Update 3 signals → Mark as STALE
Flush once → 5 recalculations

Example: 3 signals → 5 recalculations

3x faster! 🚀
```

### Correctness Benefits

```
Without States:
───────────────
See intermediate, inconsistent values
User confusion
Potential bugs

With States:
────────────
See only final, consistent values
Clear user experience
No bugs from inconsistency
```

---

## ✅ What You've Learned

Congratulations! You now understand:

✅ **Lazy Evaluation**: Don't compute until needed
✅ **State Machine**: Three states (CLEAN, STALE, PENDING)
✅ **Glitch Prevention**: Update all at once
✅ **Topological Ordering**: Parents before children
✅ **Performance**: Fewer recomputations
✅ **Correctness**: No inconsistent values

---

## 🎯 Quick Reference

### The Three States

```javascript
// State values
CLEAN = 0; // 🟢 Up-to-date
STALE = 1; // 🟡 Needs update
PENDING = 2; // 🔵 Waiting

// In computation
memo.state = 0; // CLEAN
memo.state = 1; // STALE
memo.state = 2; // PENDING
```

### State Transitions

```javascript
// Signal changes
signal changes → mark observers STALE

// Reading
if (memo.state === STALE) {
  recalculate();
  memo.state = CLEAN;
}

if (memo.state === PENDING) {
  updateUpstream();
  recalculate();
  memo.state = CLEAN;
}
```

---

## 🎬 The Complete Picture: runUpdates Orchestration

### When Does the Flush Actually Happen?

Great question! Let me show you **exactly** when and how everything runs:

```javascript
// This is what you write:
setEggs(3);

// This is what actually happens:
writeSignal(eggsSignal, 3)
  ↓
runUpdates(() => {
  // Mark phase
  for (observer of eggsSignal.observers) {
    observer.state = STALE;
    Updates.push(observer);  // or Effects.push(observer)
  }
}, true);  // ← true = flush effects immediately
  ↓
// Now runUpdates does its magic:

// 1️⃣ Initialize
Updates = [];
Effects = [];
ExecCount++;

// 2️⃣ Mark (the function above runs)
//    omeletteMemo.state = STALE
//    Updates = [omeletteMemo]

// 3️⃣ Flush Updates (memos)
for (memo of Updates) {
  runTop(memo);  // Actually computes the memo
}

// 4️⃣ Flush Effects
for (effect of Effects) {
  runTop(effect);  // Runs the side effects
}

// 5️⃣ Cleanup
Updates = null;
Effects = null;

// Done! Everything is consistent! ✨
```

### The runUpdates Function (Complete)

```javascript
function runUpdates(fn, init) {
  // Already flushing? Just run the function
  if (Updates) {
    return fn();
  }

  // Initialize queues
  Updates = [];
  Effects = [];
  ExecCount++; // For topological ordering

  try {
    // Phase 1: Mark (fn executes, adds to queues)
    fn();

    // Phase 2: Flush Updates (memos)
    for (let i = 0; i < Updates.length; i++) {
      const node = Updates[i];
      runTop(node); // Compute with proper ordering
    }

    // Phase 3: Flush Effects (if init=true)
    if (init) {
      for (let i = 0; i < Effects.length; i++) {
        const node = Effects[i];
        runTop(node); // Run side effects
      }
    }
  } finally {
    // Phase 4: Cleanup
    Updates = null;
    if (init) Effects = null;
  }
}
```

### How runTop Ensures Topological Ordering

````javascript
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
function runTop(node) {
  // Fast path: Already up-to-date?
  if (node.state === CLEAN) return;

  // If pending, just check upstream and return
  if (node.state === PENDING) {
    lookUpstream(node);
  }

  /**
   * PHASE 1: COLLECT ANCESTORS (Walk UP the chain)
   * ===============================================
   * We start with the current node and walk up the ownership chain,
   * collecting any ancestors that are stale (outdated).
   *
   * Think of it like climbing a family tree to find who needs updating.
   */
  const ancestors = [node]; // Start with current node (e.g., [quadrupled])
  let parent = node.owner;

  /**
   * Walk up the ownership chain:
   * - parent = parent computation that owns this one
   * - Keep going until we hit the root or find a current ancestor
   *
   * Example walk:
   * 1. parent = quadrupled (state = STALE) → Add to ancestors
   * 2. parent = doubled (state = STALE) → Add to ancestors
   * 3. parent = sum (state = CLEAN) → Stop here
   *
   * Result: ancestors = [quadrupled, doubled, sum]
   */
  while (parent && parent.state !== CLEAN) {
    // Only add if it needs updating (not CLEAN)
    ancestors.push(parent);
    parent = parent.owner;
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
    const ancestor = ancestors[i];

    if (ancestor.state === STALE) {
      // Fully outdated - recompute now
      updateComputation(ancestor); // Actually compute
      ancestor.state = CLEAN;
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

### The Complete Flow Visualized

```
User Action:
setEggs(3);
    ↓
┌───────────────────────────────────────────────────┐
│ writeSignal(eggsSignal, 3)                        │
│   1. eggsSignal.value = 3                         │
│   2. Call runUpdates(markFn, true)                │
└─────────────────┬─────────────────────────────────┘
                  ↓
┌───────────────────────────────────────────────────┐
│ runUpdates Phase: Initialize                      │
│   Updates = []                                    │
│   Effects = []                                    │
│   ExecCount++ (now = 1)                           │
└─────────────────┬─────────────────────────────────┘
                  ↓
┌───────────────────────────────────────────────────┐
│ runUpdates Phase: Mark                            │
│   markFn() executes:                              │
│     omeletteMemo.state = STALE                    │
│     Updates.push(omeletteMemo)                    │
│     markDownstream(omeletteMemo):                 │
│       serveEffect.state = PENDING                 │
│       Effects.push(serveEffect)                   │
└─────────────────┬─────────────────────────────────┘
                  ↓
┌───────────────────────────────────────────────────┐
│ runUpdates Phase: Flush Updates                   │
│   for omeletteMemo in Updates:                    │
│     runTop(omeletteMemo)                          │
│       omeletteMemo.state === STALE                │
│       updateComputation(omeletteMemo)             │
│         console.log("🍳 Cooking omelette...")     │
│         omeletteMemo.value = "Omelette with 3..."│
│         omeletteMemo.state = CLEAN                │
│         omeletteMemo.updatedAt = 1                │
└─────────────────┬─────────────────────────────────┘
                  ↓
┌───────────────────────────────────────────────────┐
│ runUpdates Phase: Flush Effects                   │
│   for serveEffect in Effects:                     │
│     runTop(serveEffect)                           │
│       serveEffect.state === PENDING               │
│       lookUpstream(serveEffect):                  │
│         check omeletteMemo: CLEAN & updatedAt=1✓  │
│       updateComputation(serveEffect)              │
│         console.log("🍽️ Serving...")             │
│         serveEffect.state = CLEAN                 │
└─────────────────┬─────────────────────────────────┘
                  ↓
┌───────────────────────────────────────────────────┐
│ runUpdates Phase: Cleanup                         │
│   Updates = null                                  │
│   Effects = null                                  │
└─────────────────┬─────────────────────────────────┘
                  ↓
               Done! ✨
All states CLEAN
All values consistent
No glitches!
```

### Answering Your Question Directly

**When does the flush happen for the 6 goals?**

1. **Lazy Evaluation** 🎯

   - Flush happens in `runUpdates` when you call `setSignal()`
   - Or when you read a memo that's STALE

2. **State Machine** 🎯

   - States transition during flush:
   - CLEAN → STALE (during mark)
   - STALE → CLEAN (during flush updates)
   - PENDING → CLEAN (during flush after lookUpstream)

3. **Glitch Prevention** 🎯

   - Flush waits for mark phase to complete
   - All signals updated before any computation runs
   - ExecCount ensures one-time updates per cycle

4. **Topological Ordering** 🎯

   - Flush uses `runTop()` which walks up owner chain
   - Parents compute before children
   - `lookUpstream()` ensures dependencies are fresh

5. **Performance** 🎯

   - Flush batches all updates
   - One flush per `setSignal()` call (or batch)
   - Multiple signal changes → one flush (with batch)

6. **Correctness** 🎯
   - Flush separates Updates (memos) from Effects
   - Memos flush first (stable values)
   - Effects flush second (see stable values)

### The Key Insight

```
Mark Phase:    "Ingredients changed!"
               (State → STALE/PENDING)
                        ↓
Flush Phase:   "Cook everything NOW!"
               (Compute → State → CLEAN)
                        ↓
Result:        "Perfect meal, no waste!"
               (Consistent, efficient)
```

**runUpdates is the chef** 👨‍🍳 that:

- Collects all orders (mark phase)
- Cooks in optimal order (Updates → Effects)
- Serves everything fresh (flush phase)
- Cleans up the kitchen (cleanup phase)

## 🎯 How runTop Guarantees Correct Execution Order

Now let's understand how the two-phase algorithm (collect bottom-up, execute top-down) guarantees that computations always see consistent, up-to-date values.

### The Core Guarantee

**Property:** When any computation executes, ALL its dependencies have already been updated to their latest values.

### Why This Works

The algorithm leverages three key facts:

1. **Ownership = Dependencies**: If computation B depends on computation A, then A is an ancestor of B in the ownership tree
2. **Bottom-Up Collection**: Walking up the owner chain captures ALL ancestors (all dependencies)
3. **Top-Down Execution**: Processing in reverse order ensures parents update before their children

### Simple Proof

Let's trace through an example to see the guarantee in action:

```typescript
// Dependency chain:
// signal → sum → doubled → quadrupled

const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);

const sum = createMemo(() => a() + b());
// sum.owner = null (root)

const doubled = createMemo(() => sum() * 2);
// doubled.owner = sum ← Depends on sum

const quadrupled = createMemo(() => doubled() * 2);
// quadrupled.owner = doubled ← Depends on doubled

// User accesses quadrupled:
const result = quadrupled();

// This triggers: runTop(quadrupled)
```

**Phase 1: Collect Ancestors (Walk Up)**

```typescript
const ancestors = [];
let node = quadrupled;

// Step 1: Start with current node
ancestors.push(node); // [quadrupled]

// Step 2: Walk up to parent
node = node.owner; // doubled
ancestors.push(node); // [quadrupled, doubled]

// Step 3: Walk up to grandparent
node = node.owner; // sum
ancestors.push(node); // [quadrupled, doubled, sum]

// Step 4: Reached root
node = node.owner; // null → stop

// Result: [quadrupled, doubled, sum]
//         ↑ child      ↑ parent  ↑ grandparent
```

**Phase 2: Execute Top-Down (Process in Reverse)**

```typescript
for (let i = ancestors.length - 1; i >= 0; i--) {
  updateComputation(ancestors[i]);
}

// i = 2: Update sum
//   → Reads a() and b() (signals, always fresh) ✅
//   → Computes: 1 + 2 = 3
//   → sum.value = 3
//   → sum.state = CLEAN

// i = 1: Update doubled
//   → Reads sum() ✅ (just updated! value = 3)
//   → Computes: 3 * 2 = 6
//   → doubled.value = 6
//   → doubled.state = CLEAN

// i = 0: Update quadrupled
//   → Reads doubled() ✅ (just updated! value = 6)
//   → Computes: 6 * 2 = 12
//   → quadrupled.value = 12
//   → quadrupled.state = CLEAN

// Return: 12 ✅ (correct!)
```

**The Invariant (The Mathematical Guarantee):**

At each iteration `i`:

- We update `ancestors[i]`
- All its dependencies are at positions `i+1`, `i+2`, ..., `ancestors.length - 1`
- All those positions were already processed in previous iterations
- Therefore, `ancestors[i]` sees ONLY fresh values! ✅

### Real-World Example: E-Commerce Shopping Cart

Let's see this guarantee in action with a realistic, complex system:

```typescript
// ============================================
// SCENARIO: E-Commerce Shopping Cart
// ============================================
// User can:
// - Add/remove items
// - Apply discount codes
// - Select shipping zone
// We need to calculate:
// - Subtotal, discount, shipping, tax, final total
// - ALL calculations must be consistent!
// ============================================

// Base data (user input)
const [items, setItems] = createSignal([
  { id: 1, name: "Laptop", price: 1000, quantity: 1 },
  { id: 2, name: "Mouse", price: 50, quantity: 2 },
  { id: 3, name: "Keyboard", price: 100, quantity: 1 },
]);

const [discountCode, setDiscountCode] = createSignal("SAVE20");
const [shippingZone, setShippingZone] = createSignal("domestic");
const [taxRate, setTaxRate] = createSignal(0.08); // 8% tax

// ============================================
// LEVEL 1: Basic calculations
// ============================================

const subtotal = createMemo(() => {
  console.log("📊 Computing subtotal");
  return items().reduce((sum, item) => sum + item.price * item.quantity, 0);
});
// Depends on: items
// Owner: null (root)

const discountAmount = createMemo(() => {
  console.log("💰 Computing discount");
  const code = discountCode();
  const sub = subtotal();

  if (code === "SAVE20") return sub * 0.2;
  if (code === "SAVE10") return sub * 0.1;
  return 0;
});
// Depends on: discountCode, subtotal
// Owner: subtotal (because it reads subtotal)

const shippingCost = createMemo(() => {
  console.log("🚚 Computing shipping");
  const zone = shippingZone();
  const sub = subtotal();

  if (sub > 500) return 0; // Free shipping!
  if (zone === "domestic") return 10;
  if (zone === "international") return 50;
  return 25;
});
// Depends on: shippingZone, subtotal
// Owner: subtotal

// ============================================
// LEVEL 2: Intermediate calculations
// ============================================

const subtotalAfterDiscount = createMemo(() => {
  console.log("💵 Computing subtotal after discount");
  return subtotal() - discountAmount();
});
// Depends on: subtotal, discountAmount
// Owner: discountAmount (reads it)

const taxableAmount = createMemo(() => {
  console.log("📋 Computing taxable amount");
  return subtotalAfterDiscount() + shippingCost();
});
// Depends on: subtotalAfterDiscount, shippingCost
// Owner: subtotalAfterDiscount

// ============================================
// LEVEL 3: Final calculations
// ============================================

const taxAmount = createMemo(() => {
  console.log("🧾 Computing tax");
  return taxableAmount() * taxRate();
});
// Depends on: taxableAmount, taxRate
// Owner: taxableAmount

const totalCost = createMemo(() => {
  console.log("💳 Computing TOTAL");
  return taxableAmount() + taxAmount();
});
// Depends on: taxableAmount, taxAmount
// Owner: taxAmount

// ============================================
// LEVEL 4: Display (effect)
// ============================================

createEffect(() => {
  console.log("\n🎨 CART SUMMARY:");
  console.log(`  Subtotal: $${subtotal().toFixed(2)}`);
  console.log(`  Discount: -$${discountAmount().toFixed(2)}`);
  console.log(`  Shipping: $${shippingCost().toFixed(2)}`);
  console.log(`  Tax: $${taxAmount().toFixed(2)}`);
  console.log(`  ══════════════════════`);
  console.log(`  TOTAL: $${totalCost().toFixed(2)}\n`);
});
// Owner: totalCost

// ============================================
// USER ACTION: Update cart
// ============================================

console.log("\n🛒 User adds 2 more laptops...\n");

setItems([
  { id: 1, name: "Laptop", price: 1000, quantity: 3 }, // 1 → 3
  { id: 2, name: "Mouse", price: 50, quantity: 2 },
  { id: 3, name: "Keyboard", price: 100, quantity: 1 },
]);
```

### What Happens: Step-by-Step

**Ownership Hierarchy (Tree Structure):**

```
null (root)
  └─ subtotal
      ├─ discountAmount
      │   └─ subtotalAfterDiscount
      │       └─ taxableAmount
      │           └─ taxAmount
      │               └─ totalCost
      │                   └─ effect
      └─ shippingCost
```

**When the effect needs to re-run:**

```typescript
// runTop(effect) is called

// ============================================
// PHASE 1: Collect Ancestors (Bottom-Up)
// ============================================

let node = effect;
const ancestors = [];

// Start at bottom (the effect)
ancestors.push(node); // [effect]

// Walk up: effect → totalCost
node = node.owner; // totalCost
if (node.state !== CLEAN) {
  ancestors.push(node); // [effect, totalCost]
}

// Walk up: totalCost → taxAmount
node = node.owner; // taxAmount
if (node.state !== CLEAN) {
  ancestors.push(node); // [effect, totalCost, taxAmount]
}

// Walk up: taxAmount → taxableAmount
node = node.owner; // taxableAmount
if (node.state !== CLEAN) {
  ancestors.push(node); // [..., taxableAmount]
}

// Walk up: taxableAmount → subtotalAfterDiscount
node = node.owner; // subtotalAfterDiscount
if (node.state !== CLEAN) {
  ancestors.push(node); // [..., subtotalAfterDiscount]
}

// Walk up: subtotalAfterDiscount → discountAmount
node = node.owner; // discountAmount
if (node.state !== CLEAN) {
  ancestors.push(node); // [..., discountAmount]
}

// Walk up: discountAmount → subtotal
node = node.owner; // subtotal
if (node.state !== CLEAN) {
  ancestors.push(node); // [..., subtotal]
}

// Walk up: subtotal → null (stop)
node = node.owner; // null

// Final collection:
// [effect, totalCost, taxAmount, taxableAmount,
//  subtotalAfterDiscount, discountAmount, subtotal]
//
// This is the REVERSE of the correct execution order!

// ============================================
// PHASE 2: Execute Top-Down (Reverse Order)
// ============================================

for (let i = ancestors.length - 1; i >= 0; i--) {
  updateComputation(ancestors[i]);
}

// i = 6: subtotal
// ✅ 📊 Computing subtotal
// → items = [{...laptop, quantity: 3}, {...mouse}, {...keyboard}]
// → subtotal = (1000 * 3) + (50 * 2) + (100 * 1) = 3200
// → subtotal.value = 3200
// → subtotal.state = CLEAN
// → All downstream computations can now safely read 3200! ✅

// i = 5: discountAmount
// ✅ 💰 Computing discount
// → discountCode = "SAVE20"
// → subtotal() = 3200 ← FRESH (just updated)! ✅
// → discountAmount = 3200 * 0.20 = 640
// → discountAmount.value = 640
// → discountAmount.state = CLEAN

// i = 4: subtotalAfterDiscount
// ✅ 💵 Computing subtotal after discount
// → subtotal() = 3200 ← FRESH! ✅
// → discountAmount() = 640 ← FRESH! ✅
// → subtotalAfterDiscount = 3200 - 640 = 2560
// → subtotalAfterDiscount.value = 2560
// → subtotalAfterDiscount.state = CLEAN

// (Note: shippingCost also updates here in parallel)
// ✅ 🚚 Computing shipping
// → shippingZone = "domestic"
// → subtotal() = 3200 ← FRESH! ✅
// → 3200 > 500, so shippingCost = 0 (free!)
// → shippingCost.value = 0
// → shippingCost.state = CLEAN

// i = 3: taxableAmount
// ✅ 📋 Computing taxable amount
// → subtotalAfterDiscount() = 2560 ← FRESH! ✅
// → shippingCost() = 0 ← FRESH! ✅
// → taxableAmount = 2560 + 0 = 2560
// → taxableAmount.value = 2560
// → taxableAmount.state = CLEAN

// i = 2: taxAmount
// ✅ 🧾 Computing tax
// → taxableAmount() = 2560 ← FRESH! ✅
// → taxRate = 0.08
// → taxAmount = 2560 * 0.08 = 204.80
// → taxAmount.value = 204.80
// → taxAmount.state = CLEAN

// i = 1: totalCost
// ✅ 💳 Computing TOTAL
// → taxableAmount() = 2560 ← FRESH! ✅
// → taxAmount() = 204.80 ← FRESH! ✅
// → totalCost = 2560 + 204.80 = 2764.80
// → totalCost.value = 2764.80
// → totalCost.state = CLEAN

// i = 0: effect
// ✅ 🎨 CART SUMMARY:
// → subtotal() = 3200 ← FRESH! ✅
// → discountAmount() = 640 ← FRESH! ✅
// → shippingCost() = 0 ← FRESH! ✅
// → taxAmount() = 204.80 ← FRESH! ✅
// → totalCost() = 2764.80 ← FRESH! ✅
//
// Displays:
//   Subtotal: $3200.00
//   Discount: -$640.00
//   Shipping: $0.00
//   Tax: $204.80
//   ══════════════════════
//   TOTAL: $2764.80
//
// → effect.state = CLEAN
// ✅ ALL VALUES CONSISTENT! 🎉
```

### The Guarantee Visualized

```
Execution Timeline:

Time →

t₀: User updates items signal
    All memos marked STALE

t₁: subtotal updates
    ✅ Reads fresh items
    ✅ Result: 3200

t₂: discountAmount updates
    ✅ Reads fresh subtotal (3200) ← from t₁
    ✅ Result: 640

t₂: shippingCost updates (parallel with discountAmount)
    ✅ Reads fresh subtotal (3200) ← from t₁
    ✅ Result: 0

t₃: subtotalAfterDiscount updates
    ✅ Reads fresh subtotal (3200) ← from t₁
    ✅ Reads fresh discountAmount (640) ← from t₂
    ✅ Result: 2560

t₄: taxableAmount updates
    ✅ Reads fresh subtotalAfterDiscount (2560) ← from t₃
    ✅ Reads fresh shippingCost (0) ← from t₂
    ✅ Result: 2560

t₅: taxAmount updates
    ✅ Reads fresh taxableAmount (2560) ← from t₄
    ✅ Result: 204.80

t₆: totalCost updates
    ✅ Reads fresh taxableAmount (2560) ← from t₄
    ✅ Reads fresh taxAmount (204.80) ← from t₅
    ✅ Result: 2764.80

t₇: effect updates
    ✅ Reads ALL fresh values
    ✅ Displays correct, consistent data

✨ At EVERY step, ALL dependencies are fresh! ✨
```

### Why This Matters in Production

**Scenario: User adds items to cart**

**Without topological ordering (WRONG):**

```
❌ Effect might run while:
   - subtotal = 3200 (new)
   - discountAmount = 200 (old, not updated yet!)
   - totalCost = 3010 (WRONG!)

❌ User sees incorrect price on screen
❌ User proceeds to checkout
❌ Payment gateway charges wrong amount
❌ Customer complains, bad reviews, lost trust
```

**With topological ordering (CORRECT):**

```
✅ Effect runs only after:
   - subtotal = 3200 ✅
   - discountAmount = 640 ✅
   - totalCost = 2764.80 ✅

✅ User sees correct price: $2764.80
✅ User proceeds to checkout with confidence
✅ Payment gateway charges correct amount
✅ Happy customer, good review, repeat business!
```

### The Mathematical Guarantee

**Invariant:** For any computation C in the execution queue:

- All ancestors of C (dependencies) appear AFTER C in the collected array
- When we process in reverse order, all ancestors execute BEFORE C
- Therefore, C always reads fresh values from ALL dependencies
- **No glitches, no inconsistencies, no bugs!** ✅

### Key Takeaways

1. **Correctness**: Every computation sees consistent, up-to-date data
2. **Performance**: Each computation runs exactly ONCE per update cycle
3. **Predictability**: Same inputs → same outputs → same order
4. **Debuggability**: Clear execution flow, easy to trace
5. **Reliability**: Users trust the system because it always shows correct values

This is why Solid.js is so powerful for building reliable, performant UIs! 🚀

### 🎯 Critical Insight: Memo Caching Across Multiple Effects

**Question:** "If I have multiple effects reading the same memos, does each memo compute multiple times?"

**Answer:** NO! **Memos compute ONCE and are cached for all reads in that update cycle.** ✅

This is one of the most important optimizations in Solid.js!

#### Simple Example: Two Effects, One Memo

```typescript
const [count, setCount] = createSignal(0);

const doubled = createMemo(() => {
  console.log("💰 Computing doubled");
  return count() * 2;
});

// Effect 1: Display in UI
createEffect(() => {
  console.log("🎨 Effect 1: Display =", doubled());
});

// Effect 2: Send to analytics
createEffect(() => {
  console.log("📊 Effect 2: Analytics =", doubled());
});

setCount(5);

// Output:
// 💰 Computing doubled  ← Computed ONCE
// 🎨 Effect 1: Display = 10  ← Reads cached value
// 📊 Effect 2: Analytics = 10  ← Reads cached value

// NOT:
// 💰 Computing doubled
// 🎨 Effect 1: Display = 10
// 💰 Computing doubled  ← Would be wasteful!
// 📊 Effect 2: Analytics = 10
```

#### Complex Example: Shopping Cart with Multiple Effects

```typescript
const [items, setItems] = createSignal([{ price: 100, qty: 1 }]);

// Shared memos
const subtotal = createMemo(() => {
  console.log("💰 Computing subtotal");
  return items().reduce((sum, item) => sum + item.price * item.qty, 0);
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
// Multiple effects using same memos
// ============================================

// Effect 1: Cart summary display
createEffect(() => {
  console.log("\n🎨 Effect 1: Cart Summary");
  console.log(`  Subtotal: $${subtotal()}`);
  console.log(`  Tax: $${tax()}`);
  console.log(`  Total: $${total()}`);
});

// Effect 2: Analytics tracking
createEffect(() => {
  console.log("\n📊 Effect 2: Analytics");
  console.log(`  Cart value: $${subtotal()}`);
  console.log(`  Tax: $${tax()}`);
});

// Effect 3: Checkout button
createEffect(() => {
  console.log("\n🔘 Effect 3: Checkout Button");
  console.log(`  Total: $${total()}`);
});

// Effect 4: Free shipping banner
createEffect(() => {
  console.log("\n🚚 Effect 4: Shipping Banner");
  const sub = subtotal();
  console.log(
    sub > 500 ? "Free shipping!" : `$${500 - sub} more for free shipping`
  );
});

console.log("\n🛒 User updates cart...\n");
setItems([{ price: 100, qty: 3 }]);
```

#### What Actually Happens:

```
🛒 User updates cart...

// ============================================
// FLUSH UPDATES PHASE (Memos compute)
// ============================================

💰 Computing subtotal  ← Computed ONCE
   Result: 300
   State: CLEAN ✅

🧾 Computing tax  ← Computed ONCE
   Result: 24
   State: CLEAN ✅

💳 Computing total  ← Computed ONCE
   Result: 324
   State: CLEAN ✅

// ============================================
// FLUSH EFFECTS PHASE (Effects run)
// ============================================

🎨 Effect 1: Cart Summary
   subtotal() → 300 (CACHED! state = CLEAN) ✅
   tax() → 24 (CACHED! state = CLEAN) ✅
   total() → 324 (CACHED! state = CLEAN) ✅
   Subtotal: $300
   Tax: $24
   Total: $324

📊 Effect 2: Analytics
   subtotal() → 300 (CACHED! state = CLEAN) ✅
   tax() → 24 (CACHED! state = CLEAN) ✅
   Cart value: $300
   Tax: $24

🔘 Effect 3: Checkout Button
   total() → 324 (CACHED! state = CLEAN) ✅
   Total: $324

🚚 Effect 4: Shipping Banner
   subtotal() → 300 (CACHED! state = CLEAN) ✅
   $200 more for free shipping

// ============================================
// FINAL COUNT
// ============================================

Computations:
✅ subtotal: 1 computation, 4 reads
✅ tax: 1 computation, 2 reads
✅ total: 1 computation, 2 reads

Total: 3 computations (not 8!)
🎉 Efficiency achieved!
```

#### How the Caching Works

The magic is in the **state** property:

```typescript
// FIRST read (Effect 1):
function readSignal() {
  if (this.state === STALE) {
    // 📍 We're here! Need to compute
    runTop(this); // Recomputes
    // Now: this.state = CLEAN ✅
    // Now: this.value = 300 ✅
  }
  return this.value; // 300
}

// SECOND read (Effect 2):
function readSignal() {
  if (this.state === STALE) {
    // ❌ We skip this! state = CLEAN
  }
  return this.value; // 300 (cached!) ✅
}

// THIRD read (Effect 3):
function readSignal() {
  if (this.state === STALE) {
    // ❌ We skip this! state = CLEAN
  }
  return this.value; // 300 (cached!) ✅
}

// FOURTH read (Effect 4):
function readSignal() {
  if (this.state === STALE) {
    // ❌ We skip this! state = CLEAN
  }
  return this.value; // 300 (cached!) ✅
}
```

#### Real-World Performance Impact

Imagine an expensive computation:

```typescript
const expensiveData = createMemo(() => {
  console.log("⏱️ Running expensive computation...");
  // Simulate 1 second of work
  let result = 0;
  for (let i = 0; i < 100000000; i++) {
    result += Math.sqrt(i);
  }
  return result;
});

// 10 different effects all use this data:
createEffect(() => {
  console.log("Effect 1:", expensiveData());
});

createEffect(() => {
  console.log("Effect 2:", expensiveData());
});

// ... 8 more effects ...

createEffect(() => {
  console.log("Effect 10:", expensiveData());
});

setSignal(newValue);
```

**Without caching (naive approach):**

```
⏱️ Running expensive computation... (1 second)
Effect 1: ...
⏱️ Running expensive computation... (1 second)
Effect 2: ...
⏱️ Running expensive computation... (1 second)
Effect 3: ...
...
⏱️ Running expensive computation... (1 second)
Effect 10: ...

Total time: 10 SECONDS ❌
Total computations: 10 ❌
```

**With Solid.js caching:**

```
⏱️ Running expensive computation... (1 second)
Effect 1: ... (uses cache)
Effect 2: ... (uses cache)
Effect 3: ... (uses cache)
...
Effect 10: ... (uses cache)

Total time: 1 SECOND ✅
Total computations: 1 ✅

10x faster! 🚀
```

#### The Update Cycle Timeline

```
  setSignal(newValue)
         |
         v
   Mark Phase
   =========
   memo.state = STALE
   effect1.state = STALE
   effect2.state = STALE
   effect3.state = STALE
         |
         v
  Flush Updates
  =============
  memo computes ONCE
  memo.state = CLEAN ✅
  memo.value = cached ✅
         |
         v
  Flush Effects
  =============
  effect1.fn()
    → reads memo → sees CLEAN → returns cached value ✅
  effect2.fn()
    → reads memo → sees CLEAN → returns cached value ✅
  effect3.fn()
    → reads memo → sees CLEAN → returns cached value ✅
```

#### Key Points to Remember

1. **One computation per memo per update cycle** ✅

   - No matter how many effects read it
   - State changes from STALE → CLEAN on first read
   - All subsequent reads return cached value

2. **Memos flush BEFORE effects** ✅

   - Updates queue processes all memos first
   - Effects queue processes all effects second
   - Effects always see fully computed, cached memo values

3. **Consistency guaranteed** ✅

   - All effects see the SAME value for each memo
   - No race conditions or partial updates
   - No glitches!

4. **Automatic optimization** ✅

   - You don't need to do anything special
   - Just use `createMemo()` for derived values
   - Solid.js handles the caching automatically

5. **Massive performance wins** 🚀
   - Complex apps with many effects stay fast
   - Expensive computations run only once
   - Scales beautifully as app grows

#### Visual Summary

```
Without Memos (❌ Bad):
======================
Signal → Effect 1 (recompute!)
      → Effect 2 (recompute!)
      → Effect 3 (recompute!)
      → Effect 4 (recompute!)
      → Effect 5 (recompute!)

Computations: 5 ❌
Time: 5x ❌


With Memos (✅ Good):
====================
Signal → Memo (compute once)
             ↓
           CACHED
             ↓
      ┌──────┼──────┬──────┐
      ↓      ↓      ↓      ↓
  Effect1 Effect2 Effect3 Effect4
   (read)  (read)  (read)  (read)

Computations: 1 ✅
Time: 1x ✅
```

This is why we use memos for derived state in Solid.js! They automatically optimize your entire application by ensuring each value is computed exactly once per update, no matter how many components or effects need it. 🎉

## 🚀 Next Steps

Now that you understand computation states AND when flushes happen, you're ready to learn about:

**[06-effect-scheduling.md](./06-effect-scheduling.md)** - How to implement proper effect queuing and execution order!

---

## 💡 Final Thoughts

**Computation states are like a smart kitchen:**

- Don't cook until someone orders (lazy) 🍳
- Wait for all ingredients to arrive (prevent glitches) 🥚
- Cook in the right order (topological) 📊
- Serve one perfect meal (efficiency) ✨

**And runUpdates is the head chef** 👨‍🍳 that:

- Takes all orders at once (batching) 📝
- Preps ingredients first (Updates/memos) 🥗
- Cooks the main course (Effects) 🍖
- Serves everything fresh (consistency) 🍽️

This is how Solid.js stays fast and glitch-free! 🎉

---

**Questions? Things Still Unclear?**

Remember these key insights:

- **Lazy** = Don't work until you have to
- **States** = Traffic lights for computations
- **Glitches** = Seeing wrong intermediate values
- **Prevention** = Update all at once, show only final values
- **Flush** = The moment everything gets computed and executed

The key insight: **Mark now, compute later, show correct values!** ✨
