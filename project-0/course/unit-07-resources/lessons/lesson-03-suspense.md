# Lesson 3: Suspense Integration

## Introduction

Suspense is a powerful pattern for coordinating loading states across multiple async resources. In this lesson, we'll explore how Suspense works internally, build our own Suspense component, and understand how resources integrate with it.

## What is Suspense?

**Suspense** is a boundary component that shows fallback UI while resources are loading. Unlike manual loading states, Suspense automatically coordinates multiple resources and shows content only when ALL resources are ready.

### Key Benefits

1. **Declarative Loading** - No manual `if (loading)` checks
2. **Coordination** - Waits for all resources in the tree
3. **Prevents Flicker** - Shows fallback until everything is ready
4. **Nested Boundaries** - Granular loading states
5. **Error Boundaries** - Pairs with error handling

## The Suspense Pattern

### Basic Usage

```javascript
<Suspense fallback={<Loading />}>
  <UserProfile />  {/* Uses resource */}
  <UserPosts />    {/* Uses resource */}
</Suspense>
```

**Behavior:**
- Shows `<Loading />` while ANY resource is PENDING
- Shows children when ALL resources are READY
- Continues showing children during REFRESHING

### Multiple Boundaries

```javascript
<Suspense fallback={<PageLoader />}>
  <Header />
  
  <Suspense fallback={<UserLoader />}>
    <UserProfile />
  </Suspense>
  
  <Suspense fallback={<PostsLoader />}>
    <UserPosts />
  </Suspense>
</Suspense>
```

**Behavior:**
- Each boundary manages its own resources
- Nested boundaries show their own fallbacks
- Parent waits for all nested boundaries

## Suspense Context Architecture

### Context Structure

```typescript
interface SuspenseContext {
  // Counter methods
  increment: () => void;  // Resource starts loading
  decrement: () => void;  // Resource finishes
  
  // Current count
  count: () => number;
  
  // Registration
  register: (resource: Resource<any>) => void;
  unregister: (resource: Resource<any>) => void;
  
  // Nested contexts
  parent?: SuspenseContext;
}
```

### How It Works

```javascript
// Counter-based approach
count === 0  →  Show content
count > 0    →  Show fallback

// When resource enters PENDING state
suspenseContext.increment()  // count: 0 → 1

// When resource resolves
suspenseContext.decrement()  // count: 1 → 0
```

### Visual Flow

```
Initial State: count = 0
├─ Show content
│
Resource 1 loads: increment()
├─ count = 1
├─ Show fallback
│
Resource 2 loads: increment()
├─ count = 2
├─ Continue showing fallback
│
Resource 1 resolves: decrement()
├─ count = 1
├─ Continue showing fallback
│
Resource 2 resolves: decrement()
├─ count = 0
└─ Show content (all ready!)
```

## Building Suspense: Step by Step

### Step 1: Basic Structure

```typescript
import { JSX, createSignal, createContext, useContext } from 'solid-js';

interface SuspenseContext {
  increment: () => void;
  decrement: () => void;
  count: () => number;
}

const SuspenseContextSymbol = Symbol('suspense-context');

function Suspense(props: {
  fallback: JSX.Element;
  children: JSX.Element;
}) {
  // Create counter signal
  const [count, setCount] = createSignal(0);
  
  // Create context value
  const context: SuspenseContext = {
    increment: () => setCount(c => c + 1),
    decrement: () => setCount(c => Math.max(0, c - 1)),
    count
  };
  
  // Provide context to children
  // (Implementation-specific: use your framework's context provider)
  
  // Render based on count
  return count() > 0 ? props.fallback : props.children;
}
```

### Step 2: Context Provision

```typescript
function Suspense(props: {
  fallback: JSX.Element;
  children: JSX.Element;
}) {
  const [count, setCount] = createSignal(0);
  
  const context: SuspenseContext = {
    increment: () => {
      console.log('Suspense increment:', count() + 1);
      setCount(c => c + 1);
    },
    decrement: () => {
      console.log('Suspense decrement:', count() - 1);
      setCount(c => Math.max(0, c - 1));
    },
    count
  };
  
  // Store context in owner's context map
  const owner = getOwner();
  if (owner) {
    if (!owner.context) owner.context = {};
    owner.context[SuspenseContextSymbol] = context;
  }
  
  return () => count() > 0 ? props.fallback : props.children;
}
```

### Step 3: Accessing Context

```typescript
function getSuspenseContext(): SuspenseContext | undefined {
  const owner = getOwner();
  
  // Walk up owner tree to find suspense context
  let current = owner;
  while (current) {
    if (current.context?.[SuspenseContextSymbol]) {
      return current.context[SuspenseContextSymbol];
    }
    current = current.owner;
  }
  
  return undefined;
}
```

### Step 4: Resource Integration

```typescript
function createResource<T>(fetcher: () => Promise<T>): ResourceReturn<T> {
  const state = createResourceState<T>();
  const [track, trigger] = createSignal<void>(undefined, { equals: false });
  
  // Get suspense context
  const suspenseContext = getSuspenseContext();
  
  function load() {
    const hasValue = state.value !== undefined;
    
    if (!hasValue) {
      state.state = PENDING;
      
      // Increment suspense
      if (suspenseContext && !state.suspended) {
        suspenseContext.increment();
        state.suspended = true;
      }
    } else {
      state.state = REFRESHING;
      // Don't increment for REFRESHING
    }
    
    const promise = fetcher();
    state.loading = promise;
    
    promise.then(
      (value) => {
        state.state = READY;
        state.value = value;
        
        // Decrement suspense
        if (state.suspended && suspenseContext) {
          suspenseContext.decrement();
          state.suspended = false;
        }
        
        trigger();
      },
      (error) => {
        state.state = ERRORED;
        state.error = error;
        
        // Decrement suspense
        if (state.suspended && suspenseContext) {
          suspenseContext.decrement();
          state.suspended = false;
        }
        
        trigger();
      }
    );
  }
  
  // Initial load
  load();
  
  // Cleanup
  onCleanup(() => {
    if (state.suspended && suspenseContext) {
      suspenseContext.decrement();
      state.suspended = false;
    }
  });
  
  // ... rest of implementation
}
```

## Advanced Suspense Features

### 1. Nested Suspense

```typescript
interface SuspenseContext {
  increment: () => void;
  decrement: () => void;
  count: () => number;
  parent?: SuspenseContext;  // Add parent reference
}

function Suspense(props: {
  fallback: JSX.Element;
  children: JSX.Element;
}) {
  const [count, setCount] = createSignal(0);
  
  // Get parent suspense context
  const parentContext = getSuspenseContext();
  
  const context: SuspenseContext = {
    increment: () => {
      setCount(c => c + 1);
      
      // Also increment parent when transitioning 0 → 1
      if (count() === 0 && parentContext) {
        parentContext.increment();
      }
    },
    decrement: () => {
      setCount(c => Math.max(0, c - 1));
      
      // Also decrement parent when transitioning 1 → 0
      if (count() === 1 && parentContext) {
        parentContext.decrement();
      }
    },
    count,
    parent: parentContext
  };
  
  // Provide context
  provideContext(SuspenseContextSymbol, context);
  
  return () => count() > 0 ? props.fallback : props.children;
}
```

### 2. Suspense List

Coordinate order of appearance for multiple suspense boundaries:

```typescript
type SuspenseListRevealOrder = 'forwards' | 'backwards' | 'together';

function SuspenseList(props: {
  revealOrder?: SuspenseListRevealOrder;
  tail?: 'collapsed' | 'hidden';
  children: JSX.Element;
}) {
  const [revealed, setRevealed] = createSignal<Set<number>>(new Set());
  
  // Track child suspense states
  const childStates = new Map<number, boolean>();
  
  function registerChild(index: number, isReady: boolean) {
    childStates.set(index, isReady);
    updateRevealed();
  }
  
  function updateRevealed() {
    const newRevealed = new Set<number>();
    
    if (props.revealOrder === 'forwards') {
      // Reveal in order from start
      for (let i = 0; i < childStates.size; i++) {
        if (childStates.get(i)) {
          newRevealed.add(i);
        } else {
          break; // Stop at first not ready
        }
      }
    } else if (props.revealOrder === 'backwards') {
      // Reveal in order from end
      for (let i = childStates.size - 1; i >= 0; i--) {
        if (childStates.get(i)) {
          newRevealed.add(i);
        } else {
          break;
        }
      }
    } else {
      // 'together' - reveal all when all ready
      if (Array.from(childStates.values()).every(ready => ready)) {
        childStates.forEach((_, index) => newRevealed.add(index));
      }
    }
    
    setRevealed(newRevealed);
  }
  
  // Provide context for children to register
  const context = { registerChild };
  provideContext(SuspenseListContextSymbol, context);
  
  return props.children;
}
```

### 3. Transition Integration

Combine Suspense with transitions for better UX:

```typescript
function Suspense(props: {
  fallback: JSX.Element;
  children: JSX.Element;
}) {
  const [count, setCount] = createSignal(0);
  const transition = useTransition();
  
  const context: SuspenseContext = {
    increment: () => {
      setCount(c => c + 1);
      
      // If in transition, don't show fallback immediately
      if (!transition.pending()) {
        // Show fallback
      }
    },
    decrement: () => {
      setCount(c => Math.max(0, c - 1));
    },
    count
  };
  
  provideContext(SuspenseContextSymbol, context);
  
  return () => {
    // During transition, keep showing old content
    if (transition.pending() && count() > 0) {
      return <div class="opacity-50">{props.children}</div>;
    }
    
    return count() > 0 ? props.fallback : props.children;
  };
}
```

## Error Boundaries with Suspense

Suspense works alongside error boundaries:

```typescript
function ErrorBoundary(props: {
  fallback: (error: any, reset: () => void) => JSX.Element;
  children: JSX.Element;
}) {
  const [error, setError] = createSignal<any>(undefined);
  
  function reset() {
    setError(undefined);
  }
  
  // Catch errors from resources
  try {
    return () => {
      const err = error();
      if (err) {
        return props.fallback(err, reset);
      }
      return props.children;
    };
  } catch (e) {
    setError(e);
    return props.fallback(e, reset);
  }
}

// Usage
<ErrorBoundary fallback={(err, reset) => (
  <div>
    <p>Error: {err.message}</p>
    <button onClick={reset}>Retry</button>
  </div>
)}>
  <Suspense fallback={<Loading />}>
    <DataComponent />
  </Suspense>
</ErrorBoundary>
```

## SSR Considerations

### Server-Side Behavior

On the server, Suspense must wait for all resources:

```typescript
async function renderToString(app: JSX.Element): Promise<string> {
  const suspensePromises: Promise<void>[] = [];
  
  // Collect all suspense promises
  function collectSuspensePromises(context: SuspenseContext) {
    if (context.count() > 0) {
      // Create promise that resolves when count reaches 0
      const promise = new Promise<void>((resolve) => {
        const checkCount = () => {
          if (context.count() === 0) {
            resolve();
          } else {
            // Check again after a tick
            setTimeout(checkCount, 0);
          }
        };
        checkCount();
      });
      
      suspensePromises.push(promise);
    }
  }
  
  // Render once to trigger resources
  renderApp(app);
  
  // Wait for all suspense boundaries
  await Promise.all(suspensePromises);
  
  // Render again with data
  return renderApp(app);
}
```

### Streaming SSR

For streaming, send fallback first, then replace:

```typescript
async function* renderToStream(app: JSX.Element): AsyncGenerator<string> {
  // Send initial HTML with fallbacks
  yield renderWithFallbacks(app);
  
  // Wait for resources and send replacements
  const suspenseBoundaries = collectBoundaries(app);
  
  for (const boundary of suspenseBoundaries) {
    await boundary.ready();
    
    yield `
      <template id="${boundary.id}">
        ${renderBoundaryContent(boundary)}
      </template>
      <script>
        document.getElementById('${boundary.placeholder}')
          .replaceWith(
            document.getElementById('${boundary.id}').content
          );
      </script>
    `;
  }
}
```

## Practical Patterns

### Pattern 1: Skeleton UI

```typescript
function UserProfile() {
  const [user] = createResource(fetchUser);
  
  return (
    <Suspense fallback={<UserProfileSkeleton />}>
      <div class="profile">
        <img src={user().avatar} />
        <h1>{user().name}</h1>
        <p>{user().bio}</p>
      </div>
    </Suspense>
  );
}

function UserProfileSkeleton() {
  return (
    <div class="profile skeleton">
      <div class="avatar-skeleton" />
      <div class="name-skeleton" />
      <div class="bio-skeleton" />
    </div>
  );
}
```

### Pattern 2: Granular Loading

```typescript
function Dashboard() {
  return (
    <div>
      <Header /> {/* No suspense, always shown */}
      
      <Suspense fallback={<StatsLoader />}>
        <Stats />
      </Suspense>
      
      <Suspense fallback={<ChartsLoader />}>
        <Charts />
      </Suspense>
      
      <Suspense fallback={<ActivityLoader />}>
        <Activity />
      </Suspense>
    </div>
  );
}
```

### Pattern 3: Parallel Data Fetching

```typescript
function UserPage(props: { userId: number }) {
  // Both resources start fetching immediately
  const [user] = createResource(() => props.userId, fetchUser);
  const [posts] = createResource(() => props.userId, fetchPosts);
  
  // Single suspense waits for both
  return (
    <Suspense fallback={<PageLoader />}>
      <div>
        <UserInfo user={user()} />
        <PostsList posts={posts()} />
      </div>
    </Suspense>
  );
}
```

### Pattern 4: Dependent Resources

```typescript
function UserPosts(props: { userId: number }) {
  const [user] = createResource(() => props.userId, fetchUser);
  
  // This resource waits for user to load
  const [posts] = createResource(
    () => user()?.id,  // Only runs when user() is available
    fetchPosts
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

### Pattern 5: Refresh UI

```typescript
function DataView() {
  const [data, { refetch }] = createResource(fetchData);
  
  return (
    <div>
      <button onClick={() => refetch()}>
        Refresh
      </button>
      
      <Suspense fallback={<Loading />}>
        <Show 
          when={!resource.loading}
          fallback={<div class="refreshing">Updating...</div>}
        >
          <DataDisplay data={data()} />
        </Show>
      </Suspense>
    </div>
  );
}
```

## Debugging Suspense

### Add Logging

```typescript
function Suspense(props: {
  fallback: JSX.Element;
  children: JSX.Element;
  name?: string;
}) {
  const [count, setCount] = createSignal(0);
  
  const context: SuspenseContext = {
    increment: () => {
      const newCount = count() + 1;
      console.log(`[Suspense ${props.name}] increment: ${count()} → ${newCount}`);
      setCount(newCount);
    },
    decrement: () => {
      const newCount = Math.max(0, count() - 1);
      console.log(`[Suspense ${props.name}] decrement: ${count()} → ${newCount}`);
      setCount(newCount);
    },
    count
  };
  
  createEffect(() => {
    console.log(`[Suspense ${props.name}] count:`, count());
  });
  
  // ... rest
}
```

### Visualize State

```typescript
function SuspenseDebugger(props: { name: string }) {
  const context = getSuspenseContext();
  
  if (!context) return null;
  
  return (
    <div class="suspense-debugger">
      <strong>{props.name}:</strong> {context.count()} pending
    </div>
  );
}

// Usage
<Suspense fallback={<Loading />} name="user-data">
  <SuspenseDebugger name="user-data" />
  <UserProfile />
</Suspense>
```

## Performance Considerations

### 1. Minimize Suspense Boundaries

```typescript
// BAD: Too many boundaries
<Suspense fallback={<Loader />}>
  <Suspense fallback={<Loader />}>
    <ComponentA />
  </Suspense>
</Suspense>

// GOOD: Single boundary when appropriate
<Suspense fallback={<Loader />}>
  <ComponentA />
</Suspense>
```

### 2. Optimize Fallbacks

```typescript
// Fallbacks should be lightweight
function Fallback() {
  return (
    <div class="skeleton">
      {/* Simple, static content */}
      <div class="skeleton-line" />
      <div class="skeleton-line" />
    </div>
  );
}

// Avoid complex logic in fallbacks
function BadFallback() {
  const [data] = createResource(fetchSomething); // DON'T DO THIS
  // ...
}
```

### 3. Use Transitions for Better UX

```typescript
const [pending, start] = useTransition();

function handleClick() {
  start(() => {
    // This won't show suspense fallback
    // until transition timeout
    navigate('/next-page');
  });
}
```

## Common Pitfalls

### 1. Missing Suspense Boundary

```typescript
// ERROR: Resource without Suspense throws
function BadComponent() {
  const [data] = createResource(fetchData);
  return <div>{data()}</div>; // Throws if not in Suspense
}

// CORRECT: Wrap in Suspense
function GoodComponent() {
  return (
    <Suspense fallback={<Loading />}>
      <BadComponent />
    </Suspense>
  );
}
```

### 2. Suspense with Control Flow

```typescript
// BAD: Show hides content, Suspense still active
<Suspense fallback={<Loading />}>
  <Show when={someCondition()}>
    <DataComponent />
  </Show>
</Suspense>

// GOOD: Control flow outside Suspense
<Show when={someCondition()}>
  <Suspense fallback={<Loading />}>
    <DataComponent />
  </Suspense>
</Show>
```

### 3. Forgot to Decrement

```typescript
// BUG: Suspense stuck showing fallback
function brokenLoad() {
  suspenseContext.increment();
  
  fetchData().then(value => {
    // FORGOT to decrement!
    // Suspense will show fallback forever
  });
}

// CORRECT: Always decrement
function correctLoad() {
  suspenseContext.increment();
  
  fetchData()
    .then(value => {
      suspenseContext.decrement();
    })
    .catch(error => {
      suspenseContext.decrement(); // Also on error!
    });
}
```

## Summary

Suspense provides a powerful abstraction for coordinating async loading states:

1. **Counter-based** - Simple increment/decrement pattern
2. **Context-driven** - Resources find their boundary via context
3. **Composable** - Nested boundaries for granular control
4. **SSR-aware** - Handles server rendering and streaming
5. **Integrates with transitions** - Smooth navigation
6. **Pairs with error boundaries** - Complete async handling

## Next Steps

In the next lesson, we'll explore advanced async patterns including parallel fetching, dependent resources, caching strategies, and optimistic updates.

## Key Takeaways

- Suspense uses a counter: count > 0 shows fallback
- Resources increment on PENDING, decrement when resolved
- REFRESHING doesn't trigger Suspense (keeps UI interactive)
- Nested Suspense boundaries provide granular loading
- Always decrement in both success and error cases
- Suspense + Error Boundaries = complete async handling
- SSR requires awaiting all Suspense boundaries
- Use transitions for navigation without jarring loading states
