/** biome-ignore-all lint/suspicious/noAssignInExpressions: <explanation> */
import { CLEAN, IS_DEV, PENDING, STALE, UNOWNED_OWNER } from "./constants.ts";
import type {
  Computation,
  ComputationState,
  EffectFunction,
  EffectOptions,
  Memo,
  Owner,
  SignalState,
} from "./reactive-types.ts";

/**
 * @fileoverview
 *
 * ## 🎨 Example: State Machine in Action
 *
 * ### Code
 *
 * ```typescript
 * const [a, setA] = createSignal(1);
 * const [b, setB] = createSignal(2);
 *
 * const sum = createMemo(() => {
 *   console.log("Computing sum");
 *   return a() + b();
 * });
 *
 * const doubled = createMemo(() => {
 *   console.log("Computing doubled");
 *   return sum() * 2;
 * });
 *
 * createEffect(() => {
 *   console.log("Result:", doubled());
 * });
 * ```
 *
 *
 * ### Execution Flow
 *
 * ```
 * Initial:
 *   sum.state = 0 (CLEAN)
 *   doubled.state = 0 (CLEAN)
 *   effect.state = 0 (CLEAN)
 *
 * setA(5):
 *   1. writeSignal(a, 5)
 *   2. sum.state = STALE
 *   3. Add sum to Updates queue
 *
 *   4. markDownstream(sum)
 *   5. doubled.state = PENDING
 *   6. Add doubled to Updates queue
 *
 *   7. markDownstream(doubled)
 *   8. effect.state = PENDING
 *   9. Add effect to Effects queue
 *
 * Flush Updates:
 *   10. runTop(sum)
 *       - sum.state === STALE
 *       - updateComputation(sum)
 *       - Logs: "Computing sum"
 *       - sum.value = 7
 *       - sum.state = 0 (CLEAN)
 *       - sum.updatedAt = ExecCount
 *
 *   11. runTop(doubled)
 *       - doubled.state === PENDING
 *       - lookUpstream(doubled)
 *         - Check sum: state = 0, updatedAt = ExecCount ✓
 *       - updateComputation(doubled)
 *       - Logs: "Computing doubled"
 *       - doubled.value = 14
 *       - doubled.state = 0 (CLEAN)
 *
 * Flush Effects:
 *   12. runTop(effect)
 *       - effect.state === PENDING
 *       - lookUpstream(effect)
 *         - Check doubled: state = 0 ✓
 *       - updateComputation(effect)
 *       - Logs: "Result: 14"
 *       - effect.state = 0 (CLEAN)
 *
 * Final state:
 *   All computations CLEAN
 *   All values consistent
 *   No glitches! 🎉
 * ```
 *
 * ## 🔍 Why This Matters
 *
 * ### 1. Lazy Evaluation
 *
 * ```typescript
 * const expensive = createMemo(() => {
 *   console.log("Expensive computation");
 *   return heavyCalculation();
 * });
 *
 * // Signal changes, but memo not read
 * setSignal(newValue);
 * // memo.state = STALE, but NOT computed yet
 *
 * // Only computed when accessed
 * console.log(expensive()); // ← Now it computes
 * ```
 *
 * ### 2. Glitch Prevention
 *
 * ```typescript
 * const [x, setX] = createSignal(1);
 * const [y, setY] = createSignal(2);
 *
 * const sum = createMemo(() => x() + y());
 * const product = createMemo(() => sum() * 2);
 *
 * batch(() => {
 *   setX(5);  // sum.state = STALE
 *   setY(10); // sum already STALE
 * });
 *
 * // sum only computes once with final values: (5 + 10) * 2 = 30
 * // Without states: would compute (5 + 2) * 2 = 14, then (5 + 10) * 2 = 30
 * ```
 *
 * ### 3. Topological Ordering
 *
 * ```typescript
 * //     A
 * //    / \
 * //   B   C
 * //    \ /
 * //     D
 *
 * setA(newValue);
 *
 * // Update order: A → B → C → D
 * // Guaranteed: parents before children
 * // D always sees consistent B and C values
 * ```
 *
 * ### How It All Works Together
 *
 * ```typescript
 * // Complete flow with states:
 * const [a, setA] = createSignal(1);
 * const [b, setB] = createSignal(2);
 *
 * const sum = createMemo(() => a() + b());
 * const doubled = createMemo(() => sum() * 2);
 *
 * createEffect(() => {
 *   console.log(doubled());
 * });
 *
 * // Initial: all CLEAN
 * // sum.state = 0
 * // doubled.state = 0
 * // effect.state = 0
 *
 * setA(5);  // Triggers writeSignal
 *
 * // ┌─ writeSignal ────────────────────────────────────┐
 * // │ 1. a.value = 5                                   │
 * // │ 2. runUpdates(() => { ... }, true)               │
 * // └──────────────────────────────────────────────────┘
 * //
 * // ┌─ runUpdates Phase 1: Initialize ─────────────────┐
 * // │ Updates = []                                     │
 * // │ Effects = []                                     │
 * // │ ExecCount++ (now = 1)                            │
 * // └──────────────────────────────────────────────────┘
 * //
 * // ┌─ runUpdates Phase 2: Mark ───────────────────────┐
 * // │ fn() executes:                                   │
 * // │   sum.state = STALE                              │
 * // │   Updates.push(sum)                              │
 * // │   markDownstream(sum):                           │
 * // │     doubled.state = PENDING                      │
 * // │     Updates.push(doubled)                        │
 * // │     markDownstream(doubled):                     │
 * // │       effect.state = PENDING                     │
 * // │       Effects.push(effect)                       │
 * // └──────────────────────────────────────────────────┘
 * //
 * // ┌─ runUpdates Phase 3: Flush Updates ──────────────┐
 * // │ for (sum in Updates):                            │
 * // │   runTop(sum):                                   │
 * // │     sum.state === STALE                          │
 * // │     updateComputation(sum)                       │
 * // │     sum.value = 7                                │
 * // │     sum.state = CLEAN                            │
 * // │     sum.updatedAt = 1                            │
 * // │                                                  │
 * // │ for (doubled in Updates):                        │
 * // │   runTop(doubled):                               │
 * // │     doubled.state === PENDING                    │
 * // │     lookUpstream(doubled):                       │
 * // │       check sum: state=CLEAN, updatedAt=1 ✓      │
 * // │     updateComputation(doubled)                   │
 * // │     doubled.value = 14                           │
 * // │     doubled.state = CLEAN                        │
 * // └──────────────────────────────────────────────────┘
 * //
 * // ┌─ runUpdates Phase 4: Flush Effects ──────────────┐
 * // │ for (effect in Effects):                         │
 * // │   runTop(effect):                                │
 * // │     effect.state === PENDING                     │
 * // │     lookUpstream(effect):                        │
 * // │       check doubled: state=CLEAN ✓               │
 * // │     updateComputation(effect)                    │
 * // │     console.log(14)  ← Side effect!              │
 * // │     effect.state = CLEAN                         │
 * // └──────────────────────────────────────────────────┘
 * //
 * // ┌─ runUpdates Phase 5: Cleanup ────────────────────┐
 * // │ Updates = null                                   │
 * // │ Effects = null                                   │
 * // └──────────────────────────────────────────────────┘
 * //
 * // Final: all CLEAN again, consistent values! ✨
 * ```
 *
 * ### Why This Achieves All Six Goals
 *
 * 1. **Lazy Evaluation** ✅
 *    - Computations marked STALE but only update during flush
 *    - If never accessed, never computed
 *
 * 2. **State Machine** ✅
 *    - CLEAN → STALE → PENDING → CLEAN cycle
 *    - Clear lifecycle management
 *
 * 3. **Glitch Prevention** ✅
 *    - ExecCount timestamp ensures we see updates once
 *    - lookUpstream checks prevent reading stale values
 *
 * 4. **Topological Ordering** ✅
 *    - runTop walks up owner chain
 *    - Updates parents before children
 *
 * 5. **Performance** ✅
 *    - Batch updates in runUpdates
 *    - Process once per cycle, not per signal change
 *
 * 6. **Correctness** ✅
 *    - PENDING state ensures upstream consistency
 *    - Only see final, stable values
 *
 * ## 🔑 Critical Difference: Memos vs Effects
 *
 * Now that you understand lazy evaluation, it's crucial to understand how memos differ from effects:
 *
 * ### Memos: Lazy (Pull-based)
 *
 * ```typescript
 * const [count, setCount] = createSignal(0);
 *
 * const doubled = createMemo(() => {
 *   console.log("Computing doubled");
 *   return count() * 2;
 * });
 *
 * setCount(5);  // Memo marked STALE, NOT computed yet!
 * console.log("Between updates");
 * doubled();    // NOW it computes!
 * console.log("After access");
 *
 * // Output:
 * // Between updates
 * // Computing doubled  ← Happens on access!
 * // After access
 * ```
 *
 * **Trigger:** Access (reading the value)
 * **Timing:** On-demand, when read
 * **Purpose:** Cached derived values
 * **Optimization:** Never accessed = never computed
 *
 * ### Effects: Eager (Push-based)
 *
 * ```typescript
 * const [count, setCount] = createSignal(0);
 *
 * createEffect(() => {
 *   console.log("Effect sees:", count());
 * });
 *
 * setCount(5);  // Effect flushes IMMEDIATELY!
 * // ↑ Effect already ran (synchronously)
 * console.log("After update");
 *
 * // Output:
 * // Effect sees: 0  ← Initial run
 * // Effect sees: 5  ← Ran synchronously in setCount!
 * // After update
 * ```
 *
 * **Trigger:** Signal update
 * **Timing:** Synchronous flush
 * **Purpose:** Side effects
 * **Guarantee:** Always runs (can't skip)
 *
 * ### Why This Matters
 *
 * ```typescript
 * const [count, setCount] = createSignal(0);
 *
 * // Memo: Only computes if accessed
 * const expensive = createMemo(() => {
 *   console.log("Expensive computation");
 *   let result = 0;
 *   for (let i = 0; i < 1000000; i++) {
 *     result += Math.sqrt(i);
 *   }
 *   return result;
 * });
 *
 * setCount(1);  // NOT computed yet!
 * setCount(2);  // Still not computed!
 * setCount(3);  // Still not computed!
 * console.log("Memos not computed yet!");
 *
 * expensive();  // NOW it computes ONCE with final value!
 *
 * // VS
 *
 * // Effect: Always runs on change
 * createEffect(() => {
 *   console.log("Effect runs");
 *   let result = 0;
 *   for (let i = 0; i < 1000000; i++) {
 *     result += Math.sqrt(i);
 *   }
 *   return result;
 * });
 *
 * setCount(1);  // Runs immediately! (expensive!)
 * setCount(2);  // Runs again! (expensive!)
 * setCount(3);  // Runs again! (expensive!)
 * // 3 expensive computations!
 * ```
 *
 * ### Performance Comparison
 *
 * | Scenario | Memo | Effect |
 * |----------|------|--------|
 * | Signal updated | Marked STALE | Runs immediately |
 * | Multiple updates | Marks STALE each time | Runs each time |
 * | Never accessed | Never computes ✅ | Always runs ❌ |
 * | Accessed once | Computes once ✅ | N/A |
 * | Accessed multiple times | Returns cached ✅ | N/A |
 * | **Best for** | Derived values | Side effects |
 *
 * ### Use Cases
 *
 * **Use Memos When:**
 * ```typescript
 * // Deriving values
 * const fullName = createMemo(() => `${first()} ${last()}`);
 *
 * // Expensive computations
 * const filtered = createMemo(() => items().filter(predicate));
 *
 * // Complex calculations
 * const stats = createMemo(() => calculateStatistics(data()));
 * ```
 *
 * **Use Effects When:**
 * ```typescript
 * // DOM updates
 * createEffect(() => {
 *   element.textContent = message();
 * });
 *
 * // Logging/debugging
 * createEffect(() => {
 *   console.log("State changed:", state());
 * });
 *
 * // External sync
 * createEffect(() => {
 *   saveToLocalStorage(data());
 * });
 * ```
 *
 * ### Key Insight
 *
 * **Memos are performance optimizations** (lazy, cached)
 * **Effects are for side effects** (eager, always run)
 *
 * Choose based on your needs:
 * - Need a derived value? → Memo
 * - Need a side effect? → Effect
 * - Want to skip computation? → Memo (it might not run!)
 * - Must always execute? → Effect (it will always run!)
 *
 */

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
 * @fileoverview
 *
 * ```js
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
 * @fileoverview
 *
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

/**
 * Global execution counter for topological ordering
 * Incremented on each update cycle
 */
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
   * We can do this by checking if the function has zero parameters.
   * If it does, we treat it as unowned (no dispose needed).
   *
   * Why This Matters:
   * - **Memory Management**: Unowned roots don't need cleanup,
   *   reducing overhead for simple cases.
   * - **Developer Intent**: Function signature indicates
   *
   * **When Roots Are Unowned:**
   *
   * ```js
   * // Anonymous function (0 parameters) = unowned
   * createRoot(() => {
   *   // owner = UNOWNED
   *   // No cleanup needed
   * });
   *
   * // Named function OR function with parameter = owned
   * createRoot((dispose) => {
   *   // owner = new Owner object
   *   // Can be cleaned up via dispose()
   * });
   *
   * // Detection:
   * function createRoot(fn, detachedOwner) {
   *   const unowned = fn.length === 0; // Check parameter count
   *
   *   const rootOwner = unowned
   *     ? UNOWNED  // Reuse singleton
   *     : {        // Create new owner
   *         owned: null,
   *         cleanups: null,
   *         context: parentOwner?.context ?? null,
   *         owner: parentOwner
   *       };
   *   // ...
   * }
   * ```
   */
  const unowned = fn.length === 0;

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

  /** Set up the function to call */
  const updateFn = unowned
    ? fn /** Call directly (no dispose parameter) */
    : () =>
        fn(() => {
          /** Dispose function cleans up the entire root */
          untrack(() => cleanNode(rootOwner));
        });

  /** Set root as current owner */
  CURRENT_OWNER = rootOwner;
  /** Roots don't subscribe to signals */
  CURRENT_LISTENER = null;
  try {
    return (updateFn as () => T)();
  } catch (error) {
    /** handleError(error) */
  } finally {
    /** Restore previous context */
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
    updatedAt: null /** Last execution timestamp _(for glitch prevention)_ */,
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

  // Update if not already updated this cycle
  if (!node.updatedAt || node.updatedAt <= time) {
    if (node.updatedAt != null && "observers" in node) {
      writeSignal(node as Memo<any>, nextValue, true);
    }
    //  else if (Transition && Transition.running && node.pure) {
    //   Transition.sources.add(node as Memo<any>);
    //   (node as Memo<any>).tValue = nextValue;
    // }
    else node.value = nextValue;
    node.updatedAt = time;
  }

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
  // If this is a memo, check if it needs updating
  if ((this as Memo<any>).sources && (this as Memo<any>).state !== CLEAN) {
    const memo = this as Memo<any>;

    if (memo.state === STALE) {
      // Fully recompute
      updateComputation(memo);
    } else if (memo.state === PENDING) {
      // Check upstream first
      const prevUpdates = Updates;
      Updates = null;
      runUpdates(() => lookUpstream(memo), false);
      Updates = prevUpdates;
    }
  }

  // Track dependency
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

/**
 * Updates a computation with TOPOLOGICAL ORDERING
 *
 * Topological ordering means: **Parents update before children**
 * This prevents glitches by ensuring consistent values.
 *
 * How it works:
 * 1. Start with the computation that needs updating (e.g., quadrupled)
 * 2. Walk UP the ownership chain collecting stale ancestors (e.g., doubled, sum)
 * 3. Process in REVERSE order = parents first (sum → doubled → quadrupled)
 *
 * Example:
 * ```
 * signal
 *   ↓
 * sum (owner of doubled)        ← Level 1 (grandparent)
 *   ↓
 * doubled (owner of quadrupled) ← Level 2 (parent)
 *   ↓
 * quadrupled                    ← Level 3 (child)
 * ```
 *
 * When quadrupled needs updating:
 * - ancestors = [quadrupled, doubled, sum]  ← Collected bottom-up
 * - Process: sum → doubled → quadrupled     ← Execute top-down (reversed)
 *
 * @param node - The computation that was accessed/needs updating
 */
function runTop(node: Computation<any>): void {
  // Fast path: Already up-to-date?
  if (node.state === CLEAN) return;

  // If pending, just check upstream and return
  // biome-ignore lint/correctness/noVoidTypeReturn: <explanation>
  if (node.state === PENDING) return lookUpstream(node);

  /**
   * PHASE 1: COLLECT ANCESTORS (Walk UP the chain)
   * ===============================================
   * We start with the current node and walk up the ownership chain,
   * collecting any ancestors that are stale (outdated).
   *
   * Think of it like climbing a family tree to find who needs updating.
   */
  const ancestors = [node]; // Start with current node (e.g., [quadrupled])

  /**
   * Walk up the ownership chain:
   * - node.owner = parent computation that owns this one
   * - Keep going until we hit the root or find a current ancestor
   *
   * Example walk:
   * 1. node = quadrupled (updatedAt = 0, ExecCount = 1) → 0 < 1 ✓ stale
   * 2. node = doubled (updatedAt = 0, ExecCount = 1) → 0 < 1 ✓ stale
   * 3. node = sum (updatedAt = 1, ExecCount = 1) → 1 < 1 ✗ current, STOP
   *
   * Result: ancestors = [quadrupled, doubled, sum]
   */
  while (
    (node = node.owner as Computation<any>) && // Move to parent
    (!node.updatedAt || node.updatedAt < ExecCount) // Is parent outdated?
  ) {
    // Only add if it needs updating (not CLEAN)
    if (node.state !== CLEAN) ancestors.push(node);
  }

  /**
   * Now ancestors contains (bottom-up):
   * [child, parent, grandparent, ...]
   * Example: [quadrupled, doubled, sum]
   */

  /**
   * PHASE 2: UPDATE TOP-DOWN (Process in order)
   * ============================================
   * We collected children first (bottom-up), but now we process
   * parents first (top-down) to ensure consistency.
   *
   * Why? If we updated quadrupled first, it would read stale doubled!
   * By updating sum → doubled → quadrupled, each sees consistent parents.
   */
  for (let i = ancestors.length - 1; i >= 0; i--) {
    /**
     * Process in REVERSE order (top-down):
     * i = 2: sum        ← Grandparent first
     * i = 1: doubled    ← Parent second
     * i = 0: quadrupled ← Child last
     *
     * This guarantees: Parents are always CLEAN when children read them!
     */
    node = ancestors[i]!;

    if (node.state === STALE) {
      // Fully outdated - recompute now
      updateComputation(node);
    } else if (node.state === PENDING) {
      // Waiting for dependencies - check them first
      const prevUpdates = Updates;
      Updates = null;
      runUpdates(() => lookUpstream(node), false);
      Updates = prevUpdates;
    }
  }

  /**
   * Result: All ancestors are now CLEAN and consistent!
   * ✅ sum.value = 15
   * ✅ doubled.value = 30 (uses fresh sum)
   * ✅ quadrupled.value = 60 (uses fresh doubled)
   *
   * No glitches - all values are consistent! 🎉
   */
}

/**
 * Recursively updates upstream dependencies
 * Used when a computation is PENDING
 */
function lookUpstream(node: Computation<any>, ignore?: Computation<any>): void {
  /** Clear pending state */
  node.state = CLEAN;

  /** Check each source */
  for (let i = 0; i < node.sources!.length; i++) {
    const source = node.sources![i] as Memo<any>;

    /** Only check memos (signals are always current) */
    if (!source.sources) continue;
    const state = source.state;

    if (state === STALE) {
      /** Source needs updating and we haven't updated it yet */
      if (
        source !== ignore &&
        (!source.updatedAt || source.updatedAt < ExecCount)
      ) {
        /** Run with Topological Ordering */
        runTop(source);
      }
    } else if (state === PENDING) {
      /** Source is pending, recurse */
      lookUpstream(source, ignore);
    }
  }
}

export function writeSignal<T>(
  node: SignalState<T>,
  value: T,
  isComp?: boolean
) {
  /** Check if value actually changed */
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
    /** Notify all observers */
    if (node.observers?.length) {
      /** ← THIS IS WHERE THE MAGIC HAPPENS!!! ✨ */
      runUpdates(() => {
        /** Mark all observers as STALE */
        for (let i = 0; i < node.observers!.length; i++) {
          const obs = node.observers![i]!;

          /** Only mark if currently CLEAN */
          if (obs.state === CLEAN) {
            /** Add to appropriate queue */
            if (obs.pure) Updates!.push(obs); /** Memo: add to Updates */
            else Effects!.push(obs); /** Effect: add to Effect */

            /** If this is a memo with observers, mark them too _(propagate the staleness downstream)_ */
            if ((obs as Memo<any>).observers?.length) {
              markDownstream(obs as Memo<any>);
            }
          }
          obs.state = STALE; /* Mark as STALE _(need to update)_ */
        }
      }, false);
      /** ← `init=false` means effects batch automatically **within this update cycle** */
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

    if (obs.state === CLEAN) {
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
 * Core update cycle that manages queue creation and flushing
 * This is what makes batching and proper execution order work!
 *
 * @param fn - Function that marks computations as STALE
 * @param init - If true, flush effects immediately. If false, batch them.
 */
function runUpdates<T>(fn: () => T, init: boolean) {
  /** If we're already batching, just mark (don't create new queues) */
  if (Updates) {
    return fn();
  }

  /** Track if we should wait before flushing effects */
  let wait = false;
  if (!init) Updates = [];
  if (Effects) wait = true; // Effects already exist, don't flush yet!
  else Effects = [];

  ExecCount++; // Increment for topological ordering
  try {
    /** Run the marking function (this adds computations to queues) */
    const result = fn();
    completeUpdates(wait);
    return result;
  } catch (err) {
    if (!wait) Effects = null;
    Updates = null;
    throw err;
  }
}

/**
 * Completes the update cycle by flushing queues
 * This is where automatic batching happens!
 *
 * @param wait - If true, skip flushing effects (batch them)
 *
 * **Execution Flow:**
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
 * - **Correctness**: Effects see consistent derived state
 * - **Predictability**: Memos always update before effects
 * - **Performance**: Batch similar work together
 */
function completeUpdates(wait: boolean) {
  /** 1. Always flush Updates queue (memos) */
  if (Updates) {
    runQueue(Updates);
    Updates = null;
  }

  /** 2. If wait=true, effects batch until next microtask */
  if (wait) return;

  /** 3. Finally flush Effects queue */
  const e = Effects!;
  Effects = null;
  if (e.length) runUpdates(() => runEffects(e), false);
}

/**
 * Process a queue of computations
 */
function runQueue(queue: Computation<any, any>[]) {
  for (let i = 0; i < queue.length; i++) {
    runTop(queue[i]!);
  }
}

/**
 * Run effects queue
 */
function runEffects(queue: Computation<any, any>[]) {
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    if (node?.state === STALE) updateComputation(node);
  }
}

/**
 * Batches multiple signal updates together
 * Effects only run once after all updates complete
 *
 * @example
 *
 * ```typescript
 * // Without batch - effect runs twice
 * setFirstName("Jane");  // Effect runs
 * setLastName("Smith");  // Effect runs again
 *
 * // With batch - effect runs once
 * batch(() => {
 *   setFirstName("Jane");
 *   setLastName("Smith");
 * }); // Effect runs once with both changes
 * ```
 *
 * **When do you need `batch`?**
 *
 * ```js
 * // Top-level multiple updates
 * function updateUserProfile() {
 *   batch(() => {
 *     setFirstName("Jane");
 *     setLastName("Smith");
 *     setAge(30);
 *   });
 * }
 *
 * // Event handlers
 * button.onclick = () => {
 *   batch(() => {
 *     setCount(count() + 1);
 *     setTimestamp(Date.now());
 *   });
 * };
 *
 * // Async operations
 * async function fetchData() {
 *   const data = await apiCall();
 *   batch(() => {
 *     setData(data);
 *     setLoading(false);
 *   });
 * }
 *
 * // Complex computations
 * function complexCalculation() {
 *   batch(() => {
 *     setValueA(computeA());
 *     setValueB(computeB());
 *     setValueC(computeC());
 *   });
 * }
 *
 * // Multiple related signals
 * function updateSettings() {
 *   batch(() => {
 *     setSetting1(true);
 *     setSetting2(false);
 *     setSetting3("custom");
 *   });
 * }
 *
 * // UI interactions
 * function onUserAction() {
 *   batch(() => {
 *     setIsActive(true);
 *     setLastAction(Date.now());
 *   });
 * }
 *
 * // State initialization
 * function initializeState() {
 *   batch(() => {
 *     setInitialValue1(100);
 *     setInitialValue2("default");
 *   });
 * }
 *
 * // Animation frames
 * function onAnimationFrame() {
 *   batch(() => {
 *     setPositionX(calculateX());
 *     setPositionY(calculateY());
 *   });
 * }
 * ```
 *
 * **When NOT to use `batch`:**
 *
 * ```js
 * // Single updates - no need to batch
 * setCount(count() + 1);
 *
 * // Independent updates - unrelated signals
 * setUserName("Alice");
 * setTheme("dark");
 *
 * // Simple effects - let them run naturally
 * createEffect(() => {
 *   console.log("Count changed:", count());
 * });
 * ```
 *
 * **How `batch` Works Internally:**
 *
 * ```typescript
 * // Initial state:
 * const [a, setA] = createSignal(2);
 * const [b, setB] = createSignal(5);
 *
 * const sum = createMemo(() => {
 *   console.log("Computing sum");
 *   return a() + b();
 * });
 *
 * const doubled = createMemo(() => {
 *   console.log("Computing doubled");
 *   return sum() * 2;
 * });
 *
 * createEffect(() => {
 *   console.log("Result:", doubled());
 * });
 *
 * // Now, we batch updates:
 * batch(() => {
 *   setA(3); // sum.state = STALE
 *   setB(4); // sum already STALE
 * });
 * ```
 *
 * **Execution Steps:**
 *
 * 1. setA(3)
 *   - a.value = 3
 *   - markDownstream(sum)
 *   - sum.state = STALE
 *   - Add sum to Updates queue
 *
 * 2. setB(4)
 *   - b.value = 4
 *   - markDownstream(sum) (already STALE)
 *  - sum.state = STALE
 *  - sum already in Updates queue
 *
 * 3. completeUpdates()
 *  - Flush Updates queue:
 *   - runTop(sum)
 *    - sum.state = STALE
 *   - updateComputation(sum)
 *   - Logs: "Computing sum"
 *  - sum.value = 7
 *  - markDownstream(doubled)
 *  - doubled.state = STALE
 * - Add doubled to Updates queue
 *
 * - Flush Updates queue:
 * - runTop(doubled)
 * - doubled.state = STALE
 * - updateComputation(doubled)
 * - Logs: "Computing doubled"
 * - doubled.value = 14
 * - markDownstream(effect)
 * - effect.state = STALE
 * - Add effect to Effects queue
 *
 * - Flush Effects queue:
 * - runEffects([effect])
 * - effect.state = STALE
 * - updateComputation(effect)
 * - Logs: "Result: 14"
 */
export function batch<T>(fn: () => T): T {
  return runUpdates(fn, false) as T;
}
