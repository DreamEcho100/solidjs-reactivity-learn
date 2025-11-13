/** biome-ignore-all lint/suspicious/noAssignInExpressions: <explanation> */
import type { Memo, MemoOptions, SignalState } from "./reactive-types.ts";
import { FRESH, IS_DEV, PENDING, STALE, UNOWNED_OWNER } from "./constants.ts";
import type {
  Owner,
  Computation,
  EffectFunction,
  ComputationState,
  EffectOptions,
} from "./reactive-types.ts";

/*
 * ```
 * Why Two Globals:
 *
 * createEffect(() => {
 *   // Owner = this effect
 *   // Listener = this effect
 *
 *   const value = untrack(() => signal());
 *   // Owner = still this effect (can create children)
 *   // Listener = null (won't subscribe to signal)
 * });
 * ```
 */

/**
 * Currently executing owner (reactive scope)
 * When you create a computation, it becomes owned by this Owner
 */
export let CURRENT_OWNER: Owner | null = null;
/**
 * Currently executing computation (for dependency tracking)
 * When you read a signal, it subscribes this Listener
 */
export let CURRENT_LISTENER: Computation<any, any> | null = null;
/**
 * Multiple queues for different priorities
 *
 * **Process in order:**
 *
 * 1. Updates (memos) first - compute derived values
 * 2. Effects second - run side effects with stable values
 *
 * **Execution Flow:**
 *
 * ```
 * Signal Change
 *      ↓
 * Add to Updates queue (if computation.pure)
 * Add to Effects queue (if !computation.pure)
 *      ↓
 * Flush Updates
 *      ↓
 * [Memo1, Memo2, Memo3] ← All memos compute
 *      ↓
 * Flush Effects
 *      ↓
 * [Effect1, Effect2] ← Run with stable memo values
 * ```
 *
 * **Why This Matters:**
 *
 * **Correctness:** Effects see consistent derived state
 * **Predictability:** Memos always update before effects
 * **Performance:** Batch similar work together
 */
/** Pure computations (memos) */
export let Updates: Computation<any>[] | null = null;
/** Side effects */
export let Effects: Computation<any>[] | null = null;
// const Transition: TransitionState;
// const Scheduler: Function;

let ExecCount = 0;
const defaultComparator = Object.is;

/**
 * ================================================
 *               Ownership Model
 * ================================================
 */

function untrack<T>(fn: () => T) {
  const prevListener = CURRENT_LISTENER;
  CURRENT_LISTENER = null;
  try {
    return fn();
  } finally {
    CURRENT_LISTENER = prevListener;
  }
}

/**
 * Creates a root-level reactive scope
 * All computations created inside will be owned by this root
 */
export function createRoot<T>(
  fn: (dispose: () => void) => T,
  detachedOwner?: Owner
) {
  /** Save previous context */
  const prevListener = CURRENT_LISTENER;
  const prevOwner = CURRENT_OWNER;

  /**
   * Determine if root should have a dispose function
   * We can do this by checking if the function is named or not, because anonymous
   * functions have an empty string as their name.
   *
   * @example
   *
   * ```js
   * // Anonymous function (unowned)
   * createRoot(() => {
   *   // ...
   * });
   * ```
   *
   * ```js
   * // Named function (owned)
   * createRoot(function myRoot(dispose) {
   *   // ...
   * });
   *
   * // Or
   *
   * function myRoot(dispose) {
   *   // ...
   * }
   * createRoot(myRoot);
   * ```
   */
  const unowned = fn.name.length === 0;

  /** Get parent owner (if detached, use that; otherwise current) */
  const parentOwner = detachedOwner ?? prevOwner;

  /** Create the root owner */
  const rootOwner: Owner = unowned
    ? UNOWNED_OWNER /** No dispose function needed  */
    : {
        owned: null,
        cleanups: null,
        /** Inherit context from parent */
        context: parentOwner?.context ?? null,
        /** Parent owner */
        owner: parentOwner,
      };

  // Set up the function to call
  const updateFn = unowned
    ? fn // Call directly (no dispose parameter)
    : () =>
        fn(() => {
          // Dispose function cleans up the entire root
          untrack(() => cleanNode(rootOwner));
        });

  // Set root as current owner
  CURRENT_OWNER = rootOwner;
  // Roots don't subscribe to signals
  CURRENT_LISTENER = null;
  try {
    return (updateFn as () => T)();
  } catch (error) {
    // handleError(error)
  } finally {
    // Restore previous context
    CURRENT_OWNER = prevOwner;
    CURRENT_LISTENER = prevListener;
  }
}

function handleError(error: any): void {
  if (IS_DEV) {
    console.error("Reactive error:", error);
  }
}

/**
 * Creates a computation and assigns it to the current owner
 *
 * **Ownership Registration:**
 *
 * ```js
 * const parent: Owner = {
 *   owned: null,
 *   // ...
 * };
 *
 * Owner = parent;
 *
 * // Child 1
 * const child1 = createComputation(fn1, undefined, false);
 * // parent.owned = [child1]
 * // child1.owner = parent
 *
 * // Child 2
 * const child2 = createComputation(fn2, undefined, false);
 * // parent.owned = [child1, child2]
 * // child2.owner = parent
 * ```
 */
function createComputation<Next, Init = unknown>(
  fn: EffectFunction<Init | Next, Next>,
  init: Init,
  pure: boolean,
  state: ComputationState = STALE,
  options?: EffectOptions
): Computation<Init | Next, Next> {
  const comp: Computation<Init | Next, Next> = {
    fn,
    state,
    updatedAt: null,
    owned: null /** Will own child computations */,
    sources: null /** Will track dependencies */,
    sourceSlots: null /** Positions in dependencies of sources */,
    cleanups: null /** Cleanup functions */,
    owner: CURRENT_OWNER /** Current owner */,
    context: CURRENT_OWNER?.context ?? null /** Inherit context */,
    pure /** Is this a pure computation (memo) or effect */,
    value: init /** Current value */,
  };

  /** Register this computation with its owner */
  if (CURRENT_OWNER === null) {
    if (IS_DEV)
      console.warn(
        "computations created outside a `createRoot` or `render` will never be disposed"
      );
  } else if (CURRENT_OWNER !== UNOWNED_OWNER) {
    /** Add to owner's owned array */
    (CURRENT_OWNER.owned ??= []).push(comp);
  }

  if (IS_DEV && options && options.name) comp.name = options.name;

  /*
	// TODO: ExternalSourceConfig and Transition are not defined in this context
  if (IS_DEV && options && options.name) c.name = options.name;

  if (ExternalSourceConfig && c.fn) {
    const [track, trigger] = createSignal<void>(undefined, { equals: false });
    const ordinary = ExternalSourceConfig.factory(c.fn, trigger);
    onCleanup(() => ordinary.dispose());
    const triggerInTransition: () => void = () =>
      startTransition(trigger).then(() => inTransition.dispose());
    const inTransition = ExternalSourceConfig.factory(c.fn, triggerInTransition);
    c.fn = x => {
      track();
      return Transition && Transition.running ? inTransition.track(x) : ordinary.track(x);
    };
  }

  if (IS_DEV) DevHooks.afterCreateOwner && DevHooks.afterCreateOwner(c);
	*/

  return comp;
}

/**
 * Runs a computation and sets it as the current owner
 * This allows the computation to create child computations
 *
 * **What This Enables:**
 *
 * ```
 * createEffect(() => {
 *   // This effect is now the Owner
 *
 *   const memo = createMemo(() => signal() * 2);
 *   // memo.owner = this effect
 *
 *   createEffect(() => {
 *     // This nested effect's owner = parent effect
 *     console.log(memo());
 *   });
 *
 *   // When this effect re-runs, memo and nested effect are disposed first!
 * });
 * ```
 */
export function runComputation(
  node: Computation<any>,
  value: any,
  time: number
): void {
  let nextValue: any;

  // Save current context
  const prevListener = CURRENT_LISTENER;
  const prevOwner = CURRENT_OWNER;

  // Set computation as both the current owner and current listener
  CURRENT_OWNER = node;
  CURRENT_LISTENER = node;

  try {
    // Execute the function
    nextValue = node.fn(value);
  } catch (error) {
    /*
		// TODO:
    if (node.pure) {
      if (Transition && Transition.running) {
        node.tState = STALE;
        (node as Memo<any>).tOwned && (node as Memo<any>).tOwned!.forEach(cleanNode);
        (node as Memo<any>).tOwned = undefined;
      } else {
        node.state = STALE;
        node.owned && node.owned.forEach(cleanNode);
        node.owned = null;
      }
    }
    // won't be picked up until next update
    node.updatedAt = time + 1;
		*/
    // Handle error (covered in later step)
    handleError(error);
    return;
  } finally {
    // Always restore context
    CURRENT_OWNER = prevOwner;
    CURRENT_LISTENER = prevListener;
  }

  /*
	// TODO:
  if (!node.updatedAt || node.updatedAt <= time) {
    if (node.updatedAt != null && "observers" in node) {
      writeSignal(node as Memo<any>, nextValue, true);
    } else if (Transition && Transition.running && node.pure) {
      Transition.sources.add(node as Memo<any>);
      (node as Memo<any>).tValue = nextValue;
    } else node.value = nextValue;
    node.updatedAt = time;
  }
	*/

  // Update value if needed
  node.value = nextValue;
  node.updatedAt = time;
}

/**
 * Cleans up a node and all its owned children
 * This is the magic that prevents memory leaks!
 *
 * Cleanup Order:
 *
 * ```
 * Parent Effect
 *   ├─ Child Memo → dispose
 *   └─ Child Effect → dispose
 *       └─ Grandchild Memo → dispose
 * ```
 *
 * Disposal Order:
 * 1. Grandchild Memo
 * 2. Child Effect
 * 3. Child Memo
 * 4. Parent Effect
 *
 * Bottom-up: children before parents
 */
function cleanNode(node: Owner): void {
  /** 1. Dispose all owned children (recursive!) */
  if (node.owned) {
    for (let i = 0; i < node.owned.length; i++) {
      cleanNode(node.owned[i]!);
    }
    node.owned = null;
  }

  /** 2. Remove from dependency graph (if computation) */
  if ((node as Computation<any>).sources?.length) {
    const comp = node as Computation<any>;

    /** Remove this computation from all the signals it is subscribed to */
    while (comp.sources!.length) {
      const lastSrc =
        comp.sources!.pop()!; /** Remove and get last source O(1) */
      const lastSrcIdx =
        comp.sourceSlots!.pop()!; /** Remove and get last source slot O(1) */
      const observers = lastSrc.observers;

      /** Swap with last element for O(1) removal */
      if (observers?.length) {
        /** first let's pop the last */
        const lastObs =
          observers.pop()!; /** Remove and get last observer O(1) */
        const lastObsIdx =
          lastSrc.observerSlots!.pop()!; /** Remove and get last observer slot O(1) */

        /** If we didn't remove the last element, swap it into the gap */
        if (lastSrcIdx < observers.length) {
          /** Update the swapped element's slot */
          /** Q: Is the `lastObs.source![lastObsIdx]` should be the same computation as `comp`?
           * A: Yes, it should be the same computation as `comp`.
           * This is because `lastObs` is the last observer that was removed from the `observers` array of `lastSrc`,
           * and `lastObsIdx` is the index in `lastObs.sourceSlots` that corresponds to `lastSrc`.
           * Since we are swapping elements to maintain O(1) removal,
           * we need to update the slot in `lastObs` to point to
           * the new index of `lastSrc` in its `sources` array.
           */
          lastObs.sourceSlots![lastObsIdx] = lastSrcIdx;
          /** Place it in the gap */
          observers[lastSrcIdx] = lastObs;
          lastSrc.observerSlots![lastSrcIdx] = lastObsIdx;
        }
      }

      /**
       * @note
       *
       * How Swap-and-Pop Works:
       *
       * ```
       * Remove effect2 from signal.observers:
       *
       * Before:
       * observers:     [effect1, effect2, effect3, effect4]
       * observerSlots: [   0   ,    1   ,    0   ,    1   ]
       *                            ↑ Remove this
       *
       * Step 1: Get last element
       * last = observers.pop()        // effect4
       * lastSlot = observerSlots.pop() // 1
       *
       * observers:     [effect1, effect2, effect3]
       * observerSlots: [   0   ,    1   ,    0   ]
       *
       * Step 2: Swap last into the gap (index=1)
       * observers[1] = effect4
       * observerSlots[1] = 1
       *
       * observers:     [effect1, effect4, effect3]
       * observerSlots: [   0   ,    1   ,    0   ]
       *
       * Step 3: Update effect4's sourceSlot
       * effect4.sourceSlots[1] = 1  // Points to new position
       *
       * Done! Removed in O(1) time.
       * ```
       */
    }
  }
  /** 3. Run cleanup functions */
  if (node.cleanups) {
    for (let i = 0; i < node.cleanups.length; i++) {
      node.cleanups[i]!();
    }
    node.cleanups = null;
  }

  /** 4. Reset state */
  (node as Computation<any>).state = STALE;
}

function updateComputation(node: Computation<any>): void {
  if (!node.fn) return;

  /**
   * CRITICAL: Clean up before re-running
   * This disposes old children and unsubscribes from old signals
   *
   * **Why Clean Before Re-run:**
   *
   * ```
   * const [show, setShow] = createSignal(true);
   *
   * createEffect(() => {
   *   cleanNode(this); // ← Dispose old children first
   *
   *   if (show()) {
   *     createEffect(() => console.log("A"));
   *   } else {
   *     createEffect(() => console.log("B"));
   *   }
   * });
   *
   * setShow(false);
   * // 1. cleanNode disposes "A" effect
   * // 2. Creates "B" effect
   * // No leaks!
   * ```
   *
   * Otherwise, old children would linger and cause memory leaks!
   */
  cleanNode(node);

  const time = ExecCount;
  runComputation(node, node.value, time);
}

/**
 * ================================================
 *               Bidirectional Tracking
 * ================================================
 */

export function readSignal<T>(this: SignalState<T>): T {
  if (CURRENT_LISTENER) {
    /**
     * Push the signal to the listener _(who will subscribe to the signal)_
     * `sources` and store it's position/index/slot
     */
    const srcIdx = (CURRENT_LISTENER.sources ??= []).push(this);
    /**
     * Push the listener to the signal
     * `observers` and store it's position/index/slot
     */
    const obsIdx = (this.observers ??= []).push(CURRENT_LISTENER);

    /**
     * Now, on the listener `sourceSlots`, we will push
     * where it's on the signal `observers`
     */
    (CURRENT_LISTENER.sourceSlots ??= []).push(obsIdx);

    /**
     * Then, on the signal `observerSlots`, we will push
     * where it's on the listener `sources`
     */
    (this.observerSlots ??= []).push(srcIdx);

    /**
     * Step-by-step visualization:
     *
     * ```
     * // Initial state
     * signal.observers = null;
     * signal.observerSlots = null;
     * effect.sources = null;
     * effect.sourceSlots = null;
     *
     * // First read
     * Listener = effect;
     * signal(); // Calls readSignal
     *
     * // After first read
     * signal.observers = [effect];
     * signal.observerSlots = [0]; // effect.sources[0] points back to signal
     * effect.sources = [signal];
     * effect.sourceSlots = [0]; // signal.observers[0] points back to effect
     *
     * // Second read (different signal)
     * signal2();
     *
     * // After second read
     * signal.observers = [effect];
     * signal.observerSlots = [0];
     * signal2.observers = [effect];
     * signal2.observerSlots = [1]; // effect.sources[1] points back to signal2
     * effect.sources = [signal, signal2];
     * effect.sourceSlots = [0, 1];
     * ```
     */
  }

  return this.value;
}

export function writeSignal<T>(node: SignalState<T>, value: T) {
  // Check if value actually changed
  if (!(node.comparator ?? defaultComparator)(node.value, value)) {
    node.value = value;
    /**
     * **Code:**
     *
     * ```js
     * const [a, setA] = createSignal(1);
     * const [b, setB] = createSignal(2);
     *
     * const sum = createMemo(() => a() + b());
     *
     * const doubled = createMemo(() => sum() * 2);
     *
     * createEffect(() => {
     *   console.log(doubled());
     * });
     * ```
     *
     * **Dependency Graph:**
     *
     * ```
     * Signal A ────────┐
     *                   ↓
     * Signal B ──────→ Memo(sum) ──→ Memo(doubled) ──→ Effect
     *                   ↑
     *          Bidirectional links
     *
     * Each arrow is actually TWO links:
     *   Forward:  source → observer
     *   Backward: observer → source (via slots)
     * ```
     *
     * **Data Structure:**
     *
     * ```js
     * // Signal A
     * {
     *   observers: [sum],
     *   observerSlots: [0]  // sum.sources[0] = A
     * }
     *
     * // Signal B
     * {
     *   observers: [sum],
     *   observerSlots: [1]  // sum.sources[1] = B
     * }
     *
     * // Memo: sum
     * {
     *   sources: [A, B],
     *   sourceSlots: [0, 0],    // A.observers[0], B.observers[0]
     *   observers: [doubled],
     *   observerSlots: [0]      // doubled.sources[0] = sum
     * }
     *
     * // Memo: doubled
     * {
     *   sources: [sum],
     *   sourceSlots: [0],       // sum.observers[0]
     *   observers: [effect],
     *   observerSlots: [0]      // effect.sources[0] = doubled
     * }
     *
     * // Effect
     * {
     *   sources: [doubled],
     *   sourceSlots: [0]        // doubled.observers[0]
     * }
     * ```
     *
     * **Removal Example:**
     *
     * ```js
     * // What happens when sum memo re-runs?
     *
     * cleanNode(sum);
     *
     * // Step 1: Remove sum from A.observers
     * //   swap-and-pop: O(1)
     *
     * // Step 2: Remove sum from B.observers
     * //   swap-and-pop: O(1)
     *
     * // Step 3: sum.sources = []
     * // Step 4: sum.sourceSlots = []
     *
     * // Now sum is clean, ready to re-execute and create new dependencies
     * ```
     */
    // Notify all observers
    if (node.observers?.length) {
      runUpdates(() => {
        for (let i = 0; i < node.observers!.length; i++) {
          const obs = node.observers![i]!;

          // Mark as stale
          if (obs.state === FRESH) {
            if (obs.pure) Updates!.push(obs); // Memo: add to Updates
            else Effects!.push(obs); // Effect: add to Effect

            // If this is a memo with observers, mark them too
            if ((obs as Memo<any>).observers?.length) {
              markDownstream(obs as Memo<any>);
            }
          }
          obs.state = STALE;
        }
      }, false);
    }
  }

  return node.value;
}

/**
 * Marks all downstream computations as stale
 * Used when a memo changes to invalidate dependent computations
 */
function markDownstream(node: Memo<any>): void {
  for (let i = 0; i < node.observers!.length; i++) {
    const obs = node.observers![i]!;

    if (obs.state === FRESH) {
      obs.state = PENDING; // Mark as pending (not stale yet)
      if (obs.pure) Updates!.push(obs); // Memo: add to Updates
      else Effects!.push(obs); // Effect: add to Effect

      // Recursively mark downstream
      if ((obs as Memo<any>).observers?.length) {
        markDownstream(obs as Memo<any>);
      }
    }
  }
}

/**
 * Core update cycle
 * Sets up queues, runs function, then completes updates
 */
function runUpdates(fn: () => void, init: boolean) {
  // TODO: to be implemented in later iterations
  return fn();
}
