# Exercise 3: Smart Caching Layer

**Difficulty:** ⭐⭐⭐⭐ (Intermediate-Advanced)

## Objective

Build a comprehensive caching system for resources with TTL, LRU eviction, and deduplication.

## Requirements

1. **Time-based Cache (TTL)**
   - Cache results with expiration time
   - Return cached data if still valid
   - Refetch when expired

2. **LRU Eviction**
   - Limit cache size
   - Evict least recently used items
   - Update access order on read

3. **Request Deduplication**
   - Prevent duplicate concurrent requests
   - Share promise across multiple callers
   - Clean up after resolution

## Starter Code

```typescript
class CacheEntry<T> {
  value: T;
  timestamp: number;
  accessCount: number;
  
  constructor(value: T) {
    this.value = value;
    this.timestamp = Date.now();
    this.accessCount = 0;
  }
  
  isExpired(ttl: number): boolean {
    return Date.now() - this.timestamp > ttl;
  }
}

class ResourceCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private maxSize: number;
  
  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }
  
  get(key: K, ttl?: number): V | undefined {
    // TODO: Implement cache retrieval with LRU and TTL
    throw new Error('Not implemented');
  }
  
  set(key: K, value: V): void {
    // TODO: Implement cache storage with LRU eviction
    throw new Error('Not implemented');
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  size(): number {
    return this.cache.size;
  }
}

function createCachedResource<T, S>(
  source: () => S,
  fetcher: (source: S) => Promise<T>,
  options: {
    key: (source: S) => string;
    ttl?: number;
    maxSize?: number;
  }
): ResourceReturn<T> {
  // TODO: Implement cached resource
  throw new Error('Not implemented');
}
```

## Test Cases

```typescript
describe('ResourceCache', () => {
  it('should cache and retrieve values', () => {
    const cache = new ResourceCache<string, number>(10);
    
    cache.set('key1', 100);
    expect(cache.get('key1')).toBe(100);
  });
  
  it('should respect TTL', async () => {
    const cache = new ResourceCache<string, number>(10);
    
    cache.set('key1', 100);
    expect(cache.get('key1', 1000)).toBe(100);
    
    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(cache.get('key1', 1000)).toBe(undefined);
  });
  
  it('should evict LRU items when full', () => {
    const cache = new ResourceCache<string, number>(3);
    
    cache.set('key1', 1);
    cache.set('key2', 2);
    cache.set('key3', 3);
    
    // Access key1 to make it recently used
    cache.get('key1');
    
    // Add new item, should evict key2 (least recently used)
    cache.set('key4', 4);
    
    expect(cache.get('key1')).toBe(1);
    expect(cache.get('key2')).toBe(undefined);
    expect(cache.get('key3')).toBe(3);
    expect(cache.get('key4')).toBe(4);
  });
});

describe('createCachedResource', () => {
  it('should use cached data', async () => {
    const fetcher = vi.fn((id: number) => 
      Promise.resolve({ id, name: `User ${id}` })
    );
    
    const [userId, setUserId] = createSignal(1);
    const [user] = createCachedResource(
      userId,
      fetcher,
      {
        key: (id) => `user-${id}`,
        ttl: 5000
      }
    );
    
    await waitFor(() => expect(user()).toBeDefined());
    expect(fetcher).toHaveBeenCalledTimes(1);
    
    // Change and change back - should use cache
    setUserId(2);
    await waitFor(() => expect(user()?.id).toBe(2));
    
    setUserId(1);
    await waitFor(() => expect(user()?.id).toBe(1));
    
    // Should only have fetched user 1 once (cached the second time)
    expect(fetcher).toHaveBeenCalledTimes(2); // Once for 1, once for 2
  });
  
  it('should deduplicate concurrent requests', async () => {
    const fetcher = vi.fn((id: number) => 
      new Promise(resolve => 
        setTimeout(() => resolve({ id, name: `User ${id}` }), 100)
      )
    );
    
    const [user1] = createCachedResource(
      () => 1,
      fetcher,
      { key: (id) => `user-${id}` }
    );
    
    const [user2] = createCachedResource(
      () => 1,
      fetcher,
      { key: (id) => `user-${id}` }
    );
    
    await waitFor(() => {
      expect(user1()).toBeDefined();
      expect(user2()).toBeDefined();
    });
    
    // Should only have fetched once despite two resources
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
```

## Implementation Steps

### Step 1: LRU Cache

```typescript
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  
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
    // Remove if exists
    this.cache.delete(key);
    
    // Add to end
    this.cache.set(key, value);
    
    // Evict oldest if needed
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }
}
```

### Step 2: TTL Support

```typescript
interface CacheEntry<V> {
  value: V;
  timestamp: number;
}

get(key: K, ttl?: number): V | undefined {
  const entry = this.cache.get(key);
  
  if (!entry) return undefined;
  
  // Check expiration
  if (ttl && Date.now() - entry.timestamp > ttl) {
    this.cache.delete(key);
    return undefined;
  }
  
  // Update LRU
  this.cache.delete(key);
  this.cache.set(key, entry);
  
  return entry.value;
}
```

### Step 3: Request Deduplication

```typescript
const pendingRequests = new Map<string, Promise<any>>();

function createCachedResource<T, S>(
  source: () => S,
  fetcher: (source: S) => Promise<T>,
  options: CacheOptions<S>
): ResourceReturn<T> {
  const cache = new ResourceCache<string, T>(options.maxSize);
  
  return createResource(
    source,
    async (sourceValue, { refetching }) => {
      const key = options.key(sourceValue);
      
      // Check cache (unless refetching)
      if (!refetching) {
        const cached = cache.get(key, options.ttl);
        if (cached !== undefined) {
          return cached;
        }
      }
      
      // Check for pending request
      if (pendingRequests.has(key)) {
        return pendingRequests.get(key)!;
      }
      
      // Create new request
      const promise = fetcher(sourceValue);
      pendingRequests.set(key, promise);
      
      try {
        const value = await promise;
        cache.set(key, value);
        return value;
      } finally {
        pendingRequests.delete(key);
      }
    }
  );
}
```

## Bonus Challenges

1. **Stale-While-Revalidate**: Return stale data immediately while fetching fresh
2. **Cache Statistics**: Track hits, misses, evictions
3. **Persistent Cache**: Save to localStorage
4. **Cache Invalidation**: Invalidate specific keys or patterns
5. **Memory Monitoring**: Implement size-based eviction

## Expected Output

```typescript
// Basic caching
const [user] = createCachedResource(
  userId,
  fetchUser,
  {
    key: (id) => `user-${id}`,
    ttl: 5 * 60 * 1000 // 5 minutes
  }
);

// With LRU limit
const [data] = createCachedResource(
  query,
  searchAPI,
  {
    key: (q) => `search-${q}`,
    maxSize: 50 // Keep last 50 searches
  }
);
```

## Solution

See `solutions/exercise-03-solution.ts`
