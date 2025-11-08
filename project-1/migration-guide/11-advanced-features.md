# Step 11: Advanced Features - Resources, Suspense & More

## 🎯 Goal
Implement advanced reactive primitives for async data management and UI composition.

## 📦 Resources - Async State Management

### The Problem

```typescript
// Manual async state management
const [data, setData] = createSignal(null);
const [loading, setLoading] = createSignal(false);
const [error, setError] = createSignal(null);

createEffect(() => {
  setLoading(true);
  fetch('/api/data')
    .then(res => res.json())
    .then(data => {
      setData(data);
      setLoading(false);
    })
    .catch(err => {
      setError(err);
      setLoading(false);
    });
});
```

### The Solution: Resources

```typescript
const [data] = createResource(fetchData);

// Automatically handles loading, data, error states!
// data() returns value or throws promise/error
```

## 🏗️ Resource Implementation

### Step 1: Resource Types

```typescript
export type ResourceReturn<T> = [
  resource: ResourceAccessor<T>,
  actions: {
    mutate: (value: T | undefined) => void;
    refetch: () => void;
  }
];

export interface ResourceAccessor<T> extends Accessor<T | undefined> {
  loading: boolean;
  error: any;
  latest: T | undefined;
  state: "unresolved" | "pending" | "ready" | "refreshing" | "errored";
}

export type ResourceFetcher<T> = (prev: T | undefined) => T | Promise<T>;
export type ResourceSource<S> = S | false | null | undefined | (() => S | false | null | undefined);
```

### Step 2: createResource

```typescript
export function createResource<T, S = unknown>(
  source: ResourceSource<S>,
  fetcher: ResourceFetcher<T>,
  options?: { initialValue?: T }
): ResourceReturn<T>;

export function createResource<T>(
  fetcher: ResourceFetcher<T>,
  options?: { initialValue?: T }
): ResourceReturn<T>;

export function createResource<T, S>(
  pSource: ResourceSource<S> | ResourceFetcher<T>,
  pFetcher?: ResourceFetcher<T> | { initialValue?: T },
  pOptions?: { initialValue?: T }
): ResourceReturn<T> {
  const [s, set] = createSignal<S | undefined>(undefined);
  const [value, setValue] = createSignal<T | undefined>(
    pOptions?.initialValue
  );
  const [error, setError] = createSignal<any>();
  const [state, setState] = createSignal<
    "unresolved" | "pending" | "ready" | "refreshing" | "errored"
  >("unresolved");
  
  // Determine source and fetcher
  let source: ResourceSource<S>;
  let fetcher: ResourceFetcher<T>;
  
  if (arguments.length === 1) {
    source = () => true as any;
    fetcher = pSource as ResourceFetcher<T>;
  } else {
    source = pSource as ResourceSource<S>;
    fetcher = pFetcher as ResourceFetcher<T>;
  }
  
  // Load resource when source changes
  createEffect(() => {
    const sourceValue = typeof source === "function" ? source() : source;
    
    if (sourceValue === false || sourceValue == null) {
      return;
    }
    
    set(() => sourceValue);
    
    const prevValue = value();
    setState(prevValue !== undefined ? "refreshing" : "pending");
    
    const promise = fetcher(prevValue);
    
    if (promise instanceof Promise) {
      promise
        .then(data => {
          setValue(() => data);
          setState("ready");
        })
        .catch(err => {
          setError(() => err);
          setState("errored");
        });
    } else {
      setValue(() => promise);
      setState("ready");
    }
  });
  
  // Create resource accessor
  const resource: ResourceAccessor<T> = Object.assign(
    () => {
      const err = error();
      if (err) throw err;
      
      const v = value();
      if (state() === "pending" || state() === "refreshing") {
        // Throw promise for Suspense
        throw new Promise(() => {});
      }
      
      return v;
    },
    {
      get loading() {
        return state() === "pending" || state() === "refreshing";
      },
      get error() {
        return error();
      },
      get latest() {
        return value();
      },
      get state() {
        return state();
      }
    }
  );
  
  const mutate = (newValue: T | undefined) => {
    setValue(() => newValue);
    setState("ready");
  };
  
  const refetch = () => {
    set(s => s); // Trigger reload
  };
  
  return [resource, { mutate, refetch }];
}
```

## 🔄 Suspense Integration

### Step 1: Suspense Component

```typescript
export type SuspenseProps = {
  fallback: JSX.Element;
  children: JSX.Element;
};

export function Suspense(props: SuspenseProps): JSX.Element {
  const [suspended, setSuspended] = createSignal(false);
  const [suspendedContent, setSuspendedContent] = createSignal<JSX.Element>();
  
  // Create boundary for thrown promises
  const show = createMemo(() => {
    if (suspended()) {
      return props.fallback;
    }
    
    try {
      const content = props.children;
      setSuspended(false);
      return content;
    } catch (promise) {
      if (promise instanceof Promise) {
        // Suspend!
        setSuspended(true);
        
        // Resume when promise resolves
        promise.then(() => {
          setSuspended(false);
        });
        
        return props.fallback;
      }
      
      throw promise; // Re-throw non-promise errors
    }
  });
  
  return show as unknown as JSX.Element;
}
```

## 🎨 Usage Examples

### Example 1: Basic Resource

```typescript
const fetchUser = async (id: number) => {
  const res = await fetch(`/api/users/${id}`);
  return res.json();
};

function UserProfile() {
  const [userId, setUserId] = createSignal(1);
  const [user] = createResource(userId, fetchUser);
  
  return (
    <div>
      <Show when={!user.loading} fallback={<div>Loading...</div>}>
        <h1>{user()?.name}</h1>
        <p>{user()?.email}</p>
      </Show>
      
      {user.error && <div>Error: {user.error.message}</div>}
    </div>
  );
}
```

### Example 2: Resource with Suspense

```typescript
function UserProfile() {
  const [userId] = createSignal(1);
  const [user] = createResource(userId, fetchUser);
  
  return (
    <Suspense fallback={<UserSkeleton />}>
      <h1>{user()?.name}</h1>
      <p>{user()?.email}</p>
    </Suspense>
  );
}
```

### Example 3: Dependent Resources

```typescript
function UserPosts() {
  const [userId] = createSignal(1);
  const [user] = createResource(userId, fetchUser);
  const [posts] = createResource(
    () => user()?.id, // Wait for user to load
    fetchUserPosts
  );
  
  return (
    <Suspense fallback={<Loading />}>
      <h1>{user()?.name}'s Posts</h1>
      <For each={posts()}>
        {post => <PostCard post={post} />}
      </For>
    </Suspense>
  );
}
```

### Example 4: Resource Mutations

```typescript
function TodoList() {
  const [todos, { mutate, refetch }] = createResource(fetchTodos);
  
  const addTodo = async (text: string) => {
    // Optimistic update
    mutate([...(todos.latest || []), { id: Date.now(), text }]);
    
    try {
      await fetch('/api/todos', {
        method: 'POST',
        body: JSON.stringify({ text })
      });
      
      // Refetch to get server state
      refetch();
    } catch (err) {
      // Revert on error
      refetch();
    }
  };
  
  return (
    <Suspense fallback={<Loading />}>
      <For each={todos()}>
        {todo => <TodoItem todo={todo} />}
      </For>
      <AddTodoButton onClick={addTodo} />
    </Suspense>
  );
}
```

## 🔧 Utility Primitives

### lazy() - Code Splitting

```typescript
export function lazy<T extends Component<any>>(
  fn: () => Promise<{ default: T }>
): T {
  let comp: T | undefined;
  let promise: Promise<void> | undefined;
  
  return ((props: any) => {
    if (comp) return comp(props);
    
    if (!promise) {
      promise = fn().then(module => {
        comp = module.default;
      });
    }
    
    throw promise; // Suspends until loaded
  }) as unknown as T;
}

// Usage
const LazyComponent = lazy(() => import('./HeavyComponent'));

<Suspense fallback={<Loading />}>
  <LazyComponent />
</Suspense>
```

### Show - Conditional Rendering

```typescript
export type ShowProps<T> = {
  when: T | undefined | null | false;
  fallback?: JSX.Element;
  children: JSX.Element | ((item: T) => JSX.Element);
};

export function Show<T>(props: ShowProps<T>): JSX.Element {
  const condition = createMemo(() => props.when);
  
  return createMemo(() => {
    const c = condition();
    if (c) {
      const child = props.children;
      return typeof child === "function" ? child(c) : child;
    }
    return props.fallback;
  }) as unknown as JSX.Element;
}
```

### For - List Rendering

```typescript
export type ForProps<T> = {
  each: readonly T[] | undefined | null | false;
  fallback?: JSX.Element;
  children: (item: T, index: Accessor<number>) => JSX.Element;
};

export function For<T>(props: ForProps<T>): JSX.Element {
  const mapped = mapArray(
    () => props.each || [],
    props.children
  );
  
  return createMemo(() => {
    const list = mapped();
    return list.length ? list : props.fallback;
  }) as unknown as JSX.Element;
}
```

## ✅ Implementation Checklist

- [ ] Implement createResource with state tracking
- [ ] Add resource loading/error/data accessors
- [ ] Implement Suspense boundary
- [ ] Handle promise suspension
- [ ] Add lazy() for code splitting
- [ ] Implement Show helper
- [ ] Implement For helper
- [ ] Test resource fetching
- [ ] Test Suspense with resources
- [ ] Test error states

## 🧪 Testing

```typescript
test("resource fetches data", async () => {
  const fetchData = () => Promise.resolve({ name: "Test" });
  const [data] = createResource(fetchData);
  
  expect(data.loading).toBe(true);
  
  await new Promise(resolve => setTimeout(resolve, 0));
  
  expect(data.loading).toBe(false);
  expect(data()).toEqual({ name: "Test" });
});

test("suspense shows fallback while loading", () => {
  const [data] = createResource(() => new Promise(() => {})); // Never resolves
  
  const result = (
    <Suspense fallback={<div>Loading...</div>}>
      <div>{data()?.name}</div>
    </Suspense>
  );
  
  // Should show fallback
  expect(result).toContain("Loading...");
});
```

## 🚀 Next Step

Continue to **[12-testing-migration.md](./12-testing-migration.md)** for comprehensive testing strategies.

---

**💡 Pro Tip**: Resources + Suspense = Effortless async state management. Let the framework handle loading states!
