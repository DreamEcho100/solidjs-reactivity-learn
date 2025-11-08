# Lesson 3: Batching and Updates

## Overview

In this lesson, we'll explore how Solid.js batches multiple state updates together to optimize performance and maintain consistency. Understanding batching is crucial for building efficient reactive applications that avoid unnecessary re-computations and render cycles.

## Core Concepts

### The Problem: Cascading Updates

Consider this scenario:

```javascript
const [firstName, setFirstName] = createSignal("John");
const [lastName, setLastName] = createSignal("Doe");

createEffect(() => {
  console.log(`Full name: ${firstName()} ${lastName()}`);
});

// Problem: This triggers the effect twice!
setFirstName("Jane");
setLastName("Smith");
```

Without batching, the effect runs twice:
1. After `setFirstName("Jane")` → logs "Jane Doe"
2. After `setLastName("Smith")` → logs "Jane Smith"

**Batching solves this** by deferring effect execution until all updates complete, running the effect only once with the final values.

---

## The `batch()` Function

### Purpose

The `batch()` function groups multiple signal updates into a single reactive transaction, ensuring:
- **Consistency**: Computations see all updates at once
- **Performance**: Effects run only once per batch
- **Atomicity**: Updates appear to happen simultaneously

### Implementation

```typescript
/**
 * Batches multiple updates together
 * All updates within the callback are applied atomically
 */
export function batch<T>(fn: () => T): T {
  if (Pending) return fn(); // Already batching
  
  let result: T;
  const prevPending = Pending;
  Pending = true; // Mark that we're batching
  
  try {
    result = fn();
  } finally {
    Pending = prevPending;
    runUpdates(); // Execute all pending computations
  }
  
  return result;
}
```

### Key Mechanisms

1. **Pending Flag**: Prevents nested batches from prematurely executing
2. **Deferred Execution**: Updates are marked but not executed
3. **Single Flush**: All computations run once at the end

### Example Usage

```javascript
// Without batch: effect runs 3 times
const [x, setX] = createSignal(0);
const [y, setY] = createSignal(0);
const [z, setZ] = createSignal(0);

createEffect(() => {
  console.log(`Sum: ${x() + y() + z()}`);
});

setX(1);  // Effect runs → "Sum: 1"
setY(2);  // Effect runs → "Sum: 3"
setZ(3);  // Effect runs → "Sum: 6"

// With batch: effect runs once
batch(() => {
  setX(1);
  setY(2);
  setZ(3);
}); // Effect runs once → "Sum: 6"
```

---

## The `runUpdates()` Function

### Architecture

`runUpdates()` is the core update execution engine that processes all pending computations:

```typescript
/**
 * Executes all pending computations in the update queue
 * Handles priorities, dependencies, and disposal
 */
function runUpdates<T>(fn?: () => T, init?: boolean): T | undefined {
  if (Running) {
    // Prevent re-entrance during updates
    if (fn) fn();
    return;
  }
  
  Running = true;
  
  try {
    if (fn) {
      // Initialize mode: run function directly
      return fn();
    }
    
    // Process updates in priority order
    while (Updates.length > 0) {
      const computation = Updates.shift()!;
      
      if (computation.state !== STALE) continue;
      
      updateComputation(computation);
    }
  } finally {
    Pending = false;
    Running = false;
  }
}
```

### Update Flow

1. **Guard Against Re-entrance**: Prevents infinite loops
2. **Process Queue**: Execute computations in order
3. **Skip Non-stale**: Only update what needs updating
4. **Clean State**: Reset flags after completion

---

## Update Queue Management

### The Updates Queue

```typescript
// Global queue of computations waiting to execute
const Updates: Computation<any>[] = [];

/**
 * Adds a computation to the update queue
 */
function queueUpdate(computation: Computation<any>) {
  if (!Updates.includes(computation)) {
    Updates.push(computation);
  }
}
```

### Priority Ordering

Computations are queued based on their importance:

1. **Render Effects** (highest priority) - UI updates
2. **User Effects** - Application logic
3. **Deferred Computations** - Low priority work

```typescript
function queueUpdate(computation: Computation<any>) {
  // Insert based on priority
  const priority = computation.priority || 0;
  
  let insertIndex = Updates.length;
  for (let i = 0; i < Updates.length; i++) {
    if ((Updates[i].priority || 0) < priority) {
      insertIndex = i;
      break;
    }
  }
  
  Updates.splice(insertIndex, 0, computation);
}
```

---

## ExecCount and Versioning

### Purpose

`ExecCount` tracks the current update cycle, helping detect stale computations:

```typescript
// Global version counter
let ExecCount = 0;

/**
 * Each signal update increments the version
 */
function writeSignal(signal: SignalState<any>, value: any) {
  if (signal.value === value) return;
  
  signal.value = value;
  
  if (signal.observers) {
    ExecCount++; // Increment global version
    
    for (let i = 0; i < signal.observers.length; i++) {
      const observer = signal.observers[i];
      observer.state = STALE;
      observer.version = ExecCount; // Mark with current version
      queueUpdate(observer);
    }
  }
}
```

### Version Checking

```typescript
/**
 * Check if a computation needs to run based on versions
 */
function needsUpdate(computation: Computation<any>): boolean {
  // If computation version matches current ExecCount,
  // it's already up to date
  return computation.version !== ExecCount;
}
```

### Benefits

1. **Skip Redundant Work**: Avoid re-computing already fresh values
2. **Track Dependencies**: Know which update cycle created a computation
3. **Prevent Loops**: Detect circular dependencies

---

## Preventing Unnecessary Re-renders

### Equality Checking

Signals can use custom equality functions:

```typescript
interface SignalOptions<T> {
  equals?: false | ((prev: T, next: T) => boolean);
}

function createSignal<T>(
  initialValue: T,
  options?: SignalOptions<T>
): [get: () => T, set: (v: T) => void] {
  const equals = options?.equals !== false
    ? options?.equals || ((a, b) => a === b)
    : () => false;
  
  const signal: SignalState<T> = {
    value: initialValue,
    observers: null,
    observerSlots: null
  };
  
  const write = (nextValue: T) => {
    // Skip update if values are equal
    if (equals(signal.value, nextValue)) {
      return;
    }
    
    writeSignal(signal, nextValue);
  };
  
  return [read.bind(signal), write];
}
```

### Memo Optimization

Memos cache results and only recompute when dependencies change:

```typescript
function createMemo<T>(fn: () => T, initialValue?: T, options?: MemoOptions<T>) {
  const memo: Computation<T> = {
    fn,
    state: STALE,
    value: initialValue!,
    sources: null,
    sourceSlots: null,
    observers: null,
    observerSlots: null,
    pure: true // Memos are pure
  };
  
  const read = () => {
    // If already fresh, return cached value
    if (memo.state === 0) {
      return memo.value;
    }
    
    // Otherwise, recompute
    if (memo.state === STALE) {
      updateComputation(memo);
    }
    
    return memo.value;
  };
  
  return read;
}
```

---

## Advanced Batching Patterns

### Nested Batching

```javascript
batch(() => {
  setX(1);
  
  batch(() => {
    setY(2); // Inner batch
    setZ(3);
  });
  
  setW(4);
}); // All updates execute here
```

Inner batches are effectively no-ops since the outer batch controls execution.

### Async Batching

```javascript
// Problem: Updates happen across async boundaries
async function loadData() {
  const data = await fetchData();
  setLoading(false);  // Effect runs
  setData(data);      // Effect runs again
}

// Solution: Wrap in batch
async function loadData() {
  const data = await fetchData();
  
  batch(() => {
    setLoading(false);
    setData(data);
  }); // Effect runs once
}
```

### Conditional Batching

```javascript
function updateMultiple(shouldBatch: boolean, updates: Array<() => void>) {
  if (shouldBatch) {
    batch(() => {
      updates.forEach(fn => fn());
    });
  } else {
    updates.forEach(fn => fn());
  }
}
```

---

## Update Propagation Algorithm

### Complete Flow

1. **Signal Write**
   ```typescript
   setSignal(newValue)
   ```

2. **Mark Dependents**
   ```typescript
   // Mark all observers as stale
   signal.observers.forEach(observer => {
     observer.state = STALE;
     queueUpdate(observer);
   });
   ```

3. **Queue Processing**
   ```typescript
   if (!Pending) {
     runUpdates(); // Execute immediately
   }
   // Otherwise, wait for batch to complete
   ```

4. **Execution**
   ```typescript
   Updates.forEach(computation => {
     if (computation.state === STALE) {
       updateComputation(computation);
     }
   });
   ```

5. **Propagate Further**
   ```typescript
   // If computation has observers, mark them stale
   if (computation.observers) {
     computation.observers.forEach(observer => {
       observer.state = STALE;
       queueUpdate(observer);
     });
   }
   ```

### Topological Ordering

Updates naturally follow dependency order:

```
Signal A
   ↓
Memo B = () => A() * 2
   ↓
Effect C = () => console.log(B())
```

When A updates:
1. A marks B as stale
2. B marks C as stale
3. Queue: [B, C]
4. Execute B first (computes new value)
5. Execute C second (sees B's new value)

---

## Performance Considerations

### Batch Early, Batch Often

```javascript
// ❌ Bad: Many small updates
function updateUser(user) {
  setFirstName(user.firstName);
  setLastName(user.lastName);
  setEmail(user.email);
  setAge(user.age);
}

// ✅ Good: Single batch
function updateUser(user) {
  batch(() => {
    setFirstName(user.firstName);
    setLastName(user.lastName);
    setEmail(user.email);
    setAge(user.age);
  });
}
```

### Measure Impact

```javascript
function measureBatchImpact() {
  const [a, setA] = createSignal(0);
  const [b, setB] = createSignal(0);
  
  let effectRuns = 0;
  createEffect(() => {
    a() + b();
    effectRuns++;
  });
  
  // Without batch
  effectRuns = 0;
  setA(1);
  setB(2);
  console.log(`Without batch: ${effectRuns} runs`); // 2
  
  // With batch
  effectRuns = 0;
  batch(() => {
    setA(3);
    setB(4);
  });
  console.log(`With batch: ${effectRuns} runs`); // 1
}
```

### Avoid Over-batching

```javascript
// ❌ Bad: Batching user interactions
button.onclick = () => {
  batch(() => {
    handleClick(); // This might take a while
  });
  // UI feels sluggish
};

// ✅ Good: Only batch related updates
button.onclick = () => {
  handleClick();
  
  batch(() => {
    setAnalytics();
    setMetrics();
  });
};
```

---

## Common Pitfalls

### 1. Forgetting to Batch

```javascript
// Problem: Effect runs 10 times
for (let i = 0; i < 10; i++) {
  setValue(i);
}

// Solution
batch(() => {
  for (let i = 0; i < 10; i++) {
    setValue(i);
  }
});
```

### 2. Batching Too Late

```javascript
// ❌ Too late: Effects already ran
setX(1);  // Effect runs
setY(2);  // Effect runs

batch(() => {
  setZ(3); // Only this is batched
});

// ✅ Batch all together
batch(() => {
  setX(1);
  setY(2);
  setZ(3);
});
```

### 3. Assuming Synchronous Execution

```javascript
// ❌ Wrong assumption
batch(() => {
  setValue(10);
});
console.log(getValue()); // Might not be 10 yet!

// ✅ Correct: Value is available after batch
batch(() => {
  setValue(10);
});
// Now getValue() === 10 (batch is synchronous)
```

---

## Real-World Examples

### Form Validation

```javascript
function validateAndSubmit(formData) {
  batch(() => {
    setValidating(true);
    setErrors(null);
    
    const errors = validate(formData);
    
    if (errors) {
      setErrors(errors);
      setValidating(false);
    } else {
      setSubmitting(true);
      submitForm(formData);
    }
  });
}
```

### Data Synchronization

```javascript
function syncData(serverData) {
  batch(() => {
    setUsers(serverData.users);
    setPosts(serverData.posts);
    setComments(serverData.comments);
    setLastSync(Date.now());
  });
  // All derived computations run once
}
```

### Animation Frames

```javascript
function animate() {
  requestAnimationFrame(() => {
    batch(() => {
      setX(calculateX());
      setY(calculateY());
      setRotation(calculateRotation());
    });
    animate();
  });
}
```

---

## Testing Batching Behavior

```typescript
import { createSignal, createEffect, batch } from 'solid-js';

describe('Batching', () => {
  test('batch defers effect execution', () => {
    const [value, setValue] = createSignal(0);
    let runs = 0;
    
    createEffect(() => {
      value();
      runs++;
    });
    
    runs = 0; // Reset after initial run
    
    batch(() => {
      setValue(1);
      setValue(2);
      setValue(3);
      expect(runs).toBe(0); // Not run yet
    });
    
    expect(runs).toBe(1); // Ran once after batch
  });
  
  test('nested batches work correctly', () => {
    const [value, setValue] = createSignal(0);
    let runs = 0;
    
    createEffect(() => {
      value();
      runs++;
    });
    
    runs = 0;
    
    batch(() => {
      setValue(1);
      batch(() => {
        setValue(2);
      });
      setValue(3);
    });
    
    expect(runs).toBe(1);
  });
});
```

---

## Summary

**Key Takeaways:**

1. **Batching** groups multiple updates into a single reactive transaction
2. **batch()** function controls when effects execute
3. **runUpdates()** processes the update queue in order
4. **ExecCount** tracks update cycles and prevents redundant work
5. **Equality checking** skips unnecessary updates
6. **Always batch related updates** for better performance
7. **Understand the update propagation flow** for debugging

**Next Steps:**
- Practice implementing batching in your own reactive system
- Measure the performance impact in real applications
- Explore advanced scheduling patterns in the next unit

---

## Further Reading

- Solid.js source: `packages/solid/src/reactive/signal.ts`
- React's batching: `unstable_batchedUpdates`
- Vue's `nextTick` mechanism
- Svelte's update scheduling
