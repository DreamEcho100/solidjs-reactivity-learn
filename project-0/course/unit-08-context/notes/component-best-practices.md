# Component Best Practices

## Component Design Principles

### 1. Single Responsibility Principle

Each component should do one thing well.

```javascript
// ❌ BAD: Component does too much
function UserDashboard() {
  const [user, setUser] = createSignal();
  const [posts, setPosts] = createSignal([]);
  const [comments, setComments] = createSignal([]);
  const [notifications, setNotifications] = createSignal([]);
  
  onMount(async () => {
    setUser(await fetchUser());
    setPosts(await fetchPosts());
    setComments(await fetchComments());
    setNotifications(await fetchNotifications());
  });
  
  return (
    <div>
      <UserProfile user={user()} />
      <PostList posts={posts()} />
      <CommentList comments={comments()} />
      <NotificationList notifications={notifications()} />
    </div>
  );
}

// ✅ GOOD: Split into focused components
function UserDashboard() {
  return (
    <div>
      <UserProfileSection />
      <PostSection />
      <CommentSection />
      <NotificationSection />
    </div>
  );
}

function UserProfileSection() {
  const [user] = createResource(fetchUser);
  return (
    <Show when={user()}>
      <UserProfile user={user()} />
    </Show>
  );
}
```

### 2. Composition Over Inheritance

Build complex components by composing simpler ones.

```javascript
// ✅ GOOD: Composition
function Card(props) {
  return <div class="card">{props.children}</div>;
}

function CardHeader(props) {
  return <div class="card-header">{props.children}</div>;
}

function CardBody(props) {
  return <div class="card-body">{props.children}</div>;
}

// Usage
<Card>
  <CardHeader>
    <h2>Title</h2>
  </CardHeader>
  <CardBody>
    <p>Content</p>
  </CardBody>
</Card>
```

### 3. Props API Design

Design intuitive and flexible prop APIs.

```javascript
// ✅ GOOD: Clear, flexible prop API
interface ButtonProps {
  // Required props first
  children: JSX.Element;
  
  // Optional props with good defaults
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  
  // State props
  disabled?: boolean;
  loading?: boolean;
  
  // Event handlers
  onClick?: (e: MouseEvent) => void;
  
  // Advanced usage
  as?: keyof JSX.IntrinsicElements;
  ref?: HTMLButtonElement | ((el: HTMLButtonElement) => void);
}

function Button(props: ButtonProps) {
  const merged = mergeProps({ 
    variant: 'primary', 
    size: 'md',
    as: 'button' 
  }, props);
  
  return (
    <Dynamic 
      component={merged.as}
      class={`btn btn-${merged.variant} btn-${merged.size}`}
      disabled={merged.disabled || merged.loading}
      onClick={merged.onClick}
      ref={merged.ref}
    >
      <Show when={merged.loading} fallback={merged.children}>
        <Spinner size="sm" /> Loading...
      </Show>
    </Dynamic>
  );
}
```

## Props Patterns

### Default Props with mergeProps

```javascript
import { mergeProps } from 'solid-js';

function Component(props) {
  const merged = mergeProps({
    variant: 'default',
    size: 'medium',
    disabled: false
  }, props);
  
  // merged.variant, merged.size, etc. are now guaranteed to exist
  return <div>{merged.variant}</div>;
}
```

### Splitting Props with splitProps

```javascript
import { splitProps } from 'solid-js';

function Button(props) {
  // Split into component-specific and DOM props
  const [local, others] = splitProps(props, ['variant', 'size', 'loading']);
  
  return (
    <button 
      class={`btn-${local.variant} btn-${local.size}`}
      disabled={local.loading}
      {...others}  // Forward all other props to button
    >
      {props.children}
    </button>
  );
}

// Usage - all HTML button props work!
<Button 
  variant="primary"
  size="lg"
  onClick={handleClick}
  data-testid="submit-button"
  aria-label="Submit form"
>
  Submit
</Button>
```

### Controlled vs Uncontrolled Props

```javascript
function Input(props) {
  // Check if component is controlled
  const isControlled = () => props.value !== undefined;
  
  // Internal state for uncontrolled mode
  const [internalValue, setInternalValue] = createSignal(
    props.defaultValue || ''
  );
  
  // Use prop value if controlled, internal state if not
  const value = () => isControlled() 
    ? props.value 
    : internalValue();
  
  const handleInput = (e) => {
    const newValue = e.currentTarget.value;
    
    // Update internal state if uncontrolled
    if (!isControlled()) {
      setInternalValue(newValue);
    }
    
    // Call prop callback
    props.onInput?.(newValue);
  };
  
  return (
    <input 
      value={value()}
      onInput={handleInput}
    />
  );
}

// Uncontrolled usage
<Input defaultValue="hello" onInput={console.log} />

// Controlled usage
const [value, setValue] = createSignal('');
<Input value={value()} onInput={setValue} />
```

## Children Patterns

### Resolving Children

```javascript
import { children } from 'solid-js';

function Wrapper(props) {
  // Resolve children to access actual elements
  const c = children(() => props.children);
  
  createEffect(() => {
    const resolved = c();
    console.log('Resolved children:', resolved);
    
    // Access as array
    const arr = c.toArray();
    console.log('Number of children:', arr.length);
  });
  
  return <div class="wrapper">{c()}</div>;
}
```

### Conditional Children

```javascript
function ConditionalWrapper(props) {
  const c = children(() => props.children);
  
  // Only wrap if children exist
  return (
    <Show when={c()} fallback={<EmptyState />}>
      <div class="wrapper">{c()}</div>
    </Show>
  );
}
```

### Manipulating Children

```javascript
function List(props) {
  const c = children(() => props.children);
  
  createEffect(() => {
    // Get children as array
    const items = c.toArray();
    
    // Add props to each child (if they're components)
    items.forEach((child, index) => {
      if (child instanceof HTMLElement) {
        child.setAttribute('data-index', index);
      }
    });
  });
  
  return <ul>{c()}</ul>;
}
```

## Ref Patterns

### Basic Ref Usage

```javascript
function Component() {
  let elementRef;
  
  onMount(() => {
    console.log('Element:', elementRef);
    elementRef.focus();
  });
  
  return <input ref={elementRef} />;
}
```

### Function Ref

```javascript
function Component() {
  const handleRef = (element) => {
    console.log('Element mounted:', element);
    element.focus();
  };
  
  return <input ref={handleRef} />;
}
```

### Signal Ref (for reactivity)

```javascript
function Component() {
  const [element, setElement] = createSignal();
  
  createEffect(() => {
    if (element()) {
      console.log('Element is:', element());
      element().focus();
    }
  });
  
  return <input ref={setElement} />;
}
```

### Forwarding Refs

```javascript
function FancyInput(props) {
  return (
    <div class="fancy-wrapper">
      <input 
        ref={props.ref}  // Forward ref to actual input
        {...props}
      />
    </div>
  );
}

// Usage
let inputRef;
<FancyInput ref={inputRef} />
```

### Multiple Refs

```javascript
function Component(props) {
  let internalRef;
  
  const handleRef = (el) => {
    // Store internally
    internalRef = el;
    
    // Forward to parent if provided
    if (typeof props.ref === 'function') {
      props.ref(el);
    } else if (props.ref) {
      props.ref = el;
    }
  };
  
  return <div ref={handleRef}>{props.children}</div>;
}
```

## Cleanup Patterns

### Effect Cleanup

```javascript
function Component() {
  createEffect(() => {
    const timer = setInterval(() => {
      console.log('tick');
    }, 1000);
    
    // Cleanup function
    onCleanup(() => {
      clearInterval(timer);
    });
  });
  
  return <div>Timer running</div>;
}
```

### Multiple Cleanups

```javascript
function Component() {
  onMount(() => {
    const ws = new WebSocket('ws://example.com');
    const timer = setInterval(() => {}, 1000);
    const listener = (e) => console.log(e);
    
    window.addEventListener('resize', listener);
    
    // Register multiple cleanups
    onCleanup(() => ws.close());
    onCleanup(() => clearInterval(timer));
    onCleanup(() => window.removeEventListener('resize', listener));
  });
  
  return <div>Component</div>;
}
```

### Cleanup in Custom Hooks

```javascript
function useWindowSize() {
  const [size, setSize] = createSignal({
    width: window.innerWidth,
    height: window.innerHeight
  });
  
  const updateSize = () => {
    setSize({
      width: window.innerWidth,
      height: window.innerHeight
    });
  };
  
  onMount(() => {
    window.addEventListener('resize', updateSize);
    onCleanup(() => {
      window.removeEventListener('resize', updateSize);
    });
  });
  
  return size;
}
```

## Context Patterns

### Creating Context Providers

```javascript
const ThemeContext = createContext();

export function ThemeProvider(props) {
  const [theme, setTheme] = createSignal('light');
  
  // Persist theme
  createEffect(() => {
    localStorage.setItem('theme', theme());
  });
  
  // Load saved theme
  onMount(() => {
    const saved = localStorage.getItem('theme');
    if (saved) setTheme(saved);
  });
  
  const value = {
    theme,
    setTheme,
    toggleTheme: () => setTheme(t => t === 'light' ? 'dark' : 'light')
  };
  
  return (
    <ThemeContext.Provider value={value}>
      {props.children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
```

### Scoped Context

```javascript
function Form(props) {
  const [values, setValues] = createSignal({});
  
  const formContext = {
    values,
    setValue: (name, value) => {
      setValues(v => ({ ...v, [name]: value }));
    }
  };
  
  return (
    <FormContext.Provider value={formContext}>
      <form onSubmit={props.onSubmit}>
        {props.children}
      </form>
    </FormContext.Provider>
  );
}
```

## Performance Patterns

### Memoization

```javascript
function Component(props) {
  // ❌ BAD: Recomputes every time
  const expensive = () => {
    return props.items.map(item => expensiveOperation(item));
  };
  
  // ✅ GOOD: Only recomputes when props.items changes
  const expensive = createMemo(() => {
    return props.items.map(item => expensiveOperation(item));
  });
  
  return <div>{expensive()}</div>;
}
```

### Avoiding Inline Functions

```javascript
function List(props) {
  // ❌ BAD: Creates new function on every render
  return (
    <For each={props.items}>
      {(item) => (
        <div onClick={() => console.log(item)}>
          {item.name}
        </div>
      )}
    </For>
  );
  
  // ✅ GOOD: Define handler outside
  const handleClick = (item) => {
    console.log(item);
  };
  
  return (
    <For each={props.items}>
      {(item) => (
        <div onClick={[handleClick, item]}>
          {item.name}
        </div>
      )}
    </For>
  );
}
```

### Stable References

```javascript
function Component(props) {
  // ❌ BAD: Creates new object every time
  const style = { color: props.color, fontSize: '16px' };
  
  // ✅ GOOD: Memoize stable reference
  const style = createMemo(() => ({
    color: props.color,
    fontSize: '16px'
  }));
  
  return <div style={style()}>{props.children}</div>;
}
```

## TypeScript Patterns

### Generic Components

```typescript
interface ListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => JSX.Element;
  keyExtractor?: (item: T) => string | number;
}

function List<T>(props: ListProps<T>) {
  return (
    <For each={props.items}>
      {(item, index) => (
        <div key={props.keyExtractor?.(item)}>
          {props.renderItem(item, index())}
        </div>
      )}
    </For>
  );
}

// Usage with type inference
<List
  items={[1, 2, 3]}
  renderItem={(num) => <span>{num}</span>}
/>
```

### Extending Native Elements

```typescript
import { JSX, splitProps } from 'solid-js';

interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  loading?: boolean;
}

function Button(props: ButtonProps) {
  const [local, others] = splitProps(props, ['variant', 'loading', 'children']);
  
  return (
    <button
      class={`btn btn-${local.variant || 'primary'}`}
      disabled={local.loading}
      {...others}
    >
      {local.loading ? 'Loading...' : local.children}
    </button>
  );
}
```

### Props with Generics and Constraints

```typescript
interface SelectProps<T extends { id: string | number }> {
  items: T[];
  value: T['id'];
  onChange: (value: T['id']) => void;
  renderItem: (item: T) => JSX.Element;
}

function Select<T extends { id: string | number }>(props: SelectProps<T>) {
  return (
    <select 
      value={props.value}
      onChange={(e) => props.onChange(e.currentTarget.value)}
    >
      <For each={props.items}>
        {(item) => (
          <option value={item.id}>
            {props.renderItem(item)}
          </option>
        )}
      </For>
    </select>
  );
}
```

## Testing Patterns

### Component Testing

```javascript
import { render, fireEvent } from 'solid-testing-library';

describe('Button', () => {
  it('renders and handles clicks', () => {
    const handleClick = vi.fn();
    const { getByText } = render(() => (
      <Button onClick={handleClick}>Click me</Button>
    ));
    
    const button = getByText('Click me');
    expect(button).toBeInTheDocument();
    
    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
  
  it('shows loading state', () => {
    const { getByRole } = render(() => (
      <Button loading>Submit</Button>
    ));
    
    expect(getByRole('button')).toBeDisabled();
    expect(getByRole('button')).toHaveTextContent('Loading');
  });
});
```

### Context Testing

```javascript
function renderWithContext(Component, contextValue) {
  return render(() => (
    <TestContext.Provider value={contextValue}>
      <Component />
    </TestContext.Provider>
  ));
}

it('uses context value', () => {
  const { getByText } = renderWithContext(
    MyComponent,
    { user: { name: 'Alice' } }
  );
  
  expect(getByText('Alice')).toBeInTheDocument();
});
```

## Summary

- Keep components focused and composable
- Design intuitive prop APIs
- Handle refs and cleanup properly
- Use context for cross-cutting concerns
- Memoize expensive computations
- Write tests for component behavior
- Leverage TypeScript for type safety

## Related

- [Performance Tips](./performance-tips.md)
- Unit 2: Core Reactive Primitives
- Unit 3: Advanced Computation Patterns
