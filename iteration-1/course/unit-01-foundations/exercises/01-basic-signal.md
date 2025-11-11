# Exercise 1: Basic Signal Implementation

## Objective

Implement a working signal system from scratch to solidify your understanding of reactive primitives.

## Difficulty

⭐⭐ Intermediate

## Time Estimate

2-3 hours

---

## Part 1: Simple Signal (30 minutes)

### Requirements

Create `createSignal` that:
1. Stores a value
2. Returns getter and setter functions
3. Supports functional updates

### Starter Code

```javascript
function createSignal(initialValue) {
  // TODO: Implement
}

// Tests
const [count, setCount] = createSignal(0);
console.assert(count() === 0);

setCount(5);
console.assert(count() === 5);

setCount(prev => prev + 1);
console.assert(count() === 6);

console.log('✅ Part 1 Complete');
```

### Hints

<details>
<summary>Click for hints</summary>

- Use closure to store the value
- Check if setter argument is a function
- Return array of [getter, setter]

</details>

### Solution

<details>
<summary>Click for solution</summary>

```javascript
function createSignal(initialValue) {
  let value = initialValue;
  
  const read = () => value;
  
  const write = (nextValue) => {
    if (typeof nextValue === 'function') {
      value = nextValue(value);
    } else {
      value = nextValue;
    }
  };
  
  return [read, write];
}
```

</details>

---

## Part 2: Add Tracking (45 minutes)

### Requirements

Add automatic dependency tracking:
1. Track current listener during signal reads
2. Notify subscribers on writes
3. Clean up old subscriptions

### Starter Code

```javascript
let currentListener = null;

function createSignal(initialValue) {
  // TODO: Implement with tracking
}

// Tests
const [count, setCount] = createSignal(0);
let runs = 0;

const effect = () => {
  count();
  runs++;
};

// Manually track
currentListener = effect;
effect();
currentListener = null;

console.assert(runs === 1);

setCount(1);
console.assert(runs === 2);

console.log('✅ Part 2 Complete');
```

### Hints

<details>
<summary>Click for hints</summary>

- Use a Set to store subscribers
- Add current listener during reads
- Loop through subscribers during writes
- Store subscriptions on the listener for cleanup

</details>

### Solution

<details>
<summary>Click for solution</summary>

```javascript
let currentListener = null;

function createSignal(initialValue) {
  let value = initialValue;
  const subscribers = new Set();
  
  const read = () => {
    if (currentListener) {
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
    
    subscribers.forEach(sub => sub());
  };
  
  return [read, write];
}
```

</details>

---

## Part 3: Create Effect (30 minutes)

### Requirements

Implement `createEffect`:
1. Automatically set tracking context
2. Run immediately
3. Clean up before re-running
4. Return dispose function

### Starter Code

```javascript
function createEffect(fn) {
  // TODO: Implement
}

function cleanup(execute) {
  // TODO: Implement cleanup logic
}

// Tests
const [count, setCount] = createSignal(0);
let runs = 0;

createEffect(() => {
  count();
  runs++;
});

console.assert(runs === 1);

setCount(1);
console.assert(runs === 2);

setCount(2);
console.assert(runs === 3);

console.log('✅ Part 3 Complete');
```

### Hints

<details>
<summary>Click for hints</summary>

- Wrap user function in execute function
- Set/unset currentListener around fn()
- Call cleanup before each run
- Return dispose function

</details>

### Solution

<details>
<summary>Click for solution</summary>

```javascript
function createEffect(fn) {
  const execute = () => {
    cleanup(execute);
    currentListener = execute;
    fn();
    currentListener = null;
  };
  
  execute();
  
  return () => cleanup(execute);
}

function cleanup(execute) {
  if (execute.subscriptions) {
    execute.subscriptions.forEach(signal => {
      signal.unsubscribe(execute);
    });
    execute.subscriptions.clear();
  }
}
```

</details>

---

## Part 4: Memos (30 minutes)

### Requirements

Implement `createMemo`:
1. Cache computed values
2. Only recompute when dependencies change
3. Return accessor function

### Starter Code

```javascript
function createMemo(fn) {
  // TODO: Implement
}

// Tests
const [count, setCount] = createSignal(0);
let computations = 0;

const doubled = createMemo(() => {
  computations++;
  return count() * 2;
});

console.assert(doubled() === 0);
console.assert(computations === 1);

doubled(); // Read again
console.assert(computations === 1); // Not recomputed

setCount(5);
console.assert(doubled() === 10);
console.assert(computations === 2);

console.log('✅ Part 4 Complete');
```

### Hints

<details>
<summary>Click for hints</summary>

- Create a signal to store the computed value
- Use createEffect to update it
- Return the signal's getter

</details>

### Solution

<details>
<summary>Click for solution</summary>

```javascript
function createMemo(fn) {
  const [signal, setSignal] = createSignal();
  createEffect(() => setSignal(fn()));
  return signal;
}
```

</details>

---

## Part 5: Batching (45 minutes)

### Requirements

Implement `batch`:
1. Queue updates during batch
2. Flush queue after batch completes
3. Ensure each effect runs once

### Starter Code

```javascript
let updateQueue = new Set();
let isBatching = false;

function batch(fn) {
  // TODO: Implement
}

// Modify createSignal to support batching

// Tests
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);
let runs = 0;

createEffect(() => {
  a();
  b();
  runs++;
});

console.assert(runs === 1);

batch(() => {
  setA(10);
  setB(20);
});

console.assert(runs === 2); // Only one additional run

console.log('✅ Part 5 Complete');
```

### Hints

<details>
<summary>Click for hints</summary>

- Set isBatching flag in batch()
- Queue subscribers instead of running them
- Flush queue after batch completes
- Use Set to avoid duplicate runs

</details>

### Solution

<details>
<summary>Click for solution</summary>

```javascript
function batch(fn) {
  isBatching = true;
  fn();
  isBatching = false;
  
  const queue = updateQueue;
  updateQueue = new Set();
  queue.forEach(effect => effect());
}

// Updated createSignal
function createSignal(initialValue) {
  let value = initialValue;
  const subscribers = new Set();
  
  const read = () => {
    if (currentListener) {
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
      subscribers.forEach(sub => updateQueue.add(sub));
    } else {
      subscribers.forEach(sub => sub());
    }
  };
  
  return [read, write];
}
```

</details>

---

## Bonus Challenges

### Challenge 1: Untrack

Implement `untrack()` to read signals without tracking:

```javascript
function untrack(fn) {
  // TODO: Implement
}

// Test
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);
let runs = 0;

createEffect(() => {
  const x = a(); // Tracked
  const y = untrack(() => b()); // Not tracked
  runs++;
});

console.assert(runs === 1);
setA(10); // Should trigger
console.assert(runs === 2);
setB(20); // Should NOT trigger
console.assert(runs === 2);
```

### Challenge 2: Equality Comparison

Add custom equality support:

```javascript
const [obj, setObj] = createSignal(
  { x: 1 },
  { equals: (a, b) => a.x === b.x }
);

let runs = 0;
createEffect(() => {
  obj();
  runs++;
});

setObj({ x: 1 }); // Should not trigger
console.assert(runs === 1);

setObj({ x: 2 }); // Should trigger
console.assert(runs === 2);
```

### Challenge 3: onCleanup

Implement user cleanup functions:

```javascript
function onCleanup(fn) {
  // TODO: Implement
}

const [count, setCount] = createSignal(0);
let cleanups = 0;

createEffect(() => {
  count();
  onCleanup(() => {
    cleanups++;
  });
});

setCount(1);
console.assert(cleanups === 1);
```

---

## Integration Test

Build a complete example using all features:

```javascript
// Shopping cart example
const [items, setItems] = createSignal([]);

const itemCount = createMemo(() => {
  console.log('Computing item count');
  return items().length;
});

const total = createMemo(() => {
  console.log('Computing total');
  return items().reduce((sum, item) => sum + item.price, 0);
});

createEffect(() => {
  console.log(`Cart: ${itemCount()} items, $${total()}`);
});

// Add items in batch
batch(() => {
  setItems([...items(), { name: 'Apple', price: 1.99 }]);
  setItems([...items(), { name: 'Banana', price: 0.99 }]);
});

// Should only compute once and log:
// "Computing item count"
// "Computing total"
// "Cart: 2 items, $2.98"
```

---

## Reflection Questions

After completing the exercise, answer these questions:

1. **Why do we need cleanup between effect runs?**
   
   <details>
   <summary>Answer</summary>
   Without cleanup, each effect run would add new subscriptions without removing old ones, causing the effect to run multiple times per signal change and eventually causing memory leaks.
   </details>

2. **How does batching improve performance?**
   
   <details>
   <summary>Answer</summary>
   Batching allows multiple signal updates to queue their effects, then runs each effect only once after all updates complete. This prevents redundant effect executions when multiple dependencies change together.
   </details>

3. **What's the difference between a signal and a memo?**
   
   <details>
   <summary>Answer</summary>
   Signals store values directly, while memos compute and cache values based on other reactive dependencies. Memos only recompute when their dependencies change, making them efficient for derived state.
   </details>

4. **Why use a Set for subscribers instead of an Array?**
   
   <details>
   <summary>Answer</summary>
   Sets automatically prevent duplicate subscriptions and provide O(1) add/delete operations, making subscription management more efficient.
   </details>

---

## Next Steps

After completing this exercise:

1. ✅ Compare your implementation to the provided solutions
2. ✅ Review any parts you found challenging
3. ✅ Complete the bonus challenges
4. ✅ Build the integration test
5. ✅ Move on to Exercise 2: Building Reactive UI Components

---

## Resources

- [Lesson 3: Building Your First Signal](../lessons/lesson-03-building-first-signal.md)
- [Observer Pattern Deep Dive](../notes/observer-pattern.md)
- [Solid.js Source Code](https://github.com/solidjs/solid/blob/main/packages/solid/src/reactive/signal.ts)

---

**Remember:** Don't peek at solutions until you've made a genuine attempt! The struggle is where the learning happens. 💪
