# Lesson 4: Concurrent Patterns

## Introduction

Transitions enable concurrent rendering, but concurrent updates introduce challenges: race conditions, stale data, conflicting mutations, and more. This lesson explores advanced patterns for handling concurrent scenarios safely and efficiently.

## Understanding Concurrency in Solid

### What is Concurrency?

**Concurrency** means multiple operations in progress at the same time, potentially interleaving their execution.

```javascript
// Concurrent transitions
startTransition(() => filterByName('Alice'));    // Takes 100ms
startTransition(() => filterByAge(25));          // Takes 50ms

// Age filter finishes first, then name filter
// Final result: name filter wins (executed last)
```

### Different from Parallelism

- **Parallel**: Multiple CPU cores executing simultaneously
- **Concurrent**: Multiple operations interleaved on one/few cores

```
Parallel:     Task A: |====|
              Task B:      |====|

Concurrent:   Task A: |==|  |==|
              Task B:    |==|  |==|
              (interleaved on same thread)
```

## Race Conditions

### The Problem

```javascript
const [user, setUser] = createSignal(null);

async function loadUser(id) {
  const data = await fetchUser(id);  // Takes variable time
  setUser(data);
}

// User clicks rapidly
loadUser(1);  // Starts... (takes 200ms)
loadUser(2);  // Starts... (takes 50ms)

// Result: user(2) set first, then user(1)
// UI shows user 1, but button was for user 2!
```

### Solution 1: Cancellation

```javascript
const [user, setUser] = createSignal(null);
let currentRequest = null;

async function loadUser(id) {
  // Cancel previous
  if (currentRequest) {
    currentRequest.abort();
  }
  
  currentRequest = new AbortController();
  
  try {
    const data = await fetchUser(id, {
      signal: currentRequest.signal
    });
    setUser(data);
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error(err);
    }
  } finally {
    currentRequest = null;
  }
}
```

### Solution 2: Request Tracking

```javascript
const [user, setUser] = createSignal(null);
let requestId = 0;

async function loadUser(id) {
  const thisRequest = ++requestId;
  
  const data = await fetchUser(id);
  
  // Only update if still the latest request
  if (thisRequest === requestId) {
    setUser(data);
  }
}
```

### Solution 3: With Transitions

```javascript
const [user, setUser] = createSignal(null);
const [isPending, start] = useTransition();
let requestId = 0;

async function loadUser(id) {
  const thisRequest = ++requestId;
  
  start(async () => {
    const data = await fetchUser(id);
    
    if (thisRequest === requestId) {
      setUser(data);
    }
  });
}

// Benefits:
// - Old user shown while loading
// - isPending() shows loading state
// - Race condition handled
```

## Stale-While-Revalidate Pattern

Show stale data immediately while fetching fresh data in background.

```javascript
const [data, setData] = createSignal(null);
const [isFresh, setIsFresh] = createSignal(false);
const [isPending, start] = useTransition();

async function loadData(id) {
  // Check cache
  const cached = cache.get(id);
  
  if (cached) {
    // Show stale data immediately
    setData(cached);
    setIsFresh(false);
  }
  
  // Fetch fresh data in transition
  start(async () => {
    const fresh = await fetchData(id);
    setData(fresh);
    setIsFresh(true);
    cache.set(id, fresh);
  });
}

return (
  <div>
    <div classList={{ stale: !isFresh() }}>
      {data()?.title}
    </div>
    {isPending() && <span>Updating...</span>}
  </div>
);
```

## Optimistic Updates

Update UI immediately, revert if operation fails.

### Basic Pattern

```javascript
const [items, setItems] = createSignal([]);
const [isPending, start] = useTransition();

async function addItem(text) {
  // Generate temporary ID
  const tempId = `temp-${Date.now()}`;
  
  // Optimistic: add immediately
  setItems(items => [...items, {
    id: tempId,
    text,
    optimistic: true
  }]);
  
  // Actual: save in transition
  start(async () => {
    try {
      const saved = await saveItem(text);
      
      // Replace temp with real
      setItems(items =>
        items.map(item =>
          item.id === tempId ? saved : item
        )
      );
    } catch (err) {
      // Revert on failure
      setItems(items =>
        items.filter(item => item.id !== tempId)
      );
      
      showError('Failed to save item');
    }
  });
}
```

### Advanced Pattern with Queue

```javascript
class OptimisticQueue {
  constructor() {
    this.pending = new Map();
    this.nextId = 0;
  }
  
  add(operation, optimisticValue) {
    const id = this.nextId++;
    
    this.pending.set(id, {
      operation,
      optimistic: optimisticValue
    });
    
    operation()
      .then(realValue => {
        // Replace optimistic with real
        this.resolve(id, realValue);
      })
      .catch(err => {
        // Remove on error
        this.reject(id, err);
      });
    
    return id;
  }
  
  resolve(id, realValue) {
    this.pending.delete(id);
    // Update UI with real value
  }
  
  reject(id, err) {
    this.pending.delete(id);
    // Revert UI
  }
}

const queue = new OptimisticQueue();

function addItem(text) {
  const tempItem = { id: `temp-${Date.now()}`, text };
  
  setItems(items => [...items, tempItem]);
  
  queue.add(
    () => saveItem(text),
    tempItem
  );
}
```

## Debouncing with Transitions

Delay expensive operations while keeping UI responsive.

```javascript
const [query, setQuery] = createSignal('');
const [results, setResults] = createSignal([]);
const [isPending, start] = useTransition();

let timeoutId;

function handleSearch(e) {
  const value = e.target.value;
  
  // Update input immediately (urgent)
  setQuery(value);
  
  // Debounce the search (non-urgent)
  clearTimeout(timeoutId);
  timeoutId = setTimeout(() => {
    start(() => {
      const filtered = expensiveSearch(value);
      setResults(filtered);
    });
  }, 300);
}

onCleanup(() => clearTimeout(timeoutId));
```

## Throttling with Transitions

Limit update frequency while maintaining responsiveness.

```javascript
const [position, setPosition] = createSignal({ x: 0, y: 0 });
const [isPending, start] = useTransition();

let lastUpdate = 0;
const THROTTLE_MS = 100;

function handleMouseMove(e) {
  const now = Date.now();
  
  // Always update raw position (for cursor)
  setPosition({ x: e.clientX, y: e.clientY });
  
  // Throttle expensive calculation
  if (now - lastUpdate > THROTTLE_MS) {
    lastUpdate = now;
    
    start(() => {
      const nearby = findNearbyElements(e.clientX, e.clientY);
      setNearbyElements(nearby);
    });
  }
}
```

## Priority Scheduling

Handle different priority levels for updates.

```javascript
const PRIORITY = {
  IMMEDIATE: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3
};

class PriorityScheduler {
  constructor() {
    this.queues = {
      [PRIORITY.IMMEDIATE]: [],
      [PRIORITY.HIGH]: [],
      [PRIORITY.NORMAL]: [],
      [PRIORITY.LOW]: []
    };
  }
  
  schedule(fn, priority = PRIORITY.NORMAL) {
    if (priority === PRIORITY.IMMEDIATE) {
      // Execute immediately
      fn();
    } else {
      // Queue by priority
      this.queues[priority].push(fn);
      this.flush();
    }
  }
  
  flush() {
    const priorities = [
      PRIORITY.HIGH,
      PRIORITY.NORMAL,
      PRIORITY.LOW
    ];
    
    for (const priority of priorities) {
      const queue = this.queues[priority];
      
      if (queue.length > 0) {
        const fn = queue.shift();
        
        startTransition(() => {
          fn();
          
          // Schedule next
          if (queue.length > 0) {
            setTimeout(() => this.flush(), 0);
          }
        });
        
        break;  // One per cycle
      }
    }
  }
}

// Usage
const scheduler = new PriorityScheduler();

// Immediate
setInputValue(e.target.value);

// High priority
scheduler.schedule(() => {
  setSearchResults(filteredResults);
}, PRIORITY.HIGH);

// Low priority
scheduler.schedule(() => {
  updateAnalytics();
}, PRIORITY.LOW);
```

## Conflict Resolution

Handle conflicting concurrent updates.

### Last-Write-Wins

```javascript
let version = 0;

function update(value) {
  const thisVersion = ++version;
  
  startTransition(async () => {
    const result = await processUpdate(value);
    
    // Only apply if still latest
    if (thisVersion === version) {
      setState(result);
    }
  });
}
```

### Merge Strategy

```javascript
function mergeUpdate(newValue) {
  startTransition(() => {
    setState(current => {
      // Merge instead of replace
      return {
        ...current,
        ...newValue,
        updatedAt: Date.now()
      };
    });
  });
}
```

### Operational Transformation

```javascript
class OTDocument {
  constructor() {
    this.text = '';
    this.version = 0;
    this.pending = [];
  }
  
  insert(pos, char, version) {
    if (version < this.version) {
      // Transform operation
      pos = this.transform(pos, version);
    }
    
    this.text = 
      this.text.slice(0, pos) +
      char +
      this.text.slice(pos);
    
    this.version++;
  }
  
  transform(pos, fromVersion) {
    // Adjust position based on operations
    // since fromVersion
    for (const op of this.pending) {
      if (op.version > fromVersion && op.pos <= pos) {
        pos += op.delta;
      }
    }
    return pos;
  }
}
```

## Error Boundaries with Transitions

Catch errors during transitions without crashing UI.

```javascript
function ErrorBoundary(props) {
  const [error, setError] = createSignal(null);
  
  catchError(
    () => props.children,
    err => {
      console.error('Caught error:', err);
      setError(err);
    }
  );
  
  return (
    <Show
      when={!error()}
      fallback={<ErrorView error={error()} />}
    >
      {props.children}
    </Show>
  );
}

// Usage
<ErrorBoundary>
  <DataView />
</ErrorBoundary>

// In DataView
function loadData() {
  startTransition(async () => {
    // Error thrown here caught by boundary
    const data = await fetch('/api').then(r => r.json());
    setData(data);
  });
}
```

## Loading States with Suspense

Integrate transitions with Suspense boundaries.

```javascript
function DataList() {
  const [filter, setFilter] = createSignal('');
  const [isPending, start] = useTransition();
  
  // Resource suspends on load
  const [data] = createResource(filter, fetchData);
  
  function handleFilter(value) {
    start(() => {
      setFilter(value);  // Triggers resource refetch
    });
  }
  
  return (
    <div>
      <input onInput={e => handleFilter(e.target.value)} />
      
      <Suspense fallback={<Loading />}>
        <Show when={!isPending()} fallback={<Updating />}>
          <For each={data()}>
            {item => <Item data={item} />}
          </For>
        </Show>
      </Suspense>
    </div>
  );
}
```

## Complete Example: Concurrent Search

```javascript
function ConcurrentSearch() {
  const [query, setQuery] = createSignal('');
  const [results, setResults] = createSignal([]);
  const [isPending, start] = useTransition();
  
  let requestId = 0;
  let timeoutId;
  
  function handleSearch(e) {
    const value = e.target.value;
    const thisRequest = ++requestId;
    
    // Update input immediately
    setQuery(value);
    
    // Debounce search
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      // Search in transition
      start(async () => {
        try {
          const data = await searchAPI(value);
          
          // Check if still latest
          if (thisRequest === requestId) {
            setResults(data);
          }
        } catch (err) {
          console.error('Search failed:', err);
        }
      });
    }, 300);
  }
  
  onCleanup(() => clearTimeout(timeoutId));
  
  return (
    <div class="search">
      <input
        type="text"
        value={query()}
        onInput={handleSearch}
        placeholder="Search..."
      />
      
      <div class="results-container">
        {isPending() && (
          <div class="loading-overlay">
            Searching...
          </div>
        )}
        
        <div classList={{ dimmed: isPending() }}>
          <div class="count">
            {results().length} results
          </div>
          
          <For each={results()}>
            {result => (
              <div class="result">
                {result.title}
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
```

## Testing Concurrent Scenarios

```javascript
import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'solid-js';
import { useTransition } from './transition';

describe('Concurrent transitions', () => {
  it('should handle race conditions', async () => {
    await createRoot(async dispose => {
      const [value, setValue] = createSignal(0);
      const [, start] = useTransition();
      
      let requestId = 0;
      
      async function update(newValue) {
        const thisRequest = ++requestId;
        
        await start(async () => {
          await delay(Math.random() * 100);
          
          if (thisRequest === requestId) {
            setValue(newValue);
          }
        });
      }
      
      // Start multiple updates
      const promises = [
        update(1),
        update(2),
        update(3)
      ];
      
      await Promise.all(promises);
      
      // Should have latest value
      expect(value()).toBe(3);
      
      dispose();
    });
  });
  
  it('should handle optimistic updates', async () => {
    await createRoot(async dispose => {
      const [items, setItems] = createSignal([]);
      const [, start] = useTransition();
      
      async function addItem(text) {
        const tempId = `temp-${Date.now()}`;
        
        // Optimistic
        setItems(i => [...i, { id: tempId, text }]);
        
        // Actual
        await start(async () => {
          const saved = await saveItem(text);
          setItems(i =>
            i.map(item =>
              item.id === tempId ? saved : item
            )
          );
        });
      }
      
      await addItem('Test');
      
      expect(items().length).toBe(1);
      expect(items()[0].id).not.toMatch(/^temp-/);
      
      dispose();
    });
  });
});

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

## Key Insights

1. **Race conditions are common**
   - Track request IDs
   - Cancel outdated requests
   - Always validate before updating

2. **Optimistic updates improve UX**
   - Show immediate feedback
   - Handle rollback gracefully
   - Mark optimistic items visually

3. **Debounce expensive operations**
   - Keep input responsive
   - Reduce unnecessary work
   - Use transitions for delays

4. **Stale-while-revalidate is powerful**
   - Instant perceived performance
   - Fresh data in background
   - Best of both worlds

5. **Error handling is critical**
   - Always catch errors
   - Show user-friendly messages
   - Provide retry mechanisms

## Best Practices

1. **Always handle race conditions**
2. **Use abort controllers for cancellation**
3. **Track request IDs for validation**
4. **Show loading states clearly**
5. **Test concurrent scenarios thoroughly**
6. **Provide fallbacks for errors**
7. **Document concurrency assumptions**

## Exercise Preview

You'll build:
1. Race condition handling system
2. Optimistic update manager
3. Stale-while-revalidate pattern
4. Priority scheduler

## Summary

- Concurrency introduces race conditions
- Use cancellation or request tracking
- Optimistic updates improve UX
- Stale-while-revalidate combines instant + fresh
- Debounce reduces unnecessary work
- Error boundaries catch transition errors
- Always test concurrent scenarios

## Next Steps

Review exercises and build a complete concurrent application with all these patterns integrated.

## References

- Solid.js source: `packages/solid/src/reactive/signal.ts`
- Concurrent rendering patterns
- React's concurrent mode (similar concepts)
