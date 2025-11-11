# Unit 9: Observable Integration

## Overview

This unit covers how Solid.js integrates with external reactive systems through the Observable pattern. You'll learn how to bridge Solid's signal-based reactivity with other observable implementations like RxJS, and how to integrate custom reactive systems.

## Learning Objectives

By the end of this unit, you will be able to:

1. ✅ Understand the Observable pattern and TC39 Observable standard
2. ✅ Convert Solid signals to Observables
3. ✅ Convert Observables to Solid signals
4. ✅ Integrate with RxJS and other observable libraries
5. ✅ Build custom external source integrations
6. ✅ Understand `enableExternalSource` API
7. ✅ Create adapters for different reactive systems

## Time Commitment

**1 week** | **9.5-11.5 hours**

## Prerequisites

- Understanding of signals and effects (Unit 2)
- Knowledge of Promises and async patterns
- Familiarity with RxJS is helpful but not required

## Lessons

### 1. The Observable Pattern (30 min)
**File:** `lessons/01-observable-pattern.md`

**Topics:**
- TC39 Observable standard
- Symbol.observable
- Observable interface
- Observer patterns
- Signal to Observable conversion
- createRoot usage for isolation
- untrack for handler calls

**Key Takeaway:** Observables provide a standardized interface for reactive values over time, enabling interoperability between different reactive systems.

### 2. The from() Helper (45 min)
**File:** `lessons/02-from-helper.md`

**Topics:**
- Converting observables to signals
- Producer patterns (function vs object)
- equals: false rationale
- Automatic cleanup with onCleanup
- Integration with DOM events
- WebSocket patterns
- RxJS integration

**Key Takeaway:** The `from()` function bridges external reactive sources into Solid's reactive system while handling cleanup automatically.

### 3. External Source Integration (60 min)
**File:** `lessons/03-external-sources.md`

**Topics:**
- enableExternalSource API
- Deep integration with other reactive systems
- Dual tracking (ordinary + transition)
- Composing multiple external sources
- Custom untrack implementation
- MobX/Vue integration examples
- Performance considerations

**Key Takeaway:** `enableExternalSource` enables deep integration between Solid and other reactive libraries by wrapping Solid's computation system.

## Exercises

**File:** `exercises/README.md`

1. **Basic Observable Implementation** ⭐⭐☆☆☆
2. **Implement from() Function** ⭐⭐⭐☆☆
3. **RxJS Integration** ⭐⭐⭐☆☆
4. **Event Stream to Signal** ⭐⭐☆☆☆
5. **WebSocket Observable** ⭐⭐⭐⭐☆
6. **Implement enableExternalSource** ⭐⭐⭐⭐⭐
7. **Throttled Observable** ⭐⭐⭐☆☆
8. **Challenge: Reactive LocalStorage Sync** ⭐⭐⭐⭐⭐

## Projects

**File:** `projects/reactive-dashboard.md`

Build a real-time dashboard integrating:
- WebSocket streams
- Browser events (mouse, resize, scroll)
- Cross-tab localStorage sync
- API polling
- RxJS operators
- Error handling and retry logic

## Key Concepts

### Observable
A standardized interface for values that arrive over time, following the TC39 Observable proposal.

**Interface:**
```typescript
interface Observable<T> {
  subscribe(observer: Observer<T>): Subscription;
  [Symbol.observable](): Observable<T>;
}
```

### Signal-Observable Bridge
Mechanisms to convert between Solid's signal-based reactivity and observable-based systems:
- `observable()`: Signal → Observable
- `from()`: Observable → Signal

### External Source
A reactive system outside of Solid that can be integrated using `enableExternalSource`.

### Producer
A function or object that generates values for consumption by reactive systems:
- Function: `(set: Setter<T>) => () => void`
- Observable: `{ subscribe: (fn) => unsubscribe }`

## Practical Applications

- ✅ Integrating with RxJS for complex async operations
- ✅ Bridging between different reactive frameworks (MobX, Vue)
- ✅ Converting event streams to reactive values
- ✅ Building framework-agnostic reactive libraries
- ✅ Gradual migration from other reactive systems
- ✅ WebSocket and real-time data handling
- ✅ Cross-tab state synchronization

## Notes

**File:** `notes/quick-reference.md`

Includes:
- Quick reference guide
- Common patterns
- Performance optimization
- Debugging tips
- Best practices
- Testing strategies

## Assessment

### Knowledge Check
1. Explain the difference between `observable()` and `from()`
2. Why does `from()` use `equals: false`?
3. When should you use `enableExternalSource`?
4. How does cleanup work in observable subscriptions?
5. What's the purpose of the dual tracking system in external sources?

### Practical Assessment
- Implement all exercises
- Build the reactive dashboard project
- Create custom observable operators
- Integrate with at least one external library

## Common Patterns Learned

```typescript
// Signal → Observable
import { observable } from "solid-js";
import { from } from "rxjs";

const count$ = from(observable(count));

// Observable → Signal
import { from } from "solid-js";

const signal = from(producer, initialValue);

// Event → Signal
const clicks = from((set) => {
  const handler = (e) => set(e);
  window.addEventListener("click", handler);
  return () => window.removeEventListener("click", handler);
}, null);

// WebSocket → Signal
const wsData = from((set) => {
  const ws = new WebSocket(url);
  ws.onmessage = (e) => set(JSON.parse(e.data));
  return () => ws.close();
}, null);
```

## Resources

- [TC39 Observable Proposal](https://github.com/tc39/proposal-observable)
- [RxJS Documentation](https://rxjs.dev/)
- [Solid.js Observable API](https://docs.solidjs.com/reference/reactive-utilities/observable)
- [Symbol.observable Spec](https://github.com/tc39/proposal-observable#symbolobservable)
- Solid.js Source: `packages/solid/src/reactive/observable.ts`

## Next Steps

After completing this unit, proceed to **Unit 10: Advanced Patterns and Optimization**, where you'll learn:
- Memory management deep dive
- Performance profiling and optimization
- Production patterns and best practices
- Comprehensive testing strategies
- Development tools implementation

---

**Unit Status:** ✅ Complete

All lessons, exercises, notes, and projects have been created. You can now work through this unit to master Observable integration in Solid.js!
