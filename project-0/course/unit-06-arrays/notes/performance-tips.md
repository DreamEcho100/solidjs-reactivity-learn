# List Performance Optimization Guide

## Performance Profiling

### Using Chrome DevTools

1. **Record Performance**
```javascript
// In your code
console.time('list-render');
// ... render list
console.timeEnd('list-render');

// Or use Performance API
const start = performance.now();
// ... render list  
const duration = performance.now() - start;
console.log(`Rendered in ${duration}ms`);
```

2. **Memory Profiling**
- Open DevTools → Memory tab
- Take heap snapshot before
- Perform operation
- Take snapshot after
- Compare to find leaks

3. **Performance Monitor**
```
DevTools → More tools → Performance monitor
```
Watch:
- CPU usage
- JS heap size
- DOM nodes
- Layouts/sec

## Common Performance Issues

### Issue 1: Unnecessary Re-renders

**Problem**:
```typescript
// ❌ Creates new array every render
<For each={items().filter(i => i.active)}>
  {item => <div>{item.name}</div>}
</For>
```

**Solution**:
```typescript
// ✅ Memo the filtered result
const activeItems = createMemo(() => 
  items().filter(i => i.active)
);

<For each={activeItems()}>
  {item => <div>{item.name}</div>}
</For>
```

### Issue 2: Anonymous Functions

**Problem**:
```typescript
// ❌ New function every render
<For each={items()}>
  {item => (
    <button onClick={() => handleClick(item)}>
      Click
    </button>
  )}
</For>
```

**Solution**:
```typescript
// ✅ Stable reference
<For each={items()}>
  {item => (
    <button onClick={[handleClick, item]}>
      Click
    </button>
  )}
</For>
```

### Issue 3: Large Item Mutations

**Problem**:
```typescript
// ❌ Spreads entire array every time
setItems(prev => [...prev, newItem]);
```

**Solution for frequent appends**:
```typescript
// ✅ Use batch for multiple adds
batch(() => {
  setItems(prev => [...prev, ...newItems]);
});

// Or use store for granular updates
const [items, setItems] = createStore([]);
setItems(items.length, newItem);  // Direct index assignment
```

### Issue 4: Heavy Computations in Render

**Problem**:
```typescript
<For each={items()}>
  {item => {
    // ❌ Heavy computation every render
    const processed = expensiveOperation(item);
    return () => <div>{processed}</div>;
  }}
</For>
```

**Solution**:
```typescript
<For each={items()}>
  {item => {
    // ✅ Memo the expensive operation
    const processed = createMemo(() => expensiveOperation(item));
    return () => <div>{processed()}</div>;
  }}
</For>
```

## Optimization Techniques

### 1. Batch Updates

```typescript
import { batch } from 'solid-js';

// ❌ Multiple updates
setFilter('active');
setSortBy('name');
setPage(1);
// Triggers 3 reconciliations!

// ✅ Single update
batch(() => {
  setFilter('active');
  setSortBy('name');
  setPage(1);
});
// Triggers 1 reconciliation
```

### 2. Untrack Non-Dependencies

```typescript
// ❌ Tracks everything
createEffect(() => {
  items().forEach((item, index) => {
    updateDOM(item, index);
  });
});

// ✅ Don't track iteration
createEffect(() => {
  const itemList = items();  // Track the array
  untrack(() => {
    // Don't track individual items
    itemList.forEach((item, index) => {
      updateDOM(item, index);
    });
  });
});
```

### 3. Lazy Loading

```typescript
const LazyItem = lazy(() => import('./HeavyItem'));

<For each={items()}>
  {item => (
    <Suspense fallback={<Skeleton />}>
      <LazyItem data={item} />
    </Suspense>
  )}
</For>
```

### 4. Debounce/Throttle

```typescript
import { debounce } from '@solid-primitives/scheduled';

const [searchTerm, setSearchTerm] = createSignal('');
const debouncedSearch = debounce(setSearchTerm, 300);

<input 
  onInput={(e) => debouncedSearch(e.target.value)}
/>

const filteredItems = createMemo(() =>
  items().filter(item => 
    item.name.includes(searchTerm())
  )
);
```

### 5. Virtual Scrolling Threshold

```typescript
function SmartList(props: { items: any[] }) {
  // Use virtual scrolling for large lists
  return () => (
    props.items.length > 100
      ? <VirtualList items={props.items} {...props} />
      : <For each={props.items}>
          {item => props.renderItem(item)}
        </For>
  );
}
```

## Benchmarking Framework

```typescript
class ListBenchmark {
  private results: Map<string, number[]> = new Map();
  
  measure(name: string, fn: () => void, iterations = 10) {
    const times: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      fn();
      const end = performance.now();
      times.push(end - start);
    }
    
    this.results.set(name, times);
  }
  
  report() {
    for (const [name, times] of this.results) {
      const avg = times.reduce((a, b) => a + b) / times.length;
      const min = Math.min(...times);
      const max = Math.max(...times);
      
      console.log(`${name}:`);
      console.log(`  Average: ${avg.toFixed(2)}ms`);
      console.log(`  Min: ${min.toFixed(2)}ms`);
      console.log(`  Max: ${max.toFixed(2)}ms`);
    }
  }
}

// Usage
const bench = new ListBenchmark();

bench.measure('mapArray render', () => {
  // Render with mapArray
});

bench.measure('indexArray render', () => {
  // Render with indexArray
});

bench.report();
```

## Performance Checklist

### Initial Render
- [ ] Use virtual scrolling for >1000 items
- [ ] Lazy load heavy components
- [ ] Minimize initial data fetch
- [ ] Use suspense for async data
- [ ] Consider skeleton screens

### Updates
- [ ] Batch multiple updates
- [ ] Memo expensive computations
- [ ] Avoid anonymous functions in loops
- [ ] Use untrack for non-dependencies
- [ ] Debounce user input

### Scrolling
- [ ] Implement overscan
- [ ] Use fixed heights when possible
- [ ] Debounce scroll events
- [ ] Passive event listeners
- [ ] CSS containment

### Memory
- [ ] Clean up in onCleanup
- [ ] Avoid memory leaks in effects
- [ ] Profile with heap snapshots
- [ ] Use WeakMap for metadata
- [ ] Consider item pooling

## Performance Targets

| Items | Target | Acceptable | Poor |
|-------|--------|------------|------|
| **100** | <5ms | <10ms | >20ms |
| **1K** | <10ms | <20ms | >50ms |
| **10K** | <20ms | <50ms | >100ms |
| **100K** | <50ms | <100ms | >200ms |

**Memory targets**:
- <1MB for 1K items
- <10MB for 10K items
- <100MB for 100K items

**Scroll performance**:
- Maintain 60 FPS (16.67ms per frame)
- No janky scrolling
- Smooth animations

## Real-World Example

```typescript
// Optimized data table
function OptimizedDataTable(props: {
  data: Row[];
  columns: Column[];
}) {
  // Memo filtered/sorted data
  const processedData = createMemo(() => {
    let result = props.data;
    
    // Filter
    if (filter()) {
      result = result.filter(row => 
        matchesFilter(row, filter())
      );
    }
    
    // Sort
    if (sortColumn()) {
      result = [...result].sort((a, b) =>
        compare(a[sortColumn()!], b[sortColumn()!])
      );
    }
    
    return result;
  });
  
  // Virtual scrolling for large datasets
  return () => (
    processedData().length > 100 ? (
      <VirtualList
        items={processedData()}
        itemHeight={40}
        height={600}
        renderItem={(row) => <TableRow row={row} />}
      />
    ) : (
      <For each={processedData()}>
        {row => <TableRow row={row} />}
      </For>
    )
  );
}
```

## Tools and Libraries

### Performance Tools
- Chrome DevTools Performance tab
- React DevTools (works with Solid)
- `@solid-devtools` (official)
- Lighthouse
- WebPageTest

### Utility Libraries
- `@solid-primitives/scheduled` - Debounce/throttle
- `@solid-primitives/intersection-observer` - Lazy loading
- `@tanstack/virtual` - Advanced virtualization
- `solid-virtual` - Solid-specific virtual lists

## Further Reading

- [Web Vitals](https://web.dev/vitals/)
- [RAIL Performance Model](https://web.dev/rail/)
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)
- [Solid.js Performance Tips](https://docs.solidjs.com/guides/performance)

---

**Remember**: Measure first, optimize second. Premature optimization is the root of all evil!
