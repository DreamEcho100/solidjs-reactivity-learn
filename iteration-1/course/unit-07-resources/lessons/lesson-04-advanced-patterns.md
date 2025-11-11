# Lesson 4: Advanced Async Patterns

## Introduction

Now that we understand resources and Suspense, let's explore advanced patterns for real-world async data management. We'll cover parallel fetching, dependent resources, caching strategies, optimistic updates, prefetching, and error recovery.

## Pattern 1: Parallel Data Fetching

### The Problem

Sequential fetching wastes time:

```typescript
// BAD: Sequential - Total time = sum of all fetches
const [user] = createResource(fetchUser);
const [posts] = createResource(() => user()?.id, fetchPosts);
// User loads (2s) → then Posts load (1s) = 3s total
```

### The Solution: Parallel Fetching

```typescript
// GOOD: Parallel - Total time = max of all fetches
const [userId] = createSignal(1);
const [user] = createResource(userId, fetchUser);
const [posts] = createResource(userId, fetchPosts);
// Both load simultaneously = 2s total (max of 2s and 1s)
```

### Implementation

```typescript
function UserDashboard(props: { userId: number }) {
  // All start fetching immediately in parallel
  const [user] = createResource(() => props.userId, fetchUser);
  const [posts] = createResource(() => props.userId, fetchPosts);
  const [followers] = createResource(() => props.userId, fetchFollowers);
  const [settings] = createResource(() => props.userId, fetchSettings);
  
  // Single Suspense waits for all
  return (
    <Suspense fallback={<DashboardLoader />}>
      <div class="dashboard">
        <UserHeader user={user()} />
        <UserStats 
          posts={posts()} 
          followers={followers()} 
        />
        <UserSettings settings={settings()} />
      </div>
    </Suspense>
  );
}
```

### Partial Loading Pattern

Show what's ready without waiting for everything:

```typescript
function UserDashboard(props: { userId: number }) {
  const [user] = createResource(() => props.userId, fetchUser);
  const [posts] = createResource(() => props.userId, fetchPosts);
  const [followers] = createResource(() => props.userId, fetchFollowers);
  
  return (
    <div>
      {/* User header loads first */}
      <Suspense fallback={<HeaderSkeleton />}>
        <UserHeader user={user()} />
      </Suspense>
      
      {/* Posts can load independently */}
      <Suspense fallback={<PostsSkeleton />}>
        <PostsList posts={posts()} />
      </Suspense>
      
      {/* Followers load separately */}
      <Suspense fallback={<FollowersSkeleton />}>
        <FollowersList followers={followers()} />
      </Suspense>
    </div>
  );
}
```

## Pattern 2: Dependent/Waterfall Resources

### When Dependencies Are Necessary

```typescript
function UserPosts(props: { userId: number }) {
  // Step 1: Fetch user
  const [user] = createResource(() => props.userId, fetchUser);
  
  // Step 2: Fetch posts using user data
  const [posts] = createResource(
    () => {
      const u = user();
      return u ? { userId: u.id, team: u.team } : false;
    },
    async ({ userId, team }) => {
      // Use user data in the fetch
      return fetchPosts(userId, { team });
    }
  );
  
  return (
    <Suspense fallback={<Loading />}>
      <div>
        <h1>{user().name}'s Posts</h1>
        <For each={posts()}>
          {post => <Post data={post} />}
        </For>
      </div>
    </Suspense>
  );
}
```

### Avoiding Unnecessary Waterfalls

```typescript
// BAD: Unnecessary waterfall
const [user] = createResource(fetchUser);
const [posts] = createResource(() => user()?.id, fetchPosts);
// If posts doesn't actually need user data, this is wasteful

// GOOD: Fetch in parallel when possible
const [userId] = createSignal(1);
const [user] = createResource(userId, fetchUser);
const [posts] = createResource(userId, fetchPosts);
```

### Optimizing Waterfalls

```typescript
function DataPipeline() {
  // Step 1: Fetch initial data
  const [config] = createResource(fetchConfig);
  
  // Step 2: Use config to fetch multiple resources in parallel
  const [dataA] = createResource(
    () => config()?.endpointA,
    endpoint => fetch(endpoint)
  );
  
  const [dataB] = createResource(
    () => config()?.endpointB,
    endpoint => fetch(endpoint)
  );
  
  const [dataC] = createResource(
    () => config()?.endpointC,
    endpoint => fetch(endpoint)
  );
  
  // Timeline: config (1s) → A, B, C in parallel (max 2s) = 3s total
  // Instead of: config → A → B → C = 7s
}
```

## Pattern 3: Caching Strategies

### In-Memory Cache

```typescript
// Global cache
const resourceCache = new Map<string, any>();

function createCachedResource<T, S>(
  source: () => S,
  fetcher: (source: S) => Promise<T>,
  options: {
    key: (source: S) => string;
    ttl?: number; // Time to live in ms
  }
): ResourceReturn<T> {
  return createResource(
    source,
    async (sourceValue, { refetching }) => {
      const cacheKey = options.key(sourceValue);
      
      // Check cache
      const cached = resourceCache.get(cacheKey);
      if (cached && !refetching) {
        const age = Date.now() - cached.timestamp;
        if (!options.ttl || age < options.ttl) {
          return cached.value;
        }
      }
      
      // Fetch fresh data
      const value = await fetcher(sourceValue);
      
      // Store in cache
      resourceCache.set(cacheKey, {
        value,
        timestamp: Date.now()
      });
      
      return value;
    }
  );
}

// Usage
const [user] = createCachedResource(
  () => userId(),
  fetchUser,
  {
    key: (id) => `user-${id}`,
    ttl: 5 * 60 * 1000 // 5 minutes
  }
);
```

### Deduplication Cache

Prevent multiple identical requests:

```typescript
const pendingRequests = new Map<string, Promise<any>>();

function createDeduplicatedResource<T, S>(
  source: () => S,
  fetcher: (source: S) => Promise<T>,
  keyFn: (source: S) => string
): ResourceReturn<T> {
  return createResource(
    source,
    async (sourceValue) => {
      const key = keyFn(sourceValue);
      
      // Return existing promise if request is in flight
      if (pendingRequests.has(key)) {
        return pendingRequests.get(key)!;
      }
      
      // Create new request
      const promise = fetcher(sourceValue);
      pendingRequests.set(key, promise);
      
      // Clean up when done
      promise.finally(() => {
        pendingRequests.delete(key);
      });
      
      return promise;
    }
  );
}
```

### LRU Cache

Least Recently Used cache with size limit:

```typescript
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;
  
  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }
  
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }
  
  set(key: K, value: V): void {
    // Remove if exists (to re-add at end)
    this.cache.delete(key);
    
    // Add to end
    this.cache.set(key, value);
    
    // Remove oldest if over size
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }
  
  clear(): void {
    this.cache.clear();
  }
}

const cache = new LRUCache<string, any>(100);

function createLRUCachedResource<T, S>(
  source: () => S,
  fetcher: (source: S) => Promise<T>,
  keyFn: (source: S) => string
): ResourceReturn<T> {
  return createResource(
    source,
    async (sourceValue, { refetching }) => {
      const key = keyFn(sourceValue);
      
      if (!refetching) {
        const cached = cache.get(key);
        if (cached !== undefined) {
          return cached;
        }
      }
      
      const value = await fetcher(sourceValue);
      cache.set(key, value);
      return value;
    }
  );
}
```

### Stale-While-Revalidate

Show stale data immediately, fetch fresh in background:

```typescript
function createSWRResource<T, S>(
  source: () => S,
  fetcher: (source: S) => Promise<T>,
  options: {
    key: (source: S) => string;
    staleTime?: number;
  }
): ResourceReturn<T> {
  const cache = new Map<string, { value: T; timestamp: number }>();
  
  return createResource(
    source,
    async (sourceValue, { refetching }) => {
      const key = options.key(sourceValue);
      const cached = cache.get(key);
      
      // Return stale immediately
      if (cached) {
        const age = Date.now() - cached.timestamp;
        
        if (age < (options.staleTime || 0)) {
          // Still fresh
          return cached.value;
        }
        
        // Stale but return anyway, revalidate in background
        if (!refetching) {
          // Trigger background revalidation
          setTimeout(() => {
            fetcher(sourceValue).then(value => {
              cache.set(key, { value, timestamp: Date.now() });
            });
          }, 0);
        }
        
        return cached.value;
      }
      
      // No cache, fetch fresh
      const value = await fetcher(sourceValue);
      cache.set(key, { value, timestamp: Date.now() });
      return value;
    }
  );
}
```

## Pattern 4: Optimistic Updates

### Basic Optimistic Update

```typescript
function TodoList() {
  const [todos, { mutate, refetch }] = createResource(fetchTodos);
  
  async function addTodo(text: string) {
    const tempId = `temp-${Date.now()}`;
    const optimisticTodo = { id: tempId, text, completed: false };
    
    // Optimistically add to UI
    mutate(prev => [...(prev || []), optimisticTodo]);
    
    try {
      // Send to server
      const serverTodo = await createTodo(text);
      
      // Replace temp with server version
      mutate(prev => 
        prev?.map(t => t.id === tempId ? serverTodo : t)
      );
    } catch (error) {
      // Rollback on error
      mutate(prev => prev?.filter(t => t.id !== tempId));
      
      // Show error to user
      showError('Failed to add todo');
    }
  }
  
  return (
    <div>
      <For each={todos()}>
        {todo => (
          <TodoItem 
            todo={todo} 
            isPending={todo.id.startsWith('temp-')}
          />
        )}
      </For>
    </div>
  );
}
```

### Optimistic Update with Rollback

```typescript
function useOptimisticUpdate<T>(
  resource: Resource<T>,
  mutate: (value: T) => T
) {
  const [pending, setPending] = createSignal<Array<{
    id: string;
    rollback: () => void;
  }>>([]);
  
  async function update(
    optimisticUpdate: (prev: T) => T,
    serverUpdate: () => Promise<T>
  ) {
    const id = `update-${Date.now()}`;
    const previousValue = resource();
    
    // Apply optimistic update
    const newValue = mutate(optimisticUpdate(previousValue!));
    
    // Store rollback
    const rollback = () => mutate(previousValue!);
    setPending(prev => [...prev, { id, rollback }]);
    
    try {
      // Send to server
      const serverValue = await serverUpdate();
      
      // Apply server response
      mutate(serverValue);
      
      // Remove from pending
      setPending(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      // Rollback
      rollback();
      setPending(prev => prev.filter(p => p.id !== id));
      
      throw error;
    }
  }
  
  return {
    update,
    pending: () => pending().length > 0,
    rollbackAll: () => {
      pending().forEach(p => p.rollback());
      setPending([]);
    }
  };
}

// Usage
function TodoList() {
  const [todos, { mutate }] = createResource(fetchTodos);
  const optimistic = useOptimisticUpdate(todos, mutate);
  
  async function addTodo(text: string) {
    await optimistic.update(
      // Optimistic update
      prev => [...prev, { id: `temp-${Date.now()}`, text, completed: false }],
      // Server update
      () => createTodo(text).then(todo => [...todos(), todo])
    );
  }
}
```

## Pattern 5: Prefetching

### Hover Prefetch

```typescript
function UserLink(props: { userId: number }) {
  let prefetchTimeout: number | undefined;
  
  function startPrefetch() {
    // Prefetch after 200ms hover
    prefetchTimeout = setTimeout(() => {
      prefetchUser(props.userId);
    }, 200);
  }
  
  function cancelPrefetch() {
    if (prefetchTimeout) {
      clearTimeout(prefetchTimeout);
    }
  }
  
  return (
    <a
      href={`/users/${props.userId}`}
      onMouseEnter={startPrefetch}
      onMouseLeave={cancelPrefetch}
    >
      View Profile
    </a>
  );
}

// Prefetch function
const userCache = new Map<number, Promise<User>>();

function prefetchUser(userId: number) {
  if (!userCache.has(userId)) {
    const promise = fetchUser(userId);
    userCache.set(userId, promise);
    
    // Clean up after 30s
    setTimeout(() => {
      userCache.delete(userId);
    }, 30000);
  }
}

// Use cached data in resource
function createUser(userId: () => number) {
  return createResource(
    userId,
    async (id) => {
      // Check prefetch cache
      const cached = userCache.get(id);
      if (cached) {
        userCache.delete(id); // Use once
        return cached;
      }
      
      return fetchUser(id);
    }
  );
}
```

### Route Prefetch

```typescript
function RouteLink(props: {
  href: string;
  prefetch?: boolean;
  children: JSX.Element;
}) {
  createEffect(() => {
    if (props.prefetch) {
      // Prefetch route data
      prefetchRoute(props.href);
    }
  });
  
  return (
    <a
      href={props.href}
      onMouseEnter={() => prefetchRoute(props.href)}
    >
      {props.children}
    </a>
  );
}

function prefetchRoute(path: string) {
  // Load route component and data
  const route = matchRoute(path);
  if (route?.loader) {
    route.loader();
  }
}
```

## Pattern 6: Polling and Real-time Updates

### Interval Polling

```typescript
function createPollingResource<T>(
  fetcher: () => Promise<T>,
  interval: number
): ResourceReturn<T> {
  const [data, { refetch }] = createResource(fetcher);
  
  // Set up polling
  const timer = setInterval(() => {
    refetch();
  }, interval);
  
  // Clean up on unmount
  onCleanup(() => {
    clearInterval(timer);
  });
  
  return [data, { refetch }];
}

// Usage
const [liveData] = createPollingResource(
  fetchLiveStats,
  5000 // Poll every 5 seconds
);
```

### Smart Polling (only when visible)

```typescript
function createSmartPollingResource<T>(
  fetcher: () => Promise<T>,
  interval: number
): ResourceReturn<T> {
  const [data, { refetch }] = createResource(fetcher);
  const [isVisible, setIsVisible] = createSignal(true);
  
  // Track page visibility
  createEffect(() => {
    const handleVisibility = () => {
      setIsVisible(!document.hidden);
      if (!document.hidden) {
        refetch(); // Refetch when tab becomes visible
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibility);
    onCleanup(() => {
      document.removeEventListener('visibilitychange', handleVisibility);
    });
  });
  
  // Poll only when visible
  createEffect(() => {
    if (isVisible()) {
      const timer = setInterval(() => {
        refetch();
      }, interval);
      
      onCleanup(() => clearInterval(timer));
    }
  });
  
  return [data, { refetch }];
}
```

### WebSocket Integration

```typescript
function createWebSocketResource<T>(
  url: string,
  initialFetcher?: () => Promise<T>
): ResourceReturn<T> {
  const [data, { mutate }] = createResource(initialFetcher);
  
  createEffect(() => {
    const ws = new WebSocket(url);
    
    ws.onmessage = (event) => {
      const newData = JSON.parse(event.data);
      mutate(newData);
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    onCleanup(() => {
      ws.close();
    });
  });
  
  return [data, { mutate }];
}

// Usage
const [liveData] = createWebSocketResource(
  'wss://api.example.com/live',
  fetchInitialData  // Fetch initial data via HTTP
);
```

## Pattern 7: Error Recovery

### Retry with Exponential Backoff

```typescript
function createRetryResource<T, S>(
  source: () => S,
  fetcher: (source: S) => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
  } = {}
): ResourceReturn<T> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelay = options.initialDelay ?? 1000;
  const maxDelay = options.maxDelay ?? 30000;
  
  return createResource(
    source,
    async (sourceValue) => {
      let lastError: any;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await fetcher(sourceValue);
        } catch (error) {
          lastError = error;
          
          if (attempt < maxRetries) {
            // Calculate delay with exponential backoff
            const delay = Math.min(
              initialDelay * Math.pow(2, attempt),
              maxDelay
            );
            
            console.log(`Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      // All retries failed
      throw lastError;
    }
  );
}
```

### Fallback Data

```typescript
function createFallbackResource<T, S>(
  source: () => S,
  fetcher: (source: S) => Promise<T>,
  fallback: T
): ResourceReturn<T> {
  const [data, actions] = createResource(
    source,
    async (sourceValue) => {
      try {
        return await fetcher(sourceValue);
      } catch (error) {
        console.warn('Fetch failed, using fallback:', error);
        return fallback;
      }
    }
  );
  
  return [
    () => data() ?? fallback,
    actions
  ];
}

// Usage
const [user] = createFallbackResource(
  userId,
  fetchUser,
  { id: 0, name: 'Guest', avatar: '/default-avatar.png' }
);
```

### Circuit Breaker

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private threshold: number = 5,
    private timeout: number = 60000
  ) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      // Check if timeout has passed
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await fn();
      
      // Success - reset
      if (this.state === 'half-open') {
        this.state = 'closed';
      }
      this.failures = 0;
      
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();
      
      if (this.failures >= this.threshold) {
        this.state = 'open';
      }
      
      throw error;
    }
  }
}

const breaker = new CircuitBreaker(5, 60000);

function createCircuitBreakerResource<T, S>(
  source: () => S,
  fetcher: (source: S) => Promise<T>
): ResourceReturn<T> {
  return createResource(
    source,
    (sourceValue) => breaker.execute(() => fetcher(sourceValue))
  );
}
```

## Pattern 8: Pagination

### Offset-based Pagination

```typescript
function usePagination<T>(
  fetcher: (page: number, pageSize: number) => Promise<T[]>
) {
  const [page, setPage] = createSignal(1);
  const [pageSize] = createSignal(20);
  
  const [data] = createResource(
    () => ({ page: page(), pageSize: pageSize() }),
    ({ page, pageSize }) => fetcher(page, pageSize)
  );
  
  return {
    data,
    page,
    nextPage: () => setPage(p => p + 1),
    prevPage: () => setPage(p => Math.max(1, p - 1)),
    goToPage: setPage
  };
}
```

### Infinite Scroll

```typescript
function useInfiniteScroll<T>(
  fetcher: (cursor?: string) => Promise<{ items: T[]; nextCursor?: string }>
) {
  const [pages, setPages] = createSignal<T[][]>([]);
  const [cursor, setCursor] = createSignal<string | undefined>();
  const [hasMore, setHasMore] = createSignal(true);
  
  const [data] = createResource(
    cursor,
    async (cursorValue) => {
      const result = await fetcher(cursorValue);
      
      setPages(prev => [...prev, result.items]);
      setHasMore(!!result.nextCursor);
      
      return result;
    }
  );
  
  const loadMore = () => {
    if (hasMore() && data()?.nextCursor) {
      setCursor(data()!.nextCursor);
    }
  };
  
  const allItems = () => pages().flat();
  
  return {
    items: allItems,
    loadMore,
    hasMore,
    loading: data.loading
  };
}

// Usage
function InfiniteList() {
  const { items, loadMore, hasMore } = useInfiniteScroll(fetchPosts);
  
  let sentinel: HTMLDivElement | undefined;
  
  createEffect(() => {
    if (!sentinel) return;
    
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore()) {
          loadMore();
        }
      },
      { threshold: 1.0 }
    );
    
    observer.observe(sentinel);
    
    onCleanup(() => observer.disconnect());
  });
  
  return (
    <div>
      <For each={items()}>
        {item => <ListItem data={item} />}
      </For>
      
      <div ref={sentinel}>
        <Show when={hasMore()}>
          <Loading />
        </Show>
      </div>
    </div>
  );
}
```

## Summary

We've covered essential async patterns:

1. **Parallel Fetching** - Maximize throughput
2. **Dependent Resources** - Handle waterfalls efficiently
3. **Caching** - LRU, SWR, deduplication
4. **Optimistic Updates** - Better UX with rollback
5. **Prefetching** - Anticipate user actions
6. **Polling** - Real-time updates
7. **Error Recovery** - Retry, fallback, circuit breaker
8. **Pagination** - Handle large datasets

## Best Practices

1. **Fetch in parallel** when possible
2. **Cache aggressively** but invalidate appropriately
3. **Show stale data** during revalidation
4. **Prefetch on hover** for better perceived performance
5. **Handle errors gracefully** with retry and fallback
6. **Use optimistic updates** for instant feedback
7. **Implement circuit breakers** for failing services
8. **Consider SSR** and hydration in all patterns

## Key Takeaways

- Parallel fetching dramatically improves performance
- Caching reduces server load and improves UX
- Optimistic updates make apps feel instant
- Prefetching can eliminate perceived loading
- Error recovery patterns prevent cascading failures
- Pagination/infinite scroll handle large datasets
- Combine patterns for sophisticated data management
