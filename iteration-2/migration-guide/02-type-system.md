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

## 🔧 TypeScript Configuration

### Recommended tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM"],
    "moduleResolution": "node",
    
    // Strict type checking
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    
    // Additional checks
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    
    // Output
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    
    // Module resolution
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    
    // Advanced
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

## 🎨 Advanced Type Patterns

### Pattern 1: Conditional Return Types

```typescript
/**
 * createSignal can accept undefined initial value
 * Return type adjusts based on whether value is provided
 */
export function createSignal<T>(): Signal<T | undefined>;
export function createSignal<T>(value: T, options?: SignalOptions<T>): Signal<T>;
export function createSignal<T>(
  value?: T,
  options?: SignalOptions<T>
): Signal<T | undefined> {
  // Implementation
}

// Usage:
const [name, setName] = createSignal<string>(); 
// name: Accessor<string | undefined> ✅

const [count, setCount] = createSignal(0);
// count: Accessor<number> ✅
```

### Pattern 2: Type Guards

```typescript
/**
 * Type guard to check if a node is a Computation
 */
export function isComputation(node: Owner): node is Computation<any> {
  return 'fn' in node && 'state' in node;
}

// Usage:
function processNode(node: Owner) {
  if (isComputation(node)) {
    // TypeScript knows node is Computation here
    console.log(node.state); // ✅ OK
  }
}
```

### Pattern 3: Mapped Types

```typescript
/**
 * Make all signals in an object reactive
 */
export type ReactiveObject<T> = {
  [K in keyof T]: Signal<T[K]>;
};

// Usage:
interface User {
  name: string;
  age: number;
}

const reactiveUser: ReactiveObject<User> = {
  name: createSignal("John"),
  age: createSignal(30)
};
```

### Pattern 4: Generic Constraints

```typescript
/**
 * Effect that works with readonly arrays
 */
export function createArrayEffect<T extends readonly any[]>(
  fn: (prev: T) => T,
  init: T
): void {
  // Implementation
}

// Usage:
createArrayEffect(
  prev => [...prev, 1],
  [1, 2, 3] as const // Readonly array ✅
);
```

## 🔍 Type Inference Examples

### Example 1: Complex Generic Inference

```typescript
// Solid.js can infer complex nested types
const [user, setUser] = createSignal({
  name: "John",
  age: 30,
  friends: ["Alice", "Bob"]
});

// Inferred type:
// Accessor<{
//   name: string;
//   age: number;
//   friends: string[];
// }>

setUser(prev => ({
  ...prev,
  age: prev.age + 1 // ✅ Knows age is number
}));

setUser({ name: "Jane", age: "25", friends: [] }); 
// ❌ Error: age must be number
```

### Example 2: Discriminated Unions

```typescript
type State = 
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: string }
  | { status: "error"; error: Error };

const [state, setState] = createSignal<State>({ status: "idle" });

createEffect(() => {
  const s = state();
  
  if (s.status === "success") {
    console.log(s.data); // ✅ TypeScript knows data exists
  }
  
  if (s.status === "idle") {
    console.log(s.data); // ❌ Error: data doesn't exist on idle
  }
});
```

### Example 3: Function Overloads

```typescript
// Setter handles both direct values and updater functions
const [count, setCount] = createSignal(0);

setCount(5); // ✅ Direct value
setCount(n => n + 1); // ✅ Updater function
setCount(() => 5); // ✅ Also works (but why? 😄)

const [items, setItems] = createSignal<number[]>([]);
setItems([1, 2, 3]); // ✅ Direct value
setItems(prev => [...prev, 4]); // ✅ Updater function
```

## 🛡️ Runtime Type Safety

### Adding Runtime Checks

```typescript
/**
 * Create signal with runtime type validation
 */
export function createTypedSignal<T>(
  value: T,
  validator: (value: unknown) => value is T,
  options?: SignalOptions<T>
): Signal<T> {
  const [get, set] = createSignal(value, options);
  
  return [
    get,
    (nextValue) => {
      const val = typeof nextValue === 'function'
        ? nextValue(get())
        : nextValue;
        
      if (!validator(val)) {
        throw new TypeError(`Invalid value: ${val}`);
      }
      
      return set(val);
    }
  ];
}

// Usage:
const isNumber = (val: unknown): val is number => typeof val === 'number';
const [count, setCount] = createTypedSignal(0, isNumber);

setCount(5); // ✅ OK
setCount("5" as any); // ❌ Throws TypeError at runtime!
```

## 📊 Type Complexity Analysis

### Simple Types (Low Complexity)
```typescript
type Accessor<T> = () => T;
// ✅ Easy to understand
// ✅ Fast compilation
// ✅ Clear errors
```

### Medium Types (Moderate Complexity)
```typescript
type Setter<T> = {
  <U extends T>(value: (prev: T) => U): U;
  <U extends T>(value: Exclude<U, Function>): U;
};
// ⚠️ Multiple overloads
// ⚠️ Generic constraints
// ✅ Still manageable
```

### Complex Types (High Complexity)
```typescript
interface Computation<Init, Next extends Init = Init> extends Owner {
  fn: EffectFunction<Init, Next>;
  // ...
}
// ⚠️ Multiple generics
// ⚠️ Generic constraints
// ⚠️ Interface extension
// ⚠️ Slower compilation
// Use only when necessary!
```

## 🎓 Learning Path for Types

### Week 1: Basic Types
- [ ] Learn `Accessor<T>` and `Setter<T>`
- [ ] Understand `Signal<T>` tuple type
- [ ] Practice with `SignalOptions<T>`
- [ ] Write simple typed signals

### Week 2: Intermediate Types
- [ ] Study `Owner` and `Computation` interfaces
- [ ] Understand bidirectional tracking types
- [ ] Learn `ComputationState` enum
- [ ] Implement typed effects

### Week 3: Advanced Types
- [ ] Master `TransitionState` interface
- [ ] Understand `Memo<Prev, Next>` type
- [ ] Learn generic constraints
- [ ] Use conditional types

### Week 4: Expert Types
- [ ] Type guards and narrowing
- [ ] Mapped types for utilities
- [ ] Advanced generic patterns
- [ ] Performance optimization

## 📝 Migration Checklist

### Phase 1: Setup
- [ ] Create `reactive-types.ts` with all type definitions
- [ ] Configure `tsconfig.json` with strict mode
- [ ] Install type dependencies (`@types/node`, etc.)
- [ ] Set up linting with TypeScript rules

### Phase 2: Core Types
- [ ] Define `ComputationState`, `STALE`, `PENDING`
- [ ] Create `Accessor<T>` and `Setter<T>` types
- [ ] Implement `Signal<T>` tuple type
- [ ] Add `SignalState<T>` interface

### Phase 3: Advanced Types
- [ ] Define `Owner` interface
- [ ] Create `Computation<Init, Next>` interface
- [ ] Add `Memo<Prev, Next>` type
- [ ] Implement `TransitionState`

### Phase 4: Options & Utilities
- [ ] Add `SignalOptions<T>` interface
- [ ] Create `EffectOptions` and `MemoOptions`
- [ ] Define `RootFunction<T>` type
- [ ] Add utility types (`NoInfer`, etc.)

### Phase 5: Validation
- [ ] Test type inference with various scenarios
- [ ] Verify strict null checks work
- [ ] Check error messages are clear
- [ ] Ensure no `any` types escape
- [ ] Run `tsc --noEmit` successfully

## ✅ Self-Check Questions

1. **Q:** Why does `Setter<T>` have multiple overloads?
   **A:** To handle both direct values and updater functions correctly.

2. **Q:** What's the difference between `Computation` and `Memo`?
   **A:** Memo extends both Computation and SignalState, has required `value`.

3. **Q:** When should you use `NoInfer<T>`?
   **A:** To prevent unwanted type inference in generic function parameters.

4. **Q:** Why is `ComputationState` a union of literals (0 | 1 | 2)?
   **A:** More type-safe than enum, better for minification, explicit values.

5. **Q:** How does `Owner` differ from `Computation`?
   **A:** Owner is the base, Computation extends it with reactive tracking.

## 🚀 Next Step

Continue to **[03-ownership-model.md](./03-ownership-model.md)** to implement the ownership hierarchy using these types.

---

**💡 Pro Tip**: Good types make your code self-documenting. If something feels complex to type, it might be complex to use! Start simple, add complexity only when needed. Use type inference where possible, explicit types where clarity is important.
