# Exercise 1: Implement createContext System

**Difficulty:** ⭐⭐⭐⭐ (Advanced)

**Time:** 3-4 hours

## Objective

Build a complete context system from scratch following Solid.js's implementation pattern. You'll implement `createContext`, `useContext`, and the Provider component.

## Requirements

Implement the following functions:

```typescript
interface Context<T> {
  id: symbol;
  Provider: (props: { value: T; children: any }) => any;
  defaultValue: T;
}

function createContext<T>(defaultValue?: T): Context<T | undefined>;
function useContext<T>(context: Context<T>): T;
```

### Part 1: Basic Context (1 hour)

Create a basic context system that:
1. Uses Symbols for unique identification
2. Stores context values in Owner.context
3. Walks up ownership tree in useContext
4. Returns default value if not found

```javascript
// Test cases
const ThemeContext = createContext('light');

function Child() {
  const theme = useContext(ThemeContext);
  console.log(theme); // Should log 'light' (default)
  return <div>{theme}</div>;
}

function App() {
  return <Child />;
}
```

### Part 2: Provider Component (1-1.5 hours)

Implement the Provider that:
1. Clones parent context
2. Adds new value to context
3. Uses `children()` to resolve children
4. Works with `createRenderEffect`

```javascript
// Test cases
function App() {
  return (
    <ThemeContext.Provider value="dark">
      <Child />
    </ThemeContext.Provider>
  );
}

function Child() {
  const theme = useContext(ThemeContext);
  console.log(theme); // Should log 'dark'
  return <div>{theme}</div>;
}
```

### Part 3: Nested Providers (30-45 min)

Handle nested providers correctly:

```javascript
// Test case
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
  const theme = useContext(ThemeContext);
  console.log(theme); // 'light'
  return <div>{theme}</div>;
}

function Inner() {
  const theme = useContext(ThemeContext);
  console.log(theme); // 'dark'
  return <div>{theme}</div>;
}
```

### Part 4: Multiple Contexts (30-45 min)

Support multiple contexts:

```javascript
// Test case
const UserContext = createContext();
const ThemeContext = createContext('light');

function Component() {
  const user = useContext(UserContext);
  const theme = useContext(ThemeContext);
  
  return <div>{user.name} prefers {theme}</div>;
}

function App() {
  return (
    <UserContext.Provider value={{ name: 'Alice' }}>
      <ThemeContext.Provider value="dark">
        <Component />
      </ThemeContext.Provider>
    </UserContext.Provider>
  );
}
```

## Starter Code

```javascript
// Global state (these would be imported from your signal implementation)
let Owner = null;

// Create a symbol for context identification
const ERROR = Symbol('error');

// Helper: children resolver (simplified)
function children(fn) {
  const c = createMemo(fn);
  const memo = createMemo(() => resolveChildren(c()));
  memo.toArray = () => {
    const resolved = memo();
    return Array.isArray(resolved) ? resolved : resolved != null ? [resolved] : [];
  };
  return memo;
}

function resolveChildren(children) {
  if (typeof children === 'function' && !children.length) {
    return resolveChildren(children());
  }
  if (Array.isArray(children)) {
    const results = [];
    for (let i = 0; i < children.length; i++) {
      const result = resolveChildren(children[i]);
      Array.isArray(result) ? results.push.apply(results, result) : results.push(result);
    }
    return results;
  }
  return children;
}

// YOUR CODE HERE
function createContext(defaultValue) {
  // TODO: Implement
}

function useContext(context) {
  // TODO: Implement
}

function createProvider(id) {
  // TODO: Implement
}
```

## Testing Your Implementation

```javascript
// Test 1: Default value
const TestContext = createContext('default');
let result;

function TestComponent() {
  result = useContext(TestContext);
  return null;
}

render(() => <TestComponent />, container);
console.assert(result === 'default', 'Should return default value');

// Test 2: Provider value
render(() => (
  <TestContext.Provider value="provided">
    <TestComponent />
  </TestContext.Provider>
), container);
console.assert(result === 'provided', 'Should return provided value');

// Test 3: Nested providers
const results = [];

function Child1() {
  results.push(useContext(TestContext));
  return null;
}

function Child2() {
  results.push(useContext(TestContext));
  return null;
}

render(() => (
  <TestContext.Provider value="outer">
    <Child1 />
    <TestContext.Provider value="inner">
      <Child2 />
    </TestContext.Provider>
  </TestContext.Provider>
), container);

console.assert(results[0] === 'outer', 'First child should see outer value');
console.assert(results[1] === 'inner', 'Second child should see inner value');

// Test 4: Multiple contexts
const Context1 = createContext('a');
const Context2 = createContext('b');
let result1, result2;

function MultiContextChild() {
  result1 = useContext(Context1);
  result2 = useContext(Context2);
  return null;
}

render(() => (
  <Context1.Provider value="A">
    <Context2.Provider value="B">
      <MultiContextChild />
    </Context2.Provider>
  </Context1.Provider>
), container);

console.assert(result1 === 'A', 'Should get correct value from Context1');
console.assert(result2 === 'B', 'Should get correct value from Context2');
```

## Solution Hints

<details>
<summary>Hint 1: createContext structure</summary>

```javascript
function createContext(defaultValue) {
  const id = Symbol('context');
  
  return {
    id,
    Provider: createProvider(id),
    defaultValue
  };
}
```
</details>

<details>
<summary>Hint 2: useContext lookup</summary>

```javascript
function useContext(context) {
  // Check if Owner exists and has context
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
</details>

<details>
<summary>Hint 3: createProvider implementation</summary>

```javascript
function createProvider(id) {
  return function Provider(props) {
    let resolvedChildren;
    
    createRenderEffect(() => {
      resolvedChildren = untrack(() => {
        // Clone parent context and add new value
        Owner.context = { 
          ...Owner.context, 
          [id]: props.value 
        };
        
        // Resolve children
        return children(() => props.children);
      });
    });
    
    return resolvedChildren;
  };
}
```
</details>

## Bonus Challenges

### Bonus 1: Error Handling

Add error handling when useContext is called outside a component:

```javascript
function useContext(context) {
  if (!Owner) {
    console.warn('useContext called outside reactive scope');
  }
  // ... rest of implementation
}
```

### Bonus 2: TypeScript Types

Add full TypeScript support:

```typescript
interface Context<T> {
  id: symbol;
  Provider: ContextProviderComponent<T>;
  defaultValue: T;
}

type ContextProviderComponent<T> = (props: { 
  value: T; 
  children: any 
}) => any;

function createContext<T>(): Context<T | undefined>;
function createContext<T>(defaultValue: T): Context<T>;
function createContext<T>(defaultValue?: T): Context<T | undefined> {
  // Implementation
}
```

### Bonus 3: Development Mode

Add development features:
- Named contexts for debugging
- Warning when no Provider is found
- Context dependency tracking

```javascript
function createContext(defaultValue, options) {
  const id = Symbol(options?.name || 'context');
  
  // Track context usage in dev mode
  if (IS_DEV) {
    // Add to registry, track consumers, etc.
  }
  
  return {
    id,
    Provider: createProvider(id, options),
    defaultValue,
    ...(IS_DEV && { name: options?.name })
  };
}
```

## Submission

Submit your implementation with:
1. Complete source code
2. All tests passing
3. At least one bonus challenge completed
4. Brief explanation of design decisions

## Evaluation Criteria

- **Correctness (40%)**: All test cases pass
- **Code Quality (30%)**: Clean, readable code
- **Understanding (20%)**: Demonstrates understanding of concepts
- **Bonus Features (10%)**: Additional features implemented

## Learning Outcomes

After completing this exercise, you will:
- ✅ Understand Symbol-based context identification
- ✅ Know how context values are stored in Owner.context
- ✅ Implement context lookup and inheritance
- ✅ Handle nested providers correctly
- ✅ Support multiple independent contexts

---

# Exercise 2: Build Component Library

**Difficulty:** ⭐⭐⭐⭐ (Advanced)

**Time:** 4-5 hours

## Objective

Create a reusable component library with proper prop handling, ref forwarding, and composition patterns.

## Requirements

Build the following components:

### 1. Button Component (1 hour)

```typescript
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  onClick?: (e: MouseEvent) => void;
  children: JSX.Element;
}

function Button(props: ButtonProps): JSX.Element;
```

Features:
- Support all HTML button attributes
- Show loading spinner when loading
- Disable when loading or disabled
- Apply variant and size classes
- Forward ref to button element

### 2. Input Component (1 hour)

```typescript
interface InputProps {
  type?: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  label?: string;
  onInput?: (value: string) => void;
  ref?: HTMLInputElement | ((el: HTMLInputElement) => void);
}

function Input(props: InputProps): JSX.Element;
```

Features:
- Controlled and uncontrolled modes
- Error state and message
- Optional label
- Ref forwarding

### 3. Modal Component (1.5 hours)

```typescript
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: JSX.Element;
}

function Modal(props: ModalProps): JSX.Element;
```

Features:
- Portal rendering
- Backdrop with click-to-close
- ESC key to close
- Focus trap
- Prevent body scroll when open

### 4. Tabs Component (1.5 hours)

Use compound component pattern:

```typescript
function Tabs(props: { defaultValue: string; children: JSX.Element });
function TabList(props: { children: JSX.Element });
function Tab(props: { value: string; children: JSX.Element });
function TabPanel(props: { value: string; children: JSX.Element });
```

Features:
- Shared state via context
- Keyboard navigation (arrow keys)
- Active tab styling
- Lazy rendering of panels

## Starter Code

```javascript
// Button.jsx
import { splitProps, mergeProps } from 'solid-js';

export function Button(props) {
  const merged = mergeProps({ variant: 'primary', size: 'md' }, props);
  const [local, others] = splitProps(merged, ['variant', 'size', 'loading', 'children']);
  
  // TODO: Implement
}
```

## Testing

Write tests for each component:

```javascript
// Button.test.js
import { render, fireEvent } from 'solid-testing-library';
import { Button } from './Button';

describe('Button', () => {
  it('renders children', () => {
    const { getByText } = render(() => <Button>Click me</Button>);
    expect(getByText('Click me')).toBeInTheDocument();
  });
  
  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    const { getByRole } = render(() => (
      <Button onClick={handleClick}>Click me</Button>
    ));
    
    fireEvent.click(getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
  
  it('disables button when loading', () => {
    const { getByRole } = render(() => (
      <Button loading>Click me</Button>
    ));
    
    expect(getByRole('button')).toBeDisabled();
  });
});
```

## Bonus Challenges

1. **Accessibility**: Add proper ARIA attributes
2. **Themes**: Support dark/light theme via context
3. **Animations**: Add enter/exit animations
4. **Documentation**: Generate component docs
5. **Storybook**: Create interactive demos

## Submission

Submit:
1. All component source code
2. Test files with >80% coverage
3. README with usage examples
4. Live demo (optional)

---

# Exercise 3: Error Boundary Implementation

**Difficulty:** ⭐⭐⭐ (Intermediate)

**Time:** 2-3 hours

## Objective

Implement a production-ready ErrorBoundary component with logging, retry logic, and different fallback modes.

## Requirements

```typescript
interface ErrorBoundaryProps {
  fallback?: (error: Error, reset: () => void) => JSX.Element;
  onError?: (error: Error) => void;
  children: JSX.Element;
}

function ErrorBoundary(props: ErrorBoundaryProps): JSX.Element;
```

Features:
1. Catch and display errors
2. Reset functionality
3. Error logging callback
4. Default fallback UI
5. Development vs production modes

## Test Cases

```javascript
// Should catch errors
it('catches errors in children', () => {
  const ThrowError = () => {
    throw new Error('Test error');
  };
  
  const { getByText } = render(() => (
    <ErrorBoundary fallback={(err) => <div>{err.message}</div>}>
      <ThrowError />
    </ErrorBoundary>
  ));
  
  expect(getByText('Test error')).toBeInTheDocument();
});

// Should reset
it('resets error on button click', () => {
  let shouldThrow = true;
  
  const MaybeThrow = () => {
    if (shouldThrow) throw new Error('Error');
    return <div>Success</div>;
  };
  
  const { getByText, getByRole } = render(() => (
    <ErrorBoundary fallback={(err, reset) => (
      <button onClick={reset}>Reset</button>
    )}>
      <MaybeThrow />
    </ErrorBoundary>
  ));
  
  expect(getByRole('button')).toBeInTheDocument();
  
  shouldThrow = false;
  fireEvent.click(getByRole('button'));
  
  expect(getByText('Success')).toBeInTheDocument();
});
```

## Solution Template

```javascript
import { catchError, createSignal, Show } from 'solid-js';

export function ErrorBoundary(props) {
  const [error, setError] = createSignal();
  
  const reset = () => {
    // TODO: Implement
  };
  
  const handleError = (err) => {
    // TODO: Implement
  };
  
  return (
    <Show
      when={!error()}
      fallback={/* TODO */}
    >
      {catchError(() => props.children, handleError)}
    </Show>
  );
}
```

## Bonus

Add automatic retry with exponential backoff:

```javascript
function ErrorBoundaryWithRetry(props) {
  const [error, setError] = createSignal();
  const [retryCount, setRetryCount] = createSignal(0);
  const [retryDelay, setRetryDelay] = createSignal(1000);
  
  // Auto-retry logic
  createEffect(() => {
    if (error() && retryCount() < 3) {
      const timer = setTimeout(() => {
        reset();
        setRetryDelay(d => d * 2); // Exponential backoff
      }, retryDelay());
      
      onCleanup(() => clearTimeout(timer));
    }
  });
  
  // Implementation
}
```

---

# Exercise 4: Advanced Component Patterns

**Difficulty:** ⭐⭐⭐⭐ (Advanced)

**Time:** 3-4 hours

## Objective

Implement advanced component patterns: render props, compound components, and HOCs.

## Part 1: Render Props (1 hour)

Create a `<Mouse>` component that tracks mouse position:

```javascript
function Mouse(props) {
  const [position, setPosition] = createSignal({ x: 0, y: 0 });
  
  // Track mouse position
  
  return props.children(position());
}

// Usage
<Mouse>
  {(pos) => <div>Mouse: {pos.x}, {pos.y}</div>}
</Mouse>
```

## Part 2: Compound Components (1.5 hours)

Create a `<Select>` component with compound pattern:

```javascript
<Select defaultValue="apple">
  <Select.Trigger>
    <Select.Value placeholder="Select fruit" />
  </Select.Trigger>
  <Select.Content>
    <Select.Item value="apple">Apple</Select.Item>
    <Select.Item value="orange">Orange</Select.Item>
  </Select.Content>
</Select>
```

## Part 3: Higher-Order Component (30 min)

Create a `withLoading` HOC:

```javascript
function withLoading(Component) {
  return function LoadingWrapper(props) {
    return (
      <Show when={!props.loading} fallback={<Spinner />}>
        <Component {...props} />
      </Show>
    );
  };
}

const UserListWithLoading = withLoading(UserList);
```

## Submission

Submit all pattern implementations with tests and usage examples.
