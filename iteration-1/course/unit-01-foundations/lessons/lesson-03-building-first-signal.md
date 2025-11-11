# Lesson 3: Building Your First Signal

## Table of Contents
1. [Implementation Plan](#implementation-plan)
2. [Step 1: Basic Signal](#step-1-basic-signal)
3. [Step 2: Dependency Tracking](#step-2-dependency-tracking)
4. [Step 3: Effects](#step-3-effects)
5. [Step 4: Cleanup and Memory](#step-4-cleanup-and-memory)
6. [Step 5: Advanced Features](#step-5-advanced-features)
7. [Testing Our Implementation](#testing-our-implementation)
8. [Complete Implementation](#complete-implementation)
9. [Summary](#summary)

---

## Implementation Plan

We'll build a functional reactive system step-by-step:

### Milestones

1. **Basic Signal** - Store and retrieve values
2. **Dependency Tracking** - Automatic subscription
3. **Effects** - React to changes
4. **Cleanup** - Prevent memory leaks
5. **Advanced Features** - Memos, batching, etc.

### Requirements

- Store values
- Track dependencies automatically
- Notify observers on changes
- Clean up properly
- Handle edge cases

Let's begin!

---

## Step 1: Basic Signal

### Goal

Create a signal that can store and update values.

### Implementation

```javascript
// Version 1: Simplest signal
function createSignal(initialValue) {
  let value = initialValue;
  
  // Getter function
  const read = () => value;
  
  // Setter function
  const write = (nextValue) => {
    value = nextValue;
  };
  
  return [read, write];
}
```

### Usage

```javascript
const [count, setCount] = createSignal(0);

console.log(count()); // 0

setCount(5);
console.log(count()); // 5
```

### Analysis

**What works:**
- ✅ Stores values
- ✅ Reads values
- ✅ Updates values

**What's missing:**
- ❌ No reactivity (no notifications)
- ❌ No dependency tracking
- ❌ No functional updates

### Enhancement: Functional Updates

```javascript
function createSignal(initialValue) {
  let value = initialValue;
  
  const read = () => value;
  
  const write = (nextValue) => {
    // Support functional updates
    if (typeof nextValue === 'function') {
      value = nextValue(value);
    } else {
      value = nextValue;
    }
  };
  
  return [read, write];
}
```

### Enhanced Usage

```javascript
const [count, setCount] = createSignal(0);

// Direct value
setCount(5);
console.log(count()); // 5

// Functional update
setCount(prev => prev + 1);
console.log(count()); // 6
```

---

## Step 2: Dependency Tracking

### Goal

Make signals track who depends on them automatically.

### The Tracking Context

```javascript
// Global tracking context
let currentListener = null;

function createSignal(initialValue) {
  let value = initialValue;
  const subscribers = new Set();
  
  const read = () => {
    // Register current listener as subscriber
    if (currentListener !== null) {
      subscribers.add(currentListener);
    }
    return value;
  };
  
  const write = (nextValue) => {
    if (typeof nextValue === 'function') {
      value = nextValue(value);
    } else {
      value = nextValue;
    }
    
    // Notify all subscribers
    for (const subscriber of subscribers) {
      subscriber();
    }
  };
  
  return [read, write];
}
```

### Test It

```javascript
const [count, setCount] = createSignal(0);

// Manually set a listener
const effect = () => {
  console.log('Count is:', count());
};

// Run effect with tracking
currentListener = effect;
effect(); // Logs: "Count is: 0"
currentListener = null;

// Now the effect is subscribed
setCount(5); // Logs: "Count is: 5"
```

### Analysis

**What works:**
- ✅ Tracks dependencies automatically
- ✅ Notifies subscribers on change

**What's missing:**
- ❌ Manual tracking setup
- ❌ No cleanup of old subscriptions
- ❌ Can't unsubscribe

---

## Step 3: Effects

### Goal

Create a helper to automatically track dependencies.

### Implementation

```javascript
function createEffect(fn) {
  // Create a wrapped function that sets itself as listener
  const execute = () => {
    currentListener = execute;
    fn();
    currentListener = null;
  };
  
  // Run immediately
  execute();
}
```

### Usage

```javascript
const [count, setCount] = createSignal(0);

// Effect automatically tracks count
createEffect(() => {
  console.log('Count:', count());
});
// Logs: "Count: 0"

setCount(1); // Logs: "Count: 1"
setCount(2); // Logs: "Count: 2"
```

### Problem: Stale Dependencies

```javascript
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(1);

createEffect(() => {
  console.log('Sum:', a() + b());
});
// Logs: "Sum: 2"

setA(2); // Logs: "Sum: 3" ✅
setA(3); // Logs: "Sum: 4" ✅
       // Logs: "Sum: 4" ❌ (runs twice!)
```

**Why?** Each execution subscribes again without unsubscribing!

### Solution: Cleanup Before Re-run

```javascript
function createEffect(fn) {
  const execute = () => {
    // Clean up old subscriptions
    cleanup(execute);
    
    currentListener = execute;
    fn();
    currentListener = null;
  };
  
  execute();
}

function cleanup(execute) {
  // Track subscriptions for cleanup
  if (execute.subscriptions) {
    execute.subscriptions.forEach(signal => {
      signal.unsubscribe(execute);
    });
    execute.subscriptions.clear();
  }
}
```

### Updated Signal

```javascript
function createSignal(initialValue) {
  let value = initialValue;
  const subscribers = new Set();
  
  const read = () => {
    if (currentListener !== null) {
      subscribers.add(currentListener);
      
      // Track subscription for cleanup
      if (!currentListener.subscriptions) {
        currentListener.subscriptions = new Set();
      }
      currentListener.subscriptions.add(read);
    }
    return value;
  };
  
  // Add unsubscribe method
  read.unsubscribe = (listener) => {
    subscribers.delete(listener);
  };
  
  const write = (nextValue) => {
    if (typeof nextValue === 'function') {
      value = nextValue(value);
    } else {
      value = nextValue;
    }
    
    for (const subscriber of subscribers) {
      subscriber();
    }
  };
  
  return [read, write];
}
```

### Test Cleanup

```javascript
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(1);

createEffect(() => {
  console.log('Sum:', a() + b());
});
// Logs: "Sum: 2"

setA(2); // Logs: "Sum: 3" (once) ✅
setB(3); // Logs: "Sum: 5" (once) ✅
```

---

## Step 4: Cleanup and Memory

### Goal

Prevent memory leaks by cleaning up properly.

### User Cleanup Functions

```javascript
let currentCleanups = null;

function createEffect(fn) {
  const execute = () => {
    cleanup(execute);
    
    // Set up cleanup collection
    currentCleanups = execute.cleanups = [];
    
    currentListener = execute;
    fn();
    currentListener = null;
    currentCleanups = null;
  };
  
  execute();
  
  // Return dispose function
  return () => {
    cleanup(execute);
  };
}

function onCleanup(fn) {
  if (currentCleanups) {
    currentCleanups.push(fn);
  }
}

function cleanup(execute) {
  // Run user cleanups
  if (execute.cleanups) {
    execute.cleanups.forEach(fn => fn());
    execute.cleanups = [];
  }
  
  // Clean up subscriptions
  if (execute.subscriptions) {
    execute.subscriptions.forEach(signal => {
      signal.unsubscribe(execute);
    });
    execute.subscriptions.clear();
  }
}
```

### Usage

```javascript
const [count, setCount] = createSignal(0);

const dispose = createEffect(() => {
  console.log('Count:', count());
  
  const interval = setInterval(() => {
    console.log('Tick');
  }, 1000);
  
  // Cleanup interval when effect reruns or disposes
  onCleanup(() => {
    clearInterval(interval);
    console.log('Cleaned up');
  });
});

setCount(1); // Logs: "Cleaned up", "Count: 1"

// Manual disposal
dispose(); // Logs: "Cleaned up"
```

---

## Step 5: Advanced Features

### Memos (Computed Values)

```javascript
function createMemo(fn) {
  const [signal, setSignal] = createSignal();
  
  createEffect(() => {
    setSignal(fn());
  });
  
  return signal;
}
```

### Usage

```javascript
const [firstName, setFirstName] = createSignal('John');
const [lastName, setLastName] = createSignal('Doe');

const fullName = createMemo(() => {
  console.log('Computing full name');
  return `${firstName()} ${lastName()}`;
});

console.log(fullName()); 
// Logs: "Computing full name"
// Returns: "John Doe"

// Reading again (not recomputed)
console.log(fullName()); // Returns: "John Doe"

setFirstName('Jane');
// Logs: "Computing full name"

console.log(fullName()); // Returns: "Jane Doe"
```

### Batching Updates

```javascript
let updateQueue = new Set();
let isBatching = false;

function batch(fn) {
  isBatching = true;
  fn();
  isBatching = false;
  
  // Flush queue
  const queue = updateQueue;
  updateQueue = new Set();
  queue.forEach(effect => effect());
}

// Update signal write to support batching
function createSignal(initialValue) {
  let value = initialValue;
  const subscribers = new Set();
  
  const read = () => {
    if (currentListener !== null) {
      subscribers.add(currentListener);
      if (!currentListener.subscriptions) {
        currentListener.subscriptions = new Set();
      }
      currentListener.subscriptions.add(read);
    }
    return value;
  };
  
  read.unsubscribe = (listener) => {
    subscribers.delete(listener);
  };
  
  const write = (nextValue) => {
    if (typeof nextValue === 'function') {
      value = nextValue(value);
    } else {
      value = nextValue;
    }
    
    if (isBatching) {
      // Queue updates
      subscribers.forEach(sub => updateQueue.add(sub));
    } else {
      // Run immediately
      subscribers.forEach(sub => sub());
    }
  };
  
  return [read, write];
}
```

### Batch Usage

```javascript
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);

createEffect(() => {
  console.log('Sum:', a() + b());
});
// Logs: "Sum: 3"

// Without batching
setA(10); // Logs: "Sum: 12"
setB(20); // Logs: "Sum: 30"

// With batching
batch(() => {
  setA(100);
  setB(200);
});
// Logs: "Sum: 300" (only once!)
```

### Equality Comparison

```javascript
function createSignal(initialValue, options = {}) {
  let value = initialValue;
  const subscribers = new Set();
  const { equals = (a, b) => a === b } = options;
  
  const read = () => {
    if (currentListener !== null) {
      subscribers.add(currentListener);
      if (!currentListener.subscriptions) {
        currentListener.subscriptions = new Set();
      }
      currentListener.subscriptions.add(read);
    }
    return value;
  };
  
  read.unsubscribe = (listener) => {
    subscribers.delete(listener);
  };
  
  const write = (nextValue) => {
    if (typeof nextValue === 'function') {
      nextValue = nextValue(value);
    }
    
    // Only update if value changed
    if (!equals(value, nextValue)) {
      value = nextValue;
      
      if (isBatching) {
        subscribers.forEach(sub => updateQueue.add(sub));
      } else {
        subscribers.forEach(sub => sub());
      }
    }
  };
  
  return [read, write];
}
```

### Usage

```javascript
// Reference equality (default)
const [obj, setObj] = createSignal({ x: 1 });

createEffect(() => {
  console.log('Object:', obj());
});

setObj({ x: 1 }); // Logs: "Object: { x: 1 }" (new reference)

// Custom equality
const [point, setPoint] = createSignal(
  { x: 1, y: 2 },
  { equals: (a, b) => a.x === b.x && a.y === b.y }
);

createEffect(() => {
  console.log('Point:', point());
});

setPoint({ x: 1, y: 2 }); // No log (deep equal)
setPoint({ x: 2, y: 3 }); // Logs: "Point: { x: 2, y: 3 }"
```

---

## Testing Our Implementation

### Test 1: Basic Signal

```javascript
function test1() {
  console.log('Test 1: Basic Signal');
  
  const [count, setCount] = createSignal(0);
  
  console.assert(count() === 0, 'Initial value');
  
  setCount(5);
  console.assert(count() === 5, 'Updated value');
  
  setCount(prev => prev + 1);
  console.assert(count() === 6, 'Functional update');
  
  console.log('✅ Test 1 passed\n');
}
```

### Test 2: Effects

```javascript
function test2() {
  console.log('Test 2: Effects');
  
  const [count, setCount] = createSignal(0);
  let effectRuns = 0;
  
  createEffect(() => {
    count();
    effectRuns++;
  });
  
  console.assert(effectRuns === 1, 'Effect runs initially');
  
  setCount(1);
  console.assert(effectRuns === 2, 'Effect runs on change');
  
  setCount(1); // Same value
  console.assert(effectRuns === 2, 'Effect skips same value');
  
  console.log('✅ Test 2 passed\n');
}
```

### Test 3: Memos

```javascript
function test3() {
  console.log('Test 3: Memos');
  
  const [count, setCount] = createSignal(0);
  let computations = 0;
  
  const doubled = createMemo(() => {
    computations++;
    return count() * 2;
  });
  
  console.assert(doubled() === 0, 'Initial memo value');
  console.assert(computations === 1, 'Computed once');
  
  doubled(); // Read again
  console.assert(computations === 1, 'Not recomputed');
  
  setCount(5);
  console.assert(doubled() === 10, 'Updated memo value');
  console.assert(computations === 2, 'Recomputed on dependency change');
  
  console.log('✅ Test 3 passed\n');
}
```

### Test 4: Cleanup

```javascript
function test4() {
  console.log('Test 4: Cleanup');
  
  const [count, setCount] = createSignal(0);
  let cleanups = 0;
  
  const dispose = createEffect(() => {
    count();
    onCleanup(() => {
      cleanups++;
    });
  });
  
  setCount(1);
  console.assert(cleanups === 1, 'Cleanup on rerun');
  
  dispose();
  console.assert(cleanups === 2, 'Cleanup on dispose');
  
  console.log('✅ Test 4 passed\n');
}
```

### Test 5: Batching

```javascript
function test5() {
  console.log('Test 5: Batching');
  
  const [a, setA] = createSignal(1);
  const [b, setB] = createSignal(2);
  let effectRuns = 0;
  
  createEffect(() => {
    a();
    b();
    effectRuns++;
  });
  
  console.assert(effectRuns === 1, 'Initial run');
  
  batch(() => {
    setA(10);
    setB(20);
  });
  
  console.assert(effectRuns === 2, 'Batched update (one run)');
  
  console.log('✅ Test 5 passed\n');
}
```

### Run All Tests

```javascript
function runTests() {
  test1();
  test2();
  test3();
  test4();
  test5();
  console.log('🎉 All tests passed!');
}

runTests();
```

---

## Complete Implementation

Here's our complete reactive system:

```javascript
// Global state
let currentListener = null;
let currentCleanups = null;
let updateQueue = new Set();
let isBatching = false;

// Signal implementation
function createSignal(initialValue, options = {}) {
  let value = initialValue;
  const subscribers = new Set();
  const { equals = (a, b) => a === b } = options;
  
  const read = () => {
    if (currentListener !== null) {
      subscribers.add(currentListener);
      if (!currentListener.subscriptions) {
        currentListener.subscriptions = new Set();
      }
      currentListener.subscriptions.add(read);
    }
    return value;
  };
  
  read.unsubscribe = (listener) => {
    subscribers.delete(listener);
  };
  
  const write = (nextValue) => {
    if (typeof nextValue === 'function') {
      nextValue = nextValue(value);
    }
    
    if (!equals(value, nextValue)) {
      value = nextValue;
      
      if (isBatching) {
        subscribers.forEach(sub => updateQueue.add(sub));
      } else {
        subscribers.forEach(sub => sub());
      }
    }
  };
  
  return [read, write];
}

// Effect implementation
function createEffect(fn) {
  const execute = () => {
    cleanup(execute);
    currentCleanups = execute.cleanups = [];
    currentListener = execute;
    fn();
    currentListener = null;
    currentCleanups = null;
  };
  
  execute();
  
  return () => cleanup(execute);
}

// Memo implementation
function createMemo(fn) {
  const [signal, setSignal] = createSignal();
  createEffect(() => setSignal(fn()));
  return signal;
}

// Cleanup helper
function onCleanup(fn) {
  if (currentCleanups) {
    currentCleanups.push(fn);
  }
}

// Cleanup implementation
function cleanup(execute) {
  if (execute.cleanups) {
    execute.cleanups.forEach(fn => fn());
    execute.cleanups = [];
  }
  
  if (execute.subscriptions) {
    execute.subscriptions.forEach(signal => {
      signal.unsubscribe(execute);
    });
    execute.subscriptions.clear();
  }
}

// Batch implementation
function batch(fn) {
  isBatching = true;
  fn();
  isBatching = false;
  
  const queue = updateQueue;
  updateQueue = new Set();
  queue.forEach(effect => effect());
}

// Untrack implementation
function untrack(fn) {
  const prevListener = currentListener;
  currentListener = null;
  const result = fn();
  currentListener = prevListener;
  return result;
}

// Export API
export {
  createSignal,
  createEffect,
  createMemo,
  onCleanup,
  batch,
  untrack
};
```

---

## Summary

### What We Built

1. **Signals** - Reactive value containers
2. **Effects** - Automatic re-execution on changes
3. **Memos** - Cached computed values
4. **Cleanup** - Memory leak prevention
5. **Batching** - Optimized updates
6. **Untracking** - Selective reactivity

### Key Insights

1. **Tracking Context**
   - Global `currentListener` enables automatic tracking
   - Effects set themselves as listener before running

2. **Bidirectional Subscriptions**
   - Signals track their observers
   - Effects track their dependencies
   - Enables efficient cleanup

3. **Equality Comparison**
   - Prevents unnecessary updates
   - Customizable for complex types

4. **Batching**
   - Queue updates during batch
   - Flush queue after batch completes
   - Reduces redundant work

### Comparison to Solid.js

Our implementation covers the core concepts, but Solid.js adds:

- **Ownership hierarchy** - Nested scopes
- **Computation states** - STALE, PENDING, etc.
- **Scheduler** - Advanced timing control
- **Transitions** - Concurrent updates
- **Development tools** - Debugging support

### What You've Learned

- ✅ How signals work internally
- ✅ Automatic dependency tracking
- ✅ Effect lifecycle
- ✅ Memory management
- ✅ Performance optimization
- ✅ Testing reactive code

### Next Steps

Now that you've built a basic reactive system:

1. **Experiment** - Modify the implementation
2. **Extend** - Add new features
3. **Optimize** - Improve performance
4. **Compare** - Study Solid.js source code

### Exercises

1. Add support for nested effects
2. Implement `createRoot` for ownership
3. Add `createSelector` for O(2) updates
4. Build a dev tool to visualize dependencies
5. Implement lazy evaluation for memos

---

## Further Reading

- **Unit 2:** [Core Reactive Primitives](../../unit-02-core-primitives/README.md)
- **Exercise:** [Extended Signal Implementation](../exercises/03-advanced-signal.md)
- **Source:** [Solid.js signal.ts](https://github.com/solidjs/solid/blob/main/packages/solid/src/reactive/signal.ts)

---

**Congratulations!** 🎉 You've built a working reactive system and understand how signals work at a fundamental level. This knowledge will serve as the foundation for all advanced topics in this course!
