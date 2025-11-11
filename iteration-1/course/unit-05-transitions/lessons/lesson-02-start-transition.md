# Lesson 2: startTransition Deep Dive

## Introduction

Now that we understand the TransitionState structure, let's implement `startTransition` from scratch. This lesson breaks down every step of how Solid.js creates, manages, and commits transitions.

## The Complete startTransition Function

Here's the full implementation from Solid.js with detailed annotations:

```typescript
export function startTransition(fn: () => unknown): Promise<void> {
  // (1) Check if already in a running transition
  if (Transition && Transition.running) {
    fn();  // Just execute within existing transition
    return Transition.done!;  // Return existing promise
  }
  
  // (2) Capture current reactive context
  const l = Listener;   // Current computation listening for dependencies
  const o = Owner;      // Current owner (for cleanup)
  
  // (3) Defer execution to next microtask
  return Promise.resolve().then(() => {
    // (4) Restore context (microtask cleared it)
    Listener = l;
    Owner = o;
    
    let t: TransitionState | undefined;
    
    // (5) Create or reuse transition state
    if (Scheduler || SuspenseContext) {
      t = Transition || (Transition = {
        sources: new Set(),
        effects: [],
        promises: new Set(),
        disposed: new Set(),
        queue: new Set(),
        running: true
      });
      
      // (6) Setup done promise if needed
      t.done || (t.done = new Promise(res => (t!.resolve = res)));
      t.running = true;
    }
    
    // (7) Execute updates within transition context
    runUpdates(fn, false);
    
    // (8) Clear context
    Listener = Owner = null;
    
    // (9) Return promise that resolves when transition commits
    return t ? t.done : undefined;
  });
}
```

Let's break down each step in detail.

## Step 1: Nested Transition Detection

```typescript
if (Transition && Transition.running) {
  fn();
  return Transition.done!;
}
```

### Why This Matters

```javascript
startTransition(() => {
  setA(1);
  
  startTransition(() => {  // Nested!
    setB(2);
  });
  
  setC(3);
});
```

**Without nested detection:**
- Creates two separate transitions
- `setB` might commit before `setA` and `setC`
- Inconsistent state visible to users

**With nested detection:**
- All updates belong to outer transition
- Atomic commit of all changes
- Consistent state guarantee

### Implementation Details

```javascript
// Global transition reference
let Transition = null;

function startTransition(fn) {
  if (Transition && Transition.running) {
    // We're inside a transition that's actively updating
    fn();  // Execute immediately in current context
    return Transition.done;  // Return outer promise
  }
  
  // Not in a running transition, create new one
  // ...
}
```

## Step 2: Context Capture

```typescript
const l = Listener;
const o = Owner;
```

### Understanding Reactive Context

**Listener**: The computation currently tracking dependencies
**Owner**: The owner responsible for cleanup

```javascript
createEffect(() => {
  // Listener = this effect computation
  // Owner = this effect's owner
  
  startTransition(() => {
    // Listener will be cleared
    // Need to restore it!
  });
});
```

### Why Capture?

```javascript
// Before capture
createEffect(() => {
  console.log('Owner:', Owner);     // Effect's owner
  console.log('Listener:', Listener); // Effect itself
  
  startTransition(() => {
    // Runs in microtask - context cleared!
    console.log('Owner:', Owner);     // null ❌
    console.log('Listener:', Listener); // null ❌
  });
});

// After capture
createEffect(() => {
  const savedOwner = Owner;
  const savedListener = Listener;
  
  startTransition(() => {
    Owner = savedOwner;       // Restored ✅
    Listener = savedListener; // Restored ✅
  });
});
```

## Step 3: Microtask Deferral

```typescript
return Promise.resolve().then(() => {
  // ...
});
```

### Why Defer to Microtask?

**Batching**: Collects multiple transition starts

```javascript
// Without microtask
startTransition(() => setA(1));
startTransition(() => setB(2));
startTransition(() => setC(3));
// → 3 separate transitions

// With microtask
startTransition(() => setA(1));
startTransition(() => setB(2));
startTransition(() => setC(3));
// All queued in same microtask
// → 1 combined transition
```

**Browser Integration**: Aligns with React's scheduler

```javascript
// Microtask queue (highest priority)
Promise.resolve().then(() => {
  // Transition updates run here
  // Before browser paint
});

// Task queue (lower priority)
setTimeout(() => {
  // Regular setTimeout
  // After browser paint
}, 0);
```

### Execution Order Example

```javascript
console.log('1: Sync');

startTransition(() => {
  console.log('3: Transition');
});

console.log('2: Sync');

// Output:
// 1: Sync
// 2: Sync
// 3: Transition (in microtask)
```

## Step 4: Context Restoration

```typescript
Listener = l;
Owner = o;
```

### The Problem

```javascript
let Owner = null;
let Listener = null;

createEffect(() => {
  Owner = effectOwner;
  Listener = effectComputation;
  
  const promise = Promise.resolve().then(() => {
    // Owner === null (Promise cleared it)
    // Listener === null (Promise cleared it)
  });
});
```

### The Solution

```javascript
createEffect(() => {
  const savedOwner = Owner;
  const savedListener = Listener;
  
  const promise = Promise.resolve().then(() => {
    Owner = savedOwner;       // Restore!
    Listener = savedListener; // Restore!
    
    // Now signals can track properly
  });
});
```

### Why This Is Critical

```javascript
const [count, setCount] = createSignal(0);

createEffect(() => {
  // This effect should track count
  
  startTransition(() => {
    console.log(count());  // Must track!
    // Without context restoration, this wouldn't track
  });
});
```

## Step 5: TransitionState Creation

```typescript
if (Scheduler || SuspenseContext) {
  t = Transition || (Transition = {
    sources: new Set(),
    effects: [],
    promises: new Set(),
    disposed: new Set(),
    queue: new Set(),
    running: true
  });
}
```

### Conditional Creation

**Why the condition?**

```javascript
// Transitions only enabled if:
// 1. Custom scheduler registered, OR
// 2. Suspense context exists

enableScheduling(requestIdleCallback);  // Now transitions work
// OR
<Suspense>  // Now transitions work
  <Component />
</Suspense>
```

**Without scheduler or suspense:**
```javascript
startTransition(() => {
  setCount(5);
});
// Acts like regular update (no double buffering)
```

### Reusing Existing Transition

```javascript
// First call
startTransition(() => setA(1));
// Creates: Transition = { sources: Set(), ... }

// Second call (before first commits)
startTransition(() => setB(2));
// Reuses: Same Transition object
// Both updates committed together
```

## Step 6: Promise Setup

```typescript
t.done || (t.done = new Promise(res => (t!.resolve = res)));
t.running = true;
```

### The Done Promise

Provides a way to await transition completion:

```javascript
const transition = startTransition(() => {
  setData(expensiveComputation());
});

console.log('Started...');
await transition;
console.log('Committed!');
```

### Promise Creation Pattern

```javascript
let resolve;
const promise = new Promise(res => {
  resolve = res;  // Capture resolver
});

// Later...
resolve();  // Resolve from outside
```

### Running Flag Management

```javascript
Transition.running = true;   // During updateComputation calls
Transition.running = false;  // While waiting for promises

// Reading signals:
if (Transition.running && Transition.sources.has(signal)) {
  return signal.tValue;  // Read transition value
}
return signal.value;  // Read committed value
```

## Step 7: Executing Updates

```typescript
runUpdates(fn, false);
```

### What runUpdates Does

```javascript
function runUpdates(fn, init) {
  if (Updates) return fn();  // Already updating
  
  let wait = false;
  if (!init) Updates = [];   // Start collecting updates
  
  if (Effects) wait = true;
  else Effects = [];         // Start collecting effects
  
  ExecCount++;               // Increment version
  
  try {
    const res = fn();        // Execute user function
    completeUpdates(wait);   // Process queues
    return res;
  } catch (err) {
    handleError(err);
  }
}
```

### During Transition Updates

```javascript
startTransition(() => {
  setA(1);  // writeSignal called
  setB(2);  // writeSignal called
  setC(3);  // writeSignal called
});

// Inside runUpdates:
// - All three signals added to Transition.sources
// - tValue set for each
// - Effects deferred to Transition.effects
```

### The False Parameter

```javascript
runUpdates(fn, false);
//              ↑
//              init = false
```

**init = false** means:
- Create new Updates array
- Don't reuse existing update queue
- This is a fresh update cycle

## Step 8: Clearing Context

```typescript
Listener = Owner = null;
```

### Why Clear?

```javascript
startTransition(() => {
  setCount(5);
  
  // If we don't clear:
  // Listener still points to outer effect
  // Could cause tracking bugs
});

// After transition:
// Listener = null
// No stale references
```

### Preventing Accidental Tracking

```javascript
createEffect(() => {
  // Listener = this effect
  
  startTransition(() => {
    const value = signal();  // Tracks properly (context restored)
  });
  
  // Context cleared
  // Future operations don't accidentally track
});
```

## Step 9: Returning Promise

```typescript
return t ? t.done : undefined;
```

### Three Scenarios

**1. Transition enabled (Scheduler or Suspense)**
```javascript
enableScheduling();
const promise = startTransition(() => setData(x));
await promise;  // Waits for commit
```

**2. Transition disabled**
```javascript
const promise = startTransition(() => setData(x));
// promise === undefined
// Updates happened synchronously
```

**3. Nested transition**
```javascript
startTransition(() => {
  const promise = startTransition(() => setData(x));
  // promise === outer transition's promise
});
```

## Building a Simple Implementation

Let's implement a minimal `startTransition`:

```javascript
// Global state
let Transition = null;
let Listener = null;
let Owner = null;

function startTransition(fn) {
  // (1) Check nested
  if (Transition && Transition.running) {
    fn();
    return Transition.done;
  }
  
  // (2) Capture context
  const l = Listener;
  const o = Owner;
  
  // (3) Defer to microtask
  return Promise.resolve().then(() => {
    // (4) Restore context
    Listener = l;
    Owner = o;
    
    // (5) Create transition
    Transition = {
      sources: new Set(),
      effects: [],
      promises: new Set(),
      disposed: new Set(),
      queue: new Set(),
      running: true,
      done: null,
      resolve: null
    };
    
    // (6) Setup promise
    Transition.done = new Promise(res => {
      Transition.resolve = res;
    });
    
    // (7) Execute
    try {
      fn();
      
      // (8) Commit
      commitTransition();
    } catch (err) {
      console.error(err);
    }
    
    // (9) Clear context
    Listener = Owner = null;
    
    // (10) Return promise
    return Transition.done;
  });
}

function commitTransition() {
  const t = Transition;
  
  // Copy tValue to value for all sources
  for (const signal of t.sources) {
    signal.value = signal.tValue;
    delete signal.tValue;
  }
  
  // Run deferred effects
  for (const effect of t.effects) {
    effect();
  }
  
  // Resolve promise
  t.resolve();
  
  // Clear transition
  Transition = null;
}
```

## Handling Promises in Transitions

Transitions can contain async operations:

```javascript
startTransition(async () => {
  const data = await fetchData();  // Async!
  setResults(data);
});
```

### How Solid Handles This

```typescript
// In completeUpdates()
if (!Transition.promises.size && !Transition.queue.size) {
  // No pending promises - commit now
  commitTransition();
} else {
  // Has promises - wait
  Transition.running = false;  // Stop running
  // Promises will call completeUpdates again when resolved
}
```

### Promise Tracking

```javascript
function trackPromise(promise) {
  if (Transition && Transition.running) {
    Transition.promises.add(promise);
    
    promise.finally(() => {
      Transition.promises.delete(promise);
      // Check if ready to commit
      checkCommit();
    });
  }
}
```

## Transition State Machine

```
IDLE
  ↓
startTransition()
  ↓
RUNNING (running = true)
  ↓
  ├─ No promises → COMMIT
  │
  └─ Has promises → WAITING (running = false)
       ↓
       Promise resolves
       ↓
       └─ No more promises → COMMIT
            ↓
            IDLE
```

## Common Patterns

### Pattern 1: Simple Transition

```javascript
startTransition(() => {
  setState(newValue);
});
```

### Pattern 2: Async Transition

```javascript
startTransition(async () => {
  const data = await fetch('/api');
  setState(data);
});
```

### Pattern 3: Awaiting Transition

```javascript
await startTransition(() => {
  setState(newValue);
});
console.log('Committed!');
```

### Pattern 4: Multiple Updates

```javascript
startTransition(() => {
  setA(1);
  setB(2);
  setC(3);
  // All committed atomically
});
```

### Pattern 5: Nested Transitions (Flattened)

```javascript
startTransition(() => {
  setA(1);
  
  startTransition(() => {
    setB(2);  // Same transition
  });
  
  setC(3);  // All one transition
});
```

## Key Insights

1. **Microtask deferral enables batching**
   - Multiple starts can coalesce
   - Aligns with browser timing

2. **Context restoration is critical**
   - Async operations clear context
   - Must restore for proper tracking

3. **Nested transitions flatten automatically**
   - No separate commit for inner transitions
   - Guarantees atomicity

4. **Promises extend transition lifetime**
   - Transition waits for all promises
   - Ensures consistency

5. **Running flag controls read behavior**
   - `true`: Read tValue
   - `false`: Read value

## Practical Example

```javascript
// Search with transition
const [query, setQuery] = createSignal('');
const [results, setResults] = createSignal([]);

async function handleSearch(text) {
  setQuery(text);  // Immediate
  
  await startTransition(async () => {
    const data = await searchAPI(text);  // Promise tracked
    setResults(data);  // tValue set
  });
  
  // Committed - results visible
  console.log('Search complete!');
}
```

## Debugging Transitions

```javascript
// Add logging
function startTransition(fn) {
  console.log('START transition');
  
  return Promise.resolve().then(() => {
    console.log('RUNNING transition');
    
    Transition = { /* ... */ };
    fn();
    
    console.log('Sources:', Transition.sources.size);
    console.log('Promises:', Transition.promises.size);
    
    // ...commit...
    
    console.log('COMMITTED transition');
  });
}
```

## Exercise Preview

You'll implement:
1. Basic `startTransition` with double buffering
2. Promise tracking
3. Nested transition handling
4. Commit logic

## Summary

- `startTransition` defers to microtask for batching
- Context capture/restore ensures proper tracking
- Nested transitions flatten automatically
- Promises extend transition lifetime
- `running` flag controls read behavior
- Commit atomically updates all sources

## Next Lesson

**Lesson 3: useTransition Pattern** - Build the user-facing hook for managing transition state.

## References

- Solid.js source: `packages/solid/src/reactive/signal.ts` lines 1080-1150
- `completeUpdates`: lines 1300-1380
