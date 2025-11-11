# Lesson 1: Introduction to Reactive Programming

## Table of Contents
1. [What is Reactivity?](#what-is-reactivity)
2. [Why Reactivity Matters](#why-reactivity-matters)
3. [Push vs Pull Models](#push-vs-pull-models)
4. [Fine-Grained vs Coarse-Grained](#fine-grained-vs-coarse-grained)
5. [Mental Models](#mental-models)
6. [Real-World Analogies](#real-world-analogies)
7. [Summary](#summary)

---

## What is Reactivity?

### The Core Concept

**Reactivity** is a programming paradigm where changes to data automatically propagate through a system, updating all dependent computations without manual intervention.

Think of it like a spreadsheet:
- Cell A1 contains `5`
- Cell A2 contains `10`
- Cell A3 contains `=A1 + A2`

When you change A1 to `7`, A3 automatically updates to `17`. You didn't have to:
- Remember that A3 depends on A1
- Manually recalculate A3
- Notify A3 that A1 changed

The spreadsheet handles all of this **reactively**.

### The Problem Reactivity Solves

In traditional imperative programming, we manually manage state and updates:

```javascript
// Imperative approach
let firstName = "John";
let lastName = "Doe";
let fullName = firstName + " " + lastName; // "John Doe"

// Update firstName
firstName = "Jane";
// ❌ Problem: fullName is still "John Doe"
// We have to manually update it
fullName = firstName + " " + lastName; // "Jane Doe"
```

**Issues with Imperative Approach:**
1. ❌ Easy to forget updates
2. ❌ Must manually track dependencies
3. ❌ Order of updates matters
4. ❌ Scales poorly with complexity
5. ❌ Difficult to maintain

### The Reactive Solution

```javascript
// Reactive approach (pseudocode)
const firstName = signal("John");
const lastName = signal("Doe");
const fullName = computed(() => firstName() + " " + lastName());

console.log(fullName()); // "John Doe"

// Update firstName
firstName("Jane");
// ✅ fullName automatically updates to "Jane Doe"
console.log(fullName()); // "Jane Doe"
```

**Benefits of Reactive Approach:**
1. ✅ Automatic updates
2. ✅ Dependencies tracked automatically
3. ✅ Update order handled automatically
4. ✅ Scales naturally
5. ✅ Easier to maintain

---

## Why Reactivity Matters

### 1. Modern UI Development

User interfaces are inherently reactive:
- User clicks button → UI updates
- Data loads → Display changes
- Form input changes → Validation runs

**Without Reactivity:**
```javascript
// Manual DOM updates
let count = 0;

function increment() {
  count++;
  document.getElementById('count').textContent = count;
  document.getElementById('doubled').textContent = count * 2;
  document.getElementById('isEven').textContent = count % 2 === 0;
  // ... must remember all places to update
}
```

**With Reactivity:**
```javascript
// Automatic DOM updates
const [count, setCount] = createSignal(0);

// These automatically update when count changes
createEffect(() => {
  document.getElementById('count').textContent = count();
});
createEffect(() => {
  document.getElementById('doubled').textContent = count() * 2;
});
createEffect(() => {
  document.getElementById('isEven').textContent = count() % 2 === 0;
});

function increment() {
  setCount(count() + 1);
  // Everything updates automatically!
}
```

### 2. Complex State Dependencies

As applications grow, state dependencies become complex:

```javascript
// Example: Shopping cart
const items = signal([]);
const subtotal = computed(() => 
  items().reduce((sum, item) => sum + item.price * item.quantity, 0)
);
const tax = computed(() => subtotal() * 0.08);
const shipping = computed(() => subtotal() > 50 ? 0 : 5.99);
const total = computed(() => subtotal() + tax() + shipping());

// Add item - EVERYTHING updates automatically
items([...items(), { price: 10, quantity: 2 }]);
```

**Dependency Graph:**
```
items
  ↓
subtotal
  ↓ ↓ ↓
tax shipping total
       ↓
     total
```

### 3. Performance Optimization

Reactive systems can optimize updates:
- Only recompute what actually changed
- Batch multiple updates
- Skip unnecessary work
- Fine-grained precision

---

## Push vs Pull Models

There are two fundamental approaches to reactivity:

### Pull Model (Lazy Evaluation)

**Concept:** Values are computed only when requested.

```javascript
// Pull model (simplified)
class PullSignal {
  constructor(compute) {
    this.compute = compute;
    this.cached = null;
    this.dirty = true;
  }
  
  get() {
    if (this.dirty) {
      this.cached = this.compute();
      this.dirty = false;
    }
    return this.cached;
  }
}

const a = new PullSignal(() => 5);
const b = new PullSignal(() => 10);
const sum = new PullSignal(() => a.get() + b.get());

// Nothing computed yet!
console.log(sum.get()); // NOW it computes: 15
```

**Characteristics:**
- ✅ Lazy: Only computes when needed
- ✅ Can skip unused computations
- ❌ Must poll for changes
- ❌ Can miss updates if not checked

**Use Cases:**
- Computed properties in Vue 2
- Getters in MobX
- Selectors in Reselect

### Push Model (Eager Propagation)

**Concept:** Changes immediately propagate to dependents.

```javascript
// Push model (simplified)
class PushSignal {
  constructor(value) {
    this.value = value;
    this.subscribers = new Set();
  }
  
  get() {
    return this.value;
  }
  
  set(newValue) {
    this.value = newValue;
    // Immediately notify all subscribers
    this.subscribers.forEach(fn => fn(newValue));
  }
  
  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
}

const a = new PushSignal(5);
const b = new PushSignal(10);

// Set up automatic updates
let sum = a.get() + b.get();
a.subscribe(() => sum = a.get() + b.get());
b.subscribe(() => sum = a.get() + b.get());

console.log(sum); // 15
a.set(7); // Immediately updates sum to 17
console.log(sum); // 17
```

**Characteristics:**
- ✅ Immediate updates
- ✅ Never misses changes
- ❌ Might do unnecessary work
- ❌ Requires careful ordering

**Use Cases:**
- Solid.js
- Knockout
- S.js
- Svelte stores

### Hybrid Approach (Solid.js Strategy)

Solid.js uses a **hybrid push-pull model**:
- **Push:** Signals notify dependents of changes (mark as stale)
- **Pull:** Computations are evaluated lazily when accessed
- **Result:** Best of both worlds!

```javascript
// Solid.js approach (simplified)
const [count, setCount] = createSignal(0);

// This memo is marked "dirty" but not computed yet (push)
const doubled = createMemo(() => {
  console.log('Computing doubled');
  return count() * 2;
});

// Nothing logged yet

console.log(doubled()); // NOW it computes (pull)
// Logs: "Computing doubled"
// Returns: 0

setCount(5); // Marks doubled as dirty (push)
// Still nothing logged

console.log(doubled()); // Recomputes (pull)
// Logs: "Computing doubled"
// Returns: 10
```

---

## Fine-Grained vs Coarse-Grained

### Coarse-Grained Reactivity

**Concept:** Large chunks of the system update together.

**Example: React's Virtual DOM**
```javascript
function Counter() {
  const [count, setCount] = useState(0);
  
  return (
    <div>
      <h1>Count: {count}</h1>
      <p>Doubled: {count * 2}</p>
      <p>Tripled: {count * 3}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
}

// When count changes:
// 1. Entire component re-runs
// 2. New virtual DOM created
// 3. Diffed against previous
// 4. Real DOM updated
```

**Characteristics:**
- ❌ More work per update
- ❌ Requires reconciliation/diffing
- ✅ Simpler mental model
- ✅ Works well with immutability

**Update Granularity:** Component level

### Fine-Grained Reactivity

**Concept:** Individual values update independently.

**Example: Solid.js Signals**
```javascript
function Counter() {
  const [count, setCount] = createSignal(0);
  
  return (
    <div>
      <h1>Count: {count()}</h1>
      <p>Doubled: {() => count() * 2}</p>
      <p>Tripled: {() => count() * 3}</p>
      <button onClick={() => setCount(count() + 1)}>Increment</button>
    </div>
  );
}

// When count changes:
// 1. Only count() calls detect change
// 2. Only those specific DOM nodes update
// 3. No diffing needed
```

**Characteristics:**
- ✅ Minimal work per update
- ✅ No reconciliation needed
- ❌ Requires understanding reactivity
- ✅ Naturally efficient

**Update Granularity:** Value level

### Visual Comparison

**Coarse-Grained (Component Updates):**
```
State Change
     ↓
  Component
     ↓
  Re-render
     ↓
   Diff
     ↓
DOM Updates
```

**Fine-Grained (Value Updates):**
```
State Change
     ↓
Only affected values
     ↓
Direct DOM Updates
```

### Performance Implications

**Coarse-Grained:**
```javascript
// 1000 items, updating one
const [items, setItems] = useState(Array(1000).fill(0));

function updateOne(index) {
  setItems(prev => {
    const next = [...prev];
    next[index] = prev[index] + 1;
    return next;
  });
  // Re-renders entire list (1000 items)
}
```

**Fine-Grained:**
```javascript
// 1000 items, updating one
const items = Array(1000).fill(0).map(() => createSignal(0));

function updateOne(index) {
  const [, setItem] = items[index];
  setItem(prev => prev + 1);
  // Updates only that one item
}
```

---

## Mental Models

### 1. The Spreadsheet Model

**Best for:** Understanding automatic updates

Cells (signals) contain values or formulas (computations). When a cell changes, all formulas referencing it update automatically.

```
A1: 5           ← signal
A2: 10          ← signal
A3: =A1 + A2    ← computed (15)
A4: =A3 * 2     ← computed (30)
```

Change A1 to 7, and A3 becomes 17, A4 becomes 34 automatically.

### 2. The Event Emitter Model

**Best for:** Understanding notifications

Signals are like event emitters. Effects are like event listeners. When a signal emits a "change" event, all subscribed effects run.

```javascript
// Conceptually similar to:
const eventEmitter = new EventEmitter();
eventEmitter.on('change', () => console.log('Value changed!'));
eventEmitter.emit('change');
```

### 3. The Dependency Graph Model

**Best for:** Understanding relationships

Visualize your reactive system as a directed graph:
- **Nodes:** Signals and computations
- **Edges:** Dependencies

```
     signal1     signal2
        ↓    ↘  ↙    ↓
        computed1    computed2
             ↓    ↘  ↙
            effect1
```

Updates flow from top to bottom.

### 4. The Water Flow Model

**Best for:** Understanding propagation

Think of values flowing through pipes:
- **Signals:** Water sources
- **Computations:** Filters/processors
- **Effects:** Destinations

When water (data) flows from source, it automatically flows through all connected pipes.

### 5. The Observer Pattern Model

**Best for:** Understanding the mechanism

Classic Observer pattern:
- **Subject (Signal):** Maintains list of observers
- **Observers (Effects):** Subscribe to subject
- **Notification:** Subject notifies all observers of changes

---

## Real-World Analogies

### 1. Thermostat System

**Scenario:** Room temperature control

```javascript
// Temperature sensor (signal)
const currentTemp = createSignal(68);

// Thermostat setting (signal)
const targetTemp = createSignal(72);

// Heater state (computed)
const heaterOn = createMemo(() => 
  currentTemp() < targetTemp()
);

// Effect: Actually control heater
createEffect(() => {
  if (heaterOn()) {
    console.log('🔥 Heater ON');
  } else {
    console.log('❄️  Heater OFF');
  }
});

// Temperature changes → heater automatically responds
currentTemp(70); // 🔥 Heater ON
currentTemp(73); // ❄️ Heater OFF
```

### 2. Traffic Light System

**Scenario:** Coordinated traffic lights

```javascript
// Main light state (signal)
const mainLight = createSignal('red');

// Cross street must be opposite (computed)
const crossLight = createMemo(() => 
  mainLight() === 'red' ? 'green' : 'red'
);

// Display effect
createEffect(() => {
  console.log(`Main: ${mainLight()}, Cross: ${crossLight()}`);
});

mainLight('green'); // Main: green, Cross: red
// No need to manually update cross street!
```

### 3. Stock Portfolio

**Scenario:** Calculate portfolio value

```javascript
// Individual stock prices (signals)
const applePrice = createSignal(150);
const googlePrice = createSignal(2800);
const teslaPrice = createSignal(900);

// Share counts (signals)
const appleShares = createSignal(10);
const googleShares = createSignal(5);
const teslaShares = createSignal(8);

// Position values (computed)
const appleValue = createMemo(() => applePrice() * appleShares());
const googleValue = createMemo(() => googlePrice() * googleShares());
const teslaValue = createMemo(() => teslaPrice() * teslaShares());

// Total portfolio (computed)
const totalValue = createMemo(() => 
  appleValue() + googleValue() + teslaValue()
);

// Display effect
createEffect(() => {
  console.log(`Portfolio Value: $${totalValue()}`);
});

// Any price or share count change → automatic recalculation
applePrice(155); // Portfolio Value: $22700
teslaShares(10); // Portfolio Value: $24500
```

### 4. Social Media Feed

**Scenario:** Personalized content feed

```javascript
// User preferences (signals)
const showImages = createSignal(true);
const showVideos = createSignal(true);
const darkMode = createSignal(false);

// All posts (signal)
const allPosts = createSignal([/* posts */]);

// Filtered posts (computed)
const visiblePosts = createMemo(() => {
  return allPosts().filter(post => {
    if (post.type === 'image' && !showImages()) return false;
    if (post.type === 'video' && !showVideos()) return false;
    return true;
  });
});

// Theme (computed)
const theme = createMemo(() => 
  darkMode() ? 'dark' : 'light'
);

// Render effect
createEffect(() => {
  renderFeed(visiblePosts(), theme());
});

// Any preference change → feed automatically updates
showImages(false); // Feed re-renders without images
darkMode(true);    // Theme changes to dark
```

---

## Summary

### Key Takeaways

1. **Reactivity = Automatic Propagation**
   - Changes flow through dependencies automatically
   - No manual update tracking needed

2. **Push vs Pull**
   - Push: Immediate notification
   - Pull: Lazy evaluation
   - Hybrid: Best of both (Solid.js approach)

3. **Fine-Grained vs Coarse-Grained**
   - Fine-grained: Update individual values
   - Coarse-grained: Update larger chunks
   - Fine-grained is more efficient but requires understanding

4. **Mental Models**
   - Spreadsheet: Automatic formula updates
   - Event Emitter: Notification system
   - Dependency Graph: Relationship visualization
   - Water Flow: Data propagation
   - Observer Pattern: Classic design pattern

5. **Real-World Applications**
   - UIs are naturally reactive
   - Complex state dependencies
   - Performance optimization
   - Easier maintenance

### What You've Learned

- ✅ What reactivity is and why it matters
- ✅ Different reactive models (push/pull)
- ✅ Granularity levels (fine/coarse)
- ✅ Mental models for understanding
- ✅ Real-world applications

### Next Steps

Now that you understand the foundations of reactivity:

1. **Practice:** Think about imperative code you've written
2. **Identify:** Where could reactivity help?
3. **Visualize:** Draw dependency graphs
4. **Prepare:** For implementing signals in Lesson 2

### Questions to Consider

1. Can you identify reactive patterns in applications you use daily?
2. What problems in your own code could reactivity solve?
3. How would you explain reactivity to a colleague?
4. What concerns do you have about reactive programming?

---

## Further Reading

- **Next Lesson:** [The Signal Pattern](./lesson-02-signal-pattern.md)
- **Exercises:** [Basic Reactivity Exercises](../exercises/01-basic-reactivity.md)
- **Reference:** [Reactivity Glossary](../notes/reactivity-glossary.md)

---

**Ready to dive deeper?** Continue to Lesson 2 where we'll explore the Signal pattern in detail and start building our reactive system!
