# Lesson 1: Reactive Virtual DOM - Fine-Grained Rendering

## Introduction

While Solid.js famously compiles away the virtual DOM, understanding how to build reactive rendering systems provides deep insights into performance optimization and alternative rendering strategies. This lesson explores how fine-grained reactivity can power rendering without traditional virtual DOM diffing.

## The Virtual DOM Problem

Traditional virtual DOM frameworks:
1. Render entire component trees
2. Diff old vs new virtual trees
3. Apply minimal DOM updates

This is O(n) at best, with constant overhead for every update.

## Fine-Grained Alternative

With reactivity, updates are O(1) - directly updating only what changed:

```typescript
// Traditional (React-like)
function Counter() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>; // Re-renders entire component
}

// Fine-grained (Solid-like)
function Counter() {
  const [count, setCount] = createSignal(0);
  return <div>{count()}</div>; // Only updates text node
}
```

## Building a Reactive Renderer

### Core Concepts

```typescript
interface ReactiveElement {
  type: string;
  props: Record<string, any>;
  children: (ReactiveElement | Accessor<string>)[];
}

function createElement(
  type: string,
  props: Record<string, any> = {},
  ...children: any[]
): ReactiveElement {
  return { type, props, children };
}
```

### Mounting Elements

```typescript
function mount(
  vnode: ReactiveElement | Accessor<string>,
  container: HTMLElement
): () => void {
  // Handle reactive text nodes
  if (typeof vnode === 'function') {
    const textNode = document.createTextNode('');
    container.appendChild(textNode);
    
    const dispose = createRoot(disposer => {
      createEffect(() => {
        textNode.data = String(vnode());
      });
      return disposer;
    });
    
    return dispose;
  }
  
  // Handle elements
  const { type, props, children } = vnode;
  const el = document.createElement(type);
  
  // Mount props
  Object.entries(props).forEach(([key, value]) => {
    if (key.startsWith('on')) {
      const event = key.slice(2).toLowerCase();
      el.addEventListener(event, value);
    } else if (typeof value === 'function') {
      // Reactive prop
      createEffect(() => {
        el.setAttribute(key, String(value()));
      });
    } else {
      el.setAttribute(key, String(value));
    }
  });
  
  // Mount children
  const cleanups: (() => void)[] = [];
  children.forEach(child => {
    const cleanup = mount(child, el);
    cleanups.push(cleanup);
  });
  
  container.appendChild(el);
  
  return () => {
    cleanups.forEach(fn => fn());
    el.remove();
  };
}
```

### JSX Integration

```typescript
// Configure JSX
declare global {
  namespace JSX {
    interface IntrinsicElements {
      div: any;
      span: any;
      button: any;
      // ... etc
    }
  }
}

// JSX pragma
const jsx = createElement;

// Usage
function App() {
  const [count, setCount] = createSignal(0);
  
  return (
    <div>
      <span>Count: {count}</span>
      <button onClick={() => setCount(c => c + 1)}>
        Increment
      </button>
    </div>
  );
}

// Mount
const dispose = mount(<App />, document.getElementById('root')!);
```

## Component System

### Functional Components

```typescript
type Component<P = {}> = (props: P) => ReactiveElement;

function defineComponent<P>(
  fn: (props: P) => ReactiveElement
): Component<P> {
  return fn;
}

// Usage
const Counter = defineComponent<{ initial: number }>(props => {
  const [count, setCount] = createSignal(props.initial);
  
  return (
    <div>
      <div>Count: {count}</div>
      <button onClick={() => setCount(c => c + 1)}>+</button>
    </div>
  );
});

<Counter initial={0} />
```

### Props as Signals

For truly reactive props:

```typescript
function createReactiveProps<P extends object>(
  props: P
): { [K in keyof P]: Accessor<P[K]> } {
  const reactive: any = {};
  
  for (const key in props) {
    const [get, set] = createSignal(props[key]);
    reactive[key] = get;
    
    // Update when prop changes
    createEffect(() => {
      if (props[key] !== get()) {
        set(() => props[key]);
      }
    });
  }
  
  return reactive;
}

// Usage in component
const Counter = defineComponent<{ count: number }>(props => {
  const p = createReactiveProps(props);
  
  return <div>Count: {p.count}</div>;
});
```

## Conditional Rendering

### Show Component

```typescript
function Show<T>(props: {
  when: Accessor<T | undefined | null | false>;
  children: (value: T) => ReactiveElement;
  fallback?: ReactiveElement;
}): ReactiveElement {
  return createMemo(() => {
    const value = props.when();
    return value ? props.children(value as T) : (props.fallback || null);
  }) as any;
}

// Usage
<Show
  when={user}
  fallback={<div>Loading...</div>}
>
  {u => <div>Hello, {u().name}</div>}
</Show>
```

### For Component

```typescript
function For<T>(props: {
  each: Accessor<T[]>;
  children: (item: T, index: Accessor<number>) => ReactiveElement;
}): Accessor<ReactiveElement[]> {
  return mapArray(props.each, props.children) as any;
}

// Usage
<For each={items}>
  {(item, index) => (
    <div>
      {index()}: {item().name}
    </div>
  )}
</For>
```

## Advanced Rendering Patterns

### Portals

Render into different DOM location:

```typescript
function Portal(props: {
  mount: HTMLElement;
  children: ReactiveElement;
}): null {
  createEffect(() => {
    mount(props.children, props.mount);
  });
  
  return null;
}

// Usage
<Portal mount={document.body}>
  <Modal />
</Portal>
```

### Dynamic Components

```typescript
function Dynamic<P>(props: {
  component: Component<P>;
  props: P;
}): ReactiveElement {
  return createMemo(() => {
    const Comp = props.component;
    return <Comp {...props.props} />;
  }) as any;
}

// Usage
const [CurrentView, setCurrentView] = createSignal(Home);

<Dynamic component={CurrentView} props={{}} />
```

### Suspense Boundaries

```typescript
function Suspense(props: {
  fallback: ReactiveElement;
  children: ReactiveElement;
}): ReactiveElement {
  const [show, setShow] = createSignal(false);
  
  // Wait for children to load
  createEffect(() => {
    Promise.resolve().then(() => setShow(true));
  });
  
  return (
    <Show when={show} fallback={props.fallback}>
      {() => props.children}
    </Show>
  );
}
```

## Performance Optimizations

### 1. Keyed Reconciliation

```typescript
function For<T>(props: {
  each: Accessor<T[]>;
  children: (item: T) => ReactiveElement;
  key?: (item: T) => any;
}) {
  if (props.key) {
    // Use key-based reconciliation
    return mapArray(props.each, props.children);
  } else {
    // Use index-based
    return indexArray(props.each, props.children);
  }
}
```

### 2. Lazy Evaluation

```typescript
function lazy<T>(
  fn: () => Promise<{ default: Component<T> }>
): Component<T> {
  const [comp, setComp] = createSignal<Component<T>>();
  
  fn().then(module => setComp(() => module.default));
  
  return (props: T) => {
    const C = comp();
    return C ? <C {...props} /> : <div>Loading...</div>;
  };
}

// Usage
const LazyHome = lazy(() => import('./Home'));

<LazyHome />
```

### 3. Memoized Children

```typescript
function Memo(props: {
  children: () => ReactiveElement;
}): Accessor<ReactiveElement> {
  return createMemo(props.children);
}

// Usage
<Memo>
  {() => <ExpensiveComponent />}
</Memo>
```

## Comparison with Virtual DOM

| Aspect | Virtual DOM | Fine-Grained |
|--------|-------------|--------------|
| Update Cost | O(n) | O(1) |
| Memory | Higher | Lower |
| Reactivity | Coarse | Fine |
| Bundle Size | Larger | Smaller |
| Learning Curve | Familiar | Different |

## Real-World Example

Complete mini-framework:

```typescript
// Framework core
export { createSignal, createMemo, createEffect };
export { createElement as jsx };
export { mount, unmount };
export { Show, For, Portal, Dynamic, Suspense };

// App
function TodoApp() {
  const [todos, setTodos] = createSignal<Todo[]>([]);
  const [filter, setFilter] = createSignal<'all' | 'active' | 'completed'>('all');
  
  const filtered = createMemo(() => {
    const f = filter();
    return todos().filter(todo => {
      if (f === 'active') return !todo.completed;
      if (f === 'completed') return todo.completed;
      return true;
    });
  });
  
  return (
    <div class="todo-app">
      <input
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            addTodo(e.currentTarget.value);
            e.currentTarget.value = '';
          }
        }}
      />
      
      <For each={filtered}>
        {todo => (
          <div class="todo-item">
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => toggleTodo(todo.id)}
            />
            <span>{todo.text}</span>
            <button onClick={() => removeTodo(todo.id)}>×</button>
          </div>
        )}
      </For>
      
      <div class="filters">
        <button onClick={() => setFilter('all')}>All</button>
        <button onClick={() => setFilter('active')}>Active</button>
        <button onClick={() => setFilter('completed')}>Completed</button>
      </div>
    </div>
  );
}

mount(<TodoApp />, document.body);
```

## Exercises

1. **Build a Diff Algorithm**: Implement traditional virtual DOM diffing for comparison
2. **Optimize Lists**: Implement efficient list reconciliation with keys
3. **Create Transitions**: Add enter/exit animations to elements
4. **Build Dev Tools**: Visualize component tree and updates

## Summary

Fine-grained reactivity eliminates the need for virtual DOM diffing by directly updating only what changes. This results in:
- O(1) updates instead of O(n)
- Smaller bundle sizes
- Better performance
- More predictable behavior

## Next Steps

Next lesson: **Reactive Compilation** - Compile-time optimizations for reactive code.
