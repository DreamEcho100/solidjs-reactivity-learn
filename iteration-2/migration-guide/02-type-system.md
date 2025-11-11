# Step 2: TypeScript Type System

## 🎯 Goal
Set up a complete, production-ready TypeScript type system for your reactive framework.

## 📋 Current vs. Target Types

### Your Current Types (JSDoc)

```javascript
/**
 * @template T
 * @typedef {object} SignalState
 * @property {T} value
 * @property {Computation<any>[]} observers
 * @property {number[] | null} observerSlots
 */

/**
 * @typedef {{
 *   execute: () => void;
 *   subscriptions: Set<ReturnType<typeof createSignal>[0]>
 *   cleanups: (() => void)[]
 * }} Effect
 */
```

### Solid.js TypeScript Types

```typescript
// Complete type system with generics, constraints, and utilities
```

## 🏗️ Building the Type System

### 1. Base Types

Create a new file: `types.ts`

```typescript
// ============================================================================
// CORE STATE TYPES
// ============================================================================

/**
 * Computation state enum
 * - 0 (Clean): Computation is up-to-date
 * - 1 (STALE): Needs recomputation
 * - 2 (PENDING): Waiting for upstream dependencies
 */
export type ComputationState = 0 | 1 | 2;

export const STALE = 1;
export const PENDING = 2;

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
```

**Why These Types:**
- `ComputationState`: Explicit state machine
- `Accessor<T>`: Type-safe getters with generics
- `Setter<T>`: Multiple overloads for flexibility
- `Signal<T>`: Tuple type for destructuring

### 2. Signal State

```typescript
// ============================================================================
// SIGNAL STATE
// ============================================================================

/**
 * Internal state for a signal
 * Contains the value and dependency tracking information
 */
export interface SignalState<T> {
  /** Current value of the signal */
  value: T;
  
  /** Computations that depend on this signal */
  observers: Computation<any>[] | null;
  
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
export interface SignalOptions<T> {
  /** Custom equality check */
  equals?: false | ((prev: T, next: T) => boolean);
  
  /** Debug name */
  name?: string;
  
  /** Internal signal (skip dev hooks) */
  internal?: boolean;
}
```

**Why These Fields:**
- `observers/observerSlots`: Bidirectional tracking
- `tValue`: Enables concurrent mode
- `comparator`: Custom change detection
- `name`: Development debugging

### 3. Owner & Context

```typescript
// ============================================================================
// OWNERSHIP & CONTEXT
// ============================================================================

/**
 * Owner represents a reactive scope
 * All computations belong to an owner, forming a tree structure
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
 * The UNOWNED singleton - represents computations without an owner
 */
export const UNOWNED: Owner = {
  owned: null,
  cleanups: null,
  context: null,
  owner: null
};
```

**Why Owner:**
```
Root Owner
 ├── Effect Owner (owned by root)
 │   ├── Memo Owner (owned by effect)
 │   └── Nested Effect Owner
 └── Another Effect Owner

When root disposes → everything disposes (cascade)
```

### 4. Computation

```typescript
// ============================================================================
// COMPUTATION
// ============================================================================

/**
 * Effect function signature
 * Receives previous value, returns next value
 */
export type EffectFunction<Prev, Next extends Prev = Prev> = (v: Prev) => Next;

/**
 * Computation represents all reactive computations (effects, memos, etc.)
 * Extends Owner because computations can own other computations
 */
export interface Computation<Init, Next extends Init = Init> extends Owner {
  /** The function to execute */
  fn: EffectFunction<Init, Next>;
  
  /** Current state (0=clean, 1=stale, 2=pending) */
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
  
  /** Is this a pure computation (memo) vs side effect? */
  pure: boolean;
  
  /** Is this a user effect (vs render effect)? */
  user?: boolean;
}

/**
 * Memo is a Computation that also acts as a Signal
 */
export interface Memo<Prev, Next = Prev> 
  extends SignalState<Next>, Computation<Next> {
  value: Next; // Required (not optional like in Computation)
}
```

**Why This Structure:**
```typescript
// Effects (pure: false)
const effect: Computation<void> = {
  fn: () => console.log(count()),
  pure: false,
  sources: [countSignal],
  // ... no value cached
};

// Memos (pure: true)
const memo: Memo<number> = {
  fn: () => count() * 2,
  pure: true,
  sources: [countSignal],
  observers: [someEffect], // Memos CAN be observed!
  value: 4, // Cached result
};
```

### 5. Effect Options

```typescript
// ============================================================================
// OPTIONS
// ============================================================================

export interface BaseOptions {
  name?: string;
}

export interface EffectOptions extends BaseOptions {
  // Future: Add more options here
}

export interface MemoOptions<T> extends EffectOptions {
  equals?: false | ((prev: T, next: T) => boolean);
}
```

### 6. Transition State (Concurrent Mode)

```typescript
// ============================================================================
// TRANSITIONS (CONCURRENT MODE)
// ============================================================================

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
```

**How Transitions Work:**
```typescript
// Normal update
signal.value = 5; // Effects run immediately

// Transition update
startTransition(() => {
  signal.value = 5; // Stored in signal.tValue
  // Effects queued, not run yet
  // UI remains responsive!
});
```

### 7. Advanced Types

```typescript
// ============================================================================
// ADVANCED UTILITY TYPES
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
```

## 🔄 Type Usage Examples

### Example 1: Type-Safe Signal

```typescript
// Inferred type
const [count, setCount] = createSignal(0);
// count: Accessor<number>
// setCount: Setter<number>

count(); // number
setCount(5); // OK
setCount(n => n + 1); // OK
setCount("hello"); // ❌ Error: Type 'string' not assignable

// Explicit type
const [name, setName] = createSignal<string | undefined>();
// Can be string or undefined
```

### Example 2: Type-Safe Effects

```typescript
// With return value (memo style)
createEffect<number>(() => {
  return count() * 2;
}); // Returns void, but tracks return type

// With previous value
createEffect<number>(prev => {
  console.log(`Changed from ${prev} to ${count()}`);
  return count();
}, 0); // Initial value: 0
```

### Example 3: Type-Safe Memos

```typescript
const doubled = createMemo(() => count() * 2);
// doubled: Accessor<number>

const parsed = createMemo<number | null>(() => {
  const val = input();
  return isNaN(val) ? null : Number(val);
});
// parsed: Accessor<number | null>
```

## 📦 Complete Type Definition File

Create `reactive-types.ts`:

```typescript
// ============================================================================
// REACTIVE SYSTEM TYPES
// ============================================================================

export type ComputationState = 0 | 1 | 2;
export const STALE = 1;
export const PENDING = 2;

export type Accessor<T> = () => T;

export type Setter<T> = {
  <U extends T>(value: (prev: T) => U): U;
  <U extends T>(value: Exclude<U, Function>): U;
  <U extends T>(value: Exclude<U, Function> | ((prev: T) => U)): U;
};

export type Signal<T> = [get: Accessor<T>, set: Setter<T>];

export type EffectFunction<Prev, Next extends Prev = Prev> = (v: Prev) => Next;

export interface SignalState<T> {
  value: T;
  observers: Computation<any>[] | null;
  observerSlots: number[] | null;
  tValue?: T;
  comparator?: (prev: T, next: T) => boolean;
  name?: string;
}

export interface Owner {
  owned: Computation<any>[] | null;
  cleanups: (() => void)[] | null;
  owner: Owner | null;
  context: any | null;
  name?: string;
}

export interface Computation<Init, Next extends Init = Init> extends Owner {
  fn: EffectFunction<Init, Next>;
  state: ComputationState;
  tState?: ComputationState;
  sources: SignalState<any>[] | null;
  sourceSlots: number[] | null;
  observers?: Computation<any>[] | null;
  observerSlots?: number[] | null;
  value?: Init;
  updatedAt: number | null;
  pure: boolean;
  user?: boolean;
}

export interface Memo<Prev, Next = Prev> 
  extends SignalState<Next>, Computation<Next> {
  value: Next;
}

export interface TransitionState {
  sources: Set<SignalState<any>>;
  effects: Computation<any>[];
  promises: Set<Promise<any>>;
  disposed: Set<Computation<any>>;
  queue: Set<Computation<any>>;
  scheduler?: (fn: () => void) => unknown;
  running: boolean;
  done?: Promise<void>;
  resolve?: () => void;
}

export interface SignalOptions<T> {
  equals?: false | ((prev: T, next: T) => boolean);
  name?: string;
  internal?: boolean;
}

export interface BaseOptions {
  name?: string;
}

export interface EffectOptions extends BaseOptions {}

export interface MemoOptions<T> extends EffectOptions {
  equals?: false | ((prev: T, next: T) => boolean);
}

export type NoInfer<T extends any> = [T][T extends any ? 0 : never];

export type RootFunction<T> = (dispose: () => void) => T;

export const UNOWNED: Owner = {
  owned: null,
  cleanups: null,
  context: null,
  owner: null
};
```

## ✅ Type Safety Benefits

### 1. Catch Errors Early
```typescript
const [count, setCount] = createSignal(0);

setCount("5"); // ❌ Caught at compile time!
```

### 2. Better IDE Support
```typescript
const doubled = createMemo(() => count() * 2);
doubled(). // ← IDE shows: number methods only
```

### 3. Refactoring Safety
```typescript
// Change signal type
const [items, setItems] = createSignal<string[]>([]); // was number[]

// All usages are now flagged as errors
items().forEach(item => {
  console.log(item.toFixed(2)); // ❌ String has no toFixed
});
```

## 📝 Migration Checklist

- [ ] Create `reactive-types.ts` with all type definitions
- [ ] Update your signal implementation to use typed interfaces
- [ ] Add generics to all function signatures
- [ ] Test type inference with various scenarios
- [ ] Enable strict mode in tsconfig.json

## 🚀 Next Step

Continue to **[03-ownership-model.md](./03-ownership-model.md)** to implement the ownership hierarchy.

---

**💡 Pro Tip**: Good types make your code self-documenting. If something feels complex to type, it might be complex to use!
