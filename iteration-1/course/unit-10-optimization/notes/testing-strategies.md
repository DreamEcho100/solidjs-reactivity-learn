# Testing Strategies for Reactive Code

## Overview

Testing reactive code requires specific strategies to handle asynchronous updates, dependency tracking, and cleanup. This guide covers comprehensive testing approaches for Solid.js reactive systems.

## Testing Fundamentals

### Test Structure

```javascript
import { createRoot, createSignal, createEffect } from 'solid-js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Reactive System', () => {
  let dispose;
  
  beforeEach(() => {
    // Setup runs before each test
  });
  
  afterEach(() => {
    // Cleanup after each test
    if (dispose) dispose();
  });
  
  it('should update when signal changes', () => {
    dispose = createRoot((disposeRoot) => {
      const [count, setCount] = createSignal(0);
      let runs = 0;
      
      createEffect(() => {
        count();
        runs++;
      });
      
      expect(runs).toBe(1);
      
      setCount(1);
      expect(runs).toBe(2);
      
      return disposeRoot;
    });
  });
});
```

### Testing Patterns

#### Pattern 1: Basic Signal Testing

```javascript
test('signal updates and notifies', () => {
  createRoot(dispose => {
    const [count, setCount] = createSignal(0);
    
    // Test initial value
    expect(count()).toBe(0);
    
    // Test update
    setCount(5);
    expect(count()).toBe(5);
    
    // Test function update
    setCount(c => c + 1);
    expect(count()).toBe(6);
    
    dispose();
  });
});
```

#### Pattern 2: Effect Testing

```javascript
test('effect runs on dependencies', () => {
  createRoot(dispose => {
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(2);
    let result;
    
    createEffect(() => {
      result = a() + b();
    });
    
    expect(result).toBe(3);
    
    setA(5);
    expect(result).toBe(7);
    
    setB(10);
    expect(result).toBe(15);
    
    dispose();
  });
});
```

#### Pattern 3: Memo Testing

```javascript
test('memo caches computed values', () => {
  createRoot(dispose => {
    const [count, setCount] = createSignal(0);
    let computations = 0;
    
    const doubled = createMemo(() => {
      computations++;
      return count() * 2;
    });
    
    expect(doubled()).toBe(0);
    expect(computations).toBe(1);
    
    // Reading again doesn't recompute
    expect(doubled()).toBe(0);
    expect(computations).toBe(1);
    
    // Update triggers recomputation
    setCount(5);
    expect(doubled()).toBe(10);
    expect(computations).toBe(2);
    
    dispose();
  });
});
```

## Testing Advanced Features

### Cleanup Testing

```javascript
test('cleanup functions are called', () => {
  const cleanup = vi.fn();
  
  const dispose = createRoot((disposeRoot) => {
    createEffect(() => {
      onCleanup(cleanup);
    });
    
    return disposeRoot;
  });
  
  expect(cleanup).not.toHaveBeenCalled();
  
  dispose();
  
  expect(cleanup).toHaveBeenCalledTimes(1);
});

test('cleanup runs before effect re-runs', () => {
  createRoot(dispose => {
    const [count, setCount] = createSignal(0);
    const cleanups = [];
    
    createEffect(() => {
      const value = count();
      
      onCleanup(() => {
        cleanups.push(value);
      });
    });
    
    setCount(1);
    expect(cleanups).toEqual([0]);
    
    setCount(2);
    expect(cleanups).toEqual([0, 1]);
    
    dispose();
    expect(cleanups).toEqual([0, 1, 2]);
  });
});
```

### Batching Testing

```javascript
test('batch prevents multiple updates', () => {
  createRoot(dispose => {
    const [a, setA] = createSignal(0);
    const [b, setB] = createSignal(0);
    let runs = 0;
    
    createEffect(() => {
      a();
      b();
      runs++;
    });
    
    expect(runs).toBe(1);
    
    // Without batch - 2 updates
    setA(1);
    setB(1);
    expect(runs).toBe(3);
    
    // With batch - 1 update
    batch(() => {
      setA(2);
      setB(2);
    });
    expect(runs).toBe(4);
    
    dispose();
  });
});
```

### Untrack Testing

```javascript
test('untrack prevents dependency tracking', () => {
  createRoot(dispose => {
    const [tracked, setTracked] = createSignal(0);
    const [untracked, setUntracked] = createSignal(0);
    let runs = 0;
    
    createEffect(() => {
      tracked();
      untrack(() => untracked());
      runs++;
    });
    
    expect(runs).toBe(1);
    
    setTracked(1);
    expect(runs).toBe(2);
    
    setUntracked(1);
    expect(runs).toBe(2); // Doesn't trigger update
    
    dispose();
  });
});
```

## Component Testing

### Testing with @solidjs/testing-library

```javascript
import { render, fireEvent, screen } from '@solidjs/testing-library';

describe('Counter Component', () => {
  function Counter() {
    const [count, setCount] = createSignal(0);
    
    return (
      <div>
        <span data-testid="count">{count()}</span>
        <button 
          data-testid="increment"
          onClick={() => setCount(c => c + 1)}
        >
          Increment
        </button>
      </div>
    );
  }
  
  it('increments count when button clicked', async () => {
    render(() => <Counter />);
    
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    
    await fireEvent.click(screen.getByTestId('increment'));
    
    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });
});
```

### Testing Async Components

```javascript
import { waitFor } from '@solidjs/testing-library';

describe('DataComponent', () => {
  function DataComponent() {
    const [data] = createResource(() => 
      fetch('/api/data').then(r => r.json())
    );
    
    return (
      <div>
        <Show when={data.loading}>
          <span data-testid="loading">Loading...</span>
        </Show>
        <Show when={data()}>
          <span data-testid="data">{data().value}</span>
        </Show>
      </div>
    );
  }
  
  it('loads and displays data', async () => {
    // Mock fetch
    global.fetch = vi.fn(() => 
      Promise.resolve({
        json: () => Promise.resolve({ value: 'test data' })
      })
    );
    
    render(() => <DataComponent />);
    
    expect(screen.getByTestId('loading')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByTestId('data')).toHaveTextContent('test data');
    });
  });
});
```

## Performance Testing

### Benchmarking Tests

```javascript
import { performance } from 'perf_hooks';

describe('Performance', () => {
  it('creates signals efficiently', () => {
    const start = performance.now();
    
    createRoot(dispose => {
      for (let i = 0; i < 10000; i++) {
        createSignal(i);
      }
      dispose();
    });
    
    const duration = performance.now() - start;
    
    expect(duration).toBeLessThan(100);
  });
  
  it('updates efficiently', () => {
    createRoot(dispose => {
      const [count, setCount] = createSignal(0);
      
      createEffect(() => count());
      
      const start = performance.now();
      
      for (let i = 0; i < 1000; i++) {
        setCount(i);
      }
      
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(50);
      
      dispose();
    });
  });
});
```

### Memory Leak Testing

```javascript
describe('Memory Management', () => {
  it('cleans up properly', () => {
    const weakRefs = [];
    
    for (let i = 0; i < 100; i++) {
      const dispose = createRoot((disposeRoot) => {
        const [count, setCount] = createSignal(0);
        
        createEffect(() => {
          count();
        });
        
        // Track with WeakRef
        weakRefs.push(new WeakRef({ count, setCount }));
        
        return disposeRoot;
      });
      
      dispose();
    }
    
    // Force GC
    if (global.gc) global.gc();
    
    // Check that objects were collected
    setTimeout(() => {
      const collected = weakRefs.filter(ref => !ref.deref()).length;
      expect(collected).toBeGreaterThan(90); // Most should be GC'd
    }, 1000);
  });
});
```

## Integration Testing

### Testing Reactive Graphs

```javascript
describe('Complex Reactive Graph', () => {
  it('propagates updates correctly', () => {
    createRoot(dispose => {
      const [a, setA] = createSignal(1);
      const [b, setB] = createSignal(2);
      
      const sum = createMemo(() => a() + b());
      const product = createMemo(() => a() * b());
      const combined = createMemo(() => sum() + product());
      
      expect(sum()).toBe(3);
      expect(product()).toBe(2);
      expect(combined()).toBe(5);
      
      setA(3);
      
      expect(sum()).toBe(5);
      expect(product()).toBe(6);
      expect(combined()).toBe(11);
      
      dispose();
    });
  });
});
```

### Testing Error Handling

```javascript
describe('Error Handling', () => {
  it('catches errors in effects', () => {
    const errorHandler = vi.fn();
    
    createRoot(dispose => {
      try {
        createEffect(() => {
          throw new Error('Test error');
        });
      } catch (err) {
        errorHandler(err);
      }
      
      expect(errorHandler).toHaveBeenCalled();
      
      dispose();
    });
  });
  
  it('error boundaries catch component errors', () => {
    function ThrowError() {
      throw new Error('Component error');
    }
    
    function App() {
      return (
        <ErrorBoundary fallback={(err) => <div>{err.message}</div>}>
          <ThrowError />
        </ErrorBoundary>
      );
    }
    
    render(() => <App />);
    
    expect(screen.getByText('Component error')).toBeInTheDocument();
  });
});
```

## Snapshot Testing

```javascript
describe('Component Snapshots', () => {
  it('matches snapshot', () => {
    function Card({ title, content }) {
      return (
        <div class="card">
          <h2>{title}</h2>
          <p>{content}</p>
        </div>
      );
    }
    
    const { container } = render(() => 
      <Card title="Test" content="Content" />
    );
    
    expect(container).toMatchSnapshot();
  });
});
```

## Testing Best Practices

### ✅ Do's

```javascript
// ✅ Always use createRoot
test('good test', () => {
  createRoot(dispose => {
    // Test code
    dispose();
  });
});

// ✅ Test behavior, not implementation
test('counter increments', () => {
  // Test that it increments, not HOW it increments
});

// ✅ Clean up after tests
afterEach(() => {
  if (dispose) dispose();
});

// ✅ Use meaningful test names
test('signal notifies dependents when value changes', () => {});

// ✅ Test edge cases
test('handles empty array', () => {});
test('handles null value', () => {});
test('handles concurrent updates', () => {});
```

### ❌ Don'ts

```javascript
// ❌ Don't forget to dispose
test('bad test', () => {
  const [count] = createSignal(0);
  // Never disposed!
});

// ❌ Don't test implementation details
test('uses createMemo internally', () => {
  // Too coupled to implementation
});

// ❌ Don't share state between tests
let sharedSignal;
test('test 1', () => {
  sharedSignal = createSignal(0);
});
test('test 2', () => {
  // Uses sharedSignal - BAD!
});

// ❌ Don't use arbitrary timeouts
test('async test', async () => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  // Use waitFor instead
});
```

## Test Organization

### File Structure

```
src/
├── components/
│   ├── Counter.tsx
│   └── Counter.test.tsx
├── utils/
│   ├── reactive.ts
│   └── reactive.test.ts
└── __tests__/
    ├── integration/
    │   └── app.test.tsx
    └── e2e/
        └── user-flow.test.tsx
```

### Test Suites

```javascript
// Group related tests
describe('Signal', () => {
  describe('creation', () => {
    it('creates with initial value', () => {});
    it('creates with factory function', () => {});
  });
  
  describe('updates', () => {
    it('updates with new value', () => {});
    it('updates with function', () => {});
  });
  
  describe('equality', () => {
    it('uses custom comparator', () => {});
    it('prevents unnecessary updates', () => {});
  });
});
```

## Coverage

### Measuring Coverage

```json
{
  "scripts": {
    "test": "vitest",
    "test:coverage": "vitest --coverage"
  }
}
```

### Coverage Goals

- **Statements:** > 80%
- **Branches:** > 80%
- **Functions:** > 80%
- **Lines:** > 80%

### Critical Paths

Ensure 100% coverage for:
- Core reactive primitives
- Error handling
- Cleanup logic
- Public APIs

## Continuous Integration

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install
        run: npm ci
      
      - name: Test
        run: npm test -- --coverage
      
      - name: Upload Coverage
        uses: codecov/codecov-action@v3
```

## Summary

**Key Testing Principles:**

1. **Always dispose** - Use createRoot and cleanup
2. **Test behavior** - Not implementation
3. **Isolate tests** - No shared state
4. **Cover edge cases** - Null, empty, concurrent
5. **Measure coverage** - Aim for > 80%
6. **Run in CI** - Automate testing

**Remember:** Good tests give you confidence to refactor and deploy!
