# Caching Strategies for Resources

## Overview

Caching is essential for performant async applications. This guide covers various caching strategies, when to use them, and how to implement them with resources.

## Why Cache?

### Benefits

1. **Reduced Server Load** - Fewer requests to backend
2. **Faster Response** - Instant data from cache
3. **Better UX** - No loading states for cached data
4. **Offline Support** - Use cached data when offline
5. **Cost Savings** - Fewer API calls = lower costs

### Trade-offs

1. **Stale Data** - Cached data may be outdated
2. **Memory Usage** - Cache consumes memory
3. **Complexity** - Cache invalidation is hard
4. **Debugging** - Cached state can be confusing

## Cache Strategies

### 1. Time-Based Cache (TTL)

**Concept:** Cache data for a fixed time period.

```typescript
interface CachedValue<T> {
  value: T;
  timestamp: number;
}

const cache = new Map<string, CachedValue<any>>();

function getCached<T>(key: string, ttl: number): T | undefined {
  const cached = cache.get(key);
  
  if (!cached) return undefined;
  
  const age = Date.now() - cached.timestamp;
  if (age > ttl) {
    cache.delete(key);
    return undefined;
  }
  
  return cached.value;
}

function setCached<T>(key: string, value: T): void {
  cache.set(key, {
    value,
    timestamp: Date.now()
  });
}
```

**When to Use:**
- Data that changes infrequently
- Known data staleness tolerance
- Configuration or reference data

**Example:**
```typescript
const [user] = createResource(
  userId,
  async (id) => {
    const cached = getCached(`user-${id}`, 5 * 60 * 1000); // 5 min TTL
    if (cached) return cached;
    
    const data = await fetchUser(id);
    setCached(`user-${id}`, data);
    return data;
  }
);
```

### 2. Stale-While-Revalidate (SWR)

**Concept:** Return cached data immediately, fetch fresh data in background.

```typescript
function createSWRResource<T, S>(
  source: () => S,
  fetcher: (source: S) => Promise<T>,
  staleTime: number = 5000
): ResourceReturn<T> {
  const cache = new Map<string, { value: T; timestamp: number }>();
  
  return createResource(
    source,
    async (sourceValue, { refetching }) => {
      const key = JSON.stringify(sourceValue);
      const cached = cache.get(key);
      
      if (cached) {
        const age = Date.now() - cached.timestamp;
        
        if (age < staleTime) {
          // Fresh enough
          return cached.value;
        }
        
        // Stale - return but revalidate in background
        if (!refetching) {
          setTimeout(() => {
            fetcher(sourceValue).then(fresh => {
              cache.set(key, { value: fresh, timestamp: Date.now() });
            });
          }, 0);
        }
        
        return cached.value;
      }
      
      // No cache
      const value = await fetcher(sourceValue);
      cache.set(key, { value, timestamp: Date.now() });
      return value;
    }
  );
}
```

**When to Use:**
- User-facing data that changes occasionally
- Want instant perceived performance
- Can tolerate brief staleness

**Benefits:**
- Zero loading states (after first load)
- Always shows data (even if stale)
- Auto-updates in background

### 3. LRU Cache (Least Recently Used)

**Concept:** Keep N most recently used items, evict oldest.

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
    // Remove if exists (to update position)
    this.cache.delete(key);
    
    // Add to end
    this.cache.set(key, value);
    
    // Evict least recently used if over size
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }
  
  clear(): void {
    this.cache.clear();
  }
}
```

**When to Use:**
- Limited memory available
- Access patterns have locality (recently used likely to be used again)
- Large number of possible cache keys

**Example:**
```typescript
const userCache = new LRUCache<number, User>(100);

const [user] = createResource(
  userId,
  async (id) => {
    const cached = userCache.get(id);
    if (cached) return cached;
    
    const data = await fetchUser(id);
    userCache.set(id, data);
    return data;
  }
);
```

### 4. Request Deduplication

**Concept:** Share a single request across multiple callers.

```typescript
const pendingRequests = new Map<string, Promise<any>>();

function deduplicate<T>(
  key: string,
  fetcher: () => Promise<T>
): Promise<T> {
  // Return existing request if in flight
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key)!;
  }
  
  // Create new request
  const promise = fetcher();
  pendingRequests.set(key, promise);
  
  // Clean up when done
  promise.finally(() => {
    pendingRequests.delete(key);
  });
  
  return promise;
}
```

**When to Use:**
- Multiple components request same data simultaneously
- Expensive API calls
- Want to prevent duplicate requests

**Example:**
```typescript
const [user] = createResource(
  userId,
  (id) => deduplicate(
    `user-${id}`,
    () => fetchUser(id)
  )
);
```

### 5. Optimistic Updates

**Concept:** Update UI immediately, sync with server in background.

```typescript
function useOptimisticMutation<T, V>(
  resource: Resource<T[]>,
  mutate: (value: T[]) => void,
  serverMutation: (variables: V) => Promise<T>
) {
  const [pending, setPending] = createSignal<T[]>([]);
  
  async function optimisticUpdate(
    variables: V,
    optimisticValue: T
  ) {
    const current = resource() || [];
    const rollback = () => mutate(current);
    
    // Apply optimistic update
    const updated = [...current, optimisticValue];
    mutate(updated);
    setPending(prev => [...prev, optimisticValue]);
    
    try {
      // Send to server
      const serverValue = await serverMutation(variables);
      
      // Replace optimistic with server value
      mutate(
        resource()!.map(item => 
          item === optimisticValue ? serverValue : item
        )
      );
      
      setPending(prev => prev.filter(item => item !== optimisticValue));
    } catch (error) {
      // Rollback on error
      rollback();
      setPending(prev => prev.filter(item => item !== optimisticValue));
      throw error;
    }
  }
  
  return {
    optimisticUpdate,
    pending: () => pending().length > 0
  };
}
```

**When to Use:**
- User actions (create, update, delete)
- Want instant feedback
- Can handle rollback on error

### 6. Cache Invalidation

**Concept:** Remove or update cached data when it becomes stale.

```typescript
class InvalidatableCache<K, V> {
  private cache = new Map<K, V>();
  private dependencies = new Map<K, Set<K>>();
  
  set(key: K, value: V, deps?: K[]): void {
    this.cache.set(key, value);
    
    if (deps) {
      deps.forEach(dep => {
        if (!this.dependencies.has(dep)) {
          this.dependencies.set(dep, new Set());
        }
        this.dependencies.get(dep)!.add(key);
      });
    }
  }
  
  invalidate(key: K): void {
    // Remove key
    this.cache.delete(key);
    
    // Remove dependent keys
    const deps = this.dependencies.get(key);
    if (deps) {
      deps.forEach(dep => {
        this.cache.delete(dep);
        this.invalidate(dep); // Recursive invalidation
      });
      this.dependencies.delete(key);
    }
  }
  
  invalidatePattern(pattern: RegExp): void {
    const keysToInvalidate: K[] = [];
    
    this.cache.forEach((_, key) => {
      if (pattern.test(String(key))) {
        keysToInvalidate.push(key);
      }
    });
    
    keysToInvalidate.forEach(key => this.invalidate(key));
  }
}
```

**When to Use:**
- After mutations
- When data relationships change
- Need to clear stale data

**Example:**
```typescript
const cache = new InvalidatableCache<string, any>();

// Store with dependencies
cache.set('user-1', userData, ['users']);
cache.set('posts-1', postsData, ['users', 'user-1']);

// Invalidate user and all dependent data
cache.invalidate('user-1');

// Invalidate all users
cache.invalidatePattern(/^user-/);
```

## Advanced Patterns

### Multi-Level Cache

Combine multiple cache strategies:

```typescript
interface CacheLevel<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  priority: number;
}

class MultiLevelCache<T> {
  private levels: CacheLevel<T>[];
  
  constructor(levels: CacheLevel<T>[]) {
    this.levels = levels.sort((a, b) => a.priority - b.priority);
  }
  
  get(key: string): T | undefined {
    for (const level of this.levels) {
      const value = level.get(key);
      if (value !== undefined) {
        // Populate higher priority levels
        for (const higherLevel of this.levels) {
          if (higherLevel.priority < level.priority) {
            higherLevel.set(key, value);
          } else {
            break;
          }
        }
        return value;
      }
    }
    return undefined;
  }
  
  set(key: string, value: T): void {
    // Set in all levels
    this.levels.forEach(level => level.set(key, value));
  }
}

// Example: Memory -> LocalStorage -> Network
const cache = new MultiLevelCache([
  { get: memoryCache.get, set: memoryCache.set, priority: 1 },
  { get: localStorageCache.get, set: localStorageCache.set, priority: 2 },
]);
```

### Persistent Cache

Store cache in localStorage:

```typescript
class PersistentCache<T> {
  private cache = new Map<string, T>();
  private storageKey: string;
  
  constructor(storageKey: string) {
    this.storageKey = storageKey;
    this.load();
  }
  
  private load(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        this.cache = new Map(Object.entries(data));
      }
    } catch (error) {
      console.error('Failed to load cache:', error);
    }
  }
  
  private save(): void {
    try {
      const data = Object.fromEntries(this.cache);
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save cache:', error);
    }
  }
  
  get(key: string): T | undefined {
    return this.cache.get(key);
  }
  
  set(key: string, value: T): void {
    this.cache.set(key, value);
    this.save();
  }
  
  clear(): void {
    this.cache.clear();
    localStorage.removeItem(this.storageKey);
  }
}
```

## Best Practices

### 1. Choose the Right Strategy

- **Static data**: Long TTL (hours/days)
- **User data**: SWR with short stale time (5-30s)
- **Real-time data**: No cache or very short TTL (<1s)
- **Search results**: LRU cache with moderate size

### 2. Cache Key Design

```typescript
// GOOD: Deterministic, specific
const key = `user-${userId}-posts-page-${page}`;

// BAD: Non-deterministic
const key = `data-${Math.random()}`;

// BAD: Too generic
const key = 'data';
```

### 3. Handle Cache Busting

```typescript
// Include version in key
const key = `user-${userId}-v2`;

// Or use timestamps
const key = `data-${Date.now()}`;

// Or explicit invalidation
cache.invalidate('user-1');
```

### 4. Monitor Cache Size

```typescript
class SizedCache<K, V> {
  private cache = new Map<K, V>();
  private maxBytes: number;
  private currentBytes = 0;
  
  set(key: K, value: V): void {
    const size = this.estimateSize(value);
    
    // Evict if needed
    while (this.currentBytes + size > this.maxBytes && this.cache.size > 0) {
      const firstKey = this.cache.keys().next().value;
      const firstValue = this.cache.get(firstKey)!;
      this.currentBytes -= this.estimateSize(firstValue);
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, value);
    this.currentBytes += size;
  }
  
  private estimateSize(value: V): number {
    // Rough estimation
    return JSON.stringify(value).length;
  }
}
```

### 5. Consider SSR/Hydration

```typescript
// Server-side: Populate cache
const cache = new Map();
cache.set('user-1', userData);

// Serialize for client
const serializedCache = JSON.stringify(Array.from(cache.entries()));

// Client-side: Hydrate cache
const cache = new Map(JSON.parse(serializedCache));
```

## Summary

| Strategy | Use Case | Pros | Cons |
|----------|----------|------|------|
| TTL | Static data | Simple | May serve stale data |
| SWR | User data | Fast, auto-update | Brief staleness |
| LRU | Large keyspace | Memory efficient | May evict useful data |
| Dedup | Concurrent requests | Reduces load | Only helps concurrent |
| Optimistic | User actions | Instant feedback | Rollback complexity |

## Key Takeaways

- Cache aggressively, invalidate intelligently
- Choose strategy based on data characteristics
- Monitor cache size and hit rates
- Handle errors and rollback
- Consider SSR and persistence
- Test cache invalidation thoroughly
