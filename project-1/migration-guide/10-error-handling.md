# Step 10: Error Handling & Error Boundaries

## 🎯 Goal
Implement robust error handling with error boundaries to catch and recover from errors in reactive computations.

## 🤔 The Problem

```typescript
// Without error handling
createEffect(() => {
  const data = fetchData();
  const result = data.someProperty.nested.value; // Error!
  // Entire app crashes! 😱
});
```

## 🛡️ The Solution: Error Boundaries

```typescript
<ErrorBoundary fallback={err => <div>Error: {err.message}</div>}>
  <ComponentThatMightError />
</ErrorBoundary>

// App continues running, error is contained ✅
```

## 🏗️ Implementation

### Step 1: Error Handling State

```typescript
let ERROR: symbol | null = null;
const UNHANDLED = Symbol("unhandled");
```

### Step 2: Global Error Handlers

```typescript
let globalErrorHandlers: ((err: any) => void)[] = [];

export function onError(fn: (err: any) => void): void {
  if (Owner) {
    if (!Owner.context) Owner.context = {};
    if (!Owner.context[ERROR!]) {
      Owner.context[ERROR!] = [];
    }
    Owner.context[ERROR!].push(fn);
  } else {
    globalErrorHandlers.push(fn);
  }
}
```

### Step 3: Handle Errors in Computations

```typescript
function handleError(err: any): void {
  const fns = lookup(Owner, ERROR);
  
  if (!fns) {
    // No error boundary, throw globally
    if (globalErrorHandlers.length) {
      globalErrorHandlers.forEach(h => h(err));
    } else {
      throw err;
    }
  } else {
    // Call error handlers
    for (const f of fns) {
      try {
        f(err);
      } catch (e) {
        // Error in error handler, escalate
        handleError(e);
      }
    }
  }
}

function lookup(owner: Owner | null, key: symbol | string): any {
  return (
    owner &&
    owner.context &&
    owner.context[key] !== undefined
      ? owner.context[key]
      : owner && owner.owner
      ? lookup(owner.owner, key)
      : undefined
  );
}
```

### Step 4: Update runComputation for Errors

```typescript
function runComputation(
  node: Computation<any>,
  value: any,
  time: number
): void {
  let nextValue;
  
  const owner = Owner;
  const listener = Listener;
  
  Listener = Owner = node;
  
  try {
    nextValue = node.fn(value);
  } catch (err) {
    // Handle error
    const fns = lookup(Owner, ERROR);
    
    if (!fns) {
      throw err;
    }
    
    // Run error handlers
    fns.forEach((f: (err: any) => void) => f(err));
    
    // Mark computation as stale for retry
    if (node.pure) {
      node.state = STALE;
      node.owned && node.owned.forEach(cleanNode);
      node.owned = null;
    }
    
    node.updatedAt = time + 1;
    return;
  } finally {
    Listener = listener;
    Owner = owner;
  }
  
  if (!node.updatedAt || node.updatedAt <= time) {
    if (node.updatedAt != null && "observers" in node) {
      writeSignal(node as Memo<any>, nextValue, true);
    } else {
      node.value = nextValue;
    }
    
    node.updatedAt = time;
    node.state = 0;
  }
}
```

### Step 5: ErrorBoundary Component

```typescript
export type ErrorBoundaryProps = {
  fallback: (err: any, reset: () => void) => JSX.Element;
  children: JSX.Element;
};

export function ErrorBoundary(props: ErrorBoundaryProps): JSX.Element {
  const [error, setError] = createSignal<any>();
  
  // Register error handler
  onError((err: any) => {
    setError(() => err);
  });
  
  const reset = () => {
    setError(undefined);
  };
  
  return createMemo(() => {
    const err = error();
    if (err) {
      return props.fallback(err, reset);
    }
    return props.children;
  }) as unknown as JSX.Element;
}
```

### Step 6: catchError Utility

```typescript
export function catchError<T>(
  fn: () => T,
  handler: (err: any) => void
): T | undefined {
  let error: any;
  
  // Create isolated scope with error handler
  onError((err) => {
    error = err;
  });
  
  const res = fn();
  
  if (error) {
    handler(error);
    return undefined;
  }
  
  return res;
}
```

## 🎨 Usage Examples

### Example 1: Basic Error Boundary

```typescript
function App() {
  return (
    <ErrorBoundary
      fallback={(err, reset) => (
        <div>
          <h1>Something went wrong!</h1>
          <p>{err.message}</p>
          <button onClick={reset}>Try again</button>
        </div>
      )}
    >
      <DangerousComponent />
    </ErrorBoundary>
  );
}

function DangerousComponent() {
  const [count, setCount] = createSignal(0);
  
  createEffect(() => {
    if (count() > 5) {
      throw new Error("Count too high!");
    }
  });
  
  return (
    <div>
      <p>Count: {count()}</p>
      <button onClick={() => setCount(c => c + 1)}>
        Increment
      </button>
    </div>
  );
}
```

### Example 2: Nested Error Boundaries

```typescript
function App() {
  return (
    <ErrorBoundary fallback={(err) => <div>App Error: {err.message}</div>}>
      <Header />
      
      <ErrorBoundary fallback={(err) => <div>Content Error: {err.message}</div>}>
        <Content />
      </ErrorBoundary>
      
      <Footer />
    </ErrorBoundary>
  );
}

// Error in Content caught by inner boundary
// Header and Footer continue working!
```

### Example 3: Error Recovery

```typescript
function DataLoader() {
  const [retryCount, setRetryCount] = createSignal(0);
  const [data, setData] = createSignal(null);
  
  createEffect(() => {
    const retry = retryCount(); // Track retries
    
    fetch(`/api/data?retry=${retry}`)
      .then(res => res.json())
      .then(setData)
      .catch(err => {
        throw err; // Will be caught by error boundary
      });
  });
  
  return (
    <ErrorBoundary
      fallback={(err, reset) => (
        <div>
          <p>Failed to load data: {err.message}</p>
          <button onClick={() => {
            setRetryCount(c => c + 1);
            reset();
          }}>
            Retry (attempt {retryCount() + 1})
          </button>
        </div>
      )}
    >
      <Show when={data()} fallback={<Loading />}>
        <DataDisplay data={data()} />
      </Show>
    </ErrorBoundary>
  );
}
```

### Example 4: Programmatic Error Handling

```typescript
function Component() {
  const [data, setData] = createSignal(null);
  
  // Catch errors in specific computation
  createEffect(() => {
    catchError(
      () => {
        const result = riskyComputation();
        setData(result);
      },
      (err) => {
        console.error("Computation failed:", err);
        setData(null); // Fallback value
      }
    );
  });
  
  return <div>{data()}</div>;
}
```

## 🔍 Error Propagation

### Error Boundary Tree

```
Root ErrorBoundary (App-level)
  │
  ├── Header (safe)
  │
  ├── ErrorBoundary (Content-level)
  │     │
  │     ├── Sidebar (safe)
  │     │
  │     └── Main (throws error) ❌
  │           │
  │           Error caught here ↑
  │           Fallback shown
  │
  └── Footer (safe)

Result:
  - Main shows error fallback
  - Sidebar still works
  - Header still works
  - Footer still works
```

### Error Escalation

```typescript
<ErrorBoundary fallback={(err, reset) => {
  if (err.critical) {
    throw err; // Escalate to parent boundary
  }
  return <ErrorDisplay error={err} />;
}}>
  <Content />
</ErrorBoundary>
```

## 📊 Error Types

### 1. Synchronous Errors

```typescript
createEffect(() => {
  throw new Error("Sync error"); // Caught immediately
});
```

### 2. Async Errors

```typescript
createEffect(() => {
  Promise.reject(new Error("Async error"))
    .catch(err => {
      throw err; // Re-throw to be caught by boundary
    });
});
```

### 3. Resource Errors

```typescript
const [data] = createResource(fetchData);

// Resource errors caught by boundary
<ErrorBoundary fallback={(err) => <div>Failed to load</div>}>
  <Suspense fallback={<Loading />}>
    <DataDisplay data={data()} />
  </Suspense>
</ErrorBoundary>
```

## ✅ Implementation Checklist

- [ ] Add ERROR symbol for context
- [ ] Implement onError for registering handlers
- [ ] Update runComputation to catch errors
- [ ] Implement handleError with escalation
- [ ] Create ErrorBoundary component
- [ ] Add catchError utility
- [ ] Test error propagation
- [ ] Test error recovery

## 🧪 Testing

```typescript
test("error boundary catches errors", () => {
  let errorCaught = false;
  
  createRoot(() => {
    <ErrorBoundary fallback={(err) => {
      errorCaught = true;
      return <div>Error: {err.message}</div>;
    }}>
      <Component />
    </ErrorBoundary>
  });
  
  function Component() {
    createEffect(() => {
      throw new Error("Test error");
    });
  }
  
  expect(errorCaught).toBe(true);
});

test("nested boundaries catch at correct level", () => {
  const errors: string[] = [];
  
  createRoot(() => {
    <ErrorBoundary fallback={(err) => {
      errors.push("outer");
    }}>
      <ErrorBoundary fallback={(err) => {
        errors.push("inner");
      }}>
        <Component />
      </ErrorBoundary>
    </ErrorBoundary>
  });
  
  function Component() {
    createEffect(() => {
      throw new Error("Test");
    });
  }
  
  expect(errors).toEqual(["inner"]); // Caught by inner only
});

test("error reset works", () => {
  const [shouldError, setShouldError] = createSignal(true);
  let resetCalled = false;
  
  <ErrorBoundary fallback={(err, reset) => {
    return <button onClick={() => {
      setShouldError(false);
      reset();
      resetCalled = true;
    }}>Reset</button>;
  }}>
    <Component />
  </ErrorBoundary>
  
  function Component() {
    createEffect(() => {
      if (shouldError()) throw new Error("Test");
    });
  }
  
  // Trigger reset
  // ... click button ...
  
  expect(resetCalled).toBe(true);
});
```

## 🚀 Next Step

Continue to **[11-advanced-features.md](./11-advanced-features.md)** to implement Resources, Suspense, and other advanced features.

---

**💡 Pro Tip**: Always use error boundaries in production. They prevent one component's error from crashing your entire app!
