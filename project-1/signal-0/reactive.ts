/** biome-ignore-all lint/suspicious/noAssignInExpressions: <explanation> */
import { IS_DEV, STALE, UNOWNED_OWNER } from "./constants.ts";
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
export let CURRENT_LISTENER: Computation<any> | null = null;
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
export const Updates: Computation<any>[] | null = null;
/** Side effects */
export const Effects: Computation<any>[] | null = null;
// const Transition: TransitionState;
// const Scheduler: Function;

const ExecCount = 0;

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
  // 1. Dispose all owned children (recursive!)
  if (node.owned) {
    for (let i = 0; i < node.owned.length; i++) {
      cleanNode(node.owned[i]!);
    }
    node.owned = null;
  }

  // 2. Remove from dependency graph (if computation)
  if ((node as Computation<any>).sources) {
    const comp = node as Computation<any>;

    // Remove this computation from all the signals it is subscribed to
    while (comp.sources!.length) {
      const lastSrc = comp.sources!.pop()!;
      const lastSrcIdx = comp.sourceSlots!.pop()!;
      const observers = lastSrc.observers;

      // Swap with last element for O(1) removal
      if (observers?.length) {
        // first let's pop the last
        const lastObs = observers.pop()!;
        const lastObsIdx = lastSrc.observerSlots!.pop()!;

        // The following condition only when it's less than length
        // Which means the popped one is not the target
        if (lastSrcIdx < observers.length) {
          // Then the target wasn't the last element
          // Rearrange the popped one sources with the target
          lastObs.sourceSlots![lastObsIdx] = lastSrcIdx;
          // Return the popped one to the observer list by replacing it with the target
          observers[lastSrcIdx] = lastObs;
          lastSrc.observerSlots![lastSrcIdx] = lastObsIdx;
        }
      }
    }
  }
  // 3. Run cleanup functions
  if (node.cleanups) {
    for (let i = 0; i < node.cleanups.length; i++) {
      node.cleanups[i]!();
    }
    node.cleanups = null;
  }

  // 4. Reset state
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
