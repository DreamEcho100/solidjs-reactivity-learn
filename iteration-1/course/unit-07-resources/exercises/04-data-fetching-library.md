# Exercise 4: Data Fetching Library

**Difficulty:** ⭐⭐⭐⭐⭐ (Advanced)

## Objective

Build a complete data fetching library that combines resources, caching, error handling, and advanced patterns.

## Requirements

1. **Query Management**
   - Create queries with keys
   - Automatic refetch on key change
   - Manual refetch and invalidation

2. **Caching**
   - Time-based cache with TTL
   - Deduplication
   - Cache invalidation

3. **Mutations**
   - Optimistic updates
   - Cache updates on mutation
   - Rollback on error

4. **Advanced Features**
   - Polling/refetch intervals
   - Retry with exponential backoff
   - Prefetching
   - Dependent queries

## Starter Code

```typescript
interface QueryOptions<T> {
  staleTime?: number;
  cacheTime?: number;
  retry?: number | boolean;
  retryDelay?: number;
  refetchInterval?: number;
  refetchOnWindowFocus?: boolean;
  enabled?: boolean;
}

interface MutationOptions<T, V> {
  onSuccess?: (data: T) => void;
  onError?: (error: any) => void;
  onSettled?: () => void;
  optimistic?: (variables: V) => T;
}

export function createQuery<T>(
  key: () => any[],
  fetcher: (...key: any[]) => Promise<T>,
  options?: QueryOptions<T>
): QueryResult<T> {
  // TODO: Implement query
  throw new Error('Not implemented');
}

export function createMutation<T, V>(
  mutationFn: (variables: V) => Promise<T>,
  options?: MutationOptions<T, V>
): MutationResult<T, V> {
  // TODO: Implement mutation
  throw new Error('Not implemented');
}

export function invalidateQuery(key: any[]): void {
  // TODO: Implement query invalidation
  throw new Error('Not implemented');
}
```

## Test Cases

```typescript
describe('createQuery', () => {
  it('should fetch data', async () => {
    const query = createQuery(
      () => ['user', 1],
      (_, userId) => fetchUser(userId)
    );
    
    await waitFor(() => {
      expect(query.data()).toBeDefined();
      expect(query.isSuccess).toBe(true);
    });
  });
  
  it('should cache data', async () => {
    const fetcher = vi.fn(fetchUser);
    
    const query1 = createQuery(
      () => ['user', 1],
      fetcher
    );
    
    await waitFor(() => expect(query1.data()).toBeDefined());
    
    // Second query with same key should use cache
    const query2 = createQuery(
      () => ['user', 1],
      fetcher
    );
    
    expect(query2.data()).toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  
  it('should refetch when key changes', async () => {
    const [userId, setUserId] = createSignal(1);
    const fetcher = vi.fn(fetchUser);
    
    const query = createQuery(
      () => ['user', userId()],
      (_, id) => fetcher(id)
    );
    
    await waitFor(() => expect(query.data()).toBeDefined());
    expect(fetcher).toHaveBeenCalledWith(1);
    
    setUserId(2);
    await waitFor(() => expect(query.data()?.id).toBe(2));
    expect(fetcher).toHaveBeenCalledWith(2);
  });
  
  it('should support polling', async () => {
    const fetcher = vi.fn(() => Promise.resolve({ value: Math.random() }));
    
    const query = createQuery(
      () => ['random'],
      fetcher,
      { refetchInterval: 100 }
    );
    
    await waitFor(() => expect(query.data()).toBeDefined());
    const firstValue = query.data()?.value;
    
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(query.data()?.value).not.toBe(firstValue);
    expect(fetcher.mock.calls.length).toBeGreaterThan(1);
  });
});

describe('createMutation', () => {
  it('should execute mutation', async () => {
    const mutation = createMutation(
      (text: string) => createTodo(text)
    );
    
    mutation.mutate('New todo');
    
    await waitFor(() => {
      expect(mutation.isSuccess).toBe(true);
      expect(mutation.data()).toBeDefined();
    });
  });
  
  it('should support optimistic updates', async () => {
    const todosQuery = createQuery(
      () => ['todos'],
      fetchTodos
    );
    
    await waitFor(() => expect(todosQuery.data()).toBeDefined());
    
    const mutation = createMutation(
      (text: string) => createTodo(text),
      {
        optimistic: (text) => ({
          id: `temp-${Date.now()}`,
          text,
          completed: false
        }),
        onSuccess: (newTodo) => {
          // Update cache
          invalidateQuery(['todos']);
        }
      }
    );
    
    const initialLength = todosQuery.data()!.length;
    mutation.mutate('Optimistic todo');
    
    // Should see optimistic update immediately
    expect(todosQuery.data()!.length).toBe(initialLength + 1);
  });
  
  it('should rollback on error', async () => {
    const todosQuery = createQuery(
      () => ['todos'],
      fetchTodos
    );
    
    await waitFor(() => expect(todosQuery.data()).toBeDefined());
    const initialTodos = todosQuery.data();
    
    const mutation = createMutation(
      () => Promise.reject(new Error('Failed')),
      {
        optimistic: (text) => ({
          id: `temp-${Date.now()}`,
          text,
          completed: false
        })
      }
    );
    
    mutation.mutate('Will fail');
    
    await waitFor(() => {
      expect(mutation.isError).toBe(true);
    });
    
    // Should rollback to initial state
    expect(todosQuery.data()).toEqual(initialTodos);
  });
});
```

## Implementation Guide

### Query State Management

```typescript
interface QueryState<T> {
  data: T | undefined;
  error: any;
  status: 'idle' | 'loading' | 'success' | 'error';
  fetchedAt: number;
  observers: Set<Function>;
}

const queryCache = new Map<string, QueryState<any>>();

function getQueryState<T>(key: any[]): QueryState<T> {
  const keyStr = JSON.stringify(key);
  
  if (!queryCache.has(keyStr)) {
    queryCache.set(keyStr, {
      data: undefined,
      error: undefined,
      status: 'idle',
      fetchedAt: 0,
      observers: new Set()
    });
  }
  
  return queryCache.get(keyStr)!;
}
```

### Implement createQuery

```typescript
export function createQuery<T>(
  key: () => any[],
  fetcher: (...key: any[]) => Promise<T>,
  options: QueryOptions<T> = {}
): QueryResult<T> {
  const [data, setData] = createSignal<T | undefined>();
  const [error, setError] = createSignal<any>();
  const [status, setStatus] = createSignal<QueryStatus>('idle');
  
  createEffect(() => {
    const queryKey = key();
    const state = getQueryState<T>(queryKey);
    
    // Check cache
    const now = Date.now();
    const isStale = !options.staleTime || 
      (now - state.fetchedAt > options.staleTime);
    
    if (state.data && !isStale) {
      setData(() => state.data);
      setStatus('success');
      return;
    }
    
    // Fetch
    setStatus('loading');
    
    fetcher(...queryKey)
      .then(result => {
        state.data = result;
        state.fetchedAt = Date.now();
        state.status = 'success';
        
        setData(() => result);
        setStatus('success');
      })
      .catch(err => {
        state.error = err;
        state.status = 'error';
        
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
    refetch: () => {/* TODO */}
  };
}
```

### Implement createMutation

```typescript
export function createMutation<T, V>(
  mutationFn: (variables: V) => Promise<T>,
  options: MutationOptions<T, V> = {}
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
        
        // Store rollback
        rollback = () => setData(undefined);
      }
      
      setStatus('loading');
      
      // Execute mutation
      const result = await mutationFn(variables);
      
      setData(() => result);
      setStatus('success');
      
      options.onSuccess?.(result);
      options.onSettled?.();
      
      return result;
    } catch (err) {
      // Rollback optimistic update
      if (rollback) {
        rollback();
      }
      
      setError(err);
      setStatus('error');
      
      options.onError?.(err);
      options.onSettled?.();
      
      throw err;
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

## Features to Implement

1. ✅ Basic query with caching
2. ✅ Automatic refetch on key change
3. ✅ Stale-while-revalidate
4. ✅ Mutations with optimistic updates
5. ⭐ Query invalidation
6. ⭐ Dependent queries
7. ⭐ Polling/intervals
8. ⭐ Retry logic
9. ⭐ Prefetching
10. ⭐ Window focus refetch

## Expected Output

```typescript
// Simple query
const userQuery = createQuery(
  () => ['user', userId()],
  (_, id) => fetchUser(id)
);

// With options
const postsQuery = createQuery(
  () => ['posts'],
  fetchPosts,
  {
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 30 * 1000, // 30 seconds
    retry: 3
  }
);

// Mutation with optimistic update
const createTodoMutation = createMutation(
  (text: string) => api.createTodo(text),
  {
    optimistic: (text) => ({ id: 'temp', text, completed: false }),
    onSuccess: () => invalidateQuery(['todos'])
  }
);

// Usage
<button onClick={() => createTodoMutation.mutate('New todo')}>
  Add Todo
</button>
```

## Solution

See `solutions/exercise-04-solution.ts`
