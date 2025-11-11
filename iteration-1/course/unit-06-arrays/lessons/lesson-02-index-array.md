# Lesson 2: indexArray (Index) Pattern

## Overview

While `mapArray` reconciles by **position**, `indexArray` (used by Solid's `<Index>` component) reconciles by **reference/value**. This makes it optimal for scenarios where item identity matters more than position.

## Learning Objectives

By the end of this lesson, you will:
- ✅ Understand value-based reconciliation
- ✅ Implement `indexArray` from scratch
- ✅ Use value signals effectively
- ✅ Know when to choose indexArray vs mapArray
- ✅ Master component instance preservation

## The Problem with mapArray for Some Scenarios

Let's see where `mapArray` falls short:

### Scenario: Expensive Component Setup

```typescript
function ExpensiveItem({ data }) {
  // Expensive setup
  const connection = createWebSocketConnection(data.id);
  const cache = createLocalCache(data.id);
  
  createEffect(() => {
    // Complex animation setup
    setupAnimation(data.animation);
  });
  
  onCleanup(() => {
    connection.close();
    cache.clear();
  });
  
  return <div>{data.name}</div>;
}

// Using mapArray (For)
<For each={items()}>
  {item => <ExpensiveItem data={item} />}
</For>
```

**Problem**: When items reorder:
```typescript
setItems(['C', 'A', 'B']);  // Reorder items
```

With `mapArray`:
1. Position 0: Setup for 'A' → teardown → setup for 'C' 😱
2. Position 1: Setup for 'B' → teardown → setup for 'A' 😱
3. Position 2: Setup for 'C' → teardown → setup for 'B' 😱

**All components are recreated!** Expensive setups run 3 times each.

### What We Need

We need a system that:
1. **Preserves component instances** when items move
2. **Updates reactive values** without recreating components
3. **Only creates/destroys** for actual additions/removals
4. **Moves DOM nodes** instead of updating content

This is what `indexArray` provides!

## Understanding Value-Based Reconciliation

### The Core Concept

**indexArray reconciles by reference/identity, not by position.**

When the array changes from `['A', 'B', 'C']` to `['C', 'A', 'B']`:

```typescript
// Value-based thinking:
// 'A': Still exists → keep component, update position
// 'B': Still exists → keep component, update position
// 'C': Still exists → keep component, update position
```

Instead of recreating everything like mapArray would, we:
- ✅ Keep all 3 component instances
- ✅ Just move their DOM nodes
- ✅ Update their position if they track it

### When Does This Help?

Value-based reconciliation is optimal when:
- ✅ Components have **expensive setup/teardown**
- ✅ Items are frequently **reordered** (drag-and-drop, sorting)
- ✅ Components have **internal state** that should persist
- ✅ Items have **animations** or transitions
- ✅ Component **identity** matters (form inputs, focus, etc.)

It's less optimal when:
- ❌ Items are simple **primitives** (use mapArray)
- ❌ Order changes rarely
- ❌ Content changes more than order
- ❌ Memory is constrained (more signal overhead)

## The indexArray API

From Solid's `array.ts`:

```typescript
export function indexArray<T, U>(
  list: Accessor<readonly T[] | undefined | null | false>,
  mapFn: (v: Accessor<T>, i: number) => U,
  options: { fallback?: Accessor<any> } = {}
): () => U[]
```

### Parameters

1. **list**: Accessor returning the array to map
2. **mapFn**: Function to transform each item
   - `v`: An **Accessor** for the value (reactive!)
   - `i`: The index (just a number, not reactive)
3. **options**: Optional fallback for empty arrays

### Key Differences from mapArray

| Feature | mapArray | indexArray |
|---------|----------|------------|
| **Value** | Direct | Accessor (reactive) |
| **Index** | Accessor (reactive) | Number (static) |
| **Reconciles by** | Position | Identity |
| **On reorder** | Updates content | Moves DOM |
| **Best for** | Changing content | Changing order |

## Implementation Walkthrough

Let's build `indexArray` step by step.

### Step 1: Setup State

```typescript
export function indexArray<T, U>(
  list: Accessor<readonly T[] | undefined | null | false>,
  mapFn: (v: Accessor<T>, i: number) => U,
  options: { fallback?: Accessor<any> } = {}
): () => U[] {
  // Track previous items
  let items: T[] = [];
  let mapped: U[] = [];
  let disposers: (() => void)[] = [];
  
  // Signal setters for each item's value
  let signals: Setter<T>[] = [];
  let len = 0;
  
  // Cleanup on disposal
  onCleanup(() => dispose(disposers));
  
  // ... implementation continues
}
```

**Key difference from mapArray**: We store `signals` (setters) instead of `indexes`!

### Step 2: The Main Return Function

```typescript
return () => {
  const newItems = list() || [];
  const newLen = newItems.length;
  
  // Top-level tracking
  (newItems as any)[$TRACK];
  
  return untrack(() => {
    // Reconciliation logic...
  });
};
```

Same structure as `mapArray`.

### Step 3: Fast Path - Empty Array

```typescript
if (newLen === 0) {
  if (len !== 0) {
    dispose(disposers);
    disposers = [];
    items = [];
    mapped = [];
    len = 0;
    signals = [];
  }
  
  if (options.fallback) {
    items = [FALLBACK];
    mapped[0] = createRoot(disposer => {
      disposers[0] = disposer;
      return options.fallback!();
    });
    len = 1;
  }
  
  return mapped;
}
```

Identical to `mapArray` - clear everything and show fallback if needed.

### Step 4: Clear Fallback

```typescript
if (items[0] === FALLBACK) {
  disposers[0]();
  disposers = [];
  items = [];
  mapped = [];
  len = 0;
}
```

If we had a fallback, remove it before processing real items.

### Step 5: Reconciliation Loop

This is where `indexArray` differs significantly from `mapArray`:

```typescript
for (let i = 0; i < newLen; i++) {
  if (i < items.length && items[i] !== newItems[i]) {
    // Item at position i changed - update its signal
    signals[i](() => newItems[i]);
  } 
  else if (i >= items.length) {
    // New item - create it
    mapped[i] = createRoot(mapper);
  }
}

function mapper(disposer: () => void) {
  disposers[i] = disposer;
  
  // Create signal for this item's value
  const [s, set] = createSignal(newItems[i]);
  signals[i] = set;
  
  // Pass signal accessor and static index
  return mapFn(s, i);
}
```

**Key insight**: 
- If the value at position `i` changed, **update the signal**
- If position `i` is new, **create new component**
- Signal updates cause the component to re-render with new value

### Step 6: Cleanup and Trim

```typescript
// Dispose items beyond newLen
for (let i = newLen; i < items.length; i++) {
  disposers[i]();
}

// Update lengths and save snapshot
len = signals.length = disposers.length = newLen;
items = newItems.slice(0);
return (mapped = mapped.slice(0, len));
```

Remove items that no longer exist in the new array.

## The Complete Implementation

Here's the full `indexArray` implementation:

```typescript
import { $TRACK, Accessor, Setter, createSignal, createRoot, onCleanup, untrack } from './signal';

const FALLBACK = Symbol("fallback");

function dispose(d: (() => void)[]) {
  for (let i = 0; i < d.length; i++) d[i]();
}

export function indexArray<T, U>(
  list: Accessor<readonly T[] | undefined | null | false>,
  mapFn: (v: Accessor<T>, i: number) => U,
  options: { fallback?: Accessor<any> } = {}
): () => U[] {
  let items: (T | typeof FALLBACK)[] = [];
  let mapped: U[] = [];
  let disposers: (() => void)[] = [];
  let signals: Setter<T>[] = [];
  let len = 0;
  let i: number;

  onCleanup(() => dispose(disposers));
  
  return () => {
    const newItems = list() || [];
    const newLen = newItems.length;
    (newItems as any)[$TRACK];
    
    return untrack(() => {
      // Empty array
      if (newLen === 0) {
        if (len !== 0) {
          dispose(disposers);
          disposers = [];
          items = [];
          mapped = [];
          len = 0;
          signals = [];
        }
        if (options.fallback) {
          items = [FALLBACK];
          mapped[0] = createRoot(disposer => {
            disposers[0] = disposer;
            return options.fallback!();
          });
          len = 1;
        }
        return mapped;
      }
      
      // Remove fallback
      if (items[0] === FALLBACK) {
        disposers[0]();
        disposers = [];
        items = [];
        mapped = [];
        len = 0;
      }

      // Reconcile
      for (i = 0; i < newLen; i++) {
        if (i < items.length && items[i] !== newItems[i]) {
          // Update existing signal
          signals[i](() => newItems[i]);
        } else if (i >= items.length) {
          // Create new item
          mapped[i] = createRoot(mapper);
        }
      }
      
      // Cleanup excess items
      for (; i < items.length; i++) {
        disposers[i]();
      }
      
      len = signals.length = disposers.length = newLen;
      items = newItems.slice(0);
      return (mapped = mapped.slice(0, len));
    });
    
    function mapper(disposer: () => void) {
      disposers[i] = disposer;
      const [s, set] = createSignal(newItems[i]);
      signals[i] = set;
      return mapFn(s, i);
    }
  };
}
```

## Understanding the Algorithm

### Example: Reordering

```typescript
// Old: ['A', 'B', 'C']
// New: ['C', 'A', 'B']
```

#### With indexArray:

```
Position 0:
  Old: 'A', signal_A
  New: 'C'
  → Update signal_A('C')
  → Component at position 0 re-renders with 'C'

Position 1:
  Old: 'B', signal_B
  New: 'A'
  → Update signal_B('A')
  → Component at position 1 re-renders with 'A'

Position 2:
  Old: 'C', signal_C
  New: 'B'
  → Update signal_C('B')
  → Component at position 2 re-renders with 'B'
```

**Result**: All 3 components update their values via signals. No recreation!

### Example: Adding Item

```typescript
// Old: ['A', 'B']
// New: ['A', 'B', 'C']
```

```
Position 0: 'A' === 'A' → No change
Position 1: 'B' === 'B' → No change
Position 2: New item → Create new component for 'C'
```

### Example: Removing Item

```typescript
// Old: ['A', 'B', 'C']
// New: ['A', 'C']
```

```
Position 0: 'A' === 'A' → No change
Position 1: 'B' !== 'C' → Update signal_B('C')
Position 2: Removed → Dispose component at position 2
```

## Using indexArray

### Basic Usage

```typescript
import { createSignal } from 'solid-js';
import { indexArray } from './indexArray';

function UserList() {
  const [users, setUsers] = createSignal([
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
    { id: 3, name: 'Charlie' }
  ]);
  
  const userElements = indexArray(
    users,
    (user, index) => {
      console.log(`Creating component at index ${index}`);
      
      // user is an Accessor - call it to get the value
      return () => (
        <div>
          {index}. {user().name}
        </div>
      );
    }
  );
  
  return <div>{userElements()}</div>;
}
```

### Preserving Component State

```typescript
const elements = indexArray(
  items,
  (item) => {
    // This state persists even when item reorders!
    const [expanded, setExpanded] = createSignal(false);
    const [selected, setSelected] = createSignal(false);
    
    return () => (
      <div 
        class={selected() ? 'selected' : ''}
        onClick={() => setExpanded(prev => !prev)}
      >
        <h3>{item().title}</h3>
        {expanded() && <p>{item().description}</p>}
        <button onClick={() => setSelected(prev => !prev)}>
          {selected() ? 'Deselect' : 'Select'}
        </button>
      </div>
    );
  }
);
```

**Key**: When items reorder, `expanded` and `selected` state persists!

### Expensive Setup Example

```typescript
const elements = indexArray(
  items,
  (item) => {
    // Expensive setup runs once per item
    const connection = createWebSocketConnection(item().id);
    const chartInstance = createChart(item().data);
    
    // Update chart when data changes
    createEffect(() => {
      chartInstance.update(item().data);
    });
    
    // Cleanup runs only when item is removed
    onCleanup(() => {
      console.log(`Cleaning up item ${item().id}`);
      connection.close();
      chartInstance.destroy();
    });
    
    return () => <div ref={chartInstance.element} />;
  }
);
```

### Accessing Reactive Value

```typescript
const elements = indexArray(
  items,
  (item, index) => {
    // item is an Accessor - must call it
    
    // ❌ Wrong - captures initial value only
    const name = item().name;
    
    // ✅ Correct - reactive
    return () => <div>{item().name}</div>;
    
    // ✅ Also correct - use in effect
    createEffect(() => {
      console.log(`Item at ${index}: ${item().name}`);
    });
  }
);
```

## Comparing mapArray vs indexArray

### Example: Todo List

#### With mapArray (For)

```typescript
<For each={todos()}>
  {(todo, index) => {
    // todo = value (not reactive)
    // index = Accessor (reactive)
    
    return (
      <div>
        <input 
          type="checkbox" 
          checked={todo.completed}
          onChange={() => toggleTodo(index())}
        />
        {todo.text}
      </div>
    );
  }}
</For>
```

**When sorting todos**: All checkboxes re-render with new values

#### With indexArray (Index)

```typescript
<Index each={todos()}>
  {(todo, index) => {
    // todo = Accessor (reactive)
    // index = number (not reactive)
    
    return (
      <div>
        <input 
          type="checkbox" 
          checked={todo().completed}
          onChange={() => toggleTodo(index)}
        />
        {todo().text}
      </div>
    );
  }}
</Index>
```

**When sorting todos**: Components move, checkboxes keep their checked state

### Performance Comparison

| Operation | mapArray | indexArray |
|-----------|----------|------------|
| **Append** | O(1) - Create 1 | O(1) - Create 1 |
| **Prepend** | O(n) - Update all | O(n) - Update all signals |
| **Reorder** | O(n) - Update all content | O(n) - Update all signals |
| **Filter** | O(n) - Match and dispose | O(n) - Update and dispose |
| **Sort** | O(n) - Update all content | O(n) - Update all signals |

**Memory**:
- mapArray: 1 signal per item (if index used)
- indexArray: 1 signal per item (always)

## Decision Guide

### Use mapArray (For) when:

```typescript
// ✅ Simple primitives
<For each={[1, 2, 3, 4, 5]}>
  {num => <div>{num}</div>}
</For>

// ✅ Content changes frequently
<For each={searchResults()}>
  {result => <div>{result.title}</div>}
</For>

// ✅ Filter operations
<For each={todos().filter(t => !t.completed)}>
  {todo => <div>{todo.text}</div>}
</For>
```

### Use indexArray (Index) when:

```typescript
// ✅ Complex stateful components
<Index each={formFields()}>
  {(field, i) => <TextField field={field()} />}
</Index>

// ✅ Drag and drop
<Index each={sortableItems()}>
  {(item, i) => <DraggableItem item={item()} />}
</Index>

// ✅ Animations
<Index each={animatedList()}>
  {(item, i) => <AnimatedCard item={item()} />}
</Index>

// ✅ Expensive setup
<Index each={videoList()}>
  {(video, i) => <VideoPlayer src={video().url} />}
</Index>
```

## Common Pitfalls

### ❌ Pitfall 1: Forgetting to Call Value Accessor

```typescript
// ❌ Wrong - not calling accessor
indexArray(items, (item, index) => {
  const name = item.name;  // item is function, not object!
  return () => <div>{name}</div>;
});

// ✅ Correct
indexArray(items, (item, index) => {
  return () => <div>{item().name}</div>;
});
```

### ❌ Pitfall 2: Treating Index as Reactive

```typescript
// ❌ Wrong - index is not an Accessor
indexArray(items, (item, index) => {
  createEffect(() => {
    console.log(`Index: ${index()}`);  // index is not a function!
  });
});

// ✅ Correct - index is just a number
indexArray(items, (item, index) => {
  console.log(`Static index: ${index}`);
});
```

### ❌ Pitfall 3: Over-using indexArray

```typescript
// ❌ Overkill for simple lists
<Index each={['apple', 'banana', 'cherry']}>
  {(fruit) => <div>{fruit()}</div>}
</Index>

// ✅ Better - simpler and more efficient
<For each={['apple', 'banana', 'cherry']}>
  {(fruit) => <div>{fruit}</div>}
</For>
```

### ❌ Pitfall 4: Not Handling Value Changes

```typescript
// ❌ Captures initial value only
indexArray(items, (item, index) => {
  const title = item().title;  // Only reads once!
  
  return () => <div>{title}</div>;  // Won't update
});

// ✅ Reads value reactively
indexArray(items, (item, index) => {
  return () => <div>{item().title}</div>;  // Updates!
});
```

## Advanced Patterns

### Hybrid Approach

Sometimes you need both behaviors:

```typescript
// Track both value changes AND position
indexArray(items, (item, index) => {
  // Position signal (manual)
  const [position, setPosition] = createSignal(index);
  
  // Update position when array reorders
  createEffect(() => {
    const currentItem = item();
    const newIndex = items().indexOf(currentItem);
    setPosition(newIndex);
  });
  
  return () => (
    <div>
      Position {position()}: {item().name}
    </div>
  );
});
```

### Keyed Updates

For even more control, track by key:

```typescript
indexArray(items, (item, index) => {
  const key = item().id;
  
  // Only update when key changes
  const [cached, setCached] = createSignal(item());
  
  createEffect(() => {
    if (item().id === key) {
      setCached(item());
    }
  });
  
  return () => <ExpensiveComponent data={cached()} />;
});
```

## Summary

`indexArray` provides value-based reconciliation that:

1. **Preserves component instances** when items move
2. **Updates values** through signals
3. **Minimizes recreation** of expensive components
4. **Maintains state** across reorders
5. **Optimal for** drag-and-drop, animations, stateful items

Key differences from `mapArray`:
- Value is an Accessor (reactive)
- Index is a number (static)
- Reconciles by reference, not position
- Better for reordering, worse for simple lists

## Next Steps

In the next lesson, we'll dive deep into the **reconciliation algorithms** used by both mapArray and indexArray, exploring optimization techniques like prefix/suffix matching and map-based diffing.

## Further Reading

- Solid.js `array.ts` source (indexArray implementation)
- React's key-based reconciliation
- Vue's v-for with keys
- Reconciliation in other frameworks

---

**Practice Exercise**: Build a sortable list with drag-and-drop using `indexArray`. Compare it with a `mapArray` implementation and observe the difference in component lifecycle!
