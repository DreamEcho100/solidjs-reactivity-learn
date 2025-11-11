# Unit 3: Advanced Patterns - Study Notes

## Core Concepts

### 1. Computation States

Every computation (effect/memo) exists in one of three states:

```
CLEAN (0)   → No updates needed, value is current
STALE (1)   → Needs recomputation
PENDING (2) → Waiting for upstream dependencies
```

**State Transitions:**
```
CLEAN → STALE    (dependency changed)
STALE → PENDING  (checking upstream)
PENDING → CLEAN  (recomputed)
STALE → CLEAN    (recomputed)
```

### 2. The Diamond Problem

```
    Signal
    /    \
  Memo1  Memo2
    \    /
   Combined
```

**Problem:** When Signal changes, should Combined run once or twice?

**Solution:** Two-phase updates:
1. **Mark phase:** Mark all affected as STALE
2. **Execute phase:** Run in topological order

Combined only runs once because it waits for Memo1 and Memo2 to finish first.

### 3. Conditional Reactivity

Dependencies can change based on code paths:

```typescript
createEffect(() => {
  if (mode() === "edit") {
    console.log(editData());  // Only tracks in edit mode
  } else {
    console.log(viewData());  // Only tracks in view mode
  }
});
```

This is **dynamic dependency tracking** - the reactive graph changes at runtime.

---

## Advanced Patterns

### Pattern 1: createSelector for Lists

**Problem:** In a list, selecting an item causes all items to re-render.

```typescript
// ❌ Every item re-renders on selection change
const [selected, setSelected] = createSignal<string | null>(null);

<For each={items()}>
  {item => (
    <Item 
      active={selected() === item.id}  // All items track selected()
    />
  )}
</For>
```

**Solution:** Use createSelector

```typescript
// ✅ Only old and new selected items re-render
const isSelected = createSelector(selected);

<For each={items()}>
  {item => (
    <Item 
      active={isSelected(item.id)}  // Only subscribes to this specific id
    />
  )}
</For>
```

**How it works:**
```typescript
function createSelector<T>(source: Accessor<T>) {
  const subs = new Map<T, Set<Computation>>();
  
  // Watch for changes
  createMemo((prev) => {
    const value = source();
    
    // Notify only affected subscriptions
    for (const [key, subscribers] of subs) {
      if (key === value || key === prev) {
        // This key's state changed
        for (const comp of subscribers) {
          markStale(comp);
        }
      }
    }
    
    return value;
  });
  
  return (key: T) => {
    // Subscribe current computation to this specific key
    if (Listener) {
      if (!subs.has(key)) {
        subs.set(key, new Set());
      }
      subs.get(key)!.add(Listener);
    }
    
    return key === source();
  };
}
```

---

### Pattern 2: Deferred Computations

Sometimes you want to delay expensive computations:

#### A. createDeferred

```typescript
const [input, setInput] = createSignal("");
const deferred = createDeferred(input, { timeoutMs: 300 });

createEffect(() => {
  // Runs immediately
  console.log("Input:", input());
});

createEffect(() => {
  // Runs after 300ms of idle time
  console.log("Deferred:", deferred());
});
```

**Use case:** Debouncing search inputs, expensive filters.

**How it works:**
- Uses `requestCallback` from scheduler
- Waits for browser idle time
- Updates when no more pressing work

#### B. Custom Debounce

```typescript
function createDebouncedMemo<T>(
  fn: () => T,
  delay: number
): Accessor<T> {
  const [value, setValue] = createSignal<T>();
  let timeoutId: number;
  
  createEffect(() => {
    const newValue = fn();  // Track dependencies
    
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      setValue(() => newValue);
    }, delay);
    
    onCleanup(() => clearTimeout(timeoutId));
  });
  
  return value;
}
```

#### C. Custom Throttle

```typescript
function createThrottledMemo<T>(
  fn: () => T,
  interval: number
): Accessor<T> {
  const [value, setValue] = createSignal<T>(fn());
  let lastUpdate = 0;
  let pending: T | null = null;
  
  createEffect(() => {
    const newValue = fn();
    const now = Date.now();
    
    if (now - lastUpdate >= interval) {
      // Can update immediately
      setValue(() => newValue);
      lastUpdate = now;
      pending = null;
    } else {
      // Queue for later
      pending = newValue;
      
      const remaining = interval - (now - lastUpdate);
      setTimeout(() => {
        if (pending !== null) {
          setValue(() => pending!);
          lastUpdate = Date.now();
          pending = null;
        }
      }, remaining);
    }
  });
  
  return value;
}
```

---

### Pattern 3: On() for Explicit Dependencies

The `on()` utility gives fine control over what you track:

```typescript
// Track a and b, but not c
createEffect(
  on([a, b], ([aVal, bVal]) => {
    const cVal = untrack(c);  // Read without tracking
    console.log(aVal, bVal, cVal);
  })
);
```

**defer option:**
```typescript
// Don't run on initial mount
createEffect(
  on(signal, (value) => {
    console.log("Changed to:", value);
  }, { defer: true })
);
```

**Use cases:**
- Running effects only on specific dependency changes
- Skipping initial effect run
- Combining tracked and untracked reads

---

### Pattern 4: Reactive Resources Pattern

```typescript
interface Resource<T> {
  state: "unresolved" | "pending" | "ready" | "refreshing" | "errored";
  loading: boolean;
  error: Error | undefined;
  latest: T | undefined;
  (): T | undefined;
}
```

**Simplified implementation:**

```typescript
function createResource<T>(
  fetcher: () => Promise<T>
): [Resource<T>, { refetch: () => void }] {
  const [data, setData] = createSignal<T>();
  const [error, setError] = createSignal<Error>();
  const [loading, setLoading] = createSignal(false);
  
  async function load() {
    setLoading(true);
    setError(undefined);
    
    try {
      const result = await fetcher();
      setData(() => result);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }
  
  // Auto-fetch
  load();
  
  const resource = (() => data()) as Resource<T>;
  Object.defineProperties(resource, {
    state: {
      get() {
        if (error()) return "errored";
        if (loading()) return data() ? "refreshing" : "pending";
        if (data()) return "ready";
        return "unresolved";
      }
    },
    loading: { get: () => loading() },
    error: { get: () => error() },
    latest: { get: () => data() }
  });
  
  return [resource, { refetch: load }];
}
```

---

## Performance Optimization Patterns

### Optimization 1: Granular Updates with Selectors

```typescript
// ❌ Coarse: entire list re-renders
const [selected, setSelected] = createSignal<number>(0);
<For each={items}>
  {(item, i) => (
    <div class={selected() === i() ? 'active' : ''}>
      {item}
    </div>
  )}
</For>

// ✅ Fine: only old/new selected items re-render
const isSelected = createSelector(() => selected());
<For each={items}>
  {(item, i) => (
    <div class={isSelected(i()) ? 'active' : ''}>
      {item}
    </div>
  )}
</For>
```

### Optimization 2: Memo Splitting

```typescript
// ❌ One big memo recomputes everything
const state = createMemo(() => ({
  filtered: items().filter(condition()),
  sorted: items().sort(comparator()),
  paginated: items().slice(page() * pageSize, (page() + 1) * pageSize)
}));

// ✅ Separate memos recompute independently
const filtered = createMemo(() => items().filter(condition()));
const sorted = createMemo(() => filtered().sort(comparator()));
const paginated = createMemo(() => 
  sorted().slice(page() * pageSize, (page() + 1) * pageSize)
);
```

### Optimization 3: Lazy Evaluation

```typescript
// ❌ Always computes, even if not used
const expensive = createMemo(() => doExpensiveWork(data()));

createEffect(() => {
  if (showDetails()) {
    console.log(expensive());  // Only needed sometimes
  }
});

// ✅ Only computes when actually accessed
const expensive = createMemo(() => {
  if (!showDetails()) return undefined;  // Early exit
  return doExpensiveWork(data());
});
```

---

## Common Pitfalls

### Pitfall 1: Forgetting Deferred On

```typescript
// ❌ Runs immediately with undefined
createEffect(
  on(asyncData, (data) => {
    // data might be undefined on first run!
    processData(data);
  })
);

// ✅ Only runs when data actually changes
createEffect(
  on(asyncData, (data) => {
    processData(data);  // data is guaranteed to be defined
  }, { defer: true })
);
```

### Pitfall 2: Over-using Selectors

```typescript
// ❌ Selector overhead not worth it for small lists
const isSelected = createSelector(selected);
<For each={[1, 2, 3]}>  // Only 3 items!
  {item => <div class={isSelected(item) ? 'active' : ''}/>}
</For>

// ✅ Direct comparison is fine
<For each={[1, 2, 3]}>
  {item => <div class={selected() === item ? 'active' : ''}/>}
</For>
```

**Rule of thumb:** Use selectors when:
- List has > 20 items
- Selection changes frequently
- Items are expensive to render

### Pitfall 3: Deferred Timing Issues

```typescript
// ❌ Might miss rapid changes
const deferred = createDeferred(input, { timeoutMs: 1000 });

setInput("a");
await sleep(100);
setInput("b");
await sleep(100);
setInput("c");
// deferred() is still "a"!

// ✅ Use debounce for guaranteed latest value
const debounced = createDebouncedMemo(() => input(), 1000);
```

---

## Testing Patterns

### Test 1: Selector Behavior

```typescript
test("selector only notifies affected items", () => {
  const [selected, setSelected] = createSignal("a");
  const isSelected = createSelector(selected);
  
  const runCounts = { a: 0, b: 0, c: 0 };
  
  createEffect(() => {
    if (isSelected("a")) runCounts.a++;
  });
  
  createEffect(() => {
    if (isSelected("b")) runCounts.b++;
  });
  
  createEffect(() => {
    if (isSelected("c")) runCounts.c++;
  });
  
  // Initial: all run once
  expect(runCounts).toEqual({ a: 1, b: 1, c: 1 });
  
  // Select b: a and b should update
  setSelected("b");
  expect(runCounts).toEqual({ a: 2, b: 2, c: 1 });
  
  // Select c: b and c should update
  setSelected("c");
  expect(runCounts).toEqual({ a: 2, b: 3, c: 2 });
});
```

### Test 2: Deferred Updates

```typescript
test("deferred updates after idle time", async () => {
  const [input, setInput] = createSignal(0);
  const deferred = createDeferred(input, { timeoutMs: 100 });
  
  let updates = 0;
  createEffect(() => {
    deferred();
    updates++;
  });
  
  expect(updates).toBe(1);  // Initial
  
  setInput(1);
  expect(deferred()).toBe(0);  // Not updated yet
  
  await sleep(150);
  expect(deferred()).toBe(1);  // Updated after idle
  expect(updates).toBe(2);
});
```

---

## Best Practices

### ✅ DO

1. **Use selectors for large lists** with frequent selection changes
2. **Debounce expensive computations** like search filters
3. **Split complex memos** into smaller, focused ones
4. **Use on() for explicit control** over dependencies
5. **Defer effects** that don't need initial run

### ❌ DON'T

1. **Over-optimize** - measure before adding complexity
2. **Forget to untrack** unneeded dependencies in on()
3. **Nest too many memos** - creates deep dependency chains
4. **Use selectors everywhere** - they add overhead
5. **Defer everything** - some effects need immediate execution

---

## Quick Reference

### Selector Pattern
```typescript
const isSelected = createSelector(selectedId);
<For each={items}>
  {item => <Item active={isSelected(item.id)} />}
</For>
```

### Deferred Pattern
```typescript
const deferred = createDeferred(input, { timeoutMs: 300 });
createEffect(() => expensiveOp(deferred()));
```

### On Pattern
```typescript
createEffect(on(
  [dep1, dep2],
  ([val1, val2]) => {
    const val3 = untrack(dep3);
    // Only tracks dep1 and dep2
  },
  { defer: true }
));
```

### Resource Pattern
```typescript
const [data, { refetch }] = createResource(fetchData);
createEffect(() => {
  if (data.loading) return <Spinner />;
  if (data.error) return <Error />;
  return <Content data={data()} />;
});
```

---

## Next Steps

- **Unit 4:** Deep dive into scheduling internals
- **Unit 5:** Transitions and suspense
- **Unit 6:** Array reconciliation algorithms

---

## Further Reading

- [SolidJS Reactivity in Depth](https://docs.solidjs.com/concepts/intro-to-reactivity)
- [Fine-Grained Reactivity](https://dev.to/ryansolid/a-hands-on-introduction-to-fine-grained-reactivity-3ndf)
- [Advanced Patterns](https://docs.solidjs.com/references/concepts/reactivity/advanced-reactivity)
