# Lesson 1: Resource Architecture

## Introduction

Resources in Solid.js represent a powerful abstraction for handling asynchronous data in a reactive system. Unlike simple signals, resources understand promises, manage loading states, and integrate seamlessly with Suspense boundaries. This lesson explores how resources work under the hood.

## What is a Resource?

A **resource** is a specialized reactive primitive designed for async operations. While signals hold synchronous values, resources hold values that might not be available immediately.

### Key Characteristics

1. **State Management** - Tracks loading, ready, error, and refreshing states
2. **Promise Integration** - Automatically handles promise resolution
3. **Suspense Support** - Integrates with Suspense boundaries for loading UI
4. **Caching** - Can cache results and prevent unnecessary refetches
5. **SSR Compatible** - Works in server-side rendering contexts

## Resource States

Resources use a state machine with five distinct states:

```javascript
const UNRESOLVED = 0;  // Initial state, no fetch attempted
const PENDING = 1;      // Fetch in progress, no previous value
const READY = 2;        // Data available
const REFRESHING = 3;   // Refetching with previous value available
const ERRORED = 4;      // Fetch failed
```

### State Transitions

```
UNRESOLVED → PENDING → READY
                     → ERRORED

READY → REFRESHING → READY
                   → ERRORED

ERRORED → PENDING → READY
                  → ERRORED
```

### Understanding Each State

#### UNRESOLVED (0)
```javascript
// Resource created but source hasn't triggered a fetch
const [data] = createResource(null, fetchUser);
// State: UNRESOLVED
// data() returns undefined
// resource.loading returns false
```

**Characteristics:**
- No fetch has been attempted
- `data()` returns `undefined`
- `loading` is `false`
- Suspense is NOT triggered

#### PENDING (1)
```javascript
// First fetch initiated
const [data] = createResource(() => userId(), fetchUser);
// If userId() has a value, immediately transitions to PENDING
// State: PENDING
// data() returns undefined
// resource.loading returns true
```

**Characteristics:**
- Fetch in progress
- No previous value available
- `data()` returns `undefined`
- `loading` is `true`
- **Suspense IS triggered** - Component suspends

#### READY (2)
```javascript
// Promise resolved successfully
// State: READY
// data() returns the fetched value
// resource.loading returns false
```

**Characteristics:**
- Data successfully fetched
- `data()` returns the value
- `loading` is `false`
- Suspense is released
- `error` is `undefined`

#### REFRESHING (3)
```javascript
// Refetching while previous value exists
resource.refetch();
// State: REFRESHING
// data() returns the OLD value (stale-while-revalidate)
// resource.loading returns true
```

**Characteristics:**
- New fetch in progress
- Previous value still available
- `data()` returns the **old value**
- `loading` is `true`
- `latest` may differ from `data()`
- Suspense is NOT triggered (UI remains interactive)

#### ERRORED (4)
```javascript
// Promise rejected
// State: ERRORED
// data() returns undefined
// resource.error contains the error
```

**Characteristics:**
- Fetch failed
- `data()` returns `undefined`
- `error` contains the rejection reason
- `loading` is `false`
- Error boundaries can catch this

## Resource Structure

In Solid.js, a resource is internally represented with several properties:

```typescript
interface ResourceReturn<T> {
  (): T | undefined;           // Getter function (reactive)
  state: ResourceState;        // Current state
  loading: boolean;            // Is fetching?
  error: any;                  // Error if ERRORED state
  latest: T | undefined;       // Latest value (even during REFRESHING)
}

interface ResourceActions<T> {
  mutate: (v: T | undefined) => T | undefined;  // Update value manually
  refetch: (info?: unknown) => void;             // Trigger new fetch
}

type Resource<T> = [
  ResourceReturn<T>,
  ResourceActions<T>
];
```

### Implementation Details

```typescript
interface ResourceState<T> {
  // Core state
  value: T | undefined;           // Current resolved value
  error: any;                     // Current error
  state: 0 | 1 | 2 | 3 | 4;       // State enum
  
  // Promises
  loading: Promise<T> | null;     // Current fetch promise
  
  // SSR support
  serialized?: string;            // Serialized data for hydration
  
  // Tracking
  sources: Set<Computation> | null;  // Reactive sources to track
}
```

## How Resources Work

### 1. Creation Phase

```javascript
const [data, { mutate, refetch }] = createResource(source, fetcher);
```

**What happens:**
1. Create internal state structure
2. Set up reactive tracking for the source
3. Initialize state as UNRESOLVED
4. Register cleanup functions

### 2. Source Tracking

```javascript
const [userId, setUserId] = createSignal(1);
const [user] = createResource(userId, fetchUser);
//                              ^^^^^^
//                              This is the SOURCE
```

**The source function:**
- Runs in a reactive context
- When it returns a non-`false` value, triggers a fetch
- When it returns `false`, the resource stays UNRESOLVED
- Automatically re-runs when dependencies change

### 3. Fetching Process

```javascript
function fetchUser(id, { value, refetching }) {
  // value: previous value (if refetching)
  // refetching: boolean indicating if this is a refetch
  return fetch(`/api/users/${id}`).then(r => r.json());
}
```

**Step-by-step:**

1. **Determine State**
   ```javascript
   if (hasValue) {
     state = REFRESHING;  // Keep showing old data
   } else {
     state = PENDING;     // Trigger Suspense
   }
   ```

2. **Invoke Fetcher**
   ```javascript
   const promise = fetcher(sourceValue, {
     value: currentValue,
     refetching: state === REFRESHING
   });
   ```

3. **Track Promise**
   ```javascript
   if (state === PENDING) {
     suspenseContext?.increment();  // Tell Suspense to wait
   }
   
   promise.then(
     result => handleSuccess(result),
     error => handleError(error)
   );
   ```

4. **Handle Resolution**
   ```javascript
   function handleSuccess(result) {
     state = READY;
     value = result;
     error = undefined;
     
     if (wasPending) {
       suspenseContext?.decrement();  // Release Suspense
     }
   }
   
   function handleError(err) {
     state = ERRORED;
     error = err;
     value = undefined;
     
     if (wasPending) {
       suspenseContext?.decrement();
     }
   }
   ```

## Suspense Integration

Resources integrate with Suspense through a counter-based system:

```javascript
interface SuspenseContext {
  increment: () => void;  // Resource started loading
  decrement: () => void;  // Resource finished loading
  count: number;          // Active loading resources
}
```

### How It Works

```javascript
// When resource enters PENDING state
if (!previousValue) {
  suspenseContext?.increment();
  // Suspense shows fallback when count > 0
}

// When resource resolves
suspenseContext?.decrement();
// Suspense shows content when count === 0
```

### Example Flow

```javascript
<Suspense fallback={<Loading />}>
  <UserProfile />
  <UserPosts />
</Suspense>
```

**Timeline:**
1. `UserProfile` resource starts: `count = 1` → Show fallback
2. `UserPosts` resource starts: `count = 2` → Continue showing fallback
3. `UserProfile` finishes: `count = 1` → Continue showing fallback
4. `UserPosts` finishes: `count = 0` → **Show content**

## SSR and Hydration

Resources handle server-side rendering specially:

### Server Side

```javascript
// On server, resources can:
// 1. Wait for promises (async renderToString)
// 2. Serialize resolved values
// 3. Embed data in HTML
```

### Client Side (Hydration)

```javascript
// On client:
// 1. Read serialized data from HTML
// 2. Initialize resource with data (READY state)
// 3. Skip initial fetch
// 4. Re-fetch only when source changes
```

### Serialization Structure

```javascript
interface SerializedResource {
  state: 2 | 4;           // READY or ERRORED
  value?: any;            // Serialized value
  error?: any;            // Serialized error
}
```

## Resource Lifecycle

### Complete Lifecycle

```javascript
// 1. CREATION
const [data, actions] = createResource(source, fetcher);

// 2. SOURCE EVALUATION
createEffect(() => {
  const sourceValue = source();
  if (sourceValue !== false) {
    // Trigger fetch
  }
});

// 3. FETCHING
state = hasValue ? REFRESHING : PENDING;
if (state === PENDING) suspense?.increment();

// 4. RESOLUTION
promise.then(
  value => {
    state = READY;
    if (wasPending) suspense?.decrement();
  },
  error => {
    state = ERRORED;
    if (wasPending) suspense?.decrement();
  }
);

// 5. CLEANUP
onCleanup(() => {
  // Dispose effects
  // Clear promises
  // Remove suspense tracking
});
```

## Memory Management

Resources need careful memory management:

### Cleanup Concerns

```javascript
function UserProfile(props) {
  const [user] = createResource(() => props.userId, fetchUser);
  
  // When component unmounts:
  // - Cancel pending fetches (if possible)
  // - Remove suspense tracking
  // - Dispose reactive effects
  // - Clear internal state
}
```

### Implementation

```javascript
class ResourceImpl {
  dispose() {
    // 1. Cancel fetch
    if (this.loading) {
      this.cancelFetch?.();
    }
    
    // 2. Clear suspense
    if (this.suspensed) {
      this.suspenseContext?.decrement();
    }
    
    // 3. Dispose effects
    this.sourceEffect?.dispose();
    
    // 4. Clear references
    this.value = undefined;
    this.error = undefined;
    this.sources?.clear();
  }
}
```

## Advanced Resource Patterns

### Pattern 1: Optimistic Updates

```javascript
const [todos, { mutate }] = createResource(fetchTodos);

function addTodo(text) {
  const optimisticTodo = { id: Date.now(), text, temp: true };
  
  // Optimistically update
  mutate(prev => [...prev, optimisticTodo]);
  
  // Send to server
  createTodo(text).then(
    serverTodo => mutate(prev => 
      prev.map(t => t.id === optimisticTodo.id ? serverTodo : t)
    ),
    error => {
      // Rollback on error
      mutate(prev => prev.filter(t => t.id !== optimisticTodo.id));
    }
  );
}
```

### Pattern 2: Dependent Resources

```javascript
const [userId] = createSignal(1);
const [user] = createResource(userId, fetchUser);

// This resource depends on the first one
const [posts] = createResource(
  () => user()?.id,  // Only fetch when user is loaded
  fetchUserPosts
);
```

### Pattern 3: Parallel Resources

```javascript
const [userId] = createSignal(1);

// Both fetch in parallel
const [user] = createResource(userId, fetchUser);
const [settings] = createResource(userId, fetchSettings);

// Suspense waits for BOTH
<Suspense fallback={<Loading />}>
  <UserProfile user={user()} settings={settings()} />
</Suspense>
```

### Pattern 4: Manual Refetch

```javascript
const [data, { refetch }] = createResource(fetchData);

// Refetch on demand
<button onClick={() => refetch()}>
  Refresh
</button>

// Refetch with custom info
<button onClick={() => refetch({ force: true })}>
  Force Refresh
</button>
```

## Performance Considerations

### 1. Avoid Unnecessary Fetches

```javascript
// BAD: Refetches on every render
const [data] = createResource(() => Math.random(), fetcher);

// GOOD: Only fetches when source changes
const [id] = createSignal(1);
const [data] = createResource(id, fetcher);
```

### 2. Use REFRESHING State

```javascript
// Show stale data while refetching
<Show when={data()} fallback={<Loading />}>
  {value => (
    <div class={resource.loading ? 'opacity-50' : ''}>
      <Data value={value} />
    </div>
  )}
</Show>
```

### 3. Debounce Source

```javascript
const [search, setSearch] = createSignal('');
const debouncedSearch = createMemo(() => {
  const value = search();
  // Debounce logic
  return value;
});

const [results] = createResource(debouncedSearch, searchAPI);
```

## Comparison with Other Patterns

### vs. Signals

| Feature | Signal | Resource |
|---------|--------|----------|
| Sync/Async | Synchronous | Asynchronous |
| Loading State | Manual | Built-in |
| Suspense | No | Yes |
| Error Handling | Manual | Built-in |
| Caching | Manual | Configurable |

### vs. Effects

| Feature | Effect | Resource |
|---------|--------|----------|
| Purpose | Side effects | Data fetching |
| Return Value | None | Reactive value |
| Suspense | No | Yes |
| State Management | Manual | Automatic |

## Common Patterns

### Loading States

```javascript
const [data] = createResource(fetcher);

// Access loading state
<Show 
  when={!resource.loading}
  fallback={<Spinner />}
>
  {data()}
</Show>
```

### Error Handling

```javascript
const [data] = createResource(fetcher);

// Check error
<Show 
  when={!resource.error}
  fallback={<ErrorDisplay error={resource.error} />}
>
  {data()}
</Show>
```

### Latest Value

```javascript
const [data] = createResource(fetcher);

// Use latest value (even during REFRESHING)
<div>
  Latest: {resource.latest}
  {resource.loading && '(updating...)'}
</div>
```

## Summary

Resources are sophisticated reactive primitives that:

1. **Manage async state** through a well-defined state machine
2. **Integrate with Suspense** for coordinated loading UI
3. **Handle SSR/hydration** automatically
4. **Provide refetch/mutate** for data management
5. **Support advanced patterns** like optimistic updates

Understanding resource architecture is crucial for building robust async features in reactive applications.

## Next Steps

In the next lesson, we'll implement `createResource` from scratch, building each piece of the architecture we've explored here.

## Key Takeaways

- Resources have 5 states: UNRESOLVED, PENDING, READY, REFRESHING, ERRORED
- PENDING triggers Suspense, REFRESHING doesn't
- Resources track sources reactively and refetch when they change
- The fetcher receives the source value and previous state
- Suspense uses increment/decrement to coordinate multiple resources
- Resources handle SSR through serialization and hydration
- Proper cleanup is essential for memory management
