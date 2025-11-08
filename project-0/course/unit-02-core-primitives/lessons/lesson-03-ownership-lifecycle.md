# Lesson 3: Ownership and Lifecycle

## Table of Contents

1. [Owner Interface](#owner-interface)
2. [createRoot Implementation](#createroot-implementation)
3. [Scope Isolation](#scope-isolation)
4. [Automatic Cleanup](#automatic-cleanup)
5. [Nested Reactive Scopes](#nested-reactive-scopes)
6. [onCleanup Pattern](#oncleanup-pattern)
7. [Complete Implementation](#complete-implementation)

---

## Owner Interface

### The Full Structure

From Solid.js source code:

```typescript
interface Owner {
  owned: Computation<any>[] | null;
  cleanups: (() => void)[] | null;
  owner: Owner | null;
  context: any | null;
  sourceMap?: Record<string, { value: unknown }>;
}
```

### Field-by-Field Explanation

#### **owned: Computation[] | null**
All computations (effects, memos) created within this owner's scope.

```javascript
createRoot(dispose => {
  createEffect(() => {}); // Added to root.owned
  createMemo(() => {});   // Added to root.owned
});
```

#### **cleanups: (() => void)[] | null**
Functions to call when disposing this owner.

```javascript
createRoot(dispose => {
  onCleanup(() => console.log('Cleaning up!'));
  // Added to root.cleanups
});
```

#### **owner: Owner | null**
Parent owner in the hierarchy.

```javascript
createRoot(dispose1 => {
  // owner = null (top level)
  
  createRoot(dispose2 => {
    // owner = dispose1's root
  });
});
```

#### **context: any | null**
Context values for this scope (used by createContext).

```javascript
const ThemeContext = createContext();

<ThemeContext.Provider value="dark">
  {/* Owner.context contains theme value */}
</ThemeContext.Provider>
```

---

## createRoot Implementation

### Why createRoot?

**Problem:** Need isolated reactive scopes that can be disposed independently.

**Solution:** createRoot creates a detached reactive scope.

### Basic Structure

```javascript
function createRoot(fn) {
  const prevOwner = Owner;
  
  const root = {
    owned: null,
    cleanups: null,
    owner: prevOwner,
    context: prevOwner ? prevOwner.context : null
  };
  
  Owner = root;
  
  let disposer;
  try {
    const result = fn(() => dispose(root));
    return result;
  } finally {
    Owner = prevOwner;
  }
}
```

### Dispose Function

```javascript
function dispose(owner) {
  // Dispose all owned computations
  if (owner.owned) {
    for (let i = owner.owned.length - 1; i >= 0; i--) {
      disposeComputation(owner.owned[i]);
    }
    owner.owned = null;
  }
  
  // Run cleanup functions
  if (owner.cleanups) {
    for (let i = owner.cleanups.length - 1; i >= 0; i--) {
      owner.cleanups[i]();
    }
    owner.cleanups = null;
  }
  
  // Remove from parent's owned list
  if (owner.owner && owner.owner.owned) {
    const index = owner.owner.owned.indexOf(owner);
    if (index !== -1) {
      owner.owner.owned.splice(index, 1);
    }
  }
}
```

### Complete Example

```javascript
let Owner = null;

function createRoot(fn) {
  const prevOwner = Owner;
  
  const root = {
    owned: null,
    cleanups: null,
    owner: prevOwner,
    context: prevOwner ? prevOwner.context : null
  };
  
  Owner = root;
  
  let result;
  try {
    result = fn(() => dispose(root));
  } finally {
    Owner = prevOwner;
  }
  
  return result;
}

function dispose(owner) {
  if (owner.owned) {
    for (let i = owner.owned.length - 1; i >= 0; i--) {
      const computation = owner.owned[i];
      disposeComputation(computation);
    }
    owner.owned = null;
  }
  
  if (owner.cleanups) {
    for (let i = owner.cleanups.length - 1; i >= 0; i--) {
      owner.cleanups[i]();
    }
    owner.cleanups = null;
  }
}

function disposeComputation(computation) {
  // Clean up sources (remove from signals' observers)
  if (computation.sources) {
    while (computation.sources.length) {
      const source = computation.sources.pop();
      const slot = computation.sourceSlots.pop();
      removeObserver(source, slot);
    }
  }
  
  // Dispose owned computations recursively
  if (computation.owned) {
    for (let i = computation.owned.length - 1; i >= 0; i--) {
      disposeComputation(computation.owned[i]);
    }
    computation.owned = null;
  }
  
  // Run cleanup functions
  if (computation.cleanups) {
    for (let i = computation.cleanups.length - 1; i >= 0; i--) {
      computation.cleanups[i]();
    }
    computation.cleanups = null;
  }
}
```

---

## Scope Isolation

### What is Scope Isolation?

Scope isolation ensures that reactive computations are contained within their owner and can be disposed without affecting other scopes.

### Example: Component Isolation

```javascript
function Component(props) {
  return createRoot(dispose => {
    // All reactive primitives created here are owned by this root
    const [count, setCount] = createSignal(0);
    
    createEffect(() => {
      console.log('Count:', count());
    });
    
    // Can dispose everything at once
    return { dispose, count, setCount };
  });
}

const comp1 = Component();
const comp2 = Component();

// Dispose comp1 without affecting comp2
comp1.dispose();
```

### Nested Scopes

```javascript
createRoot(dispose1 => {
  const [outer, setOuter] = createSignal('outer');
  
  createEffect(() => {
    console.log('Outer:', outer());
  });
  
  createRoot(dispose2 => {
    const [inner, setInner] = createSignal('inner');
    
    createEffect(() => {
      console.log('Inner:', inner());
      console.log('Can access outer:', outer());
    });
    
    // dispose2 only cleans up inner scope
    return dispose2;
  });
  
  // dispose1 cleans up both scopes
  return dispose1;
});
```

### Visual Representation

```
Root Owner
├── Effect 1
├── Signal 1
└── Child Owner
    ├── Effect 2
    ├── Signal 2
    └── Memo 1

dispose(Root) → Cleans up everything
dispose(Child) → Only cleans up child
```

---

## Automatic Cleanup

### How Automatic Cleanup Works

When a computation re-runs:
1. Old dependencies are removed
2. New dependencies are tracked
3. Old cleanups are run

### Example: Dynamic Dependencies

```javascript
const [show, setShow] = createSignal(true);
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);

createEffect(() => {
  if (show()) {
    console.log('A:', a());
  } else {
    console.log('B:', b());
  }
});

// Initially tracks: show, a
// When show = false, switches to: show, b
// Old dependency on 'a' is automatically cleaned up
```

### Cleanup Sources Algorithm

```javascript
function cleanupSources(computation) {
  // Remove computation from all source observers
  if (computation.sources) {
    while (computation.sources.length) {
      const source = computation.sources.pop();
      const slot = computation.sourceSlots.pop();
      
      // O(1) removal using swap trick
      const observers = source.observers;
      const last = observers.length - 1;
      
      if (slot !== last) {
        const lastObs = observers[last];
        observers[slot] = lastObs;
        source.observerSlots[slot] = source.observerSlots[last];
        
        // Update the swapped observer's slot reference
        lastObs.sourceSlots[source.observerSlots[last]] = slot;
      }
      
      observers.pop();
      source.observerSlots.pop();
    }
  }
}
```

### Preventing Memory Leaks

```javascript
// ❌ Memory leak - timer never cleaned up
createEffect(() => {
  const timer = setInterval(() => {
    console.log('Tick');
  }, 1000);
});

// ✅ Correct - timer cleaned up on dispose
createEffect(() => {
  const timer = setInterval(() => {
    console.log('Tick');
  }, 1000);
  
  onCleanup(() => clearInterval(timer));
});
```

---

## Nested Reactive Scopes

### Parent-Child Relationships

```javascript
createRoot(disposeParent => {
  console.log('Parent scope created');
  
  const [parentSignal, setParentSignal] = createSignal('parent');
  
  createEffect(() => {
    console.log('Parent effect:', parentSignal());
    
    // Child scope created inside parent effect
    createRoot(disposeChild => {
      console.log('Child scope created');
      
      const [childSignal, setChildSignal] = createSignal('child');
      
      createEffect(() => {
        console.log('Child effect:', childSignal());
        console.log('Can access parent:', parentSignal());
      });
      
      return disposeChild;
    });
  });
  
  return disposeParent;
});
```

### Ownership Hierarchy

```javascript
function getOwnerHierarchy(owner) {
  const hierarchy = [];
  let current = owner;
  
  while (current) {
    hierarchy.push({
      ownedCount: current.owned ? current.owned.length : 0,
      cleanupsCount: current.cleanups ? current.cleanups.length : 0
    });
    current = current.owner;
  }
  
  return hierarchy;
}

// Example usage
createRoot(dispose => {
  createEffect(() => {
    const hierarchy = getOwnerHierarchy(Owner);
    console.log('Hierarchy:', hierarchy);
  });
});
```

### Component Pattern

```javascript
function createComponent(fn) {
  return createRoot(dispose => {
    const result = fn();
    
    // Add dispose method
    result.dispose = dispose;
    
    return result;
  });
}

// Usage
const TodoList = createComponent(() => {
  const [todos, setTodos] = createSignal([]);
  
  createEffect(() => {
    console.log('Todos changed:', todos());
  });
  
  const addTodo = (text) => {
    setTodos([...todos(), { text, done: false }]);
  };
  
  return { todos, addTodo };
});

// Clean up when done
TodoList.dispose();
```

---

## onCleanup Pattern

### Basic Implementation

```javascript
function onCleanup(fn) {
  if (!Owner) {
    console.warn('onCleanup called outside reactive scope');
    return;
  }
  
  if (!Owner.cleanups) {
    Owner.cleanups = [];
  }
  
  Owner.cleanups.push(fn);
}
```

### Common Use Cases

#### 1. Timers and Intervals

```javascript
createEffect(() => {
  const timer = setTimeout(() => {
    console.log('Timer fired');
  }, 1000);
  
  onCleanup(() => clearTimeout(timer));
});

createEffect(() => {
  const interval = setInterval(() => {
    console.log('Tick');
  }, 1000);
  
  onCleanup(() => clearInterval(interval));
});
```

#### 2. Event Listeners

```javascript
createEffect(() => {
  const handleClick = () => console.log('Clicked');
  
  document.addEventListener('click', handleClick);
  
  onCleanup(() => {
    document.removeEventListener('click', handleClick);
  });
});
```

#### 3. Subscriptions

```javascript
createEffect(() => {
  const subscription = observable.subscribe(value => {
    console.log('Value:', value);
  });
  
  onCleanup(() => subscription.unsubscribe());
});
```

#### 4. DOM Elements

```javascript
createEffect(() => {
  const element = document.createElement('div');
  document.body.appendChild(element);
  
  onCleanup(() => {
    document.body.removeChild(element);
  });
});
```

#### 5. WebSocket Connections

```javascript
createEffect(() => {
  const url = wsUrl();
  const ws = new WebSocket(url);
  
  ws.onmessage = (event) => {
    console.log('Message:', event.data);
  };
  
  onCleanup(() => {
    ws.close();
  });
});
```

### Multiple Cleanups

```javascript
createEffect(() => {
  // Multiple cleanup functions are allowed
  onCleanup(() => console.log('Cleanup 1'));
  onCleanup(() => console.log('Cleanup 2'));
  onCleanup(() => console.log('Cleanup 3'));
  
  // All run in reverse order when effect re-runs or disposes
});
```

---

## Complete Implementation

Here's a complete, production-grade implementation:

```javascript
// Global state
let Owner = null;

// Owner interface
function createRoot(fn) {
  const prevOwner = Owner;
  
  const root = {
    owned: null,
    cleanups: null,
    owner: prevOwner,
    context: prevOwner ? prevOwner.context : null
  };
  
  Owner = root;
  
  let result;
  let error;
  try {
    result = fn(() => dispose(root));
  } catch (err) {
    error = err;
  } finally {
    Owner = prevOwner;
  }
  
  if (error) throw error;
  return result;
}

// Dispose an owner and all its children
function dispose(owner) {
  if (!owner) return;
  
  // Dispose all owned computations
  if (owner.owned) {
    for (let i = owner.owned.length - 1; i >= 0; i--) {
      disposeComputation(owner.owned[i]);
    }
    owner.owned = null;
  }
  
  // Run cleanup functions
  if (owner.cleanups) {
    for (let i = owner.cleanups.length - 1; i >= 0; i--) {
      try {
        owner.cleanups[i]();
      } catch (err) {
        console.error('Error in cleanup:', err);
      }
    }
    owner.cleanups = null;
  }
  
  // Remove from parent's owned list
  if (owner.owner && owner.owner.owned) {
    const index = owner.owner.owned.indexOf(owner);
    if (index !== -1) {
      owner.owner.owned.splice(index, 1);
    }
  }
}

// Dispose a computation
function disposeComputation(computation) {
  if (!computation) return;
  
  // Clean up sources (remove from signals' observers)
  cleanupSources(computation);
  
  // Dispose owned computations recursively
  if (computation.owned) {
    for (let i = computation.owned.length - 1; i >= 0; i--) {
      disposeComputation(computation.owned[i]);
    }
    computation.owned = null;
  }
  
  // Run cleanup functions
  if (computation.cleanups) {
    for (let i = computation.cleanups.length - 1; i >= 0; i--) {
      try {
        computation.cleanups[i]();
      } catch (err) {
        console.error('Error in cleanup:', err);
      }
    }
    computation.cleanups = null;
  }
  
  // Mark as disposed
  computation.state = -1;
}

// Clean up signal dependencies
function cleanupSources(computation) {
  if (!computation.sources) return;
  
  while (computation.sources.length) {
    const source = computation.sources.pop();
    const slot = computation.sourceSlots.pop();
    
    if (!source.observers) continue;
    
    const observers = source.observers;
    const last = observers.length - 1;
    
    if (slot !== last) {
      // Swap with last
      const lastObs = observers[last];
      observers[slot] = lastObs;
      source.observerSlots[slot] = source.observerSlots[last];
      
      // Update swapped observer's slot reference
      if (lastObs.sourceSlots) {
        const sourceSlot = source.observerSlots[last];
        if (lastObs.sourceSlots[sourceSlot] !== undefined) {
          lastObs.sourceSlots[sourceSlot] = slot;
        }
      }
    }
    
    observers.pop();
    source.observerSlots.pop();
  }
}

// Register cleanup function
function onCleanup(fn) {
  if (!Owner) {
    console.warn('onCleanup called outside reactive scope');
    return;
  }
  
  if (!Owner.cleanups) {
    Owner.cleanups = [];
  }
  
  Owner.cleanups.push(fn);
}

// Get current owner
function getOwner() {
  return Owner;
}

// Run function with specific owner
function runWithOwner(owner, fn) {
  const prevOwner = Owner;
  Owner = owner;
  
  try {
    return fn();
  } finally {
    Owner = prevOwner;
  }
}

// Export
export {
  createRoot,
  dispose,
  disposeComputation,
  onCleanup,
  getOwner,
  runWithOwner,
  Owner
};
```

### Usage Examples

#### Basic Root

```javascript
const dispose = createRoot(dispose => {
  const [count, setCount] = createSignal(0);
  
  createEffect(() => {
    console.log('Count:', count());
  });
  
  onCleanup(() => {
    console.log('Root disposed');
  });
  
  return dispose;
});

// Later...
dispose();
```

#### Component with Cleanup

```javascript
function Timer() {
  return createRoot(dispose => {
    const [seconds, setSeconds] = createSignal(0);
    
    const interval = setInterval(() => {
      setSeconds(s => s + 1);
    }, 1000);
    
    onCleanup(() => {
      clearInterval(interval);
      console.log('Timer cleaned up');
    });
    
    createEffect(() => {
      console.log('Seconds:', seconds());
    });
    
    return { seconds, dispose };
  });
}

const timer = Timer();
// After 5 seconds...
timer.dispose();
```

#### Nested Scopes

```javascript
createRoot(disposeOuter => {
  const [outer, setOuter] = createSignal('outer');
  
  createEffect(() => {
    console.log('Outer:', outer());
    
    createRoot(disposeInner => {
      const [inner, setInner] = createSignal('inner');
      
      createEffect(() => {
        console.log('Inner:', inner());
        console.log('Can see outer:', outer());
      });
      
      onCleanup(() => {
        console.log('Inner scope cleaned up');
      });
      
      return disposeInner;
    });
  });
  
  onCleanup(() => {
    console.log('Outer scope cleaned up');
  });
  
  return disposeOuter;
});
```

---

## Summary

### Key Takeaways

1. **Ownership Hierarchy**
   - createRoot creates isolated scopes
   - Computations are owned by their creator
   - Disposal cascades down the hierarchy

2. **Automatic Cleanup**
   - Dependencies automatically cleaned up
   - Re-running effects clean old deps
   - Prevents memory leaks

3. **onCleanup Pattern**
   - Register cleanup functions
   - Run on re-execution or disposal
   - Essential for side effects

4. **Scope Isolation**
   - Each root is independent
   - Can dispose without affecting others
   - Perfect for components

### What You've Learned

- ✅ Owner interface structure
- ✅ createRoot implementation
- ✅ Scope isolation patterns
- ✅ Automatic cleanup mechanism
- ✅ Nested reactive scopes
- ✅ onCleanup usage
- ✅ Memory leak prevention

### Next Steps

Continue to Lesson 4: Tracking and Untracking

---

## Further Reading

- **Next:** [Lesson 4: Tracking and Untracking](./lesson-04-tracking-untracking.md)
- **Exercise:** [Ownership System Exercise](../exercises/03-ownership-system.md)
- **Source:** [Solid.js signal.ts (lines 140-220)](https://github.com/solidjs/solid/blob/main/packages/solid/src/reactive/signal.ts)
