# Concurrent Rendering Concepts

## What is Concurrent Rendering?

Concurrent rendering is a pattern where multiple updates can be "in flight" at the same time without blocking each other. The key insight is **separating what the user sees from what is being computed**.

## Core Principles

### 1. Non-Blocking Updates

**Problem**: Long-running updates freeze the UI

```javascript
// Blocking
function handleInput(e) {
  const value = e.target.value;
  setQuery(value);              // Fast
  setResults(expensiveFilter(value));  // Slow - blocks everything!
}
// Result: Typing feels laggy
```

**Solution**: Transitions keep UI responsive

```javascript
// Non-blocking
function handleInput(e) {
  const value = e.target.value;
  setQuery(value);              // Updates immediately
  
  startTransition(() => {
    setResults(expensiveFilter(value));  // Deferred, doesn't block
  });
}
// Result: Typing feels instant
```

### 2. Double Buffering

Like video games render to an off-screen buffer:

```
Front Buffer (shown):  Frame N
Back Buffer (hidden):  Frame N+1 (being rendered)

When ready: Swap buffers
```

Solid uses the same pattern:

```javascript
signal.value = currentValue;   // What user sees (front buffer)
signal.tValue = nextValue;     // What's computing (back buffer)

// When ready: Commit
signal.value = signal.tValue;  // Swap!
```

### 3. Urgency Levels

Not all updates are equal:

```javascript
// URGENT - Must happen immediately
// - User input (typing, clicking)
// - Cursor position
// - Focus changes
setInputValue(e.target.value);

// NON-URGENT - Can be deferred
// - Search results
// - Filtered lists
// - Expensive computations
startTransition(() => {
  setSearchResults(filter(query));
});
```

## Concurrent vs Parallel

### Parallel (True Simultaneous)

```
CPU 1: ████████ Task A
CPU 2: ████████ Task B
       (same time, different cores)
```

### Concurrent (Interleaved)

```
CPU 1: ██ Task A  ██ Task A
       ██ Task B  ██ Task B
       (interleaved on same core)
```

**Key Difference**: Concurrent doesn't mean "faster", it means "more responsive".

## The Stale-While-Revalidate Pattern

Show stale (cached) data immediately while fetching fresh data in background.

### Phases

```
1. CACHE CHECK
   ├─ Found? → Show immediately (stale)
   └─ Not found? → Show loading

2. FETCH (in transition)
   └─ Request fresh data

3. REVALIDATE
   └─ Replace stale with fresh
```

### Implementation

```javascript
const cache = new Map();

async function loadData(id) {
  const cached = cache.get(id);
  
  if (cached) {
    setData(cached);        // Instant!
    setIsFresh(false);      // Mark as stale
  } else {
    setLoading(true);
  }
  
  // Fetch fresh (non-blocking)
  startTransition(async () => {
    const fresh = await fetch(`/api/${id}`);
    setData(fresh);
    setIsFresh(true);
    cache.set(id, fresh);
    setLoading(false);
  });
}
```

### Benefits

1. **Instant perceived performance** - User sees something immediately
2. **Eventually consistent** - Data becomes fresh
3. **Smooth experience** - No jarring loading states

### When to Use

✅ Dashboard data  
✅ User profiles  
✅ Feed updates  
✅ Cache-friendly content  

❌ Financial transactions  
❌ Critical real-time data  
❌ One-time operations  

## Optimistic UI

Update UI immediately, revert if operation fails.

### Pattern

```
1. OPTIMISTIC UPDATE
   └─ Show as if succeeded

2. ACTUAL OPERATION (async)
   ├─ Success? → Keep optimistic state
   └─ Failure? → Revert

3. USER EXPERIENCE
   └─ Instant feedback, smooth interaction
```

### Example: Adding a Todo

```javascript
function addTodo(text) {
  // Generate temporary ID
  const tempId = `temp-${Date.now()}`;
  
  // Optimistic: Add immediately
  setTodos(todos => [...todos, {
    id: tempId,
    text,
    pending: true  // Visual indicator
  }]);
  
  // Actual: Save to server
  startTransition(async () => {
    try {
      const saved = await saveTodo(text);
      
      // Success: Replace temp with real
      setTodos(todos =>
        todos.map(t =>
          t.id === tempId ? saved : t
        )
      );
    } catch (err) {
      // Failure: Remove optimistic todo
      setTodos(todos =>
        todos.filter(t => t.id !== tempId)
      );
      
      showError('Failed to add todo');
    }
  });
}
```

### Visual Feedback

```css
.todo.pending {
  opacity: 0.6;
  font-style: italic;
}

.todo.pending::after {
  content: " (saving...)";
  color: gray;
}
```

## Time Slicing

Break large work into small chunks, yielding to browser between chunks.

### Concept

```
Without time slicing:
|═══════════════════| (blocks for 500ms)

With time slicing:
|═══| yield |═══| yield |═══| (responsive)
```

### Implementation

```javascript
async function processLargeDataset(data) {
  const chunks = chunkArray(data, 100);
  
  for (const chunk of chunks) {
    // Process chunk
    processChunk(chunk);
    
    // Yield to browser
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

function handleUpdate() {
  startTransition(async () => {
    await processLargeDataset(largeData);
    setResults(processedData);
  });
}
```

### Browser Integration

```javascript
// Use requestIdleCallback for better yielding
function yieldToMain() {
  return new Promise(resolve => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(resolve);
    } else {
      setTimeout(resolve, 0);
    }
  });
}
```

## Cooperative Multitasking

Unlike preemptive (OS controls), cooperative means code yields voluntarily.

### JavaScript Event Loop

```
┌─→ Macrotasks (setTimeout, I/O)
│   ├─→ Execute one task
│   ├─→ Microtasks (Promises)
│   │   └─→ Execute ALL microtasks
│   ├─→ Render (if needed)
│   └─→ Back to macrotasks
└────────────────────────────────┘
```

### Transition Timing

```javascript
startTransition(() => {
  // Deferred to microtask
  setData(newData);
});

console.log('Sync code');

// Order:
// 1. Sync code
// 2. startTransition microtask
// 3. Browser render
```

## Priority Queues

Handle different update priorities.

### Priority Levels

```javascript
const PRIORITY = {
  SYNC: 0,        // Immediate (user input)
  HIGH: 1,        // Soon (click handlers)
  NORMAL: 2,      // Default (most updates)
  LOW: 3,         // Eventually (analytics)
  IDLE: 4         // When idle (prefetch)
};
```

### Scheduler Implementation

```javascript
class PriorityScheduler {
  constructor() {
    this.queues = {
      [PRIORITY.HIGH]: [],
      [PRIORITY.NORMAL]: [],
      [PRIORITY.LOW]: [],
      [PRIORITY.IDLE]: []
    };
    this.processing = false;
  }
  
  schedule(fn, priority = PRIORITY.NORMAL) {
    if (priority === PRIORITY.SYNC) {
      fn();  // Immediate
      return;
    }
    
    this.queues[priority].push(fn);
    
    if (!this.processing) {
      this.flush();
    }
  }
  
  flush() {
    this.processing = true;
    
    // Process in priority order
    const priorities = [
      PRIORITY.HIGH,
      PRIORITY.NORMAL,
      PRIORITY.LOW,
      PRIORITY.IDLE
    ];
    
    for (const p of priorities) {
      while (this.queues[p].length > 0) {
        const fn = this.queues[p].shift();
        
        startTransition(() => fn());
        
        // Yield after each task
        break;
      }
      
      if (this.hasWork()) {
        setTimeout(() => this.flush(), 0);
      } else {
        this.processing = false;
      }
    }
  }
  
  hasWork() {
    return Object.values(this.queues).some(q => q.length > 0);
  }
}
```

## Suspense and Transitions

Suspense boundaries work with transitions to show fallbacks only when necessary.

### Without Transition

```javascript
<Suspense fallback={<Loading />}>
  <DataView />
</Suspense>

// setFilter triggers refetch
// → Suspends immediately
// → Shows Loading
// → Jarring experience
```

### With Transition

```javascript
<Suspense fallback={<Loading />}>
  <DataView />
</Suspense>

startTransition(() => {
  setFilter(newFilter);
});

// → Keeps showing old data
// → No Loading fallback
// → Smooth experience
```

## Real-World Examples

### Search Interface

```javascript
const [query, setQuery] = createSignal('');
const [results, setResults] = createSignal([]);
const [isPending, start] = useTransition();

function handleSearch(e) {
  setQuery(e.target.value);  // Urgent
  
  start(() => {
    const filtered = expensiveSearch(e.target.value);
    setResults(filtered);  // Non-urgent
  });
}
```

### Data Table Sorting

```javascript
function handleSort(column) {
  startTransition(() => {
    const sorted = sortLargeDataset(data(), column);
    setData(sorted);
  });
}
// Old data visible while sorting
```

### Route Transitions

```javascript
function navigateTo(route) {
  startTransition(() => {
    loadRouteData(route);
    setCurrentRoute(route);
  });
}
// Current page stays until next page ready
```

## Key Takeaways

1. **Concurrent ≠ Parallel** - It's about responsiveness, not speed
2. **Double buffering** keeps UI smooth during updates
3. **Urgency matters** - Not all updates are equal
4. **Stale-while-revalidate** gives instant + fresh
5. **Optimistic UI** provides immediate feedback
6. **Time slicing** prevents blocking
7. **Priority queues** handle different urgency levels
8. **Suspense + Transitions** = Smooth async experiences

## Further Reading

- [React Concurrent Mode](https://reactjs.org/docs/concurrent-mode-intro.html) (similar concepts)
- [Double Buffering](https://en.wikipedia.org/wiki/Multiple_buffering) (graphics programming)
- [Cooperative Multitasking](https://en.wikipedia.org/wiki/Cooperative_multitasking)
- [Event Loop](https://developer.mozilla.org/en-US/docs/Web/JavaScript/EventLoop)
