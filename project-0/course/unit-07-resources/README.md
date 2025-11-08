# Unit 7: Resources and Async Patterns

## Overview

Master asynchronous data handling with resources and suspense. Learn how Solid.js manages loading states, caching, and error handling for async operations.

## Learning Objectives

- ✅ Implement createResource
- ✅ Build suspense boundaries
- ✅ Handle loading/error states
- ✅ Master caching strategies
- ✅ Integrate with data fetching

## Time Commitment

**2 weeks** | **15-18 hours**

## Lessons

### Lesson 1: Resource Architecture (4-5 hours)
- Resource states (unresolved, pending, ready, refreshing, errored)
- Promise handling in reactive systems
- SSR and hydration concerns
- Resource lifecycle
- Serialization

States:
```javascript
const UNRESOLVED = 0;
const PENDING = 1;
const READY = 2;
const REFRESHING = 3;
const ERRORED = 4;
```

### Lesson 2: createResource Implementation (4-5 hours)
- Source-based fetching
- Fetcher function patterns
- Refetch and mutation
- Signal integration
- Reactive dependencies

```javascript
const [data, { refetch, mutate }] = createResource(
  source,  // When this changes, refetch
  fetcher  // How to fetch
);
```

### Lesson 3: Suspense Integration (3-4 hours)
- SuspenseContext structure
- Increment/decrement pattern
- Fallback rendering
- Nested suspense boundaries
- Error boundaries

### Lesson 4: Advanced Patterns (3-4 hours)
- Parallel data fetching
- Dependent fetches
- Caching strategies
- Optimistic updates
- Prefetching

## Exercises

1. **Build createResource** (⭐⭐⭐⭐⭐) - Full implementation
2. **Suspense Boundary** (⭐⭐⭐⭐) - Loading states
3. **Cache Layer** (⭐⭐⭐⭐) - Smart caching
4. **Data Fetching Library** (⭐⭐⭐⭐⭐) - Complete solution

## Projects

- **API Client** - Full-featured data fetcher
- **Offline-First App** - Cache with sync
- **Real-time Dashboard** - Live data updates

## Key Concepts

### Resource Structure
```javascript
interface Resource<T> {
  (): T | undefined;
  state: ResourceState;
  loading: boolean;
  error: any;
  latest: T | undefined;
}
```

### Suspense Pattern
```javascript
<Suspense fallback={<Loading />}>
  <DataComponent />
</Suspense>
```

### Resource Lifecycle
```
Created → Pending → Ready
                 → Errored
Ready → Refreshing → Ready
```

### Error Handling
```javascript
const [data] = createResource(fetcher);

<ErrorBoundary fallback={err => <Error>{err}</Error>}>
  <Show when={data()}>
    {d => <Display data={d} />}
  </Show>
</ErrorBoundary>
```

**Files:**
- `lessons/lesson-01-resource-architecture.md`
- `lessons/lesson-02-create-resource.md`
- `lessons/lesson-03-suspense.md`
- `lessons/lesson-04-advanced-patterns.md`
- `exercises/01-build-resource.md`
- `notes/caching-strategies.md`
- `notes/ssr-hydration.md`
