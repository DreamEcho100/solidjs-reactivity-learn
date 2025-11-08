# Lesson 4: Production Patterns

## Introduction

Deploying reactive applications to production requires careful consideration of SSR, hydration, error handling, testing, and monitoring. This lesson covers production-ready patterns and best practices.

## Server-Side Rendering (SSR)

### Understanding Hydration

**The SSR Flow:**

```
Server:
1. Render app to HTML string
2. Serialize state
3. Send HTML + state to client

Client:
1. Parse HTML (immediate paint)
2. Load JavaScript
3. Hydrate reactive system
4. Attach event listeners
5. Resume interactivity
```

### Implementing SSR

```javascript
// server.js
import { renderToString } from 'solid-js/web';
import { createSignal } from 'solid-js';

function App() {
  const [count, setCount] = createSignal(0);
  
  return (
    <div>
      <h1>Count: {count()}</h1>
      <button onClick={() => setCount(c => c + 1)}>
        Increment
      </button>
    </div>
  );
}

// Render on server
const html = renderToString(() => <App />);

const document = `
<!DOCTYPE html>
<html>
<head>
  <title>SSR App</title>
</head>
<body>
  <div id="app">${html}</div>
  <script src="/client.js"></script>
</body>
</html>
`;

// Send to client
res.send(document);
```

```javascript
// client.js
import { hydrate } from 'solid-js/web';

function App() {
  const [count, setCount] = createSignal(0);
  
  return (
    <div>
      <h1>Count: {count()}</h1>
      <button onClick={() => setCount(c => c + 1)}>
        Increment
      </button>
    </div>
  );
}

// Hydrate existing HTML
hydrate(() => <App />, document.getElementById('app'));
```

### State Serialization

```javascript
// Server: Serialize state
function serializeState(state) {
  return JSON.stringify({
    count: state.count(),
    user: state.user(),
    // ... other state
  });
}

const initialState = { count: 42, user: { name: 'John' } };
const stateScript = `
  window.__INITIAL_STATE__ = ${serializeState(initialState)};
`;

const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <script>${stateScript}</script>
  </head>
  <body>
    <div id="app">${renderToString(() => <App initialState={initialState} />)}</div>
  </body>
  </html>
`;
```

```javascript
// Client: Hydrate with state
function App({ initialState }) {
  const [count, setCount] = createSignal(
    typeof window !== 'undefined' && window.__INITIAL_STATE__
      ? window.__INITIAL_STATE__.count
      : initialState?.count ?? 0
  );
  
  return <div>Count: {count()}</div>;
}
```

### Async Data with Resources

```javascript
// Server
import { renderToStringAsync } from 'solid-js/web';

function App() {
  const [data] = createResource(() => fetchData());
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div>{data()}</div>
    </Suspense>
  );
}

// Wait for all resources to load
const html = await renderToStringAsync(() => <App />);
```

### Isomorphic Code Patterns

```javascript
// Check environment
const isServer = typeof window === 'undefined';
const isBrowser = typeof window !== 'undefined';

// Conditional imports
const API_URL = isServer 
  ? process.env.API_URL_SERVER 
  : process.env.API_URL_CLIENT;

// Browser-only code
createEffect(() => {
  if (isBrowser) {
    // Only runs on client
    localStorage.setItem('key', value);
  }
});

// Server-only code
if (isServer) {
  // Setup server-specific things
  setupDatabaseConnection();
}
```

### Streaming SSR

```javascript
// Server - Stream HTML as it's generated
import { renderToStream } from 'solid-js/web';

app.get('/', async (req, res) => {
  const stream = renderToStream(() => <App />);
  
  res.setHeader('Content-Type', 'text/html');
  res.write('<!DOCTYPE html><html><head><title>App</title></head><body>');
  
  for await (const chunk of stream) {
    res.write(chunk);
  }
  
  res.write('</body></html>');
  res.end();
});
```

## Error Handling at Scale

### Error Boundaries

```javascript
// Error boundary component
function ErrorBoundary(props) {
  return (
    <ErrorBoundary
      fallback={(err, reset) => (
        <div class="error-container">
          <h1>Something went wrong</h1>
          <p>{err.message}</p>
          <button onClick={reset}>Try Again</button>
          
          {import.meta.env.DEV && (
            <pre>{err.stack}</pre>
          )}
        </div>
      )}
    >
      {props.children}
    </ErrorBoundary>
  );
}

// Usage - wrap risky components
function App() {
  return (
    <div>
      <Header />
      
      <ErrorBoundary>
        <MainContent />
      </ErrorBoundary>
      
      <ErrorBoundary>
        <Sidebar />
      </ErrorBoundary>
      
      <Footer />
    </div>
  );
}
```

### Global Error Handler

```javascript
// Catch all errors
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  
  // Log to error tracking service
  errorTracker.log({
    message: event.error.message,
    stack: event.error.stack,
    url: window.location.href,
    timestamp: Date.now()
  });
  
  // Show user-friendly message
  showErrorNotification('An error occurred. Please refresh the page.');
});

// Catch unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled rejection:', event.reason);
  
  errorTracker.log({
    message: event.reason.message || 'Unhandled promise rejection',
    stack: event.reason.stack,
    url: window.location.href,
    timestamp: Date.now()
  });
});
```

### Graceful Degradation

```javascript
// Fallback for failed resources
function DataComponent() {
  const [data] = createResource(fetchData);
  
  return (
    <ErrorBoundary
      fallback={(err) => (
        <div>
          <p>Failed to load data</p>
          <button onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      )}
    >
      <Suspense fallback={<Spinner />}>
        <Show when={data()} fallback={<EmptyState />}>
          <DataDisplay data={data()} />
        </Show>
      </Suspense>
    </ErrorBoundary>
  );
}
```

### Error Recovery Strategies

```javascript
// Retry with exponential backoff
function createResilientResource(fetcher, options = {}) {
  const { maxRetries = 3, baseDelay = 1000 } = options;
  
  const [retryCount, setRetryCount] = createSignal(0);
  
  const [data] = createResource(
    retryCount,
    async () => {
      let lastError;
      
      for (let i = 0; i <= maxRetries; i++) {
        try {
          return await fetcher();
        } catch (err) {
          lastError = err;
          
          if (i < maxRetries) {
            const delay = baseDelay * Math.pow(2, i);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      throw lastError;
    }
  );
  
  const retry = () => setRetryCount(c => c + 1);
  
  return [data, retry];
}

// Usage
const [data, retry] = createResilientResource(() => fetch('/api/data'));

<Show when={data.error}>
  <button onClick={retry}>Retry</button>
</Show>
```

## Testing Reactive Code

### Unit Testing Signals

```javascript
import { createRoot, createSignal, createEffect } from 'solid-js';
import { describe, it, expect } from 'vitest';

describe('Signal behavior', () => {
  it('updates dependents when changed', () => {
    createRoot(dispose => {
      const [count, setCount] = createSignal(0);
      let effectRuns = 0;
      
      createEffect(() => {
        count();
        effectRuns++;
      });
      
      expect(effectRuns).toBe(1);
      
      setCount(1);
      expect(effectRuns).toBe(2);
      
      setCount(1); // Same value
      expect(effectRuns).toBe(2); // Should not re-run
      
      dispose();
    });
  });
  
  it('handles batch updates', () => {
    createRoot(dispose => {
      const [a, setA] = createSignal(0);
      const [b, setB] = createSignal(0);
      let effectRuns = 0;
      
      createEffect(() => {
        a();
        b();
        effectRuns++;
      });
      
      expect(effectRuns).toBe(1);
      
      batch(() => {
        setA(1);
        setB(2);
      });
      
      expect(effectRuns).toBe(2); // Only one additional run
      
      dispose();
    });
  });
});
```

### Integration Testing

```javascript
import { render, fireEvent, screen } from '@solidjs/testing-library';
import { describe, it, expect } from 'vitest';

describe('Counter component', () => {
  it('increments when clicked', async () => {
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
    
    render(() => <Counter />);
    
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    
    await fireEvent.click(screen.getByTestId('increment'));
    
    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });
});
```

### Testing Async Behavior

```javascript
describe('Resource loading', () => {
  it('handles loading and success states', async () => {
    const fetchData = vi.fn(() => 
      Promise.resolve({ name: 'John' })
    );
    
    function DataComponent() {
      const [data] = createResource(fetchData);
      
      return (
        <div>
          <Show when={data.loading}>
            <span data-testid="loading">Loading...</span>
          </Show>
          <Show when={data()}>
            <span data-testid="data">{data().name}</span>
          </Show>
        </div>
      );
    }
    
    render(() => <DataComponent />);
    
    expect(screen.getByTestId('loading')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByTestId('data')).toHaveTextContent('John');
    });
    
    expect(fetchData).toHaveBeenCalledTimes(1);
  });
});
```

### Snapshot Testing

```javascript
describe('Component snapshots', () => {
  it('matches snapshot', () => {
    function Card({ title, content }) {
      return (
        <div class="card">
          <h2>{title}</h2>
          <p>{content}</p>
        </div>
      );
    }
    
    const { container } = render(() => (
      <Card title="Test" content="Content" />
    ));
    
    expect(container).toMatchSnapshot();
  });
});
```

### Performance Testing

```javascript
describe('Performance', () => {
  it('updates efficiently', () => {
    createRoot(dispose => {
      const [items, setItems] = createSignal(
        Array.from({ length: 1000 }, (_, i) => i)
      );
      
      let updateCount = 0;
      
      createEffect(() => {
        items();
        updateCount++;
      });
      
      const start = performance.now();
      
      // Add item
      setItems(prev => [...prev, 1000]);
      
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(10); // Should be fast
      expect(updateCount).toBe(2); // Initial + update
      
      dispose();
    });
  });
});
```

## Production Deployment

### Build Configuration

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solidPlugin()],
  
  build: {
    // Target modern browsers
    target: 'es2020',
    
    // Minify
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.logs
        drop_debugger: true
      }
    },
    
    // Code splitting
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['solid-js'],
          utils: ['./src/utils']
        }
      }
    },
    
    // Source maps for production debugging
    sourcemap: true
  },
  
  // Environment variables
  define: {
    'import.meta.env.API_URL': JSON.stringify(process.env.API_URL)
  }
});
```

### Environment Configuration

```javascript
// config.js
const config = {
  development: {
    apiUrl: 'http://localhost:3000',
    debug: true,
    enableDevTools: true
  },
  
  staging: {
    apiUrl: 'https://staging-api.example.com',
    debug: true,
    enableDevTools: false
  },
  
  production: {
    apiUrl: 'https://api.example.com',
    debug: false,
    enableDevTools: false
  }
};

export default config[import.meta.env.MODE] || config.production;
```

### Performance Monitoring

```javascript
// monitoring.js
class PerformanceMonitor {
  constructor() {
    this.metrics = [];
  }
  
  trackPageLoad() {
    window.addEventListener('load', () => {
      const perfData = performance.getEntriesByType('navigation')[0];
      
      this.report('page-load', {
        dns: perfData.domainLookupEnd - perfData.domainLookupStart,
        tcp: perfData.connectEnd - perfData.connectStart,
        request: perfData.responseStart - perfData.requestStart,
        response: perfData.responseEnd - perfData.responseStart,
        dom: perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart,
        total: perfData.loadEventEnd - perfData.fetchStart
      });
    });
  }
  
  trackInteraction(name, fn) {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    
    this.report('interaction', { name, duration });
    
    return result;
  }
  
  trackRender(component, fn) {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    
    this.report('render', { component, duration });
    
    return result;
  }
  
  report(type, data) {
    this.metrics.push({ type, data, timestamp: Date.now() });
    
    // Send to analytics service
    if (this.metrics.length >= 10) {
      this.flush();
    }
  }
  
  flush() {
    if (this.metrics.length === 0) return;
    
    fetch('/api/metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.metrics)
    });
    
    this.metrics = [];
  }
}

export const monitor = new PerformanceMonitor();
monitor.trackPageLoad();
```

### Error Tracking

```javascript
// error-tracker.js
class ErrorTracker {
  constructor(config) {
    this.config = config;
    this.queue = [];
    
    this.setupListeners();
  }
  
  setupListeners() {
    window.addEventListener('error', (event) => {
      this.log({
        type: 'error',
        message: event.error.message,
        stack: event.error.stack,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    });
    
    window.addEventListener('unhandledrejection', (event) => {
      this.log({
        type: 'unhandled-rejection',
        reason: event.reason,
        promise: String(event.promise)
      });
    });
  }
  
  log(error) {
    const enriched = {
      ...error,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: Date.now(),
      userId: this.getUserId(),
      sessionId: this.getSessionId()
    };
    
    this.queue.push(enriched);
    
    if (this.queue.length >= 5) {
      this.flush();
    }
  }
  
  async flush() {
    if (this.queue.length === 0) return;
    
    const errors = [...this.queue];
    this.queue = [];
    
    try {
      await fetch(this.config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errors)
      });
    } catch (err) {
      console.error('Failed to send errors:', err);
      // Put errors back in queue
      this.queue.unshift(...errors);
    }
  }
  
  getUserId() {
    return localStorage.getItem('userId') || 'anonymous';
  }
  
  getSessionId() {
    let sessionId = sessionStorage.getItem('sessionId');
    if (!sessionId) {
      sessionId = Math.random().toString(36).substring(7);
      sessionStorage.setItem('sessionId', sessionId);
    }
    return sessionId;
  }
}

export const errorTracker = new ErrorTracker({
  endpoint: '/api/errors'
});
```

## Deployment Checklist

### Pre-Deployment

- [ ] All tests passing
- [ ] Performance benchmarks met
- [ ] Bundle size within limits
- [ ] Lighthouse score > 90
- [ ] Accessibility audit passed
- [ ] Security audit passed
- [ ] Browser compatibility tested
- [ ] Mobile responsiveness verified
- [ ] Error tracking configured
- [ ] Analytics configured

### Build Optimization

- [ ] Dead code eliminated
- [ ] Tree shaking enabled
- [ ] Code splitting configured
- [ ] Images optimized
- [ ] Fonts optimized
- [ ] CSS purged
- [ ] Source maps generated
- [ ] Compression enabled (gzip/brotli)

### Runtime Optimization

- [ ] Lazy loading implemented
- [ ] Caching strategy defined
- [ ] CDN configured
- [ ] Service worker installed
- [ ] Resource hints added
- [ ] Critical CSS inlined

### Monitoring

- [ ] Error tracking active
- [ ] Performance monitoring active
- [ ] User analytics configured
- [ ] Uptime monitoring configured
- [ ] Alerts configured

## Best Practices Summary

### Development

```javascript
// ✅ Use development mode during development
if (import.meta.env.DEV) {
  // Dev-only code
}

// ✅ Name your signals and effects
const [count, setCount] = createSignal(0, { name: 'counter' });

// ✅ Use TypeScript for type safety
const [user, setUser] = createSignal<User | null>(null);
```

### Production

```javascript
// ✅ Remove console.logs in production
const log = import.meta.env.DEV ? console.log : () => {};

// ✅ Use error boundaries
<ErrorBoundary fallback={ErrorFallback}>
  <App />
</ErrorBoundary>

// ✅ Handle async errors
const [data] = createResource(fetchData, {
  onError: (err) => errorTracker.log(err)
});
```

### Testing

```javascript
// ✅ Test reactive behavior
createRoot(dispose => {
  // Test code
  dispose();
});

// ✅ Test edge cases
it('handles empty state', () => {});
it('handles error state', () => {});
it('handles loading state', () => {});
```

## Summary

**Production readiness requires:**

1. **SSR** for performance and SEO
2. **Error handling** for reliability
3. **Testing** for confidence
4. **Monitoring** for insights
5. **Optimization** for speed

**Remember:** Production is where your code meets real users. Take it seriously!

## Next Steps

- **Exercise 1:** Deploy a production app
- **Exercise 2:** Implement monitoring
- **Unit 11:** Build your own reactive library
