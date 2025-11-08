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
 * @property {Computation<any>[]} observers Who depends on this, a set of observers subscribed to this signal
 * @property {number[] | null} observerSlots Indices in each observer, an array of observer slots (for optimization), or null if not used
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
 * @property {boolean} [internal] Internal signal flag (not user-facing)
 */

/**
 * Global tracking context
 * @type {Effect[]}
 */
let listeners = [];
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

/** @param {() => any} fn */
function untrack(fn) {
  const prevListeners = listeners;
  listeners = [];
  try {
    return fn();
  } finally {
    listeners = prevListeners;
  }
}

// ============================================================================
// TESTS FOR THE CORE BEHAVIORS
// ============================================================================
