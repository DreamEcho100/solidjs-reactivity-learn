# Lesson 1: Final Project Overview and Architecture

## Introduction

Welcome to the capstone project! This is where everything comes together. You'll build a complete reactive library from scratch, implementing every pattern and technique you've learned throughout this course.

## What You'll Build

### Project Name: **ReactiveCore**

A production-ready, TypeScript-based reactive library that implements:

1. **Core Primitives**: Signals, Effects, Memos, Computed
2. **Scheduling System**: Priority-based task queue
3. **Transitions**: Concurrent rendering support
4. **Arrays**: Efficient list reconciliation
5. **Resources**: Async data management
6. **Context**: Component-level state sharing
7. **Observables**: RxJS integration
8. **Dev Tools**: Debugging and visualization

## Architecture Overview

### System Layers

```
┌─────────────────────────────────────────────────┐
│            Application Layer                    │
│  (User Code using your reactive primitives)    │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│            Public API Layer                     │
│  createSignal, createEffect, createMemo, etc.  │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│          Reactive Core Layer                    │
│  Computation, Tracking, Update Propagation     │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│          Scheduler Layer                        │
│  Task Queue, Batching, Priority Management     │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│          Runtime Layer                          │
│  MessageChannel, Performance API, Browser APIs  │
└─────────────────────────────────────────────────┘
```

### Core Data Structures

#### 1. SignalState

The fundamental reactive primitive:

```typescript
interface SignalState<T> {
  // Current value
  value: T;
  
  // List of computations observing this signal
  observers: Computation<any>[] | null;
  
  // Indices where this signal appears in each observer's sources
  observerSlots: number[] | null;
  
  // Custom equality function
  comparator?: (prev: T, next: T) => boolean;
  
  // Transition value (for concurrent rendering)
  tValue?: T;
  
  // Dev mode name for debugging
  name?: string;
}
```

**Key Insight**: The bidirectional tracking (observers + observerSlots) allows O(1) removal during cleanup.

#### 2. Computation

Reactive computations (effects, memos):

```typescript
interface Computation<Init, Next extends Init = Init> {
  // The function to execute
  fn: EffectFunction<Init, Next>;
  
  // Current state: 0 (fresh), STALE, or PENDING
  state: ComputationState;
  
  // Transition state (for concurrent rendering)
  tState?: ComputationState;
  
  // Signals this computation reads
  sources: SignalState<any>[] | null;
  
  // Indices where this computation appears in each source's observers
  sourceSlots: number[] | null;
  
  // Current computed value
  value?: Init;
  
  // Last update timestamp
  updatedAt: number | null;
  
  // Is this a pure computation (memo)?
  pure: boolean;
  
  // Is this a user effect?
  user?: boolean;
  
  // Owner (parent scope)
  owner: Owner | null;
  
  // Child scopes
  owned: Computation<any>[] | null;
  
  // Cleanup functions
  cleanups: (() => void)[] | null;
  
  // Context data
  context: any | null;
}
```

**Key Insight**: Computations are both observers (they have sources) and observables (they can have observers if they're memos).

#### 3. Owner

Represents a reactive scope:

```typescript
interface Owner {
  // Child computations
  owned: Computation<any>[] | null;
  
  // Cleanup functions
  cleanups: (() => void)[] | null;
  
  // Parent owner
  owner: Owner | null;
  
  // Context values
  context: any | null;
  
  // Dev mode: source map for visualization
  sourceMap?: SourceMapValue[];
  
  // Dev mode: debug name
  name?: string;
}
```

**Key Insight**: Ownership creates a tree structure that enables automatic cleanup.

#### 4. TransitionState

Manages concurrent updates:

```typescript
interface TransitionState {
  // Signals being updated in transition
  sources: Set<SignalState<any>>;
  
  // Effects to run after transition
  effects: Computation<any>[];
  
  // Promises being tracked
  promises: Set<Promise<any>>;
  
  // Disposed computations during transition
  disposed: Set<Computation<any>>;
  
  // Queued computations
  queue: Set<Computation<any>>;
  
  // Custom scheduler for this transition
  scheduler?: (fn: () => void) => unknown;
  
  // Is transition currently running?
  running: boolean;
  
  // Promise that resolves when transition completes
  done?: Promise<void>;
  
  // Resolver for done promise
  resolve?: () => void;
}
```

**Key Insight**: Transitions maintain separate value/state (tValue/tState) to enable rollback.

### Global State

The reactive system maintains several pieces of global state:

```typescript
// Current reactive owner (scope)
let Owner: Owner | null = null;

// Current listening computation
let Listener: Computation<any> | null = null;

// Current transition (if any)
let Transition: TransitionState | null = null;

// Queue of computations to update
let Updates: Computation<any>[] | null = null;

// Queue of effects to run
let Effects: Computation<any>[] | null = null;

// Execution counter (for versioning)
let ExecCount = 0;

// Task scheduler function
let Scheduler: ((fn: () => void) => any) | null = null;
```

## Execution Flow

### 1. Signal Read

```
User calls signal()
    ↓
readSignal() is called
    ↓
Check if Listener exists
    ↓
If yes: Add this signal to Listener.sources
        Add Listener to this.observers
    ↓
Return this.value
```

### 2. Signal Write

```
User calls setSignal(newValue)
    ↓
writeSignal() is called
    ↓
Compare with current value
    ↓
If different:
    Update this.value
    ↓
    Mark all observers as STALE
    ↓
    Add pure observers to Updates queue
    Add impure observers to Effects queue
    ↓
    Schedule update flush
```

### 3. Update Propagation

```
runUpdates() is called
    ↓
For each computation in Updates:
    ↓
    runTop() - check ancestors
    ↓
    updateComputation()
        ↓
        cleanNode() - remove old dependencies
        ↓
        runComputation()
            ↓
            Set Owner = computation
            Set Listener = computation
            ↓
            Execute fn(currentValue)
            ↓
            Restore Owner and Listener
        ↓
        Update value if changed
        ↓
        Notify observers if value changed
    ↓
Flush Effects queue
```

## Implementation Strategy

### Phase 1: Foundation (Days 1-3)

**Goal**: Get basic reactivity working

1. **Day 1**: Signal implementation
   - SignalState structure
   - readSignal function
   - writeSignal function
   - Basic tests

2. **Day 2**: Effect implementation
   - Computation structure
   - createComputation function
   - runComputation function
   - Dependency tracking

3. **Day 3**: Ownership and cleanup
   - Owner structure
   - createRoot
   - onCleanup
   - cleanNode function

**Milestone**: You can create signals and effects that properly track dependencies.

### Phase 2: Scheduling (Days 4-5)

**Goal**: Proper update batching and timing

1. **Day 4**: Update queues
   - Updates and Effects arrays
   - runUpdates function
   - completeUpdates function
   - State propagation (STALE/PENDING)

2. **Day 5**: Scheduler
   - Task structure
   - MessageChannel setup
   - requestCallback function
   - Priority handling

**Milestone**: Updates are batched and scheduled efficiently.

### Phase 3: Advanced Primitives (Days 6-8)

**Goal**: All core primitives working

1. **Day 6**: Memos
   - Memo as computation + signal
   - Caching logic
   - Comparison functions

2. **Day 7**: Batch and untrack
   - batch() implementation
   - untrack() implementation
   - on() helper

3. **Day 8**: Selector
   - createSelector implementation
   - O(2) update optimization

**Milestone**: All basic reactive primitives functional.

### Phase 4: Transitions (Days 9-10)

**Goal**: Concurrent rendering support

1. **Day 9**: TransitionState
   - tValue and tState
   - Transition lifecycle
   - Source tracking

2. **Day 10**: startTransition
   - Transition scheduling
   - Promise tracking
   - Completion resolution

**Milestone**: Concurrent updates work without blocking.

### Phase 5: Collections (Days 11-12)

**Goal**: Efficient array rendering

1. **Day 11**: mapArray
   - Reconciliation algorithm
   - Index signals
   - Disposer management

2. **Day 12**: indexArray
   - Value-based reconciliation
   - Signal setters for values

**Milestone**: Lists render with minimal updates.

### Phase 6: Resources (Days 13-14)

**Goal**: Async data management

1. **Day 13**: Resource core
   - Resource states
   - Fetcher pattern
   - Promise handling

2. **Day 14**: Suspense
   - SuspenseContext
   - Increment/decrement pattern
   - Fallback rendering

**Milestone**: Async data integrated with reactivity.

### Phase 7: Context & Observables (Day 15)

**Goal**: Complete the API surface

1. **Context system**
   - Symbol-based identification
   - Provider implementation
   - Consumer (useContext)

2. **Observable integration**
   - observable() function
   - from() function
   - RxJS interop

**Milestone**: Full API compatibility.

### Phase 8: Testing & Polish (Days 16-17)

**Goal**: Production quality

1. **Day 16**: Comprehensive tests
   - Unit tests for each primitive
   - Integration tests
   - Edge case coverage

2. **Day 17**: Documentation
   - API docs
   - Usage examples
   - Migration guide

**Milestone**: Production-ready library.

### Phase 9: Packaging (Day 18)

**Goal**: Publishable package

1. **Build setup**
   - TypeScript compilation
   - Rollup bundling
   - Minification

2. **Package configuration**
   - package.json
   - Type definitions
   - Entry points

**Milestone**: Published to npm.

### Phase 10: Examples (Days 19-20)

**Goal**: Demonstrate capabilities

1. **Simple apps**
   - Counter
   - Todo list
   - Form handling

2. **Complex apps**
   - Data fetching
   - Real-time updates
   - Large lists

**Milestone**: Portfolio-ready project.

## Design Decisions to Make

### 1. Error Handling

**Question**: How should errors in computations be handled?

**Options**:
- A) Throw immediately (simple but can crash)
- B) Error boundaries (Solid's approach)
- C) Try-catch every computation (safer but more overhead)

**Recommendation**: Implement error boundaries like Solid (catchError).

### 2. Development Mode

**Question**: Should we have separate dev/prod builds?

**Options**:
- A) Single build (simpler)
- B) Dev build with extra checks (better DX)
- C) Compile-time flags (most flexible)

**Recommendation**: Use compile-time flags like Solid (IS_DEV).

### 3. Memory Management

**Question**: How aggressive should cleanup be?

**Options**:
- A) Immediate cleanup (more operations)
- B) Lazy cleanup (better performance, more memory)
- C) Configurable (more complex)

**Recommendation**: Immediate cleanup for predictability.

### 4. TypeScript Support

**Question**: How strict should types be?

**Options**:
- A) Permissive (easier to use)
- B) Strict (catches more errors)
- C) Configurable strictness (complex)

**Recommendation**: Strict types like Solid.

## Success Metrics

Your library should meet these benchmarks:

### Performance
- ✅ Signal read: < 1μs
- ✅ Signal write: < 10μs (no observers)
- ✅ Signal write: < 100μs (with observers)
- ✅ Effect creation: < 50μs
- ✅ Effect execution: < 100μs (simple)
- ✅ Array reconciliation: < 1ms (100 items)

### Memory
- ✅ No leaks in long-running apps
- ✅ Proper cleanup of all computations
- ✅ Minimal overhead per signal (< 200 bytes)

### Correctness
- ✅ 100% test coverage
- ✅ All edge cases handled
- ✅ Consistent behavior across all features

## Common Pitfalls to Avoid

### 1. Infinite Loops

**Problem**: Effect writes to signal it reads

```typescript
const [count, setCount] = createSignal(0);
createEffect(() => {
  console.log(count());
  setCount(count() + 1); // INFINITE LOOP!
});
```

**Solution**: Detect with ExecCount and throw error.

### 2. Memory Leaks

**Problem**: Forgetting to clean up observers

```typescript
// Wrong: observers array keeps growing
function addObserver(signal, observer) {
  signal.observers.push(observer);
  // Missing: removal on cleanup!
}
```

**Solution**: Always implement cleanup in cleanNode.

### 3. Stale Closures

**Problem**: Captured values don't update

```typescript
const [count, setCount] = createSignal(0);
const captured = count(); // Captures current value
createEffect(() => {
  console.log(captured); // Always prints 0!
});
```

**Solution**: Always read signals inside effects.

### 4. Update Order Issues

**Problem**: Effects run before memos compute

```typescript
const [a, setA] = createSignal(1);
const doubled = createMemo(() => a() * 2);
createEffect(() => console.log(doubled())); // When does this run?
```

**Solution**: Use proper scheduling (memos before effects).

## Next Steps

In the next lesson, we'll dive into implementing the core signal primitive, starting with the SignalState structure and basic read/write operations.

## Review Questions

1. What is the purpose of the bidirectional tracking (observers + observerSlots)?
2. How does the Owner hierarchy enable automatic cleanup?
3. Why does Solid use global variables like Owner and Listener?
4. What's the difference between Updates and Effects queues?
5. How do transitions maintain consistency during concurrent updates?

## Practical Exercise

Before moving on, sketch out on paper:

1. The data flow when a signal is read
2. The data flow when a signal is written
3. The relationships between Signal, Computation, and Owner

This mental model will be crucial as we implement the system.

---

**Next Lesson**: [Implementing Core Signals](./lesson-02-implementing-signals.md)
