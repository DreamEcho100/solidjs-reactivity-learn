# Step 1: TypeScript Setup & Type Definitions

## 🎓 What We're Building

In this step, we'll:

1. Set up TypeScript configuration
2. Define core types that Solid.js uses
3. Create the foundation for type-safe reactivity

## 🤔 Why TypeScript?

Your current implementation uses JSDoc comments for types:

```javascript
/**
 * @typedef {{
 *   execute: () => void;
 *   subscriptions: Set<ReturnType<typeof createSignal>[0]>
 *   cleanups: (() => void)[]
 * }} Effect
 */
```

**Problems with this approach:**

- ❌ No compile-time checks
- ❌ Limited generic support
- ❌ IDE hints can be unreliable
- ❌ Harder to refactor

**TypeScript benefits:**

- ✅ Catches errors before runtime
- ✅ Better IDE autocomplete
- ✅ Self-documenting code
- ✅ Easier refactoring

## 📊 Type Hierarchy

Solid.js uses a hierarchy of types:

```
┌─────────────────────────────────────────┐
│           Base Types                     │
│  ┌───────────────────────────────────┐  │
│  │  Accessor<T> = () => T            │  │
│  │  Setter<T> = (v: T | (prev: T) => T) => T  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│         Computation State                │
│  ┌───────────────────────────────────┐  │
│  │  CLEAN = 0    (up to date)        │  │
│  │  STALE = 1    (needs update)      │  │
│  │  PENDING = 2  (dependency stale)  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│      Ownership & Computation             │
│  ┌───────────────────────────────────┐  │
│  │  Owner (parent-child tree)        │  │
│  │  Computation (reactive node)      │  │
│  │  SignalState (observable value)   │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## 💻 Implementation

### 1.1 Create `tsconfig.json`

Create this in your `project/` directory:

```json
{
  "compilerOptions": {
    /* Language and Environment */
    "target": "ES2020", // Modern JS features
    "lib": ["ES2020", "DOM"], // Include DOM types

    /* Modules */
    "module": "ESNext", // Use ES modules
    "moduleResolution": "node", // Node-style resolution
    "resolveJsonModule": true, // Allow importing JSON

    /* Emit */
    "declaration": true, // Generate .d.ts files
    "declarationMap": true, // Source maps for types
    "sourceMap": true, // Source maps for debugging
    "outDir": "./dist", // Output directory
    "removeComments": false, // Keep comments

    /* Type Checking */
    "strict": true, // Enable all strict checks
    "noImplicitAny": true, // No implicit any types
    "strictNullChecks": true, // Null safety
    "strictFunctionTypes": true, // Function type safety
    "strictBindCallApply": true, // Bind/call/apply safety
    "strictPropertyInitialization": true, // Class property init
    "noImplicitThis": true, // No implicit this
    "alwaysStrict": true, // Use strict mode

    /* Additional Checks */
    "noUnusedLocals": true, // Warn unused variables
    "noUnusedParameters": true, // Warn unused parameters
    "noImplicitReturns": true, // All paths return
    "noFallthroughCasesInSwitch": true, // Switch fallthrough check

    /* Interop */
    "esModuleInterop": true, // ES module interop
    "allowSyntheticDefaultImports": true, // Allow default imports
    "forceConsistentCasingInFileNames": true, // Case-sensitive imports

    /* Skip Library Checks */
    "skipLibCheck": true // Skip .d.ts checks
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.spec.ts"]
}
```

**Key settings explained:**

- `strict: true` - Enables all type safety features
- `target: ES2020` - Use modern JavaScript (async/await, optional chaining)
- `module: ESNext` - Use ES modules (import/export)
- `declaration: true` - Generate type definition files for library users

### 1.2 Create Type Definitions File

Create `src/reactive/types.ts`:

````typescript
/**
 * Core type definitions for the reactive system.
 * These types form the foundation of all reactive primitives.
 */

// ============================================================================
// FUNDAMENTAL TYPES
// ============================================================================

/**
 * A function that returns a value of type T.
 * Used for signal getters and computed values.
 *
 * @example
 * const count: Accessor<number> = () => 5;
 * console.log(count()); // 5
 */
export type Accessor<T> = () => T;

/**
 * A function that sets a value of type T.
 * Can accept either a new value or an updater function.
 *
 * @example
 * const setCount: Setter<number> = (v) => console.log(v);
 * setCount(5);           // Direct value
 * setCount(prev => prev + 1);  // Updater function
 */
export type Setter<T> = {
  // Overloads for different use cases
  <U extends T>(
    ...args: undefined extends T ? [] : [value: Exclude<U, Function> | ((prev: T) => U)]
  ): undefined extends T ? undefined : U;
  <U extends T>(value: (prev: T) => U): U;
  <U extends T>(value: Exclude<U, Function>): U;
  <U extends T>(value: Exclude<U, Function> | ((prev: T) => U)): U;
};

/**
 * A tuple of getter and setter for a signal.
 * This is what createSignal returns.
 */
export type Signal<T> = [get: Accessor<T>, set: Setter<T>];

// ============================================================================
// COMPUTATION STATE
// ============================================================================

/**
 * Represents the state of a computation (effect or memo).
 *
 * States explained:
 * - CLEAN (0):   Computation is up-to-date, no need to recompute
 * - STALE (1):   A dependency changed, needs recomputation
 * - PENDING (2): A dependency is stale but not yet updated
 *
 * @example
 * if (computation.state === STALE) {
 *   updateComputation(computation);
 * }
 */
export type ComputationState = 0 | 1 | 2;

// Export as constants for readability
export const CLEAN: ComputationState = 0;
export const STALE: ComputationState = 1;
export const PENDING: ComputationState = 2;

// ============================================================================
// OWNERSHIP SYSTEM
// ============================================================================

/**
 * Owner represents a reactive scope that can own other computations.
 * Forms a tree structure for automatic cleanup.
 *
 * Tree example:
 * ```
 * Root (Owner)
 *  ├─ Effect 1 (Computation + Owner)
 *  │   ├─ Memo 1 (Computation + Owner)
 *  │   └─ Effect 2 (Computation + Owner)
 *  └─ Effect 3 (Computation + Owner)
 * ```
 */
export interface Owner {
  /** Child computations owned by this owner */
  owned: Computation<any>[] | null;

  /** Cleanup functions to run when disposed */
  cleanups: (() => void)[] | null;

  /** Parent owner in the tree */
  owner: Owner | null;

  /** Context object for passing data down the tree */
  context: any | null;

  /** For dev tools: name of this owner */
  name?: string;

  /** For dev tools: source map for debugging */
  sourceMap?: SourceMapValue[];
}

/**
 * A computation is a reactive node that tracks dependencies
 * and re-executes when they change.
 *
 * Computations include:
 * - Effects (side effects)
 * - Memos (cached computations)
 */
export interface Computation<Init, Next extends Init = Init> extends Owner {
  /** The function to execute */
  fn: EffectFunction<Init, Next>;

  /** Current state (CLEAN/STALE/PENDING) */
  state: ComputationState;

  /** Transition state (for concurrent mode) */
  tState?: ComputationState;

  /** Signals this computation reads from */
  sources: SignalState<Next>[] | null;

  /** Index in each source's observers array (for O(1) removal) */
  sourceSlots: number[] | null;

  /** Cached value (for memos) or undefined (for effects) */
  value?: Init;

  /** Last time this computation was updated */
  updatedAt: number | null;

  /** Whether this is a pure computation (memo) or not (effect) */
  pure: boolean;

  /** Whether this is a user effect (runs after render effects) */
  user?: boolean;
}

/**
 * A Memo is a special computation that caches its value
 * and can have observers.
 */
export interface Memo<Init, Next extends Init = Init>
  extends SignalState<Next>, Computation<Init, Next> {
  value: Next;
  tOwned?: Computation<Init, Next>[];
}

/**
 * SignalState represents an observable value.
 * It tracks which computations depend on it.
 */
export interface SignalState<T> {
  /** Current value */
  value: T;

  /** Computations observing this signal */
  observers: Computation<any>[] | null;

  /** Index in each observer's sources array (for O(1) removal) */
  observerSlots: number[] | null;

  /** Transition value (for concurrent mode) */
  tValue?: T;

  /** Custom equality function */
  comparator?: (prev: T, next: T) => boolean;

  /** Name for debugging */
  name?: string;

  /** Whether this is an internal signal (not user-created) */
  internal?: boolean;
}

/**
 * For dev tools: represents a value in the source map.
 */
export interface SourceMapValue {
  value: unknown;
  name?: string;
  graph?: Owner;
}

// ============================================================================
// FUNCTION TYPES
// ============================================================================

/**
 * Function type for effects and memos.
 * Receives previous value, returns next value.
 */
export type EffectFunction<Prev, Next extends Prev = Prev> = (v: Prev) => Next;

/**
 * Function type for a root scope.
 * Receives a dispose function.
 */
export type RootFunction<T> = (dispose: () => void) => T;

/**
 * OnEffectFunction is used with the on() helper.
 * Receives current input, previous input, and previous value.
 */
export type OnEffectFunction<S, Prev, Next extends Prev = Prev> = (
  input: S,
  prevInput: S | undefined,
  prev: Prev
) => Next;

// ============================================================================
// OPTIONS TYPES
// ============================================================================

/**
 * Base options available for all reactive primitives.
 */
export interface BaseOptions {
  /** Name for debugging */
  name?: string;
}

/**
 * Options for createSignal.
 */
export interface SignalOptions<T> extends BaseOptions {
  /** Custom equality function (default: Object.is) */
  equals?: false | ((prev: T, next: T) => boolean);

  /** Whether this is an internal signal */
  internal?: boolean;
}

/**
 * Options for createEffect, createMemo, etc.
 */
export interface EffectOptions extends BaseOptions {}

/**
 * Options for createMemo (includes equality check).
 */
export interface MemoOptions<T> extends EffectOptions {
  equals?: false | ((prev: T, next: T) => boolean;
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Prevents type inference at usage sites.
 * Used to avoid generic parameter inference issues.
 *
 * @see https://github.com/microsoft/TypeScript/issues/14829
 */
export type NoInfer<T extends any> = [T][T extends any ? 0 : never];

/**
 * Transforms a tuple of values into a tuple of accessors.
 * Used for the on() helper.
 */
export type AccessorArray<T> = [
  ...Extract<{ [K in keyof T]: Accessor<T[K]> }, readonly unknown[]>
];
````

### 1.3 Update Package.json

Create or update `package.json`:

```json
{
  "name": "reactive-signals",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "node --loader ts-node/esm src/tests/index.ts"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "ts-node": "^10.9.0",
    "@types/node": "^20.0.0"
  }
}
```

Install dependencies:

```bash
npm install
```

## 🔍 Comparison: Your Code vs New Types

### Your Current Approach (JSDoc)

```javascript
/**
 * @typedef {{
 *   execute: () => void;
 *   subscriptions: Set<ReturnType<typeof createSignal>[0]>
 *   cleanups: (() => void)[]
 * }} Effect
 */
const effect = {
  execute: () => {},
  subscriptions: new Set(),
  cleanups: [],
};
```

**Problems:**

- Type is not reusable
- No compile-time checks
- `ReturnType<typeof createSignal>[0]` is verbose

### New TypeScript Approach

```typescript
interface Computation<T> {
  fn: EffectFunction<T>;
  state: ComputationState;
  sources: SignalState<any>[] | null;
  // ... more properties
}

const computation: Computation<number> = {
  fn: (prev) => prev + 1,
  state: CLEAN,
  sources: null,
  // TypeScript checks all properties!
};
```

**Benefits:**

- ✅ Reusable types
- ✅ Compile-time safety
- ✅ IDE autocomplete
- ✅ Refactoring support

## ✅ Testing

Create `src/tests/step1-types.ts`:

```typescript
import {
  Accessor,
  Setter,
  Signal,
  ComputationState,
  CLEAN,
  STALE,
  PENDING,
  Computation,
  Owner,
  SignalState,
} from "../reactive/types";

// Test 1: Basic accessor and setter
const testAccessor: Accessor<number> = () => 5;
console.log("✓ Accessor works:", testAccessor());

const testSetter: Setter<number> = (v) => {
  console.log("✓ Setter works:", v);
  return typeof v === "function" ? v(0) : v;
};
testSetter(10);
testSetter((prev) => prev + 1);

// Test 2: Computation states
const states: ComputationState[] = [CLEAN, STALE, PENDING];
console.log("✓ States defined:", states);

// Test 3: Type inference
function createMockSignal<T>(value: T): Signal<T> {
  const get: Accessor<T> = () => value;
  const set: Setter<T> = (v) => {
    value = typeof v === "function" ? (v as any)(value) : v;
    return value;
  };
  return [get, set];
}

const [count, setCount] = createMockSignal(0);
console.log("✓ Type inference works:", count());
setCount(5);
console.log("✓ Setter updates:", count());

console.log("\n✅ All type tests passed!");
```

Run:

```bash
npm run build && node dist/tests/step1-types.js
```

## 🎯 What We Achieved

- ✅ TypeScript project configured
- ✅ Core types defined
- ✅ Foundation for type-safe reactivity
- ✅ Better IDE support
- ✅ Compile-time error checking

## 🔗 Next Steps

Now that we have type foundations, we'll implement the **state machine** in Step 2, which uses these `ComputationState` types to track when computations need updates.

---

**Navigation**: [← Previous: Overview](./00-overview.md) | [Next: Step 2 →](./02-state-machine.md)
