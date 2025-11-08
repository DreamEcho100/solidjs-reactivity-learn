# Loading Patterns with Transitions

## Overview

Effective loading states are crucial for user experience. This guide covers various patterns for showing loading indicators, progress, and feedback during transitions.

## Basic Loading Indicator

### Pattern: Simple Spinner

```javascript
const [data, setData] = createSignal(null);
const [isPending, start] = useTransition();

function loadData() {
  start(async () => {
    const result = await fetchData();
    setData(result);
  });
}

return (
  <div>
    {isPending() ? (
      <Spinner />
    ) : (
      <DataView data={data()} />
    )}
  </div>
);
```

**When to use**: Simple async operations with binary states (loading/loaded)

## Dimmed Content Pattern

### Pattern: Show Old Content Dimmed

```javascript
return (
  <div classList={{ dimmed: isPending() }}>
    <DataList items={items()} />
  </div>
);
```

```css
.dimmed {
  opacity: 0.6;
  pointer-events: none;
  position: relative;
}

.dimmed::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
}
```

**When to use**: When old content is still useful while loading new content

## Skeleton Screens

### Pattern: Content Placeholders

```javascript
function UserProfile() {
  const [user, setUser] = createSignal(null);
  const [isPending, start] = useTransition();
  
  function loadUser(id) {
    start(async () => {
      const data = await fetchUser(id);
      setUser(data);
    });
  }
  
  return (
    <div class="profile">
      {isPending() ? (
        <Skeleton />
      ) : (
        <UserCard user={user()} />
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div class="skeleton">
      <div class="skeleton-avatar"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line short"></div>
    </div>
  );
}
```

```css
.skeleton-avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: linear-gradient(
    90deg,
    #f0f0f0 25%,
    #e0e0e0 50%,
    #f0f0f0 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
```

**When to use**: First loads, route changes, major content shifts

## Progressive Loading

### Pattern: Load in Stages

```javascript
const [basicData, setBasicData] = createSignal(null);
const [detailedData, setDetailedData] = createSignal(null);
const [isPending, start] = useTransition();

function loadData(id) {
  // Show basic info immediately
  setBasicData(getCachedBasicData(id));
  
  // Load detailed in transition
  start(async () => {
    const detailed = await fetchDetailedData(id);
    setDetailedData(detailed);
  });
}

return (
  <div>
    <BasicInfo data={basicData()} />
    
    {isPending() ? (
      <LoadingDetails />
    ) : (
      <DetailedInfo data={detailedData()} />
    )}
  </div>
);
```

**When to use**: Large datasets, expensive operations, network-dependent content

## Progress Indication

### Pattern: Show Progress Percentage

```javascript
const [progress, setProgress] = createSignal(0);
const [isPending, start] = useTransition();

async function loadWithProgress() {
  start(async () => {
    setProgress(0);
    
    await step1();
    setProgress(25);
    
    await step2();
    setProgress(50);
    
    await step3();
    setProgress(75);
    
    await step4();
    setProgress(100);
  });
}

return (
  <div>
    {isPending() && (
      <ProgressBar value={progress()} />
    )}
  </div>
);
```

**When to use**: Multi-step operations, file uploads, batch processing

## Optimistic UI with Loading States

### Pattern: Show Immediately with Pending Indicator

```javascript
const [items, setItems] = createSignal([]);
const [isPending, start] = useTransition();

function addItem(text) {
  const tempId = `temp-${Date.now()}`;
  
  // Add optimistically
  setItems(items => [...items, {
    id: tempId,
    text,
    pending: true
  }]);
  
  // Save for real
  start(async () => {
    try {
      const saved = await saveItem(text);
      setItems(items =>
        items.map(item =>
          item.id === tempId
            ? { ...saved, pending: false }
            : item
        )
      );
    } catch (err) {
      // Remove on error
      setItems(items =>
        items.filter(item => item.id !== tempId)
      );
    }
  });
}

return (
  <ul>
    <For each={items()}>
      {item => (
        <li classList={{ pending: item.pending }}>
          {item.text}
          {item.pending && <Spinner size="small" />}
        </li>
      )}
    </For>
  </ul>
);
```

```css
.pending {
  opacity: 0.7;
  font-style: italic;
}
```

**When to use**: User actions (comments, likes, posts), form submissions

## Inline Loading

### Pattern: Load in Place

```javascript
function Comment({ id }) {
  const [text, setText] = createSignal(null);
  const [isPending, start] = useTransition();
  
  onMount(() => {
    start(async () => {
      const data = await fetchComment(id);
      setText(data.text);
    });
  });
  
  return (
    <div class="comment">
      {isPending() ? (
        <div class="inline-loading">
          <Spinner size="small" />
          <span>Loading comment...</span>
        </div>
      ) : (
        <p>{text()}</p>
      )}
    </div>
  );
}
```

**When to use**: Individual items in lists, lazy-loaded components

## Debounced Loading States

### Pattern: Show Loading After Delay

```javascript
const [items, setItems] = createSignal([]);
const [isLoading, setIsLoading] = createSignal(false);
const [isPending, start] = useTransition();

function loadItems(query) {
  let timeoutId;
  
  start(async () => {
    // Show loading after 300ms
    timeoutId = setTimeout(() => {
      setIsLoading(true);
    }, 300);
    
    try {
      const results = await search(query);
      setItems(results);
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
    }
  });
}

return (
  <div>
    {isLoading() && <Spinner />}
    <ItemList items={items()} />
  </div>
);
```

**When to use**: Fast operations (prevent flickering), search/filter

## Stale Indicator

### Pattern: Show Data is Stale

```javascript
const [data, setData] = createSignal(null);
const [isFresh, setIsFresh] = createSignal(true);
const [isPending, start] = useTransition();

function refreshData() {
  setIsFresh(false);
  
  start(async () => {
    const fresh = await fetchData();
    setData(fresh);
    setIsFresh(true);
  });
}

return (
  <div>
    {!isFresh() && (
      <div class="stale-indicator">
        Updating...
      </div>
    )}
    
    <DataView 
      data={data()} 
      classList={{ stale: !isFresh() }}
    />
  </div>
);
```

```css
.stale-indicator {
  background: #fff3cd;
  padding: 8px;
  border-radius: 4px;
  margin-bottom: 8px;
}

.stale {
  filter: grayscale(0.3);
}
```

**When to use**: Background updates, polling, real-time data

## Multiple Simultaneous Operations

### Pattern: Track Multiple Transitions

```javascript
const [loadingStates, setLoadingStates] = createSignal({
  users: false,
  posts: false,
  comments: false
});

async function loadAll() {
  // Load users
  setLoadingStates(s => ({ ...s, users: true }));
  startTransition(async () => {
    await loadUsers();
    setLoadingStates(s => ({ ...s, users: false }));
  });
  
  // Load posts
  setLoadingStates(s => ({ ...s, posts: true }));
  startTransition(async () => {
    await loadPosts();
    setLoadingStates(s => ({ ...s, posts: false }));
  });
  
  // Load comments
  setLoadingStates(s => ({ ...s, comments: true }));
  startTransition(async () => {
    await loadComments();
    setLoadingStates(s => ({ ...s, comments: false }));
  });
}

return (
  <div>
    <Section loading={loadingStates().users}>
      <Users />
    </Section>
    
    <Section loading={loadingStates().posts}>
      <Posts />
    </Section>
    
    <Section loading={loadingStates().comments}>
      <Comments />
    </Section>
  </div>
);
```

**When to use**: Dashboard pages, parallel data loading

## Error States

### Pattern: Error with Retry

```javascript
const [data, setData] = createSignal(null);
const [error, setError] = createSignal(null);
const [isPending, start] = useTransition();

function loadData() {
  setError(null);
  
  start(async () => {
    try {
      const result = await fetchData();
      setData(result);
    } catch (err) {
      setError(err.message);
    }
  });
}

return (
  <div>
    {error() ? (
      <ErrorView 
        message={error()} 
        onRetry={loadData}
      />
    ) : isPending() ? (
      <Loading />
    ) : (
      <DataView data={data()} />
    )}
  </div>
);

function ErrorView({ message, onRetry }) {
  return (
    <div class="error">
      <p>{message}</p>
      <button onClick={onRetry}>Retry</button>
    </div>
  );
}
```

**When to use**: Network requests, fallible operations

## Timeout Handling

### Pattern: Show Message After Timeout

```javascript
const [data, setData] = createSignal(null);
const [slowLoading, setSlowLoading] = createSignal(false);
const [isPending, start] = useTransition();

function loadData() {
  let timeoutId;
  
  start(async () => {
    // Mark as slow after 5 seconds
    timeoutId = setTimeout(() => {
      setSlowLoading(true);
    }, 5000);
    
    try {
      const result = await fetchData();
      setData(result);
    } finally {
      clearTimeout(timeoutId);
      setSlowLoading(false);
    }
  });
}

return (
  <div>
    {isPending() && (
      <div class="loading">
        <Spinner />
        {slowLoading() && (
          <p class="slow-message">
            This is taking longer than usual...
          </p>
        )}
      </div>
    )}
    <DataView data={data()} />
  </div>
);
```

**When to use**: Slow networks, large data transfers, unreliable connections

## Component-Level Loading

### Pattern: Self-Contained Loading State

```javascript
function DataComponent({ id }) {
  const [data, setData] = createSignal(null);
  const [isPending, start] = useTransition();
  
  createEffect(() => {
    start(async () => {
      const result = await fetchData(id);
      setData(result);
    });
  });
  
  return (
    <div class="data-component">
      <Show
        when={!isPending()}
        fallback={<ComponentSkeleton />}
      >
        <Content data={data()} />
      </Show>
    </div>
  );
}
```

**When to use**: Reusable components, isolated features

## Best Practices

### DO ✅

1. **Show old content during transitions** - Better than loading spinner
2. **Dim or mark stale content** - User knows it's updating
3. **Delay loading indicators** - Prevent flicker on fast operations
4. **Provide retry mechanisms** - Let users recover from errors
5. **Use skeleton screens** - Match layout to reduce shift
6. **Show progress for long operations** - Keep users informed

### DON'T ❌

1. **Block entire UI** - Use transitions to keep parts responsive
2. **Flash loading states** - Debounce for fast operations
3. **Hide old content immediately** - Show until new ready
4. **Ignore errors** - Always handle and show errors
5. **Use vague messages** - Be specific about what's loading
6. **Forget accessibility** - Add aria-live regions

## Accessibility Considerations

```javascript
return (
  <div>
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {isPending() ? 'Loading...' : 'Ready'}
    </div>
    
    <div aria-busy={isPending()}>
      <DataView data={data()} />
    </div>
  </div>
);
```

## Summary

Choose loading patterns based on:
- **Operation speed**: Fast → debounce, slow → immediate indicator
- **Content importance**: Critical → skeleton, supplementary → spinner
- **User context**: First load → skeleton, refresh → dim old content
- **Error likelihood**: High → prominent retry, low → simple message

## Further Reading

- [Skeleton Screens](https://www.lukew.com/ff/entry.asp?1797)
- [Optimistic UI](https://www.smashingmagazine.com/2016/11/true-lies-of-optimistic-user-interfaces/)
- [Loading States](https://www.nngroup.com/articles/progress-indicators/)
