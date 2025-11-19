# Step 8: Root Scopes and Context API

## 🎯 Goal
Implement `createRoot` for isolated reactive scopes and context propagation for sharing data down the ownership tree.

## 🤔 Why Root Scopes?

### The Problem
```typescript
// Without createRoot - where does this live?
const [count, setCount] = createSignal(0);

createEffect(() => {
  console.log(count());
});

// No way to dispose of this!
// No owner for the signal or effect
// Potential memory leaks
```

### With createRoot
```typescript
const dispose = createRoot(dispose => {
  const [count, setCount] = createSignal(0);
  
  createEffect(() => {
    console.log(count());
  });
  
  return dispose; // Return the dispose function
});

// Later: clean up everything
dispose(); // All signals, effects, cleanups run
```

## 🏗️ Implementation

### Step 1: createRoot (Already Partially Done)

```typescript
export function createRoot<T>(
  fn: RootFunction<T>,
  detachedOwner?: typeof Owner
): T {
  const listener = Listener;
  const owner = Owner;
  
  // Check if function needs dispose parameter
  const unowned = fn.length === 0;
  
  // Get parent owner (if detached, use that; otherwise current)
  const current = detachedOwner === undefined ? owner : detachedOwner;
  
  // Create the root owner
  const root: Owner = unowned
    ? UNOWNED // No dispose function needed
    : {
        owned: null,
        cleanups: null,
        context: current ? current.context : null, // Inherit context
        owner: current // Parent owner
      };
  
  // Set up the function to call
  const updateFn = unowned
    ? fn // Call directly (no dispose parameter)
    : () => fn(() => {
        // Dispose function cleans up the entire root
        untrack(() => cleanNode(root));
      });
  
  // Set root as current owner
  Owner = root;
  Listener = null; // Roots don't subscribe to signals
  
  try {
    return runUpdates(updateFn as () => T, true)!;
  } finally {
    // Restore previous context
    Listener = listener;
    Owner = owner;
  }
}
```

### Step 2: Context API

#### Create Context

```typescript
export interface Context<T> {
  id: symbol;
  Provider: ContextProviderComponent<T>;
  defaultValue: T;
}

export function createContext<T>(
  defaultValue?: T,
  options?: { name?: string }
): Context<T | undefined> {
  const id = Symbol(options?.name || "context");
  
  return {
    id,
    Provider: createProvider(id, options),
    defaultValue
  };
}
```

#### Create Provider

```typescript
function createProvider(id: symbol, options?: { name?: string }) {
  return function Provider(props: { value: any; children: any }) {
    let res;
    
    createRenderEffect(() => {
      res = untrack(() => {
        // Set context on current owner
        Owner!.context = {
          ...Owner!.context,
          [id]: props.value
        };
        
        // Resolve children
        return children(() => props.children);
      });
    }, undefined, options);
    
    return res;
  };
}
```

#### Use Context

```typescript
export function useContext<T>(context: Context<T>): T {
  let value: T | undefined;
  
  // Look up context in current owner
  return Owner && Owner.context && (value = Owner.context[context.id]) !== undefined
    ? value
    : context.defaultValue;
}
```

### Step 3: Children Helper

```typescript
export type ResolvedChildren = JSX.Element | JSX.Element[];
export type ChildrenReturn = Accessor<ResolvedChildren> & {
  toArray: () => JSX.Element[]
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

function resolveChildren(children: any): ResolvedChildren {
  if (typeof children === "function" && !children.length) {
    return resolveChildren(children());
  }
  
  if (Array.isArray(children)) {
    const results: any[] = [];
    for (let i = 0; i < children.length; i++) {
      const result = resolveChildren(children[i]);
      Array.isArray(result)
        ? results.push.apply(results, result)
        : results.push(result);
    }
    return results;
  }
  
  return children;
}
```

## 🎨 Usage Examples

### Example 1: Basic Root

```typescript
// Create an isolated reactive scope
const dispose = createRoot(dispose => {
  const [count, setCount] = createSignal(0);
  
  const interval = setInterval(() => {
    setCount(c => c + 1);
    console.log("Count:", count());
  }, 1000);
  
  // Cleanup when disposed
  onCleanup(() => {
    clearInterval(interval);
    console.log("Root disposed");
  });
  
  return dispose;
});

// Let it run for 5 seconds
setTimeout(() => {
  dispose(); // Logs: "Root disposed"
  // No more intervals!
}, 5000);
```

### Example 2: Nested Roots

```typescript
const outerDispose = createRoot(dispose => {
  console.log("Outer root created");
  
  const innerDispose = createRoot(dispose => {
    console.log("Inner root created");
    
    createEffect(() => {
      console.log("Inner effect");
    });
    
    return dispose;
  });
  
  createEffect(() => {
    console.log("Outer effect");
  });
  
  return () => {
    innerDispose(); // Dispose inner first
    dispose(); // Then outer
  };
});

// Later
outerDispose();
// Logs: "Inner root disposed" then "Outer root disposed"
```

### Example 3: Context

```typescript
// Create a theme context
const ThemeContext = createContext({ theme: "light" });

createRoot(() => {
  // Provide theme value
  <ThemeContext.Provider value={{ theme: "dark" }}>
    <App />
  </ThemeContext.Provider>
});

function App() {
  const theme = useContext(ThemeContext);
  
  createEffect(() => {
    console.log("Current theme:", theme.theme); // "dark"
  });
  
  return null;
}
```

### Example 4: Context Inheritance

```typescript
const UserContext = createContext({ name: "Guest" });

createRoot(() => {
  // Outer context
  <UserContext.Provider value={{ name: "Alice" }}>
    <ChildA />
    
    {/* Nested provider overrides */}
    <UserContext.Provider value={{ name: "Bob" }}>
      <ChildB />
    </UserContext.Provider>
  </UserContext.Provider>
});

function ChildA() {
  const user = useContext(UserContext);
  console.log(user.name); // "Alice"
}

function ChildB() {
  const user = useContext(UserContext);
  console.log(user.name); // "Bob"
}
```

## 🔍 How Context Works

### Context Propagation Tree

```
Root (context: null)
  │
  ├── Provider (context: { ThemeContext: "dark" })
  │     │
  │     ├── Component A (inherits: theme="dark")
  │     │
  │     └── Provider (context: { ThemeContext: "light" })
  │           │
  │           └── Component B (inherits: theme="light")
  │
  └── Component C (no theme context, uses default)
```

### Context Lookup Algorithm

```typescript
function useContext<T>(context: Context<T>): T {
  // Start with current owner
  let owner = Owner;
  
  // Walk up the tree
  while (owner) {
    // Check if this owner has the context
    if (owner.context && context.id in owner.context) {
      return owner.context[context.id];
    }
    
    // Move to parent
    owner = owner.owner;
  }
  
  // Not found, use default
  return context.defaultValue;
}
```

## ✅ Implementation Checklist

- [ ] createRoot creates isolated scope
- [ ] createRoot accepts dispose parameter
- [ ] createRoot can be nested
- [ ] createRoot inherits parent context
- [ ] createContext creates context object
- [ ] Provider sets context on Owner
- [ ] useContext looks up context in tree
- [ ] Context inherits from parent owners
- [ ] Test root disposal
- [ ] Test context propagation

## 🧪 Testing

```typescript
test("createRoot creates isolated scope", () => {
  let innerDisposed = false;
  
  const dispose = createRoot(dispose => {
    createEffect(() => {
      onCleanup(() => {
        innerDisposed = true;
      });
    });
    
    return dispose;
  });
  
  expect(innerDisposed).toBe(false);
  dispose();
  expect(innerDisposed).toBe(true);
});

test("context propagates down tree", () => {
  const TestContext = createContext("default");
  
  createRoot(() => {
    Owner!.context = {
      [TestContext.id]: "custom"
    };
    
    createEffect(() => {
      const value = useContext(TestContext);
      expect(value).toBe("custom");
    });
  });
});

test("nested providers override context", () => {
  const TestContext = createContext("default");
  let value1, value2;
  
  createRoot(() => {
    // Outer provider
    Owner!.context = { [TestContext.id]: "outer" };
    
    createEffect(() => {
      value1 = useContext(TestContext);
    });
    
    // Inner scope with override
    createRoot(() => {
      Owner!.context = { [TestContext.id]: "inner" };
      
      createEffect(() => {
        value2 = useContext(TestContext);
      });
    });
  });
  
  expect(value1).toBe("outer");
  expect(value2).toBe("inner");
});
```

## 🚀 Next Step

Continue to **[09-transitions.md](./09-transitions.md)** to implement concurrent mode with non-blocking updates.

---

**💡 Pro Tip**: Roots and context are essential for real-world apps. They enable composable, isolated reactive scopes with shared state!
