# Lesson 3: useTransition Pattern

## Introduction

While `startTransition` provides the low-level API, `useTransition` offers a user-friendly hook for managing transition state. This lesson explores how to build and use `useTransition` effectively.

## The useTransition Hook

From Solid.js source:

```typescript
const [transPending, setTransPending] = createSignal(false);

export function useTransition(): Transition {
  return [transPending, startTransition];
}
```

Surprisingly simple! But there's more happening under the hood.

## The API

```typescript
const [isPending, start] = useTransition();

// isPending: Accessor<boolean> - true while transition active
// start: (fn: () => void) => Promise<void> - starts a transition
```

### Basic Usage

```javascript
const [count, setCount] = createSignal(0);
const [isPending, start] = useTransition();

function handleClick() {
  start(() => {
    setCount(c => c + 1);
  });
}

return (
  <div>
    <div>Count: {count()}</div>
    {isPending() && <div>Updating...</div>}
    <button onClick={handleClick}>Increment</button>
  </div>
);
```

## How transPending Works

### The Global Pending Signal

```javascript
// Created at module initialization
const [transPending, setTransPending] = createSignal(false);
```

**Why global?**
- Single source of truth for all transitions
- Any component can check if any transition is pending
- Simplifies implementation

### Setting Pending State

In `completeUpdates()`:

```typescript
if (Transition && !Transition.promises.size && !Transition.queue.size) {
  // About to commit
  // ...
  
  runUpdates(() => {
    // ...
    setTransPending(false);  // Clear pending
  }, false);
} else if (Transition && Transition.running) {
  // Still has work
  Transition.running = false;
  Transition.effects.push.apply(Transition.effects, Effects!);
  Effects = null;
  setTransPending(true);  // Set pending
  return;
}
```

### State Transitions

```
IDLE (isPending = false)
  ↓
startTransition()
  ↓
RUNNING (isPending = true)
  ↓
  ├─ No promises → COMMIT → IDLE (isPending = false)
  │
  └─ Has promises → WAITING (isPending = true)
       ↓
       Promise resolves
       ↓
       COMMIT → IDLE (isPending = false)
```

## Building useTransition from Scratch

### Step 1: Basic Implementation

```javascript
// Global pending signal
const [transPending, setTransPending] = createSignal(false);

function useTransition() {
  return [transPending, startTransition];
}

// Modified startTransition
function startTransition(fn) {
  if (Transition && Transition.running) {
    fn();
    return Transition.done;
  }
  
  return Promise.resolve().then(() => {
    // Set pending
    setTransPending(true);
    
    Transition = {
      sources: new Set(),
      effects: [],
      promises: new Set(),
      running: true
    };
    
    Transition.done = new Promise(resolve => {
      Transition.resolve = resolve;
    });
    
    // Execute
    fn();
    
    // Commit
    commitTransition();
    
    return Transition.done;
  });
}

function commitTransition() {
  // Update values
  for (const signal of Transition.sources) {
    signal.value = signal.tValue;
    delete signal.tValue;
  }
  
  // Clear pending
  setTransPending(false);
  
  // Resolve promise
  Transition.resolve();
  Transition = null;
}
```

### Step 2: Adding Promise Support

```javascript
function startTransition(fn) {
  // ... setup ...
  
  // Execute
  const result = fn();
  
  // Check for promise
  if (result && typeof result.then === 'function') {
    Transition.promises.add(result);
    
    result.finally(() => {
      Transition.promises.delete(result);
      checkCommit();
    });
  } else {
    commitTransition();
  }
  
  return Transition.done;
}

function checkCommit() {
  if (Transition && Transition.promises.size === 0) {
    commitTransition();
  }
}
```

### Step 3: Multiple Transitions

```javascript
function useTransition() {
  // Each call shares the same pending signal
  return [transPending, startTransition];
}

// All transitions affect the same pending state
const [isPending1, start1] = useTransition();
const [isPending2, start2] = useTransition();

// isPending1 === isPending2 (same signal)

start1(() => setA(1));  // isPending1() === true
start2(() => setB(2));  // isPending2() === true (same flag!)
```

## User Experience Patterns

### Pattern 1: Loading Indicator

```javascript
const [data, setData] = createSignal([]);
const [isPending, start] = useTransition();

async function loadData() {
  start(async () => {
    const result = await fetch('/api/data');
    setData(result);
  });
}

return (
  <div>
    <button onClick={loadData}>Load</button>
    
    {isPending() ? (
      <div>Loading...</div>
    ) : (
      <DataView data={data()} />
    )}
  </div>
);
```

### Pattern 2: Dimmed Content

```javascript
return (
  <div classList={{ dimmed: isPending() }}>
    <DataList items={items()} />
  </div>
);

// CSS
.dimmed {
  opacity: 0.6;
  pointer-events: none;
}
```

### Pattern 3: Disabled Inputs

```javascript
return (
  <input
    value={query()}
    onInput={handleInput}
    disabled={isPending()}
  />
);
```

### Pattern 4: Progress Indicator

```javascript
const [isPending, start] = useTransition();
const [progress, setProgress] = createSignal(0);

function loadWithProgress() {
  setProgress(0);
  
  start(async () => {
    setProgress(25);
    const data = await fetchData();
    
    setProgress(50);
    const processed = processData(data);
    
    setProgress(75);
    const validated = validateData(processed);
    
    setProgress(100);
    setResult(validated);
  });
}

return (
  <div>
    {isPending() && (
      <ProgressBar value={progress()} />
    )}
  </div>
);
```

### Pattern 5: Optimistic Updates

```javascript
const [comments, setComments] = createSignal([]);
const [isPending, start] = useTransition();

function addComment(text) {
  // Optimistic: show immediately
  const tempId = `temp-${Date.now()}`;
  const newComment = { id: tempId, text, pending: true };
  setComments(c => [...c, newComment]);
  
  // Actual: update in transition
  start(async () => {
    try {
      const saved = await saveComment(text);
      // Replace temp with real
      setComments(c => 
        c.map(comment => 
          comment.id === tempId ? saved : comment
        )
      );
    } catch (err) {
      // Revert on error
      setComments(c => c.filter(comment => comment.id !== tempId));
    }
  });
}

return (
  <For each={comments()}>
    {comment => (
      <div classList={{ pending: comment.pending }}>
        {comment.text}
      </div>
    )}
  </For>
);
```

## Advanced Patterns

### Pattern 6: Nested Pending States

```javascript
const [globalPending, startGlobal] = useTransition();
const [localPending, setLocalPending] = createSignal(false);

function loadData() {
  setLocalPending(true);
  
  startGlobal(async () => {
    try {
      const data = await fetchData();
      setData(data);
    } finally {
      setLocalPending(false);
    }
  });
}

// Show both states
return (
  <div>
    {globalPending() && <GlobalSpinner />}
    {localPending() && <LocalSpinner />}
  </div>
);
```

### Pattern 7: Debounced Transitions

```javascript
const [query, setQuery] = createSignal('');
const [results, setResults] = createSignal([]);
const [isPending, start] = useTransition();

let timeoutId;

function handleSearch(text) {
  setQuery(text);  // Update input immediately
  
  // Debounce the transition
  clearTimeout(timeoutId);
  timeoutId = setTimeout(() => {
    start(() => {
      const filtered = expensiveFilter(text);
      setResults(filtered);
    });
  }, 300);
}
```

### Pattern 8: Cancellable Transitions

```javascript
const [isPending, start] = useTransition();
let abortController;

function loadData() {
  // Cancel previous
  if (abortController) {
    abortController.abort();
  }
  
  abortController = new AbortController();
  
  start(async () => {
    try {
      const data = await fetch('/api', {
        signal: abortController.signal
      });
      setData(data);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error(err);
      }
    }
  });
}
```

## Comparing with and without Transitions

### Without Transitions (Blocking)

```javascript
const [query, setQuery] = createSignal('');
const [results, setResults] = createSignal([]);

function handleInput(e) {
  const value = e.target.value;
  setQuery(value);
  
  // Both updates happen synchronously
  const filtered = expensiveFilter(value);
  setResults(filtered);
  // UI freezes during filter!
}
```

**Problems:**
- Input lag (typing feels slow)
- UI frozen during computation
- Poor user experience

### With Transitions (Non-blocking)

```javascript
const [query, setQuery] = createSignal('');
const [results, setResults] = createSignal([]);
const [isPending, start] = useTransition();

function handleInput(e) {
  const value = e.target.value;
  setQuery(value);  // Instant!
  
  start(() => {
    const filtered = expensiveFilter(value);
    setResults(filtered);  // Deferred
  });
}
```

**Benefits:**
- Input updates instantly
- Old results shown while computing
- Loading indicator available
- Smooth user experience

## Performance Considerations

### When Transitions Help

✅ **Expensive computations**
```javascript
start(() => {
  const sorted = hugeArray.sort();
  setData(sorted);
});
```

✅ **Large list updates**
```javascript
start(() => {
  setItems(filterTh thousandsOfItems(query));
});
```

✅ **Complex derived state**
```javascript
start(() => {
  const computed = complexCalculation(inputs);
  setResult(computed);
});
```

### When Transitions Don't Help

❌ **Already fast operations**
```javascript
// Unnecessary
start(() => {
  setCount(c => c + 1);
});

// Just do:
setCount(c => c + 1);
```

❌ **Critical updates**
```javascript
// DON'T defer critical updates
start(() => {
  setInputValue(e.target.value);  // Feels laggy!
});
```

❌ **Small synchronous updates**
```javascript
// Overhead not worth it
start(() => {
  setFlag(true);
});
```

## Building a Complete Example

```javascript
import { createSignal, For } from 'solid-js';
import { useTransition } from './transition';

function SearchableList() {
  const [query, setQuery] = createSignal('');
  const [items, setItems] = createSignal(generateItems(10000));
  const [isPending, start] = useTransition();
  
  function handleSearch(e) {
    const value = e.target.value;
    setQuery(value);
    
    start(() => {
      const filtered = items().filter(item =>
        item.name.toLowerCase().includes(value.toLowerCase())
      );
      setItems(filtered);
    });
  }
  
  return (
    <div class="search-list">
      <div class="search-header">
        <input
          type="text"
          value={query()}
          onInput={handleSearch}
          placeholder="Search..."
        />
        
        {isPending() && (
          <span class="spinner">⏳</span>
        )}
      </div>
      
      <div classList={{ dimmed: isPending() }}>
        <div class="count">
          {items().length} items
        </div>
        
        <ul class="items">
          <For each={items()}>
            {item => <li>{item.name}</li>}
          </For>
        </ul>
      </div>
    </div>
  );
}

function generateItems(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    name: `Item ${i}`
  }));
}
```

## Testing useTransition

```javascript
import { describe, it, expect } from 'vitest';
import { createRoot } from 'solid-js';
import { useTransition } from './transition';

describe('useTransition', () => {
  it('should start as not pending', () => {
    createRoot(dispose => {
      const [isPending] = useTransition();
      expect(isPending()).toBe(false);
      dispose();
    });
  });
  
  it('should set pending during transition', async () => {
    await createRoot(async dispose => {
      const [signal, setSignal] = createSignal(0);
      const [isPending, start] = useTransition();
      
      const promise = start(() => {
        setSignal(1);
      });
      
      expect(isPending()).toBe(true);
      
      await promise;
      
      expect(isPending()).toBe(false);
      expect(signal()).toBe(1);
      
      dispose();
    });
  });
  
  it('should handle async transitions', async () => {
    await createRoot(async dispose => {
      const [signal, setSignal] = createSignal(0);
      const [isPending, start] = useTransition();
      
      const promise = start(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        setSignal(1);
      });
      
      expect(isPending()).toBe(true);
      
      await promise;
      
      expect(isPending()).toBe(false);
      expect(signal()).toBe(1);
      
      dispose();
    });
  });
});
```

## Common Pitfalls

### Pitfall 1: Forgetting to Show Pending State

```javascript
// BAD: No feedback
const [isPending, start] = useTransition();

start(() => expensiveOperation());
// User has no idea something is happening

// GOOD: Show pending state
{isPending() && <LoadingSpinner />}
```

### Pitfall 2: Blocking Critical Updates

```javascript
// BAD: Input feels laggy
start(() => {
  setInputValue(e.target.value);
});

// GOOD: Critical updates immediate
setInputValue(e.target.value);
```

### Pitfall 3: Not Handling Errors

```javascript
// BAD: Errors not handled
start(async () => {
  const data = await fetch('/api');  // Might fail!
  setData(data);
});

// GOOD: Handle errors
start(async () => {
  try {
    const data = await fetch('/api');
    setData(data);
  } catch (err) {
    setError(err);
  }
});
```

## Key Insights

1. **useTransition is surprisingly simple**
   - Just returns global pending signal + startTransition
   - Complexity is in startTransition itself

2. **isPending is global**
   - All transitions share same pending state
   - Any active transition makes isPending() true

3. **Perfect for search/filter UIs**
   - Input stays responsive
   - Old results visible while computing
   - Loading indicator available

4. **Optimistic updates pattern**
   - Show immediate feedback
   - Revert if needed
   - Great UX

5. **Performance isn't automatic**
   - Only helps with expensive operations
   - Overhead for trivial updates
   - Measure and optimize

## Exercise Preview

You'll build:
1. Complete useTransition implementation
2. Search UI with transitions
3. Optimistic update system
4. Loading state patterns

## Summary

- `useTransition` returns `[isPending, start]`
- `isPending` is a global signal
- Set `true` when transition starts
- Set `false` when transition commits
- Perfect for search, filter, and async UIs
- Show loading states for better UX
- Handle errors gracefully

## Next Lesson

**Lesson 4: Concurrent Patterns** - Advanced patterns for handling concurrent updates and race conditions.

## References

- Solid.js source: `packages/solid/src/reactive/signal.ts`
- Lines: 1152-1160 (useTransition)
- Lines: 1300-1380 (completeUpdates with pending state)
