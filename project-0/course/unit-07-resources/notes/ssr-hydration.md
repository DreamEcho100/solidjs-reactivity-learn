# SSR and Hydration with Resources

## Overview

Server-Side Rendering (SSR) and hydration add complexity to resource management. This guide explains how resources work in SSR contexts and how to properly handle serialization and hydration.

## The SSR Challenge

### Two Environments

**Server:**
- Runs once per request
- Can await promises
- No reactivity needed (static snapshot)
- Must serialize data for client

**Client:**
- Long-running application
- Full reactivity
- Must hydrate from server data
- Should avoid refetching already-loaded data

### The Problem

```typescript
// This works on client but has issues on server
function UserProfile() {
  const [user] = createResource(fetchUser);
  
  return <div>{user()?.name}</div>;
}
```

**Server issues:**
1. Resource is async, HTML might render before data loads
2. No built-in way to wait for resource
3. Can't send promise to client

**Client issues:**
1. After hydration, resource refetches (wasted request)
2. Brief loading state even though server sent data
3. Mismatch between server HTML and client render

## SSR Resource Lifecycle

### Server-Side Flow

```
1. Render starts
   ├─ Component creates resource
   ├─ Resource enters PENDING state
   └─ Suspense increments counter

2. Await resources
   ├─ Framework waits for all Suspense boundaries
   ├─ Resources resolve
   └─ Suspense counters reach 0

3. Render with data
   ├─ Resource in READY state
   ├─ Component renders with data
   └─ Serialize data into HTML

4. Send HTML
   ├─ HTML contains rendered content
   └─ Serialized data embedded in <script> tags
```

### Client-Side Flow

```
1. Parse HTML
   ├─ Browser renders server HTML
   └─ Extract serialized data

2. Hydration starts
   ├─ React/Solid reconstructs component tree
   ├─ Resources created
   └─ Check for serialized data

3. Use serialized data
   ├─ If data exists: set READY state
   ├─ If no data: fetch normally
   └─ Skip loading state

4. Continue reactively
   ├─ Resources work normally from here
   └─ Refetch when source changes
```

## Implementation Strategies

### 1. Async Rendering (Wait for Resources)

```typescript
// Server-side render function
async function renderToString(app: JSX.Element): Promise<string> {
  // Track all pending resources
  const pendingResources: Promise<any>[] = [];
  
  // First pass: trigger all resources
  const html = renderApp(app, {
    onResourceCreated: (promise: Promise<any>) => {
      pendingResources.push(promise);
    }
  });
  
  // Wait for all resources
  if (pendingResources.length > 0) {
    await Promise.all(pendingResources);
    
    // Re-render with data
    return renderApp(app);
  }
  
  return html;
}
```

### 2. Data Serialization

```typescript
// Server: Serialize resource data
interface SerializedResource {
  key: string;
  value: any;
  state: 'ready' | 'errored';
  error?: any;
}

const resourceData: SerializedResource[] = [];

function serializeResource<T>(key: string, resource: Resource<T>) {
  resourceData.push({
    key,
    value: resource(),
    state: resource.state as 'ready' | 'errored',
    error: resource.error
  });
}

// Embed in HTML
const html = `
  <!DOCTYPE html>
  <html>
    <head>...</head>
    <body>
      <div id="root">${appHtml}</div>
      <script id="__RESOURCE_DATA__" type="application/json">
        ${JSON.stringify(resourceData)}
      </script>
      <script src="/app.js"></script>
    </body>
  </html>
`;
```

### 3. Data Hydration

```typescript
// Client: Read serialized data
function getHydrationData(): Map<string, any> {
  const script = document.getElementById('__RESOURCE_DATA__');
  
  if (!script || !script.textContent) {
    return new Map();
  }
  
  try {
    const data: SerializedResource[] = JSON.parse(script.textContent);
    return new Map(data.map(item => [item.key, item]));
  } catch (error) {
    console.error('Failed to parse hydration data:', error);
    return new Map();
  }
}

// Track if we're hydrating
let isHydrating = true;
let hydrationData = getHydrationData();

// After hydration complete
setTimeout(() => {
  isHydrating = false;
  hydrationData.clear();
}, 0);
```

### 4. Resource with Hydration Support

```typescript
function createResource<T, S>(
  source: () => S,
  fetcher: (source: S) => Promise<T>,
  options?: {
    ssrKey?: string;  // Unique key for SSR serialization
    onHydrated?: (value: T) => void;
  }
): ResourceReturn<T> {
  const isServer = typeof window === 'undefined';
  const state = createResourceState<T>();
  
  // Check for hydration data
  if (!isServer && isHydrating && options?.ssrKey) {
    const hydrated = hydrationData.get(options.ssrKey);
    
    if (hydrated) {
      if (hydrated.state === 'ready') {
        state.value = hydrated.value;
        state.state = READY;
        options.onHydrated?.(hydrated.value);
      } else if (hydrated.state === 'errored') {
        state.error = hydrated.error;
        state.state = ERRORED;
      }
      
      // Remove from hydration data (use once)
      hydrationData.delete(options.ssrKey);
    }
  }
  
  // On server, register for serialization
  if (isServer && options?.ssrKey) {
    onServerResourceReady(() => {
      if (state.state === READY || state.state === ERRORED) {
        registerForSerialization(options.ssrKey!, {
          value: state.value,
          error: state.error,
          state: state.state === READY ? 'ready' : 'errored'
        });
      }
    });
  }
  
  // Rest of createResource implementation...
  
  return [read, { mutate, refetch }];
}
```

## Streaming SSR

For progressive rendering, stream HTML as resources resolve:

### 1. Suspense Boundaries as Stream Points

```typescript
async function* renderToStream(app: JSX.Element): AsyncGenerator<string> {
  const suspenseBoundaries = new Map<string, SuspenseBoundary>();
  
  // Render with suspense placeholders
  const initialHtml = renderApp(app, {
    onSuspense: (id: string, boundary: SuspenseBoundary) => {
      suspenseBoundaries.set(id, boundary);
    }
  });
  
  // Send initial HTML
  yield `
    <!DOCTYPE html>
    <html>
      <head>...</head>
      <body>
        <div id="root">${initialHtml}</div>
  `;
  
  // Stream boundaries as they resolve
  for (const [id, boundary] of suspenseBoundaries) {
    await boundary.ready();
    
    const content = renderBoundary(boundary);
    
    yield `
      <template id="${id}-data">${content}</template>
      <script>
        (function() {
          const template = document.getElementById('${id}-data');
          const placeholder = document.getElementById('${id}-placeholder');
          if (template && placeholder) {
            placeholder.replaceWith(template.content);
          }
        })();
      </script>
    `;
  }
  
  yield `
      </body>
    </html>
  `;
}
```

### 2. Resource Data Streaming

```typescript
async function* streamResourceData(
  resources: Map<string, Resource<any>>
): AsyncGenerator<string> {
  for (const [key, resource] of resources) {
    // Wait for resource to resolve
    await resource.loading;
    
    // Stream data chunk
    yield `
      <script>
        window.__RESOURCE_DATA__ = window.__RESOURCE_DATA__ || {};
        window.__RESOURCE_DATA__['${key}'] = ${JSON.stringify({
          value: resource(),
          state: resource.state
        })};
      </script>
    `;
  }
}
```

## Practical Patterns

### Pattern 1: Static Data

Data that doesn't change per-request:

```typescript
// Server
const [staticData] = createResource(fetchStaticData, {
  ssrKey: 'static-data'
});

// This runs once, data is serialized and sent to all clients
```

### Pattern 2: User-Specific Data

Data that changes per-request:

```typescript
// Server (in request handler)
function handleRequest(req: Request) {
  const userId = getUserIdFromSession(req);
  
  const app = (
    <App userId={userId} />
  );
  
  return renderToString(app);
}

// Component
function App(props: { userId: number }) {
  const [user] = createResource(
    () => props.userId,
    fetchUser,
    { ssrKey: `user-${props.userId}` }
  );
  
  return <UserProfile user={user()} />;
}
```

### Pattern 3: Defer Stream

Load some data after initial render:

```typescript
function createResource<T, S>(
  source: () => S,
  fetcher: (source: S) => Promise<T>,
  options?: {
    deferStream?: boolean;  // Don't block initial render
  }
): ResourceReturn<T> {
  const isServer = typeof window === 'undefined';
  
  if (isServer && options?.deferStream) {
    // On server, don't wait for this resource
    // Let it load on client
    return createResource(
      () => false,  // Don't fetch on server
      fetcher
    );
  }
  
  // Normal resource on client
  return createResource(source, fetcher);
}

// Usage
const [slowData] = createResource(
  fetchSlowData,
  { deferStream: true }  // Don't block server render
);
```

### Pattern 4: SSR Load From

Choose where data comes from:

```typescript
function createResource<T, S>(
  source: () => S,
  fetcher: (source: S) => Promise<T>,
  options?: {
    ssrLoadFrom?: 'server' | 'initial' | 'client';
  }
): ResourceReturn<T> {
  const isServer = typeof window === 'undefined';
  const loadFrom = options?.ssrLoadFrom || 'server';
  
  if (loadFrom === 'client' && isServer) {
    // Skip server fetch, load on client
    return createResource(() => false, fetcher);
  }
  
  if (loadFrom === 'initial' && isServer) {
    // Use initial value on server, fetch on client
    return createResource(
      () => false,
      fetcher,
      { initialValue: options.initialValue }
    );
  }
  
  // Normal behavior
  return createResource(source, fetcher);
}
```

## Error Handling in SSR

### 1. Server-Side Errors

```typescript
// Server
try {
  const html = await renderToString(app);
  res.status(200).send(html);
} catch (error) {
  // Resource failed on server
  console.error('SSR error:', error);
  
  // Option 1: Send error page
  res.status(500).send('<div>Error loading page</div>');
  
  // Option 2: Send HTML with error data
  const errorHtml = renderToString(<ErrorPage error={error} />);
  res.status(500).send(errorHtml);
  
  // Option 3: Let client handle it
  const htmlWithoutData = renderToString(app, { skipResources: true });
  res.status(200).send(htmlWithoutData);
}
```

### 2. Serialize Errors

```typescript
// Server: Serialize error state
function serializeResource<T>(key: string, resource: Resource<T>) {
  if (resource.state === 'errored') {
    return {
      key,
      state: 'errored',
      error: {
        message: resource.error.message,
        stack: resource.error.stack
      }
    };
  }
  
  return {
    key,
    state: 'ready',
    value: resource()
  };
}

// Client: Restore error state
if (hydrated.state === 'errored') {
  const error = new Error(hydrated.error.message);
  error.stack = hydrated.error.stack;
  
  state.error = error;
  state.state = ERRORED;
}
```

## Security Considerations

### 1. Sanitize Data

```typescript
function serializeResource<T>(key: string, resource: Resource<T>) {
  const value = resource();
  
  // Remove sensitive fields
  const sanitized = sanitize(value, {
    exclude: ['password', 'token', 'secret']
  });
  
  return {
    key,
    value: sanitized,
    state: 'ready'
  };
}
```

### 2. Validate Hydration Data

```typescript
function getHydrationData(): Map<string, any> {
  try {
    const data = JSON.parse(script.textContent);
    
    // Validate structure
    if (!Array.isArray(data)) {
      throw new Error('Invalid hydration data');
    }
    
    // Validate each entry
    const validated = data.filter(item => 
      typeof item.key === 'string' &&
      ['ready', 'errored'].includes(item.state)
    );
    
    return new Map(validated.map(item => [item.key, item]));
  } catch (error) {
    console.error('Hydration validation failed:', error);
    return new Map();
  }
}
```

### 3. XSS Prevention

```typescript
function embedResourceData(data: any[]): string {
  // Escape to prevent XSS
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
  
  return `
    <script id="__RESOURCE_DATA__" type="application/json">
      ${json}
    </script>
  `;
}
```

## Performance Optimization

### 1. Lazy Hydration

```typescript
// Only hydrate resources when component mounts
function createLazyResource<T, S>(
  source: () => S,
  fetcher: (source: S) => Promise<T>,
  options: { ssrKey: string }
): ResourceReturn<T> {
  const [shouldLoad, setShouldLoad] = createSignal(false);
  
  // On client, delay hydration until component is visible
  if (!isServer) {
    onMount(() => {
      setShouldLoad(true);
    });
  }
  
  return createResource(
    () => shouldLoad() && source(),
    fetcher,
    options
  );
}
```

### 2. Partial Hydration

```typescript
// Only serialize critical data
function createResource<T, S>(
  source: () => S,
  fetcher: (source: S) => Promise<T>,
  options?: {
    ssrCritical?: boolean;  // Only serialize if critical
  }
): ResourceReturn<T> {
  if (isServer && !options?.ssrCritical) {
    // Don't serialize non-critical data
    // Let client fetch it
    return createResource(() => false, fetcher);
  }
  
  // Normal resource for critical data
  return createResource(source, fetcher, options);
}
```

## Summary

SSR with resources requires:

1. **Server**: Await resources, serialize data
2. **Client**: Read serialized data, skip initial fetch
3. **Streaming**: Progressive rendering as data resolves
4. **Security**: Sanitize and validate data
5. **Performance**: Lazy hydration, critical data only

## Key Takeaways

- Resources must handle both server and client environments
- Serialize resolved data in HTML for client hydration
- Use unique keys to match server data with client resources
- Consider streaming for progressive rendering
- Validate and sanitize hydration data
- Optimize by only serializing critical data
- Handle errors gracefully on both server and client
