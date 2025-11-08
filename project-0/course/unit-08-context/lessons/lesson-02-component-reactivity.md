# Lesson 2: Component Reactivity

## Introduction

In Solid.js, components are just functions that run once. Unlike React, they don't re-run when state changes. Instead, the reactive primitives inside components (signals, effects, memos) handle updates. Understanding this fundamental difference is key to mastering Solid.

## Components Run Once

### The Mental Model Shift

```javascript
// React - component function runs on every state change
function ReactCounter() {
  const [count, setCount] = useState(0);
  console.log('Component rendered!');  // Logs on every count change
  
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>+</button>
    </div>
  );
}

// Solid - component function runs ONCE
function SolidCounter() {
  const [count, setCount] = createSignal(0);
  console.log('Component created!');  // Logs ONCE
  
  return (
    <div>
      <p>Count: {count()}</p>  {/* Only this expression re-runs */}
      <button onClick={() => setCount(count() + 1)}>+</button>
    </div>
  );
}
```

**Key insight:** In Solid, fine-grained reactivity means only the specific expressions that read signals re-run, not the entire component.

## Props Are NOT Signals (But Act Like Them)

### How Props Work

Props in Solid are **getters** - they're property accessors that look like plain objects but are actually reactive.

```javascript
function Component(props) {
  // props is a Proxy object
  console.log(typeof props);  // 'object'
  console.log(props.value);   // Accesses the current value
  
  // But it's reactive!
  createEffect(() => {
    console.log(props.value);  // Re-runs when props.value changes
  });
}

// Parent
function Parent() {
  const [value, setValue] = createSignal(0);
  
  return <Component value={value()} />;
}
```

### Props Are Read-Only

```javascript
function Component(props) {
  // ❌ DON'T mutate props
  props.value = 42;  // Error or unexpected behavior
  
  // ✅ Create local state if you need to modify
  const [localValue, setLocalValue] = createSignal(props.value);
}
```

### Destructuring Props

**Critical mistake:** Destructuring props loses reactivity!

```javascript
function Component(props) {
  // ❌ WRONG - loses reactivity
  const { value } = props;
  
  createEffect(() => {
    console.log(value);  // Only logs the initial value!
  });
}

// ✅ CORRECT - keep props together
function Component(props) {
  createEffect(() => {
    console.log(props.value);  // Reactive!
  });
}

// ✅ ALTERNATIVE - use splitProps for selective destructuring
import { splitProps } from 'solid-js';

function Component(props) {
  const [local, others] = splitProps(props, ['value']);
  
  createEffect(() => {
    console.log(local.value);  // Still reactive!
  });
  
  return <div {...others} />;
}
```

### mergeProps for Defaults

```javascript
import { mergeProps } from 'solid-js';

function Button(props) {
  // Merge with defaults while preserving reactivity
  const merged = mergeProps({ type: 'button', disabled: false }, props);
  
  return (
    <button 
      type={merged.type} 
      disabled={merged.disabled}
      onClick={merged.onClick}
    >
      {merged.children}
    </button>
  );
}

// Usage
<Button type="submit" disabled={isLoading()}>
  Submit
</Button>
```

## The children() Helper

### Why children() is Special

Children can be:
- Static text/elements
- Functions (render props)
- Arrays
- Accessors
- null/undefined

The `children()` helper normalizes and resolves all these cases.

### From signal.ts

```typescript
export type ResolvedJSXElement = Exclude<JSX.Element, JSX.ArrayElement>;
export type ResolvedChildren = ResolvedJSXElement | ResolvedJSXElement[];
export type ChildrenReturn = Accessor<ResolvedChildren> & { 
  toArray: () => ResolvedJSXElement[] 
};

export function children(fn: Accessor<JSX.Element>): ChildrenReturn {
  const children = createMemo(fn);
  const memo = createMemo(() => resolveChildren(children()));
  
  (memo as ChildrenReturn).toArray = () => {
    const c = memo();
    return Array.isArray(c) ? c : c != null ? [c] : [];
  };
  
  return memo as ChildrenReturn;
}
```

### Using children()

```javascript
import { children } from 'solid-js';

function Parent(props) {
  const c = children(() => props.children);
  
  createEffect(() => {
    // c() returns the resolved children
    const resolved = c();
    console.log('Children:', resolved);
    
    // Access as array
    const arr = c.toArray();
    console.log('Array length:', arr.length);
  });
  
  return <div>{c()}</div>;
}

// Usage with different child types
<Parent>Static text</Parent>
<Parent>{() => <div>Dynamic</div>}</Parent>
<Parent>{[1, 2, 3].map(n => <span>{n}</span>)}</Parent>
```

### When to Use children()

Use `children()` when you need to:
1. **Inspect children** - count, filter, modify
2. **Clone children** - pass props to children
3. **Manipulate DOM** - get actual DOM nodes
4. **Conditional rendering** - based on children presence

```javascript
// Example: Wrapper that adds class to children
function Wrapper(props) {
  const c = children(() => props.children);
  
  createEffect(() => {
    const resolved = c();
    if (resolved instanceof HTMLElement) {
      resolved.classList.add('wrapped');
    }
  });
  
  return <div class="wrapper">{c()}</div>;
}
```

### children() with Refs

```javascript
function Parent(props) {
  const c = children(() => props.children);
  let container;
  
  onMount(() => {
    // Access resolved children as DOM nodes
    const childNodes = c.toArray();
    console.log('Child DOM nodes:', childNodes);
    
    // Manipulate children
    childNodes.forEach(node => {
      if (node instanceof HTMLElement) {
        node.style.color = 'red';
      }
    });
  });
  
  return <div ref={container}>{c()}</div>;
}
```

## Reactive Refs Pattern

### Basic Refs

Refs in Solid are simple variables:

```javascript
function Component() {
  let divRef;  // Just a variable!
  
  onMount(() => {
    console.log(divRef);  // Actual DOM element
    divRef.focus();
  });
  
  return <div ref={divRef}>Hello</div>;
}
```

### ref Attribute

The `ref` attribute can be:
1. **A variable** - assigns DOM element to it
2. **A function** - calls function with DOM element

```javascript
function Component() {
  // Pattern 1: Variable ref
  let el;
  
  // Pattern 2: Function ref
  const setRef = (element) => {
    console.log('Element mounted:', element);
  };
  
  // Pattern 3: Signal ref (for reactivity)
  const [element, setElement] = createSignal();
  
  createEffect(() => {
    if (element()) {
      console.log('Element is:', element());
    }
  });
  
  return (
    <div>
      <input ref={el} />
      <input ref={setRef} />
      <input ref={setElement} />
    </div>
  );
}
```

### Forwarding Refs

```javascript
function FancyInput(props) {
  return (
    <div class="fancy">
      <input 
        ref={props.ref}  // Forward ref to child
        {...props} 
      />
    </div>
  );
}

// Usage
function Parent() {
  let inputRef;
  
  onMount(() => {
    inputRef.focus();
  });
  
  return <FancyInput ref={inputRef} />;
}
```

### Creating Custom Directives with Refs

Refs can be used to create custom directives:

```javascript
function clickOutside(el, accessor) {
  const onClick = (e) => !el.contains(e.target) && accessor()?.();
  document.body.addEventListener('click', onClick);
  
  onCleanup(() => document.body.removeEventListener('click', onClick));
}

// Usage
function Dropdown(props) {
  const [open, setOpen] = createSignal(false);
  
  return (
    <div use:clickOutside={() => setOpen(false)}>
      <button onClick={() => setOpen(!open())}>Toggle</button>
      <Show when={open()}>
        <div class="dropdown-menu">
          {props.children}
        </div>
      </Show>
    </div>
  );
}
```

## Component Lifecycle

Solid components don't have traditional lifecycle methods like React. Instead, use reactive primitives:

### Mount (Component Creation)

```javascript
function Component() {
  console.log('Component created');  // Runs immediately
  
  onMount(() => {
    console.log('After render, DOM is ready');
  });
  
  return <div>Content</div>;
}
```

### Updates (Reactive Changes)

```javascript
function Component(props) {
  // Runs ONCE when component is created
  console.log('Created with:', props.value);
  
  // Runs every time props.value changes
  createEffect(() => {
    console.log('Value changed to:', props.value);
  });
  
  return <div>{props.value}</div>;
}
```

### Cleanup

```javascript
function Component() {
  const timer = setInterval(() => console.log('tick'), 1000);
  
  onCleanup(() => {
    console.log('Cleaning up timer');
    clearInterval(timer);
  });
  
  return <div>Timer running</div>;
}
```

### Complete Lifecycle Example

```javascript
function TodoItem(props) {
  console.log('[1] Component function runs');
  
  const [editing, setEditing] = createSignal(false);
  console.log('[2] State created');
  
  createEffect(() => {
    console.log('[3] Effect runs:', props.todo.text);
  });
  
  onMount(() => {
    console.log('[4] Mounted, DOM ready');
  });
  
  onCleanup(() => {
    console.log('[5] Cleanup before disposal');
  });
  
  return (
    <div>
      <Show when={!editing()} fallback={
        <input 
          value={props.todo.text}
          onBlur={() => setEditing(false)}
        />
      }>
        <span onClick={() => setEditing(true)}>
          {props.todo.text}
        </span>
      </Show>
    </div>
  );
}

// Order of execution:
// [1] Component function runs
// [2] State created
// [3] Effect runs: "Todo text"
// [4] Mounted, DOM ready
// ... when props.todo.text changes ...
// [3] Effect runs: "New text"
// ... when component is removed ...
// [5] Cleanup before disposal
```

## Cleanup in Components

### Why Cleanup Matters

```javascript
// ❌ Memory leak - subscription never cleaned up
function Component() {
  const ws = new WebSocket('ws://example.com');
  ws.onmessage = (msg) => console.log(msg.data);
  
  return <div>Connected</div>;
}

// ✅ Proper cleanup
function Component() {
  const ws = new WebSocket('ws://example.com');
  ws.onmessage = (msg) => console.log(msg.data);
  
  onCleanup(() => {
    ws.close();
  });
  
  return <div>Connected</div>;
}
```

### Multiple Cleanups

```javascript
function Component() {
  const timer1 = setInterval(() => {}, 1000);
  const timer2 = setInterval(() => {}, 2000);
  
  onCleanup(() => clearInterval(timer1));
  onCleanup(() => clearInterval(timer2));
  
  // Or in one cleanup
  onCleanup(() => {
    clearInterval(timer1);
    clearInterval(timer2);
  });
  
  return <div>Timers running</div>;
}
```

### Cleanup in Effects

```javascript
function Component(props) {
  createEffect(() => {
    const controller = new AbortController();
    
    fetch(props.url, { signal: controller.signal })
      .then(r => r.json())
      .then(data => console.log(data));
    
    // Cleanup when effect re-runs or component disposed
    onCleanup(() => {
      controller.abort();
    });
  });
  
  return <div>Fetching...</div>;
}
```

## Advanced Component Patterns

### Pattern 1: Component with Internal State

```javascript
function Counter(props) {
  const [count, setCount] = createSignal(props.initialValue || 0);
  
  // Expose control via props callback
  createEffect(() => {
    props.onChange?.(count());
  });
  
  return (
    <div>
      <p>Count: {count()}</p>
      <button onClick={() => setCount(c => c + 1)}>+</button>
      <button onClick={() => setCount(c => c - 1)}>-</button>
    </div>
  );
}

// Usage
function Parent() {
  const [externalCount, setExternalCount] = createSignal(0);
  
  return (
    <Counter 
      initialValue={0}
      onChange={setExternalCount}
    />
  );
}
```

### Pattern 2: Controlled vs Uncontrolled

```javascript
function Input(props) {
  // Use prop value if provided, otherwise internal state
  const [internalValue, setInternalValue] = createSignal('');
  
  const value = () => props.value !== undefined 
    ? props.value 
    : internalValue();
    
  const setValue = (v) => {
    if (props.value === undefined) {
      setInternalValue(v);
    }
    props.onInput?.(v);
  };
  
  return (
    <input 
      value={value()}
      onInput={(e) => setValue(e.target.value)}
    />
  );
}

// Uncontrolled
<Input onInput={(v) => console.log(v)} />

// Controlled
const [value, setValue] = createSignal('');
<Input value={value()} onInput={setValue} />
```

### Pattern 3: Render Props

```javascript
function DataProvider(props) {
  const [data, setData] = createSignal(null);
  const [loading, setLoading] = createSignal(true);
  
  onMount(async () => {
    try {
      const result = await fetch(props.url).then(r => r.json());
      setData(result);
    } finally {
      setLoading(false);
    }
  });
  
  return props.children({ 
    data: data(), 
    loading: loading() 
  });
}

// Usage
<DataProvider url="/api/users">
  {({ data, loading }) => (
    <Show when={!loading} fallback={<div>Loading...</div>}>
      <ul>
        <For each={data}>
          {user => <li>{user.name}</li>}
        </For>
      </ul>
    </Show>
  )}
</DataProvider>
```

### Pattern 4: Compound Components

```javascript
const TabsContext = createContext();

function Tabs(props) {
  const [activeTab, setActiveTab] = createSignal(props.defaultTab);
  
  return (
    <TabsContext.Provider value={[activeTab, setActiveTab]}>
      <div class="tabs">{props.children}</div>
    </TabsContext.Provider>
  );
}

function TabList(props) {
  return <div class="tab-list">{props.children}</div>;
}

function Tab(props) {
  const [activeTab, setActiveTab] = useContext(TabsContext);
  
  return (
    <button
      class="tab"
      classList={{ active: activeTab() === props.value }}
      onClick={() => setActiveTab(props.value)}
    >
      {props.children}
    </button>
  );
}

function TabPanel(props) {
  const [activeTab] = useContext(TabsContext);
  
  return (
    <Show when={activeTab() === props.value}>
      <div class="tab-panel">{props.children}</div>
    </Show>
  );
}

// Export as compound component
Tabs.List = TabList;
Tabs.Tab = Tab;
Tabs.Panel = TabPanel;

// Usage
<Tabs defaultTab="home">
  <Tabs.List>
    <Tabs.Tab value="home">Home</Tabs.Tab>
    <Tabs.Tab value="profile">Profile</Tabs.Tab>
  </Tabs.List>
  
  <Tabs.Panel value="home">
    <h2>Home Content</h2>
  </Tabs.Panel>
  
  <Tabs.Panel value="profile">
    <h2>Profile Content</h2>
  </Tabs.Panel>
</Tabs>
```

## TypeScript Best Practices

### Typing Props

```typescript
interface ButtonProps {
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  onClick?: (e: MouseEvent) => void;
  children?: JSX.Element;
}

function Button(props: ButtonProps) {
  return (
    <button 
      type={props.type || 'button'}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
```

### Generic Components

```typescript
interface ListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => JSX.Element;
}

function List<T>(props: ListProps<T>) {
  return (
    <ul>
      <For each={props.items}>
        {(item, index) => (
          <li>{props.renderItem(item, index())}</li>
        )}
      </For>
    </ul>
  );
}

// Usage with type inference
<List 
  items={[1, 2, 3]}
  renderItem={(num) => <span>{num}</span>}
/>
```

### Component with Ref

```typescript
interface InputProps {
  ref?: HTMLInputElement | ((el: HTMLInputElement) => void);
  value?: string;
  onInput?: (value: string) => void;
}

function Input(props: InputProps) {
  return (
    <input 
      ref={props.ref}
      value={props.value}
      onInput={(e) => props.onInput?.(e.currentTarget.value)}
    />
  );
}
```

## Performance Tips

1. **Don't destructure props** - Loses reactivity
2. **Use `splitProps` when needed** - Preserves reactivity
3. **Memoize expensive computations** - Use `createMemo`
4. **Avoid creating functions in JSX** - Define outside render
5. **Use `children()` only when needed** - Has overhead
6. **Keep components simple** - Split complex components

## Summary

- Components run once, not on every state change
- Props are reactive getters, not plain objects
- Never destructure props directly
- Use `children()` to resolve and manipulate children
- Refs are simple variables or functions
- Use `onCleanup` to prevent memory leaks
- Leverage compound component patterns for complex UIs

## Next Steps

In Lesson 3, we'll explore error boundaries and how to gracefully handle errors in reactive applications.

## Further Reading

- [Solid.js Component Documentation](https://docs.solidjs.com/concepts/components/basics)
- [Props Reactivity](https://docs.solidjs.com/concepts/components/props)
- Source: `packages/solid/src/reactive/signal.ts` (children, resolveChildren)
