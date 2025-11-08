# Exercise 3: useTransition Hook ⭐⭐⭐

## Objective

Build the `useTransition` hook that provides a user-friendly API for managing transition state with a pending indicator.

## Background

While `startTransition` is powerful, developers need an easy way to:
1. Know when a transition is active (`isPending`)
2. Start transitions with a simple API
3. Show loading indicators
4. Handle multiple transitions

## Requirements

Implement `useTransition()` that returns:
```javascript
const [isPending, start] = useTransition();
// isPending: Accessor<boolean>
// start: (fn: () => void) => Promise<void>
```

### Features

1. **Pending Signal**
   - Global signal shared by all transitions
   - `true` when any transition is active
   - `false` when all transitions committed

2. **Start Function**
   - Wrapper around `startTransition`
   - Manages pending state automatically
   - Returns promise for await

3. **Integration**
   - Works with existing transition system
   - Multiple `useTransition` calls share state
   - Proper cleanup on commit

## Starter Code

```javascript
// ===== GLOBALS =====

let Transition = null;
let Listener = null;
let Owner = null;

// Global pending signal (created once)
let transPending;
let setTransPending;

// ===== YOUR IMPLEMENTATION =====

function createSignal(initialValue) {
  // Use your implementation from previous exercises
}

function startTransition(fn) {
  // Use your implementation from previous exercises
  // MODIFY: Set transPending at appropriate times
}

function useTransition() {
  // TODO: Create transPending signal if needed
  
  // TODO: Return [transPending, startTransition]
}

// Initialize pending signal
function initPendingSignal() {
  if (!transPending) {
    [transPending, setTransPending] = createSignal(false);
  }
}

// ===== TEST CASES =====

// Test 1: Basic usage
console.log('Test 1: Basic usage');
{
  const [count, setCount] = createSignal(0);
  const [isPending, start] = useTransition();
  
  console.log('Initial pending:', isPending());  // false
  
  start(() => {
    setCount(5);
  }).then(() => {
    console.log('After commit - pending:', isPending());  // false
    console.log('Count:', count());  // 5
  });
  
  console.log('During transition - pending:', isPending());  // true
}

// Test 2: Async transition
console.log('\nTest 2: Async transition');
{
  const [data, setData] = createSignal(null);
  const [isPending, start] = useTransition();
  
  async function fetchData() {
    return new Promise(resolve => {
      setTimeout(() => resolve('DATA'), 100);
    });
  }
  
  start(async () => {
    console.log('Fetching... pending:', isPending());  // true
    const result = await fetchData();
    setData(result);
  }).then(() => {
    console.log('Done - pending:', isPending());  // false
    console.log('Data:', data());  // DATA
  });
}

// Test 3: Multiple useTransition calls share state
console.log('\nTest 3: Shared pending state');
{
  const [a, setA] = createSignal(0);
  const [b, setB] = createSignal(0);
  
  const [isPending1, start1] = useTransition();
  const [isPending2, start2] = useTransition();
  
  console.log('Same pending?', isPending1 === isPending2);  // true
  
  start1(() => setA(1));
  console.log('After start1 - isPending2:', isPending2());  // true (shared!)
  
  setTimeout(() => {
    start2(() => setB(2));
    console.log('After start2 - isPending1:', isPending1());  // true (shared!)
  }, 50);
}

// Test 4: UI pattern - loading indicator
console.log('\nTest 4: Loading indicator');
{
  const [items, setItems] = createSignal([]);
  const [isPending, start] = useTransition();
  
  function loadItems() {
    start(async () => {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 100));
      setItems(['Item 1', 'Item 2', 'Item 3']);
    });
  }
  
  function render() {
    if (isPending()) {
      console.log('UI: Loading...');
    } else {
      console.log('UI: Items:', items());
    }
  }
  
  render();  // UI: Items: []
  
  loadItems();
  render();  // UI: Loading...
  
  setTimeout(() => {
    render();  // UI: Items: [Item 1, Item 2, Item 3]
  }, 150);
}

// Test 5: Debounced search with transition
console.log('\nTest 5: Debounced search');
{
  const [query, setQuery] = createSignal('');
  const [results, setResults] = createSignal([]);
  const [isPending, start] = useTransition();
  
  let timeoutId;
  
  function handleSearch(text) {
    // Update input immediately
    setQuery(text);
    
    // Debounce search
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      start(() => {
        // Expensive search
        const filtered = mockSearch(text);
        setResults(filtered);
      });
    }, 100);
  }
  
  function mockSearch(q) {
    return ['Result 1', 'Result 2'].filter(r => r.includes(q));
  }
  
  handleSearch('Result');
  
  console.log('Query updated immediately:', query());
  console.log('Pending (debounced):', isPending());  // false (not started yet)
  
  setTimeout(() => {
    console.log('Search started - pending:', isPending());  // true
  }, 110);
  
  setTimeout(() => {
    console.log('Search done - pending:', isPending());  // false
    console.log('Results:', results());
  }, 150);
}
```

## Expected Output

```
Test 1: Basic usage
Initial pending: false
During transition - pending: true
After commit - pending: false
Count: 5

Test 2: Async transition
Fetching... pending: true
Done - pending: false
Data: DATA

Test 3: Shared pending state
Same pending? true
After start1 - isPending2: true
After start2 - isPending1: true

Test 4: Loading indicator
UI: Items: []
UI: Loading...
UI: Items: [Item 1, Item 2, Item 3]

Test 5: Debounced search
Query updated immediately: Result
Pending (debounced): false
Search started - pending: true
Search done - pending: false
Results: [Result 1, Result 2]
```

## Implementation Guide

### Step 1: Initialize Global Signal

```javascript
// Module-level
let transPending = null;
let setTransPending = null;

function initPendingSignal() {
  if (!transPending) {
    [transPending, setTransPending] = createSignal(false);
  }
}
```

### Step 2: Modify startTransition

```javascript
function startTransition(fn) {
  initPendingSignal();  // Ensure signal exists
  
  // ... existing code ...
  
  return Promise.resolve().then(() => {
    // ... setup ...
    
    setTransPending(true);  // Set pending
    
    // ... execute fn ...
    
    return Transition.done;
  });
}
```

### Step 3: Clear Pending on Commit

```javascript
function commitTransition() {
  // ... copy values ...
  
  setTransPending(false);  // Clear pending
  
  // ... resolve promise ...
}
```

### Step 4: Implement useTransition

```javascript
function useTransition() {
  initPendingSignal();
  return [transPending, startTransition];
}
```

## UI Examples

### Loading Indicator

```javascript
const [isPending, start] = useTransition();

return (
  <div>
    {isPending() && <Spinner />}
    <DataView data={data()} />
  </div>
);
```

### Dimmed Content

```javascript
return (
  <div classList={{ dimmed: isPending() }}>
    <Items />
  </div>
);
```

### Disabled Button

```javascript
return (
  <button 
    onClick={loadData}
    disabled={isPending()}
  >
    {isPending() ? 'Loading...' : 'Load Data'}
  </button>
);
```

## Bonus Challenges

1. **Local Pending**: Create per-transition pending state
2. **Timeout**: Add timeout for long-running transitions
3. **Progress**: Track progress of async operations
4. **Cancel**: Add ability to cancel pending transitions

## Solution

<details>
<summary>Click to reveal solution</summary>

```javascript
// Global pending signal
let transPending = null;
let setTransPending = null;

function initPendingSignal() {
  if (!transPending) {
    [transPending, setTransPending] = createSignal(false);
  }
}

function useTransition() {
  initPendingSignal();
  return [transPending, startTransition];
}

function startTransition(fn) {
  initPendingSignal();
  
  if (Transition && Transition.running) {
    fn();
    return Transition.done;
  }
  
  const l = Listener;
  const o = Owner;
  
  return Promise.resolve().then(() => {
    Listener = l;
    Owner = o;
    
    Transition = {
      sources: new Set(),
      promises: new Set(),
      running: true,
      done: null,
      resolve: null,
      reject: null
    };
    
    Transition.done = new Promise((resolve, reject) => {
      Transition.resolve = resolve;
      Transition.reject = reject;
    });
    
    setTransPending(true);  // Set pending
    
    try {
      const result = fn();
      
      if (result && typeof result.then === 'function') {
        trackPromise(result);
      } else {
        checkCommit();
      }
    } catch (err) {
      setTransPending(false);  // Clear on error
      Transition.reject(err);
      Transition = null;
    }
    
    Listener = Owner = null;
    
    return Transition ? Transition.done : Promise.resolve();
  });
}

function commitTransition() {
  if (!Transition) return;
  
  for (const signal of Transition.sources) {
    if (signal.tValue !== undefined) {
      signal.value = signal.tValue;
      delete signal.tValue;
    }
  }
  
  setTransPending(false);  // Clear pending
  
  const resolve = Transition.resolve;
  Transition = null;
  
  if (resolve) {
    resolve();
  }
}
```

</details>

## Verification Checklist

- [ ] isPending starts as false
- [ ] isPending becomes true during transition
- [ ] isPending becomes false after commit
- [ ] Multiple useTransition calls share state
- [ ] Works with async transitions
- [ ] Handles errors gracefully
- [ ] Integrates with UI patterns

## What You Learned

- Global pending state management
- User-friendly hook API
- Integration with transition system
- UI loading patterns
- Shared state across components

## Next Exercise

**Exercise 4: Concurrent Mutations** - Handle race conditions and conflicting updates.
