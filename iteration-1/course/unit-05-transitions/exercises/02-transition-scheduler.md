# Exercise 2: Transition Scheduler ⭐⭐⭐⭐

## Objective

Build a complete transition system with async execution, promise tracking, and proper scheduling.

## Background

Real transitions need to:
1. Defer execution to microtasks
2. Track async operations (promises)
3. Wait for all promises before committing
4. Handle context restoration

## Requirements

Extend your basic transition implementation with:

1. **Microtask Deferral**
   - `startTransition` should defer to next microtask
   - Allows batching multiple transition starts

2. **Promise Tracking**
   - Track promises created during transition
   - Wait for all promises before committing
   - Handle promise rejection

3. **Context Management**
   - Capture and restore `Listener` and `Owner`
   - Ensure proper tracking across async boundaries

4. **State Management**
   - `running` flag controls execution phase
   - `promises` set tracks pending async operations

## Starter Code

```javascript
// ===== GLOBALS =====

let Transition = null;
let Listener = null;
let Owner = null;

// ===== YOUR IMPLEMENTATION =====

function createSignal(initialValue) {
  // Copy from Exercise 1
}

function startTransition(fn) {
  // TODO: Handle nested transitions
  
  // TODO: Capture context
  const l = Listener;
  const o = Owner;
  
  // TODO: Defer to microtask
  return Promise.resolve().then(() => {
    // TODO: Restore context
    
    // TODO: Create TransitionState with promises set
    
    // TODO: Execute fn and track result
    
    // TODO: Check for promises
    
    // TODO: Return done promise
  });
}

function trackPromise(promise) {
  // TODO: Add promise to Transition.promises
  // TODO: Remove when resolved/rejected
  // TODO: Check if should commit
}

function checkCommit() {
  // TODO: Commit if no more promises
}

function commitTransition() {
  // Copy from Exercise 1 and enhance
}

// ===== TEST CASES =====

// Test 1: Microtask deferral
console.log('Test 1: Microtask deferral');
{
  const [count, setCount] = createSignal(0);
  
  console.log('Before startTransition');
  
  startTransition(() => {
    console.log('Inside transition (deferred)');
    setCount(5);
  });
  
  console.log('After startTransition (sync)');
  console.log('Count (still 0):', count());
  
  // Wait for microtask
  setTimeout(() => {
    console.log('After microtask:', count());  // Should be 5
  }, 0);
}

// Test 2: Promise tracking
console.log('\nTest 2: Promise tracking');
{
  const [data, setData] = createSignal(null);
  
  async function fetchData() {
    return new Promise(resolve => {
      setTimeout(() => resolve('DATA'), 100);
    });
  }
  
  startTransition(async () => {
    console.log('Starting fetch...');
    const result = await fetchData();
    console.log('Fetched:', result);
    setData(result);
  }).then(() => {
    console.log('Transition committed!');
    console.log('Data:', data());  // Should be 'DATA'
  });
  
  console.log('Transition started (async)');
}

// Test 3: Multiple promises
console.log('\nTest 3: Multiple promises');
{
  const [a, setA] = createSignal(null);
  const [b, setB] = createSignal(null);
  
  async function fetch1() {
    return new Promise(resolve => {
      setTimeout(() => resolve('A'), 50);
    });
  }
  
  async function fetch2() {
    return new Promise(resolve => {
      setTimeout(() => resolve('B'), 100);
    });
  }
  
  startTransition(async () => {
    const [resA, resB] = await Promise.all([
      fetch1(),
      fetch2()
    ]);
    
    setA(resA);
    setB(resB);
  }).then(() => {
    console.log('All committed:', a(), b());  // A, B
  });
}

// Test 4: Promise rejection
console.log('\nTest 4: Promise rejection');
{
  const [data, setData] = createSignal('initial');
  
  startTransition(async () => {
    throw new Error('Fetch failed!');
  }).catch(err => {
    console.log('Caught error:', err.message);
    console.log('Data unchanged:', data());  // Should still be 'initial'
  });
}

// Test 5: Context restoration
console.log('\nTest 5: Context restoration');
{
  const [count, setCount] = createSignal(0);
  
  // Simulate being inside an effect
  Owner = { name: 'test-owner' };
  Listener = { name: 'test-listener' };
  
  startTransition(() => {
    console.log('Owner restored:', Owner?.name);      // test-owner
    console.log('Listener restored:', Listener?.name); // test-listener
    setCount(5);
  });
  
  Owner = null;
  Listener = null;
}

// Test 6: Batching multiple starts
console.log('\nTest 6: Batching');
{
  const [count, setCount] = createSignal(0);
  
  // Start multiple transitions quickly
  startTransition(() => {
    setCount(c => c + 1);
  });
  
  startTransition(() => {
    setCount(c => c + 1);
  });
  
  startTransition(() => {
    setCount(c => c + 1);
  });
  
  setTimeout(() => {
    console.log('Final count:', count());  // Should be 3
  }, 10);
}
```

## Expected Output

```
Test 1: Microtask deferral
Before startTransition
After startTransition (sync)
Count (still 0): 0
Inside transition (deferred)
After microtask: 5

Test 2: Promise tracking
Transition started (async)
Starting fetch...
Fetched: DATA
Transition committed!
Data: DATA

Test 3: Multiple promises
All committed: A B

Test 4: Promise rejection
Caught error: Fetch failed!
Data unchanged: initial

Test 5: Context restoration
Owner restored: test-owner
Listener restored: test-listener

Test 6: Batching
Final count: 3
```

## Implementation Guide

### Step 1: Microtask Deferral

```javascript
function startTransition(fn) {
  if (Transition && Transition.running) {
    fn();
    return Transition.done;
  }
  
  const l = Listener;
  const o = Owner;
  
  return Promise.resolve().then(() => {
    Listener = l;
    Owner = o;
    
    // ... rest of implementation
  });
}
```

### Step 2: Promise Tracking

```javascript
Transition = {
  sources: new Set(),
  promises: new Set(),  // Track promises
  running: true,
  done: null,
  resolve: null
};

// Track async operations
const result = fn();

if (result && typeof result.then === 'function') {
  trackPromise(result);
}
```

### Step 3: Track Promise Function

```javascript
function trackPromise(promise) {
  if (!Transition) return;
  
  Transition.promises.add(promise);
  
  promise
    .then(() => {
      Transition.promises.delete(promise);
      checkCommit();
    })
    .catch(err => {
      Transition.promises.delete(promise);
      console.error('Promise rejected:', err);
      checkCommit();
    });
}
```

### Step 4: Check Commit Function

```javascript
function checkCommit() {
  if (!Transition) return;
  
  // Commit if no more pending promises
  if (Transition.promises.size === 0) {
    commitTransition();
  }
}
```

## Bonus Challenges

1. **Scheduler Integration**: Add `enableScheduling()` to use custom scheduler
2. **Effect Deferral**: Collect effects and run after commit
3. **Suspense Integration**: Track suspense boundaries
4. **Error Recovery**: Handle partial commits on error

## Solution

<details>
<summary>Click to reveal solution</summary>

```javascript
let Transition = null;
let Listener = null;
let Owner = null;

function createSignal(initialValue) {
  const signal = {
    value: initialValue,
    tValue: undefined
  };
  
  const read = () => {
    if (Transition && Transition.running) {
      return signal.tValue !== undefined ? signal.tValue : signal.value;
    }
    return signal.value;
  };
  
  const write = (newValue) => {
    if (typeof newValue === 'function') {
      newValue = newValue(read());
    }
    
    if (Transition && Transition.running) {
      signal.tValue = newValue;
      Transition.sources.add(signal);
    } else {
      signal.value = newValue;
    }
  };
  
  return [read, write];
}

function startTransition(fn) {
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
    
    try {
      const result = fn();
      
      if (result && typeof result.then === 'function') {
        trackPromise(result);
      } else {
        checkCommit();
      }
    } catch (err) {
      Transition.reject(err);
      Transition = null;
    }
    
    Listener = Owner = null;
    
    return Transition ? Transition.done : Promise.resolve();
  });
}

function trackPromise(promise) {
  if (!Transition) return;
  
  Transition.promises.add(promise);
  
  promise
    .then(() => {
      if (Transition) {
        Transition.promises.delete(promise);
        checkCommit();
      }
    })
    .catch(err => {
      if (Transition) {
        Transition.promises.delete(promise);
        Transition.reject(err);
        Transition = null;
      }
    });
}

function checkCommit() {
  if (!Transition || Transition.promises.size > 0) {
    return;
  }
  
  commitTransition();
}

function commitTransition() {
  if (!Transition) return;
  
  for (const signal of Transition.sources) {
    if (signal.tValue !== undefined) {
      signal.value = signal.tValue;
      delete signal.tValue;
    }
  }
  
  const resolve = Transition.resolve;
  Transition = null;
  
  if (resolve) {
    resolve();
  }
}
```

</details>

## Verification Checklist

- [ ] Microtask deferral works
- [ ] Single promise tracked and awaited
- [ ] Multiple promises handled
- [ ] Promise rejection handled gracefully
- [ ] Context restored correctly
- [ ] Multiple transitions can batch
- [ ] No memory leaks

## What You Learned

- Microtask scheduling for batching
- Promise tracking and waiting
- Context capture and restoration
- Async transition lifecycle
- Error handling in transitions

## Next Exercise

**Exercise 3: useTransition Hook** - Build the user-facing API with pending state.
