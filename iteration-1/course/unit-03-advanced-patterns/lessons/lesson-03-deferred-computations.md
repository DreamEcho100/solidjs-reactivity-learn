# Lesson 3: Deferred Computations and Performance Optimization

## Table of Contents

1. [Understanding Eager vs Lazy Execution](#understanding-eager-vs-lazy-execution)
2. [createDeferred Implementation](#createdeferred-implementation)
3. [requestIdleCallback Integration](#requestidlecallback-integration)
4. [Batching Updates](#batching-updates)
5. [Debouncing and Throttling](#debouncing-and-throttling)
6. [Priority Scheduling](#priority-scheduling)
7. [Real-World Performance Patterns](#real-world-performance-patterns)

---

## Understanding Eager vs Lazy Execution

### Eager Execution (Default)

```javascript
const [input, setInput] = createSignal('');

const processed = createMemo(() => {
  console.log('Processing...');
  return expensiveProcess(input());
});

// Runs immediately when input changes
setInput('hello'); // "Processing..." logged instantly
```

### Problem with Eager Execution

```javascript
const [search, setSearch] = createSignal('');

const results = createMemo(() => {
  // Expensive API call or computation
  return fetchResults(search());
});

// User types fast: "r" -> "re" -> "rea" -> "reac" -> "react"
// Results: 5 API calls, but user only wants the last one!
```

### Lazy/Deferred Execution

```javascript
const [search, setSearch] = createSignal('');

const deferredSearch = createDeferred(search, { timeoutMs: 500 });

const results = createMemo(() => {
  // Only runs after 500ms of no changes
  return fetchResults(deferredSearch());
});

// User types "react" quickly
// Results: 1 API call (after typing stops)
```

---

## createDeferred Implementation

### Basic Version

```javascript
function createDeferred(source, options = {}) {
  const timeoutMs = options.timeoutMs || 0;
  let timeoutId;
  
  const [deferred, setDeferred] = createSignal(source());
  
  createEffect(() => {
    const value = source();
    
    clearTimeout(timeoutId);
    
    timeoutId = setTimeout(() => {
      setDeferred(value);
    }, timeoutMs);
  });
  
  onCleanup(() => clearTimeout(timeoutId));
  
  return deferred;
}
```

### Usage

```javascript
const [fast, setFast] = createSignal(0);
const slow = createDeferred(fast, { timeoutMs: 1000 });

createEffect(() => {
  console.log('Fast:', fast(), 'Slow:', slow());
});

setFast(1); // Fast: 1, Slow: 0
setFast(2); // Fast: 2, Slow: 0
setFast(3); // Fast: 3, Slow: 0
// ... wait 1 second ...
// Fast: 3, Slow: 3
```

### Advanced Implementation with requestIdleCallback

```javascript
function createDeferred(source, options = {}) {
  const timeoutMs = options.timeoutMs;
  const [deferred, setDeferred] = createSignal(
    source(),
    { equals: options.equals }
  );
  
  if (timeoutMs !== undefined) {
    // Use timeout
    let timeoutId;
    
    createEffect(() => {
      const value = source();
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setDeferred(value), timeoutMs);
    });
    
    onCleanup(() => clearTimeout(timeoutId));
  } else {
    // Use idle callback
    let idleId;
    
    createEffect(() => {
      const value = source();
      
      if (idleId !== undefined) {
        cancelIdleCallback(idleId);
      }
      
      idleId = requestIdleCallback(() => {
        setDeferred(value);
        idleId = undefined;
      });
    });
    
    onCleanup(() => {
      if (idleId !== undefined) {
        cancelIdleCallback(idleId);
      }
    });
  }
  
  return deferred;
}
```

### With Priority Hint

```javascript
function createDeferred(source, options = {}) {
  const [deferred, setDeferred] = createSignal(source());
  
  createEffect(() => {
    const value = source();
    
    const idleOptions = {
      timeout: options.timeout || 1000
    };
    
    const idleId = requestIdleCallback((deadline) => {
      // Update if we have time, or if we've hit timeout
      if (deadline.timeRemaining() > 0 || deadline.didTimeout) {
        setDeferred(value);
      } else {
        // Reschedule
        requestIdleCallback(() => setDeferred(value), idleOptions);
      }
    }, idleOptions);
    
    onCleanup(() => cancelIdleCallback(idleId));
  });
  
  return deferred;
}
```

---

## requestIdleCallback Integration

### Browser Idle Time API

```javascript
// Wait for browser idle time
requestIdleCallback((deadline) => {
  console.log('Time remaining:', deadline.timeRemaining());
  console.log('Did timeout:', deadline.didTimeout);
  
  // Do non-critical work
  while (deadline.timeRemaining() > 0 && workQueue.length) {
    const work = workQueue.shift();
    work();
  }
});
```

### Integration with Solid

```javascript
function createIdleComputation(fn) {
  const [result, setResult] = createSignal();
  let scheduled = false;
  
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    
    requestIdleCallback((deadline) => {
      scheduled = false;
      
      if (deadline.timeRemaining() > 5) {
        const value = fn();
        setResult(value);
      } else {
        // Reschedule if not enough time
        schedule();
      }
    });
  };
  
  createEffect(() => {
    // Track dependencies
    schedule();
  });
  
  return result;
}

// Usage
const [data, setData] = createSignal(bigData);

const processed = createIdleComputation(() => {
  return expensiveProcess(data());
});
```

### Scheduling Tasks in Chunks

```javascript
function createChunkedComputation(items, processFn, chunkSize = 100) {
  const [progress, setProgress] = createSignal(0);
  const [result, setResult] = createSignal([]);
  
  createEffect(() => {
    const itemList = items();
    const chunks = [];
    
    // Split into chunks
    for (let i = 0; i < itemList.length; i += chunkSize) {
      chunks.push(itemList.slice(i, i + chunkSize));
    }
    
    let processed = [];
    let currentChunk = 0;
    
    function processChunk() {
      if (currentChunk >= chunks.length) {
        setResult(processed);
        setProgress(100);
        return;
      }
      
      requestIdleCallback((deadline) => {
        // Process while we have time
        while (currentChunk < chunks.length && 
               deadline.timeRemaining() > 10) {
          const chunk = chunks[currentChunk];
          const chunkResult = chunk.map(processFn);
          processed.push(...chunkResult);
          currentChunk++;
          setProgress((currentChunk / chunks.length) * 100);
        }
        
        // Schedule next chunk
        if (currentChunk < chunks.length) {
          processChunk();
        } else {
          setResult(processed);
        }
      });
    }
    
    processChunk();
  });
  
  return { result, progress };
}

// Usage
const [items, setItems] = createSignal(Array(10000).fill(0));
const { result, progress } = createChunkedComputation(
  items,
  (item, index) => ({ value: item * 2, index }),
  500
);
```

---

## Batching Updates

### The Problem

```javascript
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);
const [c, setC] = createSignal(3);

const sum = createMemo(() => {
  console.log('Computing sum');
  return a() + b() + c();
});

// Multiple updates
setA(10); // Computes sum
setB(20); // Computes sum
setC(30); // Computes sum
// Sum computed 3 times!
```

### Solution: batch()

```javascript
import { batch } from 'solid-js';

batch(() => {
  setA(10);
  setB(20);
  setC(30);
});
// Sum computed once!
```

### Implementation

```javascript
let batchDepth = 0;
const batchedUpdates = new Set();

function batch(fn) {
  batchDepth++;
  
  try {
    return fn();
  } finally {
    batchDepth--;
    
    if (batchDepth === 0) {
      // Flush all updates
      const updates = Array.from(batchedUpdates);
      batchedUpdates.clear();
      
      for (const update of updates) {
        update();
      }
    }
  }
}

function queueUpdate(fn) {
  if (batchDepth > 0) {
    batchedUpdates.add(fn);
  } else {
    fn();
  }
}
```

### Nested Batching

```javascript
batch(() => {
  setA(1);
  
  batch(() => {
    setB(2);
    setC(3);
  });
  
  setD(4);
});

// Behavior:
// batchDepth: 0 → 1 → 2 → 1 → 0
// Updates flushed only when depth reaches 0
```

### Real-World Example: Form Updates

```javascript
function updateForm(updates) {
  batch(() => {
    Object.entries(updates).forEach(([key, value]) => {
      formFields[key].set(value);
    });
  });
}

// Updates multiple fields efficiently
updateForm({
  name: 'John',
  email: 'john@example.com',
  age: 30
});
// Form validation runs once
```

---

## Debouncing and Throttling

### Debounce: Wait for Pause

```javascript
function createDebounced(source, delay) {
  const [debounced, setDebounced] = createSignal(source());
  let timeoutId;
  
  createEffect(() => {
    const value = source();
    
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      setDebounced(value);
    }, delay);
  });
  
  onCleanup(() => clearTimeout(timeoutId));
  
  return debounced;
}

// Usage: Search input
const [search, setSearch] = createSignal('');
const debouncedSearch = createDebounced(search, 300);

createEffect(() => {
  // Only runs after user stops typing for 300ms
  fetchResults(debouncedSearch());
});
```

### Throttle: Limit Rate

```javascript
function createThrottled(source, delay) {
  const [throttled, setThrottled] = createSignal(source());
  let lastRun = 0;
  let timeoutId;
  
  createEffect(() => {
    const value = source();
    const now = Date.now();
    
    if (now - lastRun >= delay) {
      // Run immediately
      setThrottled(value);
      lastRun = now;
    } else {
      // Schedule for later
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setThrottled(value);
        lastRun = Date.now();
      }, delay - (now - lastRun));
    }
  });
  
  onCleanup(() => clearTimeout(timeoutId));
  
  return throttled;
}

// Usage: Scroll position
const [scrollY, setScrollY] = createSignal(0);
const throttledScrollY = createThrottled(scrollY, 100);

window.addEventListener('scroll', () => {
  setScrollY(window.scrollY);
});

createEffect(() => {
  // Updates max once per 100ms
  updateScrollIndicator(throttledScrollY());
});
```

### Leading vs Trailing

```javascript
function createDebounced(source, delay, options = {}) {
  const [debounced, setDebounced] = createSignal(source());
  const leading = options.leading ?? false;
  const trailing = options.trailing ?? true;
  
  let timeoutId;
  let lastCallTime = 0;
  
  createEffect(() => {
    const value = source();
    const now = Date.now();
    
    const shouldCallLeading = leading && (now - lastCallTime > delay);
    
    if (shouldCallLeading) {
      setDebounced(value);
      lastCallTime = now;
    }
    
    if (trailing) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setDebounced(value);
        lastCallTime = Date.now();
      }, delay);
    }
  });
  
  onCleanup(() => clearTimeout(timeoutId));
  
  return debounced;
}
```

---

## Priority Scheduling

### Priority Levels

```javascript
const Priority = {
  IMMEDIATE: 0,    // User input, animations
  HIGH: 1,         // Data fetching, critical updates
  NORMAL: 2,       // Regular updates
  LOW: 3,          // Analytics, logging
  IDLE: 4          // Cleanup, preloading
};
```

### Priority Queue Implementation

```javascript
class PriorityQueue {
  constructor() {
    this.queues = Array(5).fill(null).map(() => []);
  }
  
  enqueue(task, priority = Priority.NORMAL) {
    this.queues[priority].push(task);
  }
  
  dequeue() {
    for (const queue of this.queues) {
      if (queue.length > 0) {
        return queue.shift();
      }
    }
    return null;
  }
  
  isEmpty() {
    return this.queues.every(q => q.length === 0);
  }
}
```

### Scheduler with Priorities

```javascript
const taskQueue = new PriorityQueue();
let isProcessing = false;

function scheduleTask(task, priority) {
  taskQueue.enqueue(task, priority);
  
  if (!isProcessing) {
    processQueue();
  }
}

function processQueue() {
  if (taskQueue.isEmpty()) {
    isProcessing = false;
    return;
  }
  
  isProcessing = true;
  
  const task = taskQueue.dequeue();
  const deadline = performance.now() + 5; // 5ms timeslice
  
  // Process tasks until deadline
  while (task && performance.now() < deadline) {
    task();
    task = taskQueue.dequeue();
  }
  
  if (!taskQueue.isEmpty()) {
    // Schedule continuation
    requestAnimationFrame(processQueue);
  } else {
    isProcessing = false;
  }
}
```

### Reactive Priority Scheduling

```javascript
function createPriorityEffect(fn, priority = Priority.NORMAL) {
  const [shouldRun, setShouldRun] = createSignal(false);
  
  // Track dependencies
  createEffect(() => {
    fn(); // Capture dependencies
    setShouldRun(true);
  });
  
  // Schedule execution
  createEffect(() => {
    if (shouldRun()) {
      scheduleTask(() => {
        untrack(fn);
        setShouldRun(false);
      }, priority);
    }
  });
}

// Usage
createPriorityEffect(() => {
  console.log('Low priority:', data());
}, Priority.LOW);

createPriorityEffect(() => {
  updateUI(state());
}, Priority.IMMEDIATE);
```

---

## Real-World Performance Patterns

### Pattern 1: Virtualized List with Deferred Updates

```javascript
function createVirtualList(items, viewportHeight) {
  const [scrollTop, setScrollTop] = createSignal(0);
  const deferredScroll = createDeferred(scrollTop, { timeoutMs: 50 });
  
  const visibleItems = createMemo(() => {
    const scroll = deferredScroll();
    const startIndex = Math.floor(scroll / itemHeight);
    const endIndex = Math.ceil((scroll + viewportHeight) / itemHeight);
    
    return items().slice(startIndex, endIndex + 1);
  });
  
  return {
    visibleItems,
    onScroll: (e) => setScrollTop(e.target.scrollTop)
  };
}
```

### Pattern 2: Smart Search with Batching

```javascript
function createSmartSearch(items, options = {}) {
  const [query, setQuery] = createSignal('');
  const [filters, setFilters] = createSignal({});
  
  // Debounce query
  const debouncedQuery = createDebounced(query, 300);
  
  // Batch filter updates
  const updateFilters = (updates) => {
    batch(() => {
      setFilters(prev => ({ ...prev, ...updates }));
    });
  };
  
  // Compute results with priority
  const results = createMemo(() => {
    const q = debouncedQuery().toLowerCase();
    const f = filters();
    
    return items()
      .filter(item => {
        // Quick query filter
        if (q && !item.name.toLowerCase().includes(q)) {
          return false;
        }
        
        // Apply additional filters
        return Object.entries(f).every(([key, value]) => {
          return item[key] === value;
        });
      });
  });
  
  return {
    query: setQuery,
    updateFilters,
    results
  };
}
```

### Pattern 3: Progressive Loading

```javascript
function createProgressiveLoader(fetchFn, chunkSize = 50) {
  const [data, setData] = createSignal([]);
  const [loading, setLoading] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(true);
  
  const loadMore = async () => {
    if (loading() || !hasMore()) return;
    
    setLoading(true);
    
    try {
      const offset = data().length;
      const newItems = await fetchFn(offset, chunkSize);
      
      batch(() => {
        setData(prev => [...prev, ...newItems]);
        setHasMore(newItems.length === chunkSize);
        setLoading(false);
      });
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };
  
  return { data, loading, hasMore, loadMore };
}
```

### Pattern 4: Lazy Component Loading

```javascript
function createLazyComponent(loader) {
  const [component, setComponent] = createSignal(null);
  const [error, setError] = createSignal(null);
  
  // Load during idle time
  requestIdleCallback(async () => {
    try {
      const mod = await loader();
      setComponent(() => mod.default);
    } catch (err) {
      setError(err);
    }
  });
  
  return () => {
    const Component = component();
    const err = error();
    
    if (err) throw err;
    if (!Component) return null;
    
    return <Component />;
  };
}

// Usage
const LazyDashboard = createLazyComponent(() => 
  import('./Dashboard')
);
```

### Pattern 5: Optimistic Updates

```javascript
function createOptimisticMutation(mutateFn) {
  const [data, setData] = createSignal(null);
  const [pending, setPending] = createSignal(false);
  
  const mutate = async (optimisticValue, actualFn) => {
    const previous = data();
    
    batch(() => {
      setData(optimisticValue);
      setPending(true);
    });
    
    try {
      const result = await actualFn();
      batch(() => {
        setData(result);
        setPending(false);
      });
      return result;
    } catch (error) {
      // Rollback on error
      batch(() => {
        setData(previous);
        setPending(false);
      });
      throw error;
    }
  };
  
  return { data, pending, mutate };
}

// Usage
const { data, pending, mutate } = createOptimisticMutation();

async function likePost(postId) {
  await mutate(
    { ...data(), likes: data().likes + 1 }, // Optimistic
    () => api.likePost(postId)              // Actual
  );
}
```

---

## Summary

### Key Takeaways

1. **Deferred Execution**
   - Use createDeferred for delayed updates
   - Integrate with requestIdleCallback
   - Balance responsiveness and performance

2. **Batching Updates**
   - Use batch() for multiple signal updates
   - Reduces redundant computations
   - Essential for form updates

3. **Debouncing vs Throttling**
   - Debounce: Wait for pause (search, input)
   - Throttle: Limit rate (scroll, resize)
   - Choose based on use case

4. **Priority Scheduling**
   - Prioritize user-facing updates
   - Defer non-critical work
   - Use requestIdleCallback for background tasks

5. **Performance Patterns**
   - Virtual lists with deferred scroll
   - Smart search with debouncing
   - Progressive loading
   - Lazy component loading
   - Optimistic updates

### What You've Learned

- ✅ Defer expensive computations
- ✅ Batch multiple updates efficiently
- ✅ Implement debouncing and throttling
- ✅ Schedule tasks with priorities
- ✅ Build high-performance reactive apps

### Next Steps

Complete Unit 3 exercises and move to Unit 4: Reactive Scheduling

---

## Further Reading

- **Next:** [Unit 3 Exercises](../exercises/)
- **Related:** [Unit 4: Reactive Scheduling](../../unit-04-scheduling/README.md)
- **Reference:** [requestIdleCallback MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback)
