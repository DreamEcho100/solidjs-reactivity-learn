# Unit 3: Advanced Computation Patterns

## Overview

Master advanced reactive patterns including computation states, conditional reactivity, and performance optimization. Learn how Solid.js handles complex dependency scenarios and edge cases.

## Learning Objectives

- ✅ Master computation state machine (STALE, PENDING, FRESH)
- ✅ Implement update propagation algorithms
- ✅ Build conditional reactivity with on() and createSelector
- ✅ Optimize reactive graphs for performance
- ✅ Handle edge cases (circular dependencies, dynamic deps)

## Time Commitment

**2 weeks** | **12-16 hours**

## Lessons

### Lesson 1: Computation States and Updates (3-4 hours)
- State machine: STALE, PENDING, FRESH (0, 1, 2)
- lookUpstream algorithm
- markDownstream propagation
- Preventing infinite loops
- Update ordering

### Lesson 2: Conditional Reactivity (3-4 hours)  
- on() helper for explicit dependencies
- createSelector for O(2) updates
- Conditional tracking patterns
- Dynamic dependency management
- When dependencies change

### Lesson 3: Deferred Computations (2-3 hours)
- createDeferred implementation
- Request idle callback integration
- Performance optimization patterns
- Batching strategies
- Debouncing and throttling

### Lesson 4: Advanced Patterns (3-4 hours)
- Reactive maps and sets
- Computed collections
- Lazy evaluation
- Reactive middleware
- Pattern composition

## Exercises

1. **State Machine** (⭐⭐⭐) - Implement computation states
2. **Conditional Tracking** (⭐⭐⭐⭐) - Build on() and createSelector
3. **Performance Optimizer** (⭐⭐⭐⭐) - Optimize large reactive graphs
4. **Edge Case Handler** (⭐⭐⭐) - Handle circular dependencies

## Projects

- **Reactive Data Grid** - Large dataset with filtering/sorting
- **Performance Monitor** - Track and optimize reactive updates
- **Conditional Form** - Dynamic form fields with validation

## Key Concepts

### Computation States
```javascript
const FRESH = 0;   // Up to date
const STALE = 1;   // Needs update  
const PENDING = 2; // Checking dependencies
```

### Update Propagation
```
Signal changes → Mark STALE → Check PENDING → Update FRESH
```

### Conditional Reactivity
```javascript
// Only re-run when condition changes
on(condition, () => {
  // Expensive computation
}, { defer: true });
```

**Files:**
- `lessons/lesson-01-computation-states.md`
- `lessons/lesson-02-conditional-reactivity.md`
- `lessons/lesson-03-deferred-computations.md`
- `lessons/lesson-04-advanced-patterns.md`
- `exercises/01-state-machine.md`
- `notes/update-algorithms.md`
- `notes/performance-patterns.md`
