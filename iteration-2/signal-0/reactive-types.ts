/** biome-ignore-all lint/suspicious/noEmptyInterface: <explanation> */

import type { FRESH, STALE, PENDING } from "./constants.ts";
/**
 * @fileoverview
 *
 * ===========================================================================
 * REACTIVE TYPES OVERVIEW
 * ============================================================================
 *
 * ## Why Computation unifies effects and memos
 *
 * Both effects and memos are just computations with different characteristics, because they share the same underlying mechanism of tracking dependencies and reacting to changes in signals.
 *
 * - **Memos** are pure computations that derive values from signals. They have no side effects and can be observed by other computations.
 * - **Effects** are impure computations that perform side effects based on signal changes. They do not produce a value and cannot be observed.
 *
 * By using a single Computation type for both, it simplifies the reactive system:
 *
 * - **Less complexity:** One type to manage instead of two.
 * - **Easier maintenance:** Shared logic for tracking dependencies and updates.
 * - **Consistent behavior:** Both follow the same lifecycle and ownership rules.
 * - **Performance benefits:** Reduced overhead from type conversions or wrappers.
 * - **Flexibility:** Memos can be observed, allowing for more complex reactive patterns.
 * - **Unified scheduling:** Both can be queued and flushed in the same update cycle.
 * - **Simplified debugging:** A single structure to inspect when diagnosing issues.
 * - **Clearer semantics:** Understanding that everything is a computation helps clarify how reactivity works.
 *
 * ## How ownership prevents memory leaks
 *
 * In this reactive system, ownership is a key concept that helps manage the lifecycle of computations and prevents memory leaks:
 *
 * - **Parent-child relationships:** Each computation can own other computations, forming a tree structure. When a parent computation is disposed of, all its owned children are automatically cleaned up.
 * - **Automatic cleanup:** When a computation is no longer needed (e.g., when a component unmounts), its owner disposes of it and all its descendants, ensuring no lingering references remain.
 * - **Context propagation:** Ownership allows context values to flow down the tree, ensuring that child computations have access to the necessary context without creating strong references that could lead to leaks.
 * - **Efficient resource management:** By tying the lifecycle of computations to their owners, the system can efficiently manage resources, freeing up memory when computations are no longer in use.
 * - **Reduced manual cleanup:** Developers don't need to manually track and dispose of computations, reducing the risk of forgetting to clean up and causing leaks.
 * - **Debugging aid:** The ownership structure provides a clear hierarchy that can be inspected to understand the relationships between computations and identify potential leaks.
 * - **Predictable behavior:** Ownership ensures that computations are disposed of in a predictable manner, reducing the chances of unexpected memory retention.
 *
 * ## Why bidirectional links are faster at scale
 *
 * Bidirectional links between signals and computations enhance performance, especially in large-scale applications, because they allow for efficient tracking and updating of dependencies:
 *
 * - **Direct access:** Each signal maintains a list of computations that depend on it, and each computation keeps track of the signals it relies on. This direct access allows for quick updates when a signal changes.
 * - **O(1) complexity:** Adding or removing dependencies is done in constant time, as each side of the link can be updated independently without needing to traverse the entire graph.
 * - **Efficient propagation:** When a signal updates, it can immediately notify all dependent computations without needing to search through unrelated computations, reducing overhead.
 * - **Reduced recomputation:** Computations can quickly determine if they need to recompute based on the state of their source signals, minimizing unnecessary work.
 * - **Scalability:** As the number of signals and computations grows, bidirectional links help maintain performance by keeping dependency management efficient and localized.
 * - **Improved garbage collection:** With clear ownership and bidirectional links, unused computations can be more easily identified and cleaned up,
 *
 * ## What the three computation states mean
 *
 * The three computation states—FRESH, STALE, and PENDING—are crucial for managing the lifecycle of computations in a reactive system:
 *
 * - **FRESH (0):** The computation is up to date with all its source signals. It can be accessed without any recomputation.
 * - **STALE (1):** The computation has detected that one or more of its source signals have changed, indicating that it may need to recompute its value. However, it has not yet checked the states of its upstream dependencies.
 * - **PENDING (2):** The computation is waiting for its upstream dependencies to update. It cannot recompute until all its source signals are confirmed to be FRESH. This state helps prevent glitches by ensuring that computations only run when all their inputs are stable.
 *
 * **Why This Matters:**
 * - **Efficiency:** These states allow the system to minimize unnecessary recomputation by only updating computations when their inputs have changed and are stable.
 * - **Glitch prevention:** By managing the states carefully, the system can avoid temporary inconsistent states that could arise from partial updates.
 * - **Lazy evaluation:** Computations are only recomputed when accessed, allowing for more efficient use of resources.
 * - **Clear lifecycle management:** The states provide a clear framework for understanding when computations need to run and how they interact with their dependencies.
 * - **Predictable behavior:** Developers can reason about the state of computations and their dependencies, leading to more predictable application behavior.
 * - **Optimized scheduling:** The states facilitate efficient scheduling of updates, ensuring that computations are processed in the correct order.
 * - **Debugging aid:** The states provide insight into the current status of computations, aiding in debugging and performance tuning.
 *
 * ## Why multiple queues improve update order, and Why memos process before effects
 *
 * In a reactive system, using multiple queues for different types of computations—specifically separating memos (pure computations) from effects (impure computations)—improves update order and overall system performance:
 *
 * - **Correctness:** Memos compute derived values based on signals, and effects perform side effects based on those values. By processing memos first, the system ensures that effects always see the most up-to-date derived state, preventing inconsistencies.
 * - **Predictability:** Separating the queues allows for a clear execution order. Developers can reason about when memos will update relative to effects, leading to more predictable application behavior.
 * - **Performance:** Grouping similar work together (memos vs. effects) allows for more efficient batching and processing. The system can optimize the execution of each queue based on its specific characteristics.
 * - **Reduced complexity:** By having distinct queues, the scheduling logic becomes simpler, as each queue can be managed independently without needing to interleave different types of computations.
 * - **Improved responsiveness:** Effects can be deferred until after all memos have updated, allowing the system to respond more quickly to changes in signals without being bogged down by side effects.
 * - **Easier debugging:** With separate queues, it becomes easier to trace the flow of updates and identify potential issues related to the timing of computations.
 * - **Flexibility:** The system can be extended or modified more easily by adjusting the behavior of one queue without impacting the other.
 *
 * ## 📝 Key Takeaways
 *
 * - **Computation is central:** Everything is a Computation
 * - **Ownership prevents leaks:** Parent-child relationships auto-cleanup
 * - **Bidirectional is faster:** O(1) operations at scale
 * - **States enable laziness:** Don't recompute unless needed
 * - **Multiple queues ensure order:** Memos before effects
 */

/**
 * @fileoverview
 * ============================================================================
 * BIDIRECTIONAL LINKS
 * ============================================================================
 *
 * ## 📊 Bidirectional Links Explained
 *
 * ### The Data Structure
 *
 * ```
 * Signal A                          Effect X
 * ┌──────────────────┐             ┌──────────────────┐
 * │ observers: []    │             │ sources: []      │
 * │ observerSlots: []│             │ sourceSlots: []  │
 * └──────────────────┘             └──────────────────┘
 *
 * Adding Effect X to Signal A:
 * ────────────────────────────────────────────────────
 *
 * Step 1: Push references to each other
 * const srcIdxPos = effectX.sources.push(signalA);
 * const obsIdxPos = signalA.observers.push(effectX);
 *
 * Step 2: Store the index positions for O(1) removal later
 * // Effect remembers its position in Signal's observers
 * effectX.sourceSlots.push(obsIdxPos); // Will be at the index stored in `obsIdxPos`
 * // Signal remembers its position in Effect's sources
 * signalA.observerSlots.push(srcIdxPos); // effectX.sources[srcIdxPos] = signalA
 *
 * So can we say a slot is it's index in the other array?
 * Yes! `observerSlots[i] = index` in observers where this computation is stored
 * And vice versa, `sourceSlots[i] = index` in sources where this signal is stored
 *
 * Result:
 * ┌──────────────────┐             ┌──────────────────┐
 * │ observers: [X]   │◄────────────┤ sources: [A]     │
 * │ observerSlots[0] │             │ sourceSlots[0]   │
 * │       ↓          │             │       ↓          │
 * │   points to      │             │   points to      │
 * │   sources[0]     │─────────────┤   observers[0]   │
 * └──────────────────┘             └──────────────────┘
 * ```
 *
 * ### Multiple Dependencies
 *
 * ```
 * Signal A: observers=[E1, E2, E3], observerSlots=[0, 1, 0]
 * Signal B: observers=[E1, E3],     observerSlots=[1, 1]
 * Signal C: observers=[E2],         observerSlots=[0]
 *
 * Effect E1: sources=[A, B], sourceSlots=[0, 0]
 * Effect E2: sources=[C, A], sourceSlots=[0, 1]
 * Effect E3: sources=[A, B], sourceSlots=[2, 1]
 *
 * Verification:
 *   A.observers[0] = E1 ← E1.sources[0] = A ← A.observerSlots[0] = 0 ✓
 *   A.observers[1] = E2 ← E2.sources[0] = A ← A.observerSlots[1] = 1 ✓
 *   A.observers[2] = E3 ← E3.sources[0] = A ← A.observerSlots[2] = 0 ✓
 *   B.observers[0] = E1 ← E1.sources[1] = B ← B.observerSlots[0] = 1 ✓
 *   B.observers[1] = E3 ← E3.sources[1] = B ← B.observerSlots[1] = 1 ✓
 *   C.observers[0] = E2 ← E2.sources[1] = C ← C.observerSlots[0] = 0 ✓
 * ```
 *
 */

// ============================================================================
// CORE STATE TYPES
// ============================================================================

/**
 * Base options for various constructs
 */
export interface BaseOptions {
  /** Debug name */
  name?: string;
}

type Comparator<T> = (a: T, b: T) => boolean;
/**
 * Explicit state machine
 *
 * **State Transitions:**
 *
 * ```
 *
 *         Signal Update
 *             ↓
 *    [0] ────────────→ [1 STALE]
 *     ↑                    ↓
 *     │              Check Upstream
 *     │                    ↓
 *     │              Upstream STALE?
 *     │              ╱            ╲
 *     └─────── NO ──┘              └── YES → [2 PENDING]
 *    Recompute                              Wait...
 * ```
 *
 * **Why This Matters:**
 *
 * - Lazy evaluation: Only recompute when accessed
 * - Glitch-free: Prevents temporary inconsistent states
 * - Efficiency: Skip unnecessary work
 */
export type ComputationState = typeof FRESH | typeof STALE | typeof PENDING;

/**
 * Generic accessor function type
 * Returns a value of type T when called
 */
export type Accessor<T> = () => T;
/**
 * Generic setter function with multiple overloads
 * Can accept:
 * - A direct value
 * - An updater function (prev => next)
 */
export type Setter<T> = {
  // Overload 1: Updater function
  <U extends T>(value: (prev: T) => U): U;
  // Overload 2: Direct value (excluding functions to avoid ambiguity)
  <U extends T>(value: Exclude<U, Function>): U;
  // Overload 3: General case
  <U extends T>(value: Exclude<U, Function> | ((prev: T) => U)): U;
};
/**
 * Signal tuple: [getter, setter]
 */
export type Signal<T> = [get: Accessor<T>, set: Setter<T>];

// ============================================================================
// SIGNAL STATE
// ===
/**
 * Internal state for a signal
 * Contains the value and dependency tracking information
 */
export interface SignalState<T> {
  /** Current value of the signal */
  value: T;

  /** Computations that depend on this signal */
  observers: Computation<any, any>[] | null;

  /** Index of this signal in each observer's sources array (for O(1) removal) */
  observerSlots: number[] | null;

  /** Transition value (used during concurrent updates) */
  tValue?: T;

  /** Custom equality function to determine if value changed */
  comparator?: (prev: T, next: T) => boolean;

  /** Debug name (development only) */
  name?: string;
}
/**
 * Options when creating a signal
 */
export interface SignalOptions<T> extends BaseOptions {
  /** Custom equality check */
  equals?: false | ((prev: T, next: T) => boolean);

  /** Internal signal (skip dev hooks) */
  internal?: boolean;
}

// ============================================================================
// OWNERSHIP & CONTEXT
// ============================================================================

/**
 * Owner represents a reactive scope
 * All computations belong to an owner, forming a tree structure
 *
 * - **Memory safety:** Child computations automatically dispose
 * - **Context propagation:** Values flow down the tree
 * - **Debugging:** Can inspect the entire reactive graph
 *
 * ```
 * Root Owner
 *  ├── Effect Owner (owned by root)
 *  │   ├── Memo Owner (owned by effect)
 *  │   └── Nested Effect Owner
 *  └── Another Effect Owner
 * ```
 *
 * When root disposes → everything disposes (cascade)
 *
 */
export interface Owner {
  /** Child computations owned by this scope */
  owned: Computation<any>[] | null;

  /** Cleanup functions to run when this owner is disposed */
  cleanups: (() => void)[] | null;

  /** Parent owner in the tree */
  owner: Owner | null;

  /** Context values available to descendants */
  context: any | null;

  /** Debug name */
  name?: string;
}

/**
 * ============================================================================
 * COMPUTATION
 * ============================================================================
 *
 * ```js
 * // Effects (pure: false)
 * const effect: Computation<void> = {
 *   fn: () => console.log(count()),
 *   pure: false,
 *   sources: [countSignal],
 *   // ... no value cached
 * };
 *
 * // Memos (pure: true)
 * const memo: Memo<number> = {
 *   fn: () => count() * 2,
 *   pure: true,
 *   sources: [countSignal],
 *   observers: [someEffect], // Memos CAN be observed!
 *   value: 4, // Cached result
 * };
 * ```
 */

/**
 * Effect function signature
 * Receives previous value, returns next value
 */
export type EffectFunction<Prev, Next extends Prev = Prev> = (v: Prev) => Next;

export interface EffectOptions extends BaseOptions {
  // Future: Add more options here
}
/**
 * Computation represents all reactive computations (effects, memos, etc.)
 * Extends Owner because computations can own other computations
 */
export interface Computation<Init, Next extends Init = Init> extends Owner {
  /** The function to execute */
  fn: EffectFunction<Init, Next>;

  /** Current state (0=FRESH, 1=STALE, 2=PENDING) */
  state: ComputationState;

  /** Transition state (concurrent mode) */
  tState?: ComputationState;

  /** Signals this computation depends on */
  sources: SignalState<any>[] | null;

  /** Index of this computation in each source's observers array */
  sourceSlots: number[] | null;

  /** Cached value (for memos) */
  value?: Init;

  /** Last update timestamp (for glitch prevention) */
  updatedAt: number | null;

  /**
   * Is this a pure computation (memo) vs side effect?
   *
   * Memos ARE computations with pure=true
   *
   * Effects ARE computations with pure=false
   *
   * ## Why This Matters:
   *
   * - **Simpler code**: One type handles effects, memos, and render effects
   * - **Better performance**: No wrapper overhead
   * - **More features**: Memos can have observers (computed from memos)
   */
  pure: boolean;

  /** Is this a user effect (vs render effect)? */
  user?: boolean;
}

export interface MemoOptions<T> extends EffectOptions {
  equals?: false | ((prev: T, next: T) => boolean);
}
/**
 * Memo is a Computation that also acts as a Signal
 */
export interface Memo<Prev, Next = Prev>
  extends SignalState<Next>,
    Computation<Next> {
  value: Next; // Required (not optional like in Computation)
}

/**
 * ============================================================================
 * TRANSITIONS (CONCURRENT MODE)
 * ============================================================================
 *
 * ```js
 * // Normal update
 * signal.value = 5; // Effects run immediately
 *
 * // Transition update
 * startTransition(() => {
 *   signal.value = 5; // Stored in signal.tValue
 *   // Effects queued, not run yet
 *   // UI remains responsive!
 * });
 * ```
 */

/**
 * Tracks state during a concurrent transition
 */
export interface TransitionState {
  /** Signals being updated in this transition */
  sources: Set<SignalState<any>>;

  /** Effects to run after transition completes */
  effects: Computation<any>[];

  /** Pending promises */
  promises: Set<Promise<any>>;

  /** Disposed computations during transition */
  disposed: Set<Computation<any>>;

  /** Scheduled computations */
  queue: Set<Computation<any>>;

  /** Custom scheduler function */
  scheduler?: (fn: () => void) => unknown;

  /** Is transition currently running? */
  running: boolean;

  /** Promise that resolves when transition completes */
  done?: Promise<void>;

  /** Function to resolve the done promise */
  resolve?: () => void;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Prevents type inference at a specific site
 * Useful for complex generic scenarios
 */
export type NoInfer<T extends any> = [T][T extends any ? 0 : never];

/**
 * Root function signature
 * Receives dispose function, returns a value
 */
export type RootFunction<T> = (dispose: () => void) => T;

/**
 * Context interface
 */
export interface Context<T> {
  id: symbol;
  Provider: any; // Component type
  defaultValue: T;
}
