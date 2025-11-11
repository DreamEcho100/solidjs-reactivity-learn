# Unit 10: Advanced Patterns and Optimization

## Overview

Master production-ready patterns and performance optimization. Learn memory management, profiling, development tools, and deployment strategies.

## Learning Objectives

- ✅ Master memory leak prevention
- ✅ Profile and optimize reactive systems
- ✅ Build development tools
- ✅ Implement production patterns
- ✅ Deploy with confidence

## Time Commitment

**2 weeks** | **15-18 hours**

## Lessons

### Lesson 1: Memory Management (4-5 hours)
- cleanNode implementation
- Avoiding memory leaks
- Disposer patterns
- Profiling memory usage
- Weak references

### Lesson 2: Performance Optimization (4-5 hours)
- Minimizing computations
- Strategic untracking
- Batch updates effectively
- Selector optimization
- Benchmarking

### Lesson 3: Development Tools (3-4 hours)
- DevHooks system
- Source maps and debugging
- Graph visualization
- Performance monitoring
- Chrome DevTools integration

### Lesson 4: Production Patterns (3-4 hours)
- Hydration strategies
- SSR considerations
- Error handling at scale
- Testing reactive code
- Deployment checklist

## Exercises

1. **Memory Profiler** (⭐⭐⭐⭐⭐) - Find and fix leaks
2. **Dev Tools Extension** (⭐⭐⭐⭐⭐) - Build debugging tools
3. **Performance Suite** (⭐⭐⭐⭐) - Optimization toolkit
4. **Production App** (⭐⭐⭐⭐⭐) - Complete deployment

## Projects

- **Reactive Profiler** - Performance analysis tool
- **Dev Tools Panel** - Browser extension
- **Benchmark Suite** - Compare implementations
- **Production Starter** - Deployment template

## Key Concepts

### Memory Management

#### cleanNode Implementation
```javascript
function cleanNode(node) {
  // Clean up sources
  while (node.sources?.length) {
    const source = node.sources.pop();
    const index = node.sourceSlots.pop();
    
    // Remove from source's observers (O(1) swap)
    const last = source.observers.length - 1;
    if (index < last) {
      const lastObs = source.observers[last];
      source.observers[index] = lastObs;
      source.observerSlots[index] = source.observerSlots[last];
      lastObs.sourceSlots[source.observerSlots[last]] = index;
    }
    source.observers.pop();
    source.observerSlots.pop();
  }
  
  // Clean up owned computations
  if (node.owned) {
    for (let i = node.owned.length - 1; i >= 0; i--) {
      cleanNode(node.owned[i]);
    }
    node.owned = null;
  }
  
  // Run cleanup functions
  if (node.cleanups) {
    for (let i = node.cleanups.length - 1; i >= 0; i--) {
      node.cleanups[i]();
    }
    node.cleanups = null;
  }
}
```

### Performance Optimization

#### Batch Updates
```javascript
// ❌ Multiple updates
setA(1); // Triggers effects
setB(2); // Triggers effects
setC(3); // Triggers effects

// ✅ Single update
batch(() => {
  setA(1);
  setB(2);
  setC(3);
  // Effects run once
});
```

#### Strategic Untracking
```javascript
createEffect(() => {
  const currentId = userId(); // Tracked
  
  // Don't track these expensive lookups
  const cached = untrack(() => cache.get(currentId));
  if (cached) return cached;
  
  // Track the signal we actually care about
  const data = fetchData();
});
```

#### Selector Optimization
```javascript
// ❌ O(n) - re-runs for every change
createEffect(() => {
  const selected = items().find(i => i.id === selectedId());
  render(selected);
});

// ✅ O(2) - only re-runs when selection changes
const selected = createSelector(
  () => selectedId(),
  (id, item) => item.id === id
);

createEffect(() => {
  const item = items().find(selected);
  render(item);
});
```

### Development Tools

#### DevHooks System
```javascript
export const DevHooks = {
  afterUpdate: null,
  afterCreateOwner: null,
  afterCreateSignal: null,
  afterRegisterGraph: null
};

// Usage in dev mode
if (IS_DEV) {
  DevHooks.afterCreateSignal = (signal) => {
    console.log('Signal created:', signal.name);
    registerWithDevTools(signal);
  };
}
```

#### Graph Visualization
```javascript
function visualizeReactiveGraph(root) {
  const nodes = [];
  const edges = [];
  
  function traverse(node, depth = 0) {
    nodes.push({ id: node.id, type: node.type, depth });
    
    if (node.sources) {
      node.sources.forEach(source => {
        edges.push({ from: source.id, to: node.id });
        traverse(source, depth + 1);
      });
    }
  }
  
  traverse(root);
  return { nodes, edges };
}
```

### Production Patterns

#### SSR Hydration
```javascript
// Server
const html = renderToString(() => <App />);

// Client
hydrate(() => <App />, document.getElementById('app'));
```

#### Error Handling
```javascript
function RobustComponent() {
  return (
    <ErrorBoundary 
      fallback={(err, reset) => (
        <div>
          <p>Error: {err.message}</p>
          <button onClick={reset}>Retry</button>
        </div>
      )}
    >
      <MightFail />
    </ErrorBoundary>
  );
}
```

#### Testing
```javascript
import { createRoot } from 'solid-js';

test('reactive updates', () => {
  createRoot(dispose => {
    const [count, setCount] = createSignal(0);
    let runs = 0;
    
    createEffect(() => {
      count();
      runs++;
    });
    
    expect(runs).toBe(1);
    
    setCount(1);
    expect(runs).toBe(2);
    
    dispose();
  });
});
```

**Files:**
- `lessons/lesson-01-memory-management.md`
- `lessons/lesson-02-performance-optimization.md`
- `lessons/lesson-03-development-tools.md`
- `lessons/lesson-04-production-patterns.md`
- `exercises/01-memory-profiler.md`
- `exercises/02-dev-tools.md`
- `notes/optimization-checklist.md`
- `notes/deployment-guide.md`
- `notes/testing-strategies.md`
