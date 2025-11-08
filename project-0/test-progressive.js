/**
 * @fileoverview Progressive Integration Test Suite for Reactive Signal System
 *
 * This test suite progressively combines functionalities from simple to complex,
 * testing real-world scenarios and edge cases with TypeScript typing via JSDoc.
 *
 * Test Structure:
 * - Level 1: Basic primitives (signals, effects, memos)
 * - Level 2: Combinations (signals + effects, memos + effects)
 * - Level 3: Advanced patterns (conditional tracking, batching)
 * - Level 4: Complex scenarios (real-world applications)
 * - Level 5: Stress tests and edge cases
 */

import {
  createSignal,
  createEffect,
  createMemo,
  batch,
  createRoot,
  dispose,
  onCleanup,
  getOwner,
  runWithOwner,
} from "./siganl-0.js";

// ============================================================================
// TEST UTILITIES
// ============================================================================

/** @typedef {{ name: string; status: 'PASSED' | 'FAILED'; error?: string; duration: number }} TestResult */

/** @type {TestResult[]} */
const results = [];
let testCount = 0;
let passedTests = 0;
let failedTests = 0;
let currentLevel = "";

/**
 * @param {string} name
 * @param {() => void | Promise<void>} fn
 */
async function test(name, fn) {
  testCount++;
  const fullName = currentLevel ? `${currentLevel} → ${name}` : name;
  console.log(`\n🧪 Test ${testCount}: ${fullName}`);

  const startTime = performance.now();
  try {
    await fn();
    const duration = performance.now() - startTime;
    passedTests++;
    results.push({ name: fullName, status: "PASSED", duration });
    console.log(`✅ PASSED (${duration.toFixed(2)}ms)`);
  } catch (error) {
    const duration = performance.now() - startTime;
    failedTests++;
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({
      name: fullName,
      status: "FAILED",
      error: errorMessage,
      duration,
    });
    console.log(`❌ FAILED: ${errorMessage}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
  }
}

/**
 * @param {string} levelName
 */
function level(levelName) {
  currentLevel = levelName;
  console.log(`\n${"=".repeat(80)}`);
  console.log(`📊 ${levelName}`);
  console.log("=".repeat(80));
}

/**
 * @param {boolean} condition
 * @param {string} [message]
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

/**
 * @template T
 * @param {T} actual
 * @param {T} expected
 * @param {string} [message]
 */
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      message ||
        `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`
    );
  }
}

/**
 * @template T
 * @param {T[]} actual
 * @param {T[]} expected
 * @param {string} [message]
 */
function assertArrayEqual(actual, expected, message) {
  if (actual.length !== expected.length) {
    throw new Error(
      message ||
        `Array length mismatch: expected ${expected.length}, got ${actual.length}`
    );
  }
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new Error(
        message ||
          `Array element ${i} mismatch: expected ${expected[i]}, got ${actual[i]}`
      );
    }
  }
}

/** @param {number} [ms] */
function nextTick(ms = 0) {
  return new Promise((resolve) => {
    if (ms > 0) {
      setTimeout(resolve, ms);
    } else {
      queueMicrotask(resolve);
    }
  });
}

// ============================================================================
// LEVEL 1: BASIC PRIMITIVES
// ============================================================================

async function runLevel1Tests() {
  level("LEVEL 1: Basic Primitives");

  await test("Signal: Create and read primitive values", async () => {
    const [count] = createSignal(0);
    assertEqual(count(), 0);

    const [name] = createSignal("Alice");
    assertEqual(name(), "Alice");

    const [flag] = createSignal(true);
    assertEqual(flag(), true);
  });

  await test("Signal: Update with direct values", async () => {
    const [count, setCount] = createSignal(0);

    setCount(5);
    assertEqual(count(), 5);

    setCount(10);
    assertEqual(count(), 10);
  });

  await test("Signal: Update with function updater", async () => {
    const [count, setCount] = createSignal(0);

    setCount((c) => c + 1);
    assertEqual(count(), 1);

    setCount((c) => c * 2);
    assertEqual(count(), 2);

    setCount((c) => c + 3);
    assertEqual(count(), 5);
  });

  await test("Effect: Basic reactivity", async () => {
    const [count, setCount] = createSignal(0);
    let effectValue = -1;

    createEffect(() => {
      effectValue = count();
    });

    await nextTick();
    assertEqual(effectValue, 0);

    setCount(5);
    await nextTick();
    assertEqual(effectValue, 5);
  });

  await test("Memo: Basic caching", async () => {
    const [count, setCount] = createSignal(1);
    let computations = 0;

    const doubled = createMemo(() => {
      computations++;
      return count() * 2;
    });

    await nextTick();
    assertEqual(computations, 1);

    // Multiple reads should use cache
    assertEqual(doubled(), 2);
    assertEqual(doubled(), 2);
    assertEqual(doubled(), 2);
    assertEqual(computations, 1);

    setCount(5);
    await nextTick();
    assertEqual(doubled(), 10);
    assertEqual(computations, 2);
  });
}

// ============================================================================
// LEVEL 2: COMBINATIONS
// ============================================================================

async function runLevel2Tests() {
  level("LEVEL 2: Combining Primitives");

  await test("Signal + Effect: Multiple signal tracking", async () => {
    const [firstName, setFirstName] = createSignal("John");
    const [lastName, setLastName] = createSignal("Doe");
    let fullName = "";

    createEffect(() => {
      fullName = `${firstName()} ${lastName()}`;
    });

    await nextTick();
    assertEqual(fullName, "John Doe");

    setFirstName("Jane");
    await nextTick();
    assertEqual(fullName, "Jane Doe");

    setLastName("Smith");
    await nextTick();
    assertEqual(fullName, "Jane Smith");
  });

  await test("Signal + Memo + Effect: Derived state chain", async () => {
    const [count, setCount] = createSignal(1);
    let memoComputations = 0;
    let effectRuns = 0;

    const doubled = createMemo(() => {
      memoComputations++;
      return count() * 2;
    });

    const quadrupled = createMemo(() => {
      memoComputations++;
      return doubled() * 2;
    });

    createEffect(() => {
      effectRuns++;
      quadrupled(); // Read memo
    });

    await nextTick();
    assertEqual(memoComputations, 2); // doubled + quadrupled
    assertEqual(effectRuns, 1);

    setCount(2);
    await nextTick();
    assertEqual(memoComputations, 4); // 2 more computations
    assertEqual(effectRuns, 2);
    assertEqual(quadrupled(), 8);
  });

  await test("Multiple effects on same signal", async () => {
    const [count, setCount] = createSignal(0);
    const values = /** @type {number[]} */ ([]);

    createEffect(() => values.push(count() * 1));
    createEffect(() => values.push(count() * 2));
    createEffect(() => values.push(count() * 3));

    await nextTick();
    assertArrayEqual(values, [0, 0, 0]);

    values.length = 0;
    setCount(5);
    await nextTick();
    assertArrayEqual(values, [5, 10, 15]);
  });

  await test("Memo chain: Multiple derived computations", async () => {
    const [base, setBase] = createSignal(2);

    const squared = createMemo(() => base() ** 2);
    const cubed = createMemo(() => base() ** 3);
    const sumOfPowers = createMemo(() => base() + squared() + cubed());

    await nextTick();
    assertEqual(sumOfPowers(), 2 + 4 + 8); // 14

    setBase(3);
    await nextTick();
    assertEqual(sumOfPowers(), 3 + 9 + 27); // 39
  });
}

// ============================================================================
// LEVEL 3: ADVANCED PATTERNS
// ============================================================================

async function runLevel3Tests() {
  level("LEVEL 3: Advanced Patterns");

  await test("Conditional tracking: Dynamic dependencies", async () => {
    const [mode, setMode] = createSignal(
      /** @type {'light'|'dark'} */ ("light")
    );
    const [lightTheme, setLightTheme] = createSignal("#ffffff");
    const [darkTheme, setDarkTheme] = createSignal("#000000");
    let currentTheme = "";

    createEffect(() => {
      currentTheme = mode() === "light" ? lightTheme() : darkTheme();
    });

    await nextTick();
    assertEqual(currentTheme, "#ffffff");

    // Change dark theme - should NOT trigger effect
    setDarkTheme("#111111");
    await nextTick();
    assertEqual(currentTheme, "#ffffff");

    // Change light theme - should trigger effect
    setLightTheme("#f0f0f0");
    await nextTick();
    assertEqual(currentTheme, "#f0f0f0");

    // Switch mode
    setMode("dark");
    await nextTick();
    assertEqual(currentTheme, "#111111");

    // Now light theme changes should NOT trigger
    setLightTheme("#ffffff");
    await nextTick();
    assertEqual(currentTheme, "#111111");

    // But dark theme changes should
    setDarkTheme("#222222");
    await nextTick();
    assertEqual(currentTheme, "#222222");
  });

  await test("Batch: Prevent redundant updates", async () => {
    const [x, setX] = createSignal(0);
    const [y, setY] = createSignal(0);
    let computations = 0;

    const sum = createMemo(() => {
      computations++;
      return x() + y();
    });

    await nextTick();
    assertEqual(computations, 1);

    // Without batch: 2 updates
    setX(1);
    setY(2);
    await nextTick();
    assertEqual(computations, 3); // Initial + 2 updates

    // With batch: 1 update
    batch(() => {
      setX(10);
      setY(20);
    });
    await nextTick();
    assertEqual(computations, 4); // Only 1 more
    assertEqual(sum(), 30);
  });

  await test("Nested batching: Deep update grouping", async () => {
    const [a, setA] = createSignal(0);
    const [b, setB] = createSignal(0);
    const [c, setC] = createSignal(0);
    let effectRuns = 0;

    createEffect(() => {
      a();
      b();
      c();
      effectRuns++;
    });

    await nextTick();
    assertEqual(effectRuns, 1);

    batch(() => {
      setA(1);
      batch(() => {
        setB(2);
        batch(() => {
          setC(3);
        });
      });
    });

    await nextTick();
    assertEqual(effectRuns, 2); // Only one more run
    assertEqual(a(), 1);
    assertEqual(b(), 2);
    assertEqual(c(), 3);
  });

  await test("Cleanup: Resource disposal", async () => {
    const [active, setActive] = createSignal(true);
    let timerCleanups = 0;
    let listenerCleanups = 0;

    createEffect(() => {
      if (active()) {
        const timerId = setTimeout(() => {}, 1000);
        onCleanup(() => {
          clearTimeout(timerId);
          timerCleanups++;
        });

        const listener = () => {};
        onCleanup(() => {
          listenerCleanups++;
        });
      }
    });

    await nextTick();
    assertEqual(timerCleanups, 0);
    assertEqual(listenerCleanups, 0);

    // Re-run effect triggers cleanup
    setActive(false);
    await nextTick();
    assertEqual(timerCleanups, 1);
    assertEqual(listenerCleanups, 1);

    setActive(true);
    await nextTick();
    assertEqual(timerCleanups, 1);
    assertEqual(listenerCleanups, 1);

    setActive(false);
    await nextTick();
    assertEqual(timerCleanups, 2);
    assertEqual(listenerCleanups, 2);
  });

  await test("Ownership: Hierarchical cleanup", async () => {
    let parentCleanups = 0;
    let childCleanups = 0;

    const rootDispose = createRoot((dispose) => {
      onCleanup(() => {
        parentCleanups++;
      });

      createEffect(() => {
        onCleanup(() => {
          childCleanups++;
        });
      });

      return dispose;
    });

    await nextTick();

    rootDispose();
    assertEqual(parentCleanups, 1);
    assertEqual(childCleanups, 1);
  });
}

// ============================================================================
// LEVEL 4: REAL-WORLD SCENARIOS
// ============================================================================

async function runLevel4Tests() {
  level("LEVEL 4: Real-World Scenarios");

  await test("Todo List: Complete CRUD operations", async () => {
    /** @typedef {{ id: number; text: string; completed: boolean }} Todo */

    const [todos, setTodos] = createSignal(/** @type {Todo[]} */ ([]));
    const [filter, setFilter] = createSignal(
      /** @type {'all'|'active'|'completed'} */ ("all")
    );

    // Derived state: filtered todos
    const filteredTodos = createMemo(() => {
      const list = todos();
      const f = filter();

      if (f === "active") return list.filter((t) => !t.completed);
      if (f === "completed") return list.filter((t) => t.completed);
      return list;
    });

    // Derived state: counts
    const activeCount = createMemo(
      () => todos().filter((t) => !t.completed).length
    );
    const completedCount = createMemo(
      () => todos().filter((t) => t.completed).length
    );

    await nextTick();

    // Add todos
    setTodos([
      { id: 1, text: "Learn Signals", completed: false },
      { id: 2, text: "Build App", completed: false },
    ]);

    await nextTick();
    assertEqual(filteredTodos().length, 2);
    assertEqual(activeCount(), 2);
    assertEqual(completedCount(), 0);

    // Complete a todo
    setTodos((prev) =>
      prev.map((t) => (t.id === 1 ? { ...t, completed: true } : t))
    );

    await nextTick();
    assertEqual(activeCount(), 1);
    assertEqual(completedCount(), 1);

    // Filter to active
    setFilter("active");
    await nextTick();
    assertEqual(filteredTodos().length, 1);
    assertEqual(filteredTodos()[0].id, 2);

    // Filter to completed
    setFilter("completed");
    await nextTick();
    assertEqual(filteredTodos().length, 1);
    assertEqual(filteredTodos()[0].id, 1);

    // Add another todo
    setTodos((prev) => [
      ...prev,
      { id: 3, text: "Test Everything", completed: false },
    ]);
    await nextTick();
    assertEqual(filteredTodos().length, 1); // Still filtered to completed

    setFilter("all");
    await nextTick();
    assertEqual(filteredTodos().length, 3);
  });

  await test("Form Validation: Complex reactive validation", async () => {
    const [email, setEmail] = createSignal("");
    const [password, setPassword] = createSignal("");
    const [confirmPassword, setConfirmPassword] = createSignal("");

    // Validation rules
    const emailValid = createMemo(() => {
      const value = email();
      return value.length > 0 && value.includes("@");
    });

    const passwordValid = createMemo(() => {
      const value = password();
      return value.length >= 8;
    });

    const passwordsMatch = createMemo(() => {
      return password() === confirmPassword() && password().length > 0;
    });

    const formValid = createMemo(() => {
      return emailValid() && passwordValid() && passwordsMatch();
    });

    await nextTick();
    assertEqual(formValid(), false);

    setEmail("test@example.com");
    await nextTick();
    assertEqual(emailValid(), true);
    assertEqual(formValid(), false);

    setPassword("short");
    await nextTick();
    assertEqual(passwordValid(), false);

    setPassword("longpassword123");
    await nextTick();
    assertEqual(passwordValid(), true);
    assertEqual(formValid(), false);

    setConfirmPassword("wrongpassword");
    await nextTick();
    assertEqual(passwordsMatch(), false);

    setConfirmPassword("longpassword123");
    await nextTick();
    assertEqual(passwordsMatch(), true);
    assertEqual(formValid(), true);
  });

  await test("Shopping Cart: Reactive pricing with discounts", async () => {
    /** @typedef {{ id: number; name: string; price: number; quantity: number }} CartItem */

    const [items, setItems] = createSignal(/** @type {CartItem[]} */ ([]));
    const [discountCode, setDiscountCode] = createSignal("");

    const subtotal = createMemo(() => {
      return items().reduce((sum, item) => sum + item.price * item.quantity, 0);
    });

    const discount = createMemo(() => {
      const code = discountCode();
      const sub = subtotal();

      if (code === "SAVE10") return sub * 0.1;
      if (code === "SAVE20") return sub * 0.2;
      return 0;
    });

    const total = createMemo(() => {
      return subtotal() - discount();
    });

    await nextTick();
    assertEqual(total(), 0);

    // Add items
    setItems([
      { id: 1, name: "Widget", price: 10, quantity: 2 },
      { id: 2, name: "Gadget", price: 15, quantity: 1 },
    ]);

    await nextTick();
    assertEqual(subtotal(), 35);
    assertEqual(discount(), 0);
    assertEqual(total(), 35);

    // Apply discount
    setDiscountCode("SAVE10");
    await nextTick();
    assertEqual(discount(), 3.5);
    assertEqual(total(), 31.5);

    // Change quantity
    setItems((prev) =>
      prev.map((item) => (item.id === 1 ? { ...item, quantity: 5 } : item))
    );

    await nextTick();
    assertEqual(subtotal(), 65);
    assertEqual(discount(), 6.5);
    assertEqual(total(), 58.5);

    // Better discount
    setDiscountCode("SAVE20");
    await nextTick();
    assertEqual(discount(), 13);
    assertEqual(total(), 52);
  });

  await test("Data Fetching: Async state management", async () => {
    /** @typedef {{ status: 'idle'|'loading'|'success'|'error'; data: any; error: string|null }} AsyncState */

    const [userId, setUserId] = createSignal(1);
    const [state, setState] = createSignal(
      /** @type {AsyncState} */ ({
        status: "idle",
        data: null,
        error: null,
      })
    );

    // Simulate API call
    const fetchUser = async (id) => {
      setState({ status: "loading", data: null, error: null });

      await nextTick(50); // Simulate network delay

      if (id === 999) {
        setState({ status: "error", data: null, error: "User not found" });
      } else {
        setState({
          status: "success",
          data: { id, name: `User ${id}` },
          error: null,
        });
      }
    };

    // Effect to fetch when userId changes
    createEffect(() => {
      const id = userId();
      fetchUser(id);
    });

    await nextTick();
    assertEqual(state().status, "loading");

    await nextTick(100);
    assertEqual(state().status, "success");
    assertEqual(state().data.id, 1);

    // Change user
    setUserId(2);
    await nextTick();
    assertEqual(state().status, "loading");

    await nextTick(100);
    assertEqual(state().status, "success");
    assertEqual(state().data.id, 2);

    // Trigger error
    setUserId(999);
    await nextTick(100);
    assertEqual(state().status, "error");
    assertEqual(state().error, "User not found");
  });

  await test("Real-time Search: Debounced reactive search", async () => {
    const [searchTerm, setSearchTerm] = createSignal("");
    const [debouncedTerm, setDebouncedTerm] = createSignal("");
    const [results, setResults] = createSignal(/** @type {string[]} */ ([]));

    const mockDatabase = [
      "Apple",
      "Banana",
      "Cherry",
      "Date",
      "Elderberry",
      "Fig",
      "Grape",
      "Honeydew",
      "Kiwi",
      "Lemon",
    ];

    // Debounce logic
    createEffect(() => {
      const term = searchTerm();
      const timer = setTimeout(() => {
        setDebouncedTerm(term);
      }, 100);

      onCleanup(() => clearTimeout(timer));
    });

    // Search effect
    createEffect(() => {
      const term = debouncedTerm().toLowerCase();
      if (term.length === 0) {
        setResults([]);
      } else {
        setResults(
          mockDatabase.filter((item) => item.toLowerCase().includes(term))
        );
      }
    });

    await nextTick();
    assertEqual(results().length, 0);

    // Type quickly (should debounce)
    setSearchTerm("a");
    await nextTick(50);
    assertEqual(results().length, 0); // Not debounced yet

    await nextTick(100);
    assertEqual(results().length, 5); // Apple, Banana, Date, Grape, Honeydew

    // Type more
    setSearchTerm("ap");
    await nextTick(150);
    assertArrayEqual(results(), ["Apple", "Grape"]);

    // Clear search
    setSearchTerm("");
    await nextTick(150);
    assertEqual(results().length, 0);
  });
}

// ============================================================================
// LEVEL 5: STRESS TESTS AND EDGE CASES
// ============================================================================

async function runLevel5Tests() {
  level("LEVEL 5: Stress Tests & Edge Cases");

  await test("Diamond Problem: Complex dependency graph", async () => {
    const [source, setSource] = createSignal(1);
    const log = /** @type {string[]} */ ([]);

    const a = createMemo(() => {
      log.push("a");
      return source() * 2;
    });

    const b = createMemo(() => {
      log.push("b");
      return source() * 3;
    });

    const c = createMemo(() => {
      log.push("c");
      return a() + b();
    });

    createEffect(() => {
      log.push("effect-start");
      c();
      log.push("effect-end");
    });

    await nextTick();
    log.length = 0; // Clear initial

    setSource(2);
    await nextTick();

    // Verify memos run before effect
    const aIndex = log.indexOf("a");
    const bIndex = log.indexOf("b");
    const cIndex = log.indexOf("c");
    const effectIndex = log.indexOf("effect-start");

    assert(aIndex < effectIndex, "Memo a should run before effect");
    assert(bIndex < effectIndex, "Memo b should run before effect");
    assert(cIndex < effectIndex, "Memo c should run before effect");
  });

  await test("Deep nesting: Many levels of effects", async () => {
    const [count, setCount] = createSignal(0);
    let level1 = 0,
      level2 = 0,
      level3 = 0,
      level4 = 0,
      level5 = 0;

    createEffect(() => {
      level1 = count();

      createEffect(() => {
        level2 = count() * 2;

        createEffect(() => {
          level3 = count() * 3;

          createEffect(() => {
            level4 = count() * 4;

            createEffect(() => {
              level5 = count() * 5;
            });
          });
        });
      });
    });

    await nextTick();
    assertEqual(level1, 0);
    assertEqual(level2, 0);
    assertEqual(level3, 0);
    assertEqual(level4, 0);
    assertEqual(level5, 0);

    setCount(10);
    await nextTick();
    assertEqual(level1, 10);
    assertEqual(level2, 20);
    assertEqual(level3, 30);
    assertEqual(level4, 40);
    assertEqual(level5, 50);
  });

  await test("Many signals: Scalability test", async () => {
    const signals = [];
    const setters = [];

    // Create 100 signals
    for (let i = 0; i < 100; i++) {
      const [signal, setSignal] = createSignal(i);
      signals.push(signal);
      setters.push(setSignal);
    }

    let sum = 0;
    createEffect(() => {
      sum = signals.reduce((acc, sig) => acc + sig(), 0);
    });

    await nextTick();
    assertEqual(sum, 4950); // Sum of 0-99

    // Update all signals
    batch(() => {
      setters.forEach((set, i) => set(i * 2));
    });

    await nextTick();
    assertEqual(sum, 9900); // Sum of 0-198 (even numbers)
  });

  await test("Rapid updates: Update storm handling", async () => {
    const [count, setCount] = createSignal(0);
    let effectRuns = 0;

    createEffect(() => {
      count();
      effectRuns++;
    });

    await nextTick();
    assertEqual(effectRuns, 1);

    // Fire 1000 updates in batch
    batch(() => {
      for (let i = 0; i < 1000; i++) {
        setCount(i);
      }
    });

    await nextTick();
    assertEqual(effectRuns, 2); // Only one more run!
    assertEqual(count(), 999);
  });

  await test("Memory leak prevention: Disposed effects cleanup", async () => {
    const [count, setCount] = createSignal(0);

    // Get initial observer count
    const initialObservers = count._state.observers.length;

    // Create and dispose 100 effects
    for (let i = 0; i < 100; i++) {
      const dispose = createEffect(() => count());
      await nextTick();
      dispose();
    }

    await nextTick();

    // Should be back to initial count
    assertEqual(count._state.observers.length, initialObservers);
  });

  await test("Conditional tracking: Switching dependencies rapidly", async () => {
    const [toggle, setToggle] = createSignal(true);
    const [a, setA] = createSignal(0);
    const [b, setB] = createSignal(0);
    let result = 0;

    createEffect(() => {
      result = toggle() ? a() : b();
    });

    await nextTick();

    // Switch back and forth 10 times
    for (let i = 0; i < 10; i++) {
      setToggle(!toggle());
      setA(a() + 1);
      setB(b() + 1);
      await nextTick();
    }

    // Verify cleanup worked (no memory leaks)
    const aObservers = a._state.observers.length;
    const bObservers = b._state.observers.length;

    // Only one should have observers at a time
    assert(
      (aObservers === 0 && bObservers > 0) ||
        (aObservers > 0 && bObservers === 0),
      "Only one signal should have observers"
    );
  });

  await test("Custom equality: Structural comparison", async () => {
    /** @typedef {{ x: number; y: number }} Point */

    const [point, setPoint] = createSignal(
      { x: 0, y: 0 },
      {
        equals: (a, b) => a.x === b.x && a.y === b.y,
      }
    );

    let effectRuns = 0;
    createEffect(() => {
      point();
      effectRuns++;
    });

    await nextTick();
    assertEqual(effectRuns, 1);

    // Same values, different object - should NOT trigger
    setPoint({ x: 0, y: 0 });
    await nextTick();
    assertEqual(effectRuns, 1);

    // Different values - should trigger
    setPoint({ x: 1, y: 1 });
    await nextTick();
    assertEqual(effectRuns, 2);

    // Same values again - should NOT trigger
    setPoint({ x: 1, y: 1 });
    await nextTick();
    assertEqual(effectRuns, 2);
  });

  await test("Circular dependency detection: Prevent infinite loops", async () => {
    const [a, setA] = createSignal(0);
    const [b, setB] = createSignal(0);

    let aReads = 0;
    let bReads = 0;
    const maxReads = 5;

    createEffect(() => {
      if (aReads++ < maxReads) {
        a();
        setB(b() + 1);
      }
    });

    createEffect(() => {
      if (bReads++ < maxReads) {
        b();
        setA(a() + 1);
      }
    });

    await nextTick();

    setA(1);
    await nextTick(100); // Give it time

    // Should eventually stabilize
    assert(aReads < 100, "Should not cause infinite loop");
    assert(bReads < 100, "Should not cause infinite loop");
  });

  await test("Runaway computation: Self-updating effect guard", async () => {
    const [count, setCount] = createSignal(0);
    let iterations = 0;
    const MAX_ITERATIONS = 10;

    createEffect(() => {
      const current = count();
      iterations++;

      // Guard against infinite loop
      if (iterations < MAX_ITERATIONS) {
        setCount(current + 1);
      }
    });

    await nextTick(100);

    // Should stop at max iterations
    assertEqual(iterations, MAX_ITERATIONS);
    assertEqual(count(), MAX_ITERATIONS - 1);
  });

  await test("Ownership isolation: Roots dont interfere", async () => {
    const [globalSignal, setGlobalSignal] = createSignal(0);

    let root1Value = -1;
    let root2Value = -1;

    const dispose1 = createRoot((dispose) => {
      createEffect(() => {
        root1Value = globalSignal() * 10;
      });
      return dispose;
    });

    const dispose2 = createRoot((dispose) => {
      createEffect(() => {
        root2Value = globalSignal() * 100;
      });
      return dispose;
    });

    await nextTick();
    assertEqual(root1Value, 0);
    assertEqual(root2Value, 0);

    setGlobalSignal(5);
    await nextTick();
    assertEqual(root1Value, 50);
    assertEqual(root2Value, 500);

    // Dispose first root
    dispose1();

    setGlobalSignal(10);
    await nextTick();
    assertEqual(root1Value, 50); // Unchanged
    assertEqual(root2Value, 1000); // Updated

    // Dispose second root
    dispose2();

    setGlobalSignal(15);
    await nextTick();
    assertEqual(root1Value, 50); // Still unchanged
    assertEqual(root2Value, 1000); // Still unchanged
  });
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================

async function runAllTests() {
  console.clear();
  console.log("═".repeat(80));
  console.log("🚀 PROGRESSIVE INTEGRATION TEST SUITE");
  console.log("   Reactive Signal System - Comprehensive Testing");
  console.log("═".repeat(80));
  console.log(`Started at: ${new Date().toLocaleString()}\n`);

  const startTime = performance.now();

  await runLevel1Tests();
  await runLevel2Tests();
  await runLevel3Tests();
  await runLevel4Tests();
  await runLevel5Tests();

  const endTime = performance.now();
  const duration = endTime - startTime;

  // ============================================================================
  // FINAL SUMMARY
  // ============================================================================

  console.log("\n" + "═".repeat(80));
  console.log("📊 FINAL TEST RESULTS");
  console.log("═".repeat(80));
  console.log(`Total Tests:    ${testCount}`);
  console.log(`✅ Passed:      ${passedTests}`);
  console.log(`❌ Failed:      ${failedTests}`);
  console.log(
    `Success Rate:   ${((passedTests / testCount) * 100).toFixed(1)}%`
  );
  console.log(`Total Duration: ${duration.toFixed(2)}ms`);
  console.log(`Avg Per Test:   ${(duration / testCount).toFixed(2)}ms`);
  console.log("═".repeat(80));

  if (failedTests > 0) {
    console.log("\n❌ FAILED TESTS:");
    results
      .filter((r) => r.status === "FAILED")
      .forEach((r) => {
        console.log(`\n  ${r.name}`);
        console.log(`  Error: ${r.error}`);
        console.log(`  Duration: ${r.duration.toFixed(2)}ms`);
      });
  }

  // Performance analysis
  console.log("\n📈 PERFORMANCE BREAKDOWN:");
  const sorted = [...results].sort((a, b) => b.duration - a.duration);
  console.log("\nTop 5 Slowest Tests:");
  sorted.slice(0, 5).forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.name} - ${r.duration.toFixed(2)}ms`);
  });

  console.log("\nTop 5 Fastest Tests:");
  sorted
    .slice(-5)
    .reverse()
    .forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.name} - ${r.duration.toFixed(2)}ms`);
    });

  console.log("\n" + "═".repeat(80));

  if (failedTests === 0) {
    console.log("🎉 ALL TESTS PASSED! System is production-ready.");
  } else {
    console.log("⚠️  Some tests failed. Please review and fix.");
    process.exit(1);
  }

  console.log("═".repeat(80));
}

// Run the test suite
runAllTests().catch((error) => {
  console.error("\n💥 Test suite crashed:", error);
  console.error(error.stack);
  process.exit(1);
});
