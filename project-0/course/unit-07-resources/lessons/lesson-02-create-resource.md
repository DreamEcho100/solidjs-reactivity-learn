# Lesson 2: createResource Implementation

## Introduction

Now that we understand resource architecture, let's implement `createResource` from scratch. We'll build a production-quality implementation that handles all the edge cases and integrates properly with the reactive system.

## API Design

First, let's define the complete API:

```typescript
function createResource<T, S = true>(
  source: S | false | (() => S | false),
  fetcher: (source: S, info: ResourceFetcherInfo<T>) => Promise<T>,
  options?: ResourceOptions<T>
): ResourceReturn<T>;

function createResource<T>(
  fetcher: () => Promise<T>,
  options?: ResourceOptions<T>
): ResourceReturn<T>;

// Types
interface ResourceFetcherInfo<T> {
  value: T | undefined;
  refetching: boolean | unknown;
}

interface ResourceOptions<T> {
  initialValue?: T;
  name?: string;
  deferStream?: boolean;
  ssrLoadFrom?: 'server' | 'initial';
  storage?: (value: T) => any;
  onHydrated?: (value: T) => void;
}

type ResourceReturn<T> = [
  Resource<T>,
  {
    mutate: (value: T | undefined | ((prev: T | undefined) => T | undefined)) => T | undefined;
    refetch: (info?: unknown) => void;
  }
];

interface Resource<T> {
  (): T | undefined;
  state: 'unresolved' | 'pending' | 'ready' | 'refreshing' | 'errored';
  loading: boolean;
  error: any;
  latest: T | undefined;
}
```

## Implementation Strategy

We'll build the implementation in layers:

1. **State Management** - Internal state structure
2. **Source Tracking** - Reactive source handling
3. **Fetch Logic** - Promise management
4. **Suspense Integration** - Loading coordination
5. **Mutate/Refetch** - Manual control
6. **SSR Support** - Server/client handling

## Layer 1: State Management

```typescript
// State constants
const UNRESOLVED = 0;
const PENDING = 1;
const READY = 2;
const REFRESHING = 3;
const ERRORED = 4;

// State names for debugging
const stateNames = {
  [UNRESOLVED]: 'unresolved',
  [PENDING]: 'pending',
  [READY]: 'ready',
  [REFRESHING]: 'refreshing',
  [ERRORED]: 'errored'
} as const;

// Internal state structure
interface ResourceState<T> {
  // Current state
  state: 0 | 1 | 2 | 3 | 4;
  value: T | undefined;
  error: any;
  
  // Promise tracking
  loading: Promise<T> | null;
  
  // Suspense integration
  suspended: boolean;
  
  // For refetch info
  refetchInfo: unknown;
  
  // SSR
  serialized?: any;
}

function createResourceState<T>(initialValue?: T): ResourceState<T> {
  return {
    state: initialValue !== undefined ? READY : UNRESOLVED,
    value: initialValue,
    error: undefined,
    loading: null,
    suspended: false,
    refetchInfo: undefined,
    serialized: undefined
  };
}
```

## Layer 2: Core Implementation

```typescript
function createResource<T, S = true>(
  pSource: S | false | (() => S | false) | (() => Promise<T>),
  pFetcher?: (source: S, info: ResourceFetcherInfo<T>) => Promise<T>,
  pOptions?: ResourceOptions<T>
): ResourceReturn<T> {
  // Handle overloads
  let source: (() => S | false) | undefined;
  let fetcher: (source: S, info: ResourceFetcherInfo<T>) => Promise<T>;
  let options: ResourceOptions<T> = {};
  
  if (arguments.length === 2) {
    if (typeof pSource === 'function') {
      // Overload 2: createResource(fetcher, options)
      source = undefined;
      fetcher = pSource as any;
      options = pFetcher as ResourceOptions<T>;
    } else {
      // Overload 1: createResource(source, fetcher)
      source = typeof pSource === 'function' ? pSource : () => pSource as S;
      fetcher = pFetcher!;
    }
  } else if (arguments.length === 3) {
    // Full signature
    source = typeof pSource === 'function' ? pSource : () => pSource as S;
    fetcher = pFetcher!;
    options = pOptions || {};
  } else {
    // Single argument
    source = undefined;
    fetcher = pSource as any;
  }
  
  // Create internal state
  const state = createResourceState<T>(options.initialValue);
  
  // Create signal for reactive reads
  const [track, trigger] = createSignal<void>(undefined, {
    equals: false,
    name: options.name
  });
  
  // Get suspense context
  const suspenseContext = getSuspenseContext();
  
  // Resource reader function
  const read = () => {
    track(); // Make reactive
    
    // Throw error for error boundaries
    if (state.error !== undefined && state.state === ERRORED) {
      throw state.error;
    }
    
    return state.value;
  };
  
  // Add properties to reader
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
        track(); // Make reactive
        return state.value;
      }
    }
  });
  
  // Load function - performs the actual fetch
  function load(sourceValue: S, refetch: boolean = false, info?: unknown) {
    // Determine new state
    const hasValue = state.value !== undefined;
    const prevState = state.state;
    
    if (hasValue && refetch) {
      state.state = REFRESHING;
    } else {
      state.state = PENDING;
      
      // Increment suspense for PENDING
      if (suspenseContext && !state.suspended) {
        suspenseContext.increment();
        state.suspended = true;
      }
    }
    
    // Store refetch info
    state.refetchInfo = info;
    
    // Call fetcher
    const promise = fetcher(sourceValue, {
      value: state.value,
      refetching: refetch || info
    });
    
    // Store promise
    state.loading = promise;
    
    // Handle resolution
    promise.then(
      (value) => {
        // Check if this is still the latest promise
        if (state.loading !== promise) return;
        
        // Update state
        state.state = READY;
        state.value = value;
        state.error = undefined;
        state.loading = null;
        
        // Decrement suspense
        if (state.suspended) {
          suspenseContext?.decrement();
          state.suspended = false;
        }
        
        // Trigger reactivity
        trigger();
      },
      (error) => {
        // Check if this is still the latest promise
        if (state.loading !== promise) return;
        
        // Update state
        state.state = ERRORED;
        state.error = error;
        state.value = undefined;
        state.loading = null;
        
        // Decrement suspense
        if (state.suspended) {
          suspenseContext?.decrement();
          state.suspended = false;
        }
        
        // Trigger reactivity
        trigger();
      }
    );
  }
  
  // Set up source tracking
  if (source) {
    createEffect(() => {
      const sourceValue = source!();
      
      // Don't fetch if source is false
      if (sourceValue === false) {
        return;
      }
      
      // Determine if this is a refetch
      const isRefetch = state.state !== UNRESOLVED;
      
      // Load data
      load(sourceValue as S, isRefetch);
    });
  }
  
  // Mutate action - update value manually
  function mutate(
    value: T | undefined | ((prev: T | undefined) => T | undefined)
  ): T | undefined {
    const newValue = typeof value === 'function'
      ? (value as (prev: T | undefined) => T | undefined)(state.value)
      : value;
    
    state.value = newValue;
    state.state = newValue !== undefined ? READY : UNRESOLVED;
    state.error = undefined;
    
    trigger();
    
    return newValue;
  }
  
  // Refetch action - manually trigger a fetch
  function refetch(info?: unknown) {
    if (source) {
      // Re-run the source effect
      const sourceValue = untrack(source);
      if (sourceValue !== false) {
        load(sourceValue as S, true, info);
      }
    } else {
      // No source, just call fetcher
      load(undefined as any, true, info);
    }
  }
  
  // Cleanup
  onCleanup(() => {
    if (state.suspended) {
      suspenseContext?.decrement();
      state.suspended = false;
    }
  });
  
  return [read as Resource<T>, { mutate, refetch }];
}
```

## Layer 3: Suspense Context

The suspense context coordinates loading states:

```typescript
interface SuspenseContext {
  increment: () => void;
  decrement: () => void;
  count: () => number;
}

// Context key
const SuspenseContextSymbol = Symbol('suspense-context');

function getSuspenseContext(): SuspenseContext | undefined {
  return getOwner()?.context?.[SuspenseContextSymbol];
}

function createSuspenseContext(): SuspenseContext {
  const [count, setCount] = createSignal(0);
  
  return {
    increment: () => setCount(c => c + 1),
    decrement: () => setCount(c => Math.max(0, c - 1)),
    count
  };
}

// In a Suspense component
function Suspense(props: { fallback: JSX.Element; children: JSX.Element }) {
  const context = createSuspenseContext();
  
  // Provide context to children
  provide(SuspenseContextSymbol, context);
  
  return (
    <Show when={context.count() === 0} fallback={props.fallback}>
      {props.children}
    </Show>
  );
}
```

## Layer 4: SSR Support

For server-side rendering, we need serialization:

```typescript
interface ResourceOptions<T> {
  // ... other options
  storage?: (value: T) => any;
  onHydrated?: (value: T) => void;
  deferStream?: boolean;
  ssrLoadFrom?: 'server' | 'initial';
}

function createResource<T, S>(
  // ... parameters
): ResourceReturn<T> {
  const options = /* ... */;
  
  // Check if we're in SSR
  const isServer = typeof window === 'undefined';
  const isHydrating = !isServer && /* check for hydration */;
  
  // Handle hydration
  if (isHydrating) {
    const hydrationData = getHydrationData();
    if (hydrationData !== undefined) {
      state.value = hydrationData;
      state.state = READY;
      
      if (options.onHydrated) {
        options.onHydrated(hydrationData);
      }
    }
  }
  
  // Handle server-side
  if (isServer && options.ssrLoadFrom === 'server') {
    // On server, we can await the promise
    // This is handled by async renderToString
  }
  
  // Serialization for SSR
  if (isServer && state.state === READY) {
    const serialized = options.storage
      ? options.storage(state.value!)
      : state.value;
    
    registerHydrationData(serialized);
  }
  
  // ... rest of implementation
}
```

## Advanced Features

### 1. Cancel Previous Fetches

```typescript
interface ResourceState<T> {
  // ... other properties
  abortController?: AbortController;
}

function load(sourceValue: S, refetch: boolean = false) {
  // Cancel previous fetch
  if (state.abortController) {
    state.abortController.abort();
  }
  
  // Create new abort controller
  state.abortController = new AbortController();
  
  // Call fetcher with signal
  const promise = fetcher(sourceValue, {
    value: state.value,
    refetching: refetch,
    signal: state.abortController.signal
  });
  
  // ... rest of load logic
}
```

### 2. Retry Logic

```typescript
interface ResourceOptions<T> {
  // ... other options
  retry?: number | ((error: any, retries: number) => boolean);
  retryDelay?: number | ((retries: number) => number);
}

function load(sourceValue: S, refetch: boolean = false, retries = 0) {
  const promise = fetcher(sourceValue, {
    value: state.value,
    refetching: refetch
  });
  
  promise.catch((error) => {
    // Determine if we should retry
    let shouldRetry = false;
    
    if (typeof options.retry === 'number') {
      shouldRetry = retries < options.retry;
    } else if (typeof options.retry === 'function') {
      shouldRetry = options.retry(error, retries);
    }
    
    if (shouldRetry) {
      // Calculate delay
      const delay = typeof options.retryDelay === 'function'
        ? options.retryDelay(retries)
        : options.retryDelay || 1000;
      
      // Retry after delay
      setTimeout(() => {
        load(sourceValue, refetch, retries + 1);
      }, delay);
    } else {
      // Give up, set error state
      handleError(error);
    }
  });
}
```

### 3. Cache/Deduplication

```typescript
// Global cache for deduplication
const resourceCache = new Map<string, Promise<any>>();

function load(sourceValue: S, refetch: boolean = false) {
  // Generate cache key
  const cacheKey = options.cacheKey
    ? options.cacheKey(sourceValue)
    : JSON.stringify(sourceValue);
  
  // Check cache
  if (!refetch && resourceCache.has(cacheKey)) {
    const cachedPromise = resourceCache.get(cacheKey)!;
    
    // Reuse cached promise
    state.loading = cachedPromise;
    // ... attach handlers
    
    return;
  }
  
  // Create new promise
  const promise = fetcher(sourceValue, {
    value: state.value,
    refetching: refetch
  });
  
  // Cache promise
  resourceCache.set(cacheKey, promise);
  
  // Remove from cache after resolution
  promise.finally(() => {
    if (resourceCache.get(cacheKey) === promise) {
      resourceCache.delete(cacheKey);
    }
  });
  
  // ... rest of load logic
}
```

## Complete Implementation

Here's the full implementation with all features:

```typescript
export function createResource<T, S = true>(
  pSource?: S | false | (() => S | false | Promise<T>),
  pFetcher?: ((source: S, info: ResourceFetcherInfo<T>) => Promise<T>) | ResourceOptions<T>,
  pOptions?: ResourceOptions<T>
): ResourceReturn<T> {
  // Parse overloads
  let source: (() => S | false) | undefined;
  let fetcher: (source: S, info: ResourceFetcherInfo<T>) => Promise<T>;
  let options: ResourceOptions<T> = {};
  
  if (arguments.length === 1 && typeof pSource === 'function') {
    fetcher = pSource as any;
  } else if (arguments.length === 2) {
    if (typeof pFetcher === 'object') {
      fetcher = pSource as any;
      options = pFetcher;
    } else {
      source = typeof pSource === 'function' ? pSource : () => pSource as S;
      fetcher = pFetcher;
    }
  } else {
    source = typeof pSource === 'function' ? pSource : () => pSource as S;
    fetcher = pFetcher as any;
    options = pOptions || {};
  }
  
  // Create state
  const state = createResourceState<T>(options.initialValue);
  const [track, trigger] = createSignal<void>(undefined, { equals: false });
  const suspenseContext = getSuspenseContext();
  
  // SSR: Check for hydration data
  if (!isServer && isHydrating) {
    const data = readHydrationData();
    if (data !== undefined) {
      state.value = data;
      state.state = READY;
      options.onHydrated?.(data);
    }
  }
  
  // Load function
  function load(sourceValue: S, isRefetch: boolean = false, info?: unknown) {
    const hasValue = state.value !== undefined;
    
    // Cancel previous
    state.abortController?.abort();
    state.abortController = new AbortController();
    
    // Update state
    if (hasValue && isRefetch) {
      state.state = REFRESHING;
    } else {
      state.state = PENDING;
      if (suspenseContext && !state.suspended) {
        suspenseContext.increment();
        state.suspended = true;
      }
    }
    
    // Call fetcher
    const promise = fetcher(sourceValue, {
      value: state.value,
      refetching: isRefetch || info,
      signal: state.abortController.signal
    });
    
    state.loading = promise;
    
    // Handle resolution
    promise.then(
      (value) => {
        if (state.loading !== promise) return;
        
        state.state = READY;
        state.value = value;
        state.error = undefined;
        state.loading = null;
        
        if (state.suspended) {
          suspenseContext?.decrement();
          state.suspended = false;
        }
        
        // SSR: Serialize
        if (isServer) {
          const serialized = options.storage ? options.storage(value) : value;
          writeHydrationData(serialized);
        }
        
        trigger();
      },
      (error) => {
        if (state.loading !== promise) return;
        
        state.state = ERRORED;
        state.error = error;
        state.value = undefined;
        state.loading = null;
        
        if (state.suspended) {
          suspenseContext?.decrement();
          state.suspended = false;
        }
        
        trigger();
      }
    );
  }
  
  // Source tracking
  if (source) {
    createEffect(() => {
      const v = source!();
      if (v !== false) {
        load(v as S, state.state !== UNRESOLVED);
      }
    });
  }
  
  // Read function
  const read = () => {
    track();
    if (state.error !== undefined && state.state === ERRORED) {
      throw state.error;
    }
    return state.value;
  };
  
  // Properties
  Object.defineProperties(read, {
    state: { get: () => stateNames[state.state] },
    error: { get: () => state.error },
    loading: { get: () => state.state === PENDING || state.state === REFRESHING },
    latest: { get: () => (track(), state.value) }
  });
  
  // Actions
  const mutate = (v: any) => {
    const newValue = typeof v === 'function' ? v(state.value) : v;
    state.value = newValue;
    state.state = newValue !== undefined ? READY : UNRESOLVED;
    state.error = undefined;
    trigger();
    return newValue;
  };
  
  const refetch = (info?: unknown) => {
    const sourceValue = source ? untrack(source) : undefined;
    if (sourceValue !== false) {
      load(sourceValue as S, true, info);
    }
  };
  
  // Cleanup
  onCleanup(() => {
    state.abortController?.abort();
    if (state.suspended) {
      suspenseContext?.decrement();
    }
  });
  
  return [read as Resource<T>, { mutate, refetch }];
}
```

## Usage Examples

### Basic Usage

```typescript
const [data] = createResource(fetchData);

<Show when={data()}>
  {value => <Display data={value} />}
</Show>
```

### With Source

```typescript
const [userId, setUserId] = createSignal(1);
const [user] = createResource(userId, fetchUser);

<button onClick={() => setUserId(2)}>Load User 2</button>
```

### With Options

```typescript
const [data] = createResource(fetchData, {
  initialValue: [],
  name: 'my-data',
  storage: (value) => JSON.stringify(value),
  onHydrated: (value) => console.log('Hydrated:', value)
});
```

### Manual Control

```typescript
const [data, { mutate, refetch }] = createResource(fetchData);

<button onClick={() => refetch()}>Refresh</button>
<button onClick={() => mutate([])}>Clear</button>
```

## Summary

We've built a complete `createResource` implementation with:

1. **Full state management** - All 5 states handled correctly
2. **Suspense integration** - Proper increment/decrement
3. **Source tracking** - Reactive source with refetch
4. **SSR support** - Serialization and hydration
5. **Advanced features** - Cancellation, retry, caching
6. **Type safety** - Complete TypeScript types

## Next Steps

In the next lesson, we'll explore Suspense integration in depth and build our own Suspense component.

## Key Takeaways

- Resources are complex but can be built from simpler primitives
- State management is at the core of resource behavior
- Suspense integration uses increment/decrement counters
- SSR requires careful serialization and hydration handling
- Advanced features like cancellation and retry enhance robustness
- Proper cleanup prevents memory leaks
