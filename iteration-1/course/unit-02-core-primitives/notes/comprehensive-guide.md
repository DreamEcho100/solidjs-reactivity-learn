# Unit 2: Core Primitives - Study Notes

## Quick Reference Guide

### Signal Operations

```typescript
// Basic signal
const [value, setValue] = createSignal(initialValue);

// With options
const [value, setValue] = createSignal(initialValue, {
  equals: (a, b) => a === b,  // Custom comparator
  name: "mySignal"             // Debug name
});

// Reading (tracks dependency)
const current = value();

// Writing
setValue(newValue);
setValue(prev => prev + 1);  // Updater function
```

### Effect Types

```typescript
// createEffect - runs after render, async
createEffect(() => {
  console.log(signal());
});

// createComputed - runs immediately, sync
createComputed(() => {
  console.log(signal());
});

// createRenderEffect - runs during render phase
createRenderEffect(() => {
  console.log(signal());
});
```

### Memos

```typescript
// Basic memo
const doubled = createMemo(() => count() * 2);

// With custom equality
const filtered = createMemo(
  () => items().filter(x => x > 0),
  [],
  { equals: (a, b) => a.length === b.length }
);
```

### Lifecycle

```typescript
// Cleanup
createEffect(() => {
  const timer = setInterval(() => {...}, 1000);
  onCleanup(() => clearInterval(timer));
});

// Root (manual lifetime)
const dispose = createRoot((dispose) => {
  // Create effects, signals, etc.
  return dispose;
});

// Call dispose() to clean up
dispose();
```

### Tracking Control

```typescript
// Untrack - read without dependency
const value = untrack(() => signal());

// Batch - defer updates
batch(() => {
  setA(1);
  setB(2);
  setC(3);
});

// On - explicit dependencies
createEffect(on(signal, (value) => {
  console.log(value);
}));
```

---

## Mental Models

### Model 1: Signal as a Cell

Think of a signal as a spreadsheet cell:
- It holds a value
- Other cells can reference it (dependencies)
- When it changes, dependent cells recalculate
- No manual coordination needed

```
┌─────────┐
│  A1: 5  │ ← Signal
└─────────┘
     ↓
┌─────────┐
│ B1: =A1 │ ← Derived (Memo)
│     5   │
└─────────┘
     ↓
┌──────────┐
│ C1: =B1  │ ← Dependent (Effect)
│     5    │
└──────────┘
```

Change A1 → B1 recalculates → C1 recalculates

### Model 2: Signal as Observable

```typescript
// Pseudo-code visualization

class Signal<T> {
  private _value: T;
  private _observers: Set<Function>;
  
  get value() {
    // If someone is listening, track them
    if (currentListener) {
      this._observers.add(currentListener);
    }
    return this._value;
  }
  
  set value(newValue: T) {
    if (newValue !== this._value) {
      this._value = newValue;
      // Notify all observers
      this._observers.forEach(fn => fn());
    }
  }
}
```

### Model 3: Reactive Graph

```
         ┌──────────┐
         │ Signal A │
         └──────────┘
              │
      ┌───────┴───────┐
      ↓               ↓
┌──────────┐    ┌──────────┐
│  Memo B  │    │ Effect C │
└──────────┘    └──────────┘
      │
      ↓
┌──────────┐
│ Effect D │
└──────────┘

Update A:
1. Mark B, C as stale
2. Update B (it's a memo)
3. Mark D as stale
4. Update C
5. Update D
```

---

## Common Patterns

### Pattern 1: Derived State

```typescript
// Base state
const [firstName, setFirstName] = createSignal("John");
const [lastName, setLastName] = createSignal("Doe");

// Derived state
const fullName = createMemo(() => 
  `${firstName()} ${lastName()}`
);
```

**When to use:** When you have computed values based on multiple signals.

### Pattern 2: Async Effects

```typescript
const [userId, setUserId] = createSignal(null);
const [userData, setUserData] = createSignal(null);

createEffect(() => {
  const id = userId();
  if (!id) return;
  
  fetch(`/api/users/${id}`)
    .then(r => r.json())
    .then(data => setUserData(data));
});
```

**When to use:** For side effects that involve async operations.

### Pattern 3: Resource Cleanup

```typescript
createEffect(() => {
  const ws = new WebSocket(url());
  
  ws.onmessage = (e) => {
    setData(JSON.parse(e.data));
  };
  
  onCleanup(() => {
    ws.close();
  });
});
```

**When to use:** Managing resources that need cleanup (connections, timers, etc).

### Pattern 4: Conditional Tracking

```typescript
const [mode, setMode] = createSignal("view");
const [editData, setEditData] = createSignal(null);
const [viewData, setViewData] = createSignal(null);

createEffect(() => {
  if (mode() === "edit") {
    console.log("Edit data:", editData());
  } else {
    console.log("View data:", viewData());
  }
});
```

**When to use:** When dependencies change based on conditions.

### Pattern 5: One-Time Read

```typescript
createEffect(() => {
  // Read id once (doesn't track)
  const id = untrack(() => props.id);
  
  // Track changes to filter
  const filter = props.filter();
  
  // Fetch data with initial id but react to filter changes
  fetchData(id, filter);
});
```

**When to use:** When you want to read a value without creating a dependency.

---

## Performance Tips

### Tip 1: Memo vs. Inline Computation

❌ **Bad:** Expensive computation in multiple effects
```typescript
createEffect(() => {
  const result = expensiveCompute(data());
  updateUI(result);
});

createEffect(() => {
  const result = expensiveCompute(data());
  updateOtherUI(result);
});
// Computes twice!
```

✅ **Good:** Use memo for shared computation
```typescript
const result = createMemo(() => expensiveCompute(data()));

createEffect(() => updateUI(result()));
createEffect(() => updateOtherUI(result()));
// Computes once!
```

### Tip 2: Batch Related Updates

❌ **Bad:** Multiple signal updates
```typescript
setX(1);
setY(2);
setZ(3);
// Triggers dependents 3 times
```

✅ **Good:** Batch updates
```typescript
batch(() => {
  setX(1);
  setY(2);
  setZ(3);
});
// Triggers dependents once
```

### Tip 3: Avoid Unnecessary Memos

❌ **Bad:** Memo for trivial computation
```typescript
const doubled = createMemo(() => count() * 2);
// Adds overhead for simple operation
```

✅ **Good:** Inline for cheap operations
```typescript
createEffect(() => {
  const doubled = count() * 2;
  // No memo overhead
});
```

### Tip 4: Proper Cleanup

❌ **Bad:** Forgetting cleanup
```typescript
createEffect(() => {
  setInterval(() => {...}, 1000);
  // Memory leak! Timer never cleared
});
```

✅ **Good:** Always cleanup
```typescript
createEffect(() => {
  const timer = setInterval(() => {...}, 1000);
  onCleanup(() => clearInterval(timer));
});
```

---

## Common Pitfalls

### Pitfall 1: Reading Signals Outside Reactive Context

```typescript
const [count, setCount] = createSignal(0);

// ❌ Not reactive
const value = count();
console.log(value); // Always 0

// ✅ Reactive
createEffect(() => {
  const value = count();
  console.log(value); // Updates when count changes
});
```

### Pitfall 2: Infinite Loops

```typescript
const [count, setCount] = createSignal(0);

// ❌ Infinite loop!
createEffect(() => {
  setCount(count() + 1);
});

// ✅ Use untrack or conditions
createEffect(() => {
  if (count() < 10) {
    setCount(untrack(count) + 1);
  }
});
```

### Pitfall 3: Stale Closures

```typescript
const [count, setCount] = createSignal(0);

// ❌ Captures initial value
createEffect(() => {
  setTimeout(() => {
    console.log(count); // Not a function! Stale value
  }, 1000);
});

// ✅ Read inside timeout
createEffect(() => {
  setTimeout(() => {
    console.log(count()); // Always current
  }, 1000);
});
```

### Pitfall 4: Lost Ownership

```typescript
const [show, setShow] = createSignal(true);

// ❌ Effects created outside owner context leak
if (show()) {
  createEffect(() => {
    // This effect never gets cleaned up!
  });
}

// ✅ Create effects in reactive context
createEffect(() => {
  if (show()) {
    createEffect(() => {
      // This gets cleaned up when show() becomes false
    });
  }
});
```

---

## Debugging Tips

### Tip 1: Name Your Signals

```typescript
const [count, setCount] = createSignal(0, { 
  name: "counterState" 
});

const doubled = createMemo(() => count() * 2, undefined, { 
  name: "doubledValue" 
});
```

Shows up in DevTools for easier debugging.

### Tip 2: Track Effect Runs

```typescript
let runCount = 0;

createEffect(() => {
  runCount++;
  console.log("Effect run #", runCount);
  console.log("Dependencies:", a(), b(), c());
});
```

### Tip 3: Visualize Dependency Graph

```typescript
function logDependencies(name: string, fn: () => void) {
  createEffect(() => {
    console.log(`[${name}] Running`);
    fn();
  });
}

logDependencies("Effect A", () => console.log(signalA()));
logDependencies("Effect B", () => console.log(signalB()));
```

---

## Testing Strategies

### Strategy 1: Test Signal Values

```typescript
test("signal updates", () => {
  const [count, setCount] = createSignal(0);
  
  expect(count()).toBe(0);
  setCount(5);
  expect(count()).toBe(5);
  setCount(c => c + 1);
  expect(count()).toBe(6);
});
```

### Strategy 2: Test Effect Execution

```typescript
test("effect runs on dependency change", () => {
  const [count, setCount] = createSignal(0);
  const results: number[] = [];
  
  createEffect(() => {
    results.push(count());
  });
  
  expect(results).toEqual([0]); // Initial run
  
  setCount(1);
  expect(results).toEqual([0, 1]);
  
  setCount(2);
  expect(results).toEqual([0, 1, 2]);
});
```

### Strategy 3: Test Cleanup

```typescript
test("cleanup runs on disposal", () => {
  let cleanupCalled = false;
  
  const dispose = createRoot((dispose) => {
    createEffect(() => {
      onCleanup(() => {
        cleanupCalled = true;
      });
    });
    return dispose;
  });
  
  expect(cleanupCalled).toBe(false);
  dispose();
  expect(cleanupCalled).toBe(true);
});
```

---

## Advanced Concepts

### Concept 1: The Global Listener

Solid uses a global `Listener` variable to track which computation is currently running. When a signal is read:

1. Check if `Listener` is set
2. If yes, add `Listener` to the signal's observers
3. Add signal to `Listener`'s sources

This automatic tracking is what makes Solid's reactivity "magical".

### Concept 2: The Two-Phase Update

When a signal changes:

**Phase 1: Marking**
- Mark all observers as STALE
- Recursively mark their observers as PENDING
- Collect all affected computations

**Phase 2: Execution**
- Sort by topological order (timestamp)
- Run Updates queue (memos/computeds)
- Run Effects queue (side effects)

This prevents the "diamond problem" where a computation runs multiple times.

### Concept 3: Slot-Based Indexing

Instead of searching arrays, Solid uses bidirectional slot indices:

```typescript
// Signal A has observers [B, C, D]
signal.observers = [B, C, D];
signal.observerSlots = [0, 1, 2];

// Computation B has sources [A, X, Y]
computation.sources = [A, X, Y];
computation.sourceSlots = [0, 3, 1]; // Indices in each source's observers array
```

Unsubscribing is O(1): Swap with last element, update slots, pop.

---

## Key Takeaways

1. **Signals are reactive primitives** - They notify dependents automatically
2. **Effects are for side effects** - Use for DOM updates, API calls, logging
3. **Memos are for derived values** - Cache expensive computations
4. **Ownership manages lifecycle** - No manual cleanup in most cases
5. **Untrack escapes reactivity** - Use for one-time reads
6. **Batch optimizes updates** - Group related changes
7. **The graph is dynamic** - Dependencies change based on code paths

---

## Next Steps

After mastering core primitives:
- **Unit 3:** Advanced patterns (selectors, resources, context)
- **Unit 4:** Scheduling and batching internals
- **Unit 5:** Transitions and concurrent mode

---

## Further Reading

- [SolidJS Reactivity Docs](https://docs.solidjs.com/concepts/reactivity)
- [Fine-Grained Reactivity](https://dev.to/ryansolid/a-hands-on-introduction-to-fine-grained-reactivity-3ndf)
- [Building a Reactive Library](https://dev.to/ryansolid/building-a-reactive-library-from-scratch-1i0p)
