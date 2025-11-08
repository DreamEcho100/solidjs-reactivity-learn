# Unit 6 Exercises: Array and List Reactivity

## Exercise 1: Implement mapArray (⭐⭐⭐⭐)

### Objective
Build a complete `mapArray` implementation from scratch, following Solid.js's approach.

### Requirements

1. **Basic mapArray**
```typescript
export function mapArray<T, U>(
  list: Accessor<readonly T[] | undefined | null | false>,
  mapFn: (v: T, i: Accessor<number>) => U,
  options?: { fallback?: Accessor<any> }
): () => U[]
```

2. **Features to implement**:
   - [ ] Top-level tracking with `$TRACK`
   - [ ] Reactive index signals (when needed)
   - [ ] Disposer management
   - [ ] Fallback support
   - [ ] Empty array optimization
   - [ ] Initial creation fast path
   - [ ] Prefix/suffix optimization
   - [ ] Map-based reconciliation

### Tests

```typescript
import { createRoot, createSignal } from 'solid-js';
import { mapArray } from './mapArray';

describe('mapArray', () => {
  it('should create initial items', () => {
    createRoot(dispose => {
      const [items] = createSignal(['A', 'B', 'C']);
      const mapped = mapArray(items, (item) => () => item);
      
      expect(mapped()).toEqual(['A', 'B', 'C']);
      dispose();
    });
  });
  
  it('should reuse items on reorder', () => {
    createRoot(dispose => {
      const [items, setItems] = createSignal(['A', 'B', 'C']);
      let creationCount = 0;
      
      const mapped = mapArray(items, (item) => {
        creationCount++;
        return () => item;
      });
      
      expect(mapped()).toEqual(['A', 'B', 'C']);
      expect(creationCount).toBe(3);
      
      // Reorder
      setItems(['C', 'A', 'B']);
      expect(mapped()).toEqual(['C', 'A', 'B']);
      expect(creationCount).toBe(3);  // No new creations!
      
      dispose();
    });
  });
  
  it('should update index signals', () => {
    createRoot(dispose => {
      const [items, setItems] = createSignal(['A', 'B', 'C']);
      const indices: number[] = [];
      
      const mapped = mapArray(items, (item, index) => {
        return () => {
          indices.push(index());
          return item;
        };
      });
      
      indices.length = 0;
      mapped();  // Trigger
      expect(indices).toEqual([0, 1, 2]);
      
      setItems(['B', 'A', 'C']);
      indices.length = 0;
      mapped();
      expect(indices).toEqual([0, 1, 2]);  // Updated!
      
      dispose();
    });
  });
  
  it('should handle additions', () => {
    createRoot(dispose => {
      const [items, setItems] = createSignal(['A', 'B']);
      let creationCount = 0;
      
      const mapped = mapArray(items, (item) => {
        creationCount++;
        return () => item;
      });
      
      expect(creationCount).toBe(2);
      
      setItems(['A', 'B', 'C']);
      expect(mapped()).toEqual(['A', 'B', 'C']);
      expect(creationCount).toBe(3);
      
      dispose();
    });
  });
  
  it('should handle removals', () => {
    createRoot(dispose => {
      const [items, setItems] = createSignal(['A', 'B', 'C']);
      let disposeCount = 0;
      
      const mapped = mapArray(items, (item) => {
        onCleanup(() => disposeCount++);
        return () => item;
      });
      
      setItems(['A', 'C']);
      expect(mapped()).toEqual(['A', 'C']);
      expect(disposeCount).toBe(1);  // 'B' disposed
      
      dispose();
    });
  });
  
  it('should show fallback for empty array', () => {
    createRoot(dispose => {
      const [items, setItems] = createSignal<string[]>([]);
      
      const mapped = mapArray(
        items,
        (item) => () => item,
        { fallback: () => 'empty' }
      );
      
      expect(mapped()).toEqual(['empty']);
      
      setItems(['A']);
      expect(mapped()).toEqual(['A']);
      
      dispose();
    });
  });
});
```

### Bonus Challenges

1. **Performance test**: Verify prefix/suffix optimization works
2. **Duplicate handling**: Test with duplicate items
3. **Memory test**: Ensure no memory leaks
4. **Benchmark**: Compare with naive Array.map

---

## Exercise 2: Implement indexArray (⭐⭐⭐⭐)

### Objective
Build `indexArray` for value-based reconciliation.

### Requirements

```typescript
export function indexArray<T, U>(
  list: Accessor<readonly T[] | undefined | null | false>,
  mapFn: (v: Accessor<T>, i: number) => U,
  options?: { fallback?: Accessor<any> }
): () => U[]
```

### Features to implement:
- [ ] Value signals instead of index signals
- [ ] Update signals on change
- [ ] Proper disposer management
- [ ] Fallback support

### Tests

```typescript
describe('indexArray', () => {
  it('should create value signals', () => {
    createRoot(dispose => {
      const [items] = createSignal(['A', 'B', 'C']);
      
      const mapped = indexArray(items, (item) => {
        return () => item();
      });
      
      expect(mapped()).toEqual(['A', 'B', 'C']);
      dispose();
    });
  });
  
  it('should update signals on reorder', () => {
    createRoot(dispose => {
      const [items, setItems] = createSignal(['A', 'B', 'C']);
      let creationCount = 0;
      
      const mapped = indexArray(items, (item) => {
        creationCount++;
        return () => item();
      });
      
      expect(creationCount).toBe(3);
      
      setItems(['C', 'A', 'B']);
      expect(mapped()).toEqual(['C', 'A', 'B']);
      expect(creationCount).toBe(3);  // No recreations!
      
      dispose();
    });
  });
  
  it('should have static indices', () => {
    createRoot(dispose => {
      const [items, setItems] = createSignal(['A', 'B', 'C']);
      const indices: number[] = [];
      
      const mapped = indexArray(items, (item, index) => {
        indices.push(index);
        return () => item();
      });
      
      expect(indices).toEqual([0, 1, 2]);
      
      indices.length = 0;
      setItems(['B', 'A', 'C']);
      expect(indices).toEqual([]);  // No new creations!
      
      dispose();
    });
  });
});
```

---

## Exercise 3: Virtual List (⭐⭐⭐⭐⭐)

### Objective
Build a production-ready virtual scrolling list.

### Requirements

```typescript
interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  height: number;
  overscan?: number;
  renderItem: (item: T, index: number) => JSX.Element;
}

function VirtualList<T>(props: VirtualListProps<T>): JSX.Element
```

### Features
- [ ] Visible range calculation
- [ ] Overscan for smooth scrolling
- [ ] Proper positioning
- [ ] Scroll event handling
- [ ] Dynamic item updates

### Test Scenarios

1. **Render only visible items**
```typescript
const items = Array.from({ length: 10000 }, (_, i) => `Item ${i}`);

<VirtualList
  items={items}
  itemHeight={50}
  height={500}
  renderItem={(item) => <div>{item}</div>}
/>

// Should render ~10 items, not 10000!
```

2. **Smooth scrolling**
```typescript
// Scroll to middle
container.scrollTop = 5000;

// Should render items around position 100 (5000 / 50)
// With overscan, maybe items 95-115
```

3. **Dynamic updates**
```typescript
// Add items
setItems(prev => [...prev, 'New item']);

// Should not recreate existing items
```

### Performance Goals
- [ ] Render <100ms for 100,000 items
- [ ] Smooth 60fps scrolling
- [ ] <50MB memory for 100,000 items

---

## Exercise 4: Optimized Grid (⭐⭐⭐⭐)

### Objective
Implement 2D virtual scrolling for a grid layout.

### Requirements

```typescript
interface VirtualGridProps<T> {
  items: T[];
  itemWidth: number;
  itemHeight: number;
  columns: number;
  width: number;
  height: number;
  renderItem: (item: T, row: number, col: number) => JSX.Element;
}
```

### Features
- [ ] Calculate visible rows and columns
- [ ] Efficient 2D positioning
- [ ] Handle grid layout
- [ ] Overscan in both dimensions

### Implementation Hints

```typescript
// Visible range
const visibleRows = createMemo(() => {
  const startRow = Math.floor(scrollTop() / itemHeight);
  const endRow = Math.ceil((scrollTop() + height) / itemHeight);
  return { startRow, endRow };
});

const visibleCols = createMemo(() => {
  const startCol = Math.floor(scrollLeft() / itemWidth);
  const endCol = Math.ceil((scrollLeft() + width) / itemWidth);
  return { startCol, endCol };
});

// Grid items
const gridItems = createMemo(() => {
  const { startRow, endRow } = visibleRows();
  const { startCol, endCol } = visibleCols();
  const items = [];
  
  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      const index = row * columns + col;
      if (index < props.items.length) {
        items.push({
          item: props.items[index],
          row,
          col,
          x: col * itemWidth,
          y: row * itemHeight
        });
      }
    }
  }
  
  return items;
});
```

---

## Exercise 5: Performance Comparison (⭐⭐⭐)

### Objective
Compare performance of different list strategies.

### Task
Build a test harness that compares:

1. **Naive For loop**
```typescript
<For each={items()}>
  {item => <div>{item}</div>}
</For>
```

2. **Paginated list**
```typescript
<PaginatedList items={items()} pageSize={50} />
```

3. **Virtual scrolling**
```typescript
<VirtualList items={items()} itemHeight={50} height={500} />
```

### Metrics to Measure
- Initial render time
- Memory usage
- Scroll FPS
- Update time
- Time to first paint

### Test Sizes
- 100 items
- 1,000 items
- 10,000 items
- 100,000 items

### Expected Results

| Strategy | 100 items | 1K items | 10K items | 100K items |
|----------|-----------|----------|-----------|------------|
| **Naive** | 5ms | 50ms | 500ms | 5000ms |
| **Paginated** | 5ms | 5ms | 5ms | 5ms |
| **Virtual** | 2ms | 2ms | 2ms | 2ms |

---

## Exercise 6: Advanced Reconciliation (⭐⭐⭐⭐⭐)

### Objective
Implement alternative reconciliation algorithms and compare them.

### Algorithms to Implement

1. **LCS (Longest Common Subsequence)**
```typescript
function lcsReconcile<T>(old: T[], new: T[]): Edit[]
```

2. **Myers Diff**
```typescript
function myersDiff<T>(old: T[], new: T[]): Edit[]
```

3. **Patience Diff**
```typescript
function patienceDiff<T>(old: T[], new: T[]): Edit[]
```

### Comparison Metrics
- Edit distance (how many operations)
- Execution time
- Memory usage

### Test Cases
```typescript
const testCases = [
  {
    name: 'Append',
    old: [1, 2, 3],
    new: [1, 2, 3, 4]
  },
  {
    name: 'Prepend',
    old: [2, 3, 4],
    new: [1, 2, 3, 4]
  },
  {
    name: 'Reverse',
    old: [1, 2, 3, 4, 5],
    new: [5, 4, 3, 2, 1]
  },
  {
    name: 'Shuffle',
    old: [1, 2, 3, 4, 5],
    new: [3, 1, 5, 2, 4]
  }
];
```

---

## Bonus Challenges

### 1. Animated List Transitions
Implement smooth transitions when items move/add/remove.

### 2. Variable Height Virtual List
Support variable heights with measurements.

### 3. Infinite Scroll
Combine virtual scrolling with infinite loading.

### 4. Drag and Drop
Build a sortable list with drag-and-drop.

### 5. Table Virtualization
Virtual scrolling for both rows and columns.

---

## Submission Checklist

- [ ] All tests pass
- [ ] Performance benchmarks included
- [ ] Memory profiling done
- [ ] Edge cases handled
- [ ] Code is well-documented
- [ ] Comparisons with naive approaches

## Resources

- Solid.js `array.ts` source code
- [react-window](https://github.com/bvaughn/react-window)
- [Myers Diff Algorithm](https://blog.jcoglan.com/2017/02/12/the-myers-diff-algorithm-part-1/)
- Chrome DevTools Performance profiler

Good luck! 🚀
