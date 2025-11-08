# Lesson 4: List Optimization Techniques

## Overview

Even with efficient reconciliation, rendering large lists can be slow. This lesson explores advanced optimization techniques: virtual scrolling, windowing, pagination, and lazy loading.

## Learning Objectives

By the end of this lesson, you will:
- ✅ Implement virtual scrolling for large lists
- ✅ Build windowing systems
- ✅ Design pagination strategies
- ✅ Apply lazy loading patterns
- ✅ Optimize memory usage in lists

## The Large List Problem

###The Challenge

```typescript
// 10,000 items
const [items] = createSignal(Array.from({ length: 10000 }, (_, i) => ({
  id: i,
  name: `Item ${i}`,
  description: `Description for item ${i}`
})));

// Render all items
<For each={items()}>
  {item => <div class="item">{item.name}</div>}
</For>
```

**Problems**:
1. **Initial render**: 10,000 DOM nodes created
2. **Memory**: ~1-2MB for DOM alone
3. **Layout**: Browser must calculate position of all 10,000 elements
4. **Scroll**: Janky performance
5. **Updates**: Reconciliation still processes all 10,000 items

**Reality**: User can only see ~20 items at once!

### The Solution: Virtual Scrolling

Only render items that are visible (or near-visible).

## Virtual Scrolling

### The Concept

```
                Viewport (visible)
                ┌───────────┐
Full List       │  Item 45  │
─────────────   │  Item 46  │ ← Only render these
  Item 43       │  Item 47  │
  Item 44       │  Item 48  │
  Item 45 ─────►│  Item 49  │
  Item 46       │  Item 50  │
  Item 47       │  Item 51  │
  Item 48       └───────────┘
  Item 49
  Item 50
  Item 51
  Item 52
─────────────
```

**Key idea**: Calculate which items are visible, only render those.

### Implementation

```typescript
import { createSignal, createMemo, onMount } from 'solid-js';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;      // Fixed height per item
  height: number;          // Container height
  overscan?: number;       // Extra items to render above/below
  renderItem: (item: T, index: number) => JSX.Element;
}

function VirtualList<T>(props: VirtualListProps<T>) {
  let containerRef!: HTMLDivElement;
  const [scrollTop, setScrollTop] = createSignal(0);
  
  // Calculate visible range
  const visibleRange = createMemo(() => {
    const { itemHeight, height, overscan = 5 } = props;
    const scroll = scrollTop();
    
    // First visible index
    const start = Math.floor(scroll / itemHeight);
    
    // Last visible index
    const visibleCount = Math.ceil(height / itemHeight);
    const end = start + visibleCount;
    
    // Add overscan (render a bit extra for smooth scrolling)
    return {
      start: Math.max(0, start - overscan),
      end: Math.min(props.items.length, end + overscan)
    };
  });
  
  // Slice visible items
  const visibleItems = createMemo(() => {
    const { start, end } = visibleRange();
    return props.items.slice(start, end).map((item, i) => ({
      item,
      index: start + i
    }));
  });
  
  // Total height (for scrollbar)
  const totalHeight = () => props.items.length * props.itemHeight;
  
  // Offset for visible items (position them correctly)
  const offsetY = () => visibleRange().start * props.itemHeight;
  
  return (
    <div
      ref={containerRef}
      style={{
        height: `${props.height}px`,
        overflow: 'auto',
        position: 'relative'
      }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      {/* Spacer for total height */}
      <div style={{ height: `${totalHeight()}px`, position: 'relative' }}>
        {/* Visible items container */}
        <div
          style={{
            position: 'absolute',
            top: `${offsetY()}px`,
            left: 0,
            right: 0
          }}
        >
          <For each={visibleItems()}>
            {({ item, index }) => props.renderItem(item, index)}
          </For>
        </div>
      </div>
    </div>
  );
}
```

### Usage

```typescript
<VirtualList
  items={items()}
  itemHeight={50}
  height={500}
  overscan={3}
  renderItem={(item, index) => (
    <div style={{ height: '50px' }}>
      {index}. {item.name}
    </div>
  )}
/>
```

### Performance Impact

| Items | Without Virtual | With Virtual | Improvement |
|-------|----------------|--------------|-------------|
| 100 | 5ms | 2ms | 2.5x |
| 1,000 | 50ms | 2ms | 25x |
| 10,000 | 500ms | 2ms | 250x |
| 100,000 | 5000ms | 2ms | 2500x |

**Memory savings**: ~100x reduction for 10,000 items

## Variable Height Items

### The Challenge

Not all items are the same height:

```typescript
// Heights vary
const items = [
  { content: 'Short' },           // 50px
  { content: 'Medium length' },   // 75px
  { content: 'Very long...' }     // 150px
];
```

Can't simply multiply index by fixed height!

### Solution 1: Measured Heights

```typescript
interface MeasuredVirtualListProps<T> {
  items: T[];
  estimatedHeight: number;  // Initial guess
  height: number;
  renderItem: (item: T, index: number) => JSX.Element;
}

function MeasuredVirtualList<T>(props: MeasuredVirtualListProps<T>) {
  // Store measured heights
  const [heights, setHeights] = createSignal<Map<number, number>>(new Map());
  
  // Measure item height after render
  const measureItem = (index: number, el: HTMLElement) => {
    const height = el.getBoundingClientRect().height;
    setHeights(prev => new Map(prev).set(index, height));
  };
  
  // Calculate cumulative offsets
  const offsets = createMemo(() => {
    const result = [0];
    const heightMap = heights();
    
    for (let i = 0; i < props.items.length; i++) {
      const height = heightMap.get(i) ?? props.estimatedHeight;
      result.push(result[i] + height);
    }
    
    return result;
  });
  
  // Find visible range using binary search
  const visibleRange = createMemo(() => {
    const scroll = scrollTop();
    const offsetArray = offsets();
    
    // Binary search for start
    const start = binarySearch(offsetArray, scroll);
    
    // Binary search for end
    const end = binarySearch(offsetArray, scroll + props.height);
    
    return { start, end: end + 1 };
  });
  
  // Rest of implementation...
}

function binarySearch(arr: number[], target: number): number {
  let left = 0;
  let right = arr.length - 1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) left = mid + 1;
    else right = mid - 1;
  }
  
  return Math.max(0, right);
}
```

### Solution 2: Pre-measured Heights

If you know heights beforehand:

```typescript
interface Item {
  content: string;
  height: number;  // Pre-known height
}

function PreMeasuredVirtualList(props: { items: Item[], ... }) {
  const offsets = createMemo(() => {
    const result = [0];
    for (let i = 0; i < props.items.length; i++) {
      result.push(result[i] + props.items[i].height);
    }
    return result;
  });
  
  // Same binary search logic...
}
```

## Windowing Strategies

### Fixed Window

Render a fixed number of items around visible area:

```typescript
const WINDOW_SIZE = 50;

const windowedItems = createMemo(() => {
  const { start } = visibleRange();
  const windowStart = Math.max(0, start - WINDOW_SIZE / 2);
  const windowEnd = Math.min(
    items().length,
    windowStart + WINDOW_SIZE
  );
  
  return items().slice(windowStart, windowEnd);
});
```

**Pros**: Simple, predictable memory usage  
**Cons**: Might not match scroll speed

### Adaptive Window

Adjust window size based on scroll speed:

```typescript
const [windowSize, setWindowSize] = createSignal(50);
const [lastScroll, setLastScroll] = createSignal(Date.now());

const updateWindowSize = (scrollTop: number) => {
  const now = Date.now();
  const dt = now - lastScroll();
  const scrollSpeed = Math.abs(scrollTop - prevScrollTop()) / dt;
  
  // Larger window for fast scrolling
  if (scrollSpeed > 100) {
    setWindowSize(100);
  } else if (scrollSpeed > 50) {
    setWindowSize(75);
  } else {
    setWindowSize(50);
  }
  
  setLastScroll(now);
};
```

**Pros**: Smooth at any scroll speed  
**Cons**: More complex

### Directional Overscan

More overscan in scroll direction:

```typescript
const [scrollDirection, setScrollDirection] = createSignal<'up' | 'down'>('down');

const visibleRange = createMemo(() => {
  const { start, end } = baseVisibleRange();
  const direction = scrollDirection();
  
  return {
    start: start - (direction === 'up' ? 10 : 3),
    end: end + (direction === 'down' ? 10 : 3)
  };
});
```

## Pagination

### Client-Side Pagination

```typescript
interface PaginatedListProps<T> {
  items: T[];
  pageSize: number;
  renderItem: (item: T) => JSX.Element;
}

function PaginatedList<T>(props: PaginatedListProps<T>) {
  const [currentPage, setCurrentPage] = createSignal(0);
  
  const totalPages = () => Math.ceil(props.items.length / props.pageSize);
  
  const pageItems = createMemo(() => {
    const start = currentPage() * props.pageSize;
    const end = start + props.pageSize;
    return props.items.slice(start, end);
  });
  
  return (
    <div>
      <For each={pageItems()}>
        {item => props.renderItem(item)}
      </For>
      
      <div class="pagination">
        <button
          disabled={currentPage() === 0}
          onClick={() => setCurrentPage(p => p - 1)}
        >
          Previous
        </button>
        
        <span>
          Page {currentPage() + 1} of {totalPages()}
        </span>
        
        <button
          disabled={currentPage() === totalPages() - 1}
          onClick={() => setCurrentPage(p => p + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

### Cursor-Based Pagination

For server-side data:

```typescript
interface CursorPaginatedListProps<T> {
  fetchPage: (cursor?: string) => Promise<{
    items: T[];
    nextCursor?: string;
  }>;
  renderItem: (item: T) => JSX.Element;
}

function CursorPaginatedList<T>(props: CursorPaginatedListProps<T>) {
  const [items, setItems] = createSignal<T[]>([]);
  const [cursor, setCursor] = createSignal<string>();
  const [loading, setLoading] = createSignal(false);
  
  const loadMore = async () => {
    setLoading(true);
    const result = await props.fetchPage(cursor());
    setItems(prev => [...prev, ...result.items]);
    setCursor(result.nextCursor);
    setLoading(false);
  };
  
  onMount(loadMore);
  
  return (
    <div>
      <For each={items()}>
        {item => props.renderItem(item)}
      </For>
      
      <Show when={cursor()}>
        <button onClick={loadMore} disabled={loading()}>
          {loading() ? 'Loading...' : 'Load More'}
        </button>
      </Show>
    </div>
  );
}
```

## Infinite Scroll

```typescript
function InfiniteScrollList<T>(props: {
  items: T[];
  loadMore: () => void;
  hasMore: boolean;
  renderItem: (item: T) => JSX.Element;
}) {
  let sentinelRef!: HTMLDivElement;
  
  onMount(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && props.hasMore) {
          props.loadMore();
        }
      },
      { rootMargin: '100px' }  // Load before reaching bottom
    );
    
    observer.observe(sentinelRef);
    
    onCleanup(() => observer.disconnect());
  });
  
  return (
    <div>
      <For each={props.items}>
        {item => props.renderItem(item)}
      </For>
      
      <Show when={props.hasMore}>
        <div ref={sentinelRef} style={{ height: '1px' }} />
      </Show>
    </div>
  );
}
```

## Lazy Loading Images

```typescript
function LazyImage(props: { src: string; alt: string }) {
  const [loaded, setLoaded] = createSignal(false);
  let imgRef!: HTMLImageElement;
  
  onMount(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          imgRef.src = props.src;
          setLoaded(true);
          observer.disconnect();
        }
      }
    );
    
    observer.observe(imgRef);
    
    onCleanup(() => observer.disconnect());
  });
  
  return (
    <img
      ref={imgRef}
      alt={props.alt}
      style={{
        opacity: loaded() ? 1 : 0,
        transition: 'opacity 0.3s'
      }}
    />
  );
}
```

## Memory Optimization

### 1. Item Pooling

Reuse DOM nodes instead of creating/destroying:

```typescript
class ItemPool {
  private pool: HTMLElement[] = [];
  private inUse = new Set<HTMLElement>();
  
  acquire(): HTMLElement {
    let item = this.pool.pop();
    if (!item) {
      item = document.createElement('div');
      item.className = 'list-item';
    }
    this.inUse.add(item);
    return item;
  }
  
  release(item: HTMLElement) {
    this.inUse.delete(item);
    this.pool.push(item);
  }
  
  clear() {
    this.pool = [];
    this.inUse.clear();
  }
}
```

### 2. Debounced Reconciliation

Don't reconcile on every scroll event:

```typescript
import { debounce } from '@solid-primitives/scheduled';

const debouncedScroll = debounce((scrollTop: number) => {
  setScrollTop(scrollTop);
}, 16);  // ~60fps

<div onScroll={(e) => debouncedScroll(e.currentTarget.scrollTop)}>
```

### 3. Progressive Enhancement

Load less critical data later:

```typescript
function LazyLoadedItem(props: { item: Item }) {
  const [details, setDetails] = createSignal<Details>();
  
  // Load details only when visible for a while
  createEffect(() => {
    const timer = setTimeout(() => {
      loadDetails(props.item.id).then(setDetails);
    }, 500);
    
    return () => clearTimeout(timer);
  });
  
  return (
    <div>
      <h3>{props.item.title}</h3>
      <Show when={details()} fallback={<Skeleton />}>
        {d => <Details data={d()} />}
      </Show>
    </div>
  );
}
```

## Best Practices

### 1. Choose the Right Strategy

```typescript
// Small lists (<100 items)
✅ Use simple <For> or <Index>

// Medium lists (100-1000 items)
✅ Consider pagination or windowing

// Large lists (>1000 items)
✅ Use virtual scrolling

// Infinite data
✅ Use cursor pagination with infinite scroll
```

### 2. Fixed Heights When Possible

```typescript
// ✅ Much simpler and faster
<VirtualList itemHeight={50} ... />

// ❌ Avoid if possible
<MeasuredVirtualList estimatedHeight={50} ... />
```

### 3. Batch Updates

```typescript
// ❌ Bad - triggers reconciliation 1000 times
for (let i = 0; i < 1000; i++) {
  setItems(prev => [...prev, newItems[i]]);
}

// ✅ Good - triggers once
setItems(prev => [...prev, ...newItems]);
```

### 4. Avoid Anonymous Functions

```typescript
// ❌ Creates new function every render
<For each={items()}>
  {item => <div onClick={() => handle(item)}>{item}</div>}
</For>

// ✅ Stable reference
const handleClick = (item: Item) => handle(item);
<For each={items()}>
  {item => <div onClick={[handleClick, item]}>{item}</div>}
</For>
```

## Performance Checklist

- [ ] Use virtual scrolling for >1000 items
- [ ] Implement overscan for smooth scrolling
- [ ] Use fixed heights when possible
- [ ] Batch array updates
- [ ] Lazy load images and heavy content
- [ ] Debounce scroll events
- [ ] Use pagination for static datasets
- [ ] Implement cursor-based pagination for APIs
- [ ] Pool DOM nodes for extreme performance
- [ ] Profile and measure actual performance

## Summary

Large list optimization techniques:

1. **Virtual Scrolling**: Only render visible items
2. **Windowing**: Render a sliding window of items
3. **Pagination**: Break into pages (client or server)
4. **Infinite Scroll**: Load more on scroll
5. **Lazy Loading**: Defer non-critical content
6. **Memory Optimization**: Pool nodes, debounce, batch

Choose based on your use case:
- **Static data**: Pagination or virtual scroll
- **Infinite data**: Cursor pagination + infinite scroll
- **Real-time updates**: Virtual scroll with efficient reconciliation
- **Heavy items**: Lazy loading + windowing

## Next Steps

You now have a complete understanding of Solid's array handling! The exercises will have you implement these optimizations and compare their performance.

## Further Reading

- [react-window](https://github.com/bvaughn/react-window) (inspiration)
- [@tanstack/virtual](https://tanstack.com/virtual/latest) (modern alternative)
- [Intersection Observer API](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API)
- [RequestIdleCallback](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback)

---

**Practice Exercise**: Build a virtual scrolling list that handles 100,000 items smoothly. Add features like search, sort, and filter without sacrificing performance!
