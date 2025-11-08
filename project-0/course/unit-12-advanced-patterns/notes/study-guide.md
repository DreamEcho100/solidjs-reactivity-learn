# Unit 12: Advanced Patterns - Study Notes

## Quick Reference

### Advanced Composition Patterns

```typescript
// Higher-order reactive function
function createDerived<T, U>(
  source: Accessor<T>,
  transform: (value: T) => U
): Accessor<U> {
  return createMemo(() => transform(source()));
}

// Reactive pipeline
pipe(source)
  .map(transform)
  .filter(predicate)
  .debounce(300)
  .toAccessor();

// Lens focusing
const [city, setCity] = focusLens([user, setUser])(cityLens);
```

### Custom Primitives Checklist

- [ ] Built on existing primitives
- [ ] Proper cleanup with `onCleanup`
- [ ] Type-safe API
- [ ] Documented behavior
- [ ] Tested edge cases

### Bidirectional Reactivity Strategies

1. **Guard Flags**: Prevent circular updates with boolean flag
2. **Version Tracking**: Use version numbers to detect changes
3. **Controlled/Uncontrolled**: React-style pattern
4. **Master-Slave**: One source of truth with derived values

### Common Patterns Library

```typescript
// Toggle
const isOpen = createToggle(false);
isOpen.toggle();

// Async state
const api = createAsyncState(fetchUser);
api.execute(userId);

// LocalStorage
const [theme, setTheme] = createLocalStorage('theme', 'light');

// Media query
const isMobile = createMediaQuery('(max-width: 768px)');

// Debounce
const debounced = createDebounced(source, 300);

// Previous value
const prev = createPrevious(signal);
```

## Performance Optimization Patterns

### 1. Memoization Strategies

```typescript
// Cache expensive computations
const expensive = createMemo(() => {
  return complexCalculation(source());
});

// Cached selector for lists
const cache = createCachedSelector(
  items,
  item => processItem(item),
  item => item.id
);
```

### 2. Batching Updates

```typescript
batch(() => {
  setFirst(1);
  setSecond(2);
  setThird(3);
  // Only one update cycle
});
```

### 3. Strategic Untracking

```typescript
createEffect(() => {
  const reactive = signal();
  const static = untrack(() => otherSignal());
  // Only tracks signal, not otherSignal
});
```

## Advanced Debugging Techniques

### 1. Dependency Tracking

```typescript
function trackDependencies<T>(fn: () => T): {
  result: T;
  dependencies: Set<SignalState<any>>;
} {
  const deps = new Set();
  const result = createRoot(dispose => {
    createEffect(() => {
      const owner = getOwner();
      if (owner && owner.sources) {
        owner.sources.forEach(s => deps.add(s));
      }
    });
    const r = fn();
    dispose();
    return r;
  });
  return { result, dependencies: deps };
}
```

### 2. Update Profiling

```typescript
const profiler = createUpdateProfiler();

createEffect(() => {
  profiler.start('computation-1');
  expensiveComputation();
  profiler.end('computation-1');
});

console.log(profiler.report());
```

### 3. Reactive Graph Visualization

```typescript
function visualizeReactiveGraph() {
  const owner = getOwner();
  if (!owner) return;
  
  const graph = buildDependencyGraph(owner);
  renderGraph(graph);
}
```

## Anti-Patterns to Avoid

### ❌ Don't: Create Signals in Effects

```typescript
// Bad
createEffect(() => {
  const [local, setLocal] = createSignal(0);
  // Creates new signal on every run!
});

// Good
const [local, setLocal] = createSignal(0);
createEffect(() => {
  // Use existing signal
});
```

### ❌ Don't: Forget Cleanup

```typescript
// Bad
createEffect(() => {
  const interval = setInterval(() => {}, 1000);
  // Never cleaned up!
});

// Good
createEffect(() => {
  const interval = setInterval(() => {}, 1000);
  onCleanup(() => clearInterval(interval));
});
```

### ❌ Don't: Overuse Reactivity

```typescript
// Bad: Everything reactive
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);
const [c, setC] = createSignal(3);
// ... too granular

// Good: Group related state
const [state, setState] = createSignal({ a: 1, b: 2, c: 3 });
```

## Production Patterns

### Error Boundaries

```typescript
function SafeComponent() {
  return (
    <ErrorBoundary fallback={err => <div>Error: {err.message}</div>}>
      <RiskyComponent />
    </ErrorBoundary>
  );
}
```

### Lazy Loading

```typescript
const LazyModule = lazy(() => import('./Module'));

<Suspense fallback={<Loading />}>
  <LazyModule />
</Suspense>
```

### Code Splitting

```typescript
const routes = [
  { path: '/home', component: lazy(() => import('./Home')) },
  { path: '/about', component: lazy(() => import('./About')) }
];
```

## Testing Patterns

### Unit Testing Reactive Code

```typescript
import { createRoot } from 'solid-js';

test('signal updates', () => {
  createRoot(dispose => {
    const [count, setCount] = createSignal(0);
    
    expect(count()).toBe(0);
    setCount(5);
    expect(count()).toBe(5);
    
    dispose();
  });
});
```

### Testing Effects

```typescript
test('effect runs', async () => {
  const spy = vi.fn();
  
  createRoot(dispose => {
    const [value, setValue] = createSignal(0);
    
    createEffect(() => {
      spy(value());
    });
    
    setValue(1);
    
    dispose();
  });
  
  expect(spy).toHaveBeenCalledWith(0);
  expect(spy).toHaveBeenCalledWith(1);
});
```

## Gotchas and Edge Cases

### 1. Effects Run Immediately

```typescript
createEffect(() => {
  console.log("Runs immediately!");
  // Then runs on dependencies change
});
```

### 2. Memos Don't Run Without Subscribers

```typescript
const memo = createMemo(() => {
  console.log("Only runs if someone reads this memo");
  return expensive();
});

// Must read to trigger
memo(); // Now it runs
```

### 3. Batch Timing

```typescript
batch(() => {
  setA(1);
  console.log(b()); // May not reflect A's update yet
});
```

## Design Patterns Comparison

| Pattern | Use Case | Performance | Complexity |
|---------|----------|-------------|------------|
| Signal | Basic state | ⭐⭐⭐⭐⭐ | ⭐ |
| Memo | Derived state | ⭐⭐⭐⭐ | ⭐⭐ |
| Effect | Side effects | ⭐⭐⭐ | ⭐⭐ |
| Resource | Async data | ⭐⭐⭐ | ⭐⭐⭐ |
| Context | Global state | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| Store | Complex state | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

## Study Tips

1. **Practice composing primitives** before creating custom ones
2. **Profile before optimizing** - measure actual performance
3. **Test edge cases** thoroughly, especially cleanup
4. **Read Solid source code** for implementation details
5. **Build real projects** to encounter real-world patterns

## Next Steps

- Complete all exercises
- Build a non-trivial application
- Contribute to open source reactive libraries
- Move to Unit 13 for cutting-edge patterns

---

*Remember: The best reactive code is simple, composable, and easy to reason about.*
