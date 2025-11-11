# Exercise 1: Build createResource from Scratch

**Difficulty:** ⭐⭐⭐⭐⭐ (Advanced)

## Objective

Implement a fully functional `createResource` primitive that handles all resource states, integrates with Suspense, and supports SSR.

## Requirements

### Core Functionality

1. **State Management**
   - Handle all 5 states: UNRESOLVED, PENDING, READY, REFRESHING, ERRORED
   - Track current value, error, and loading promise
   - Implement proper state transitions

2. **Source Tracking**
   - Support reactive source functions
   - Automatically refetch when source changes
   - Handle `false` source value (don't fetch)

3. **Suspense Integration**
   - Increment suspense counter on PENDING
   - Decrement on resolution/error
   - Don't increment on REFRESHING

4. **API Surface**
   - Resource reader function with properties (state, loading, error, latest)
   - `mutate` action for manual updates
   - `refetch` action for manual refetch

### Advanced Features

5. **Cleanup**
   - Proper disposal of effects
   - Decrement suspense on unmount
   - Cancel pending requests

6. **Error Handling**
   - Throw errors from reader for error boundaries
   - Handle promise rejections
   - Clean up on error

## Starter Code

```typescript
// State constants
const UNRESOLVED = 0;
const PENDING = 1;
const READY = 2;
const REFRESHING = 3;
const ERRORED = 4;

// Types
interface ResourceFetcherInfo<T> {
  value: T | undefined;
  refetching: boolean | unknown;
}

interface ResourceState<T> {
  state: 0 | 1 | 2 | 3 | 4;
  value: T | undefined;
  error: any;
  loading: Promise<T> | null;
  suspended: boolean;
}

// Your implementation
export function createResource<T, S = true>(
  pSource: S | false | (() => S | false | Promise<T>),
  pFetcher?: ((source: S, info: ResourceFetcherInfo<T>) => Promise<T>),
  pOptions?: ResourceOptions<T>
): ResourceReturn<T> {
  // TODO: Implement this function
  
  throw new Error('Not implemented');
}
```

## Test Cases

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('createResource', () => {
  it('should start in UNRESOLVED state with no initial value', () => {
    const [data] = createResource(() => Promise.resolve('test'));
    
    expect(data.state).toBe('unresolved');
    expect(data()).toBe(undefined);
    expect(data.loading).toBe(false);
  });
  
  it('should transition to PENDING when fetching', async () => {
    const [data] = createResource(() => 
      new Promise(resolve => setTimeout(() => resolve('test'), 100))
    );
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(data.state).toBe('pending');
    expect(data.loading).toBe(true);
  });
  
  it('should transition to READY when resolved', async () => {
    const [data] = createResource(() => Promise.resolve('test'));
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(data.state).toBe('ready');
    expect(data()).toBe('test');
    expect(data.loading).toBe(false);
  });
  
  it('should transition to ERRORED on rejection', async () => {
    const [data] = createResource(() => 
      Promise.reject(new Error('Failed'))
    );
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(data.state).toBe('errored');
    expect(data.error).toBeInstanceOf(Error);
    expect(data.error.message).toBe('Failed');
  });
  
  it('should refetch when source changes', async () => {
    const [userId, setUserId] = createSignal(1);
    const fetcher = vi.fn((id: number) => Promise.resolve(`User ${id}`));
    
    const [user] = createResource(userId, fetcher);
    
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(fetcher).toHaveBeenCalledWith(1, expect.any(Object));
    expect(user()).toBe('User 1');
    
    setUserId(2);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(fetcher).toHaveBeenCalledWith(2, expect.any(Object));
    expect(user()).toBe('User 2');
  });
  
  it('should use REFRESHING state when refetching with value', async () => {
    const [trigger, setTrigger] = createSignal(0);
    const [data, { refetch }] = createResource(
      trigger,
      () => Promise.resolve('test')
    );
    
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(data()).toBe('test');
    
    refetch();
    expect(data.state).toBe('refreshing');
    expect(data()).toBe('test'); // Still returns old value
    expect(data.loading).toBe(true);
  });
  
  it('should support mutate action', async () => {
    const [data, { mutate }] = createResource(() => Promise.resolve('initial'));
    
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(data()).toBe('initial');
    
    mutate('updated');
    expect(data()).toBe('updated');
    expect(data.state).toBe('ready');
  });
  
  it('should integrate with Suspense', async () => {
    const suspenseContext = createSuspenseContext();
    
    // Provide suspense context
    runWithOwner(createOwner(suspenseContext), () => {
      const [data] = createResource(() => 
        new Promise(resolve => setTimeout(() => resolve('test'), 50))
      );
      
      expect(suspenseContext.count()).toBe(1); // Incremented
      
      return new Promise(resolve => {
        setTimeout(() => {
          expect(suspenseContext.count()).toBe(0); // Decremented
          resolve();
        }, 100);
      });
    });
  });
  
  it('should not increment Suspense on REFRESHING', async () => {
    const suspenseContext = createSuspenseContext();
    
    runWithOwner(createOwner(suspenseContext), async () => {
      const [data, { refetch }] = createResource(() => Promise.resolve('test'));
      
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(suspenseContext.count()).toBe(0);
      
      refetch();
      expect(suspenseContext.count()).toBe(0); // Should NOT increment
    });
  });
  
  it('should cleanup on disposal', async () => {
    const suspenseContext = createSuspenseContext();
    
    const dispose = runWithOwner(createOwner(suspenseContext), () => {
      const [data] = createResource(() => 
        new Promise(resolve => setTimeout(() => resolve('test'), 100))
      );
      
      expect(suspenseContext.count()).toBe(1);
      
      return () => {
        // Dispose the owner
        getOwner()?.dispose();
      };
    });
    
    dispose();
    expect(suspenseContext.count()).toBe(0); // Decremented on cleanup
  });
});
```

## Implementation Steps

### Step 1: Parse Overloads

Handle the different function signatures:

```typescript
function createResource<T, S>(
  pSource?: ...,
  pFetcher?: ...,
  pOptions?: ...
) {
  let source: (() => S | false) | undefined;
  let fetcher: (source: S, info: ResourceFetcherInfo<T>) => Promise<T>;
  let options: ResourceOptions<T> = {};
  
  // TODO: Determine which overload was used
  // - createResource(fetcher, options)
  // - createResource(source, fetcher)
  // - createResource(source, fetcher, options)
}
```

### Step 2: Create State

```typescript
const state: ResourceState<T> = {
  state: options.initialValue !== undefined ? READY : UNRESOLVED,
  value: options.initialValue,
  error: undefined,
  loading: null,
  suspended: false
};
```

### Step 3: Create Reader Signal

```typescript
const [track, trigger] = createSignal<void>(undefined, {
  equals: false
});

const read = () => {
  track();
  
  // Throw error for error boundaries
  if (state.error !== undefined && state.state === ERRORED) {
    throw state.error;
  }
  
  return state.value;
};
```

### Step 4: Implement Load Function

```typescript
function load(sourceValue: S, isRefetch: boolean = false) {
  // Determine state
  const hasValue = state.value !== undefined;
  
  if (hasValue && isRefetch) {
    state.state = REFRESHING;
  } else {
    state.state = PENDING;
    
    // Increment suspense
    if (suspenseContext && !state.suspended) {
      suspenseContext.increment();
      state.suspended = true;
    }
  }
  
  // Call fetcher
  const promise = fetcher(sourceValue, {
    value: state.value,
    refetching: isRefetch
  });
  
  state.loading = promise;
  
  // Handle resolution
  promise.then(
    value => {/* TODO */},
    error => {/* TODO */}
  );
}
```

### Step 5: Set Up Source Tracking

```typescript
if (source) {
  createEffect(() => {
    const sourceValue = source!();
    
    if (sourceValue !== false) {
      const isRefetch = state.state !== UNRESOLVED;
      load(sourceValue as S, isRefetch);
    }
  });
}
```

### Step 6: Implement Actions

```typescript
function mutate(value: any) {
  const newValue = typeof value === 'function' ? value(state.value) : value;
  state.value = newValue;
  state.state = newValue !== undefined ? READY : UNRESOLVED;
  state.error = undefined;
  trigger();
  return newValue;
}

function refetch(info?: unknown) {
  // TODO: Trigger a refetch
}
```

### Step 7: Add Properties to Reader

```typescript
Object.defineProperties(read, {
  state: {
    get: () => stateNames[state.state]
  },
  error: {
    get: () => state.error
  },
  loading: {
    get: () => state.state === PENDING || state.state === REFRESHING
  },
  latest: {
    get: () => {
      track();
      return state.value;
    }
  }
});
```

### Step 8: Cleanup

```typescript
onCleanup(() => {
  if (state.suspended && suspenseContext) {
    suspenseContext.decrement();
    state.suspended = false;
  }
});
```

## Bonus Challenges

1. **Abort Controller**: Add support for canceling previous fetches
2. **SSR Support**: Add serialization and hydration
3. **Retry Logic**: Implement automatic retry on failure
4. **Caching**: Add a cache layer to prevent duplicate requests
5. **Deduplication**: Deduplicate identical concurrent requests

## Expected Output

```typescript
// Basic usage
const [data] = createResource(fetchData);

console.log(data.state);  // 'pending'
console.log(data());      // undefined

// After resolution
// data.state === 'ready'
// data() === <fetched data>

// With source
const [userId, setUserId] = createSignal(1);
const [user] = createResource(userId, fetchUser);

setUserId(2); // Automatically refetches

// Manual control
const [data, { mutate, refetch }] = createResource(fetchData);

mutate('new value');
refetch();
```

## Solution

See `solutions/exercise-01-solution.ts` for a complete implementation.

## Evaluation Criteria

- ✅ All 5 states correctly implemented
- ✅ State transitions are correct
- ✅ Suspense integration works
- ✅ Source tracking triggers refetch
- ✅ REFRESHING doesn't trigger Suspense
- ✅ Actions (mutate, refetch) work
- ✅ Cleanup properly decrements Suspense
- ✅ Error handling works with error boundaries
- ✅ All test cases pass

## Resources

- Lesson 1: Resource Architecture
- Lesson 2: createResource Implementation
- Solid.js source: `packages/solid/src/reactive/signal.ts`
