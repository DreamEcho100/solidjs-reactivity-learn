# Unit 3: Advanced Patterns - Exercises

## Exercise 3.1: Computation States Deep Dive

**Objective:** Understand STALE, PENDING, and CLEAN states in the reactive graph.

### Part A: State Transitions

```typescript
// Track state changes of a memo
function createTrackedMemo<T>(fn: () => T, name: string) {
  const states: string[] = [];
  
  const memo = createMemo(() => {
    states.push("COMPUTING");
    const result = fn();
    states.push("CLEAN");
    return result;
  });
  
  // TODO: Implement state tracking
  // How can you detect when a memo becomes STALE or PENDING?
  
  return { memo, getStates: () => states };
}

// Test the state transitions
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);

const { memo: sum, getStates } = createTrackedMemo(
  () => a() + b(),
  "sum"
);

createEffect(() => console.log("Sum:", sum()));

console.log("Initial states:", getStates());
// Expected: ["COMPUTING", "CLEAN"]

setA(5);
console.log("After setA states:", getStates());
// Expected: ["COMPUTING", "CLEAN", "STALE", "COMPUTING", "CLEAN"]

batch(() => {
  setA(10);
  setB(20);
});
console.log("After batch states:", getStates());
// Expected: Should show batched state changes
```

### Part B: Diamond Problem

```typescript
// The diamond problem occurs when a computation depends on
// two memos that both depend on the same signal

const [source, setSource] = createSignal(1);

let leftRunCount = 0;
const left = createMemo(() => {
  leftRunCount++;
  return source() * 2;
});

let rightRunCount = 0;
const right = createMemo(() => {
  rightRunCount++;
  return source() * 3;
});

let combineRunCount = 0;
const combined = createMemo(() => {
  combineRunCount++;
  return left() + right();
});

createEffect(() => console.log("Combined:", combined()));

console.log("Initial run counts:", { leftRunCount, rightRunCount, combineRunCount });
// Expected: Each should be 1

setSource(2);

console.log("After update:", { leftRunCount, rightRunCount, combineRunCount });
// TODO: What should these values be?
// Should combined run once or twice?
// This tests if the framework prevents the diamond problem

// YOUR ANSWER:
// leftRunCount: ?
// rightRunCount: ?
// combineRunCount: ?
```

---

## Exercise 3.2: Conditional Reactivity Patterns

**Objective:** Master dynamic dependencies and conditional tracking.

### Part A: createSelector Implementation

```typescript
// Implement createSelector yourself
function myCreateSelector<T>(source: Accessor<T>) {
  // TODO: Implement this
  // Hint: Use a Map to track which keys are being watched
  // Only notify computations when their specific key changes
  
  const subscribers = new Map<T, Set<Computation>>();
  
  // TODO: Create a memo that watches the source
  // TODO: Return a function that checks if a key is selected
  
  return (key: T) => {
    // TODO: Subscribe current computation to this specific key
    // TODO: Return whether this key equals the current source value
  };
}

// Test your implementation
const [selected, setSelected] = createSignal<string | null>("a");
const isSelected = myCreateSelector(selected);

let aRuns = 0;
let bRuns = 0;
let cRuns = 0;

createEffect(() => {
  if (isSelected("a")) {
    aRuns++;
    console.log("A is selected");
  }
});

createEffect(() => {
  if (isSelected("b")) {
    bRuns++;
    console.log("B is selected");
  }
});

createEffect(() => {
  if (isSelected("c")) {
    cRuns++;
    console.log("C is selected");
  }
});

console.log("Initial runs:", { aRuns, bRuns, cRuns });
// Expected: { aRuns: 1, bRuns: 1, cRuns: 1 }

setSelected("b");
console.log("After selecting B:", { aRuns, bRuns, cRuns });
// Expected: { aRuns: 2, bRuns: 2, cRuns: 1 }
// Only A (deselect) and B (select) should re-run

setSelected("b"); // Same value
console.log("After selecting B again:", { aRuns, bRuns, cRuns });
// Expected: { aRuns: 2, bRuns: 2, cRuns: 1 }
// Nothing should re-run
```

### Part B: Lazy Evaluation Pattern

```typescript
// Implement a lazy computation that only runs when accessed
function createLazy<T>(fn: () => T) {
  let cached: T | undefined;
  let isValid = false;
  
  const [trigger, setTrigger] = createSignal(0);
  
  // TODO: Implement lazy evaluation
  // 1. Track dependencies like a memo
  // 2. But only compute when explicitly accessed
  // 3. Cache the result until dependencies change
  
  return () => {
    // TODO: Implement
  };
}

// Test
const [expensive, setExpensive] = createSignal(1);

let computeCount = 0;
const lazy = createLazy(() => {
  computeCount++;
  console.log("Computing expensive value...");
  return expensive() * 1000;
});

console.log("After creating lazy:", computeCount);
// Expected: 0 (hasn't computed yet!)

setExpensive(2);
console.log("After updating signal:", computeCount);
// Expected: 0 (still hasn't computed!)

console.log("Value:", lazy());
console.log("Compute count:", computeCount);
// Expected: 1 (computed on access)

console.log("Value again:", lazy());
console.log("Compute count:", computeCount);
// Expected: 1 (cached, didn't recompute)

setExpensive(3);
console.log("Value after update:", lazy());
console.log("Compute count:", computeCount);
// Expected: 2 (recomputed because dependency changed)
```

---

## Exercise 3.3: Deferred Computations

**Objective:** Implement and use deferred/debounced/throttled computations.

### Part A: Debounced Signal

```typescript
// Implement a debounced signal that only updates after a delay
function createDebouncedSignal<T>(
  initialValue: T,
  delay: number = 300
): Signal<T> {
  const [input, setInput] = createSignal(initialValue);
  const [output, setOutput] = createSignal(initialValue);
  
  // TODO: Implement debouncing
  // When input changes, wait {delay}ms before updating output
  // If input changes again during the delay, reset the timer
  
  createEffect(() => {
    const value = input();
    // TODO: Implement debounce logic
  });
  
  return [output, setInput];
}

// Test
const [search, setSearch] = createDebouncedSignal("", 500);

let searchCount = 0;
createEffect(() => {
  search(); // Track
  searchCount++;
  console.log("Searching for:", search());
});

console.log("Initial search count:", searchCount); // 1

// Rapid updates
setSearch("h");
setSearch("he");
setSearch("hel");
setSearch("hell");
setSearch("hello");

// Wait for debounce
await new Promise(resolve => setTimeout(resolve, 600));

console.log("After rapid updates:", searchCount);
// Expected: 2 (initial + one debounced update)
console.log("Final search value:", search());
// Expected: "hello"
```

### Part B: Throttled Signal

```typescript
// Implement a throttled signal that updates at most once per interval
function createThrottledSignal<T>(
  initialValue: T,
  interval: number = 100
): Signal<T> {
  const [input, setInput] = createSignal(initialValue);
  const [output, setOutput] = createSignal(initialValue);
  
  let lastUpdate = 0;
  let pending: T | undefined;
  
  // TODO: Implement throttling
  // Allow updates immediately, but not more than once per {interval}ms
  // Queue the latest value if blocked
  
  createEffect(() => {
    const value = input();
    // TODO: Implement throttle logic
  });
  
  return [output, setInput];
}

// Test
const [position, setPosition] = createThrottledSignal({ x: 0, y: 0 }, 100);

let updateCount = 0;
createEffect(() => {
  position();
  updateCount++;
  console.log("Position update:", position());
});

// Simulate rapid mouse movements
setPosition({ x: 1, y: 1 });   // Immediate
setPosition({ x: 2, y: 2 });   // Blocked
setPosition({ x: 3, y: 3 });   // Blocked
setPosition({ x: 4, y: 4 });   // Blocked
setPosition({ x: 5, y: 5 });   // Blocked (but queued)

await new Promise(resolve => setTimeout(resolve, 110));
// After interval, queued value should update

console.log("Update count:", updateCount);
// Expected: 3 (initial + immediate + queued)
```

---

## Exercise 3.4: Advanced On() Patterns

**Objective:** Master the `on()` utility for explicit dependencies.

### Part A: Deferred On

```typescript
// Understand the difference between immediate and deferred on()

const [count, setCount] = createSignal(0);
const [multiplier, setMultiplier] = createSignal(2);

// Immediate on (default)
createEffect(
  on(count, (value, prev) => {
    console.log("Immediate:", value, "prev:", prev);
    // Runs immediately with initial value
  })
);

// Deferred on
createEffect(
  on(
    count,
    (value, prev) => {
      console.log("Deferred:", value, "prev:", prev);
      // Only runs on changes, not initial
    },
    { defer: true }
  )
);

console.log("=== Initial ===");
// Expected: Only "Immediate: 0 prev: undefined" logs

setCount(1);
console.log("=== After setCount(1) ===");
// Expected: Both log

setCount(2);
console.log("=== After setCount(2) ===");
// Expected: Both log with prev: 1
```

### Part B: Multiple Dependencies with On

```typescript
// Use on() with multiple dependencies

const [first, setFirst] = createSignal("John");
const [last, setLast] = createSignal("Doe");
const [age, setAge] = createSignal(30);

// TODO: Create an effect that:
// 1. Only tracks first and last name
// 2. Can read age without tracking it
// 3. Logs the full information

createEffect(
  on(
    [first, last], // Only track these
    ([firstName, lastName]) => {
      // TODO: Read age without tracking
      const currentAge = untrack(age);
      console.log(`${firstName} ${lastName}, age ${currentAge}`);
    }
  )
);

console.log("=== Initial ===");
setFirst("Jane"); // Should log
setLast("Smith"); // Should log
setAge(31); // Should NOT log
```

---

## Exercise 3.5: Resource-like Pattern

**Objective:** Implement a simplified resource pattern for async data.

```typescript
// Implement a basic resource
function createSimpleResource<T>(
  fetcher: () => Promise<T>
): [
  accessor: Accessor<T | undefined>,
  actions: { refetch: () => void; mutate: (value: T) => void }
] {
  const [data, setData] = createSignal<T | undefined>(undefined);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | undefined>(undefined);
  
  async function load() {
    // TODO: Implement loading logic
    // 1. Set loading to true
    // 2. Try to fetch data
    // 3. Set data or error
    // 4. Set loading to false
  }
  
  // Auto-fetch on creation
  load();
  
  return [
    data,
    {
      refetch: load,
      mutate: setData
    }
  ];
}

// Test
const [user, { refetch, mutate }] = createSimpleResource(async () => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  return { id: 1, name: "John Doe" };
});

createEffect(() => {
  console.log("User:", user());
});

// Wait for load
await new Promise(resolve => setTimeout(resolve, 1100));
console.log("After load:", user());

// Mutate locally
mutate({ id: 1, name: "Jane Doe" });
console.log("After mutate:", user());

// Refetch
refetch();
await new Promise(resolve => setTimeout(resolve, 1100));
console.log("After refetch:", user());
```

---

## Challenge Exercises

### Challenge 1: Build a Reactive Router

Implement a simple reactive router:

```typescript
interface Route {
  path: string;
  component: () => any;
}

function createRouter(routes: Route[]) {
  const [path, setPath] = createSignal(window.location.pathname);
  
  // TODO: Implement:
  // 1. Listen to popstate events
  // 2. Match current path to routes
  // 3. Return matched component
  // 4. Provide navigation function
  
  window.addEventListener("popstate", () => {
    setPath(window.location.pathname);
  });
  
  const currentRoute = createMemo(() => {
    // TODO: Match path to route
  });
  
  function navigate(to: string) {
    // TODO: Update history and signal
  }
  
  return { currentRoute, navigate };
}

// Usage
const { currentRoute, navigate } = createRouter([
  { path: "/", component: () => "Home" },
  { path: "/about", component: () => "About" },
  { path: "/contact", component: () => "Contact" }
]);

createEffect(() => {
  console.log("Current route:", currentRoute());
});
```

### Challenge 2: Build a Reactive Form

Implement a form with validation:

```typescript
interface FormConfig<T> {
  initial: T;
  validators: {
    [K in keyof T]?: (value: T[K]) => string | undefined;
  };
}

function createForm<T extends Record<string, any>>(config: FormConfig<T>) {
  // TODO: Implement:
  // 1. Signal for each field
  // 2. Validation on change
  // 3. Aggregate errors
  // 4. Submit handler
  // 5. Reset functionality
  
  const [values, setValues] = createSignal(config.initial);
  const [errors, setErrors] = createSignal<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = createSignal<Partial<Record<keyof T, boolean>>>({});
  
  const isValid = createMemo(() => {
    // TODO: Check if all fields are valid
  });
  
  return {
    values,
    errors,
    touched,
    isValid,
    setField: (field: keyof T, value: any) => {
      // TODO: Update field and validate
    },
    touchField: (field: keyof T) => {
      // TODO: Mark field as touched
    },
    submit: (handler: (values: T) => void) => {
      // TODO: Validate all and submit if valid
    },
    reset: () => {
      // TODO: Reset to initial state
    }
  };
}

// Usage
const form = createForm({
  initial: { email: "", password: "" },
  validators: {
    email: (v) => !v.includes("@") ? "Invalid email" : undefined,
    password: (v) => v.length < 6 ? "Too short" : undefined
  }
});
```

---

## Solutions

Solutions are available in `solutions/unit-03-solutions.md`. Try to solve them yourself first!

## Key Takeaways

1. **Computation states** matter for optimization
2. **Selectors** optimize list rendering
3. **Deferred computations** improve UX
4. **On()** gives fine control over dependencies
5. **Resources** handle async elegantly

Continue to Unit 4 to learn about scheduling and batching!
