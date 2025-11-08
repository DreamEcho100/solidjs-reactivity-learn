# Solid.js Architecture Deep Dive

## Overview

This document provides a comprehensive analysis of Solid.js's reactive system architecture based on the source code analysis. Understanding these patterns is crucial for implementing your own reactive library.

## Core Architecture Patterns

### 1. Global Reactive Context

Solid uses several global variables to maintain reactive context:

```typescript
// Current reactive owner (scope)
let Owner: Owner | null = null;

// Current listening computation (tracks dependencies)
let Listener: Computation<any> | null = null;

// Current transition (for concurrent rendering)
let Transition: TransitionState | null = null;

// Update queues
let Updates: Computation<any>[] | null = null;
let Effects: Computation<any>[] | null = null;

// Execution counter (prevents infinite loops)
let ExecCount = 0;
```

**Why Global Variables?**

1. **Performance**: Avoid passing context through every function call
2. **Simplicity**: Clear, imperative API without explicit context objects
3. **Stack-based**: Context is pushed/popped like a call stack

**How It Works**:

```typescript
// Before running computation
const prevOwner = Owner;
const prevListener = Listener;
Owner = computation;
Listener = computation;

try {
  // Run user code - it will see these globals
  computation.fn(computation.value);
} finally {
  // Restore previous context
  Owner = prevOwner;
  Listener = prevListener;
}
```

### 2. Bidirectional Dependency Tracking

The observer/source relationship is tracked in both directions:

```
Signal (Observable)              Computation (Observer)
┌────────────────────┐          ┌────────────────────┐
│ value: 5           │          │ fn: () => ...      │
│                    │          │                    │
│ observers: [       │◄─────────│ sources: [         │
│   comp1,           │          │   sig1,            │
│   comp2            │          │   sig2             │
│ ]                  │          │ ]                  │
│                    │          │                    │
│ observerSlots: [   │          │ sourceSlots: [     │
│   0,  ◄───────────────────────│   0,               │
│   1   │              └────────│   0                │
│ ]                  │          │ ]                  │
└────────────────────┘          └────────────────────┘
```

**The Slots Arrays**:

- `observerSlots[i]`: Where this signal appears in `observers[i].sources`
- `sourceSlots[i]`: Where this computation appears in `sources[i].observers`

**Why Bidirectional?**

Enables O(1) cleanup using swap-and-pop:

```typescript
function removeObserver(signal: SignalState, index: number) {
  const obs = signal.observers!;
  const slots = signal.observerSlots!;
  
  // Get the computation being removed
  const removed = obs[index];
  const removedSlot = slots[index];
  
  // Swap with last
  const last = obs.pop()!;
  const lastSlot = slots.pop()!;
  
  if (index < obs.length) {
    // Update the swapped computation
    obs[index] = last;
    slots[index] = lastSlot;
    
    // Update back-reference
    last.sourceSlots![lastSlot] = index;
  }
  
  // No array shifting needed!
}
```

### 3. Three-State Computation Model

Computations have three states:

```typescript
const FRESH = 0;    // Up to date
const STALE = 1;    // Needs recomputation  
const PENDING = 2;  // Might need recomputation
```

**State Transitions**:

```
     Signal Write
          ↓
    Mark STALE (direct observers)
          ↓
    Mark PENDING (indirect observers)
          ↓
    Add to Updates/Effects queue
          ↓
    Schedule flush
          ↓
    Process Updates queue
          ↓
    For each PENDING: lookUpstream
          ↓
    For each STALE: recompute
          ↓
    Update to FRESH
```

**Why PENDING State?**

Optimization for chains of memos:

```typescript
const a = createSignal(1);
const b = createMemo(() => a() * 2);
const c = createMemo(() => b() + 1);
const d = createEffect(() => console.log(c()));

setA(1); // Same value!
```

Without PENDING:
- b recomputes → same value
- c recomputes → same value  
- d runs → unnecessary

With PENDING:
- b marked STALE
- c marked PENDING
- c checks upstream (b) → not actually changed
- c stays FRESH
- d doesn't run!

### 4. Ownership Hierarchy

Every computation has an owner, creating a tree:

```
createRoot()
  └─ createEffect()
      ├─ createMemo()
      │   └─ createEffect() (nested)
      └─ createMemo()
          └─ createEffect() (nested)
```

**Automatic Cleanup**:

```typescript
function cleanNode(node: Owner) {
  // Clean sources (I observe these)
  if (node.sources) {
    // Remove from each source's observers
  }
  
  // Clean owned (these belong to me)
  if (node.owned) {
    node.owned.forEach(cleanNode);
  }
  
  // Run cleanup functions
  if (node.cleanups) {
    node.cleanups.forEach(fn => fn());
  }
}
```

Disposing a parent automatically cleans all children!

### 5. Transition System (Concurrent Rendering)

Transitions maintain separate "draft" state:

```typescript
interface TransitionState {
  sources: Set<SignalState<any>>;    // Modified signals
  effects: Computation<any>[];        // Effects to run after
  promises: Set<Promise<any>>;        // Tracked promises
  disposed: Set<Computation<any>>;    // Removed computations
  running: boolean;                   // Is active?
}
```

**Dual State**:

Every signal and computation has:
- **Normal state**: `value`, `state`
- **Transition state**: `tValue`, `tState`

**During Transition**:

```typescript
// Read uses transition value
function readSignal() {
  if (Transition?.running && Transition.sources.has(this)) {
    return this.tValue;
  }
  return this.value;
}

// Write updates transition value
function writeSignal(signal, value) {
  if (Transition?.running) {
    Transition.sources.add(signal);
    signal.tValue = value;
  } else {
    signal.value = value;
  }
}
```

**Committing**:

```typescript
// When transition completes
for (const signal of Transition.sources) {
  signal.value = signal.tValue;
  delete signal.tValue;
}

for (const comp of computations) {
  comp.state = comp.tState;
  delete comp.tState;
}
```

### 6. MessageChannel Scheduler

Why MessageChannel instead of setTimeout?

```typescript
// setTimeout: minimum 4ms delay (throttled)
setTimeout(() => work(), 0); // Actually 4ms+

// MessageChannel: ~0ms delay (immediate)
const channel = new MessageChannel();
channel.port1.onmessage = () => work();
channel.port2.postMessage(null); // ~0ms
```

**Yielding Strategy**:

```typescript
let deadline = performance.now() + 5; // 5ms budget

while (hasWork()) {
  if (performance.now() >= deadline) {
    // Yield to browser
    if (navigator.scheduling?.isInputPending?.()) {
      // User input pending, definitely yield
      break;
    }
    // No input, can continue a bit longer
    deadline = performance.now() + 300; // 300ms max
  }
  
  doWork();
}
```

### 7. Update Propagation Algorithm

**The Process**:

1. **Signal writes** mark observers as STALE
2. **markDownstream** propagates PENDING state
3. **Updates** queue sorted topologically
4. **lookUpstream** checks if PENDING nodes need updating
5. **updateComputation** recomputes STALE nodes
6. **Effects** queue runs after all updates

**Topological Sorting**:

Memos are computed before effects that depend on them:

```typescript
// Wrong order:
effect runs → memo not computed yet → stale value

// Right order (via runTop):
check memo → recompute if needed → effect runs → fresh value
```

**runTop Implementation**:

```typescript
function runTop(node: Computation) {
  if (node.state === 0) return; // Fresh
  
  // Walk up owner chain
  const ancestors = [node];
  let current = node.owner;
  while (current && current.state) {
    ancestors.push(current);
    current = current.owner;
  }
  
  // Update from top down
  for (let i = ancestors.length - 1; i >= 0; i--) {
    updateComputation(ancestors[i]);
  }
}
```

### 8. Array Reconciliation

Two strategies based on use case:

**mapArray (For Component)**:
- Tracks by index
- Item moves = new component
- Good for: static structure, items with identity

```typescript
// Old: [A, B, C]
// New: [B, A, C]
// Result: Destroy A's component, create new one at index 1
```

**indexArray (Index Component)**:
- Tracks by value
- Index changes = signal update
- Good for: dynamic items, value-based lists

```typescript
// Old: [A, B, C]
// New: [B, A, C]
// Result: Update A's index signal from 0 → 1
```

**Reconciliation Algorithm**:

1. **Skip common prefix** (already correct)
2. **Skip common suffix** (already correct)
3. **Build index map** of new items
4. **Match old items** to new positions
5. **Dispose unmatched** items
6. **Create new** items

## Key Insights

### 1. Performance Through Simplicity

Solid doesn't use:
- Virtual DOM diffing
- Complex scheduling heuristics
- Batching everything

Instead:
- Direct DOM updates
- Simple priority queue
- Batch only when needed

### 2. Memory Efficiency

- Lazy array allocation (null when empty)
- Swap-and-pop for O(1) cleanup
- No wrapper objects
- Minimal overhead per primitive

### 3. Type Safety

Everything is strongly typed:
- Generic type parameters flow through
- No `any` types in public API
- Inference from initial values

### 4. Extensibility

- DevHooks for tooling
- ExternalSourceConfig for interop
- Custom comparators
- Context system

### 5. Error Handling

- Error boundaries (catchError)
- Graceful degradation
- Clear error messages in dev mode
- Production safety

## Implementation Priorities

When building your library, focus on:

1. **Correctness first**: Get the basics right
2. **Then performance**: Optimize hot paths
3. **Then features**: Add advanced primitives
4. **Then polish**: Dev tools, error messages

## Common Pitfalls

### 1. Forgetting to Clean Up

Always clean dependencies:

```typescript
function updateComputation(node) {
  cleanNode(node); // CRITICAL!
  runComputation(node);
}
```

### 2. Wrong Context

Save and restore:

```typescript
const prev = Listener;
Listener = computation;
try {
  // ...
} finally {
  Listener = prev; // RESTORE!
}
```

### 3. Infinite Loops

Track execution count:

```typescript
if (Updates.length > 100000) {
  throw new Error("Infinite loop detected");
}
```

### 4. Memory Leaks

Test disposal:

```typescript
const dispose = createRoot((d) => {
  // Create many effects
  return d;
});

dispose();
// Check: all observers removed?
```

## Testing Strategy

### Unit Tests

Test each primitive in isolation:
- Signals
- Effects  
- Memos
- Batching
- Etc.

### Integration Tests

Test interactions:
- Signal → Effect
- Memo → Effect
- Batch updates
- Transitions

### Performance Tests

Benchmark:
- Creation time
- Update time
- Memory usage
- Cleanup time

### Real-World Tests

Build actual apps:
- Counter
- Todo list
- Data table
- Etc.

## Resources

- Solid.js source: https://github.com/solidjs/solid
- S.js (inspiration): https://github.com/adamhaile/S
- Reactively: https://github.com/modderme123/reactively

---

**Remember**: Understand before you build. Reading Solid's source code multiple times will reveal deeper patterns each time. 🎯
