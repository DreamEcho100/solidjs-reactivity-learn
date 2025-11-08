# Lesson 3: Error Boundaries

## Introduction

Error boundaries provide a way to catch JavaScript errors anywhere in the component tree, log them, and display a fallback UI instead of crashing the entire application. In Solid.js, error handling is built into the reactive system through `catchError` and the legacy `onError`.

## Why Error Boundaries Matter

### Without Error Boundaries

```javascript
function App() {
  const [count, setCount] = createSignal(0);
  
  return (
    <div>
      <Counter count={count()} />
      <button onClick={() => setCount(c => c + 1)}>+</button>
    </div>
  );
}

function Counter(props) {
  // This will crash the entire app when count > 5
  if (props.count > 5) {
    throw new Error('Count too high!');
  }
  return <div>Count: {props.count}</div>;
}
```

**Result:** White screen of death. App is completely broken.

### With Error Boundaries

```javascript
function App() {
  const [count, setCount] = createSignal(0);
  
  return (
    <div>
      <ErrorBoundary fallback={(err) => <div>Error: {err.message}</div>}>
        <Counter count={count()} />
      </ErrorBoundary>
      <button onClick={() => setCount(c => c + 1)}>+</button>
    </div>
  );
}
```

**Result:** Error is caught, fallback UI is shown, rest of app still works.

## catchError Implementation

### From signal.ts

```typescript
export function catchError<T>(fn: () => T, handler: (err: Error) => void) {
  ERROR || (ERROR = Symbol("error"));
  Owner = createComputation(undefined!, undefined, true);
  Owner.context = { ...Owner.context, [ERROR]: [handler] };
  if (Transition && Transition.running) Transition.sources.add(Owner as Memo<any>);
  try {
    return fn();
  } catch (err) {
    handleError(err);
  } finally {
    Owner = Owner.owner;
  }
}
```

**How it works:**
1. Creates a new computation (Owner) to establish error boundary
2. Adds error handler to Owner's context using ERROR symbol
3. Runs the function, catching any errors
4. If error occurs, calls `handleError` which walks up ownership tree
5. Restores previous Owner

### Error Handler Lookup

```typescript
function handleError(err: unknown, owner = Owner) {
  const fns = ERROR && owner && owner.context && owner.context[ERROR];
  const error = castError(err);
  if (!fns) throw error;  // No handler found, re-throw

  if (Effects)
    Effects.push({
      fn() {
        runErrors(error, fns, owner);
      },
      state: STALE
    } as unknown as Computation<any>);
  else runErrors(error, fns, owner);
}
```

**Process:**
1. Look for error handlers in current owner's context
2. If not found, throw (will bubble to next handler or window)
3. If found, schedule error handler to run
4. Handlers run in Effects queue to avoid interrupting current execution

## Building an ErrorBoundary Component

### Basic Error Boundary

```javascript
import { catchError, createSignal, JSX } from 'solid-js';

function ErrorBoundary(props: {
  fallback: (err: Error, reset: () => void) => JSX.Element;
  children: JSX.Element;
}) {
  const [error, setError] = createSignal<Error>();
  
  const reset = () => setError(undefined);
  
  return (
    <Show
      when={!error()}
      fallback={props.fallback(error()!, reset)}
    >
      {catchError(() => props.children, setError)}
    </Show>
  );
}

// Usage
<ErrorBoundary fallback={(err, reset) => (
  <div>
    <h1>Something went wrong!</h1>
    <p>{err.message}</p>
    <button onClick={reset}>Try again</button>
  </div>
)}>
  <App />
</ErrorBoundary>
```

### Error Boundary with Logging

```javascript
function ErrorBoundary(props) {
  const [error, setError] = createSignal();
  
  createEffect(() => {
    const err = error();
    if (err) {
      // Log to error tracking service
      console.error('Error caught:', err);
      logErrorToService(err);
    }
  });
  
  const reset = () => setError(undefined);
  
  return (
    <Show
      when={!error()}
      fallback={props.fallback(error()!, reset)}
    >
      {catchError(() => props.children, setError)}
    </Show>
  );
}
```

### Error Boundary with Retry Logic

```javascript
function ErrorBoundary(props) {
  const [error, setError] = createSignal();
  const [retryCount, setRetryCount] = createSignal(0);
  
  const reset = () => {
    setError(undefined);
    setRetryCount(c => c + 1);
  };
  
  createEffect(() => {
    if (retryCount() > 3) {
      console.error('Too many retries, giving up');
    }
  });
  
  return (
    <Show
      when={!error()}
      fallback={props.fallback(error()!, reset, retryCount())}
    >
      {catchError(() => props.children, setError)}
    </Show>
  );
}

// Usage
<ErrorBoundary 
  fallback={(err, reset, retries) => (
    <div>
      <p>Error: {err.message}</p>
      <Show when={retries < 3}>
        <button onClick={reset}>
          Retry ({retries}/3)
        </button>
      </Show>
      <Show when={retries >= 3}>
        <p>Too many retries. Please refresh the page.</p>
      </Show>
    </div>
  )}
>
  <App />
</ErrorBoundary>
```

## Error Propagation

### Nested Error Boundaries

```javascript
function App() {
  return (
    <ErrorBoundary fallback={(err) => <div>App Error: {err.message}</div>}>
      <div>
        <h1>My App</h1>
        
        <ErrorBoundary fallback={(err) => <div>Sidebar Error: {err.message}</div>}>
          <Sidebar />
        </ErrorBoundary>
        
        <ErrorBoundary fallback={(err) => <div>Content Error: {err.message}</div>}>
          <Content />
        </ErrorBoundary>
      </div>
    </ErrorBoundary>
  );
}
```

**Behavior:**
- Errors in `<Sidebar />` are caught by inner boundary
- Errors in `<Content />` are caught by its inner boundary
- Errors outside inner boundaries are caught by outer boundary
- Each boundary isolates its subtree

### Re-throwing Errors

```javascript
function ErrorBoundary(props) {
  const [error, setError] = createSignal();
  
  const handleError = (err) => {
    // Log error
    console.error('Caught error:', err);
    
    // Re-throw critical errors
    if (err.message.includes('CRITICAL')) {
      throw err;  // Will bubble to parent error boundary
    }
    
    setError(err);
  };
  
  return (
    <Show when={!error()} fallback={props.fallback(error()!)}>
      {catchError(() => props.children, handleError)}
    </Show>
  );
}
```

## Async Error Handling

### Errors in Promises

```javascript
function Component() {
  const [data, setData] = createSignal();
  
  onMount(async () => {
    try {
      const result = await fetch('/api/data');
      setData(await result.json());
    } catch (err) {
      // Promise rejections don't trigger catchError automatically!
      // You must handle them explicitly
      throw err;  // This will work
    }
  });
  
  return <div>{JSON.stringify(data())}</div>;
}
```

### Error Boundaries with Resources

```javascript
function Component() {
  const [data] = createResource(() => fetchData());
  
  return (
    <ErrorBoundary fallback={(err) => <div>Failed to load: {err.message}</div>}>
      <Show when={data()}>
        <div>{data().title}</div>
      </Show>
    </ErrorBoundary>
  );
}

async function fetchData() {
  const response = await fetch('/api/data');
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);  // Will be caught!
  }
  return response.json();
}
```

## The onError API (Deprecated)

### Legacy onError

```typescript
/** @deprecated - use catchError instead */
export function onError(fn: (err: Error) => void): void {
  ERROR || (ERROR = Symbol("error"));
  if (Owner === null) {
    console.warn("error handlers created outside a `createRoot` or `render` will never be run");
  } else if (Owner.context === null || !Owner.context[ERROR]) {
    Owner.context = { ...Owner.context, [ERROR]: [fn] };
    mutateContext(Owner, ERROR, [fn]);
  } else Owner.context[ERROR].push(fn);
}
```

**Why deprecated:**
- `onError` adds handler to current context
- `catchError` creates new boundary scope
- `catchError` is more predictable and composable

### Migration from onError to catchError

```javascript
// OLD: onError
function Component() {
  onError((err) => {
    console.error('Error:', err);
  });
  
  return <div>...</div>;
}

// NEW: catchError
function Component() {
  return catchError(
    () => <div>...</div>,
    (err) => {
      console.error('Error:', err);
    }
  );
}

// BETTER: ErrorBoundary component
<ErrorBoundary fallback={(err) => <div>Error: {err.message}</div>}>
  <Component />
</ErrorBoundary>
```

## Error Recovery Patterns

### Pattern 1: Automatic Retry

```javascript
function ErrorBoundary(props) {
  const [error, setError] = createSignal();
  const [retryKey, setRetryKey] = createSignal(0);
  
  createEffect(() => {
    const err = error();
    if (err && props.autoRetry) {
      const timer = setTimeout(() => {
        console.log('Auto-retrying...');
        reset();
      }, props.retryDelay || 3000);
      
      onCleanup(() => clearTimeout(timer));
    }
  });
  
  const reset = () => {
    setError(undefined);
    setRetryKey(k => k + 1);
  };
  
  return (
    <Show when={!error()} fallback={props.fallback(error()!, reset)}>
      <div key={retryKey()}>
        {catchError(() => props.children, setError)}
      </div>
    </Show>
  );
}

// Usage
<ErrorBoundary 
  autoRetry 
  retryDelay={5000}
  fallback={(err, reset) => (
    <div>
      <p>Error: {err.message}</p>
      <p>Retrying in 5 seconds...</p>
      <button onClick={reset}>Retry now</button>
    </div>
  )}
>
  <App />
</ErrorBoundary>
```

### Pattern 2: Partial Recovery

```javascript
function DataDisplay() {
  const [users] = createResource(fetchUsers);
  const [posts] = createResource(fetchPosts);
  
  return (
    <div>
      <ErrorBoundary fallback={(err) => <div>Users failed: {err.message}</div>}>
        <Show when={users()}>
          <UserList users={users()} />
        </Show>
      </ErrorBoundary>
      
      <ErrorBoundary fallback={(err) => <div>Posts failed: {err.message}</div>}>
        <Show when={posts()}>
          <PostList posts={posts()} />
        </Show>
      </ErrorBoundary>
    </div>
  );
}
```

**Result:** If users fail, posts still load. Each section is independently resilient.

### Pattern 3: Degraded Mode

```javascript
function App() {
  const [degraded, setDegraded] = createSignal(false);
  
  const handleError = (err) => {
    console.error('Critical feature failed:', err);
    setDegraded(true);
  };
  
  return (
    <div>
      <Show when={!degraded()} fallback={<SimplifiedUI />}>
        <ErrorBoundary fallback={(err, reset) => {
          handleError(err);
          return <div>Switching to simplified mode...</div>;
        }}>
          <AdvancedUI />
        </ErrorBoundary>
      </Show>
    </div>
  );
}
```

## Development vs Production

### Different Fallbacks

```javascript
const isDev = import.meta.env.DEV;

function ErrorBoundary(props) {
  const [error, setError] = createSignal();
  
  const reset = () => setError(undefined);
  
  const fallback = (err) => {
    if (isDev) {
      // Detailed error in development
      return (
        <div style={{ background: 'red', color: 'white', padding: '20px' }}>
          <h1>Error in Development</h1>
          <h2>{err.message}</h2>
          <pre>{err.stack}</pre>
          <button onClick={reset}>Reset</button>
        </div>
      );
    } else {
      // User-friendly error in production
      return (
        <div>
          <h2>Something went wrong</h2>
          <p>We're working on fixing this issue.</p>
          <button onClick={reset}>Try again</button>
        </div>
      );
    }
  };
  
  return (
    <Show when={!error()} fallback={fallback(error()!)}>
      {catchError(() => props.children, setError)}
    </Show>
  );
}
```

### Error Reporting

```javascript
function ErrorBoundary(props) {
  const [error, setError] = createSignal();
  
  createEffect(() => {
    const err = error();
    if (err) {
      // Report to error tracking service
      if (!isDev) {
        reportError({
          message: err.message,
          stack: err.stack,
          componentStack: getComponentStack(),
          userAgent: navigator.userAgent,
          url: window.location.href
        });
      }
    }
  });
  
  return (
    <Show when={!error()} fallback={props.fallback(error()!)}>
      {catchError(() => props.children, setError)}
    </Show>
  );
}

async function reportError(errorInfo) {
  try {
    await fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorInfo)
    });
  } catch (reportErr) {
    console.error('Failed to report error:', reportErr);
  }
}
```

## Testing Error Boundaries

### Unit Tests

```javascript
import { render } from 'solid-js/web';

describe('ErrorBoundary', () => {
  it('catches errors and shows fallback', () => {
    const ThrowError = () => {
      throw new Error('Test error');
    };
    
    const container = document.createElement('div');
    
    render(() => (
      <ErrorBoundary fallback={(err) => <div>Error: {err.message}</div>}>
        <ThrowError />
      </ErrorBoundary>
    ), container);
    
    expect(container.textContent).toBe('Error: Test error');
  });
  
  it('resets error on button click', () => {
    const ThrowError = (props) => {
      if (!props.safe) throw new Error('Test error');
      return <div>Safe</div>;
    };
    
    const [safe, setSafe] = createSignal(false);
    const container = document.createElement('div');
    
    render(() => (
      <ErrorBoundary fallback={(err, reset) => (
        <button onClick={reset}>Reset</button>
      )}>
        <ThrowError safe={safe()} />
      </ErrorBoundary>
    ), container);
    
    expect(container.querySelector('button')).toBeTruthy();
    
    setSafe(true);
    container.querySelector('button').click();
    
    expect(container.textContent).toBe('Safe');
  });
});
```

## Best Practices

### 1. Granular Error Boundaries

```javascript
// ❌ Too coarse - one error breaks everything
<ErrorBoundary>
  <App />
</ErrorBoundary>

// ✅ Better - isolate critical sections
<div>
  <ErrorBoundary fallback={<Header />}>
    <Header />
  </ErrorBoundary>
  
  <ErrorBoundary fallback={<div>Sidebar error</div>}>
    <Sidebar />
  </ErrorBoundary>
  
  <ErrorBoundary fallback={<div>Content error</div>}>
    <Content />
  </ErrorBoundary>
</div>
```

### 2. Meaningful Fallbacks

```javascript
// ❌ Generic error message
<ErrorBoundary fallback={() => <div>Error</div>}>

// ✅ Contextual fallback
<ErrorBoundary fallback={(err, reset) => (
  <div class="error-card">
    <Icon name="error" />
    <h3>Unable to load user profile</h3>
    <p>We couldn't load the profile data. This might be a temporary issue.</p>
    <button onClick={reset}>Try again</button>
    <Link href="/">Go home</Link>
  </div>
)}>
  <UserProfile />
</ErrorBoundary>
```

### 3. Always Provide Reset

```javascript
// ❌ No way to recover
<ErrorBoundary fallback={(err) => <div>{err.message}</div>}>

// ✅ Let users try to recover
<ErrorBoundary fallback={(err, reset) => (
  <div>
    <p>{err.message}</p>
    <button onClick={reset}>Try again</button>
  </div>
)}>
```

### 4. Log Errors

```javascript
// ✅ Always log errors for debugging
function ErrorBoundary(props) {
  const [error, setError] = createSignal();
  
  const handleError = (err) => {
    console.error('Error caught:', err);
    setError(err);
  };
  
  return (
    <Show when={!error()} fallback={props.fallback(error()!)}>
      {catchError(() => props.children, handleError)}
    </Show>
  );
}
```

## Common Patterns

### Global Error Boundary

```javascript
function App() {
  return (
    <ErrorBoundary 
      fallback={(err, reset) => (
        <div class="global-error">
          <h1>Oops! Something went wrong</h1>
          <p>{isDev ? err.message : 'Please try again later'}</p>
          <button onClick={reset}>Reload</button>
        </div>
      )}
    >
      <Router>
        <Routes>
          <Route path="/" component={Home} />
          <Route path="/about" component={About} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}
```

### Route-Level Error Boundaries

```javascript
function Routes() {
  return (
    <Switch>
      <Route path="/">
        <ErrorBoundary fallback={<HomeError />}>
          <Home />
        </ErrorBoundary>
      </Route>
      
      <Route path="/profile">
        <ErrorBoundary fallback={<ProfileError />}>
          <Profile />
        </ErrorBoundary>
      </Route>
    </Switch>
  );
}
```

## Summary

- `catchError` creates error boundaries in the reactive graph
- Error handlers are stored in Owner.context
- Errors bubble up ownership tree until caught
- Provide meaningful fallbacks with reset capability
- Use granular boundaries to isolate failures
- Log and report errors appropriately
- Test error boundary behavior

## Next Steps

In Lesson 4, we'll explore advanced component patterns including compound components, render props, and dynamic component loading.

## Further Reading

- [Solid.js Error Handling](https://docs.solidjs.com/reference/reactive-utilities/catch-error)
- [React Error Boundaries (for comparison)](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
- Source: `packages/solid/src/reactive/signal.ts` (catchError, handleError, onError)
