# Project Requirements: Building ReactiveCore

## Executive Summary

You will build **ReactiveCore**, a production-ready reactive library that implements fine-grained reactivity following Solid.js's architecture. The library must be:

- ✅ **Complete**: All core primitives implemented
- ✅ **Tested**: 100% code coverage with comprehensive tests
- ✅ **Typed**: Full TypeScript support with strict types
- ✅ **Documented**: API docs, guides, and examples
- ✅ **Performant**: Meets or exceeds benchmarks
- ✅ **Publishable**: Ready for npm with proper packaging

## Core Requirements

### 1. Reactive Primitives (Required)

#### 1.1 Signals

```typescript
function createSignal<T>(
  initialValue: T,
  options?: SignalOptions<T>
): [Accessor<T>, Setter<T>]

interface SignalOptions<T> {
  equals?: false | ((prev: T, next: T) => boolean);
  name?: string;
  internal?: boolean;
}
```

**Requirements**:
- ✅ Create reactive state
- ✅ Automatic dependency tracking
- ✅ Custom equality functions
- ✅ Function setters: `set(prev => prev + 1)`
- ✅ Bidirectional observer/source tracking
- ✅ O(1) cleanup operations

**Tests Required**:
- Basic creation and reading
- Setting values
- Function updates
- Custom equality
- Dependency tracking
- Memory cleanup

#### 1.2 Effects

```typescript
function createEffect<T>(
  fn: (prev: T) => T,
  value?: T,
  options?: EffectOptions
): void

function createRenderEffect<T>(
  fn: (prev: T) => T,
  value?: T,
  options?: EffectOptions
): void

function createComputed<T>(
  fn: (prev: T) => T,
  value?: T,
  options?: EffectOptions
): void
```

**Requirements**:
- ✅ Three execution timing modes
- ✅ Automatic cleanup and re-tracking
- ✅ Previous value passing
- ✅ Proper disposal
- ✅ Error handling
- ✅ Suspense integration

**Tests Required**:
- Immediate execution
- Dependency tracking
- Previous value handling
- Cleanup on dispose
- Re-tracking on updates
- Timing differences between modes

#### 1.3 Memos

```typescript
function createMemo<T>(
  fn: (prev: T) => T,
  value?: T,
  options?: MemoOptions<T>
): Accessor<T>

interface MemoOptions<T> extends EffectOptions {
  equals?: false | ((prev: T, next: T) => boolean);
}
```

**Requirements**:
- ✅ Cached derived state
- ✅ Only recomputes when dependencies change
- ✅ Can have observers (it's also a signal)
- ✅ Custom equality
- ✅ Lazy evaluation

**Tests Required**:
- Caching behavior
- Recomputation only on dependency changes
- Custom equality
- Nested memos
- Diamond dependencies

### 2. Ownership and Lifecycle (Required)

#### 2.1 createRoot

```typescript
function createRoot<T>(
  fn: (dispose: () => void) => T,
  detachedOwner?: Owner
): T
```

**Requirements**:
- ✅ Create isolated reactive scope
- ✅ Return dispose function
- ✅ Support detached owners
- ✅ Automatic cleanup on dispose

**Tests Required**:
- Scope isolation
- Proper disposal
- Nested roots
- Detached owners

#### 2.2 onCleanup

```typescript
function onCleanup(fn: () => void): void
```

**Requirements**:
- ✅ Register cleanup function
- ✅ Run on scope disposal
- ✅ Run before re-execution
- ✅ Multiple cleanups per scope

**Tests Required**:
- Single cleanup
- Multiple cleanups
- Cleanup order
- Cleanup on disposal
- Cleanup before re-run

#### 2.3 Context System

```typescript
function createContext<T>(
  defaultValue?: T,
  options?: ContextOptions
): Context<T>

function useContext<T>(context: Context<T>): T

interface Context<T> {
  id: symbol;
  Provider: Component<{ value: T }>;
  defaultValue: T;
}
```

**Requirements**:
- ✅ Symbol-based identification
- ✅ Provider component
- ✅ useContext consumer
- ✅ Context inheritance
- ✅ Default values

**Tests Required**:
- Basic provider/consumer
- Nested providers
- Default values
- Multiple contexts
- Context updates

### 3. Control Flow (Required)

#### 3.1 Batch Updates

```typescript
function batch<T>(fn: () => T): T
```

**Requirements**:
- ✅ Batch multiple signal updates
- ✅ Single update cycle
- ✅ Return function result

**Tests Required**:
- Multiple updates batched
- Nested batches
- Effect runs once after batch

#### 3.2 Untrack

```typescript
function untrack<T>(fn: () => T): T
```

**Requirements**:
- ✅ Read signals without tracking
- ✅ Nested untrack calls
- ✅ Return function result

**Tests Required**:
- Reading without tracking
- Nested untrack
- Mixed tracked/untracked

#### 3.3 On Helper

```typescript
function on<S, T>(
  deps: Accessor<S> | Accessor<S>[],
  fn: (value: S, prev: S, prevResult: T) => T,
  options?: { defer?: boolean }
): (prev: T) => T
```

**Requirements**:
- ✅ Explicit dependencies
- ✅ Single or array of dependencies
- ✅ Defer option
- ✅ Returns effect function

**Tests Required**:
- Single dependency
- Multiple dependencies
- Defer behavior
- Used with createEffect

### 4. Scheduling System (Required)

#### 4.1 Task Queue

```typescript
function requestCallback(
  fn: () => void,
  options?: { timeout?: number }
): Task

function cancelCallback(task: Task): void

interface Task {
  id: number;
  fn: (() => void) | null;
  startTime: number;
  expirationTime: number;
}
```

**Requirements**:
- ✅ MessageChannel-based scheduling
- ✅ Priority queue
- ✅ Expiration times
- ✅ Yielding to browser
- ✅ Input pending detection (when available)
- ✅ Task cancellation

**Tests Required**:
- Task scheduling
- Priority ordering
- Yielding behavior
- Cancellation
- Timeout handling

#### 4.2 Update Propagation

```typescript
// Internal functions
function runUpdates<T>(fn: () => T, init: boolean): T
function completeUpdates(wait: boolean): void
function runQueue(queue: Computation[]): void
```

**Requirements**:
- ✅ STALE/PENDING/FRESH state management
- ✅ Topological sorting
- ✅ lookUpstream optimization
- ✅ markDownstream propagation
- ✅ Infinite loop detection

**Tests Required**:
- State transitions
- Update ordering
- Diamond dependencies
- Infinite loop detection
- Nested updates

### 5. Transitions (Required)

#### 5.1 startTransition

```typescript
function startTransition(fn: () => void): Promise<void>
```

**Requirements**:
- ✅ Concurrent rendering
- ✅ tValue/tState management
- ✅ Promise tracking
- ✅ Disposal tracking
- ✅ Resolution when complete

**Tests Required**:
- Basic transition
- Nested transitions
- Promise completion
- Disposal during transition
- Rollback behavior

#### 5.2 useTransition

```typescript
function useTransition(): [
  Accessor<boolean>,
  (fn: () => void) => Promise<void>
]
```

**Requirements**:
- ✅ Pending state signal
- ✅ Start transition function
- ✅ Promise return

**Tests Required**:
- Pending state updates
- Transition completion
- Multiple transitions

### 6. Array Helpers (Required)

#### 6.1 mapArray

```typescript
function mapArray<T, U>(
  list: Accessor<T[]>,
  mapFn: (item: T, index: Accessor<number>) => U,
  options?: { fallback?: Accessor<any> }
): Accessor<U[]>
```

**Requirements**:
- ✅ Index-based reconciliation
- ✅ Minimal re-renders
- ✅ Index signals
- ✅ Fallback support
- ✅ Disposal management

**Tests Required**:
- Basic mapping
- Item updates
- Reordering
- Additions/removals
- Fallback rendering

#### 6.2 indexArray

```typescript
function indexArray<T, U>(
  list: Accessor<T[]>,
  mapFn: (item: Accessor<T>, index: number) => U,
  options?: { fallback?: Accessor<any> }
): Accessor<U[]>
```

**Requirements**:
- ✅ Value-based reconciliation
- ✅ Value signals
- ✅ Index stability
- ✅ Fallback support

**Tests Required**:
- Basic mapping
- Value updates
- Reordering
- Index stability

### 7. Resources (Required)

#### 7.1 createResource

```typescript
function createResource<T, S>(
  source: Accessor<S>,
  fetcher: (source: S, info: ResourceFetcherInfo<T>) => T | Promise<T>,
  options?: ResourceOptions<T>
): ResourceReturn<T>

type ResourceReturn<T> = [
  Resource<T>,
  {
    mutate: Setter<T>;
    refetch: () => void;
  }
]
```

**Requirements**:
- ✅ Five resource states
- ✅ Source-based fetching
- ✅ Refetch capability
- ✅ Mutate (manual updates)
- ✅ Suspense integration
- ✅ SSR support
- ✅ Error handling

**Tests Required**:
- All five states
- Source changes
- Refetching
- Mutation
- Error handling
- Suspense integration

### 8. Observables (Required)

#### 8.1 Observable Creation

```typescript
function observable<T>(signal: Accessor<T>): Observable<T>
```

**Requirements**:
- ✅ Symbol.observable support
- ✅ Subscribe method
- ✅ Unsubscribe cleanup
- ✅ Observer callback

**Tests Required**:
- Basic subscription
- Multiple subscriptions
- Unsubscribe
- Error handling

#### 8.2 From Observable

```typescript
function from<T>(
  producer: Observable<T> | ((set: Setter<T>) => () => void)
): Accessor<T>
```

**Requirements**:
- ✅ Create signal from observable
- ✅ Cleanup on disposal
- ✅ Support RxJS observables

**Tests Required**:
- From observable
- From producer function
- Cleanup
- RxJS integration

### 9. Developer Tools (Required)

#### 9.1 DevHooks

```typescript
interface DevHooks {
  afterUpdate?: () => void;
  afterCreateOwner?: (owner: Owner) => void;
  afterCreateSignal?: (signal: SignalState<any>) => void;
  afterRegisterGraph?: (value: SourceMapValue) => void;
}
```

**Requirements**:
- ✅ Hook system for dev tools
- ✅ Graph registration
- ✅ Owner tracking
- ✅ Update notifications

**Tests Required**:
- Hook invocation
- Graph building
- Owner hierarchy

#### 9.2 Debug Names

**Requirements**:
- ✅ Name option on all primitives
- ✅ Source maps in dev mode
- ✅ Computation naming

## Performance Benchmarks

Your implementation must meet these targets:

### Micro-Benchmarks

| Operation | Target | Notes |
|-----------|--------|-------|
| Signal creation | < 5μs | Without tracking |
| Signal read (untracked) | < 0.1μs | Just value access |
| Signal read (tracked) | < 1μs | With dependency tracking |
| Signal write (no observers) | < 1μs | Just value update |
| Signal write (10 observers) | < 100μs | With propagation |
| Effect creation | < 50μs | Initial setup |
| Effect execution (simple) | < 100μs | Simple computation |
| Memo cache hit | < 1μs | No recomputation |
| Memo recomputation | < 100μs | With propagation |

### Macro-Benchmarks

| Scenario | Target | Notes |
|----------|--------|-------|
| 1000 signals | < 5ms | Creation time |
| 100 derived memos | < 10ms | Diamond dependency |
| List of 100 items | < 5ms | First render |
| Update 1 of 100 items | < 1ms | Minimal update |
| Batch 100 updates | < 10ms | Should be optimized |

### Memory Benchmarks

| Metric | Target | Notes |
|--------|--------|-------|
| Signal overhead | < 200 bytes | Base + arrays |
| Effect overhead | < 300 bytes | With ownership |
| 1000 signals | < 200KB | Total memory |
| No leaks | 0 after dispose | Must cleanup |

## Testing Requirements

### Unit Tests

Minimum 95% code coverage for:

- ✅ All public APIs
- ✅ Internal functions
- ✅ Edge cases
- ✅ Error conditions

### Integration Tests

Test interactions between:

- ✅ Signals and effects
- ✅ Memos and effects
- ✅ Transitions and updates
- ✅ Resources and suspense
- ✅ Context and ownership

### Performance Tests

Benchmark suite covering:

- ✅ All micro-benchmarks
- ✅ All macro-benchmarks
- ✅ Memory profiling
- ✅ Comparison with Solid.js

### Manual Testing

Real applications:

- ✅ Counter app
- ✅ Todo list
- ✅ Data fetching demo
- ✅ Large list rendering
- ✅ Complex state management

## Documentation Requirements

### API Documentation

For each primitive:

- ✅ Function signature
- ✅ Parameter descriptions
- ✅ Return value description
- ✅ Usage examples
- ✅ Edge cases
- ✅ Performance notes

### Guides

- ✅ Getting started
- ✅ Core concepts
- ✅ Advanced patterns
- ✅ Migration from Solid
- ✅ Best practices
- ✅ Troubleshooting

### Examples

Provide working examples for:

- ✅ Each primitive
- ✅ Common patterns
- ✅ Real applications
- ✅ Integration scenarios

## Packaging Requirements

### Build Outputs

- ✅ ESM build (`dist/index.js`)
- ✅ CJS build (`dist/index.cjs`)
- ✅ Type definitions (`dist/index.d.ts`)
- ✅ Source maps for all builds
- ✅ Minified production build

### Package.json

```json
{
  "name": "reactive-core",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "sideEffects": false
}
```

### npm Requirements

- ✅ Published to npm
- ✅ README with badges
- ✅ LICENSE file (MIT)
- ✅ CHANGELOG
- ✅ Keywords for discovery

## Grading Rubric

### Implementation (40 points)

- Core primitives (signals, effects, memos): 15 pts
- Scheduling system: 10 pts
- Transitions: 5 pts
- Arrays: 5 pts
- Resources: 5 pts

### Code Quality (20 points)

- Clean, readable code: 7 pts
- Proper TypeScript types: 7 pts
- No memory leaks: 6 pts

### Testing (20 points)

- Unit test coverage (>95%): 10 pts
- Integration tests: 5 pts
- Performance benchmarks: 5 pts

### Documentation (10 points)

- API documentation: 5 pts
- Examples and guides: 5 pts

### Performance (10 points)

- Meets all benchmarks: 10 pts

**Total: 100 points**

**Passing grade: 70 points**

## Submission

Submit via:

1. GitHub repository (public)
2. npm package (published)
3. Documentation site (GitHub Pages)
4. Presentation (optional)

Include:

- ✅ README with setup instructions
- ✅ All source code
- ✅ All tests
- ✅ All documentation
- ✅ Example applications
- ✅ Benchmark results

## Timeline

- Week 1: Core primitives + scheduling
- Week 2: Advanced features + polish
- Final: Submit and present

Good luck! 🚀
