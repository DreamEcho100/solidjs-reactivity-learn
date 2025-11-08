# Unit 5: Transitions and Concurrency

## Overview

Master concurrent rendering with transitions. Learn how Solid.js handles non-urgent updates without blocking urgent ones, creating smooth user experiences.

## Learning Objectives

- ✅ Understand TransitionState structure
- ✅ Implement startTransition
- ✅ Build useTransition hook
- ✅ Handle concurrent mutations
- ✅ Manage loading states

## Time Commitment

**2 weeks** | **12-16 hours**

## Lessons

### Lesson 1: Transition System (4-5 hours)
- TransitionState interface
- tValue and tState (transition values)
- Concurrent rendering concepts
- Transition lifecycle
- Promise management

From Solid.js:
```typescript
interface TransitionState {
  sources: Set<SignalState<any>>;
  effects: Computation<any>[];
  promises: Set<Promise<any>>;
  disposed: Set<Computation<any>>;
  queue: Set<Computation<any>>;
  running: boolean;
}
```

### Lesson 2: startTransition Deep Dive (4-5 hours)
- How transitions isolate updates
- Double-buffering technique
- Promise tracking
- Disposed computation handling
- Resolving transitions

### Lesson 3: useTransition Pattern (3-4 hours)
- isPending state management
- User experience patterns
- Loading indicators
- Error handling in transitions
- Optimistic updates

### Lesson 4: Concurrent Patterns (2-3 hours)
- Race condition handling
- Update prioritization
- Stale-while-revalidate
- Optimistic UI
- Error boundaries

## Exercises

1. **Basic Transition** (⭐⭐⭐) - Implement startTransition
2. **Transition Scheduler** (⭐⭐⭐⭐) - Build full system
3. **Loading UI** (⭐⭐⭐) - Create loading patterns
4. **Concurrent Mutations** (⭐⭐⭐⭐) - Handle conflicts

## Projects

- **Search with Transitions** - Instant feedback + slow search
- **Data Table** - Concurrent filtering/sorting
- **Form Wizard** - Multi-step with transitions

## Key Concepts

### Transition State
```javascript
let Transition = null;

function startTransition(fn) {
  Transition = {
    sources: new Set(),
    running: true,
    promises: new Set()
  };
  
  fn();
  
  return commitTransition(Transition);
}
```

### Double Buffering
```javascript
// Old value shown while new value computes
signal.value = oldValue;    // Shown
signal.tValue = newValue;   // Computing
```

### useTransition
```javascript
const [isPending, start] = useTransition();

start(() => {
  // Non-urgent update
  setData(expensiveComputation());
});

// isPending() === true while computing
```

**Files:**
- `lessons/lesson-01-transition-system.md`
- `lessons/lesson-02-start-transition.md`
- `lessons/lesson-03-use-transition.md`
- `lessons/lesson-04-concurrent-patterns.md`
- `exercises/01-basic-transition.md`
- `notes/concurrent-rendering.md`
- `notes/loading-patterns.md`
