# Unit 6: Array and List Reactivity

## Overview

Master efficient list rendering with Solid.js's sophisticated reconciliation algorithms. Learn when to use `<For>` vs `<Index>` and build your own reactive list helpers.

## Learning Objectives

- ✅ Implement mapArray (For) pattern
- ✅ Build indexArray (Index) pattern
- ✅ Master list reconciliation algorithms
- ✅ Optimize large list performance
- ✅ Handle keyed lists

## Time Commitment

**1.5 weeks** | **10-12 hours**

## Lessons

### Lesson 1: mapArray (For) Pattern (3-4 hours)
- Index-based reconciliation
- Minimal re-rendering strategy
- Disposer management
- Index signals
- When to use For

From `array.ts`:
```javascript
export function mapArray<T, U>(
  list: Accessor<readonly T[]>,
  mapFn: (v: T, i: Accessor<number>) => U,
  options?: { fallback?: Accessor<any> }
): () => U[]
```

### Lesson 2: indexArray (Index) Pattern (3-4 hours)
- Value-based reconciliation
- Signal references in arrays
- When to use Index vs For
- Performance characteristics
- Memory considerations

### Lesson 3: Reconciliation Algorithms (3-4 hours)
- Key-based reconciliation
- Prefix/suffix optimization
- Map-based diffing
- Longest common subsequence
- Move vs create/destroy tradeoffs

### Lesson 4: List Optimization (2-3 hours)
- Virtual scrolling
- Windowing techniques
- Lazy loading
- Pagination patterns
- Memory management

## Exercises

1. **Implement mapArray** (⭐⭐⭐⭐) - Build from scratch
2. **Implement indexArray** (⭐⭐⭐⭐) - Value-based version
3. **Virtual List** (⭐⭐⭐⭐⭐) - Window large lists
4. **Optimized Grid** (⭐⭐⭐⭐) - 2D virtual scrolling

## Projects

- **Data Table** - Sortable, filterable, paginated
- **Infinite Scroll** - Load more on scroll
- **Drag and Drop List** - Reorderable items

## Key Concepts

### mapArray (For)
```javascript
// Reconciles by index position
<For each={items()}>
  {(item, index) => <div>{item().name}</div>}
</For>
```

**When item moves:** Re-use same DOM, update content

### indexArray (Index)
```javascript
// Reconciles by reference
<Index each={items()}>
  {(item, index) => <div>{item().name}</div>}
</Index>
```

**When item moves:** Move DOM element

### Reconciliation Example
```javascript
// Old: [A, B, C]
// New: [C, A, D]

// mapArray (For):
// - Reuse position 0: A → C
// - Reuse position 1: B → A
// - Reuse position 2: C → D

// indexArray (Index):
// - Move C to position 0
// - Keep A at position 1
// - Create D at position 2
// - Dispose B
```

**Files:**
- `lessons/lesson-01-map-array.md`
- `lessons/lesson-02-index-array.md`
- `lessons/lesson-03-reconciliation.md`
- `lessons/lesson-04-optimization.md`
- `exercises/01-implement-map-array.md`
- `notes/when-to-use-which.md`
- `notes/virtual-scrolling.md`
