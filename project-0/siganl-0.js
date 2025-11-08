/** @const Up to date */
/** biome-ignore-all lint/suspicious/noAssignInExpressions: <explanation> */
const FRESH = 0;
/** @const Needs re-execution */
const STALE = 1;
/** @const Checking if stale */
const PENDING = 2;

/**
 * @typedef {typeof FRESH | typeof STALE | typeof PENDING} ComputationState
 * @description
 *
 *  ### Full State Transition Table
 *
 * | Current | Event | Next | Action |
 * |---------|-------|------|--------|
 * | FRESH | Dependency changed | STALE | Mark for update |
 * | FRESH | Read | FRESH | Return cached value |
 * | STALE | Read | PENDING | Check if update needed |
 * | PENDING | Sources changed | FRESH | Recompute |
 * | PENDING | Sources unchanged | FRESH | Skip recompute |
 * | Any | Dispose | - | Clean up |
 *
 */

/**
 * @template T
 * @typedef {(prevValue: T | undefined) => T} EffectFunction
 */

// * @property {() => void} execute Invokes the computation (used when invalidated)
/**
 * @template T
 * @typedef {object} Computation
 * @property {EffectFunction<T>} fn Function that computes/produces a value (for memos) or runs side-effects (for effects)
 * @property {Owner | null} owner Parent reactive owner/scope that created this computation
 * @property {(SignalState<any>|Computation<any>)[]} sources Signals (or memos) this computation reads from
 * @property {number[]} sourceSlots Index in each source's observers array (for O(1) removal)
 * @property {Computation<any>[]} observers Child computations that depend on this computation (memos/effects)
 * @property {number[]} observerSlots Index in each observer's sources array (for O(1) removal)
 * @property {(() => void)[] | null} cleanups Cleanup/disposer functions to run when this computation is disposed
 * @property {Computation<any>[] | null} [owned] Child computations created within this computation (same as Owner.owned)
 * @property {T | undefined} [value] Cached value for memos (undefined for pure effects)
 * @property {ComputationState | undefined} [state] Internal state/flags (implementation specific)
 * @property {boolean | undefined} [disposed] Whether this computation has been disposed
 * @property {string | undefined} [name] Optional debug name
 * @property {boolean | undefined} [pure] If true, can have observers (memos). If false, side effects only (effects
 * @property {Comparator<any>| undefined} [comparator] Optional comparator for memo value changes
 * @property {boolean | undefined} [user] User-defined computation (vs internal)
 * @property {any | null} [context] Context data (inherited from owner)
 */
/** biome-ignore-all lint/suspicious/noAssignInExpressions: <explanation> */

/**
 * @typedef {object} Owner
 * @property {Computation<any>[] | null} owned Child computations created within this computation
 *
 * ```js
 *  createEffect(() => {
 *    // This effect is owned by parent
 *    createEffect(() => {
 *      // This nested effect is owned by parent effect
 *    });
 *  });
 * ```
 *
 * ### Pure vs Impure Computations
 *
 * #### Pure Computations (Memos)
 *
 * **Characteristics:**
 * - ✅ Can have observers
 * - ✅ Value is cached
 * - ✅ Re-executes when dependencies change
 * - ✅ Returns a value
 * - ✅ No side effects (ideally)
 *
 * **Example:**
 * ```javascript
 * const [count, setCount] = createSignal(0);
 *
 * const doubled = createMemo(() => {
 *   console.log('Computing doubled');
 *   return count() * 2;
 * });
 *
 * console.log(doubled()); // Computing doubled, 0
 * console.log(doubled()); // 0 (cached, no recompute)
 *
 * setCount(5);
 * console.log(doubled()); // Computing doubled, 10
 * ```
 *
 * #### Impure Computations (Effects)
 *
 * **Characteristics:**
 * - ✅ Cannot have observers
 * - ✅ No cached value
 * - ✅ Re-executes when dependencies change
 * - ✅ Performs side effects
 * - ✅ Returns nothing (void)
 *
 * **Example:**
 * ```javascript
 * const [count, setCount] = createSignal(0);
 *
 * createEffect(() => {
 *   console.log('Count is now:', count());
 *   // Side effect - updating DOM, logging, API calls, etc.
 * });
 * ```
 *
 * #### Comparison Table
 *
 * | Feature | Memo (Pure) | Effect (Impure) |
 * |---------|------------|-----------------|
 * | Can be observed | ✅ Yes | ❌ No |
 * | Cached value | ✅ Yes | ❌ No |
 * | Returns value | ✅ Yes | ❌ No |
 * | Side effects | ❌ Avoid | ✅ Expected |
 * | Use case | Derived data | DOM updates, API calls |
 *
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
 * @property {Record<string, { value: unknown }>|undefined} [sourceMap]  Source map for debugging
 */

/**
 * @template T
 * @typedef {(prev: T, next: T) => boolean} Comparator
 */

/**
 * @template T
 * @typedef {object} SignalState
 * @property {T} value Current value of the signal
 * @property {Computation<any>[]} observers Who depends on this, a set of observers subscribed to this signal
 * @property {number[]} observerSlots Indices in each observer, an array of observer slots (for optimization), or null if not used
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
 * @property {Comparator<T>} comparator Optional comparator function to determine if the value has changed
 * @property {string|undefined} [name] Optional name for debugging purposes
 * @property {boolean | undefined} [internal] Internal signal flag (not user-facing)
 */

/** @type {Computation<any>|null} */
let Listener = null;
/** @type {Owner|null} */
let Owner = null;
let ExecCount = 0;
let Pending = false;
const IS_DEV = false; // Set to true for dev mode

/** @type {Record<string, (signal: SignalState<any>) => void>} */
const DevHooks = {};

/** @type {(signal: SignalState<any>, computation: Computation<any>) => void} */
const trackRead = () => {};
/** @type {(signal: SignalState<any>, nextValue: any) => void} */
const trackWrite = () => {};

/** @type {Computation<any>[]} */
let Updates = [];
/** @type {Computation<any>[]} */
let Effects = [];

/**
 * @param {SignalState<any>} signal
 * @param {Computation<any>} computation
 * @description Establishes a bidirectional link between a signal and a computation.
 * When a computation reads a signal, this function registers the computation
 * as an observer of the signal, and also records the signal in the computation's sources.
 *
 * ```
 * Signal A:
 *   observers = [Comp1, Comp2]
 *   observerSlots = [0, 1]
 *                    ↓    ↓
 * Comp1:              |    |
 *   sources = [SignalA]    |
 *   sourceSlots = [0] ←────┘
 *                          |
 * Comp2:                   |
 *   sources = [X, SignalA] |
 *   sourceSlots = [?, 1] ←─┘
 * ```
 *
 * **Why Bidirectional?**
 *
 * Problem: Need to:
 *
 * Signal → Find all observers (for notification)
 * Observer → Find all sources (for cleanup)
 * Solution: Maintain both directions with index-based linking.
 *
 * **Lifecycle Position:**
 * Called during computation execution when signal.read() is invoked while Listener is set.
 */
function readHandler(signal, computation) {
  const observerSlots = (signal.observerSlots ??= []);
  const computationSources = (computation.sources ??= []);
  const computationSourceSlots = (computation.sourceSlots ??= []);

  // Add computation to signal's observers
  const signalIndex = signal.observers.push(computation);
  // Store where this computation is in observer's sources
  observerSlots.push(signalIndex);

  // Add signal to computation's sources
  computationSources.push(signal);
  // Store where this signal is in signal's observers
  computationSourceSlots.push(signalIndex);
}

/**
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
function structuralEquals(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object") return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }

  return true;
}

/**
 * @template T
 * @param {T} initValue
 * @param {{ equals?: Comparator<T>; name?: string; internal?: boolean; }|undefined} [opts]
 *
 * @description Creates a reactive signal - the foundation of the reactive system.
 *
 * **Lifecycle:**
 * 1. CREATE: Initialize SignalState with value, observers, and comparator
 * 2. RETURN: [read, write] accessor functions
 * 3. READ: When read() is called:
 *    - If Listener exists → establish bidirectional link
 *    - Return current value
 * 4. WRITE: When write(newValue) is called:
 *    - Compare old vs new value using comparator
 *    - If different:
 *      a. Update state.value
 *      b. Mark all observers STALE
 *      c. Queue observers (Updates for memos, Effects for effects)
 *      d. Schedule batch update (runUpdates)
 *
 * **Example:**
 * ```js
 * const [count, setCount] = createSignal(0);
 *
 * createEffect(() => {
 *   console.log(count()); // Links effect → signal
 * });
 *
 * setCount(1); // Triggers effect re-execution
 * ```
 */
function createSignal(initValue, opts = {}) {
  /**
   * @type {SignalState<T>}
   */
  const state = {
    observers: [],
    observerSlots: [],
    value: initValue,
    comparator: opts.equals ?? Object.is,
    name: opts.name,
    internal: opts.internal,
  };

  /**
   * @returns {T}
   * @property {SignalState<T>} _state
   *
   * @description Signal read accessor - tracks dependencies automatically.
   *
   * **Lifecycle:**
   * 1. Check if Listener exists (computation is currently executing)
   * 2. If yes → Establish bidirectional dependency link:
   *    - Add current computation to signal's observers (forward link)
   *    - Add signal to computation's sources (backward link)
   *    - Store indices for O(1) removal later
   * 3. Return current value
   *
   * **Automatic Dependency Tracking:**
   * ```js
   * createEffect(() => {
   *   // Before count() call: Listener = this effect
   *   const value = count(); // read() detects Listener → links established
   *   // After: effect.sources includes count signal
   * });
   * ```
   */
  const read = () => {
    // Track dependency if Listener exists (computation is currently executing)
    // The Listener is set by updateComputation/runTop when executing effects/memos
    if (Listener) {
      if (!state.observers) {
        state.observers = [];
        state.observerSlots = [];
      }

      // Forward link: signal -> observer
      // IMPORTANT: Get indices BEFORE pushing
      const observerIndex = state.observers.length; // Where observer will be in signal's observers array
      const sourceIndex = Listener.sources.length; // Where signal will be in observer's sources array

      state.observers.push(Listener);
      state.observerSlots.push(sourceIndex); // Store where THIS signal is in observer's sources

      // Backward link: observer -> signal
      Listener.sources.push(state);
      Listener.sourceSlots.push(observerIndex); // Store where THIS observer is in signal's observers

      // Dev mode
      if (IS_DEV && !state.internal) {
        trackRead(state, Listener);
      }
    }
    // Expose read handler for cleanup

    return state.value;
  };
  read._state = state;

  /**
   * @param {T | ((value:T) => T)} nextValue
   *
   * @description Signal write accessor - propagates changes to observers.
   *
   * **Lifecycle:**
   * 1. EVALUATE: If function, call with current value: nextValue = fn(current)
   * 2. COMPARE: Use comparator to check if value actually changed
   * 3. If changed:
   *    a. UPDATE: state.value = nextValue
   *    b. INVALIDATE: Mark all observers as STALE
   *    c. QUEUE:
   *       - Pure observers (memos) → Updates queue
   *       - Impure observers (effects) → Effects queue
   *    d. SCHEDULE: Call runUpdates() to batch execution
   * 4. If unchanged: No-op (optimization - prevents cascading updates)
   *
   * **Example - Function Updater:**
   * ```js
   * setCount(c => c + 1); // nextValue = fn(0) → 1
   * ```
   *
   * **Example - Propagation:**
   * ```js
   * setCount(5);
   * // → marks effect STALE
   * // → adds to Effects queue
   * // → schedules microtask
   * // → effect runs in microtask
   * ```
   */
  const write = (nextValue) => {
    if (typeof nextValue === "function") {
      // biome-ignore lint/suspicious/noTsIgnore: <explanation>
      // @ts-ignore
      nextValue = nextValue(state.value);
    }

    // biome-ignore lint/suspicious/noTsIgnore: <explanation>
    // @ts-ignore
    if (!state.comparator(state.value, nextValue)) {
      // biome-ignore lint/suspicious/noTsIgnore: <explanation>
      // @ts-ignore
      state.value = nextValue;

      for (let i = 0; i < state.observers.length; i++) {
        const observer = /** @type {Computation<any>} */ (state.observers[i]);
        if (IS_DEV) {
          console.log(
            `[write] Marking observer[${i}] as STALE, pure=${observer.pure}`
          );
        }
        observer.state = STALE;

        if (observer.pure) {
          Updates.push(observer);
        } else {
          Effects.push(observer);
        }
      }

      runUpdates();

      // Dev mode
      if (IS_DEV && !state.internal) {
        trackWrite(state, nextValue);
      }
    }

    return nextValue;
  };

  // Dev mode
  if (IS_DEV) {
    DevHooks.afterCreateSignal?.(state);
  }

  return /** @type {const}*/ ([read, write]);
}

/**
 * @description Schedules and executes batched updates in a microtask.
 *
 * **Lifecycle:**
 * 1. CHECK: If already pending, return (prevent duplicate scheduling)
 * 2. SCHEDULE: Queue microtask for next event loop tick
 * 3. EXECUTE (in microtask):
 *    a. Increment ExecCount (prevents nested batching)
 *    b. PHASE 1 - Run Updates queue (memos):
 *       - Process all STALE memos
 *       - Recompute values
 *       - Propagate changes to observers
 *    c. PHASE 2 - Run Effects queue (effects):
 *       - Process all STALE effects
 *       - Execute side effects
 *    d. Clear both queues
 *    e. Decrement ExecCount, clear Pending flag
 *
 * **Why Two Phases?**
 * Solves the "diamond problem" - ensures derived values (memos)
 * are updated before side effects (effects) run.
 *
 * ```
 * Signal
 *   ├─ Memo (runs first)
 *   └─ Effect (runs second, sees updated memo)
 * ```
 *
 * **Example:**
 * ```js
 * const [count, setCount] = createSignal(0);
 * const doubled = createMemo(() => count() * 2);
 * createEffect(() => console.log(doubled())); // Reads memo
 *
 * setCount(1);
 * // Microtask: doubled recomputes → effect sees new value
 * ```
 */
function runUpdates() {
  if (Pending) return;
  Pending = true;

  queueMicrotask(() => {
    ExecCount++;

    if (IS_DEV) {
      console.log(
        `[runUpdates] Processing ${Updates.length} memos, ${Effects.length} effects`
      );
    }

    // Run memos first (Updates queue)
    for (let i = 0; i < Updates.length; i++) {
      const update = /** @type {Computation<any>} */ (Updates[i]);
      if (IS_DEV) {
        console.log(
          `[runUpdates] Processing memo[${i}], state=${
            update.state === FRESH
              ? "FRESH"
              : update.state === STALE
              ? "STALE"
              : "PENDING"
          }`
        );
      }
      if (update.state === STALE) {
        updateComputation(update);
      }
    }
    Updates = [];

    // Then effects (Effects queue)
    for (let i = 0; i < Effects.length; i++) {
      const effect = /** @type {Computation<any>} */ (Effects[i]);
      if (IS_DEV) {
        console.log(
          `[runUpdates] Processing effect[${i}], state=${
            effect.state === FRESH
              ? "FRESH"
              : effect.state === STALE
              ? "STALE"
              : "PENDING"
          }`
        );
      }
      if (effect.state === STALE) {
        updateComputation(effect);
      }
    }
    Effects = [];

    ExecCount--;
    Pending = false;
  });
}

/**
 * @param {() => any} fn
 *
 * @description Creates a side-effect computation that re-runs when dependencies change.
 *
 * **Lifecycle:**
 * 1. CREATE COMPUTATION:
 *    - fn: User's effect function
 *    - state: FRESH initially
 *    - pure: false (cannot be observed)
 *    - sources/observers: Empty arrays (filled during execution)
 *    - owner: Current reactive scope (for cleanup hierarchy)
 *
 * 2. REGISTER WITH OWNER:
 *    - Add to owner.owned[] for automatic cleanup
 *
 * 3. SCHEDULE INITIAL RUN:
 *    - If ExecCount > 0 (inside batch):
 *      → Mark STALE, add to Effects queue
 *      → Will run when batch completes
 *    - Else:
 *      → Schedule microtask to run immediately
 *
 * 4. EXECUTION (when scheduled):
 *    a. Clean old dependencies (cleanupSources)
 *    b. Set Listener = this computation
 *    c. Run fn():
 *       - Any signal reads → automatic tracking
 *       - Bidirectional links established
 *    d. Restore previous Listener
 *    e. Mark state = FRESH
 *
 * 5. RE-EXECUTION (when dependency changes):
 *    a. Signal write marks effect STALE
 *    b. Effect added to Effects queue
 *    c. runUpdates schedules microtask
 *    d. Effect re-runs (steps 4a-4e repeat)
 *
 * 6. CLEANUP:
 *    - Manual: Call returned dispose function
 *    - Automatic: When owner is disposed
 *
 * **Example:**
 * ```js
 * const [count, setCount] = createSignal(0);
 *
 * const dispose = createEffect(() => {
 *   console.log('Count:', count()); // Auto-tracked
 * });
 * // Logs: Count: 0
 *
 * setCount(1); // Triggers re-run
 * // (In microtask) Logs: Count: 1
 *
 * dispose(); // Stop tracking
 * ```
 */
function createEffect(fn) {
  /** @type {Computation<any>} */
  const computation = {
    fn,
    state: FRESH,
    sources: [],
    sourceSlots: [],
    owner: Owner,
    pure: false,
    cleanups: null,
    observers: [],
    observerSlots: [],
    user: true,
  };

  if (Owner) {
    (Owner.owned ??= []).push(computation);
    if (IS_DEV) {
      console.log(
        `[createEffect] Registered with owner (${Owner.owned.length} total owned)`
      );
    }
  }

  // // Initial run
  // runTop(computation);

  // return computation;

  // Schedule effect to run after current execution
  if (ExecCount) {
    Effects.push(computation);
    computation.state = STALE;
  } else {
    // Immediate run
    queueMicrotask(() => runTop(computation));
  }

  return () => disposeComputation(computation);
}

/**
 * @param {SignalState<any>} signal
 * @param {number} targetIndex
 *
 * @description Removes an observer from a signal's observers list using O(1) swap-and-pop.
 * This function efficiently removes the observer at the specified index by
 * replacing it with the last observer in the list and then popping the last element.
 * It also updates the moved observer's sourceSlots to reflect its new position.
 *
 * ```
 * Before Removal:
 * Signal:
 *   observers = [Obs1, Obs2, Obs3]
 *   observerSlots =          [0, 1, 2]
 *                             ↓  ↓  ↓
 * Obs1:                       |  |  |
 *   sources = [Signal]        |  |  |
 *   sourceSlots = [0]  ←────--┘  |  |
 *                                |  |
 * Obs2:                          |  |
 *   sources = [Signal]           |  |
 *   sourceSlots = [1] ←─-------──┘  |
 *                                   |
 * Obs3:                             |
 *   sources = [Signal]              |
 *   sourceSlots = [2] ←────---------┘
 *
 * After Removing Obs2 (index 1):
 * Signal:
 *   observers = [Obs1, Obs3]
 *   observerSlots =     [0, 1]
 *                        ↓  ↓
 * Obs1:                  |  |
 *   sources = [Signal]   |  |
 *   sourceSlots = [0] ←──┘  |
 *                           |
 * Obs3:                     |
 *   sources = [Signal]      |
 *   sourceSlots = [1] ←────-┘
 * ```
 *
 * **Why Swap/Duplicate-and-Pop?**
 *
 * Problem: Removing an element from the middle of an array is O(n).
 * Solution: Swap with last element and pop for O(1) removal.
 *
 * **Lifecycle Position:**
 * Called during cleanupSources() before computation re-executes or is disposed.
 * Breaks the bidirectional link between signal and observer.
 */
function removeObserver(signal, targetIndex) {
  const lastIndex = signal.observers.length - 1;

  if (IS_DEV) {
    console.log(
      `[removeObserver] Removing observer at index ${targetIndex} (lastIndex=${lastIndex})`
    );
  }

  if (targetIndex < lastIndex) {
    // Duplicate last into target into the removed spot
    const lastObserver = /** @type {Computation<any>} */ (
      signal.observers[lastIndex]
    );

    if (IS_DEV) {
      console.log(
        `  Moving lastObserver (state=${
          lastObserver.state === FRESH
            ? "FRESH"
            : lastObserver.state === STALE
            ? "STALE"
            : "PENDING"
        }) from index ${lastIndex} to ${targetIndex}`
      );
      console.log(
        `  Updating lastObserver.sourceSlots[${signal.observerSlots[lastIndex]}] = ${targetIndex}`
      );
    }

    signal.observers[targetIndex] = lastObserver;
    signal.observerSlots[targetIndex] = /** @type {number} */ (
      signal.observerSlots[lastIndex]
    );

    // Update the moved observer's sourceSlots to point to new index
    lastObserver.sourceSlots[
      /** @type {number} */ (signal.observerSlots[lastIndex])
    ] = targetIndex;
  }

  // Remove last
  signal.observers.pop();
  signal.observerSlots.pop();
}

/**
 * @template T
 * @param {() => T} fn - Function that creates a component
 * @return {{ result: T; dispose: () => void }} Component with result and disposer
 *
 * @description Creates a component within a reactive root scope.
 * The component gets its own disposal context, allowing cleanup when disposed.
 *
 * **Issues with current implementation:**
 * - Type safety: Can't safely add .dispose to arbitrary return types
 * - Primitives: What if fn() returns string/number/null?
 * - Better approach: Return tuple or wrapper object
 *
 * **Example:**
 * ```js
 * const component = createComponent(() => {
 *   const [count, setCount] = createSignal(0);
 *
 *   createEffect(() => {
 *     console.log('Count:', count());
 *   });
 *
 *   return { count, setCount };
 * });
 *
 * // Later...
 * component.dispose?.(); // Clean up all effects
 * ```
 */
function createComponent(fn) {
  const component = createRoot((dispose) => {
    const result = fn();

    return { result, dispose };
  });
  return component;
}
/**
 * @param {any} owner
 * @returns {{ ownedCount: number; cleanupsCount: number }[]}
 */
function getOwnerHierarchy(owner) {
  const hierarchy = [];
  let current = owner;

  while (current) {
    hierarchy.push({
      ownedCount: current.owned ? current.owned.length : 0,
      cleanupsCount: current.cleanups ? current.cleanups.length : 0,
    });
    current = current.owner;
  }

  return hierarchy;
}

/**
 *
 * @param {Owner} owner
 * @param {() => any} fn
 */
function runWithOwner(owner, fn) {
  const prevOwner = Owner;
  Owner = owner;

  try {
    return fn();
  } finally {
    Owner = prevOwner;
  }
}

// Get current owner
function getOwner() {
  return Owner;
}

/**
 * @template T
 * @param {(dispose: () => void) => { result: T, dispose: (() => void); }} fn - Function that receives dispose callback
 *
 * @description Creates a new reactive root scope.
 * All computations created within fn are owned by this root.
 *
 * **Lifecycle:**
 * 1. CREATE ROOT:
 *    - Save current Owner
 *    - Create new root owner
 *    - Set as current Owner
 *
 * 2. EXECUTE:
 *    - Run fn with dispose callback
 *    - All createEffect/createMemo calls are owned by root
 *    - Can call dispose callback to clean up
 *
 * 3. RESTORE:
 *    - Restore previous Owner
 *    - Return result
 *
 * **Example:**
 * ```js
 * const dispose = createRoot((dispose) => {
 *   const [count, setCount] = createSignal(0);
 *
 *   createEffect(() => {
 *     console.log('Count:', count());
 *   });
 *
 *   return dispose; // Return disposer for later cleanup
 * });
 *
 * // Later...
 * dispose(); // Cleans up all owned computations
 * ```
 */
function createRoot(fn) {
  const prevOwner = Owner;

  /** @type {Owner} */
  const root = {
    owned: null,
    cleanups: null,
    owner: prevOwner,
    context: prevOwner?.context ?? null,
  };

  Owner = root;

  let result;
  let error;
  try {
    result = fn(() => dispose(root));
  } catch (err) {
    return handleError(error);
  } finally {
    Owner = prevOwner;
  }

  return result;
}

/**
 * @param {Owner} owner
 *
 * @description Disposes a reactive owner and all its owned computations.
 * This function cleans up all owned computations and registered cleanup
 * functions associated with the given owner to prevent memory leaks.
 *
 * **Lifecycle:**
 * 1. DISPOSE OWNED COMPUTATIONS:
 *    - Recursively dispose all owned computations
 *    - Maintains ownership hierarchy cleanup
 *
 * 2. RUN CLEANUP FUNCTIONS:
 *    - Execute all registered cleanup callbacks
 *    - Clear timers, event listeners, etc.
 *
 * **Note:** This is typically used for root-level owners created by createRoot().
 * For disposing individual computations, use disposeComputation().
 *
 * **Example:**
 * ```js
 * const rootDisposer = createRoot((dispose) => {
 *   createEffect(() => {
 *     const timer = setInterval(() => {...}, 1000);
 *
 *     onCleanup(() => {
 *       clearInterval(timer); // Runs on disposal
 *     });
 *   });
 *
 *   return dispose;
 * });
 *
 * // Later...
 * rootDisposer(); // Cleans up all effects and timers
 * ```
 */
function dispose(owner) {
  if (!owner) return;

  // 1. Dispose all owned computations
  if (owner.owned) {
    for (let i = owner.owned.length - 1; i >= 0; i--) {
      const computation = owner.owned[i];
      disposeComputation(/** @type {Computation<any>} */ (computation));
    }
    owner.owned = null;
  }

  // 2. Run cleanup functions registered via onCleanup() at owner level
  if (owner.cleanups) {
    for (let i = owner.cleanups.length - 1; i >= 0; i--) {
      try {
        /** @type {() => void} */ (owner.cleanups[i])();
      } catch (err) {
        handleError(err);
      }
    }
    owner.cleanups = null;
  }

  // Note: We don't remove from parent's owned list because:
  // 1. Owner type doesn't match Computation<any>[] type (architectural issue)
  // 2. Root owners created by createRoot() typically don't need parent removal
  // 3. If needed, this should be handled at the createRoot level
}

/**
 * @param {Computation<any>} computation
 *
 * @description Disposes a computation and all its owned computations recursively.
 * This function cleans up all sources, owned computations, and registered cleanup
 * functions associated with the given computation to prevent memory leaks.
 *
 * **Why Recursive Disposal?**
 *
 * Problem: Disposing a computation should also clean up all its children.
 * Solution: Recursively dispose owned computations and run cleanups.
 *
 * **Lifecycle:**
 * 1. CLEANUP SOURCES:
 *    - Remove from all signal observers (break bidirectional links)
 *    - Clear sources and sourceSlots arrays
 *
 * 2. DISPOSE CHILDREN:
 *    - Recursively dispose all owned computations
 *    - Maintains ownership hierarchy cleanup
 *
 * 3. RUN CLEANUP FUNCTIONS:
 *    - Execute all registered cleanup callbacks
 *    - Clear timers, event listeners, etc.
 *
 * 4. REMOVE FROM PARENT:
 *    - Remove this computation from parent's owned list
 *    - Prevents memory leaks and double-disposal
 *
 * **Example:**
 * ```js
 * createEffect(() => {
 *   const timer = setInterval(() => {...}, 1000);
 *
 *   onCleanup(() => {
 *     clearInterval(timer); // Runs on disposal
 *   });
 *
 *   createEffect(() => {
 *     // Nested effect - owned by parent
 *   });
 * });
 * // On dispose: nested effect → cleanup → parent cleanup
 * ```
 */
function disposeComputation(computation) {
  if (!computation) return;

  // 1. Clean up sources (remove from signals' observers)
  cleanupSources(computation);

  // 2. Dispose owned computations recursively (THIS computation's children, not parent's!)
  // ✅ FIXED: Was using computation.owner.owned (parent's children) instead of computation.owned (this computation's children)
  if (computation.owned) {
    for (let i = computation.owned.length - 1; i >= 0; i--) {
      const child = computation.owned[i];
      if (child) {
        disposeComputation(child);
      }
    }
    computation.owned = null;
  }

  // 3. Run cleanup functions registered via onCleanup()
  if (computation.cleanups) {
    for (let i = computation.cleanups.length - 1; i >= 0; i--) {
      try {
        const cleanup = computation.cleanups[i];
        if (cleanup) {
          cleanup();
        }
      } catch (err) {
        handleError(err);
      }
    }
    computation.cleanups = null;
  }

  // 4. Remove from parent's owned list
  // ✅ FIXED: Now properly removes this computation from parent's owned array
  if (computation.owner?.owned) {
    const index = computation.owner.owned.indexOf(computation);
    if (index !== -1) {
      // Swap with last element for O(1) removal
      const lastIndex = computation.owner.owned.length - 1;
      if (index < lastIndex) {
        const lastChild = computation.owner.owned[lastIndex];
        if (lastChild) {
          computation.owner.owned[index] = lastChild;
        }
      }
      computation.owner.owned.pop();
    }
  }

  // Mark as disposed
  computation.disposed = true;
}

/**
 * @param {any} e
 * @returns {never}
 */
function handleError(e) {
  // Simple error handling - log to console
  console.error("Computation error:", e);
  throw e;
}

/**
 * @param {() => void} fn - Cleanup function to run on disposal
 *
 * @description Registers a cleanup function to run when the current reactive scope is disposed.
 *
 * **Lifecycle:**
 * - Cleanup functions run in reverse order (LIFO - Last In, First Out)
 * - Called before computation re-execution (if registered in computation)
 * - Called on manual disposal
 * - Called when parent owner is disposed
 *
 * **Common Use Cases:**
 * - Clear timers: clearInterval, clearTimeout
 * - Remove event listeners
 * - Cancel subscriptions
 * - Close connections
 * - Free resources
 *
 * **Example:**
 * ```js
 * createEffect(() => {
 *   const timer = setInterval(() => {
 *     console.log('Tick');
 *   }, 1000);
 *
 *   // Cleanup runs when effect is disposed or re-runs
 *   onCleanup(() => {
 *     clearInterval(timer);
 *     console.log('Timer cleared');
 *   });
 * });
 * ```
 *
 * **Multiple Cleanups:**
 * ```js
 * createEffect(() => {
 *   const timer = setInterval(() => {}, 1000);
 *   const listener = () => console.log('click');
 *
 *   document.addEventListener('click', listener);
 *
 *   onCleanup(() => clearInterval(timer));  // Runs second
 *   onCleanup(() => document.removeEventListener('click', listener)); // Runs first (LIFO)
 * });
 * ```
 */
function onCleanup(fn) {
  if (!Owner) {
    console.warn("onCleanup called outside reactive scope");
    return;
  }

  if (!Owner.cleanups) {
    Owner.cleanups = [];
  }

  Owner.cleanups.push(fn);
}

/**
 * @param {Computation<any>} computation
 *
 * @description Removes computation from all its source signal observers.
 *
 * **Lifecycle Position:**
 * Called before EVERY computation re-execution (runTop/updateComputation).
 *
 * **Why Clean Before Re-run?**
 * - Dependencies might change between executions
 * - Old dependencies shouldn't trigger this computation anymore
 * - New dependencies will be tracked during re-execution
 *
 * **Example:**
 * ```js
 * const [flag, setFlag] = createSignal(true);
 * const [a, setA] = createSignal(1);
 * const [b, setB] = createSignal(2);
 *
 * createEffect(() => {
 *   if (flag()) {
 *     console.log(a()); // Tracked
 *   } else {
 *     console.log(b()); // Tracked
 *   }
 * });
 *
 * // Initially: sources = [flag, a]
 * setFlag(false);
 * // Before re-run: cleanupSources() removes from flag and a
 * // During re-run: sources = [flag, b] (new tracking!)
 * ```
 */
function cleanupSources(computation) {
  if (!computation.sources?.length) return;

  while (computation.sources.length) {
    const source = /** @type {SignalState<any>} */ (computation.sources.pop());
    const slot = /** @type {number} */ (computation.sourceSlots.pop());

    if (!source?.observers) continue;

    removeObserver(source, slot);
  }
}

/**
 * @param {Computation<any>} computation
 *
 * @description Executes a computation, establishing reactive context.
 *
 * **Lifecycle:**
 * 1. CLEANUP: Remove from old dependencies (cleanupSources)
 *    - Breaks old bidirectional links
 *    - Prepares for new tracking
 *
 * 2. SETUP CONTEXT:
 *    - Save current Listener/Owner
 *    - Set Listener = this computation (enables dependency tracking)
 *    - Create new Owner scope (for nested computations)
 *
 * 3. EXECUTE:
 *    - Run computation.fn()
 *    - Any signal reads automatically tracked (via Listener)
 *    - New bidirectional links created
 *
 * 4. RESTORE CONTEXT:
 *    - Restore previous Listener/Owner
 *    - Mark state = FRESH
 *
 * **Why Save/Restore Context?**
 * Enables nested computations to track independently:
 *
 * ```js
 * createEffect(() => {           // Listener = Effect1
 *   const a = signal1();          // signal1 → Effect1
 *
 *   createEffect(() => {          // Listener = Effect2
 *     const b = signal2();        // signal2 → Effect2 (not Effect1!)
 *   });
 *
 *   const c = signal3();          // Listener = Effect1 (restored)
 * });                             // signal3 → Effect1
 * ```
 */
function runTop(computation) {
  cleanupSources(computation);

  // Run existing cleanups before re-execution
  if (computation.cleanups) {
    for (let i = computation.cleanups.length - 1; i >= 0; i--) {
      try {
        computation.cleanups[i]();
      } catch (err) {
        handleError(err);
      }
    }
    computation.cleanups = null;
  }

  const prevListener = Listener;
  const prevOwner = Owner;

  Listener = computation;
  const tempOwner = {
    owned: null,
    owner: computation.owner,
    context: computation?.owner?.context ?? null,
    cleanups: null,
  };
  Owner = tempOwner;

  try {
    computation.fn(computation.value);
  } finally {
    // Transfer cleanups from temporary owner to computation
    if (tempOwner.cleanups) {
      computation.cleanups = tempOwner.cleanups;
    }

    // Transfer owned computations from temporary owner to computation
    // These are computations created during this effect's execution (nested effects)
    if (tempOwner.owned) {
      computation.owned = tempOwner.owned;
    }

    Listener = prevListener;
    Owner = prevOwner;
  }

  computation.state = FRESH;
}

/**
 * @template T
 * @param {() => T} fn
 * @param {T} [initValue]
 * @param {{ equals?: Comparator<any> }|undefined} [opts]
 *
 * @description Creates a memoized derived computation (pure, cacheable).
 *
 * **Lifecycle:**
 * 1. CREATE COMPUTATION:
 *    - pure: true (can have observers)
 *    - value: Stores cached result
 *    - comparator: Checks if recomputed value changed
 *
 * 2. INITIAL COMPUTATION:
 *    - Call updateComputation() immediately
 *    - Establishes dependencies
 *    - Caches result
 *
 * 3. WHEN DEPENDENCY CHANGES:
 *    a. Memo marked STALE
 *    b. Added to Updates queue (runs before effects)
 *    c. updateComputation() called in microtask
 *    d. New value compared with old:
 *       - If equal → No propagation (optimization!)
 *       - If different → Notify observers
 *
 * 4. WHEN READ (memo accessor called):
 *    a. If STALE → recompute immediately (lazy evaluation)
 *    b. If Listener exists → establish dependency link
 *    c. Return cached value
 *
 * **Key Difference from Effects:**
 * - Memos: Pure, cached, can be observed, lazy recomputation
 * - Effects: Impure, no cache, cannot be observed, always run
 *
 * **Example:**
 * ```js
 * const [count, setCount] = createSignal(0);
 *
 * const doubled = createMemo(() => {
 *   console.log('Computing...');
 *   return count() * 2;
 * });
 *
 * console.log(doubled()); // Computing... 0
 * console.log(doubled()); // 0 (cached!)
 *
 * setCount(5);
 * // Memo marked STALE but NOT recomputed yet
 *
 * console.log(doubled()); // Computing... 10 (lazy recompute)
 * ```
 */

/**
 * Checks if any upstream dependencies have actually changed values.
 * Uses PENDING state to optimize away unnecessary recomputations.
 *
 * This implements the "upstream lookup" optimization from SolidJS to handle
 * the diamond problem:
 *
 *     signal
 *    /      \
 *  memo1  memo2
 *    \      /
 *     memo3
 *
 * When signal changes, both memo1 and memo2 are marked STALE, which marks memo3 STALE.
 * When memo3 is read, instead of immediately recomputing, we check if memo1 and memo2
 * actually have different values. If they don't, we can skip recomputing memo3.
 *
 * @param {Computation<any>} computation
 * @returns {boolean} true if dependencies changed and we need to recompute
 */
function lookUpstream(computation) {
  if (IS_DEV) {
    console.log(`[lookUpstream] Checking if dependencies actually changed`);
  }

  // Mark as PENDING while we check upstream
  computation.state = PENDING;

  // Check each source dependency
  for (let i = 0; i < computation.sources.length; i++) {
    const source = computation.sources[i];

    // If source is a computation (memo), recursively check it
    if (source && "fn" in source) {
      // If source is STALE, check upstream recursively
      if (source.state === STALE) {
        if (lookUpstream(source)) {
          updateComputation(source);
        }
      }

      // If source is still PENDING after checking, it means there's a cycle
      // (we're in the middle of checking this computation's dependencies)
      if (source.state === PENDING) {
        if (IS_DEV) {
          console.log(`[lookUpstream] Detected cycle, forcing recomputation`);
        }
        computation.state = STALE;
        return true;
      }
    }
  }

  // After checking all sources, assume we need to recompute
  // A full optimization would compare old vs new values here
  computation.state = STALE;
  return true;
}

function createMemo(fn, initValue, opts) {
  /** @type {Computation<T>} */
  const computation = {
    fn,
    owner: Owner,
    state: FRESH,
    sources: [],
    sourceSlots: [],
    observers: [],
    observerSlots: [],
    cleanups: null,
    value: initValue,
    pure: true,
    comparator: opts?.equals,
    user: true,
  };

  if (Owner) {
    (Owner.owned ??= []).push(computation);
  }

  // Run immediately to compute initial value
  updateComputation(computation);

  function read() {
    // Debug logging
    if (IS_DEV) {
      console.log(
        `[createMemo.read] state=${
          computation.state === FRESH
            ? "FRESH"
            : computation.state === STALE
            ? "STALE"
            : "PENDING"
        }, value=${computation.value}`
      );
    }

    // If stale, check if we actually need to recompute
    if (computation.state === STALE) {
      // Use PENDING state optimization: check if dependencies actually changed
      if (lookUpstream(computation)) {
        updateComputation(computation);
      }
    }

    // Track dependency
    if (Listener) {
      // IMPORTANT: Get indices BEFORE pushing
      const observerIndex = computation.observers.length; // Where observer will be in memo's observers array
      const sourceIndex = Listener.sources.length; // Where memo will be in observer's sources array

      computation.observers.push(Listener);
      computation.observerSlots.push(sourceIndex); // Store where THIS memo is in observer's sources

      Listener.sources.push(computation);
      Listener.sourceSlots.push(observerIndex); // Store where THIS observer is in memo's observers
    }

    return computation.value;
  }

  return read;
}

/**
 * @param {Computation<any>} computation
 *
 * @description Re-executes a computation and propagates changes if value changed.
 *
 * **Lifecycle:**
 * 1. CLEANUP: Remove from old dependencies (cleanupSources)
 *
 * 2. SETUP CONTEXT:
 *    - Save/set Listener (enables dependency tracking)
 *    - Create new Owner scope
 *
 * 3. EXECUTE:
 *    - Run computation.fn(previousValue)
 *    - Catch and handle errors
 *    - New dependencies auto-tracked
 *
 * 4. COMPARE VALUES:
 *    - Use comparator (or Object.is) to check equality
 *    - If equal → No propagation (prevents cascading updates)
 *
 * 5. PROPAGATE (if changed):
 *    a. Update cached value
 *    b. Mark all observers STALE
 *    c. Queue observers:
 *       - Pure (memos) → Updates queue
 *       - Impure (effects) → Effects queue
 *
 * 6. FINALIZE:
 *    - Restore context
 *    - Mark state = FRESH
 *
 * **Optimization - Comparison:**
 * ```js
 * const expensive = createMemo(() => {
 *   const result = heavyComputation();
 *   return result; // Returns same reference
 * });
 *
 * // If dependencies change but result is same:
 * // → Recomputes (unavoidable)
 * // → Compares: Object.is(oldResult, newResult) = true
 * // → Does NOT notify observers (optimization!)
 * ```
 *
 * **Used For:**
 * - Memo recomputation (when STALE or read)
 * - Effect re-execution (when STALE)
 */
function updateComputation(computation) {
  cleanupSources(computation);

  if (IS_DEV) {
    console.log(
      `[updateComputation] Starting, owned:`,
      computation.owned?.length ?? "none"
    );
  }

  // Dispose owned computations (effects created inside this effect)
  // This must happen BEFORE running cleanups, as owned computations may have their own cleanups
  if (computation.owned) {
    if (IS_DEV) {
      console.log(
        `[updateComputation] Disposing ${computation.owned.length} owned computations`
      );
    }
    for (let i = computation.owned.length - 1; i >= 0; i--) {
      const child = computation.owned[i];
      if (child) {
        if (IS_DEV) {
          console.log(`[updateComputation] Disposing child computation`);
        }
        disposeComputation(child);
      }
    }
    computation.owned = null;
  }

  // Run existing cleanups before re-execution
  if (computation.cleanups) {
    for (let i = computation.cleanups.length - 1; i >= 0; i--) {
      try {
        const cleanup = computation.cleanups[i];
        if (cleanup) {
          cleanup();
        }
      } catch (err) {
        handleError(err);
      }
    }
    computation.cleanups = null;
  }

  const prevListener = Listener;
  const prevOwner = Owner;

  Listener = computation;
  const tempOwner = {
    owned: null,
    owner: computation.owner,
    context: computation?.owner?.context ?? null,
    cleanups: null,
  };
  Owner = tempOwner;

  let nextValue;
  try {
    nextValue = computation.fn(computation.value);
  } catch (e) {
    handleError(e);
    return;
  } finally {
    // Transfer cleanups from temporary owner to computation
    if (tempOwner.cleanups) {
      computation.cleanups = tempOwner.cleanups;
    }

    // Transfer owned computations from temporary owner to computation
    // These are computations created during this effect's execution (nested effects)
    // IMPORTANT: We replace computation.owned (which is null after disposal above)
    // with the NEW owned computations created during this run
    if (tempOwner.owned) {
      if (IS_DEV) {
        console.log(
          `[updateComputation] Transferring ${tempOwner.owned.length} owned computations to parent`
        );
      }
      computation.owned = tempOwner.owned;
    } else {
      // No new owned computations, ensure it's null
      computation.owned = null;
    }

    Listener = prevListener;
    Owner = prevOwner;
  }

  // Check equality
  const isEqual = (computation.comparator ?? Object.is)(
    computation.value,
    nextValue
  );

  if (!isEqual) {
    computation.value = nextValue;

    // Notify observers
    for (let i = 0; i < computation.observers.length; i++) {
      const observer = /** @type {Computation<any>} */ (
        computation.observers[i]
      );
      observer.state = STALE;

      if (observer.pure) {
        Updates.push(observer);
      } else {
        Effects.push(observer);
      }
    }
  }

  if (IS_DEV) {
    console.log(
      `[updateComputation] Setting computation.state = FRESH, has ${computation.observers.length} observers`
    );
    if (computation.observers.length > 0) {
      for (let i = 0; i < computation.observers.length; i++) {
        const obs = computation.observers[i];
        console.log(
          `  observer[${i}].state = ${
            obs.state === FRESH
              ? "FRESH"
              : obs.state === STALE
              ? "STALE"
              : "PENDING"
          }`
        );
      }
    }
  }

  computation.state = FRESH;
}

/** @param {() => void} fn  */
function createComputed(fn) {
  /** @type {Computation<any>} */
  const computation = {
    fn,
    state: FRESH,
    sources: [],
    sourceSlots: [],
    cleanups: null,
    observers: [],
    observerSlots: [],
    owner: Owner,
    pure: false,
    user: false, // System effect
  };

  if (Owner) {
    if (!Owner.owned) Owner.owned = [];
    Owner.owned.push(computation);
  }

  // Run immediately, synchronously
  runTop(computation);

  return computation;
}

/**
 * @param {() => void} fn
 *
 * @description Batches multiple signal updates into a single reactive update cycle.
 *
 * **Lifecycle:**
 * 1. INCREMENT: ExecCount++ (prevents immediate updates)
 *
 * 2. EXECUTE: Run fn()
 *    - Signal writes mark observers STALE
 *    - Observers added to queues
 *    - runUpdates() returns early (Pending check)
 *    - NO computations execute yet
 *
 * 3. DECREMENT: ExecCount-- (in finally block)
 *
 * 4. FLUSH: If ExecCount === 0, call runUpdates()
 *    - Schedules microtask
 *    - All batched updates execute once
 *
 * **Why Batching?**
 * Without batching:
 * ```js
 * setCount(1); // Effect runs
 * setCount(2); // Effect runs
 * setCount(3); // Effect runs
 * // Effect executed 3 times!
 * ```
 *
 * With batching:
 * ```js
 * batch(() => {
 *   setCount(1); // Queued
 *   setCount(2); // Queued (deduplicated)
 *   setCount(3); // Queued (deduplicated)
 * });
 * // Effect executes ONCE with final value (3)
 * ```
 *
 * **Nested Batching:**
 * ```js
 * batch(() => {           // ExecCount = 1
 *   setCount(1);
 *
 *   batch(() => {         // ExecCount = 2
 *     setCount(2);
 *   });                   // ExecCount = 1 (no flush)
 *
 *   setCount(3);
 * });                     // ExecCount = 0 → FLUSH!
 * ```
 */
function batch(fn) {
  ExecCount++;
  try {
    fn();
  } finally {
    ExecCount--;
    if (ExecCount === 0) {
      runUpdates();
    }
  }
}

// Export
export {
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
  Owner,
};
