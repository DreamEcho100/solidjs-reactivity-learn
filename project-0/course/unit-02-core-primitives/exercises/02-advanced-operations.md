# Unit 2: Core Primitives - Exercises

## Exercise 2: Advanced Signal Operations

### Exercise 2.1: Custom Equality Comparators

**Objective:** Understand how custom comparators control signal updates.

**Task:** Implement signals with different equality strategies:

```typescript
// TODO: Implement these signal creation patterns

// 1. Deep equality for objects
function createDeepSignal<T extends object>(initialValue: T) {
  // Hint: Use a custom comparator that does deep equality
  // You may want to use a library like 'fast-deep-equal' or implement your own
}

// 2. Tolerance-based equality for numbers
function createTolerantSignal(initialValue: number, tolerance = 0.001) {
  // Hint: Only trigger updates if the difference exceeds tolerance
  // Useful for floats or sensor data
}

// 3. Ignore-case equality for strings
function createCaseInsensitiveSignal(initialValue: string) {
  // Hint: Compare lowercase versions
}

// Test your implementations
const [obj, setObj] = createDeepSignal({ x: 1, y: 2 });
const [num, setNum] = createTolerantSignal(0, 0.1);
const [str, setStr] = createCaseInsensitiveSignal("Hello");

createEffect(() => console.log("Object:", obj()));
createEffect(() => console.log("Number:", num()));
createEffect(() => console.log("String:", str()));

// Should NOT trigger effect (same object structure)
setObj({ x: 1, y: 2 });

// Should NOT trigger effect (within tolerance)
setNum(0.05);

// Should NOT trigger effect (same ignoring case)
setStr("hello");

// These SHOULD trigger effects
setObj({ x: 2, y: 2 });
setNum(0.2);
setStr("goodbye");
```

**Expected Output:**
```
Object: { x: 1, y: 2 }
Number: 0
String: Hello
Object: { x: 2, y: 2 }
Number: 0.2
String: goodbye
```

---

### Exercise 2.2: Computation Lifecycle

**Objective:** Master the lifecycle of computations and effects.

**Task:** Create a system that tracks lifecycle events:

```typescript
// TODO: Implement lifecycle tracking

let creationCount = 0;
let executionCount = 0;
let cleanupCount = 0;

function createTrackedEffect(fn: () => void) {
  creationCount++;
  
  createEffect(() => {
    executionCount++;
    
    onCleanup(() => {
      cleanupCount++;
    });
    
    fn();
  });
}

// Create a reactive context
const [show, setShow] = createSignal(true);
const [count, setCount] = createSignal(0);

createEffect(() => {
  if (show()) {
    createTrackedEffect(() => {
      console.log("Count:", count());
    });
  }
});

// Scenario 1: Initial creation
console.log("=== Initial ===");
console.log({ creationCount, executionCount, cleanupCount });
// Expected: { creationCount: 1, executionCount: 1, cleanupCount: 0 }

// Scenario 2: Update dependency
setCount(1);
console.log("=== After count update ===");
console.log({ creationCount, executionCount, cleanupCount });
// Expected: { creationCount: 1, executionCount: 2, cleanupCount: 1 }

// Scenario 3: Dispose by hiding
setShow(false);
console.log("=== After hiding ===");
console.log({ creationCount, executionCount, cleanupCount });
// Expected: { creationCount: 1, executionCount: 2, cleanupCount: 2 }

// Scenario 4: Re-create by showing
setShow(true);
console.log("=== After showing ===");
console.log({ creationCount, executionCount, cleanupCount });
// Expected: { creationCount: 2, executionCount: 3, cleanupCount: 2 }
```

---

### Exercise 2.3: Ownership Hierarchies

**Objective:** Understand parent-child ownership relationships.

**Task:** Create a nested ownership structure and observe cleanup behavior:

```typescript
// TODO: Implement this ownership hierarchy

const disposers: (() => void)[] = [];

function createOwnedContext(name: string) {
  return createRoot((dispose) => {
    console.log(`Creating ${name}`);
    
    onCleanup(() => {
      console.log(`Cleaning up ${name}`);
    });
    
    disposers.push(dispose);
    
    return {
      createChild(childName: string) {
        return createOwnedContext(`${name}.${childName}`);
      }
    };
  });
}

// Build hierarchy: App -> Dashboard -> [Chart1, Chart2]
const app = createOwnedContext("App");
const dashboard = app.createChild("Dashboard");
const chart1 = dashboard.createChild("Chart1");
const chart2 = dashboard.createChild("Chart2");

// Now dispose in different orders and observe

// Experiment 1: Dispose leaf node
console.log("=== Disposing Chart1 ===");
disposers[2](); // Disposes only Chart1

// Experiment 2: Dispose parent node
console.log("=== Disposing Dashboard ===");
disposers[1](); // Should dispose Dashboard and Chart2

// Experiment 3: Dispose root
console.log("=== Disposing App ===");
disposers[0](); // Should dispose App (but children already disposed)
```

**Expected Output:**
```
Creating App
Creating App.Dashboard
Creating App.Dashboard.Chart1
Creating App.Dashboard.Chart2
=== Disposing Chart1 ===
Cleaning up App.Dashboard.Chart1
=== Disposing Dashboard ===
Cleaning up App.Dashboard.Chart2
Cleaning up App.Dashboard
=== Disposing App ===
Cleaning up App
```

---

### Exercise 2.4: Tracking vs. Untracking

**Objective:** Master when to track and when to untrack dependencies.

**Task:** Fix the bugs in this code by using `untrack()` correctly:

```typescript
// BUG 1: Infinite loop
const [count, setCount] = createSignal(0);

createEffect(() => {
  console.log("Current count:", count());
  // BUG: This creates an infinite loop!
  setCount(count() + 1);
});

// TODO: Fix by untracking the read inside setCount
// Hint: setCount(untrack(() => count()) + 1);

// ---

// BUG 2: Over-tracking
const [firstName, setFirstName] = createSignal("John");
const [lastName, setLastName] = createSignal("Doe");
const [trackLastName, setTrackLastName] = createSignal(true);

createEffect(() => {
  let name = firstName();
  
  // BUG: This always tracks lastName, even when trackLastName is false
  if (trackLastName()) {
    name += " " + lastName();
  } else {
    name += " " + lastName(); // Should NOT trigger when lastName changes
  }
  
  console.log("Full name:", name);
});

// TODO: Fix by untracking lastName when trackLastName is false
// Hint: Use untrack(() => lastName()) in the else branch

// Test:
setFirstName("Jane"); // Should log
setTrackLastName(false);
setLastName("Smith"); // Should NOT log (untracked)
setFirstName("Bob"); // Should log

// ---

// BUG 3: Under-tracking
const [items, setItems] = createSignal([1, 2, 3]);
const [multiplier, setMultiplier] = createSignal(2);

createEffect(() => {
  // BUG: This doesn't react to items changes!
  const itemList = untrack(() => items());
  const mult = multiplier();
  
  console.log("Multiplied:", itemList.map(x => x * mult));
});

// TODO: Fix by NOT untracking items
// Hint: Only untrack reads that shouldn't cause re-runs

// Test:
setMultiplier(3); // Should log
setItems([4, 5, 6]); // Should log (currently doesn't!)
```

---

### Exercise 2.5: Memo Performance

**Objective:** Understand when memos improve performance vs. when they add overhead.

**Task:** Benchmark different scenarios:

```typescript
// Scenario A: Expensive computation, rarely changes
const [data, setData] = createSignal([1, 2, 3, 4, 5]);

// Without memo (recomputes every time any consumer re-runs)
createEffect(() => {
  const sum = data().reduce((a, b) => a + b, 0);
  console.log("Sum:", sum);
});

// With memo (computes once, caches result)
const sum = createMemo(() => data().reduce((a, b) => a + b, 0));
createEffect(() => {
  console.log("Sum:", sum());
});

// TODO: Benchmark these two approaches

// ---

// Scenario B: Cheap computation, frequently changes
const [x, setX] = createSignal(1);

// Without memo
createEffect(() => {
  const doubled = x() * 2;
  console.log("Doubled:", doubled);
});

// With memo (adds overhead!)
const doubled = createMemo(() => x() * 2);
createEffect(() => {
  console.log("Doubled:", doubled());
});

// TODO: Benchmark these two approaches

// ---

// Scenario C: Multiple consumers
const [value, setValue] = createSignal(0);

// Without memo (computes 3 times!)
createEffect(() => console.log("A:", expensiveComputation(value())));
createEffect(() => console.log("B:", expensiveComputation(value())));
createEffect(() => console.log("C:", expensiveComputation(value())));

// With memo (computes once, shared by all!)
const computed = createMemo(() => expensiveComputation(value()));
createEffect(() => console.log("A:", computed()));
createEffect(() => console.log("B:", computed()));
createEffect(() => console.log("C:", computed()));

// TODO: Benchmark these two approaches and understand when memo is worth it

function expensiveComputation(n: number) {
  let result = n;
  for (let i = 0; i < 1000000; i++) {
    result = Math.sqrt(result + i);
  }
  return result;
}

// TODO: Create a benchmark utility
function benchmark(name: string, fn: () => void, iterations = 1000) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const end = performance.now();
  console.log(`${name}: ${(end - start).toFixed(2)}ms`);
}
```

---

### Exercise 2.6: Dynamic Dependencies

**Objective:** Handle computations with conditional dependencies.

**Task:** Implement a smart dependency system:

```typescript
// Create a system that only tracks signals that are actually read

const [mode, setMode] = createSignal<"a" | "b" | "c">("a");
const [signalA, setSignalA] = createSignal(1);
const [signalB, setSignalB] = createSignal(2);
const [signalC, setSignalC] = createSignal(3);

let runCount = 0;

createEffect(() => {
  runCount++;
  const m = mode();
  
  if (m === "a") {
    console.log("Mode A:", signalA());
  } else if (m === "b") {
    console.log("Mode B:", signalB());
  } else {
    console.log("Mode C:", signalC());
  }
});

// Test dynamic dependencies
console.log("=== Initial (mode=a) ===");
console.log("Run count:", runCount); // 1

console.log("=== Update signalA (should trigger) ===");
setSignalA(10);
console.log("Run count:", runCount); // 2

console.log("=== Update signalB (should NOT trigger) ===");
setSignalB(20);
console.log("Run count:", runCount); // Still 2

console.log("=== Switch to mode B ===");
setMode("b");
console.log("Run count:", runCount); // 3

console.log("=== Update signalA (should NOT trigger now) ===");
setSignalA(100);
console.log("Run count:", runCount); // Still 3

console.log("=== Update signalB (should trigger now) ===");
setSignalB(200);
console.log("Run count:", runCount); // 4

// TODO: Verify that your implementation produces this output
```

---

### Exercise 2.7: Error Handling in Computations

**Objective:** Understand how errors propagate in reactive systems.

**Task:** Implement error boundaries for computations:

```typescript
// TODO: Implement error handling

const [value, setValue] = createSignal(0);
const [throwError, setThrowError] = createSignal(false);

// Without error handling (crashes the app!)
createEffect(() => {
  if (throwError()) {
    throw new Error("Computation failed!");
  }
  console.log("Value:", value());
});

// TODO: Use catchError to handle this gracefully
catchError(
  () => {
    createEffect(() => {
      if (throwError()) {
        throw new Error("Computation failed!");
      }
      console.log("Value:", value());
    });
  },
  (err) => {
    console.error("Caught error:", err.message);
  }
);

// Test
console.log("=== Normal operation ===");
setValue(1); // Should log "Value: 1"

console.log("=== Trigger error ===");
setThrowError(true); // Should log "Caught error: Computation failed!"

console.log("=== Recover ===");
setThrowError(false);
setValue(2); // Should log "Value: 2"
```

---

## Challenge Exercises

### Challenge 1: Build a Reactive Store

Implement a reactive store with getter/setter patterns:

```typescript
function createStore<T extends object>(initial: T) {
  // TODO: Implement a proxy-based reactive store
  // Hint: Use Proxy to intercept property access
  // Create a signal for each property
}

const store = createStore({
  count: 0,
  name: "John",
  nested: { x: 1, y: 2 }
});

createEffect(() => {
  console.log("Count:", store.count);
});

createEffect(() => {
  console.log("Name:", store.name);
});

createEffect(() => {
  console.log("X:", store.nested.x);
});

store.count++; // Should only trigger count effect
store.name = "Jane"; // Should only trigger name effect
store.nested.x = 5; // Should only trigger x effect
```

### Challenge 2: Build a Computed Store

Extend the store with computed properties:

```typescript
const store = createStore(
  {
    firstName: "John",
    lastName: "Doe"
  },
  {
    fullName: (s) => `${s.firstName} ${s.lastName}`,
    initials: (s) => `${s.firstName[0]}${s.lastName[0]}`
  }
);

createEffect(() => {
  console.log("Full name:", store.fullName);
});

store.firstName = "Jane"; // Should log "Full name: Jane Doe"
```

### Challenge 3: Implement Batched Updates

Create a `batch()` function that defers all updates until the end:

```typescript
function batch<T>(fn: () => T): T {
  // TODO: Implement batching
  // Hint: Collect all signal updates, then flush at the end
}

const [a, setA] = createSignal(0);
const [b, setB] = createSignal(0);
const [c, setC] = createSignal(0);

let effectRunCount = 0;

createEffect(() => {
  effectRunCount++;
  console.log("Sum:", a() + b() + c());
});

// Without batching: effect runs 3 times
setA(1); // Run 1
setB(2); // Run 2
setC(3); // Run 3

console.log("Effect ran:", effectRunCount, "times"); // 4 (initial + 3 updates)

// With batching: effect runs once
batch(() => {
  setA(10);
  setB(20);
  setC(30);
}); // Run 4 (all together)

console.log("Effect ran:", effectRunCount, "times"); // 5 (4 + 1 batched)
```

---

## Solutions

Solutions to all exercises are available in the `solutions/` folder. Try to solve them yourself first before checking the solutions!

## Additional Resources

- [SolidJS Signal Source Code](https://github.com/solidjs/solid/blob/main/packages/solid/src/reactive/signal.ts)
- [Fine-Grained Reactivity Article](https://dev.to/ryansolid/a-hands-on-introduction-to-fine-grained-reactivity-3ndf)
- [S.js Library (Inspiration for Solid)](https://github.com/adamhaile/S)
