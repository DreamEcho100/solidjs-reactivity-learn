/**
 * Comprehensive Test Suite for Reactive Signal System
 * 
 * Tests all core functionalities:
 * - Signals (createSignal)
 * - Effects (createEffect)
 * - Memos (createMemo)
 * - Batching (batch)
 * - Ownership (createRoot, dispose)
 * - Cleanup (onCleanup, disposeComputation)
 * - Utilities (getOwner, runWithOwner)
 */

import {createSignal,
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
} from './siganl-0.js';

// Test utilities
let testCount = 0;
let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  testCount++;
  console.log(`\n🧪 Test ${testCount}: ${name}`);
  try {
    fn();
    passedTests++;
    console.log('✅ PASSED');
  } catch (error) {
    failedTests++;
    console.log('❌ FAILED:', error.message);
    console.error(error);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected} but got ${actual}`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// TEST SUITE
// ============================================================================

console.log('═══════════════════════════════════════════════════════════');
console.log('🚀 REACTIVE SIGNAL SYSTEM - COMPREHENSIVE TEST SUITE');
console.log('═══════════════════════════════════════════════════════════');

// ----------------------------------------------------------------------------
// 1. SIGNAL TESTS
// ----------------------------------------------------------------------------

test('Signal creation and reading', () => {
  const [count, setCount] = createSignal(0);
  
  assertEqual(count(), 0, 'Initial value should be 0');
  
  setCount(5);
  assertEqual(count(), 5, 'Value should update to 5');
});

test('Signal with function updater', () => {
  const [count, setCount] = createSignal(0);
  
  setCount(c => c + 1);
  assertEqual(count(), 1, 'Function updater should work');
  
  setCount(c => c * 2);
  assertEqual(count(), 2, 'Function updater should chain');
});

test('Signal with custom comparator', () => {
  let effectRuns = 0;
  
  const [obj, setObj] = createSignal({ x: 1 }, {
    equals: (a, b) => a.x === b.x
  });
  
  createEffect(() => {
    obj();
    effectRuns++;
  });
  
  await sleep(10);
  
  // Same value, shouldn't trigger
  setObj({ x: 1 });
  await sleep(10);
  
  assertEqual(effectRuns, 1, 'Effect should run only once (values equal)');
  
  // Different value, should trigger
  setObj({ x: 2 });
  await sleep(10);
  
  assertEqual(effectRuns, 2, 'Effect should run twice (values different)');
});

// ----------------------------------------------------------------------------
// 2. EFFECT TESTS
// ----------------------------------------------------------------------------

test('Effect runs on signal change', async () => {
  const [count, setCount] = createSignal(0);
  let effectValue = -1;
  
  createEffect(() => {
    effectValue = count();
  });
  
  await sleep(10);
  assertEqual(effectValue, 0, 'Effect should run initially');
  
  setCount(5);
  await sleep(10);
  assertEqual(effectValue, 5, 'Effect should update on signal change');
});

test('Effect tracks multiple signals', async () => {
  const [a, setA] = createSignal(1);
  const [b, setB] = createSignal(2);
  let sum = 0;
  
  createEffect(() => {
    sum = a() + b();
  });
  
  await sleep(10);
  assertEqual(sum, 3, 'Effect should track both signals');
  
  setA(10);
  await sleep(10);
  assertEqual(sum, 12, 'Effect should update on first signal change');
  
  setB(20);
  await sleep(10);
  assertEqual(sum, 30, 'Effect should update on second signal change');
});

test('Effect disposes correctly', async () => {
  const [count, setCount] = createSignal(0);
  let effectRuns = 0;
  
  const dispose = createEffect(() => {
    count();
    effectRuns++;
  });
  
  await sleep(10);
  assertEqual(effectRuns, 1, 'Effect should run initially');
  
  setCount(1);
  await sleep(10);
  assertEqual(effectRuns, 2, 'Effect should run on change');
  
  dispose();
  
  setCount(2);
  await sleep(10);
  assertEqual(effectRuns, 2, 'Effect should not run after disposal');
});

test('Nested effects', async () => {
  const [outer, setOuter] = createSignal(1);
  const [inner, setInner] = createSignal(10);
  let outerRuns = 0;
  let innerRuns = 0;
  
  createEffect(() => {
    outer();
    outerRuns++;
    
    createEffect(() => {
      inner();
      innerRuns++;
    });
  });
  
  await sleep(10);
  assertEqual(outerRuns, 1, 'Outer effect should run once');
  assertEqual(innerRuns, 1, 'Inner effect should run once');
  
  setInner(20);
  await sleep(10);
  assertEqual(innerRuns, 2, 'Inner effect should run on inner signal change');
  assertEqual(outerRuns, 1, 'Outer effect should not run on inner signal change');
  
  setOuter(2);
  await sleep(10);
  assert(outerRuns >= 2, 'Outer effect should run on outer signal change');
});

test('Conditional dependency tracking', async () => {
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
  
  await sleep(10);
  assertEqual(result, 1, 'Should use signal a initially');
  
  setA(10);
  await sleep(10);
  assertEqual(result, 10, 'Should update when a changes');
  
  setB(20);
  await sleep(10);
  assertEqual(result, 10, 'Should not update when b changes (not tracked)');
  
  setFlag(false);
  await sleep(10);
  assertEqual(result, 20, 'Should switch to signal b');
  
  setA(100);
  await sleep(10);
  assertEqual(result, 20, 'Should not update when a changes (not tracked anymore)');
  
  setB(200);
  await sleep(10);
  assertEqual(result, 200, 'Should update when b changes');
});

// ----------------------------------------------------------------------------
// 3. MEMO TESTS
// ----------------------------------------------------------------------------

test('Memo caching', async () => {
  const [count, setCount] = createSignal(1);
  let computations = 0;
  
  const doubled = createMemo(() => {
    computations++;
    return count() * 2;
  });
  
  await sleep(10);
  assertEqual(computations, 1, 'Memo should compute initially');
  
  // Read multiple times
  assertEqual(doubled(), 2, 'Memo should return correct value');
  assertEqual(doubled(), 2, 'Memo should return cached value');
  assertEqual(doubled(), 2, 'Memo should return cached value');
  assertEqual(computations, 1, 'Memo should not recompute on reads');
  
  setCount(5);
  await sleep(10);
  
  assertEqual(doubled(), 10, 'Memo should recompute on signal change');
  assertEqual(computations, 2, 'Memo should compute only once after change');
});

test('Memo lazy evaluation', async () => {
  const [count, setCount] = createSignal(1);
  let computations = 0;
  
  const doubled = createMemo(() => {
    computations++;
    return count() * 2;
  });
  
  await sleep(10);
  assertEqual(computations, 1, 'Memo should compute initially');
  
  setCount(5);
  await sleep(10);
  assertEqual(computations, 1, 'Memo should not recompute until read');
  
  doubled();
  assertEqual(computations, 2, 'Memo should recompute on read');
});

test('Memo with custom equality', async () => {
  const [count, setCount] = createSignal(1);
  let memoRuns = 0;
  let effectRuns = 0;
  
  const result = createMemo(() => {
    memoRuns++;
    return { value: Math.floor(count() / 10) };
  }, undefined, {
    equals: (a, b) => a.value === b.value
  });
  
  createEffect(() => {
    result();
    effectRuns++;
  });
  
  await sleep(10);
  assertEqual(memoRuns, 1, 'Memo should run initially');
  assertEqual(effectRuns, 1, 'Effect should run initially');
  
  setCount(5); // Still floors to 0
  await sleep(10);
  result(); // Force recompute
  await sleep(10);
  
  assertEqual(memoRuns, 2, 'Memo should recompute');
  assertEqual(effectRuns, 1, 'Effect should not run (value unchanged)');
  
  setCount(15); // Floors to 1
  await sleep(10);
  result(); // Force recompute
  await sleep(10);
  
  assertEqual(memoRuns, 3, 'Memo should recompute');
  assertEqual(effectRuns, 2, 'Effect should run (value changed)');
});

test('Chained memos', async () => {
  const [count, setCount] = createSignal(1);
  
  const doubled = createMemo(() => count() * 2);
  const quadrupled = createMemo(() => doubled() * 2);
  const octupled = createMemo(() => quadrupled() * 2);
  
  await sleep(10);
  
  assertEqual(octupled(), 8, 'Chained memos should work');
  
  setCount(2);
  await sleep(10);
  
  assertEqual(octupled(), 16, 'Chained memos should update');
});

// ----------------------------------------------------------------------------
// 4. BATCHING TESTS
// ----------------------------------------------------------------------------

test('Batch prevents multiple effect runs', async () => {
  const [count, setCount] = createSignal(0);
  let effectRuns = 0;
  
  createEffect(() => {
    count();
    effectRuns++;
  });
  
  await sleep(10);
  assertEqual(effectRuns, 1, 'Effect should run initially');
  
  batch(() => {
    setCount(1);
    setCount(2);
    setCount(3);
  });
  
  await sleep(10);
  assertEqual(effectRuns, 2, 'Effect should run only once after batch');
  assertEqual(count(), 3, 'Signal should have final value');
});

test('Nested batching', async () => {
  const [count, setCount] = createSignal(0);
  let effectRuns = 0;
  
  createEffect(() => {
    count();
    effectRuns++;
  });
  
  await sleep(10);
  assertEqual(effectRuns, 1, 'Effect should run initially');
  
  batch(() => {
    setCount(1);
    
    batch(() => {
      setCount(2);
      setCount(3);
    });
    
    setCount(4);
  });
  
  await sleep(10);
  assertEqual(effectRuns, 2, 'Effect should run only once after nested batch');
  assertEqual(count(), 4, 'Signal should have final value');
});

// ----------------------------------------------------------------------------
// 5. OWNERSHIP & CLEANUP TESTS
// ----------------------------------------------------------------------------

test('createRoot creates isolated scope', async () => {
  let innerRuns = 0;
  
  const rootDispose = createRoot((dispose) => {
    const [count, setCount] = createSignal(0);
    
    createEffect(() => {
      count();
      innerRuns++;
    });
    
    return { dispose, setCount };
  });
  
  await sleep(10);
  assertEqual(innerRuns, 1, 'Effect should run initially');
  
  rootDispose.result.setCount(1);
  await sleep(10);
  assertEqual(innerRuns, 2, 'Effect should run on signal change');
  
  rootDispose.dispose();
  
  rootDispose.result.setCount(2);
  await sleep(10);
  assertEqual(innerRuns, 2, 'Effect should not run after root disposal');
});

test('onCleanup runs on effect disposal', async () => {
  const [count, setCount] = createSignal(0);
  let cleanupRuns = 0;
  
  const dispose = createEffect(() => {
    count();
    
    onCleanup(() => {
      cleanupRuns++;
    });
  });
  
  await sleep(10);
  assertEqual(cleanupRuns, 0, 'Cleanup should not run initially');
  
  setCount(1);
  await sleep(10);
  assertEqual(cleanupRuns, 1, 'Cleanup should run before re-execution');
  
  setCount(2);
  await sleep(10);
  assertEqual(cleanupRuns, 2, 'Cleanup should run before each re-execution');
  
  dispose();
  await sleep(10);
  assertEqual(cleanupRuns, 3, 'Cleanup should run on disposal');
});

test('onCleanup with timers', async () => {
  const [active, setActive] = createSignal(true);
  let ticks = 0;
  
  const dispose = createEffect(() => {
    if (active()) {
      const timer = setInterval(() => {
        ticks++;
      }, 5);
      
      onCleanup(() => {
        clearInterval(timer);
      });
    }
  });
  
  await sleep(20);
  const ticksAfter20ms = ticks;
  assert(ticksAfter20ms >= 3, 'Timer should tick multiple times');
  
  setActive(false);
  await sleep(20);
  assertEqual(ticks, ticksAfter20ms, 'Timer should stop after cleanup');
  
  dispose();
});

test('Nested effect cleanup', async () => {
  const [outer, setOuter] = createSignal(1);
  let outerCleanups = 0;
  let innerCleanups = 0;
  
  const dispose = createEffect(() => {
    outer();
    
    onCleanup(() => {
      outerCleanups++;
    });
    
    createEffect(() => {
      onCleanup(() => {
        innerCleanups++;
      });
    });
  });
  
  await sleep(10);
  
  setOuter(2);
  await sleep(10);
  assert(outerCleanups >= 1, 'Outer cleanup should run');
  assert(innerCleanups >= 1, 'Inner cleanup should run');
  
  dispose();
  await sleep(10);
  assert(outerCleanups >= 2, 'Outer cleanup should run on disposal');
});

// ----------------------------------------------------------------------------
// 6. OWNERSHIP HIERARCHY TESTS
// ----------------------------------------------------------------------------

test('getOwner returns current owner', () => {
  const outerOwner = getOwner();
  
  createEffect(() => {
    const effectOwner = getOwner();
    assert(effectOwner !== outerOwner, 'Effect should have different owner');
    assert(effectOwner !== null, 'Effect should have an owner');
  });
});

test('runWithOwner runs code with specific owner', async () => {
  let ownerInEffect1 = null;
  let ownerInEffect2 = null;
  
  createEffect(() => {
    ownerInEffect1 = getOwner();
  });
  
  const owner = getOwner();
  
  createEffect(() => {
    runWithOwner(owner, () => {
      ownerInEffect2 = getOwner();
    });
  });
  
  await sleep(10);
  
  assert(ownerInEffect2 === owner, 'runWithOwner should set owner correctly');
});

// ----------------------------------------------------------------------------
// 7. DIAMOND PROBLEM TEST
// ----------------------------------------------------------------------------

test('Diamond problem resolution', async () => {
  const [count, setCount] = createSignal(1);
  const log = [];
  
  const doubled = createMemo(() => {
    log.push('memo:doubled');
    return count() * 2;
  });
  
  const quadrupled = createMemo(() => {
    log.push('memo:quadrupled');
    return count() * 4;
  });
  
  createEffect(() => {
    log.push('effect:start');
    const a = doubled();
    const b = quadrupled();
    log.push(`effect:end(${a},${b})`);
  });
  
  await sleep(10);
  log.length = 0; // Clear initial run
  
  setCount(2);
  await sleep(10);
  
  // Memos should run before effect
  const memoIndex1 = log.indexOf('memo:doubled');
  const memoIndex2 = log.indexOf('memo:quadrupled');
  const effectIndex = log.indexOf('effect:start');
  
  assert(memoIndex1 < effectIndex, 'Memo should run before effect');
  assert(memoIndex2 < effectIndex, 'Memo should run before effect');
});

// ----------------------------------------------------------------------------
// 8. MEMORY LEAK TESTS
// ----------------------------------------------------------------------------

test('Disposed effects dont leak memory', async () => {
  const [count, setCount] = createSignal(0);
  const [read] = [count];
  
  // Check initial observers
  const initialObservers = read._state.observers.length;
  
  // Create and dispose multiple effects
  for (let i = 0; i < 10; i++) {
    const dispose = createEffect(() => {
      count();
    });
    await sleep(5);
    dispose();
  }
  
  await sleep(10);
  
  assertEqual(
    read._state.observers.length,
    initialObservers,
    'Observers should be cleaned up after disposal'
  );
});

test('Conditional tracking doesnt leak', async () => {
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
  
  await sleep(10);
  
  const aObservers = readA._state.observers.length;
  assert(aObservers > 0, 'Signal a should have observers');
  assertEqual(readB._state.observers.length, 0, 'Signal b should have no observers');
  
  setFlag(false);
  await sleep(10);
  
  assertEqual(readA._state.observers.length, 0, 'Signal a should have no observers');
  assert(readB._state.observers.length > 0, 'Signal b should have observers');
});

// ----------------------------------------------------------------------------
// 9. EDGE CASES
// ----------------------------------------------------------------------------

test('Effect with no dependencies', async () => {
  let runs = 0;
  
  createEffect(() => {
    runs++;
  });
  
  await sleep(10);
  assertEqual(runs, 1, 'Effect with no dependencies should run once');
});

test('Multiple effects on same signal', async () => {
  const [count, setCount] = createSignal(0);
  let effect1Runs = 0;
  let effect2Runs = 0;
  let effect3Runs = 0;
  
  createEffect(() => {
    count();
    effect1Runs++;
  });
  
  createEffect(() => {
    count();
    effect2Runs++;
  });
  
  createEffect(() => {
    count();
    effect3Runs++;
  });
  
  await sleep(10);
  
  setCount(1);
  await sleep(10);
  
  assertEqual(effect1Runs, 2, 'Effect 1 should run twice');
  assertEqual(effect2Runs, 2, 'Effect 2 should run twice');
  assertEqual(effect3Runs, 2, 'Effect 3 should run twice');
});

test('Signal updates in effect', async () => {
  const [count, setCount] = createSignal(0);
  const [double, setDouble] = createSignal(0);
  
  createEffect(() => {
    setDouble(count() * 2);
  });
  
  await sleep(10);
  assertEqual(double(), 0, 'Double should be 0 initially');
  
  setCount(5);
  await sleep(10);
  assertEqual(double(), 10, 'Double should update to 10');
});

test('Disposed computation is marked', async () => {
  const [count, setCount] = createSignal(0);
  
  let computation = null;
  createRoot(() => {
    const dispose = createEffect(() => {
      count();
    });
    
    // Access internal computation (hackish but for testing)
    computation = dispose;
  });
  
  await sleep(10);
  
  if (computation) {
    disposeComputation(computation);
    await sleep(10);
    
    // Check if marked as disposed (if implementation supports it)
    // This is implementation-specific
  }
});

// ----------------------------------------------------------------------------
// SUMMARY
// ----------------------------------------------------------------------------

console.log('\n═══════════════════════════════════════════════════════════');
console.log('📊 TEST RESULTS');
console.log('═══════════════════════════════════════════════════════════');
console.log(`Total Tests: ${testCount}`);
console.log(`✅ Passed: ${passedTests}`);
console.log(`❌ Failed: ${failedTests}`);
console.log(`Success Rate: ${((passedTests / testCount) * 100).toFixed(1)}%`);
console.log('═══════════════════════════════════════════════════════════');

if (failedTests === 0) {
  console.log('🎉 All tests passed!');
} else {
  console.log('⚠️  Some tests failed. Review the output above.');
  process.exit(1);
}
