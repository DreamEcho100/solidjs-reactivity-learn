/**
 * REACTIVE SYSTEM - CORE MECHANISMS
 *
 * This implementation handles four critical reactive system behaviors:
 *
 * ## 1. DEDUPLICATION
 * **How:** Uses a Set (`currentBatchEffects`) to track pending effects during batching.
 * **Why:** Sets automatically prevent duplicate entries. If signal A and signal B both
 * trigger effect X, the effect only appears once in the Set.
 *
 * ```js
 * batch(() => {
 *   setA(1); // Adds effectX to Set
 *   setB(2); // Adds effectX to Set (no duplicate!)
 * });
 * // effectX runs once
 * ```
 *
 * ## 2. CASCADING UPDATES
 * **How:** The flush loop (`flushCurrentBatchEffects`) continues while effects remain.
 * Effects can trigger more signals, which add more effects to the Set.
 * **Why:** Without this, effects triggered during flush would be lost.
 *
 * ```js
 * createEffect(() => {
 *   if (a() === 5) setB(10); // Triggers during flush
 * });
 *
 * batch(() => setA(5));
 * // Effect runs, triggers setB, which adds more effects to the Set
 * // Loop continues until Set is empty
 * ```
 *
 * ## 3. NOT LOSING EFFECTS
 * **How:** We clear the Set AFTER capturing the snapshot, not before.
 * **Why:** Effects executed in the current wave can add effects to the live Set,
 * which will be processed in the next iteration.
 *
 * ```js
 * while (currentBatchEffects.size > 0) {
 *   const queue = [...currentBatchEffects]; // Snapshot
 *   currentBatchEffects.clear();            // Clear after snapshot
 *
 *   for (const effect of queue) {
 *     effect.execute(); // May add to currentBatchEffects
 *   }
 * }
 * ```
 *
 * ## 4. NESTED EFFECTS AND MEMOS
 * **How:** Uses a stack (`listeners`) to track the currently executing effect.
 * When an effect runs, it pushes itself onto the stack. Signal reads subscribe
 * to `listeners[listeners.length - 1]`.
 * **Why:** Ensures each signal read subscribes to the correct effect, even when
 * effects create other effects.
 *
 * ```js
 * createEffect(() => {           // listeners = [effect1]
 *   a();                         // Subscribes effect1 to signal a
 *   createEffect(() => {         // listeners = [effect1, effect2]
 *     b();                       // Subscribes effect2 to signal b (not effect1!)
 *   });                          // listeners = [effect1]
 * });                            // listeners = []
 * ```
 *
 * ## SYNERGY
 * These mechanisms work together:
 * - Deduplication (Set) prevents redundant work
 * - Cascading (while loop) handles dynamic updates
 * - Not losing effects (clear after snapshot) ensures completeness
 * - Nested tracking (stack) ensures correct subscriptions
 *
 * The result is a robust reactive system that handles complex scenarios
 * while maintaining performance and correctness.
 */

/**
 * @typedef {{
 * 	execute: () => void;
 * 	subscriptions: Set<ReturnType<typeof createSignal>[0]>
 *  cleanups: (() => void)[]
 * }} Effect
 */

/**
 * @template T
 * @typedef {object} Computation
 * @property {() => T} fn Function that computes/produces a value (for memos) or runs side-effects (for effects)
 * @property {() => void} execute Invokes the computation (used when invalidated)
 * @property {Owner | null} owner Parent reactive owner/scope that created this computation
 * @property {SignalState<any>[] | null} sources Signals (or memos) this computation reads from
 * @property {number[] | null} sourceSlots Index in each source's observers array (for O(1) removal)
 * @property {Computation<any>[] | null} observers Child computations that depend on this computation (memos/effects)
 * @property {number[] | null} observerSlots Index in each observer's sources array (for O(1) removal)
 * @property {(() => void)[] | null} cleanups Cleanup/disposer functions to run when this computation is disposed
 * @property {T | undefined} value Cached value for memos (undefined for pure effects)
 * @property {number | undefined} state Internal state/flags (implementation specific)
 * @property {boolean | undefined} disposed Whether this computation has been disposed
 * @property {string | undefined} name Optional debug name
 */

/**
 * @typedef {object} Owner
 * @property {Computation<any>[] | null} owned  Child computations
 * @property {(() => void)[] | null} cleanups  Cleanup functions
 * @property {Owner | null} owner  Parent owner
 * @property {any | null} context  Context data
 *
 * @description Every signal and computation has an owner (the reactive scope that created it)
 *
 * ```
 * Root
 *  ├─ Effect 1
 *  │   ├─ Memo 1
 *  │   └─ Effect 2
 *  └─ Effect 3
 *      └─ Memo 2
 * ```
 *
 * ***Benefits:**
 *
 * - Automatic cleanup on parent disposal
 * - Context propagation
 * - Memory leak prevention
 */

/**
 * @template T
 * @typedef {object} SignalState
 * @property {T} value Current value of the signal
 * @property {Computation<any>[]} observers Set of observers subscribed to this signal
 * @property {number[] | null} observerSots Array of observer slots (for optimization), or null if not used
 *
 * ### Bidirectional Tracking
 *
 * **Signal → Observers (Forward)**
 *
 * ```js
 * signal.observers = [effect1, effect2, effect3];
 * signal.observerSlots = [0, 1, 0]; // Index in each observer's sources
 * Observer → Sources (Backward)
 * ```
 *
 * ```js
 * effect.sources = [signalA, signalB];
 * effect.sourceSlots = [2, 0]; // Index in each signal's observers
 * ```
 *
 * This allows efficient:
 *
 * - **Add:** O(1) append to arrays
 * - **Remove:** O(1) swap with last element
 * - **Update:** Know exactly what changed
 *
 * ### Example: Bidirectional Links
 *
 * ```js
 * const [a, setA] = createSignal(1);
 * const [b, setB] = createSignal(2);
 *
 * createEffect(() => {
 *   console.log(a() + b());
 * });
 * ```
 *
 * **After setup:**
 *
 * ```js
 * // Signal A's state
 * a.observers = [effect];
 * a.observerSlots = [0]; // effect.sources[0] = a
 *
 * // Signal B's state
 * b.observers = [effect];
 * b.observerSlots = [1]; // effect.sources[1] = b
 *
 * // Effect's state
 * effect.sources = [a, b];
 * effect.sourceSlots = [0, 0]; // a.observers[0], b.observers[0]
 * ```
 *
 * @property {T} [tValue] transition value (used in concurrent mode and transitions)
 * @property {(prev: T, next: T) => boolean} [comparator] Optional comparator function to determine if the value has changed
 * @property {string} [name] Optional name for debugging purposes
 */

/**
 * Global tracking context
 * @type {Effect[]}
 */
const listeners = [];
/** @type {(() => void)[]} */
let currentCleanups = [];
/** @type {Set<Effect>|null} */
let currentBatchEffects = null;

/**
 * Flushes all pending effects in the current batch.
 *
 * **HANDLES CASCADING UPDATES:** Uses a while loop to process effects that trigger
 * more effects during flush. When an effect executes and triggers signals, those
 * signals add new effects to `currentBatchEffects`. The loop continues until the
 * Set is empty.
 *
 * **DOESN'T LOSE EFFECTS:** We clear() the Set AFTER capturing the snapshot,
 * so any effects added during execution go into the still-live Set, which will
 * be processed in the next iteration.
 *
 * **HANDLES DEDUPLICATION:** Using a Set automatically deduplicates effects.
 * If multiple signals trigger the same effect, it only appears once in the Set.
 *
 * @example
 * ```js
 * const [a, setA] = createSignal(1);
 * const [b, setB] = createSignal(2);
 *
 * createEffect(() => {
 *   console.log("Effect 1:", a());
 *   if (a() === 10) setB(20); // Cascading update!
 * });
 *
 * createEffect(() => {
 *   console.log("Effect 2:", b());
 * });
 *
 * batch(() => {
 *   setA(10); // Triggers Effect 1, which triggers setB, which triggers Effect 2
 *   setB(30); // Effect 2 only runs once (deduplicated)
 * });
 * // Effect 1 runs, sets b to 20
 * // Effect 2 runs once with b=30 (deduped, last value wins)
 * ```
 */
function flushCurrentBatchEffects() {
  if (!currentBatchEffects?.size) return;

  // Process effects in waves until none remain
  while (currentBatchEffects.size > 0) {
    // Capture current effects as an array
    const queue = [...currentBatchEffects];

    // Clear the Set BEFORE executing effects
    // This allows effects to add NEW effects during execution
    currentBatchEffects.clear();

    // Execute all effects in this wave
    // If any effect triggers signals, new effects are added to currentBatchEffects
    for (const effect of queue) effect.execute();
  }

  currentBatchEffects = null;
}

let batchDepth = 0;
/**
 * Batches multiple signal updates into a single effect execution cycle.
 *
 * **HANDLES NESTED BATCHES:** Checks if we're already batching before creating
 * a new Set. Only the outermost batch() call flushes effects.
 *
 * **DEDUPLICATION:** All signals in the batch add effects to the same Set,
 * ensuring each effect runs only once regardless of how many signals it depends on.
 *
 * @param {() => void} fn - Function to execute within the batch
 *
 * @example
 * ```js
 * const [a, setA] = createSignal(1);
 * const [b, setB] = createSignal(2);
 *
 * createEffect(() => console.log("Effect:", a() + b()));
 *
 * // Nested batch example
 * batch(() => {
 *   setA(10);
 *   batch(() => {
 *     setB(20); // Inner batch doesn't flush
 *   });
 *   setA(30); // Still batching
 * });
 * // Effect runs once with final values: a=30, b=20
 * ```
 */
function batch(fn) {
  batchDepth++;

  if (batchDepth === 1) {
    currentBatchEffects = new Set();
  }

  try {
    const result = fn();

    // Only flush if this is the outermost batch
    if (batchDepth === 1) {
      flushCurrentBatchEffects();
    }

    return result;
  } catch (error) {
    throw error;
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      currentBatchEffects = null;
    }
  }
}

/**
 * @template T
 * @param {T} initValue
 * @param {{ equals?: (prev: T, next: T) => boolean; }} [opts]
 */
function createSignal(initValue, opts) {
  const equals = opts?.equals ?? Object.is;
  let value = initValue;
  /** @type {Set<Effect>} */
  const subscribers = new Set();

  /**
   * Getter function that returns the current value and tracks dependencies.
   *
   * **AUTOMATIC SUBSCRIPTION:** When called during an effect execution,
   * subscribes the current effect (from the listeners stack) to this signal.
   *
   * **NESTED EFFECT SUPPORT:** Always subscribes to the TOP of the stack
   * (`listeners[listeners.length - 1]`), ensuring correct tracking even
   * when effects are nested.
   *
   * @returns {T} Current signal value
   * @property {(listener: Effect) => void} unsubscribe - Remove a subscriber
   *
   * @example
   * ```js
   * const [count, setCount] = createSignal(0);
   *
   * createEffect(() => {
   *   // When count() is called:
   *   // 1. Gets current listener from stack
   *   // 2. Adds listener to signal's subscribers
   *   // 3. Tracks signal in listener's subscriptions
   *   console.log(count());
   * });
   * ```
   */
  function read() {
    // If there's a current listener, subscribe it
    const currentListener = listeners[listeners.length - 1];
    if (currentListener) {
      subscribers.add(currentListener);

      // Track subscription for cleanup (bidirectional link)
      if (!currentListener.subscriptions) {
        currentListener.subscriptions = new Set();
      }
      currentListener.subscriptions.add(read);
    }

    return value;
  }

  /**
   * @param {*} listener
   */
  read.unsubscribe = (listener) => {
    subscribers.delete(listener);
  };

  // Setter (notifies observers)
  /**
   * Updates the signal value and notifies all subscribed effects.
   *
   * **HANDLES DEDUPLICATION:** Takes a snapshot of subscribers to prevent
   * issues if subscribers modify the Set during iteration. If batching is
   * active, effects are added to a Set which automatically deduplicates.
   *
   * **HANDLES CASCADING UPDATES:** When an effect executes, it may read
   * other signals or call other setters. If batching, these cascade naturally.
   * If not batching, effects run immediately but can trigger more effects.
   *
   * @param {T | ((prev: T) => T)} newValue - New value or updater function
   *
   * @example
   * ```js
   * const [count, setCount] = createSignal(0);
   *
   * // Deduplication example
   * createEffect(() => console.log("Count:", count()));
   *
   * batch(() => {
   *   setCount(1); // Adds effect to Set
   *   setCount(2); // Same effect, no duplicate
   *   setCount(3); // Same effect, no duplicate
   * });
   * // Logs "Count: 3" only once
   *
   * // Cascading example
   * const [a, setA] = createSignal(0);
   * const [b, setB] = createSignal(0);
   *
   * createEffect(() => {
   *   if (a() === 5) setB(10); // Cascading update
   * });
   *
   * createEffect(() => console.log("B:", b()));
   *
   * setA(5); // Triggers first effect, which triggers setB, which triggers second effect
   * ```
   */
  function write(newValue) {
    if (typeof newValue === "function") {
      // biome-ignore lint/suspicious/noTsIgnore: required for type coercion
      // @ts-ignore
      newValue = newValue(value);
    }

    // biome-ignore lint/suspicious/noTsIgnore: required for type coercion
    // @ts-ignore
    if (equals(value, newValue)) return;

    // biome-ignore lint/suspicious/noTsIgnore: required for type coercion
    // @ts-ignore
    value = newValue;

    // Snapshot prevents iteration issues if subscribers change during notification
    const subscribersSnapshot = [...subscribers];

    // Notify all subscribers
    if (currentBatchEffects !== null) {
      // Batching: add to Set (automatic deduplication)
      for (const subscriber of subscribersSnapshot)
        currentBatchEffects.add(subscriber);
    } else {
      // No batching: execute immediately (allows cascading)
      for (const subscriber of subscribersSnapshot) subscriber.execute();
    }
  }

  return /** @type {const} */ ([read, write]);
}

/**
 * @param {Effect} effect
 */
function cleanup(effect) {
  if (effect.cleanups.length) {
    for (const cleanup of effect.cleanups) cleanup();
    effect.cleanups = [];
  }

  for (const dep of effect.subscriptions) {
    dep.unsubscribe(effect);
  }
  effect.subscriptions.clear();
}

/**
 * @param {() => void} fn
 */
function onCleanup(fn) {
  if (currentCleanups) {
    currentCleanups.push(fn);
  }
}

/**
 * Creates a reactive effect that automatically tracks signal dependencies.
 *
 * **HANDLES NESTED EFFECTS:** Uses a stack (listeners array) to track which
 * effect is currently executing. When effect A creates effect B, the stack
 * ensures each signal read subscribes to the correct effect.
 *
 * **AUTOMATIC CLEANUP:** Before each re-run, cleans up previous subscriptions
 * to prevent memory leaks and stale dependencies.
 *
 * **BATCHING FOR DX:** Wraps effect execution in batch() so that any signal
 * updates within the effect are batched together. This prevents cascading
 * re-executions and provides better performance.
 *
 * When an effect runs, it becomes the current listener on the stack. Any signal
 * reads during execution will see this effect and subscribe it.
 *
 * @param {() => void} fn - Effect function to execute
 * @returns {() => void} Dispose function to stop the effect
 *
 * @example
 * ```js
 * // Nested effects example
 * const [outer, setOuter] = createSignal(1);
 * const [inner, setInner] = createSignal(2);
 *
 * createEffect(() => {
 *   console.log("Outer effect:", outer());
 *
 *   // Nested effect created dynamically
 *   createEffect(() => {
 *     console.log("  Inner effect:", inner());
 *   });
 * });
 *
 * // Stack during execution:
 * // 1. Outer effect runs → listeners = [outerEffect]
 * //    - outer() subscribes outerEffect
 * // 2. Inner effect created and runs → listeners = [outerEffect, innerEffect]
 * //    - inner() subscribes innerEffect (not outerEffect!)
 * // 3. Inner effect finishes → listeners = [outerEffect]
 * // 4. Outer effect finishes → listeners = []
 *
 * setInner(3); // Only inner effect re-runs
 * setOuter(2); // Outer effect re-runs, creates NEW inner effect
 *
 * // Batching example (good DX):
 * createEffect(() => {
 *   const [temp, setTemp] = createSignal(0);
 *   setTemp(1); // Batched automatically
 *   setTemp(2); // Won't cause multiple re-runs
 *   console.log(temp()); // 2
 * });
 *
 * // Respects outer batch:
 * batch(() => {
 *   setOuter(5); // Effect queued, not run immediately
 * }); // Flushes here
 * ```
 */
function createEffect(fn) {
  /** @type {Effect} */
  const effect = {
    execute: () => {
      // Clean up previous subscriptions before re-running
      cleanup(effect);

      // Set up cleanup collection for this execution
      currentCleanups = effect.cleanups = [];

      // Push this effect onto the stack
      listeners.push(effect);
      try {
        // Only batch if we're not already batching
        // This gives good DX while respecting outer batches
        if (currentBatchEffects === null) {
          batch(fn);
        } else {
          // Already batching, just run directly
          fn();
        }
      } finally {
        // Always pop from stack, even if fn throws
        listeners.pop();
      }
    },
    subscriptions: new Set(),
    cleanups: [],
  };

  // Execute immediately to establish initial subscriptions
  effect.execute();

  return () => {
    cleanup(effect);
  };
}
/**
 * Creates a memoized computation that caches its result.
 *
 * **NESTED MEMOS:** Works correctly because createEffect handles nesting via
 * the listeners stack. When the memo's effect runs, it becomes the current
 * listener and subscribes to its dependencies.
 *
 * @template T
 * @param {() => T} fn - Computation function
 * @param {Parameters<typeof createSignal>[1]} [opts] - Signal options
 * @returns {() => T} Getter function for the memoized value
 *
 * @example
 * ```js
 * const [a, setA] = createSignal(1);
 * const [b, setB] = createSignal(2);
 *
 * // Nested memo example
 * const sum = createMemo(() => {
 *   console.log("Computing sum");
 *   return a() + b();
 * });
 *
 * const doubled = createMemo(() => {
 *   console.log("Computing doubled");
 *   return sum() * 2; // Nested: depends on another memo
 * });
 *
 * createEffect(() => {
 *   console.log("Result:", doubled());
 * });
 *
 * // Logs: "Computing sum", "Computing doubled", "Result: 6"
 *
 * setA(5);
 * // Logs: "Computing sum", "Computing doubled", "Result: 14"
 * // sum re-runs → doubled re-runs → effect re-runs
 * ```
 */
function createMemo(fn, opts) {
  const [signal, setSignal] = createSignal(/** @type {T} */ (undefined), opts);

  createEffect(() => {
    const value = fn();
    setSignal(value);
  });

  return signal;
}

// ============================================================================
// TESTS FOR THE CORE BEHAVIORS
// ============================================================================

console.log("🧪 REACTIVE SYSTEM TESTS\n");
console.log("=".repeat(70) + "\n");

// ============================================================================
// TEST 1: DEDUPLICATION
// ============================================================================
console.log("TEST 1: DEDUPLICATION");
console.log("Multiple signals triggering same effect should run it only once");
console.log("-".repeat(70));

{
  let runCount = 0;
  let lastA = 0,
    lastB = 0,
    lastC = 0;

  const [a, setA] = createSignal(1);
  const [b, setB] = createSignal(2);
  const [c, setC] = createSignal(3);

  createEffect(() => {
    lastA = a();
    lastB = b();
    lastC = c();
    runCount++;
  });

  // Reset after initial run
  runCount = 0;

  // Update all 3 signals in a batch - effect should only run once
  batch(() => {
    setA(10); // Queues effect
    setB(20); // Same effect, deduped!
    setC(30); // Same effect, deduped!
  });

  console.log(`✓ Effect ran ${runCount} time(s)`);
  console.log(`✓ Final values: a=${lastA}, b=${lastB}, c=${lastC}`);

  if (runCount === 1 && lastA === 10 && lastB === 20 && lastC === 30) {
    console.log("✅ PASS: Effect ran exactly once with all final values\n");
  } else {
    console.log(`❌ FAIL: Expected 1 run, got ${runCount}\n`);
  }
}

// ============================================================================
// TEST 2: CASCADING UPDATES
// ============================================================================
console.log("TEST 2: CASCADING UPDATES");
console.log("Effects can trigger more effects during flush");
console.log("-".repeat(70));

{
  let e1Count = 0,
    e2Count = 0,
    e3Count = 0;
  let finalA = 0,
    finalB = 0,
    finalC = 0;

  const [a, setA] = createSignal(1);
  const [b, setB] = createSignal(2);
  const [c, setC] = createSignal(3);

  // Effect 1: Reads a, triggers b when a === 10
  createEffect(() => {
    finalA = a();
    e1Count++;
    if (finalA === 10) {
      setB(100); // Cascading update!
    }
  });

  // Effect 2: Reads b, triggers c when b === 100
  createEffect(() => {
    finalB = b();
    e2Count++;
    if (finalB === 100) {
      setC(200); // Another cascading update!
    }
  });

  // Effect 3: Reads c
  createEffect(() => {
    finalC = c();
    e3Count++;
  });

  // Reset counts
  e1Count = e2Count = e3Count = 0;

  batch(() => {
    setA(10); // Triggers E1 → setB(100) → E2 → setC(200) → E3
  });

  console.log(`✓ Effect 1 ran ${e1Count} time(s), a=${finalA}`);
  console.log(`✓ Effect 2 ran ${e2Count} time(s), b=${finalB}`);
  console.log(`✓ Effect 3 ran ${e3Count} time(s), c=${finalC}`);

  if (
    e1Count > 0 &&
    e2Count > 0 &&
    e3Count > 0 &&
    finalB === 100 &&
    finalC === 200
  ) {
    console.log("✅ PASS: All cascading effects executed correctly\n");
  } else {
    console.log("❌ FAIL: Cascading effects didn't work properly\n");
  }
}

// ============================================================================
// TEST 3: NOT LOSING EFFECTS
// ============================================================================
console.log("TEST 3: NOT LOSING EFFECTS");
console.log("Effects triggered during flush are not lost");
console.log("-".repeat(70));

{
  let mainRan = false,
    counterRan = false;
  let triggerValue = 0,
    counterValue = 0;

  const [trigger, setTrigger] = createSignal(0);
  const [counter, setCounter] = createSignal(0);

  // This effect triggers another signal during its execution
  createEffect(() => {
    triggerValue = trigger();
    if (triggerValue > 0) {
      setCounter((c) => c + 1); // Triggers during effect execution
      mainRan = true;
    }
  });

  // This effect should still run even though it was triggered during flush
  createEffect(() => {
    counterValue = counter();
    if (counterValue > 0) {
      counterRan = true;
    }
  });

  mainRan = counterRan = false;

  batch(() => {
    setTrigger(1); // Main effect runs, triggers setCounter, counter effect runs
  });

  console.log(`✓ Main effect ran: ${mainRan}, trigger=${triggerValue}`);
  console.log(`✓ Counter effect ran: ${counterRan}, counter=${counterValue}`);

  if (mainRan && counterRan && counterValue === 1) {
    console.log("✅ PASS: Both effects ran, none were lost\n");
  } else {
    console.log("❌ FAIL: Some effects were lost\n");
  }
}

// ============================================================================
// TEST 4: NESTED EFFECTS
// ============================================================================
console.log("TEST 4: NESTED EFFECTS");
console.log("Nested effects track dependencies correctly");
console.log("-".repeat(70));

{
  let outerRuns = 0,
    innerRuns = 0;
  let outerValue = 0,
    innerValue = 0;

  const [outer, setOuter] = createSignal(1);
  const [inner, setInner] = createSignal(2);

  let disposeInner = () => {};

  createEffect(() => {
    outerValue = outer();
    outerRuns++;

    // Dispose previous inner effect
    disposeInner();

    // Create new nested effect
    disposeInner = createEffect(() => {
      innerValue = inner();
      innerRuns++;
    });
  });

  outerRuns = innerRuns = 0;

  // Test 4a: Changing inner should only run inner effect
  console.log("\n  4a. Updating inner signal:");
  setInner(20);
  console.log(`      Outer runs: ${outerRuns}, Inner runs: ${innerRuns}`);
  const test4a = outerRuns === 0 && innerRuns === 1 && innerValue === 20;
  console.log(`      ${test4a ? "✅" : "❌"} Only inner effect should run`);

  outerRuns = innerRuns = 0;

  // Test 4b: Changing outer should run both
  console.log("\n  4b. Updating outer signal:");
  setOuter(10);
  console.log(`      Outer runs: ${outerRuns}, Inner runs: ${innerRuns}`);
  const test4b = outerRuns === 1 && innerRuns === 1 && outerValue === 10;
  console.log(`      ${test4b ? "✅" : "❌"} Both effects should run`);

  if (test4a && test4b) {
    console.log("\n✅ PASS: Nested effects work correctly\n");
  } else {
    console.log("\n❌ FAIL: Nested effects not working properly\n");
  }
}

// ============================================================================
// TEST 5: NESTED MEMOS
// ============================================================================
console.log("TEST 5: NESTED MEMOS");
console.log("Memos can depend on other memos");
console.log("-".repeat(70));

{
  let sumComputes = 0,
    doubledComputes = 0;
  let result = 0;

  const [a, setA] = createSignal(1);
  const [b, setB] = createSignal(2);

  const sum = createMemo(() => {
    sumComputes++;
    return a() + b();
  });

  const doubled = createMemo(() => {
    doubledComputes++;
    return sum() * 2;
  });

  createEffect(() => {
    result = doubled();
  });

  sumComputes = doubledComputes = 0;

  setA(5); // Should trigger: sum → doubled → effect

  console.log(`✓ Sum computed ${sumComputes} time(s)`);
  console.log(`✓ Doubled computed ${doubledComputes} time(s)`);
  console.log(`✓ Result: ${result}`);

  if (sumComputes > 0 && doubledComputes > 0 && result === 14) {
    console.log("✅ PASS: Nested memos computed correctly\n");
  } else {
    console.log(`❌ FAIL: Expected result=14, got ${result}\n`);
  }
}

// ============================================================================
// TEST 6: ALL BEHAVIORS TOGETHER
// ============================================================================
console.log("TEST 6: ALL BEHAVIORS COMBINED");
console.log("Deduplication + Cascading + Nesting together");
console.log("-".repeat(70));

{
  let effectRuns = 0;
  let cValue = 0;

  const [a, setA] = createSignal(1);
  const [b, setB] = createSignal(2);
  const [c, setC] = createSignal(3);

  const sum = createMemo(() => a() + b());

  createEffect(() => {
    const s = sum();
    effectRuns++;
    if (s === 30) {
      setC(100); // Cascading update
    }
  });

  createEffect(() => {
    cValue = c();
  });

  effectRuns = 0;

  // Update both a and b - should dedupe sum's effect
  batch(() => {
    setA(10); // sum=12, effect queued
    setB(20); // sum=30, effect re-queued (deduped!)
  });
  // Effect runs once, sees sum=30, triggers setC(100)

  console.log(`✓ Sum effect ran ${effectRuns} time(s)`);
  console.log(`✓ Final c value: ${cValue}`);

  if (effectRuns === 1 && cValue === 100) {
    console.log("✅ PASS: Deduplication and cascading work together\n");
  } else {
    console.log(
      `❌ FAIL: Expected runs=1, c=100, got runs=${effectRuns}, c=${cValue}\n`
    );
  }
}

// ============================================================================
// TEST 7: CLEANUP
// ============================================================================
console.log("TEST 7: CLEANUP");
console.log("Cleanup functions run on re-execution and disposal");
console.log("-".repeat(70));

{
  let cleanups = 0,
    runs = 0;
  const [count, setCount] = createSignal(0);

  const dispose = createEffect(() => {
    count();
    runs++;
    onCleanup(() => {
      cleanups++;
    });
  });

  runs = cleanups = 0;

  // Test 7a: Re-execution
  console.log("\n  7a. Re-running effect:");
  setCount(1);
  console.log(`      Runs: ${runs}, Cleanups: ${cleanups}`);
  const test7a = runs === 1 && cleanups === 1;
  console.log(
    `      ${test7a ? "✅" : "❌"} Cleanup should run before re-execution`
  );

  runs = cleanups = 0;

  // Test 7b: Disposal
  console.log("\n  7b. Disposing effect:");
  dispose();
  console.log(`      Runs: ${runs}, Cleanups: ${cleanups}`);
  const test7b = runs === 0 && cleanups === 1;
  console.log(`      ${test7b ? "✅" : "❌"} Cleanup should run on disposal`);

  runs = cleanups = 0;

  // Test 7c: After disposal
  console.log("\n  7c. After disposal:");
  setCount(2);
  console.log(`      Runs: ${runs}, Cleanups: ${cleanups}`);
  const test7c = runs === 0 && cleanups === 0;
  console.log(
    `      ${test7c ? "✅" : "❌"} Effect shouldn't run after disposal`
  );

  if (test7a && test7b && test7c) {
    console.log("\n✅ PASS: Cleanup works correctly\n");
  } else {
    console.log("\n❌ FAIL: Cleanup not working properly\n");
  }
}

console.log("=".repeat(70));
console.log("🎉 All tests completed!");
