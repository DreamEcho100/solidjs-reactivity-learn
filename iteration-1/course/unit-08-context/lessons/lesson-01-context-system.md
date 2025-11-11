# Lesson 1: Context System

## Introduction

Context provides a way to pass data through the component tree without having to pass props down manually at every level. In Solid.js, the context system is built on top of the reactive ownership graph, making it both efficient and type-safe.

## Why Context?

### The Prop Drilling Problem

```javascript
// Without context - prop drilling
function App() {
  const [theme, setTheme] = createSignal('dark');
  
  return <Layout theme={theme()} setTheme={setTheme} />;
}

function Layout(props) {
  return <Sidebar theme={props.theme} setTheme={props.setTheme} />;
}

function Sidebar(props) {
  return <ThemeButton theme={props.theme} setTheme={props.setTheme} />;
}

function ThemeButton(props) {
  return <button onClick={() => props.setTheme(props.theme === 'dark' ? 'light' : 'dark')}>
    Toggle {props.theme}
  </button>;
}
```

### With Context - Clean Solution

```javascript
// With context - clean and scalable
const ThemeContext = createContext();

function App() {
  const [theme, setTheme] = createSignal('dark');
  
  return (
    <ThemeContext.Provider value={[theme, setTheme]}>
      <Layout />
    </ThemeContext.Provider>
  );
}

function ThemeButton() {
  const [theme, setTheme] = useContext(ThemeContext);
  return <button onClick={() => setTheme(theme() === 'dark' ? 'light' : 'dark')}>
    Toggle {theme()}
  </button>;
}
```

## How Solid.js Implements Context

### Symbol-Based Identification

Solid.js uses JavaScript Symbols to uniquely identify contexts. This prevents naming collisions and provides type safety.

```typescript
// From signal.ts
export interface Context<T> {
  id: symbol;                              // Unique identifier
  Provider: ContextProviderComponent<T>;   // Provider component
  defaultValue: T;                         // Fallback value
}

export function createContext<T>(
  defaultValue?: T,
  options?: EffectOptions
): Context<T | undefined> {
  const id = Symbol("context");
  return { 
    id, 
    Provider: createProvider(id, options), 
    defaultValue 
  };
}
```

**Why Symbols?**
- Guaranteed uniqueness (no collisions)
- Not enumerable in `for...in` loops
- Can't be accidentally overwritten
- Better debugging (can have descriptions)

### Owner Context Storage

Context values are stored in the Owner's context object:

```typescript
export interface Owner {
  owned: Computation<any>[] | null;
  cleanups: (() => void)[] | null;
  owner: Owner | null;
  context: any | null;  // <-- Context storage!
  sourceMap?: SourceMapValue[];
  name?: string;
}
```

Each Owner node in the reactive graph can store context values as key-value pairs where keys are context symbols.

### Context Lookup Algorithm

When you call `useContext(MyContext)`, Solid walks up the ownership tree:

```typescript
export function useContext<T>(context: Context<T>): T {
  let value: undefined | T;
  return Owner && Owner.context && (value = Owner.context[context.id]) !== undefined
    ? value
    : context.defaultValue;
}
```

**Step by step:**
1. Check if there's a current Owner (reactive scope)
2. Check if Owner has a context object
3. Look up the value using the context's symbol as key
4. If found, return it; otherwise return defaultValue

### Creating the Provider

The Provider is created using the `createProvider` helper:

```typescript
function createProvider(id: symbol, options?: EffectOptions) {
  return function provider(props: FlowProps<{ value: unknown }>) {
    let res;
    createRenderEffect(
      () =>
        (res = untrack(() => {
          Owner!.context = { ...Owner!.context, [id]: props.value };
          return children(() => props.children);
        })),
      undefined,
      options
    );
    return res;
  };
}
```

**Key insights:**
1. Provider is a function component that runs in a `createRenderEffect`
2. It clones the parent's context and adds the new value
3. Uses `untrack` to avoid creating unnecessary dependencies
4. Returns resolved children

## Complete Implementation Example

Let's build a complete context system step by step:

### Step 1: Basic Context Creation

```javascript
function createContext(defaultValue, options) {
  const id = Symbol('context');
  
  const Provider = (props) => {
    let resolvedChildren;
    
    createRenderEffect(() => {
      resolvedChildren = untrack(() => {
        // Clone parent context and add our value
        Owner.context = { 
          ...Owner.context, 
          [id]: props.value 
        };
        
        // Resolve children
        return children(() => props.children);
      });
    }, undefined, options);
    
    return resolvedChildren;
  };
  
  return {
    id,
    Provider,
    defaultValue
  };
}
```

### Step 2: Context Consumer

```javascript
function useContext(context) {
  // Walk up the ownership tree
  if (Owner && Owner.context) {
    const value = Owner.context[context.id];
    if (value !== undefined) {
      return value;
    }
  }
  
  // Fall back to default
  return context.defaultValue;
}
```

### Step 3: Type-Safe Context (TypeScript)

```typescript
interface Context<T> {
  id: symbol;
  Provider: (props: { value: T; children: any }) => any;
  defaultValue: T;
}

function createContext<T>(): Context<T | undefined>;
function createContext<T>(defaultValue: T): Context<T>;
function createContext<T>(defaultValue?: T): Context<T | undefined> {
  const id = Symbol('context');
  
  const Provider = (props: { value: T | undefined; children: any }) => {
    let resolvedChildren;
    
    createRenderEffect(() => {
      resolvedChildren = untrack(() => {
        Owner!.context = { 
          ...Owner!.context, 
          [id]: props.value 
        };
        return children(() => props.children);
      });
    });
    
    return resolvedChildren;
  };
  
  return {
    id,
    Provider,
    defaultValue: defaultValue as T | undefined
  };
}
```

## Context Inheritance

Context values inherit down the ownership tree:

```javascript
const UserContext = createContext();
const ThemeContext = createContext('light');

function App() {
  return (
    <UserContext.Provider value={{ name: 'Alice' }}>
      <ThemeContext.Provider value="dark">
        <Middle />
      </ThemeContext.Provider>
    </UserContext.Provider>
  );
}

function Middle() {
  // Middle can access both contexts
  const user = useContext(UserContext);    // { name: 'Alice' }
  const theme = useContext(ThemeContext);  // 'dark'
  
  return <Child />;
}

function Child() {
  // Child can also access both contexts
  const user = useContext(UserContext);    // { name: 'Alice' }
  const theme = useContext(ThemeContext);  // 'dark'
  
  return <div>{user.name} prefers {theme} mode</div>;
}
```

### Nested Providers (Overriding)

```javascript
function App() {
  return (
    <ThemeContext.Provider value="light">
      <Outer />
      <ThemeContext.Provider value="dark">
        <Inner />
      </ThemeContext.Provider>
    </ThemeContext.Provider>
  );
}

function Outer() {
  const theme = useContext(ThemeContext);  // 'light'
  return <div>{theme}</div>;
}

function Inner() {
  const theme = useContext(ThemeContext);  // 'dark' - overridden!
  return <div>{theme}</div>;
}
```

## Performance Considerations

### 1. Context Values and Reactivity

**Important:** Context values are NOT reactive by default!

```javascript
// ❌ WRONG - Changes won't propagate
const CountContext = createContext();

function App() {
  let count = 0;
  
  return (
    <CountContext.Provider value={count}>
      <Child />
    </CountContext.Provider>
  );
}

function Child() {
  const count = useContext(CountContext);
  return <div>{count}</div>;  // Always shows 0!
}
```

```javascript
// ✅ CORRECT - Use signals for reactive context
const CountContext = createContext();

function App() {
  const [count, setCount] = createSignal(0);
  
  return (
    <CountContext.Provider value={[count, setCount]}>
      <Child />
    </CountContext.Provider>
  );
}

function Child() {
  const [count, setCount] = useContext(CountContext);
  return (
    <div>
      {count()}  {/* Reactive! */}
      <button onClick={() => setCount(c => c + 1)}>+</button>
    </div>
  );
}
```

### 2. Multiple Contexts

Don't nest too many Providers - it creates deep ownership chains:

```javascript
// ❌ Avoid excessive nesting
<A.Provider value={a}>
  <B.Provider value={b}>
    <C.Provider value={c}>
      <D.Provider value={d}>
        <App />
      </D.Provider>
    </C.Provider>
  </B.Provider>
</A.Provider>

// ✅ Better - combine contexts when possible
const AppContext = createContext();

function App() {
  return (
    <AppContext.Provider value={{ a, b, c, d }}>
      <Component />
    </AppContext.Provider>
  );
}
```

### 3. Context Cloning Cost

Each Provider clones the parent context:

```typescript
Owner!.context = { ...Owner!.context, [id]: props.value };
```

This is usually fast, but with many contexts, it can add up. Consider:
- Combining related contexts
- Using a single context with an object value
- Memoizing context values when appropriate

## Advanced Patterns

### Pattern 1: Context with API

Create contexts that provide both state and methods:

```javascript
const TodoContext = createContext();

export function TodoProvider(props) {
  const [todos, setTodos] = createSignal([]);
  
  const api = {
    todos,
    addTodo: (text) => setTodos(t => [...t, { id: Date.now(), text }]),
    removeTodo: (id) => setTodos(t => t.filter(todo => todo.id !== id)),
    toggleTodo: (id) => setTodos(t => t.map(todo => 
      todo.id === id ? { ...todo, done: !todo.done } : todo
    ))
  };
  
  return (
    <TodoContext.Provider value={api}>
      {props.children}
    </TodoContext.Provider>
  );
}

export function useTodos() {
  const context = useContext(TodoContext);
  if (!context) {
    throw new Error('useTodos must be used within TodoProvider');
  }
  return context;
}
```

### Pattern 2: Scoped Context

Create context that only applies to a subtree:

```javascript
const FormContext = createContext();

export function Form(props) {
  const [values, setValues] = createSignal({});
  const [errors, setErrors] = createSignal({});
  
  const formApi = {
    values,
    errors,
    setValue: (name, value) => setValues(v => ({ ...v, [name]: value })),
    setError: (name, error) => setErrors(e => ({ ...e, [name]: error }))
  };
  
  return (
    <FormContext.Provider value={formApi}>
      <form onSubmit={props.onSubmit}>
        {props.children}
      </form>
    </FormContext.Provider>
  );
}
```

### Pattern 3: Default Context with Hook

Provide a better developer experience:

```javascript
const AuthContext = createContext();

export function AuthProvider(props) {
  const [user, setUser] = createSignal(null);
  const [loading, setLoading] = createSignal(true);
  
  onMount(async () => {
    try {
      const currentUser = await fetchCurrentUser();
      setUser(currentUser);
    } finally {
      setLoading(false);
    }
  });
  
  const auth = {
    user,
    loading,
    login: async (credentials) => {
      const user = await login(credentials);
      setUser(user);
    },
    logout: () => {
      setUser(null);
      logout();
    }
  };
  
  return (
    <AuthContext.Provider value={auth}>
      {props.children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return auth;
}

// Usage
function UserProfile() {
  const { user, loading, logout } = useAuth();
  
  if (loading()) return <div>Loading...</div>;
  if (!user()) return <div>Not logged in</div>;
  
  return (
    <div>
      <h1>{user().name}</h1>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

## Common Pitfalls

### 1. Using Context Outside Provider

```javascript
const MyContext = createContext();

function Component() {
  const value = useContext(MyContext);  // undefined!
  return <div>{value}</div>;
}

// Missing Provider!
<Component />
```

**Solution:** Always check for undefined or provide a default value.

### 2. Creating Context in Component

```javascript
// ❌ WRONG - Creates new context on every render!
function Component() {
  const MyContext = createContext();  // New symbol every time!
  return <MyContext.Provider value={42}>...</MyContext.Provider>;
}

// ✅ CORRECT - Create context outside component
const MyContext = createContext();

function Component() {
  return <MyContext.Provider value={42}>...</MyContext.Provider>;
}
```

### 3. Not Memoizing Context Values

```javascript
// ❌ Creates new object every render
function Provider(props) {
  return (
    <MyContext.Provider value={{ foo: 'bar' }}>
      {props.children}
    </MyContext.Provider>
  );
}

// ✅ Better - stable reference
function Provider(props) {
  const value = { foo: 'bar' };  // Could also use createMemo
  return (
    <MyContext.Provider value={value}>
      {props.children}
    </MyContext.Provider>
  );
}
```

## Testing Context

```javascript
import { render } from 'solid-js/web';
import { createContext, useContext } from 'solid-js';

describe('Context', () => {
  it('provides values to children', () => {
    const TestContext = createContext();
    let receivedValue;
    
    function Child() {
      receivedValue = useContext(TestContext);
      return null;
    }
    
    render(() => (
      <TestContext.Provider value={42}>
        <Child />
      </TestContext.Provider>
    ), document.createElement('div'));
    
    expect(receivedValue).toBe(42);
  });
  
  it('uses default value when no provider', () => {
    const TestContext = createContext('default');
    let receivedValue;
    
    function Child() {
      receivedValue = useContext(TestContext);
      return null;
    }
    
    render(() => <Child />, document.createElement('div'));
    
    expect(receivedValue).toBe('default');
  });
  
  it('allows nested providers to override', () => {
    const TestContext = createContext();
    const values = [];
    
    function Child() {
      values.push(useContext(TestContext));
      return null;
    }
    
    render(() => (
      <TestContext.Provider value="outer">
        <Child />
        <TestContext.Provider value="inner">
          <Child />
        </TestContext.Provider>
      </TestContext.Provider>
    ), document.createElement('div'));
    
    expect(values).toEqual(['outer', 'inner']);
  });
});
```

## Summary

- Context uses Symbols for unique identification
- Context values are stored in Owner.context
- `useContext` walks up the ownership tree
- Providers clone parent context and add new values
- Context values should use signals for reactivity
- Create custom hooks for better DX
- Test context behavior thoroughly

## Next Steps

In Lesson 2, we'll explore component reactivity patterns, including how props work, the children() helper, and reactive refs.

## Further Reading

- [Solid.js Context Documentation](https://docs.solidjs.com/reference/component-apis/create-context)
- [React Context (for comparison)](https://react.dev/learn/passing-data-deeply-with-context)
- Source: `packages/solid/src/reactive/signal.ts` (createContext, useContext, createProvider)
