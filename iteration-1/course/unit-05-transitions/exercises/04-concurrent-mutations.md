# Exercise 4: Concurrent Mutations ⭐⭐⭐⭐

## Objective

Build a system to handle concurrent mutations safely, including race condition prevention, request cancellation, and optimistic updates.

## Background

When multiple async operations happen concurrently, you need to:
1. Prevent race conditions
2. Cancel outdated requests
3. Handle optimistic updates
4. Resolve conflicts

## Requirements

Implement a concurrent mutation manager with:

1. **Request Tracking** - Track and cancel outdated requests
2. **Optimistic Updates** - Update UI immediately, revert on failure
3. **Conflict Resolution** - Handle multiple simultaneous updates
4. **Error Recovery** - Gracefully handle failures

## Starter Code

```javascript
// ===== YOUR IMPLEMENTATION =====

class ConcurrentMutationManager {
  constructor() {
    // TODO: Initialize request tracking
    this.requestId = 0;
    this.pendingRequests = new Map();
  }
  
  async execute(operation, options = {}) {
    // TODO: Implement concurrent-safe execution
    // - Track request ID
    // - Handle optimistic updates
    // - Cancel outdated requests
    // - Resolve conflicts
  }
  
  cancel(requestId) {
    // TODO: Cancel specific request
  }
  
  cancelAll() {
    // TODO: Cancel all pending requests
  }
}

class OptimisticQueue {
  constructor() {
    // TODO: Track optimistic operations
    this.pending = new Map();
    this.nextId = 0;
  }
  
  add(operation, optimisticValue, rollback) {
    // TODO: Add optimistic operation
    // - Apply optimistic value immediately
    // - Track operation
    // - Handle resolution/rejection
  }
  
  resolve(id, realValue) {
    // TODO: Replace optimistic with real value
  }
  
  reject(id, error) {
    // TODO: Rollback optimistic change
  }
}

// ===== TEST CASES =====

// Test 1: Race condition prevention
console.log('Test 1: Race conditions');
{
  const [data, setData] = createSignal(null);
  const manager = new ConcurrentMutationManager();
  
  async function fetchUser(id, delay) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({ id, name: `User ${id}` });
      }, delay);
    });
  }
  
  // Fire off multiple requests
  manager.execute(() => fetchUser(1, 200).then(setData));
  manager.execute(() => fetchUser(2, 100).then(setData)); // Faster
  manager.execute(() => fetchUser(3, 50).then(setData));  // Fastest
  
  setTimeout(() => {
    // Should have user 3 (last requested), not user 1 (last resolved)
    console.log('Data:', data());  // { id: 3, name: 'User 3' }
  }, 300);
}

// Test 2: Request cancellation
console.log('\nTest 2: Cancellation');
{
  const [data, setData] = createSignal(null);
  const manager = new ConcurrentMutationManager();
  
  async function longFetch(signal) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        resolve('DATA');
      }, 200);
      
      signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        reject(new Error('Cancelled'));
      });
    });
  }
  
  const request1 = manager.execute((signal) => 
    longFetch(signal).then(setData)
  );
  
  // Cancel after 50ms
  setTimeout(() => {
    manager.cancelAll();
    console.log('Cancelled!');
  }, 50);
  
  setTimeout(() => {
    console.log('Data:', data());  // null (cancelled)
  }, 300);
}

// Test 3: Optimistic updates
console.log('\nTest 3: Optimistic updates');
{
  const [items, setItems] = createSignal([]);
  const queue = new OptimisticQueue();
  
  async function saveItem(text) {
    await new Promise(resolve => setTimeout(resolve, 100));
    return { id: Date.now(), text, saved: true };
  }
  
  function addItem(text) {
    const tempId = `temp-${Date.now()}`;
    const optimistic = { id: tempId, text, pending: true };
    
    // Add optimistically
    setItems(items => [...items, optimistic]);
    
    queue.add(
      () => saveItem(text),
      optimistic,
      () => {
        // Rollback
        setItems(items => 
          items.filter(item => item.id !== tempId)
        );
      }
    );
  }
  
  addItem('Test 1');
  console.log('After add:', items().length);  // 1 (optimistic)
  
  setTimeout(() => {
    console.log('After save:', items());  // Real item
  }, 150);
}

// Test 4: Conflict resolution - last write wins
console.log('\nTest 4: Last write wins');
{
  const [value, setValue] = createSignal(0);
  
  async function update(newValue, delay) {
    await new Promise(resolve => setTimeout(resolve, delay));
    return newValue;
  }
  
  let requestId = 0;
  
  async function safeUpdate(newValue, delay) {
    const thisRequest = ++requestId;
    
    const result = await update(newValue, delay);
    
    // Only apply if still latest
    if (thisRequest === requestId) {
      setValue(result);
    }
  }
  
  safeUpdate(1, 200);  // Slow
  safeUpdate(2, 100);  // Medium
  safeUpdate(3, 50);   // Fast
  
  setTimeout(() => {
    console.log('Value:', value());  // 3 (last requested)
  }, 250);
}

// Test 5: Error handling
console.log('\nTest 5: Error handling');
{
  const [data, setData] = createSignal('initial');
  const [error, setError] = createSignal(null);
  const manager = new ConcurrentMutationManager();
  
  async function failingFetch() {
    await new Promise(resolve => setTimeout(resolve, 50));
    throw new Error('Fetch failed!');
  }
  
  manager.execute(async () => {
    try {
      const result = await failingFetch();
      setData(result);
    } catch (err) {
      setError(err.message);
    }
  });
  
  setTimeout(() => {
    console.log('Error:', error());  // 'Fetch failed!'
    console.log('Data unchanged:', data());  // 'initial'
  }, 100);
}

// Test 6: Multiple optimistic operations
console.log('\nTest 6: Multiple optimistic ops');
{
  const [count, setCount] = createSignal(0);
  const queue = new OptimisticQueue();
  
  async function increment() {
    await new Promise(resolve => setTimeout(resolve, 50));
    return count() + 1;
  }
  
  function optimisticIncrement() {
    const currentCount = count();
    
    // Optimistic
    setCount(c => c + 1);
    
    queue.add(
      increment,
      count(),
      () => setCount(currentCount)  // Rollback
    );
  }
  
  // Fire multiple increments
  optimisticIncrement();  // 0 -> 1
  optimisticIncrement();  // 1 -> 2
  optimisticIncrement();  // 2 -> 3
  
  console.log('Optimistic count:', count());  // 3
  
  setTimeout(() => {
    console.log('Final count:', count());  // Should be 3
  }, 200);
}
```

## Expected Output

```
Test 1: Race conditions
Data: { id: 3, name: 'User 3' }

Test 2: Cancellation
Cancelled!
Data: null

Test 3: Optimistic updates
After add: 1
After save: [{ id: <timestamp>, text: 'Test 1', saved: true }]

Test 4: Last write wins
Value: 3

Test 5: Error handling
Error: Fetch failed!
Data unchanged: initial

Test 6: Multiple optimistic ops
Optimistic count: 3
Final count: 3
```

## Implementation Guide

### ConcurrentMutationManager

```javascript
class ConcurrentMutationManager {
  constructor() {
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.abortControllers = new Map();
  }
  
  async execute(operation) {
    const thisRequest = ++this.requestId;
    const abortController = new AbortController();
    
    this.abortControllers.set(thisRequest, abortController);
    
    try {
      const result = await operation(abortController.signal);
      
      // Only apply if still latest
      if (thisRequest === this.requestId) {
        return result;
      }
    } finally {
      this.abortControllers.delete(thisRequest);
    }
  }
  
  cancel(requestId) {
    const controller = this.abortControllers.get(requestId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(requestId);
    }
  }
  
  cancelAll() {
    for (const [id, controller] of this.abortControllers) {
      controller.abort();
    }
    this.abortControllers.clear();
  }
}
```

### OptimisticQueue

```javascript
class OptimisticQueue {
  constructor() {
    this.pending = new Map();
    this.nextId = 0;
  }
  
  add(operation, optimisticValue, rollback) {
    const id = this.nextId++;
    
    this.pending.set(id, {
      operation,
      optimistic: optimisticValue,
      rollback
    });
    
    operation()
      .then(realValue => this.resolve(id, realValue))
      .catch(err => this.reject(id, err));
    
    return id;
  }
  
  resolve(id, realValue) {
    const item = this.pending.get(id);
    if (item) {
      // Replace optimistic with real
      // (Implementation depends on your state management)
      this.pending.delete(id);
    }
  }
  
  reject(id, error) {
    const item = this.pending.get(id);
    if (item && item.rollback) {
      item.rollback();
      this.pending.delete(id);
    }
  }
}
```

## Bonus Challenges

1. **Retry Logic** - Auto-retry failed operations
2. **Request Deduplication** - Prevent identical concurrent requests
3. **Merge Strategy** - Merge instead of replace
4. **Priority Queue** - Higher priority cancels lower priority

## Real-World Example: Search

```javascript
function SearchComponent() {
  const [query, setQuery] = createSignal('');
  const [results, setResults] = createSignal([]);
  const [isPending, start] = useTransition();
  
  const manager = new ConcurrentMutationManager();
  let debounceTimeout;
  
  function handleSearch(value) {
    setQuery(value);
    
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      start(() => {
        manager.execute(async (signal) => {
          const data = await fetch(
            `/api/search?q=${value}`,
            { signal }
          );
          
          const json = await data.json();
          setResults(json);
        });
      });
    }, 300);
  }
  
  return (
    <div>
      <input
        value={query()}
        onInput={e => handleSearch(e.target.value)}
      />
      
      <div classList={{ dimmed: isPending() }}>
        <For each={results()}>
          {result => <SearchResult data={result} />}
        </For>
      </div>
    </div>
  );
}
```

## Solution

<details>
<summary>Click to reveal complete solution</summary>

```javascript
class ConcurrentMutationManager {
  constructor() {
    this.requestId = 0;
    this.abortControllers = new Map();
  }
  
  async execute(operation, options = {}) {
    const thisRequest = ++this.requestId;
    const abortController = new AbortController();
    
    // Cancel previous requests if exclusive
    if (options.exclusive) {
      this.cancelAll();
    }
    
    this.abortControllers.set(thisRequest, abortController);
    
    try {
      const result = await operation(abortController.signal);
      
      // Validate still latest
      if (options.validateLatest !== false && thisRequest !== this.requestId) {
        return undefined;  // Outdated
      }
      
      return result;
    } catch (err) {
      if (err.name === 'AbortError') {
        return undefined;
      }
      throw err;
    } finally {
      this.abortControllers.delete(thisRequest);
    }
  }
  
  cancel(requestId) {
    const controller = this.abortControllers.get(requestId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(requestId);
    }
  }
  
  cancelAll() {
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    this.abortControllers.clear();
  }
  
  get hasPending() {
    return this.abortControllers.size > 0;
  }
}

class OptimisticQueue {
  constructor() {
    this.pending = new Map();
    this.nextId = 0;
  }
  
  add(operation, optimisticValue, rollback) {
    const id = this.nextId++;
    
    this.pending.set(id, {
      operation,
      optimistic: optimisticValue,
      rollback,
      startTime: Date.now()
    });
    
    Promise.resolve(operation())
      .then(realValue => this.resolve(id, realValue))
      .catch(err => this.reject(id, err));
    
    return id;
  }
  
  resolve(id, realValue) {
    const item = this.pending.get(id);
    if (item && item.onResolve) {
      item.onResolve(realValue);
    }
    this.pending.delete(id);
  }
  
  reject(id, error) {
    const item = this.pending.get(id);
    if (item) {
      if (item.rollback) {
        item.rollback();
      }
      if (item.onReject) {
        item.onReject(error);
      }
      this.pending.delete(id);
    }
  }
  
  get pendingCount() {
    return this.pending.size;
  }
}
```

</details>

## Verification Checklist

- [ ] Race conditions prevented
- [ ] Requests can be cancelled
- [ ] Optimistic updates work
- [ ] Rollback on error
- [ ] Multiple operations handled
- [ ] Proper cleanup
- [ ] Error handling

## What You Learned

- Race condition prevention strategies
- AbortController for cancellation
- Optimistic UI patterns
- Conflict resolution (last-write-wins)
- Error recovery mechanisms
- Request lifecycle management

## Next Steps

Combine all exercises to build a complete application with:
- Transitions for smooth UX
- Concurrent mutation handling
- Optimistic updates
- Loading states
- Error recovery

## References

- [AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- [Race Conditions](https://en.wikipedia.org/wiki/Race_condition)
- [Optimistic UI](https://www.apollographql.com/docs/react/performance/optimistic-ui/)
