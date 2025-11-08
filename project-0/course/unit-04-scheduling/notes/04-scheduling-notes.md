# Unit 4: Scheduling - Study Notes

## Quick Reference

### Key Concepts

| Concept | Purpose | Key Function |
|---------|---------|--------------|
| **MessageChannel** | Non-blocking task scheduling | `postMessage()` |
| **Update Queue** | Ordered computation execution | `runUpdates()` |
| **Batching** | Group multiple updates | `batch()` |
| **ExecCount** | Track update cycles | Global counter |
| **Pending Flag** | Control update timing | `Pending` variable |

---

## Core Functions Summary

### 1. Scheduler Functions

```typescript
// Schedule work in next microtask
function scheduleQueue(fn: () => void): void

// Execute update queue immediately
function runUpdates<T>(fn?: () => T): T | undefined

// Group updates atomically
function batch<T>(fn: () => T): T
```

### 2. Queue Management

```typescript
// Add computation to update queue
function queueUpdate(computation: Computation<any>): void

// Process all pending updates
function flushQueue(): void
```

---

## MessageChannel Scheduling

### Why MessageChannel?

✅ **Advantages:**
- Non-blocking (yields to browser)
- Faster than `setTimeout(0)`
- Consistent cross-browser behavior
- Proper event loop integration

❌ **Alternatives and Issues:**
- `setTimeout`: Too slow, minimum 4ms delay
- `setImmediate`: Not available in browsers
- `Promise.resolve().then()`: Microtask, blocks rendering
- `requestAnimationFrame`: Too slow for state updates

### Implementation Pattern

```typescript
const channel = new MessageChannel();
let scheduled = false;

channel.port1.onmessage = () => {
  scheduled = false;
  flushQueue();
};

function scheduleQueue(fn: () => void) {
  if (!scheduled) {
    scheduled = true;
    channel.port2.postMessage(null);
  }
}
```

---

## Effect Scheduling Patterns

### Effect Types

1. **User Effects** (`createEffect`)
   - Scheduled asynchronously
   - Lowest priority
   - Can be batched

2. **Render Effects** (`createRenderEffect`)
   - Execute synchronously
   - Highest priority
   - Run immediately

3. **Computed** (`createMemo`)
   - Lazy evaluation
   - Execute on read
   - Cache results

### Execution Order

```
Signal Update
    ↓
Mark Observers STALE
    ↓
Queue Updates
    ↓
[Batch Boundary?]
    ↓
Run Render Effects (sync)
    ↓
Schedule User Effects (async)
    ↓
[MessageChannel]
    ↓
Execute User Effects
```

---

## Batching Strategies

### When to Batch

✅ **Do Batch:**
```javascript
// Multiple related updates
batch(() => {
  setUser(newUser);
  setProfile(newProfile);
  setPreferences(newPrefs);
});

// Loop updates
batch(() => {
  for (const item of items) {
    addItem(item);
  }
});

// Form submission
batch(() => {
  setSubmitting(true);
  setErrors(null);
  clearForm();
});
```

❌ **Don't Batch:**
```javascript
// Single update (no benefit)
batch(() => {
  setValue(10);
});

// User interactions (blocks UI)
button.onclick = () => {
  batch(() => {
    doExpensiveWork(); // Bad!
  });
};
```

### Batching Rules

1. **Nest safely**: Inner batches are no-ops
2. **Return values**: `batch()` returns the callback result
3. **Synchronous**: All updates apply before batch returns
4. **Exception safe**: Updates still apply on error

---

## Update Queue Details

### Queue Structure

```typescript
interface UpdateQueue {
  computations: Computation<any>[];
  priority: number;
}

// Global queue
const Updates: Computation<any>[] = [];
```

### Priority Levels

```typescript
const PRIORITY = {
  RENDER: 100,    // Render effects
  USER: 50,       // User effects
  DEFERRED: 0     // Low priority work
};
```

### Processing Algorithm

```
while (Updates.length > 0) {
  1. Get next computation
  2. Check if STALE
  3. Skip if already fresh
  4. Update computation
  5. Mark observers STALE
  6. Continue
}
```

---

## ExecCount and Versioning

### Purpose

- Track which update cycle we're in
- Detect stale computations
- Prevent redundant updates
- Enable topological sorting

### How It Works

```typescript
// Global counter
let ExecCount = 0;

// On signal write
ExecCount++;
computation.version = ExecCount;

// On computation read
if (computation.version !== ExecCount) {
  // Stale, needs update
  updateComputation(computation);
}
```

### Version Comparison

| Scenario | Version Check | Action |
|----------|---------------|--------|
| Fresh | `comp.version === ExecCount` | Return cached value |
| Stale | `comp.version < ExecCount` | Recompute |
| Future | `comp.version > ExecCount` | Impossible (bug!) |

---

## Performance Patterns

### Optimization Checklist

- [ ] Batch related updates
- [ ] Use equality comparators
- [ ] Avoid unnecessary effects
- [ ] Leverage memos for expensive computations
- [ ] Untrack when appropriate
- [ ] Profile before optimizing

### Measuring Performance

```javascript
function measureUpdates() {
  let updateCount = 0;
  const originalRun = runUpdates;
  
  runUpdates = (...args) => {
    updateCount++;
    return originalRun(...args);
  };
  
  return () => {
    console.log(`Updates: ${updateCount}`);
    updateCount = 0;
  };
}
```

---

## Common Patterns

### 1. Debounced Updates

```javascript
function createDebouncedSignal(initialValue, delay = 300) {
  const [signal, setSignal] = createSignal(initialValue);
  let timeout;
  
  const debouncedSet = (value) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      batch(() => setSignal(value));
    }, delay);
  };
  
  return [signal, debouncedSet];
}
```

### 2. Throttled Updates

```javascript
function createThrottledSignal(initialValue, interval = 100) {
  const [signal, setSignal] = createSignal(initialValue);
  let lastUpdate = 0;
  
  const throttledSet = (value) => {
    const now = Date.now();
    if (now - lastUpdate >= interval) {
      batch(() => setSignal(value));
      lastUpdate = now;
    }
  };
  
  return [signal, throttledSet];
}
```

### 3. Batched Array Updates

```javascript
function updateArray(items) {
  batch(() => {
    setItems([]);  // Clear
    items.forEach(item => {
      addItem(item);
    });
  });
}
```

---

## Debugging Tips

### 1. Track Effect Runs

```javascript
createEffect(() => {
  console.trace('Effect running');
  // Your effect logic
});
```

### 2. Log Batch Boundaries

```javascript
const originalBatch = batch;
batch = (fn) => {
  console.log('Batch start');
  const result = originalBatch(fn);
  console.log('Batch end');
  return result;
};
```

### 3. Visualize Update Queue

```javascript
function logQueue() {
  console.log('Queue:', Updates.map(c => c.name || 'anonymous'));
}
```

### 4. Check for Infinite Loops

```javascript
let updateCount = 0;

createEffect(() => {
  updateCount++;
  if (updateCount > 100) {
    throw new Error('Possible infinite loop!');
  }
  
  // Your logic
});
```

---

## Anti-Patterns

### ❌ 1. Updating in Computed

```javascript
// BAD: Side effects in memo
const data = createMemo(() => {
  setLoading(false); // NO! Side effect!
  return expensiveComputation();
});
```

### ❌ 2. Nested Effect Scheduling

```javascript
// BAD: Effect creating effects
createEffect(() => {
  value();
  createEffect(() => {  // Memory leak!
    // ...
  });
});
```

### ❌ 3. Batching User Input

```javascript
// BAD: Delays user feedback
input.oninput = (e) => {
  batch(() => {
    handleInput(e.target.value);
  });
};
```

---

## Mental Models

### The Conveyor Belt

Think of scheduling like a factory conveyor belt:
- **Signals** place items on the belt
- **Batching** groups items into containers
- **Update Queue** is the belt itself
- **runUpdates()** processes each item
- **MessageChannel** controls belt speed

### The Cascade

Updates flow like water:
```
Signal (source)
  ↓
Memo (filter/transform)
  ↓
Effect (endpoint)
```

Batching creates a "dam" that releases all water at once.

---

## Testing Strategies

### Unit Tests

```typescript
describe('Scheduling', () => {
  test('batch prevents intermediate effects', () => {
    const [s, set] = createSignal(0);
    const runs: number[] = [];
    
    createEffect(() => runs.push(s()));
    runs.length = 0;
    
    batch(() => {
      set(1);
      set(2);
      set(3);
    });
    
    expect(runs).toEqual([3]);
  });
});
```

### Integration Tests

```typescript
test('form submission batches all updates', async () => {
  render(() => <Form onSubmit={handleSubmit} />);
  
  const effectRuns = trackEffectRuns();
  
  fireEvent.click(submitButton);
  await waitFor(() => expect(submitted).toBe(true));
  
  expect(effectRuns.count).toBeLessThan(5);
});
```

---

## Comparison with Other Frameworks

| Framework | Scheduling Strategy | Batching |
|-----------|-------------------|----------|
| **Solid.js** | MessageChannel + Sync | Manual `batch()` |
| **React** | Scheduler + Concurrent | Automatic |
| **Vue** | nextTick queue | Automatic |
| **Svelte** | Microtask queue | Automatic |
| **Angular** | Zone.js | Change detection |

---

## Glossary

- **Batching**: Grouping updates into a single transaction
- **Scheduling**: Deferring work to a later time
- **Update Queue**: List of pending computations
- **ExecCount**: Global version counter for updates
- **Pending**: Flag indicating batching is active
- **Running**: Flag indicating updates are executing
- **MessageChannel**: Browser API for async scheduling
- **Flush**: Execute all pending updates

---

## Cheat Sheet

```typescript
// Schedule async work
scheduleQueue(() => runUpdates());

// Batch multiple updates
batch(() => {
  setA(1);
  setB(2);
});

// Check if batching
if (Pending) {
  // Updates are batched
}

// Check if running
if (Running) {
  // Updates are executing
}

// Manual flush (internal)
runUpdates();
```

---

## Key Takeaways

1. ✅ MessageChannel provides optimal async scheduling
2. ✅ Batching is essential for performance
3. ✅ Update queue maintains execution order
4. ✅ ExecCount tracks update cycles
5. ✅ Effects can be user-scheduled or immediate
6. ✅ Always batch related state changes
7. ✅ Understand sync vs async execution paths

---

## Practice Exercises

1. Implement a scheduler without MessageChannel
2. Build a priority queue system
3. Create a batching utility with timeout
4. Measure effect execution timing
5. Visualize the update queue in real-time
6. Debug infinite loop scenarios
7. Optimize a large reactive graph

---

## Additional Resources

- [MDN: MessageChannel](https://developer.mozilla.org/en-US/docs/Web/API/MessageChannel)
- [JavaScript Event Loop](https://javascript.info/event-loop)
- [Task vs Microtask](https://jakearchibald.com/2015/tasks-microtasks-queues-and-schedules/)
- Solid.js source: `packages/solid/src/reactive/scheduler.ts`
