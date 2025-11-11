# Performance Tips for Components

## Component-Level Optimization

### 1. Avoid Unnecessary Computations

```javascript
// ❌ BAD: Computes on every access
function Component(props) {
  const expensiveValue = () => {
    console.log('Computing...');
    return props.items.reduce((sum, item) => sum + item.value, 0);
  };
  
  return (
    <div>
      <p>Total: {expensiveValue()}</p>
      <p>Again: {expensiveValue()}</p>  {/* Recomputes! */}
    </div>
  );
}

// ✅ GOOD: Memoized computation
function Component(props) {
  const expensiveValue = createMemo(() => {
    console.log('Computing...');  // Only logs once
    return props.items.reduce((sum, item) => sum + item.value, 0);
  });
  
  return (
    <div>
      <p>Total: {expensiveValue()}</p>
      <p>Again: {expensiveValue()}</p>  {/* Uses cached value */}
    </div>
  );
}
```

### 2. Strategic use of untrack

```javascript
function Component(props) {
  // ❌ BAD: Creates unnecessary dependency
  createEffect(() => {
    console.log('User:', props.user);
    console.log('Theme:', props.theme);  // Effect re-runs on theme change too
  });
  
  // ✅ GOOD: Only track what matters
  createEffect(() => {
    console.log('User:', props.user);
    untrack(() => {
      console.log('Theme:', props.theme);  // Doesn't trigger re-run
    });
  });
}
```

### 3. Batch State Updates

```javascript
// ❌ BAD: Multiple updates trigger multiple effects
function Component() {
  const [firstName, setFirstName] = createSignal('');
  const [lastName, setLastName] = createSignal('');
  const [email, setEmail] = createSignal('');
  
  const handleSubmit = () => {
    setFirstName('John');   // Triggers effects
    setLastName('Doe');     // Triggers effects
    setEmail('john@...'); // Triggers effects
  };
  
  createEffect(() => {
    console.log('Runs 3 times:', firstName(), lastName(), email());
  });
}

// ✅ GOOD: Batch updates
import { batch } from 'solid-js';

function Component() {
  const [firstName, setFirstName] = createSignal('');
  const [lastName, setLastName] = createSignal('');
  const [email, setEmail] = createSignal('');
  
  const handleSubmit = () => {
    batch(() => {
      setFirstName('John');
      setLastName('Doe');
      setEmail('john@...');
    });  // Effects run only once!
  };
  
  createEffect(() => {
    console.log('Runs once:', firstName(), lastName(), email());
  });
}
```

### 4. Avoid Creating Functions in JSX

```javascript
// ❌ BAD: Creates new function on every render
function List(props) {
  return (
    <For each={props.items}>
      {(item) => (
        <button onClick={() => props.onDelete(item.id)}>
          Delete
        </button>
      )}
    </For>
  );
}

// ✅ GOOD: Use array syntax for event handlers
function List(props) {
  const handleDelete = (id) => {
    props.onDelete(id);
  };
  
  return (
    <For each={props.items}>
      {(item) => (
        <button onClick={[handleDelete, item.id]}>
          Delete
        </button>
      )}
    </For>
  );
}
```

## List Rendering Optimization

### 1. Choose the Right Helper

```javascript
// Use <For> when items have stable identity
function UserList(props) {
  return (
    <For each={props.users}>
      {(user) => <UserCard user={user} />}
    </For>
  );
}

// Use <Index> when items change but positions are stable
function NumberList(props) {
  return (
    <Index each={props.numbers}>
      {(number, i) => <div>{i}: {number()}</div>}
    </Index>
  );
}
```

### 2. Keyed Rendering

```javascript
// ❌ BAD: No key, Solid can't optimize
<For each={items()}>
  {(item) => <Item data={item} />}
</For>

// ✅ GOOD: With unique key
<For each={items()}>
  {(item) => <Item data={item} key={item.id} />}
</For>

// ✅ BETTER: Use index for stable collections
<For each={items()}>
  {(item, index) => <Item data={item} key={index()} />}
</For>
```

### 3. Virtual Lists for Large Data

```javascript
import { createVirtualizer } from '@tanstack/solid-virtual';

function VirtualList(props) {
  let parentRef;
  
  const rowVirtualizer = createVirtualizer({
    get count() {
      return props.items.length;
    },
    getScrollElement: () => parentRef,
    estimateSize: () => 35,
  });
  
  return (
    <div ref={parentRef} style={{ height: '400px', overflow: 'auto' }}>
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
        <For each={rowVirtualizer.getVirtualItems()}>
          {(virtualRow) => (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`
              }}
            >
              {props.items[virtualRow.index].name}
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
```

## Context Performance

### 1. Split Contexts

```javascript
// ❌ BAD: Single context causes unnecessary updates
const AppContext = createContext();

function AppProvider(props) {
  const [user, setUser] = createSignal(null);
  const [theme, setTheme] = createSignal('light');
  const [language, setLanguage] = createSignal('en');
  
  return (
    <AppContext.Provider value={{ user, setUser, theme, setTheme, language, setLanguage }}>
      {props.children}
    </AppContext.Provider>
  );
}

// Component using only theme still re-renders on user changes!

// ✅ GOOD: Separate contexts
const UserContext = createContext();
const ThemeContext = createContext();
const LanguageContext = createContext();

// Components only subscribe to what they need
```

### 2. Memoize Context Values

```javascript
// ❌ BAD: Creates new object on every render
function Provider(props) {
  const [state, setState] = createSignal(initialState);
  
  return (
    <Context.Provider value={{ state, setState }}>  {/* New object! */}
      {props.children}
    </Context.Provider>
  );
}

// ✅ GOOD: Stable reference
function Provider(props) {
  const [state, setState] = createSignal(initialState);
  
  const value = createMemo(() => ({ state, setState }));
  
  return (
    <Context.Provider value={value()}>
      {props.children}
    </Context.Provider>
  );
}
```

## Memo vs Effect vs Signal

### When to Use What

```javascript
// Signal: Simple state
const [count, setCount] = createSignal(0);

// Memo: Derived state (cached computation)
const doubled = createMemo(() => count() * 2);

// Effect: Side effects (DOM manipulation, logging, etc.)
createEffect(() => {
  console.log('Count changed:', count());
});
```

### Memo for Expensive Operations

```javascript
function Component(props) {
  // ✅ GOOD: Memoize expensive filtering/sorting
  const filteredItems = createMemo(() => {
    return props.items
      .filter(item => item.active)
      .sort((a, b) => a.name.localeCompare(b.name));
  });
  
  return (
    <For each={filteredItems()}>
      {(item) => <Item data={item} />}
    </For>
  );
}
```

## Lazy Loading

### Code Splitting

```javascript
import { lazy } from 'solid-js';

// ✅ GOOD: Lazy load heavy components
const HeavyChart = lazy(() => import('./HeavyChart'));
const HeavyMap = lazy(() => import('./HeavyMap'));

function Dashboard() {
  const [showChart, setShowChart] = createSignal(false);
  
  return (
    <div>
      <button onClick={() => setShowChart(true)}>Show Chart</button>
      
      <Show when={showChart()}>
        <Suspense fallback={<Spinner />}>
          <HeavyChart />
        </Suspense>
      </Show>
    </div>
  );
}
```

### Lazy Context Providers

```javascript
// Only load auth provider when needed
const AuthProvider = lazy(() => import('./AuthProvider'));

function App() {
  const [needsAuth, setNeedsAuth] = createSignal(false);
  
  return (
    <Show 
      when={needsAuth()}
      fallback={<PublicApp />}
    >
      <Suspense fallback={<Loading />}>
        <AuthProvider>
          <PrivateApp />
        </AuthProvider>
      </Suspense>
    </Show>
  );
}
```

## DOM Optimization

### 1. Use classList Instead of class

```javascript
// ❌ SLOWER: Replaces entire className
<div class={`btn ${active() ? 'active' : ''} ${disabled() ? 'disabled' : ''}`}>

// ✅ FASTER: Only toggles specific classes
<div classList={{ 
  btn: true, 
  active: active(), 
  disabled: disabled() 
}}>
```

### 2. Conditional Rendering

```javascript
// ✅ Use Show for single condition
<Show when={user()} fallback={<Login />}>
  <Dashboard user={user()} />
</Show>

// ✅ Use Switch for multiple conditions
<Switch>
  <Match when={state() === 'loading'}>
    <Spinner />
  </Match>
  <Match when={state() === 'error'}>
    <Error />
  </Match>
  <Match when={state() === 'success'}>
    <Data />
  </Match>
</Switch>
```

### 3. Avoid Inline Styles

```javascript
// ❌ BAD: Creates new object
<div style={{ color: props.color, fontSize: '16px' }}>

// ✅ GOOD: Use CSS classes
<div class={`text-${props.color} text-base`}>

// ✅ ACCEPTABLE: Memoize if needed
const style = createMemo(() => ({
  color: props.color,
  fontSize: '16px'
}));
<div style={style()}>
```

## Profiling and Debugging

### 1. Development Mode Helpers

```javascript
import { createComputed, createEffect } from 'solid-js';

function Component(props) {
  // Track when component updates
  createComputed(() => {
    console.log('Component computed:', {
      prop1: props.prop1,
      prop2: props.prop2
    });
  });
  
  // Log specific dependencies
  createEffect(() => {
    console.log('Effect ran because:', props.value);
  });
}
```

### 2. Performance Marks

```javascript
function ExpensiveComponent(props) {
  const data = createMemo(() => {
    performance.mark('computation-start');
    
    const result = expensiveOperation(props.data);
    
    performance.mark('computation-end');
    performance.measure(
      'expensive-operation',
      'computation-start',
      'computation-end'
    );
    
    return result;
  });
  
  return <div>{data()}</div>;
}
```

### 3. Solid DevTools

```javascript
// Install: npm install solid-devtools

import { attachDevtoolsOverlay } from '@solid-devtools/overlay';

// In development
if (import.meta.env.DEV) {
  attachDevtoolsOverlay();
}
```

## Resource Loading Optimization

### 1. Prefetching

```javascript
import { createResource } from 'solid-js';

function Component() {
  // Start loading immediately
  const [data] = createResource(fetchData);
  
  return (
    <Suspense fallback={<Spinner />}>
      <Show when={data()}>
        <Display data={data()} />
      </Show>
    </Suspense>
  );
}

// Prefetch on hover
function Link(props) {
  const [, { prefetch }] = createResource(() => props.href, fetchPageData);
  
  return (
    <a 
      href={props.href}
      onMouseEnter={() => prefetch()}
    >
      {props.children}
    </a>
  );
}
```

### 2. Parallel Loading

```javascript
function Dashboard() {
  // Load in parallel
  const [users] = createResource(fetchUsers);
  const [posts] = createResource(fetchPosts);
  const [comments] = createResource(fetchComments);
  
  return (
    <Suspense fallback={<Loading />}>
      <div>
        <UserSection data={users()} />
        <PostSection data={posts()} />
        <CommentSection data={comments()} />
      </div>
    </Suspense>
  );
}
```

### 3. Waterfall Prevention

```javascript
// ❌ BAD: Waterfall loading
function Component() {
  const [user] = createResource(fetchUser);
  
  return (
    <Show when={user()}>
      {/* This waits for user! */}
      <Posts userId={user().id} />
    </Show>
  );
}

function Posts(props) {
  const [posts] = createResource(() => props.userId, fetchPosts);
  return <div>{posts()}</div>;
}

// ✅ GOOD: Parallel loading
function Component() {
  const [user] = createResource(fetchUser);
  const [posts] = createResource(() => user()?.id, fetchPosts);
  
  return (
    <Suspense fallback={<Loading />}>
      <UserProfile user={user()} />
      <PostList posts={posts()} />
    </Suspense>
  );
}
```

## Memory Management

### 1. Cleanup Subscriptions

```javascript
function Component() {
  onMount(() => {
    const ws = new WebSocket('ws://...');
    const interval = setInterval(() => {}, 1000);
    
    // ✅ GOOD: Always cleanup
    onCleanup(() => {
      ws.close();
      clearInterval(interval);
    });
  });
}
```

### 2. Avoid Memory Leaks in Effects

```javascript
// ❌ BAD: Leaks event listeners
function Component() {
  createEffect(() => {
    const handler = () => console.log('resize');
    window.addEventListener('resize', handler);
    // Missing cleanup!
  });
}

// ✅ GOOD: Cleanup listeners
function Component() {
  createEffect(() => {
    const handler = () => console.log('resize');
    window.addEventListener('resize', handler);
    
    onCleanup(() => {
      window.removeEventListener('resize', handler);
    });
  });
}
```

### 3. Weak References for Caches

```javascript
// Use WeakMap for object-keyed caches
const cache = new WeakMap();

function getCachedValue(obj) {
  if (cache.has(obj)) {
    return cache.get(obj);
  }
  
  const value = expensiveComputation(obj);
  cache.set(obj, value);
  return value;
}

// Objects can be garbage collected even if in cache
```

## Checklist

Performance optimization checklist:

- [ ] Use `createMemo` for expensive computations
- [ ] Batch related state updates with `batch()`
- [ ] Use appropriate list rendering (`<For>` vs `<Index>`)
- [ ] Split large contexts into smaller ones
- [ ] Lazy load heavy components
- [ ] Use `classList` instead of computed `class`
- [ ] Avoid creating functions in JSX
- [ ] Cleanup subscriptions and timers
- [ ] Use virtual lists for large datasets
- [ ] Profile with browser DevTools
- [ ] Monitor bundle size
- [ ] Use Solid DevTools in development

## Related

- [Component Best Practices](./component-best-practices.md)
- Unit 3: Advanced Computation Patterns
- Unit 4: Reactive Scheduling
