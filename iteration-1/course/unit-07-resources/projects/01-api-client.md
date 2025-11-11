# Project 1: Full-Featured API Client

## Overview

Build a production-ready API client library using resources, featuring caching, retry logic, optimistic updates, and request deduplication.

## Learning Objectives

- Apply resource patterns to real-world scenarios
- Implement robust error handling and retry logic
- Design clean API abstractions
- Handle concurrent requests efficiently
- Build developer-friendly tooling

## Requirements

### Core Features

1. **Query System**
   - Type-safe query keys
   - Automatic caching with TTL
   - Request deduplication
   - Background refetching

2. **Mutation System**
   - Optimistic updates
   - Automatic cache invalidation
   - Rollback on error
   - Success/error callbacks

3. **Error Handling**
   - Retry with exponential backoff
   - Circuit breaker pattern
   - Error boundaries integration
   - Fallback data

4. **Developer Experience**
   - TypeScript support
   - DevTools integration
   - Query inspector
   - Performance monitoring

## API Design

```typescript
// Create client
const apiClient = createAPIClient({
  baseURL: 'https://api.example.com',
  retry: 3,
  timeout: 5000,
  cache: {
    ttl: 5 * 60 * 1000,
    maxSize: 100
  }
});

// Query
const userQuery = apiClient.query({
  key: ['user', userId()],
  fetcher: ({ key }) => fetch(`/users/${key[1]}`).then(r => r.json()),
  staleTime: 30000,
  retry: 3
});

// Mutation
const updateUserMutation = apiClient.mutation({
  mutationFn: (data: UserUpdate) => 
    fetch('/users/' + data.id, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }).then(r => r.json()),
  
  onSuccess: (result, variables) => {
    // Invalidate user query
    apiClient.invalidate(['user', variables.id]);
  },
  
  optimistic: (variables) => ({
    ...currentUser,
    ...variables
  })
});

// Infinite query
const postsQuery = apiClient.infiniteQuery({
  key: ['posts'],
  fetcher: ({ pageParam = 0 }) =>
    fetch(`/posts?offset=${pageParam}`).then(r => r.json()),
  getNextPageParam: (lastPage) => lastPage.nextOffset
});
```

## Implementation Structure

```
src/
├── core/
│   ├── client.ts           # Main client class
│   ├── query.ts            # Query implementation
│   ├── mutation.ts         # Mutation implementation
│   └── cache.ts            # Cache management
├── utils/
│   ├── retry.ts            # Retry logic
│   ├── dedup.ts            # Request deduplication
│   └── circuitBreaker.ts   # Circuit breaker
├── types/
│   └── index.ts            # TypeScript types
└── devtools/
    ├── inspector.ts        # Query inspector
    └── logger.ts           # Debug logger
```

## Step-by-Step Guide

### Step 1: Core Client

```typescript
interface ClientConfig {
  baseURL: string;
  retry?: number | RetryConfig;
  timeout?: number;
  cache?: CacheConfig;
  headers?: Record<string, string>;
}

class APIClient {
  private cache: CacheManager;
  private deduplicator: RequestDeduplicator;
  private circuitBreaker: CircuitBreaker;
  
  constructor(config: ClientConfig) {
    this.cache = new CacheManager(config.cache);
    this.deduplicator = new RequestDeduplicator();
    this.circuitBreaker = new CircuitBreaker();
  }
  
  query<T>(options: QueryOptions<T>): QueryResult<T> {
    return createQuery(this, options);
  }
  
  mutation<T, V>(options: MutationOptions<T, V>): MutationResult<T, V> {
    return createMutation(this, options);
  }
  
  invalidate(key: any[]): void {
    this.cache.invalidate(key);
  }
}
```

### Step 2: Query Implementation

```typescript
function createQuery<T>(
  client: APIClient,
  options: QueryOptions<T>
): QueryResult<T> {
  const [data, setData] = createSignal<T | undefined>();
  const [error, setError] = createSignal<any>();
  const [status, setStatus] = createSignal<QueryStatus>('idle');
  
  createEffect(() => {
    const key = typeof options.key === 'function' ? options.key() : options.key;
    
    // Check cache
    const cached = client.cache.get(key, options.staleTime);
    if (cached) {
      setData(() => cached);
      setStatus('success');
      return;
    }
    
    // Fetch
    setStatus('loading');
    
    const fetchWithRetry = retry(
      () => options.fetcher({ key }),
      options.retry
    );
    
    const deduplicated = client.deduplicator.wrap(
      JSON.stringify(key),
      fetchWithRetry
    );
    
    deduplicated
      .then(result => {
        client.cache.set(key, result);
        setData(() => result);
        setStatus('success');
      })
      .catch(err => {
        setError(err);
        setStatus('error');
      });
  });
  
  return {
    data,
    error,
    status,
    isLoading: () => status() === 'loading',
    isSuccess: () => status() === 'success',
    isError: () => status() === 'error',
    refetch: () => {/* ... */}
  };
}
```

### Step 3: Mutation Implementation

```typescript
function createMutation<T, V>(
  client: APIClient,
  options: MutationOptions<T, V>
): MutationResult<T, V> {
  const [data, setData] = createSignal<T | undefined>();
  const [error, setError] = createSignal<any>();
  const [status, setStatus] = createSignal<MutationStatus>('idle');
  
  const mutate = async (variables: V) => {
    let rollback: (() => void) | undefined;
    
    try {
      // Optimistic update
      if (options.optimistic) {
        const optimisticData = options.optimistic(variables);
        setData(() => optimisticData);
        
        // TODO: Update cache optimistically
        
        rollback = () => {
          // TODO: Rollback cache
          setData(undefined);
        };
      }
      
      setStatus('loading');
      
      // Execute mutation
      const result = await options.mutationFn(variables);
      
      setData(() => result);
      setStatus('success');
      
      options.onSuccess?.(result, variables);
      
      return result;
    } catch (err) {
      rollback?.();
      
      setError(err);
      setStatus('error');
      
      options.onError?.(err, variables);
      
      throw err;
    } finally {
      options.onSettled?.();
    }
  };
  
  return {
    mutate,
    data,
    error,
    status,
    isLoading: () => status() === 'loading',
    isSuccess: () => status() === 'success',
    isError: () => status() === 'error'
  };
}
```

### Step 4: Cache Manager

```typescript
class CacheManager {
  private cache = new LRUCache<string, CacheEntry>(100);
  
  get(key: any[], staleTime?: number): any | undefined {
    const keyStr = JSON.stringify(key);
    const entry = this.cache.get(keyStr);
    
    if (!entry) return undefined;
    
    if (staleTime) {
      const age = Date.now() - entry.timestamp;
      if (age > staleTime) {
        this.cache.delete(keyStr);
        return undefined;
      }
    }
    
    return entry.value;
  }
  
  set(key: any[], value: any): void {
    const keyStr = JSON.stringify(key);
    this.cache.set(keyStr, {
      value,
      timestamp: Date.now()
    });
  }
  
  invalidate(key: any[]): void {
    const keyStr = JSON.stringify(key);
    this.cache.delete(keyStr);
  }
  
  invalidatePattern(pattern: (key: string) => boolean): void {
    // TODO: Implement pattern invalidation
  }
}
```

### Step 5: DevTools

```typescript
class QueryInspector {
  private queries = new Map<string, QueryInfo>();
  
  register(key: any[], query: QueryResult<any>): void {
    const keyStr = JSON.stringify(key);
    
    this.queries.set(keyStr, {
      key,
      status: query.status,
      data: query.data,
      error: query.error,
      updatedAt: Date.now()
    });
  }
  
  getAll(): QueryInfo[] {
    return Array.from(this.queries.values());
  }
  
  render(): JSX.Element {
    return (
      <div class="query-inspector">
        <h2>Query Inspector</h2>
        <For each={this.getAll()}>
          {query => (
            <div class="query-item">
              <div>Key: {JSON.stringify(query.key)}</div>
              <div>Status: {query.status()}</div>
              <div>Updated: {new Date(query.updatedAt).toLocaleString()}</div>
            </div>
          )}
        </For>
      </div>
    );
  }
}
```

## Testing

```typescript
describe('APIClient', () => {
  it('should cache queries', async () => {
    const client = createAPIClient({ baseURL: '/api' });
    const fetcher = vi.fn(() => Promise.resolve({ id: 1 }));
    
    const query1 = client.query({
      key: ['user', 1],
      fetcher
    });
    
    await waitFor(() => expect(query1.data()).toBeDefined());
    
    const query2 = client.query({
      key: ['user', 1],
      fetcher
    });
    
    expect(query2.data()).toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  
  it('should handle mutations with optimistic updates', async () => {
    const client = createAPIClient({ baseURL: '/api' });
    
    const query = client.query({
      key: ['user', 1],
      fetcher: () => Promise.resolve({ id: 1, name: 'John' })
    });
    
    await waitFor(() => expect(query.data()).toBeDefined());
    
    const mutation = client.mutation({
      mutationFn: (data: any) => Promise.resolve({ ...data }),
      optimistic: (vars) => ({ id: 1, name: vars.name }),
      onSuccess: () => client.invalidate(['user', 1])
    });
    
    mutation.mutate({ name: 'Jane' });
    
    // Should see optimistic update
    expect(query.data()?.name).toBe('Jane');
  });
});
```

## Bonus Features

1. **Pagination Helper**
2. **Infinite Scroll Support**
3. **WebSocket Integration**
4. **Offline Support**
5. **Request/Response Interceptors**
6. **Automatic Batching**
7. **GraphQL Support**

## Deliverables

1. ✅ Working API client library
2. ✅ Comprehensive test suite
3. ✅ TypeScript type definitions
4. ✅ DevTools/inspector component
5. ✅ Documentation and examples
6. ✅ Performance benchmarks

## Evaluation Criteria

- **Functionality**: All features work correctly
- **Performance**: Efficient caching and deduplication
- **Type Safety**: Proper TypeScript types
- **Developer Experience**: Clean API, good error messages
- **Testing**: Comprehensive test coverage
- **Documentation**: Clear usage examples

## Resources

- React Query (inspiration)
- SWR (inspiration)
- Lesson 2: createResource Implementation
- Lesson 4: Advanced Async Patterns
