/**
 * @fileoverview Comprehensive Progressive Integration Test Suite
 *
 * This test suite progressively combines ALL functionalities from simple to complex,
 * testing real-world scenarios and edge cases with full TypeScript typing via JSDoc.
 *
 * Test Philosophy:
 * - Start with atomic primitives
 * - Progressively combine features
 * - Build to complex real-world scenarios
 * - Test edge cases and stress conditions
 * - Verify memory safety and cleanup
 *
 * @author Reactive Signals Test Suite
 * @version 2.0.0
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
// TYPES & UTILITIES
// ============================================================================

/**
 * @typedef {{
 *   name: string;
 *   status: 'PASSED' | 'FAILED';
 *   error?: string;
 *   duration: number;
 *   level: string;
 * }} TestResult
 */

/** @type {TestResult[]} */
const results = [];
let testCount = 0;
let passedTests = 0;
let failedTests = 0;
let currentLevel = "";

/**
 * Executes a test with timing and error handling
 * @param {string} name - Test name
 * @param {() => void | Promise<void>} fn - Test function
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
    results.push({
      name: fullName,
      status: "PASSED",
      duration,
      level: currentLevel,
    });
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
      level: currentLevel,
    });
    console.log(`❌ FAILED: ${errorMessage}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
  }
}

/**
 * Sets the current test level
 * @param {string} levelName - Level name
 */
function level(levelName) {
  currentLevel = levelName;
  console.log(`\n${"=".repeat(80)}`);
  console.log(`📊 ${levelName}`);
  console.log("=".repeat(80));
}

/**
 * Asserts a condition is true
 * @param {boolean} condition - Condition to check
 * @param {string} [message] - Error message
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

/**
 * Asserts two values are strictly equal
 * @template T
 * @param {T} actual - Actual value
 * @param {T} expected - Expected value
 * @param {string} [message] - Error message
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
 * Asserts arrays are deeply equal
 * @template T
 * @param {T[]} actual - Actual array
 * @param {T[]} expected - Expected array
 * @param {string} [message] - Error message
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
        message || `Array[${i}]: expected ${expected[i]}, got ${actual[i]}`
      );
    }
  }
}

/**
 * Asserts two numbers are approximately equal (for floating point comparisons)
 * @param {number} actual - Actual value
 * @param {number} expected - Expected value
 * @param {number} [epsilon=0.0001] - Maximum difference allowed
 * @param {string} [message] - Error message
 */
function assertAlmostEqual(actual, expected, epsilon = 0.0001, message) {
  const diff = Math.abs(actual - expected);
  if (diff > epsilon) {
    throw new Error(
      message ||
        `Expected ~${expected} but got ${actual} (diff: ${diff}, epsilon: ${epsilon})`
    );
  }
}

/**
 * Waits for next microtask or setTimeout
 * @param {number} [ms=0] - Milliseconds to wait
 * @returns {Promise<void>}
 */
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
// LEVEL 1: ATOMIC PRIMITIVES
// ============================================================================

async function level1_AtomicPrimitives() {
  level("LEVEL 1: Atomic Primitives");

  await test("Signal: Create and read different types", async () => {
    const [num] = createSignal(42);
    const [str] = createSignal("hello");
    const [bool] = createSignal(true);
    const [obj] = createSignal({ x: 1, y: 2 });
    const [arr] = createSignal([1, 2, 3]);

    assertEqual(num(), 42);
    assertEqual(str(), "hello");
    assertEqual(bool(), true);
    assertEqual(obj().x, 1);
    assertEqual(arr()[0], 1);
  });

  await test("Signal: Update with direct values", async () => {
    const [count, setCount] = createSignal(0);

    setCount(5);
    assertEqual(count(), 5);

    setCount(10);
    assertEqual(count(), 10);

    setCount(-5);
    assertEqual(count(), -5);
  });

  await test("Signal: Update with function updater", async () => {
    const [count, setCount] = createSignal(0);

    setCount((c) => c + 1);
    assertEqual(count(), 1);

    setCount((c) => c * 2);
    assertEqual(count(), 2);

    setCount((c) => c - 5);
    assertEqual(count(), -3);
  });

  await test("Signal: Custom equality comparator", async () => {
    /** @typedef {{ x: number; y: number }} Point */

    const [point, setPoint] = createSignal(
      /** @type {Point} */ ({ x: 0, y: 0 }),
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
    assertEqual(effectRuns, 1, "Should not trigger with equal values");

    // Different values - should trigger
    setPoint({ x: 1, y: 1 });
    await nextTick();
    assertEqual(effectRuns, 2, "Should trigger with different values");
  });

  await test("Effect: Basic reactive tracking", async () => {
    const [count, setCount] = createSignal(0);
    let effectValue = -1;

    createEffect(() => {
      effectValue = count();
    });

    await nextTick();
    assertEqual(effectValue, 0, "Effect should run initially");

    setCount(5);
    await nextTick();
    assertEqual(effectValue, 5, "Effect should update on signal change");

    setCount(10);
    await nextTick();
    assertEqual(effectValue, 10, "Effect should update again");
  });

  await test("Effect: Manual disposal", async () => {
    const [count, setCount] = createSignal(0);
    let effectRuns = 0;

    const dispose = createEffect(() => {
      count();
      effectRuns++;
    });

    await nextTick();
    assertEqual(effectRuns, 1);

    setCount(1);
    await nextTick();
    assertEqual(effectRuns, 2);

    dispose();

    setCount(2);
    await nextTick();
    assertEqual(effectRuns, 2, "Effect should not run after disposal");
  });

  await test("Memo: Basic caching and lazy evaluation", async () => {
    const [count, setCount] = createSignal(1);
    let computations = 0;

    const doubled = createMemo(() => {
      computations++;
      return count() * 2;
    });

    await nextTick();
    assertEqual(computations, 1, "Initial computation");

    // Multiple reads should use cache
    assertEqual(doubled(), 2);
    assertEqual(doubled(), 2);
    assertEqual(doubled(), 2);
    assertEqual(computations, 1, "Should use cached value");

    // Signal change triggers recomputation
    setCount(5);
    await nextTick();

    assertEqual(doubled(), 10);
    assertEqual(computations, 2, "Should recompute after signal change");
  });

  await test("Batch: Deduplicate multiple updates", async () => {
    const [count, setCount] = createSignal(0);
    let effectRuns = 0;

    createEffect(() => {
      count();
      effectRuns++;
    });

    await nextTick();
    assertEqual(effectRuns, 1);

    // Multiple updates: System auto-batches via microtask queue!
    // Both setCount() calls queue ONE microtask (deduplication via Pending flag)
    setCount(1);
    setCount(2);
    await nextTick();
    assertEqual(effectRuns, 2, "Auto-batched into single update");

    // Explicit batch also works
    batch(() => {
      setCount(10);
      setCount(20);
      setCount(30);
    });

    await nextTick();
    assertEqual(effectRuns, 3, "Only one update for batched changes");
    assertEqual(count(), 30, "Final value is correct");
  });
}

// ============================================================================
// LEVEL 2: COMBINING TWO PRIMITIVES
// ============================================================================

async function level2_CombiningTwo() {
  level("LEVEL 2: Combining Two Primitives");

  await test("Signal + Signal: Multiple independent signals", async () => {
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(2);
    const [c, setC] = createSignal(3);

    assertEqual(a(), 1);
    assertEqual(b(), 2);
    assertEqual(c(), 3);

    setA(10);
    setB(20);
    setC(30);

    assertEqual(a(), 10);
    assertEqual(b(), 20);
    assertEqual(c(), 30);
  });

  await test("Signal + Effect: Track multiple signals", async () => {
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

    batch(() => {
      setFirstName("Bob");
      setLastName("Johnson");
    });
    await nextTick();
    assertEqual(fullName, "Bob Johnson");
  });

  await test("Signal + Memo: Derived state", async () => {
    const [count, setCount] = createSignal(1);
    const doubled = createMemo(() => count() * 2);
    const tripled = createMemo(() => count() * 3);

    await nextTick();

    assertEqual(doubled(), 2);
    assertEqual(tripled(), 3);

    setCount(5);
    await nextTick();

    assertEqual(doubled(), 10);
    assertEqual(tripled(), 15);
  });

  await test("Memo + Effect: Effect depends on memo", async () => {
    const [count, setCount] = createSignal(1);
    let memoComputations = 0;
    let effectRuns = 0;

    const doubled = createMemo(() => {
      memoComputations++;
      return count() * 2;
    });

    createEffect(() => {
      doubled();
      effectRuns++;
    });

    await nextTick();
    assertEqual(memoComputations, 1);
    assertEqual(effectRuns, 1);

    setCount(2);
    await nextTick();
    assertEqual(memoComputations, 2);
    assertEqual(effectRuns, 2);
    assertEqual(doubled(), 4);
  });

  await test("Effect + Effect: Multiple effects on same signal", async () => {
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

  await test("Batch + Signal: Multiple signals in batch", async () => {
    const [x, setX] = createSignal(0);
    const [y, setY] = createSignal(0);
    let effectRuns = 0;

    createEffect(() => {
      x();
      y();
      effectRuns++;
    });

    await nextTick();
    assertEqual(effectRuns, 1);

    batch(() => {
      setX(1);
      setY(2);
    });

    await nextTick();
    assertEqual(effectRuns, 2, "Single batch update");
    assertEqual(x(), 1);
    assertEqual(y(), 2);
  });
}

// ============================================================================
// LEVEL 3: COMBINING THREE+ PRIMITIVES
// ============================================================================

async function level3_CombiningMultiple() {
  level("LEVEL 3: Combining Multiple Primitives");

  await test("Signal + Memo + Effect: Complete reactive chain", async () => {
    const [count, setCount] = createSignal(1);

    const doubled = createMemo(() => count() * 2);
    const quadrupled = createMemo(() => doubled() * 2);

    let effectValue = 0;
    createEffect(() => {
      effectValue = quadrupled();
    });

    await nextTick();
    assertEqual(effectValue, 4);

    setCount(3);
    await nextTick();
    assertEqual(effectValue, 12);
  });

  await test("Multiple memos with shared dependencies", async () => {
    const [base, setBase] = createSignal(2);

    const squared = createMemo(() => base() ** 2);
    const cubed = createMemo(() => base() ** 3);
    const sum = createMemo(() => base() + squared() + cubed());

    await nextTick();
    assertEqual(sum(), 2 + 4 + 8); // 14

    setBase(3);
    await nextTick();
    assertEqual(sum(), 3 + 9 + 27); // 39
  });

  await test("Diamond problem: Memo execution order", async () => {
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
    log.length = 0; // Clear initial run

    setSource(2);
    await nextTick();

    // Verify execution order: memos before effects
    const effectStartIndex = log.indexOf("effect-start");
    const aIndex = log.lastIndexOf("a");
    const bIndex = log.lastIndexOf("b");
    const cIndex = log.lastIndexOf("c");

    assert(aIndex < effectStartIndex, "Memo a should run before effect");
    assert(bIndex < effectStartIndex, "Memo b should run before effect");
    assert(cIndex < effectStartIndex, "Memo c should run before effect");
  });

  await test("Conditional tracking: Dynamic dependencies", async () => {
    const [mode, setMode] = createSignal(
      /** @type {'light'|'dark'} */ ("light")
    );
    const [lightColor, setLightColor] = createSignal("#ffffff");
    const [darkColor, setDarkColor] = createSignal("#000000");
    let currentColor = "";

    createEffect(() => {
      currentColor = mode() === "light" ? lightColor() : darkColor();
    });

    await nextTick();
    assertEqual(currentColor, "#ffffff");

    // Change dark color - should NOT trigger (not tracked)
    setDarkColor("#111111");
    await nextTick();
    assertEqual(currentColor, "#ffffff", "Should not change");

    // Change light color - should trigger
    setLightColor("#f0f0f0");
    await nextTick();
    assertEqual(currentColor, "#f0f0f0", "Should update");

    // Switch mode
    setMode("dark");
    await nextTick();
    assertEqual(currentColor, "#111111");

    // Now light changes should NOT trigger
    setLightColor("#ffffff");
    await nextTick();
    assertEqual(currentColor, "#111111", "Should not change");

    // But dark changes should
    setDarkColor("#222222");
    await nextTick();
    assertEqual(currentColor, "#222222", "Should update");
  });

  await test("Nested batching: Deep batch hierarchy", async () => {
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
    assertEqual(effectRuns, 2, "Only one update for all nested batches");
    assertEqual(a(), 1);
    assertEqual(b(), 2);
    assertEqual(c(), 3);
  });
}

// ============================================================================
// LEVEL 4: CLEANUP & OWNERSHIP
// ============================================================================

async function level4_CleanupOwnership() {
  level("LEVEL 4: Cleanup & Ownership");

  await test("onCleanup: Runs before re-execution", async () => {
    const [count, setCount] = createSignal(0);
    let cleanupRuns = 0;
    let effectRuns = 0;

    createEffect(() => {
      count();
      effectRuns++;

      onCleanup(() => {
        cleanupRuns++;
      });
    });

    await nextTick();
    assertEqual(cleanupRuns, 0, "No cleanup initially");
    assertEqual(effectRuns, 1);

    setCount(1);
    await nextTick();
    assertEqual(cleanupRuns, 1, "Cleanup before re-execution");
    assertEqual(effectRuns, 2);

    setCount(2);
    await nextTick();
    assertEqual(cleanupRuns, 2, "Cleanup before each re-execution");
    assertEqual(effectRuns, 3);
  });

  await test("onCleanup: Runs on disposal", async () => {
    const [count, setCount] = createSignal(0);
    let cleanupRuns = 0;

    const dispose = createEffect(() => {
      count();
      onCleanup(() => {
        cleanupRuns++;
      });
    });

    await nextTick();
    assertEqual(cleanupRuns, 0);

    setCount(1);
    await nextTick();
    assertEqual(cleanupRuns, 1, "Cleanup on re-execution");

    dispose();
    assertEqual(cleanupRuns, 2, "Cleanup on disposal");
  });

  await test("onCleanup: Multiple cleanups in LIFO order", async () => {
    const [trigger, setTrigger] = createSignal(0);
    const log = /** @type {string[]} */ ([]);

    createEffect(() => {
      trigger();

      onCleanup(() => log.push("cleanup-1"));
      onCleanup(() => log.push("cleanup-2"));
      onCleanup(() => log.push("cleanup-3"));
    });

    await nextTick();
    log.length = 0;

    setTrigger(1);
    await nextTick();

    // LIFO order: last registered runs first
    assertArrayEqual(log, ["cleanup-3", "cleanup-2", "cleanup-1"]);
  });

  await test("onCleanup: Timer cleanup simulation", async () => {
    const [active, setActive] = createSignal(true);
    let timerCleanups = 0;

    createEffect(() => {
      if (active()) {
        const timerId = setTimeout(() => {}, 1000);

        onCleanup(() => {
          clearTimeout(timerId);
          timerCleanups++;
        });
      }
    });

    await nextTick();
    assertEqual(timerCleanups, 0);

    setActive(false);
    await nextTick();
    assertEqual(timerCleanups, 1, "Timer cleaned up");

    setActive(true);
    await nextTick();
    assertEqual(timerCleanups, 1);

    setActive(false);
    await nextTick();
    assertEqual(timerCleanups, 2, "Timer cleaned up again");
  });

  await test("createRoot: Isolated scope", async () => {
    const [count, setCount] = createSignal(0);
    let innerRuns = 0;

    const root = createRoot((dispose) => {
      createEffect(() => {
        count();
        innerRuns++;
      });

      return { dispose };
    });

    await nextTick();
    assertEqual(innerRuns, 1);

    setCount(1);
    await nextTick();
    assertEqual(innerRuns, 2);

    root.dispose();

    setCount(2);
    await nextTick();
    assertEqual(innerRuns, 2, "Effect stopped after root disposal");
  });

  await test("createRoot: Hierarchical cleanup", async () => {
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
    assertEqual(parentCleanups, 1, "Parent cleanup ran");
    assertEqual(childCleanups, 1, "Child cleanup ran");
  });

  await test("getOwner: Returns current reactive scope", async () => {
    const outerOwner = getOwner();
    let innerOwner = null;

    createEffect(() => {
      innerOwner = getOwner();
    });

    await nextTick();
    assert(innerOwner !== outerOwner, "Effect has different owner");
    assert(innerOwner !== null, "Inner owner exists");
  });

  await test("runWithOwner: Execute with specific owner", async () => {
    const [signal, setSignal] = createSignal(0);
    let capturedOwner = null;
    let effectRuns = 0;

    createEffect(() => {
      capturedOwner = getOwner();
    });

    await nextTick();

    if (capturedOwner) {
      runWithOwner(capturedOwner, () => {
        createEffect(() => {
          signal();
          effectRuns++;
        });
      });
    }

    await nextTick();
    assertEqual(effectRuns, 1);

    setSignal(1);
    await nextTick();
    assertEqual(effectRuns, 2);
  });
}

// ============================================================================
// LEVEL 5: REAL-WORLD SCENARIOS
// ============================================================================

async function level5_RealWorld() {
  level("LEVEL 5: Real-World Scenarios");

  await test("Todo List: Complete CRUD application", async () => {
    /** @typedef {{ id: number; text: string; completed: boolean }} Todo */

    const [todos, setTodos] = createSignal(/** @type {Todo[]} */ ([]));
    const [filter, setFilter] = createSignal(
      /** @type {'all'|'active'|'completed'} */ ("all")
    );

    // Derived states
    const filteredTodos = createMemo(() => {
      const list = todos();
      const f = filter();

      if (f === "active") return list.filter((t) => !t.completed);
      if (f === "completed") return list.filter((t) => t.completed);
      return list;
    });

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
      { id: 3, text: "Deploy", completed: false },
    ]);

    await nextTick();
    assertEqual(filteredTodos().length, 3);
    assertEqual(activeCount(), 3);
    assertEqual(completedCount(), 0);

    // Complete todos
    setTodos((prev) =>
      prev.map((t) => (t.id === 1 ? { ...t, completed: true } : t))
    );

    await nextTick();
    assertEqual(activeCount(), 2);
    assertEqual(completedCount(), 1);

    // Filter to active
    setFilter("active");
    await nextTick();
    assertEqual(filteredTodos().length, 2);

    // Filter to completed
    setFilter("completed");
    await nextTick();
    assertEqual(filteredTodos().length, 1);
    assertEqual(filteredTodos()[0].text, "Learn Signals");

    // Delete a todo
    setTodos((prev) => prev.filter((t) => t.id !== 2));
    await nextTick();

    setFilter("all");
    await nextTick();
    assertEqual(filteredTodos().length, 2);
    assertEqual(activeCount(), 1);
  });

  await test("Form Validation: Complex reactive validation", async () => {
    const [email, setEmail] = createSignal("");
    const [password, setPassword] = createSignal("");
    const [confirmPassword, setConfirmPassword] = createSignal("");
    const [touched, setTouched] = createSignal({
      email: false,
      password: false,
      confirmPassword: false,
    });

    const emailValid = createMemo(() => {
      const value = email();
      return value.length > 0 && value.includes("@") && value.includes(".");
    });

    const passwordValid = createMemo(() => {
      const value = password();
      return value.length >= 8 && /[A-Z]/.test(value) && /[0-9]/.test(value);
    });

    const passwordsMatch = createMemo(() => {
      return password() === confirmPassword() && password().length > 0;
    });

    const formValid = createMemo(() => {
      return emailValid() && passwordValid() && passwordsMatch();
    });

    const showErrors = createMemo(() => {
      const t = touched();
      return {
        email: t.email && !emailValid(),
        password: t.password && !passwordValid(),
        confirmPassword: t.confirmPassword && !passwordsMatch(),
      };
    });

    await nextTick();
    assertEqual(formValid(), false);

    // Fill email
    setEmail("test@example.com");
    setTouched((t) => ({ ...t, email: true }));
    await nextTick();
    assertEqual(emailValid(), true);
    assertEqual(showErrors().email, false);

    // Fill password (weak)
    setPassword("weak");
    setTouched((t) => ({ ...t, password: true }));
    await nextTick();
    assertEqual(passwordValid(), false);
    assertEqual(showErrors().password, true);

    // Strong password
    setPassword("StrongPass123");
    await nextTick();
    assertEqual(passwordValid(), true);
    assertEqual(showErrors().password, false);

    // Confirm password (mismatch)
    setConfirmPassword("Different123");
    setTouched((t) => ({ ...t, confirmPassword: true }));
    await nextTick();
    assertEqual(passwordsMatch(), false);
    assertEqual(showErrors().confirmPassword, true);

    // Correct confirm password
    setConfirmPassword("StrongPass123");
    await nextTick();
    assertEqual(passwordsMatch(), true);
    assertEqual(formValid(), true);
  });

  await test("Shopping Cart: Reactive pricing with discounts", async () => {
    /** @typedef {{ id: number; name: string; price: number; quantity: number }} CartItem */

    const [items, setItems] = createSignal(/** @type {CartItem[]} */ ([]));
    const [discountCode, setDiscountCode] = createSignal("");
    const [taxRate] = createSignal(0.08); // 8% tax

    const subtotal = createMemo(() => {
      return items().reduce((sum, item) => sum + item.price * item.quantity, 0);
    });

    const discount = createMemo(() => {
      const code = discountCode();
      const sub = subtotal();

      if (code === "SAVE10") return sub * 0.1;
      if (code === "SAVE20") return sub * 0.2;
      if (code === "SAVE50") return sub * 0.5;
      return 0;
    });

    const subtotalAfterDiscount = createMemo(() => {
      return subtotal() - discount();
    });

    const tax = createMemo(() => {
      return subtotalAfterDiscount() * taxRate();
    });

    const total = createMemo(() => {
      return subtotalAfterDiscount() + tax();
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
    assertAlmostEqual(total(), 35 * 1.08, 0.001); // 37.8 (float precision)

    // Apply discount
    setDiscountCode("SAVE20");
    await nextTick();
    assertEqual(discount(), 7);
    assertEqual(subtotalAfterDiscount(), 28);
    assertAlmostEqual(total(), 28 * 1.08, 0.001); // 30.24 (float precision)

    // Update quantity
    setItems((prev) =>
      prev.map((item) => (item.id === 1 ? { ...item, quantity: 5 } : item))
    );

    await nextTick();
    assertEqual(subtotal(), 65);
    assertEqual(discount(), 13);
    assertAlmostEqual(total(), 52 * 1.08, 0.001); // 56.16 (float precision)
  });

  await test("Debounced Search: Real-time filtering", async () => {
    const [searchTerm, setSearchTerm] = createSignal("");
    const [debouncedTerm, setDebouncedTerm] = createSignal("");
    const [results, setResults] = createSignal(/** @type {string[]} */ ([]));

    const database = [
      "Apple",
      "Apricot",
      "Banana",
      "Blueberry",
      "Cherry",
      "Date",
      "Elderberry",
      "Fig",
      "Grape",
      "Kiwi",
    ];

    // Debounce effect
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
          database.filter((item) => item.toLowerCase().includes(term))
        );
      }
    });

    await nextTick();
    assertEqual(results().length, 0);

    // Type quickly
    setSearchTerm("a");
    await nextTick(50);
    assertEqual(results().length, 0, "Not debounced yet");

    await nextTick(100);
    assertEqual(results().length, 5, "Apple, Apricot, Banana, Date, Grape");

    // Type more
    setSearchTerm("ap");
    await nextTick(150);
    assertEqual(results().length, 3, "Apple, Apricot, Grape");

    // Clear search
    setSearchTerm("");
    await nextTick(150);
    assertEqual(results().length, 0);
  });

  await test("Live Data Dashboard: Multiple reactive metrics", async () => {
    const [temperature, setTemperature] = createSignal(20);
    const [humidity, setHumidity] = createSignal(50);
    const [pressure, setPressure] = createSignal(1013);

    const temperatureF = createMemo(() => (temperature() * 9) / 5 + 32);

    const comfortIndex = createMemo(() => {
      const temp = temperature();
      const hum = humidity();

      if (temp >= 18 && temp <= 24 && hum >= 40 && hum <= 60) {
        return "comfortable";
      } else if (temp < 10 || temp > 30) {
        return "extreme";
      } else {
        return "moderate";
      }
    });

    const weatherWarning = createMemo(() => {
      const press = pressure();

      if (press < 1000) return "Storm warning";
      if (press > 1020) return "High pressure";
      return "Normal";
    });

    const alerts = createMemo(() => {
      const warnings = [];
      if (comfortIndex() === "extreme") {
        warnings.push("Extreme temperature");
      }
      if (weatherWarning() !== "Normal") {
        warnings.push(weatherWarning());
      }
      return warnings;
    });

    await nextTick();
    assertEqual(temperatureF(), 68);
    assertEqual(comfortIndex(), "comfortable");
    assertEqual(alerts().length, 0);

    // Extreme heat
    setTemperature(35);
    await nextTick();
    assertEqual(temperatureF(), 95);
    assertEqual(comfortIndex(), "extreme");
    assert(alerts().includes("Extreme temperature"));

    // Storm conditions
    setPressure(990);
    await nextTick();
    assertEqual(weatherWarning(), "Storm warning");
    assertEqual(alerts().length, 2);
  });
}

// ============================================================================
// LEVEL 6: STRESS TESTS & EDGE CASES
// ============================================================================

async function level6_StressTests() {
  level("LEVEL 6: Stress Tests & Edge Cases");

  await test("Deep nesting: 10 levels of effects", async () => {
    const [count, setCount] = createSignal(0);
    const levels = /** @type {number[]} */ ([]);

    createEffect(() => {
      levels[0] = count();

      createEffect(() => {
        levels[1] = count() * 2;

        createEffect(() => {
          levels[2] = count() * 3;

          createEffect(() => {
            levels[3] = count() * 4;

            createEffect(() => {
              levels[4] = count() * 5;

              createEffect(() => {
                levels[5] = count() * 6;

                createEffect(() => {
                  levels[6] = count() * 7;

                  createEffect(() => {
                    levels[7] = count() * 8;

                    createEffect(() => {
                      levels[8] = count() * 9;

                      createEffect(() => {
                        levels[9] = count() * 10;
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });

    await nextTick();
    assertArrayEqual(levels, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

    setCount(5);
    await nextTick();
    assertArrayEqual(levels, [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
  });

  await test("Many signals: 100 signals scalability", async () => {
    const signals = [];
    const setters = [];

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

    // Update all signals in batch
    batch(() => {
      setters.forEach((set, i) => set(i * 2));
    });

    await nextTick();
    assertEqual(sum, 9900); // Sum of 0-198 (evens)
  });

  await test("Rapid updates: 1000 batched updates", async () => {
    const [count, setCount] = createSignal(0);
    let effectRuns = 0;

    createEffect(() => {
      count();
      effectRuns++;
    });

    await nextTick();
    assertEqual(effectRuns, 1);

    batch(() => {
      for (let i = 0; i < 1000; i++) {
        setCount(i);
      }
    });

    await nextTick();
    assertEqual(effectRuns, 2, "Only one batched update");
    assertEqual(count(), 999);
  });

  await test("Memory leak prevention: Disposed effects cleanup", async () => {
    const [count] = createSignal(0);
    const initialObservers = count._state.observers.length;

    // Create and dispose 50 effects
    for (let i = 0; i < 50; i++) {
      const dispose = createEffect(() => count());
      await nextTick();
      dispose();
    }

    await nextTick();
    assertEqual(
      count._state.observers.length,
      initialObservers,
      "All observers cleaned up"
    );
  });

  await test("Conditional tracking: Rapid dependency switching", async () => {
    const [toggle, setToggle] = createSignal(true);
    const [a, setA] = createSignal(0);
    const [b, setB] = createSignal(0);
    let result = 0;

    createEffect(() => {
      result = toggle() ? a() : b();
    });

    await nextTick();

    // Switch 20 times
    for (let i = 0; i < 20; i++) {
      batch(() => {
        setToggle(!toggle());
        setA(a() + 1);
        setB(b() + 1);
      });
      await nextTick();
    }

    // Verify no memory leaks
    const aObservers = a._state.observers.length;
    const bObservers = b._state.observers.length;

    assert(
      (aObservers === 0 && bObservers > 0) ||
        (aObservers > 0 && bObservers === 0),
      "Only one signal should have observers"
    );
  });

  await test("Circular prevention: Self-updating effect with guard", async () => {
    const [count, setCount] = createSignal(0);
    let iterations = 0;
    const MAX = 10;

    createEffect(() => {
      const current = count();
      iterations++;

      if (iterations < MAX) {
        setCount(current + 1);
      }
    });

    await nextTick(100);

    assertEqual(iterations, MAX, "Should stop at max iterations");
    assertEqual(count(), MAX - 1);
  });

  await test("Ownership isolation: Multiple roots dont interfere", async () => {
    const [global, setGlobal] = createSignal(0);

    let root1Value = -1;
    let root2Value = -1;
    let root3Value = -1;

    const dispose1 = createRoot((dispose) => {
      createEffect(() => {
        root1Value = global() * 10;
      });
      return dispose;
    });

    const dispose2 = createRoot((dispose) => {
      createEffect(() => {
        root2Value = global() * 100;
      });
      return dispose;
    });

    const dispose3 = createRoot((dispose) => {
      createEffect(() => {
        root3Value = global() * 1000;
      });
      return dispose;
    });

    await nextTick();
    assertEqual(root1Value, 0);
    assertEqual(root2Value, 0);
    assertEqual(root3Value, 0);

    setGlobal(5);
    await nextTick();
    assertEqual(root1Value, 50);
    assertEqual(root2Value, 500);
    assertEqual(root3Value, 5000);

    // Dispose root 2
    dispose2();

    setGlobal(10);
    await nextTick();
    assertEqual(root1Value, 100);
    assertEqual(root2Value, 500, "Root 2 stopped");
    assertEqual(root3Value, 10000);

    // Dispose all
    dispose1();
    dispose3();

    setGlobal(15);
    await nextTick();
    assertEqual(root1Value, 100, "All roots stopped");
    assertEqual(root2Value, 500);
    assertEqual(root3Value, 10000);
  });

  await test("Complex cleanup: Nested effects with multiple cleanups", async () => {
    const [trigger, setTrigger] = createSignal(0);
    let outerCleanups = 0;
    let innerCleanups = 0;

    const dispose = createEffect(() => {
      trigger();

      onCleanup(() => {
        outerCleanups++;
      });

      createEffect(() => {
        onCleanup(() => {
          innerCleanups++;
        });
      });
    });

    await nextTick();

    setTrigger(1);
    await nextTick();
    assertEqual(outerCleanups, 1);
    assertEqual(innerCleanups, 1);

    setTrigger(2);
    await nextTick();
    assertEqual(outerCleanups, 2);
    assertEqual(innerCleanups, 2);

    dispose();
    assertEqual(outerCleanups, 3);
    assertEqual(innerCleanups, 3);
  });
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runAllTests() {
  console.clear();
  console.log("═".repeat(80));
  console.log("🚀 COMPREHENSIVE PROGRESSIVE INTEGRATION TEST SUITE v2.0");
  console.log("   Reactive Signals System - Complete Testing");
  console.log("═".repeat(80));
  console.log(`Started at: ${new Date().toLocaleString()}\n`);

  const startTime = performance.now();

  await level1_AtomicPrimitives();
  await level2_CombiningTwo();
  await level3_CombiningMultiple();
  await level4_CleanupOwnership();
  await level5_RealWorld();
  await level6_StressTests();

  const endTime = performance.now();
  const duration = endTime - startTime;

  // ============================================================================
  // FINAL REPORT
  // ============================================================================

  console.log("\n" + "═".repeat(80));
  console.log("📊 FINAL TEST RESULTS");
  console.log("═".repeat(80));
  console.log(`Total Tests:    ${testCount}`);
  console.log(
    `✅ Passed:      ${passedTests} (${(
      (passedTests / testCount) *
      100
    ).toFixed(1)}%)`
  );
  console.log(
    `❌ Failed:      ${failedTests} (${(
      (failedTests / testCount) *
      100
    ).toFixed(1)}%)`
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

  // Performance analysis by level
  console.log("\n📈 PERFORMANCE BY LEVEL:");
  const byLevel = {};
  results.forEach((r) => {
    if (!byLevel[r.level]) {
      byLevel[r.level] = { count: 0, total: 0, passed: 0 };
    }
    byLevel[r.level].count++;
    byLevel[r.level].total += r.duration;
    if (r.status === "PASSED") byLevel[r.level].passed++;
  });

  Object.entries(byLevel).forEach(([level, stats]) => {
    const avg = stats.total / stats.count;
    const passRate = ((stats.passed / stats.count) * 100).toFixed(1);
    console.log(
      `  ${level}: ${stats.count} tests, ${passRate}% pass, ${avg.toFixed(
        2
      )}ms avg`
    );
  });

  console.log("\n📊 TOP 5 SLOWEST TESTS:");
  [...results]
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 5)
    .forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.name} - ${r.duration.toFixed(2)}ms`);
    });

  console.log("\n📊 TOP 5 FASTEST TESTS:");
  [...results]
    .sort((a, b) => a.duration - b.duration)
    .slice(0, 5)
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

// Run the comprehensive test suite
runAllTests().catch((error) => {
  console.error("\n💥 Test suite crashed:", error);
  console.error(error.stack);
  process.exit(1);
});
