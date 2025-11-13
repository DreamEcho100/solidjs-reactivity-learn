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
setEggs(3);    // ← Cooks omelette immediately! (waste)
setMilk("2 cups"); // ← Cooks AGAIN! (waste)
setEggs(4);    // ← Cooks AGAIN! (waste)

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
setFirstName("Jane");  // ← Changes immediately!
setLastName("Smith");  // ← Changes immediately!

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
const [applePrice, setApplePrice] = createSignal(1.00);
const [bananaPrice, setBananaPrice] = createSignal(0.50);
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
setApplePrice(0.50);   // 50% off!
setBananaPrice(0.25);  // 50% off!
setOrangePrice(0.40);  // ~45% off!
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
CLEAN = 0   // 🟢 Up-to-date
STALE = 1   // 🟡 Needs update
PENDING = 2 // 🔵 Waiting

// In computation
memo.state = 0  // CLEAN
memo.state = 1  // STALE
memo.state = 2  // PENDING
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

## 🚀 Next Steps

Now that you understand computation states, you're ready to learn about:

**[06-effect-scheduling.md](./06-effect-scheduling.md)** - How to implement proper effect queuing and execution order!

---

## 💡 Final Thoughts

**Computation states are like a smart kitchen:**
- Don't cook until someone orders (lazy) 🍳
- Wait for all ingredients to arrive (prevent glitches) 🥚
- Cook in the right order (topological) 📊
- Serve one perfect meal (efficiency) ✨

This is how Solid.js stays fast and glitch-free! 🎉

---

**Questions? Things Still Unclear?**

Remember these key insights:
- **Lazy** = Don't work until you have to
- **States** = Traffic lights for computations
- **Glitches** = Seeing wrong intermediate values
- **Prevention** = Update all at once, show only final values

The key insight: **Mark now, compute later, show correct values!** ✨
