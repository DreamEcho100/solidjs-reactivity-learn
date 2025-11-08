# 🎯 One-Page Cheat Sheet

## Quick Implementation Checklist

### 1. Types (30 min)
```typescript
type ComputationState = 0 | 1 | 2;
interface Owner { owned, cleanups, owner, context }
interface Computation extends Owner { fn, state, sources, sourceSlots, value, pure }
interface SignalState { value, observers, observerSlots }
```

### 2. Globals (5 min)
```typescript
let Owner: Owner | null = null;
let Listener: Computation | null = null;
let Updates: Computation[] | null = null;
let Effects: Computation[] | null = null;
let ExecCount = 0;
```

### 3. Signal Read (15 min)
```typescript
function readSignal(this: SignalState) {
  if (Listener) {
    // Add to Listener.sources + sourceSlots
    // Add to this.observers + observerSlots
  }
  return this.value;
}
```

### 4. Signal Write (15 min)
```typescript
function writeSignal(this: SignalState, value) {
  if (changed) {
    this.value = value;
    for (observer of this.observers) {
      observer.state = STALE;
      if (observer.pure) Updates.push(observer);
      else Effects.push(observer);
    }
  }
}
```

### 5. Cleanup (20 min)
```typescript
function cleanNode(node: Owner) {
  // Remove from sources (swap-and-pop)
  // Dispose owned children
  // Run cleanup functions
}
```

### 6. Update Cycle (20 min)
```typescript
function runUpdates(fn) {
  Updates = []; Effects = []; ExecCount++;
  fn();
  runQueue(Updates);  // Memos first
  runQueue(Effects);  // Effects second
}
```

### 7. Create Computation (15 min)
```typescript
function createComputation(fn, init, pure) {
  const c = { fn, state: STALE, sources: null, owner: Owner, ... };
  if (Owner) Owner.owned.push(c);
  return c;
}
```

## Key Algorithms

### Bidirectional Add
```typescript
// Add effect to signal
signal.observers.push(effect);
signal.observerSlots.push(effect.sources.length);
effect.sources.push(signal);
effect.sourceSlots.push(signal.observers.length - 1);
```

### Bidirectional Remove (Swap-and-Pop)
```typescript
while (effect.sources.length) {
  const signal = effect.sources.pop();
  const slot = effect.sourceSlots.pop();
  const last = signal.observers.pop();
  if (slot < signal.observers.length) {
    signal.observers[slot] = last;
    last.sourceSlots[...] = slot;
  }
}
```

### State Propagation
```typescript
writeSignal() → mark observers STALE → if memo, mark downstream PENDING
```

## Testing Checklist

- [ ] Basic signal read/write
- [ ] Effect subscribes and runs
- [ ] Memo computes and caches
- [ ] Batching deduplicates
- [ ] Diamond dependencies (no glitches)
- [ ] Cleanup runs on dispose
- [ ] Ownership prevents leaks
- [ ] Performance: O(1) cleanup

## Common Pitfalls

1. **Forgetting to set Owner** → Memory leaks
2. **Not using slots** → O(n) removal
3. **Single queue** → Glitches
4. **No states** → Over-computation
5. **No cleanup before re-run** → Orphaned children

## Performance Targets

- Cleanup 10K deps: < 50ms
- Update 1K memos: < 10ms
- Memory: No leaks after 1M updates

## API Surface

```typescript
createSignal<T>(value, opts?): [() => T, (v) => void]
createEffect(fn): () => void
createMemo<T>(fn, opts?): () => T
createRoot<T>(fn): T
batch<T>(fn): T
untrack<T>(fn): T
onCleanup(fn): void
```

---

**💡 Full details in the numbered guides. This is just a quick reference!**
