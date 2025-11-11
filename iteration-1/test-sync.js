/**
 * Synchronous Test Suite for Reactive Signal System
 * Tests core functionalities without async/await
 */

import {
  createSignal,
  createEffect,
  createMemo,
  createComputed,
  batch,
  createRoot,
  dispose,
  disposeComputation,
  onCleanup,
  getOwner,
  runWithOwner,
} from "./siganl-0.js";

// Test utilities
let testCount = 0;
let passedTests = 0;
let failedTests = 0;
const results = [];

function test(name, fn) {
  testCount++;
  console.log(`\n🧪 Test ${testCount}: ${name}`);
  try {
    fn();
    passedTests++;
    results.push({ name, status: "PASSED" });
    console.log("✅ PASSED");
  } catch (error) {
    failedTests++;
    results.push({ name, status: "FAILED", error: error.message });
    console.log("❌ FAILED:", error.message);
    console.error(error.stack);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected} but got ${actual}`);
  }
}

// Delay helper for microtasks
function nextTick() {
  return new Promise((resolve) => queueMicrotask(resolve));
}

// Run all tests
async function runTests() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("🚀 REACTIVE SIGNAL SYSTEM - SYNCHRONOUS TEST SUITE");
  console.log("═══════════════════════════════════════════════════════════");

  // ============================================================================
  // 1. BASIC SIGNAL TESTS
  // ============================================================================

  test("Signal creation and reading", () => {
    const [count, setCount] = createSignal(0);
    assertEqual(count(), 0, "Initial value should be 0");

    setCount(5);
    assertEqual(count(), 5, "Value should update to 5");
  });

  test("Signal with function updater", () => {
    const [count, setCount] = createSignal(0);

    setCount((c) => c + 1);
    assertEqual(count(), 1, "Function updater should work");

    setCount((c) => c * 2);
    assertEqual(count(), 2, "Function updater should chain");
  });

  // ============================================================================
  // 2. EFFECT TESTS
  // ============================================================================

  test("Effect tracks signal", async () => {
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
  });

  test("Effect tracks multiple signals", async () => {
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(2);
    let sum = 0;

    createEffect(() => {
      sum = a() + b();
    });

    await nextTick();
    assertEqual(sum, 3, "Effect should track both signals");

    setA(10);
    await nextTick();
    assertEqual(sum, 12, "Effect should update on first signal change");

    setB(20);
    await nextTick();
    assertEqual(sum, 30, "Effect should update on second signal change");
  });

  test("Effect disposal stops tracking", async () => {
    const [count, setCount] = createSignal(0);
    let effectRuns = 0;

    const dispose = createEffect(() => {
      count();
      effectRuns++;
    });

    await nextTick();
    assertEqual(effectRuns, 1, "Effect should run initially");

    setCount(1);
    await nextTick();
    assertEqual(effectRuns, 2, "Effect should run on change");

    dispose();

    setCount(2);
    await nextTick();
    assertEqual(effectRuns, 2, "Effect should not run after disposal");
  });

  test("Conditional dependency tracking", async () => {
    const [flag, setFlag] = createSignal(true);
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(2);
    let result = 0;

    createEffect(() => {
      if (flag()) {
        result = a();
      } else {
        result = b();
      }
    });

    await nextTick();
    assertEqual(result, 1, "Should use signal a initially");

    setA(10);
    await nextTick();
    assertEqual(result, 10, "Should update when a changes");

    setB(20);
    await nextTick();
    assertEqual(result, 10, "Should not update when b changes (not tracked)");

    setFlag(false);
    await nextTick();
    assertEqual(result, 20, "Should switch to signal b");

    setA(100);
    await nextTick();
    assertEqual(
      result,
      20,
      "Should not update when a changes (not tracked anymore)"
    );

    setB(200);
    await nextTick();
    assertEqual(result, 200, "Should update when b changes");
  });

  // ============================================================================
  // 3. MEMO TESTS
  // ============================================================================

  test("Memo caches values", async () => {
    const [count, setCount] = createSignal(1);
    let computations = 0;

    const doubled = createMemo(() => {
      computations++;
      return count() * 2;
    });

    await nextTick();
    assertEqual(computations, 1, "Memo should compute initially");

    assertEqual(doubled(), 2, "First read");
    assertEqual(doubled(), 2, "Second read");
    assertEqual(doubled(), 2, "Third read");
    assertEqual(computations, 1, "Memo should cache value");

    setCount(5);
    await nextTick();

    assertEqual(doubled(), 10, "Memo should recompute after signal change");
    assertEqual(computations, 2, "Memo should compute only once");
  });

  test("Memo lazy evaluation", async () => {
    const [count, setCount] = createSignal(1);
    let computations = 0;

    const doubled = createMemo(() => {
      computations++;
      return count() * 2;
    });

    await nextTick();
    assertEqual(computations, 1, "Initial computation");

    setCount(5);
    await nextTick();
    assertEqual(computations, 1, "Should not recompute until read");

    doubled();
    assertEqual(computations, 2, "Should recompute on read");
  });

  test("Chained memos", async () => {
    const [count, setCount] = createSignal(1);

    const doubled = createMemo(() => count() * 2);
    const quadrupled = createMemo(() => doubled() * 2);
    const octupled = createMemo(() => quadrupled() * 2);

    await nextTick();

    assertEqual(octupled(), 8, "Chained memos should work");

    setCount(2);
    await nextTick();

    assertEqual(octupled(), 16, "Chained memos should update");
  });

  // ============================================================================
  // 4. BATCHING TESTS
  // ============================================================================

  test("Batch prevents multiple updates", async () => {
    const [count, setCount] = createSignal(0);
    let effectRuns = 0;

    createEffect(() => {
      count();
      effectRuns++;
    });

    await nextTick();
    assertEqual(effectRuns, 1, "Effect runs initially");

    batch(() => {
      setCount(1);
      setCount(2);
      setCount(3);
    });

    await nextTick();
    assertEqual(effectRuns, 2, "Effect runs once after batch");
    assertEqual(count(), 3, "Final value is correct");
  });

  test("Nested batching", async () => {
    const [count, setCount] = createSignal(0);
    let effectRuns = 0;

    createEffect(() => {
      count();
      effectRuns++;
    });

    await nextTick();

    batch(() => {
      setCount(1);
      batch(() => {
        setCount(2);
      });
      setCount(3);
    });

    await nextTick();
    assertEqual(effectRuns, 2, "Effect runs once after nested batch");
    assertEqual(count(), 3, "Final value is correct");
  });

  // ============================================================================
  // 5. CLEANUP TESTS
  // ============================================================================

  test("onCleanup runs before re-execution", async () => {
    const [count, setCount] = createSignal(0);
    let cleanupRuns = 0;

    createEffect(() => {
      count();
      onCleanup(() => {
        cleanupRuns++;
      });
    });

    await nextTick();
    assertEqual(cleanupRuns, 0, "No cleanup initially");

    setCount(1);
    await nextTick();
    assertEqual(cleanupRuns, 1, "Cleanup before re-execution");

    setCount(2);
    await nextTick();
    assertEqual(cleanupRuns, 2, "Cleanup before each re-execution");
  });

  test("onCleanup runs on disposal", async () => {
    const [count, setCount] = createSignal(0);
    let cleanupRuns = 0;

    const dispose = createEffect(() => {
      count();
      onCleanup(() => {
        cleanupRuns++;
      });
    });

    await nextTick();

    dispose();
    assertEqual(cleanupRuns, 1, "Cleanup on disposal");
  });

  // ============================================================================
  // 6. ROOT & OWNERSHIP TESTS
  // ============================================================================

  test("createRoot isolates scope", async () => {
    const [count, setCount] = createSignal(0);
    let innerRuns = 0;

    const root = createRoot((dispose) => {
      createEffect(() => {
        count();
        innerRuns++;
      });

      return { dispose, setCount };
    });

    await nextTick();
    assertEqual(innerRuns, 1, "Effect runs initially");

    root.result.setCount(1);
    await nextTick();
    assertEqual(innerRuns, 2, "Effect runs on update");

    root.dispose();

    root.result.setCount(2);
    await nextTick();
    assertEqual(innerRuns, 2, "Effect stops after disposal");
  });

  test("getOwner returns current scope", async () => {
    const outerOwner = getOwner();
    let innerOwner = null;

    createEffect(() => {
      innerOwner = getOwner();
    });

    await nextTick();

    assert(innerOwner !== outerOwner, "Effect has different owner");
  });

  // ============================================================================
  // 7. DIAMOND PROBLEM TEST
  // ============================================================================

  test("Diamond problem - memos run before effects", async () => {
    const [count, setCount] = createSignal(1);
    const log = [];

    const doubled = createMemo(() => {
      log.push("memo-doubled");
      return count() * 2;
    });

    const quadrupled = createMemo(() => {
      log.push("memo-quadrupled");
      return count() * 4;
    });

    createEffect(() => {
      log.push("effect-start");
      doubled();
      quadrupled();
      log.push("effect-end");
    });

    await nextTick();
    log.length = 0; // Clear initial run

    setCount(2);
    await nextTick();

    const doubledIndex = log.indexOf("memo-doubled");
    const quadrupledIndex = log.indexOf("memo-quadrupled");
    const effectIndex = log.indexOf("effect-start");

    assert(doubledIndex < effectIndex, "Memo runs before effect");
    assert(quadrupledIndex < effectIndex, "Memo runs before effect");
  });

  // ============================================================================
  // 8. MEMORY LEAK TESTS
  // ============================================================================

  test("Disposed effects clean up observers", async () => {
    const [count, setCount] = createSignal(0);
    const [read] = [count];

    const initialObservers = read._state.observers.length;

    // Create and dispose effects
    for (let i = 0; i < 5; i++) {
      const dispose = createEffect(() => count());
      await nextTick();
      dispose();
    }

    await nextTick();

    assertEqual(
      read._state.observers.length,
      initialObservers,
      "Observers cleaned up"
    );
  });

  test("Conditional tracking switches dependencies", async () => {
    const [flag, setFlag] = createSignal(true);
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(2);
    const [readA] = [a];
    const [readB] = [b];

    createEffect(() => {
      if (flag()) {
        a();
      } else {
        b();
      }
    });

    await nextTick();

    assert(readA._state.observers.length > 0, "A has observers");
    assertEqual(readB._state.observers.length, 0, "B has no observers");

    setFlag(false);
    await nextTick();

    assertEqual(readA._state.observers.length, 0, "A has no observers");
    assert(readB._state.observers.length > 0, "B has observers");
  });

  // ============================================================================
  // SUMMARY
  // ============================================================================

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("📊 TEST RESULTS");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Total Tests: ${testCount}`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`Success Rate: ${((passedTests / testCount) * 100).toFixed(1)}%`);
  console.log("═══════════════════════════════════════════════════════════");

  if (failedTests > 0) {
    console.log("\n❌ Failed Tests:");
    results
      .filter((r) => r.status === "FAILED")
      .forEach((r) => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
  }

  if (failedTests === 0) {
    console.log("\n🎉 All tests passed!");
  } else {
    console.log("\n⚠️  Some tests failed.");
    process.exit(1);
  }
}

// Run tests
runTests().catch((error) => {
  console.error("Test suite failed:", error);
  process.exit(1);
});
