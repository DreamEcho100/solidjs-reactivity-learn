# Lesson 2: Performance Optimization

## Introduction

Performance optimization in reactive systems is about minimizing unnecessary work. This lesson covers strategies to reduce computations, optimize updates, and measure performance improvements.

## Understanding Performance Bottlenecks

### The Cost of Reactivity

Every reactive operation has a cost:

```javascript
// Cost breakdown
const [count, setCount] = createSignal(0);  // ~100 bytes, O(1)

createEffect(() => {                         // ~200 bytes, O(1)
  console.log(count());                      // O(1) per update
});

setCount(1);  // Costs:
// 1. Update signal value: O(1)
// 2. Mark observers: O(observers)
// 3. Run scheduler: O(log queue size)
// 4. Execute effects: O(effects)
```

**Optimization goal:** Reduce total operations, not just individual costs.

### Measuring Performance

```javascript
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      signals: 0,
      effects: 0,
      memos: 0,
      updates: 0,
      totalTime: 0
    };
  }
  
  measureSignal(fn) {
    this.metrics.signals++;
    return fn();
  }
  
  measureEffect(fn) {
    this.metrics.effects++;
    const start = performance.now();
    const result = fn();
    this.metrics.totalTime += performance.now() - start;
    return result;
  }
  
  measureUpdate(fn) {
    this.metrics.updates++;
    const start = performance.now();
    const result = fn();
    this.metrics.totalTime += performance.now() - start;
    return result;
  }
  
  report() {
    console.table(this.metrics);
    console.log('Average update time:', 
      (this.metrics.totalTime / this.metrics.updates).toFixed(2), 'ms');
  }
  
  reset() {
    for (const key in this.metrics) {
      this.metrics[key] = 0;
    }
  }
}

const monitor = new PerformanceMonitor();

// Usage
monitor.measureUpdate(() => {
  setCount(count() + 1);
});

monitor.report();
```

## Optimization Techniques

### 1. Batching Updates

**Problem:** Multiple updates trigger multiple effect runs

```javascript
// ❌ Inefficient - 3 separate updates
const [firstName, setFirstName] = createSignal('John');
const [lastName, setLastName] = createSignal('Doe');
const [age, setAge] = createSignal(30);

createEffect(() => {
  console.log(`${firstName()} ${lastName()}, ${age()}`);
  // Runs 3 times if we update all three
});

setFirstName('Jane');   // Effect runs (1)
setLastName('Smith');   // Effect runs (2)
setAge(25);             // Effect runs (3)
```

**Solution:** Use `batch()`

```javascript
// ✅ Efficient - 1 update
batch(() => {
  setFirstName('Jane');
  setLastName('Smith');
  setAge(25);
  // Effect runs once after batch completes
});
```

**How batch() works:**

```typescript
// From scheduler.ts
let UpdatesFlag = 0;

export function batch<T>(fn: () => T): T {
  if (UpdatesFlag) return fn(); // Already batching
  
  UpdatesFlag = 1;  // Prevent effects from running
  
  try {
    return fn();    // Execute all updates
  } finally {
    UpdatesFlag = 0;
    runUpdates();   // Run accumulated effects once
  }
}
```

**Visual representation:**

```
Without batch:
setA(1) → mark observers → run effects → [Effect 1, Effect 2]
setB(2) → mark observers → run effects → [Effect 1, Effect 2]
setC(3) → mark observers → run effects → [Effect 1, Effect 2]
Total: 6 effect runs

With batch:
batch(() => {
  setA(1) → mark observers
  setB(2) → mark observers
  setC(3) → mark observers
}) → run effects → [Effect 1, Effect 2]
Total: 2 effect runs
```

### 2. Strategic Untracking

**Problem:** Tracking unnecessary dependencies

```javascript
// ❌ Tracks both userId and timestamp
createEffect(() => {
  const id = userId();
  const ts = Date.now(); // Creates dependency on... nothing useful
  
  fetch(`/api/user/${id}?ts=${ts}`);
  // Re-runs every time, even though ts doesn't trigger updates
});
```

**Solution:** Use `untrack()`

```javascript
// ✅ Only tracks userId
createEffect(() => {
  const id = userId();
  const ts = untrack(() => Date.now()); // No dependency created
  
  fetch(`/api/user/${id}?ts=${ts}`);
  // Only re-runs when userId changes
});
```

**Advanced untracking patterns:**

```javascript
// Pattern 1: Untrack expensive computations
createEffect(() => {
  const currentId = userId(); // Tracked
  
  // Check cache without tracking
  const cached = untrack(() => cache.get(currentId));
  if (cached) return cached;
  
  // Fetch only if not cached
  const data = fetchData(currentId);
  untrack(() => cache.set(currentId, data));
});

// Pattern 2: Untrack callbacks
const handleClick = () => {
  // This runs in response to user action, not reactive updates
  untrack(() => {
    const current = count(); // Read without dependency
    setCount(current + 1);   // Update without re-running parent
  });
};

// Pattern 3: Untrack initialization
createEffect(() => {
  // Only track relevant signals
  const items = itemList();
  
  // Don't track initial setup
  const processor = untrack(() => createProcessor(config()));
  
  items.forEach(item => processor.process(item));
});
```

### 3. Memoization

**Problem:** Expensive computations run repeatedly

```javascript
// ❌ Recomputes on every access
const fullName = () => {
  const first = firstName();
  const last = lastName();
  return `${first} ${last}`.toUpperCase().trim();
  // Computed every time fullName() is called
};

createEffect(() => {
  console.log(fullName()); // Computes
});

createEffect(() => {
  console.log(fullName()); // Computes again!
});
```

**Solution:** Use `createMemo()`

```javascript
// ✅ Computes once, caches result
const fullName = createMemo(() => {
  const first = firstName();
  const last = lastName();
  return `${first} ${last}`.toUpperCase().trim();
  // Only recomputes when firstName or lastName change
});

createEffect(() => {
  console.log(fullName()); // Uses cache
});

createEffect(() => {
  console.log(fullName()); // Uses same cache
});
```

**When to use memos:**

```javascript
// ✅ Good cases for memos
const expensiveFilter = createMemo(() => 
  items().filter(item => complexPredicate(item))
);

const derivedData = createMemo(() => 
  rawData().map(transform).reduce(aggregate, initial)
);

const cachedFetch = createMemo(() => 
  fetchFromAPI(userId())
);

// ❌ Don't memo trivial computations
const bad1 = createMemo(() => count() + 1);  // Just use () => count() + 1
const bad2 = createMemo(() => name());       // Just use name directly
const bad3 = createMemo(() => props.value);  // Props already memoized
```

### 4. Selector Optimization

**Problem:** O(n) updates for selection changes

```javascript
// ❌ Inefficient - every item re-renders on selection change
const [selectedId, setSelectedId] = createSignal(null);

items().forEach(item => {
  createEffect(() => {
    const isSelected = selectedId() === item.id;
    // This runs for EVERY item when selection changes
    renderItem(item, isSelected);
  });
});

// If you have 1000 items and change selection:
// - 1000 effects run
// - 1000 comparisons
// - 1000 re-renders (999 unnecessary)
```

**Solution:** Use `createSelector()`

```javascript
// ✅ Efficient - O(2) updates
const [selectedId, setSelectedId] = createSignal(null);
const isSelected = createSelector(selectedId);

items().forEach(item => {
  createEffect(() => {
    const selected = isSelected(item.id);
    // Only runs for the newly selected and previously selected items
    renderItem(item, selected);
  });
});

// When selection changes:
// - 2 effects run (old selection and new selection)
// - 2 comparisons
// - 2 re-renders (exactly what's needed)
```

**How createSelector works:**

```typescript
function createSelector<T>(source: () => T, fn: (a: T, b: T) => boolean = (a, b) => a === b) {
  let previous: T;
  
  return (key: T) => {
    // Create a memo for each unique key
    return createMemo(() => {
      const current = source();
      
      // Only update if this key is involved in the change
      if (fn(current, key)) return true;
      if (fn(previous, key)) {
        // Was selected, now isn't
        previous = current;
        return false;
      }
      return false;
    })();
  };
}
```

**Advanced selector patterns:**

```javascript
// Multi-select with O(2m) where m = number of changes
function createMultiSelector<T>(source: () => Set<T>) {
  const previous = new Set<T>();
  
  return (key: T) => {
    return createMemo(() => {
      const current = source();
      const wasSelected = previous.has(key);
      const isSelected = current.has(key);
      
      if (wasSelected !== isSelected) {
        if (isSelected) previous.add(key);
        else previous.delete(key);
        return isSelected;
      }
      
      return isSelected;
    })();
  };
}

// Usage
const [selected, setSelected] = createSignal(new Set([1, 2, 3]));
const isSelected = createMultiSelector(selected);

// Only items 3 and 4 update when selection changes
setSelected(new Set([1, 2, 4]));
```

### 5. Lazy Evaluation

**Problem:** Creating computations that might never be used

```javascript
// ❌ Creates memo even if never accessed
function createExpensiveData() {
  const processed = createMemo(() => {
    console.log('Processing...');
    return heavyComputation(rawData());
  });
  
  return { processed };
}

const data = createExpensiveData();
// "Processing..." logs even if we never call data.processed()
```

**Solution:** Lazy initialization

```javascript
// ✅ Only creates memo when first accessed
function createLazyData() {
  let processed;
  
  return {
    get processed() {
      if (!processed) {
        processed = createMemo(() => {
          console.log('Processing...');
          return heavyComputation(rawData());
        });
      }
      return processed();
    }
  };
}

const data = createLazyData();
// Nothing happens yet...
console.log(data.processed); // NOW it processes
```

**Lazy component pattern:**

```javascript
// Only create reactive scope when component mounts
function lazyComponent(Component) {
  let instance;
  
  return (props) => {
    if (!instance) {
      instance = createRoot(() => Component(props));
    }
    return instance;
  };
}
```

### 6. Reducing Computation Depth

**Problem:** Deep reactive chains

```javascript
// ❌ Creates chain of 5 computations
const a = createMemo(() => source() * 2);
const b = createMemo(() => a() + 1);
const c = createMemo(() => b() * 3);
const d = createMemo(() => c() - 5);
const e = createMemo(() => d() / 2);

// When source changes: 5 memos recompute sequentially
```

**Solution:** Flatten when possible

```javascript
// ✅ Single computation
const result = createMemo(() => {
  const base = source();
  return ((base * 2 + 1) * 3 - 5) / 2;
});

// When source changes: 1 memo recomputes
```

**When to keep separate:**

```javascript
// ✅ Keep separate if intermediate values are used
const doubleValue = createMemo(() => source() * 2);
const tripleValue = createMemo(() => source() * 3);

createEffect(() => {
  console.log('Double:', doubleValue());  // Uses first memo
  console.log('Triple:', tripleValue());  // Uses second memo
});
```

### 7. Efficient Array Operations

**Problem:** Creating new arrays unnecessarily

```javascript
// ❌ Creates new array on every update
const [items, setItems] = createSignal([]);

setItems([...items(), newItem]);  // Spreads entire array
setItems(items().map(transform)); // Maps entire array
```

**Solution:** Use immutable update patterns strategically

```javascript
// ✅ For small arrays, spreading is fine
if (items().length < 100) {
  setItems([...items(), newItem]);
}

// ✅ For large arrays, use produce pattern
const produce = (fn) => {
  setItems(items => {
    const copy = items.slice();
    fn(copy);
    return copy;
  });
};

produce(draft => {
  draft.push(newItem);
});

// ✅ Or use solid's store
const [state, setState] = createStore({ items: [] });
setState('items', items => [...items, newItem]);
```

### 8. Debouncing and Throttling

**Problem:** Too many updates in short time

```javascript
// ❌ Updates on every keystroke
const [search, setSearch] = createSignal('');

input.addEventListener('input', (e) => {
  setSearch(e.target.value);  // Triggers effect on every keystroke
});

createEffect(() => {
  fetchResults(search());  // API call on every keystroke!
});
```

**Solution:** Debounce updates

```javascript
// ✅ Wait for user to stop typing
function createDebounced<T>(source: () => T, delay: number) {
  const [debounced, setDebounced] = createSignal(source());
  
  createEffect(() => {
    const value = source();
    const timeout = setTimeout(() => {
      setDebounced(value);
    }, delay);
    
    onCleanup(() => clearTimeout(timeout));
  });
  
  return debounced;
}

const [search, setSearch] = createSignal('');
const debouncedSearch = createDebounced(search, 300);

createEffect(() => {
  fetchResults(debouncedSearch());  // Only calls after 300ms of no typing
});
```

**Throttling for continuous updates:**

```javascript
function createThrottled<T>(source: () => T, delay: number) {
  const [throttled, setThrottled] = createSignal(source());
  let lastUpdate = 0;
  
  createEffect(() => {
    const value = source();
    const now = Date.now();
    
    if (now - lastUpdate >= delay) {
      setThrottled(value);
      lastUpdate = now;
    }
  });
  
  return throttled;
}

// Usage for scroll position
const [scrollY, setScrollY] = createSignal(0);
const throttledScroll = createThrottled(scrollY, 100);

window.addEventListener('scroll', () => {
  setScrollY(window.scrollY);  // Updates frequently
});

createEffect(() => {
  updateHeader(throttledScroll());  // Updates max every 100ms
});
```

## Performance Patterns

### Pattern 1: Windowing Large Lists

```javascript
function createVirtualList(items, { itemHeight, containerHeight }) {
  const [scrollTop, setScrollTop] = createSignal(0);
  
  const visibleRange = createMemo(() => {
    const start = Math.floor(scrollTop() / itemHeight);
    const count = Math.ceil(containerHeight / itemHeight);
    return { start, end: start + count };
  });
  
  const visibleItems = createMemo(() => {
    const range = visibleRange();
    return items().slice(range.start, range.end);
  });
  
  return { visibleItems, scrollTop: setScrollTop };
}

// Only renders ~20 items instead of 10,000
```

### Pattern 2: Progressive Enhancement

```javascript
function createProgressiveData(source) {
  const [lowRes, setLowRes] = createSignal(null);
  const [highRes, setHighRes] = createSignal(null);
  
  createEffect(() => {
    const id = source();
    
    // Show low-res immediately
    setLowRes(getLowResData(id));
    
    // Load high-res in background
    getHighResData(id).then(setHighRes);
  });
  
  return () => highRes() || lowRes();
}

// Shows something quickly, enhances later
```

### Pattern 3: Computation Splitting

```javascript
// ❌ Single heavy computation blocks
createEffect(() => {
  const items = items();
  
  // 100ms of processing
  const processed = items.map(heavyTransform);
  render(processed);
});

// ✅ Split into chunks
createEffect(() => {
  const items = items();
  const chunkSize = 100;
  let index = 0;
  
  function processChunk() {
    const chunk = items.slice(index, index + chunkSize);
    chunk.forEach(item => processItem(item));
    
    index += chunkSize;
    
    if (index < items.length) {
      requestIdleCallback(processChunk);
    }
  }
  
  processChunk();
});
```

### Pattern 4: Suspense Boundaries

```javascript
// Split expensive operations into suspense boundaries
function App() {
  return (
    <div>
      <Header />
      
      <Suspense fallback={<Spinner />}>
        <ExpensiveComponent />
      </Suspense>
      
      <Footer />
    </div>
  );
}

// Header and Footer render immediately
// ExpensiveComponent loads async
```

## Benchmarking

### Micro-Benchmarks

```javascript
function benchmark(name, fn, iterations = 1000) {
  // Warmup
  for (let i = 0; i < 10; i++) fn();
  
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const end = performance.now();
  
  const total = end - start;
  const avg = total / iterations;
  
  console.log(`${name}:`);
  console.log(`  Total: ${total.toFixed(2)}ms`);
  console.log(`  Average: ${avg.toFixed(4)}ms`);
  console.log(`  Ops/sec: ${(1000 / avg).toFixed(0)}`);
}

// Usage
benchmark('Signal updates', () => {
  const [count, setCount] = createSignal(0);
  setCount(1);
});

benchmark('Batched updates', () => {
  const [a, setA] = createSignal(0);
  const [b, setB] = createSignal(0);
  
  batch(() => {
    setA(1);
    setB(2);
  });
});
```

### Real-World Benchmarking

```javascript
class PerformanceSuite {
  constructor() {
    this.tests = [];
  }
  
  add(name, setup, fn) {
    this.tests.push({ name, setup, fn });
  }
  
  async run() {
    for (const test of this.tests) {
      const context = test.setup();
      
      // Measure
      const start = performance.now();
      await test.fn(context);
      const duration = performance.now() - start;
      
      console.log(`${test.name}: ${duration.toFixed(2)}ms`);
      
      // Cleanup
      if (context.dispose) context.dispose();
    }
  }
}

// Usage
const suite = new PerformanceSuite();

suite.add('1000 signals', 
  () => ({ dispose: null }),
  () => {
    const dispose = createRoot((dispose) => {
      for (let i = 0; i < 1000; i++) {
        createSignal(i);
      }
      return dispose;
    });
    dispose();
  }
);

suite.add('1000 effects',
  () => ({ dispose: null }),
  () => {
    const dispose = createRoot((dispose) => {
      const [count, setCount] = createSignal(0);
      for (let i = 0; i < 1000; i++) {
        createEffect(() => count());
      }
      setCount(1);
      return dispose;
    });
    dispose();
  }
);

suite.run();
```

## Performance Checklist

### Before Optimizing

- [ ] Profile and identify actual bottlenecks
- [ ] Measure baseline performance
- [ ] Set performance targets
- [ ] Understand the critical path

### Optimization Priorities

1. **Eliminate unnecessary work**
   - [ ] Remove unused computations
   - [ ] Untrack when dependencies not needed
   - [ ] Use memos for expensive operations

2. **Batch related updates**
   - [ ] Group state changes
   - [ ] Use batch() for multiple updates
   - [ ] Debounce/throttle high-frequency updates

3. **Optimize rendering**
   - [ ] Use selectors for list selections
   - [ ] Implement virtual scrolling for large lists
   - [ ] Split heavy components with Suspense

4. **Reduce memory pressure**
   - [ ] Clean up resources
   - [ ] Use object pooling
   - [ ] Implement LRU caches

### After Optimizing

- [ ] Measure improvement
- [ ] Verify correctness
- [ ] Document optimizations
- [ ] Add performance tests

## Summary

**Key optimization strategies:**

1. **Batch** multiple updates together
2. **Untrack** unnecessary dependencies
3. **Memoize** expensive computations
4. **Use selectors** for O(2) list updates
5. **Debounce/throttle** high-frequency updates
6. **Profile** before and after optimizing

**Remember:** Premature optimization is the root of all evil. Always measure!

## Next Steps

- **Exercise 1:** Build a performance profiler
- **Exercise 2:** Optimize a slow application
- **Lesson 3:** Development tools and debugging
