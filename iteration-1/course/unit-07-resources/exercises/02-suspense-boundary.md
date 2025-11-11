# Exercise 2: Suspense Boundary Implementation

**Difficulty:** ⭐⭐⭐⭐ (Intermediate-Advanced)

## Objective

Build a complete Suspense component that coordinates loading states across multiple resources.

## Requirements

1. **Counter-based Coordination**
   - Maintain a count of loading resources
   - Show fallback when count > 0
   - Show content when count === 0

2. **Context Provision**
   - Provide context to child components
   - Allow resources to access the context
   - Support nested Suspense boundaries

3. **Proper Rendering**
   - Reactive rendering based on count
   - Smooth transitions between states

## Starter Code

```typescript
interface SuspenseContext {
  increment: () => void;
  decrement: () => void;
  count: () => number;
}

function Suspense(props: {
  fallback: JSX.Element;
  children: JSX.Element;
  name?: string;
}): JSX.Element {
  // TODO: Implement Suspense component
  throw new Error('Not implemented');
}

function getSuspenseContext(): SuspenseContext | undefined {
  // TODO: Implement context retrieval
  throw new Error('Not implemented');
}
```

## Test Cases

```typescript
describe('Suspense', () => {
  it('should show fallback when resource is loading', async () => {
    const App = () => (
      <Suspense fallback={<div>Loading...</div>}>
        <AsyncComponent />
      </Suspense>
    );
    
    const { container } = render(<App />);
    expect(container.textContent).toBe('Loading...');
  });
  
  it('should show content when resource is ready', async () => {
    const App = () => (
      <Suspense fallback={<div>Loading...</div>}>
        <AsyncComponent />
      </Suspense>
    );
    
    const { container } = render(<App />);
    
    await waitFor(() => {
      expect(container.textContent).toBe('Content loaded');
    });
  });
  
  it('should coordinate multiple resources', async () => {
    const App = () => (
      <Suspense fallback={<div>Loading...</div>}>
        <Resource1 />
        <Resource2 />
      </Suspense>
    );
    
    const { container } = render(<App />);
    expect(container.textContent).toBe('Loading...');
    
    // Should wait for BOTH resources
    await waitFor(() => {
      expect(container.textContent).toContain('Resource 1');
      expect(container.textContent).toContain('Resource 2');
    });
  });
  
  it('should support nested boundaries', async () => {
    const App = () => (
      <Suspense fallback={<div>Outer loading</div>}>
        <div>Outer content</div>
        <Suspense fallback={<div>Inner loading</div>}>
          <AsyncComponent />
        </Suspense>
      </Suspense>
    );
    
    const { container } = render(<App />);
    
    // Inner suspense should show its fallback
    expect(container.textContent).toContain('Inner loading');
  });
});
```

## Implementation Steps

### Step 1: Create Counter Signal

```typescript
function Suspense(props) {
  const [count, setCount] = createSignal(0);
  
  createEffect(() => {
    console.log(`[Suspense ${props.name}] count:`, count());
  });
  
  // Continue...
}
```

### Step 2: Create Context

```typescript
const context: SuspenseContext = {
  increment: () => {
    setCount(c => c + 1);
    console.log(`[Suspense ${props.name}] increment to`, count() + 1);
  },
  decrement: () => {
    setCount(c => Math.max(0, c - 1));
    console.log(`[Suspense ${props.name}] decrement to`, count() - 1);
  },
  count
};
```

### Step 3: Provide Context

```typescript
// Store in owner's context
const owner = getOwner();
if (owner) {
  if (!owner.context) owner.context = {};
  owner.context[SuspenseContextSymbol] = context;
}
```

### Step 4: Render Based on Count

```typescript
return () => {
  const currentCount = count();
  
  if (currentCount > 0) {
    return props.fallback;
  } else {
    return props.children;
  }
};
```

## Bonus Challenges

1. **Nested Support**: Make parent Suspense aware of nested Suspense states
2. **Timeout**: Add timeout option to show fallback after delay
3. **SuspenseList**: Implement SuspenseList for coordinated reveal order
4. **Debug Mode**: Add visual debugging UI

## Expected Output

```typescript
// Single resource
<Suspense fallback={<Spinner />}>
  <UserProfile />
</Suspense>

// Multiple resources
<Suspense fallback={<PageLoader />}>
  <Header />
  <Content />
  <Footer />
</Suspense>

// Nested boundaries
<Suspense fallback={<PageLoader />}>
  <Header />
  <Suspense fallback={<ContentLoader />}>
    <Content />
  </Suspense>
  <Footer />
</Suspense>
```

## Solution

See `solutions/exercise-02-solution.ts`
