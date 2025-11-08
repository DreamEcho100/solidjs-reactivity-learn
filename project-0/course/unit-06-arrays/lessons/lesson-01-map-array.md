# Lesson 1: mapArray (For) Pattern

## Overview

The `mapArray` function (used by Solid's `<For>` component) is one of the most sophisticated pieces of the reactive system. It efficiently transforms an array into a mapped array of components while **minimizing re-renders** by reconciling items by their **index position**.

## Learning Objectives

By the end of this lesson, you will:
- ✅ Understand index-based reconciliation
- ✅ Implement `mapArray` from scratch
- ✅ Master disposer management for list items
- ✅ Use index signals effectively
- ✅ Know when to use mapArray vs indexArray

## The Problem: Naive Array Mapping

Let's first understand why we need `mapArray` by seeing what goes wrong with naive approaches:

### Approach 1: Direct Array.map

```typescript
// ❌ Recreates ALL items on EVERY change
function NaiveList() {
  const [items, setItems] = createSignal(['A', 'B', 'C']);
  
  return () => items().map(item => <div>{item}</div>);
}
```

**Problem**: Every time `items()` changes, **all** items are recreated from scratch, even if only one item changed.

### Approach 2: Tracked Array.map

```typescript
// ❌ Still recreates all items
function TrackedList() {
  const [items, setItems] = createSignal(['A', 'B', 'C']);
  
  return createMemo(() => items().map(item => <div>{item}</div>));
}
```

**Problem**: The memo sees the entire array changed, so it still recreates everything.

### What We Need

We need a system that:
1. **Reuses** existing DOM nodes when possible
2. **Updates** only changed items
3. **Efficiently** handles additions, removals, and reordering
4. **Manages** cleanup for removed items
5. **Tracks** index changes reactively

This is exactly what `mapArray` provides!

## Understanding Index-Based Reconciliation

### The Core Concept

**mapArray reconciles by position (index), not by value.**

When the array changes from `['A', 'B', 'C']` to `['C', 'A', 'D']`:

```typescript
// Position-based thinking:
// Position 0: 'A' → 'C'  (update existing node at position 0)
// Position 1: 'B' → 'A'  (update existing node at position 1)
// Position 2: 'C' → 'D'  (update existing node at position 2)
```

Instead of:
- ❌ Destroying nodes for 'A' and 'B'
- ❌ Moving node 'C' to position 0
- ❌ Creating new nodes for 'A' and 'D'

We do:
- ✅ Keep all 3 nodes in place
- ✅ Just update their content

**Result**: Minimal DOM operations!

### When Does This Help?

Index-based reconciliation is optimal when:
- ✅ Items are primarily **added/removed** at the end
- ✅ Items are **filtered** or **sorted** frequently
- ✅ The **content** of items changes more than their order
- ✅ You're rendering **primitives** (strings, numbers)

It's less optimal when:
- ❌ Items have complex **internal state** that should persist
- ❌ Items are frequently **reordered** (e.g., drag-and-drop)
- ❌ Each item has **expensive setup** that shouldn't repeat

## The mapArray API

From Solid's `array.ts`:

```typescript
export function mapArray<T, U>(
  list: Accessor<readonly T[] | undefined | null | false>,
  mapFn: (v: T, i: Accessor<number>) => U,
  options: { fallback?: Accessor<any> } = {}
): () => U[]
```

### Parameters

1. **list**: Accessor returning the array to map
2. **mapFn**: Function to transform each item
   - `v`: The current value
   - `i`: An **Accessor** for the index (reactive!)
3. **options**: Optional fallback for empty arrays

### Key Features

#### 1. Reactive Index

The index is an **Accessor**, not a number:

```typescript
mapArray(
  items,
  (item, index) => {
    createEffect(() => {
      console.log(`Item ${item} is at index ${index()}`);
      //                                        ^^ Accessor!
    });
  }
);
```

When items reorder, **index signals update** automatically.

#### 2. Disposer Management

Each mapped item gets its own reactive scope that can be disposed:

```typescript
mapArray(
  items,
  (item, index) => {
    // This entire scope is cleaned up when item is removed
    onCleanup(() => console.log(`Cleaned up ${item}`));
    return createComponent(Item, { item, index });
  }
);
```

#### 3. Fallback Support

Show something when the list is empty:

```typescript
mapArray(
  items,
  (item) => <div>{item}</div>,
  { fallback: () => <div>No items</div> }
);
```

## Implementation Walkthrough

Let's build `mapArray` step by step, following Solid's implementation.

### Step 1: Setup State

```typescript
export function mapArray<T, U>(
  list: Accessor<readonly T[] | undefined | null | false>,
  mapFn: (v: T, i: Accessor<number>) => U,
  options: { fallback?: Accessor<any> } = {}
): () => U[] {
  // Track previous items and their mapped results
  let items: T[] = [];
  let mapped: U[] = [];
  let disposers: (() => void)[] = [];
  let len = 0;
  
  // Index signals (only if mapFn uses them)
  let indexes: ((v: number) => number)[] | null = 
    mapFn.length > 1 ? [] : null;
  
  // Cleanup all items when this effect is disposed
  onCleanup(() => dispose(disposers));
  
  // ... implementation continues
}
```

**Key points**:
- `items`: Previous array snapshot
- `mapped`: Previous mapped results
- `disposers`: Functions to clean up each item's reactive scope
- `indexes`: Signal setters for each item's index (if needed)
- `len`: Previous array length

### Step 2: The Main Return Function

```typescript
return () => {
  let newItems = list() || [];
  let newLen = newItems.length;
  
  // Top-level tracking (important!)
  (newItems as any)[$TRACK];
  
  return untrack(() => {
    // Reconciliation logic here...
  });
};
```

**Key points**:
- **`(newItems as any)[$TRACK]`**: Ensures we track the array accessor
- **`untrack()`**: Prevents tracking individual item accesses during reconciliation

### Step 3: Fast Path - Empty Array

```typescript
// Inside untrack()...

if (newLen === 0) {
  if (len !== 0) {
    // Clean up all existing items
    dispose(disposers);
    disposers = [];
    items = [];
    mapped = [];
    len = 0;
    indexes && (indexes = []);
  }
  
  // Show fallback if provided
  if (options.fallback) {
    items = [FALLBACK];  // Special sentinel value
    mapped[0] = createRoot(disposer => {
      disposers[0] = disposer;
      return options.fallback!();
    });
    len = 1;
  }
  
  return mapped;
}
```

**Key points**:
- Dispose all items when array becomes empty
- Use `FALLBACK` symbol to distinguish fallback from real items
- Create fallback in its own reactive root

### Step 4: Fast Path - Initial Creation

```typescript
// New array, no previous items
if (len === 0) {
  mapped = new Array(newLen);
  
  for (let j = 0; j < newLen; j++) {
    items[j] = newItems[j];
    mapped[j] = createRoot(mapper);
  }
  
  len = newLen;
  return mapped;
}

function mapper(disposer: () => void) {
  disposers[j] = disposer;
  
  if (indexes) {
    const [s, set] = createSignal(j);
    indexes[j] = set;
    return mapFn(newItems[j], s);
  }
  
  return (mapFn as any)(newItems[j]);
}
```

**Key points**:
- Create all items fresh when starting from empty
- Each item gets its own `createRoot` scope
- Index signals created only if needed (mapFn.length > 1)

### Step 5: General Case - Reconciliation

This is where the magic happens! We use a sophisticated diffing algorithm:

```typescript
// Both old and new arrays have items - need to reconcile
else {
  let temp = new Array(newLen);
  let tempdisposers = new Array(newLen);
  let tempIndexes: ((v: number) => number)[] | undefined;
  
  if (indexes) tempIndexes = new Array(newLen);
  
  let start: number, end: number, newEnd: number;
  
  // OPTIMIZATION 1: Skip common prefix
  for (
    start = 0, end = Math.min(len, newLen);
    start < end && items[start] === newItems[start];
    start++
  );
  
  // OPTIMIZATION 2: Skip common suffix
  for (
    end = len - 1, newEnd = newLen - 1;
    end >= start && newEnd >= start && items[end] === newItems[newEnd];
    end--, newEnd--
  ) {
    temp[newEnd] = mapped[end];
    tempdisposers[newEnd] = disposers[end];
    if (indexes) tempIndexes![newEnd] = indexes[end];
  }
  
  // Now reconcile the middle part...
}
```

**Optimizations**:
1. **Common prefix**: Items that didn't move at the start
2. **Common suffix**: Items that didn't move at the end
3. Only reconcile the changed middle section

### Step 6: Reconcile Middle Section

```typescript
// Build index map of new items
let newIndices = new Map<T, number>();
let newIndicesNext = new Array(newEnd + 1);

// Scan backwards to find all positions of each item
for (let j = newEnd; j >= start; j--) {
  let item = newItems[j];
  let i = newIndices.get(item);
  newIndicesNext[j] = i === undefined ? -1 : i;
  newIndices.set(item, j);
}

// Try to reuse old items
for (let i = start; i <= end; i++) {
  let item = items[i];
  let j = newIndices.get(item);
  
  if (j !== undefined && j !== -1) {
    // Item still exists - reuse it!
    temp[j] = mapped[i];
    tempdisposers[j] = disposers[i];
    if (indexes) tempIndexes![j] = indexes[i];
    
    j = newIndicesNext[j];
    newIndices.set(item, j);
  } else {
    // Item removed - dispose it
    disposers[i]();
  }
}

// Fill in gaps with new items
for (let j = start; j < newLen; j++) {
  if (!(j in temp)) {
    mapped[j] = createRoot(mapper);
  } else {
    mapped[j] = temp[j];
    disposers[j] = tempdisposers[j];
    
    if (indexes) {
      indexes[j] = tempIndexes![j];
      indexes[j](j);  // Update index signal!
    }
  }
}

// Trim and save
mapped = mapped.slice(0, len = newLen);
items = newItems.slice(0);
```

**Algorithm**:
1. Build a Map of where each item appears in the new array
2. Try to find each old item in the Map
3. If found, reuse the mapped result
4. If not found, dispose the item
5. Fill gaps with newly created items
6. Update index signals for moved items

## Understanding the Algorithm

### Example Reconciliation

Let's trace through an example:

```typescript
// Old: ['A', 'B', 'C', 'D']
// New: ['C', 'A', 'E', 'D']
```

#### Step 1: Common Prefix
```
Old: ['A', 'B', 'C', 'D']
      ^
New: ['C', 'A', 'E', 'D']
      ^
No match, start = 0
```

#### Step 2: Common Suffix
```
Old: ['A', 'B', 'C', 'D']
                      ^
New: ['C', 'A', 'E', 'D']
                      ^
Match! Keep 'D' in place
```

#### Step 3: Build Index Map
```
newIndices Map:
'C' → 0
'A' → 1
'E' → 2
```

#### Step 4: Match Old Items
```
i=0: 'A' found at j=1 → reuse mapped[0] for position 1
i=1: 'B' not found → dispose(disposers[1])
i=2: 'C' found at j=0 → reuse mapped[2] for position 0
```

#### Step 5: Fill Gaps
```
Position 0: Have 'C' (from old[2])
Position 1: Have 'A' (from old[0])
Position 2: Missing → create new 'E'
Position 3: Have 'D' (from suffix)
```

#### Result
```
✅ Reused 3 items (A, C, D)
✅ Created 1 item (E)
✅ Disposed 1 item (B)
✅ Updated 2 index signals (A: 0→1, C: 2→0)
```

### Complexity Analysis

- **Time**: O(n + m) where n = old length, m = new length
  - Common prefix/suffix: O(min(n, m))
  - Build map: O(m)
  - Match old items: O(n)
  - Fill gaps: O(m)
  
- **Space**: O(m) for temporary arrays and Map

- **DOM operations**: Optimal! Only creates/destroys what's necessary

## Using mapArray

### Basic Usage

```typescript
import { createSignal } from 'solid-js';
import { mapArray } from './mapArray';

function TodoList() {
  const [todos, setTodos] = createSignal(['Buy milk', 'Walk dog']);
  
  const todoElements = mapArray(
    todos,
    (todo, index) => {
      console.log(`Creating element for: ${todo}`);
      
      return () => (
        <div>
          {index()}. {todo}
          <button onClick={() => removeTodo(index())}>X</button>
        </div>
      );
    }
  );
  
  return <div>{todoElements()}</div>;
}
```

### With Cleanup

```typescript
const elements = mapArray(
  items,
  (item) => {
    // Set up WebSocket for this item
    const ws = new WebSocket(`wss://api.com/${item.id}`);
    
    // Clean up when item is removed
    onCleanup(() => {
      console.log(`Closing WebSocket for ${item.id}`);
      ws.close();
    });
    
    return () => <div>{item.name}</div>;
  }
);
```

### With Index Tracking

```typescript
const elements = mapArray(
  items,
  (item, index) => {
    // Index is reactive!
    createEffect(() => {
      console.log(`${item.name} is now at position ${index()}`);
    });
    
    return () => (
      <div class={index() === 0 ? 'first' : ''}>
        {item.name}
      </div>
    );
  }
);
```

### With Fallback

```typescript
const elements = mapArray(
  items,
  (item) => () => <div>{item}</div>,
  { 
    fallback: () => <div class="empty">No items yet</div>
  }
);
```

## Common Pitfalls

### ❌ Pitfall 1: Not Calling mapFn Result

```typescript
// ❌ Wrong - not calling the function
mapArray(items, (item) => {
  return <div>{item}</div>;  // Returns JSX directly
});

// ✅ Correct - return a function
mapArray(items, (item) => {
  return () => <div>{item}</div>;  // Returns function that returns JSX
});
```

### ❌ Pitfall 2: Not Handling Cleanup

```typescript
// ❌ Leaks memory
mapArray(items, (item) => {
  const interval = setInterval(() => {
    console.log(item);
  }, 1000);
  
  return () => <div>{item}</div>;
});

// ✅ Properly cleans up
mapArray(items, (item) => {
  const interval = setInterval(() => {
    console.log(item);
  }, 1000);
  
  onCleanup(() => clearInterval(interval));
  
  return () => <div>{item}</div>;
});
```

### ❌ Pitfall 3: Mutating The Array

```typescript
// ❌ Doesn't trigger reactivity
const [items, setItems] = createSignal([1, 2, 3]);
items().push(4);  // Mutates but doesn't notify!

// ✅ Create new array
setItems(prev => [...prev, 4]);
```

### ❌ Pitfall 4: Using Index as Value

```typescript
// ❌ Index might change!
mapArray(items, (item, index) => {
  const currentIndex = index();  // Captures current value
  
  return () => (
    <button onClick={() => remove(currentIndex)}>
      Delete item {currentIndex}
    </button>
  );
});

// ✅ Always read fresh index
mapArray(items, (item, index) => {
  return () => (
    <button onClick={() => remove(index())}>
      Delete item {index()}
    </button>
  );
});
```

## When to Use mapArray

Use **mapArray** (For) when:

✅ Items are primarily added/removed  
✅ Items are filtered or sorted  
✅ Content changes more than order  
✅ Rendering primitives or simple objects  
✅ Don't need to preserve item identity  

Use **indexArray** (Index) when:

✅ Items have complex internal state  
✅ Items are frequently reordered  
✅ Each item has expensive setup  
✅ Need to preserve component instances  
✅ Items have animations or transitions  

## Performance Characteristics

### Best Case: O(1)
```typescript
// Adding to end
setItems(prev => [...prev, newItem]);
// Only creates 1 new node
```

### Average Case: O(n)
```typescript
// Reordering
setItems(prev => prev.sort());
// Updates all index signals
```

### Worst Case: O(n)
```typescript
// Complete replacement
setItems([...completelyNewItems]);
// Still only O(n) due to efficient reconciliation
```

## Summary

`mapArray` is a sophisticated reconciliation algorithm that:

1. **Minimizes DOM operations** through intelligent diffing
2. **Reuses nodes** by position instead of by identity
3. **Manages cleanup** automatically for removed items
4. **Provides reactive indices** that update when items move
5. **Optimizes common patterns** like prefix/suffix matching

Understanding `mapArray` deeply helps you:
- Choose the right list primitive (mapArray vs indexArray)
- Debug list rendering issues
- Optimize large list performance
- Build your own reactive utilities

## Next Steps

In the next lesson, we'll explore **indexArray**, which uses value-based reconciliation instead of index-based. We'll compare the two approaches and learn when each is optimal.

## Further Reading

- Solid.js `array.ts` source code
- [S-array library](https://github.com/adamhaile/S-array) (inspiration for Solid's implementation)
- React's reconciliation algorithm (for comparison)
- Vue's list rendering (different approach)

---

**Practice Exercise**: Implement `mapArray` from scratch and test it with various scenarios. Try to optimize the common prefix/suffix detection!
