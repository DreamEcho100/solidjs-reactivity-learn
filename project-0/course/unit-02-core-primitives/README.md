# Unit 2: Core Reactive Primitives

## Overview

Welcome to Unit 2! Now that you understand reactivity fundamentals, we'll dive deep into implementing all core reactive primitives used in Solid.js. You'll learn how signals, effects, memos, and computations work internally, and build production-grade versions from scratch.

## Learning Objectives

By the end of this unit, you will:

- ✅ Master the complete SignalState interface
- ✅ Implement all types of computations (effects, memos, computed)
- ✅ Understand ownership hierarchy and lifecycle
- ✅ Build createRoot for scope isolation
- ✅ Implement tracking and untracking mechanisms
- ✅ Handle edge cases and error scenarios
- ✅ Optimize for performance

## Prerequisites

- ✅ Completed Unit 1: Foundations of Reactivity
- ✅ Understanding of closures and scope
- ✅ Basic signal implementation
- ✅ Familiarity with the Observer pattern

## Time Commitment

- **Estimated Time:** 2-3 weeks
- **Study Time:** 15-20 hours total
- **Hands-on Practice:** 70% of time

## Unit Structure

### Lesson 1: Signals Deep Dive
**Duration:** 3-4 hours

Deep exploration of Solid.js SignalState interface:
- Complete SignalState structure
- Bidirectional tracking (observers/observerSlots)
- Equality comparators and optimization
- Development mode features

**Files:**
- `lessons/lesson-01-signals-deep-dive.md`

### Lesson 2: Computations - Effects and Memos
**Duration:** 4-5 hours

Understanding reactive computations:
- Computation interface structure
- Pure vs impure computations
- Effect execution timing
- Memo caching strategies
- createEffect vs createRenderEffect vs createComputed

**Files:**
- `lessons/lesson-02-computations.md`

### Lesson 3: Ownership and Lifecycle
**Duration:** 3-4 hours

Managing reactive scope and cleanup:
- Owner interface structure
- createRoot implementation
- Scope isolation
- Automatic cleanup
- Nested reactive scopes

**Files:**
- `lessons/lesson-03-ownership-lifecycle.md`

### Lesson 4: Tracking and Untracking
**Duration:** 2-3 hours

Advanced dependency management:
- Listener context mechanics
- Context-aware dependency collection
- untrack() implementation
- Common tracking pitfalls
- Dynamic dependencies

**Files:**
- `lessons/lesson-04-tracking-untracking.md`

## Exercises

### Exercise 1: Complete Signal Implementation
Build a production-grade signal with:
- Full SignalState interface
- Bidirectional tracking
- Custom comparators
- Debug information

**Difficulty:** ⭐⭐⭐ Advanced  
**Time:** 3-4 hours

### Exercise 2: Effect Types
Implement all effect variants:
- createEffect
- createRenderEffect
- createComputed
- Understand timing differences

**Difficulty:** ⭐⭐⭐ Advanced  
**Time:** 2-3 hours

### Exercise 3: Ownership System
Build complete ownership:
- createRoot
- Owner hierarchy
- Automatic cleanup
- Context propagation

**Difficulty:** ⭐⭐⭐⭐ Expert  
**Time:** 4-5 hours

### Exercise 4: Reactive Form System
Real-world application:
- Form state management
- Validation with effects
- Derived state with memos
- Proper cleanup

**Difficulty:** ⭐⭐⭐ Advanced  
**Time:** 3-4 hours

## Projects

### Project 1: Reactive State Manager
Build a complete state management library:
- Global stores
- Computed values
- Side effects
- Subscriptions

**Time:** 5-6 hours

### Project 2: Reactive UI Framework (Mini)
Create a minimal reactive UI framework:
- Component model
- Props as signals
- Reactive rendering
- Lifecycle hooks

**Time:** 8-10 hours

## Key Concepts

### 1. SignalState Interface
The complete internal structure of a signal:
```typescript
interface SignalState<T> {
  value: T;
  observers: Computation[] | null;
  observerSlots: number[] | null;
  tValue?: T;
  comparator?: (prev: T, next: T) => boolean;
  name?: string;
  internal?: boolean;
}
```

### 2. Computation Interface
The structure of reactive computations:
```typescript
interface Computation<T> {
  fn: () => T;
  state: 0 | 1 | 2;
  sources: SignalState[] | null;
  sourceSlots: number[] | null;
  owned: Computation[] | null;
  owner: Owner | null;
  value?: T;
  pure: boolean;
}
```

### 3. Owner Interface
Reactive scope management:
```typescript
interface Owner {
  owned: Computation[] | null;
  cleanups: (() => void)[] | null;
  owner: Owner | null;
  context: any | null;
}
```

### 4. Computation States
- **0 (Fresh):** Up to date, no re-computation needed
- **1 (Stale):** Dependencies changed, needs update
- **2 (Pending):** Checking dependencies

### 5. Pure vs Impure
- **Pure (Memos):** Can have observers, cached
- **Impure (Effects):** Side effects, not cached

## Success Criteria

You've mastered this unit when you can:

- [ ] Implement complete SignalState with bidirectional tracking
- [ ] Build all computation types (effect, memo, computed)
- [ ] Create an ownership system with automatic cleanup
- [ ] Explain the difference between computation types
- [ ] Handle dynamic dependencies correctly
- [ ] Prevent memory leaks
- [ ] Debug complex reactive graphs
- [ ] Build real-world reactive applications

## Common Challenges

### 1. Bidirectional Tracking Complexity
```javascript
// Challenge: Maintaining both directions efficiently
signal.observers[i] = computation;
signal.observerSlots[i] = computation.sources.length;
computation.sources.push(signal);
computation.sourceSlots.push(i);
```

**Solution:** Use index-based linking for O(1) operations.

### 2. Effect Timing Confusion
```javascript
// createEffect - runs after render
createEffect(() => console.log('After render'));

// createRenderEffect - runs during render
createRenderEffect(() => console.log('During render'));

// createComputed - runs immediately
createComputed(() => console.log('Immediately'));
```

**Solution:** Understand the execution context of each type.

### 3. Memory Leaks from Missing Cleanup
```javascript
// ❌ Wrong: No disposal
function Component() {
  createEffect(() => {
    const timer = setInterval(() => {}, 1000);
  });
}

// ✅ Correct: Proper cleanup
function Component() {
  createRoot(dispose => {
    createEffect(() => {
      const timer = setInterval(() => {}, 1000);
      onCleanup(() => clearInterval(timer));
    });
    return dispose;
  });
}
```

### 4. Circular Dependencies
```javascript
// ❌ Problem: Infinite loop
const [a, setA] = createSignal(0);
const b = createMemo(() => a() + 1);
createEffect(() => setA(b())); // Infinite!

// ✅ Solution: Break the cycle
const [a, setA] = createSignal(0);
const b = createMemo(() => a() + 1);
createEffect(() => {
  if (a() < 10) setA(b());
});
```

## Resources

### Essential Reading
- Lesson 1: Signals Deep Dive
- Lesson 2: Computations
- Lesson 3: Ownership and Lifecycle
- Lesson 4: Tracking and Untracking

### Supplementary Materials
- `notes/computation-states.md` - State machine details
- `notes/ownership-patterns.md` - Common ownership patterns
- `notes/performance-tips.md` - Optimization strategies

### External Resources
- [Solid.js signal.ts](https://github.com/solidjs/solid/blob/main/packages/solid/src/reactive/signal.ts) (lines 1-500)
- [Understanding Computations](https://docs.solidjs.com/concepts/signals#computations)
- [Effect Types Comparison](https://docs.solidjs.com/reference/reactive-utilities)

### Code References
From Solid.js source analysis:
- `createSignal` implementation (lines 220-260)
- `createComputed` implementation (lines 380-410)
- `createRenderEffect` implementation (lines 411-440)
- `createEffect` implementation (lines 441-470)
- `createRoot` implementation (lines 140-170)

## Assessment

### Knowledge Checks
- Quiz: Signal internals (10 questions)
- Quiz: Computation types (10 questions)
- Quiz: Ownership model (10 questions)

### Practical Assessments
- Implement SignalState
- Build all effect types
- Create ownership system
- Debug reactive issues

### Projects
- State management library
- Reactive UI framework

## Tips for Success

### 1. Study the Source Code
Read Solid.js signal.ts in parallel with lessons. Understanding the real implementation helps solidify concepts.

### 2. Draw Diagrams
Visualize:
- Owner hierarchies
- Dependency graphs
- State transitions
- Bidirectional links

### 3. Debug Your Implementation
Use console.log to trace:
- When effects run
- How dependencies are tracked
- When cleanup occurs
- State transitions

### 4. Build Real Examples
Don't just implement primitives—use them:
- Todo list with filters
- Shopping cart
- Form validation
- Data grid

### 5. Test Edge Cases
- Circular dependencies
- Dynamic dependencies
- Nested scopes
- Cleanup scenarios

## Next Steps

After completing this unit:

1. **Self-Assessment:** Complete all quizzes
2. **Projects:** Build state manager and UI framework
3. **Review:** Revisit challenging concepts
4. **Prepare:** Preview Unit 3 materials
5. **Proceed:** Move to Unit 3 - Advanced Computation Patterns

**Ready to begin?** Start with:
👉 `lessons/lesson-01-signals-deep-dive.md`

## Need Help?

- Review Unit 1 foundations
- Check the glossary
- Study code examples
- Draw dependency graphs
- Post questions in forum

---

**Remember:** These are the building blocks of all reactive systems. Take your time to understand them deeply—everything else builds on these foundations!
