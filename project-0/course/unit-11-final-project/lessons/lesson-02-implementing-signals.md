# Lesson 2: Implementing Core Signals

## Introduction

Signals are the foundation of the reactive system. In this lesson, we'll implement a complete signal primitive that matches Solid.js's implementation.

## Signal Structure

### The SignalState Interface

```typescript
interface SignalState<T> {
  // The current value
  value: T;
  
  // Array of computations observing this signal
  observers: Computation<any>[] | null;
  
  // For each observer, the index where this signal appears in their sources array
  observerSlots: number[] | null;
  
  // Custom equality function
  comparator?: (prev: T, next: T) => boolean;
  
  // Transition value (for concurrent rendering)
  tValue?: T;
  
  // Debug name (dev mode only)
  name?: string;
}
```

### Why Bidirectional Tracking?

The `observers` and `observerSlots` arrays create a bidirectional link:

```
Signal                          Computation
┌──────────────┐               ┌──────────────┐
│ observers: [│───────┐        │ sources: [   │
│   comp1,    │       │        │   sig1,      │
│   comp2     │       │        │   sig2       │
│ ]           │       │        │ ]            │
│             │       │        │              │
│observerSlots│       │        │sourceSlots:  │
│   [0, 1]    │       └───────▶│   [0, 0]     │
└──────────────┘                └──────────────┘
```

**Benefits**:
1. **Fast cleanup**: O(1) removal of observer
2. **No memory leaks**: Observers can be removed efficiently
3. **Consistent state**: Both sides stay synchronized

## Implementation: createSignal

```typescript
// Global reactive context
let Listener: Computation<any> | null = null;
let Transition: TransitionState | null = null;

// Default equality check
const equalFn = <T>(a: T, b: T) => a === b;

interface SignalOptions<T> {
  equals?: false | ((prev: T, next: T) => boolean);
  name?: string;
  internal?: boolean;
}

export function createSignal<T>(): Signal<T | undefined>;
export function createSignal<T>(
  value: T,
  options?: SignalOptions<T>
): Signal<T>;
export function createSignal<T>(
  value?: T,
  options?: SignalOptions<T | undefined>
): Signal<T | undefined> {
  // Merge with default options
  const opts = options ? { equals: equalFn, ...options } : { equals: equalFn };
  
  // Create the signal state
  const s: SignalState<T | undefined> = {
    value,
    observers: null,
    observerSlots: null,
    comparator: opts.equals || undefined
  };
  
  // Dev mode: add debug name
  if (IS_DEV && opts.name) {
    s.name = opts.name;
  }
  
  // Create the getter (accessor)
  const read = readSignal.bind(s);
  
  // Create the setter
  const write: Setter<T | undefined> = (nextValue?: unknown) => {
    // Handle function updates: setCount(c => c + 1)
    if (typeof nextValue === 'function') {
      // In transition: use transition value
      if (Transition && Transition.running && Transition.sources.has(s)) {
        nextValue = (nextValue as Function)(s.tValue);
      } else {
        nextValue = (nextValue as Function)(s.value);
      }
    }
    
    return writeSignal(s, nextValue);
  };
  
  return [read, write];
}
```

### Key Points

1. **Overloads**: TypeScript overloads handle optional initial value
2. **Binding**: `readSignal.bind(s)` creates a closure over the signal state
3. **Function updates**: Setters can take functions like React's setState
4. **Transition support**: Uses tValue when in transition

## Implementation: readSignal

```typescript
function readSignal<T>(this: SignalState<T>): T {
  // Are we in a transition?
  const runningTransition = Transition && Transition.running;
  
  // If this is a memo, check if it needs updating
  if ((this as any).sources) {
    const state = runningTransition 
      ? (this as any).tState 
      : (this as any).state;
      
    if (state === STALE) {
      // Recompute the memo
      updateComputation(this as any);
    } else if (state === PENDING) {
      // Check upstream for changes
      const updates = Updates;
      Updates = null;
      runUpdates(() => lookUpstream(this as any), false);
      Updates = updates;
    }
  }
  
  // Track this read if there's a listener
  if (Listener) {
    const sSlot = this.observers ? this.observers.length : 0;
    
    // Add to listener's sources
    if (!Listener.sources) {
      Listener.sources = [this];
      Listener.sourceSlots = [sSlot];
    } else {
      Listener.sources.push(this);
      Listener.sourceSlots!.push(sSlot);
    }
    
    // Add listener to this signal's observers
    if (!this.observers) {
      this.observers = [Listener];
      this.observerSlots = [Listener.sources.length - 1];
    } else {
      this.observers.push(Listener);
      this.observerSlots!.push(Listener.sources.length - 1);
    }
  }
  
  // Return the appropriate value
  if (runningTransition && Transition!.sources.has(this)) {
    return this.tValue!;
  }
  return this.value;
}
```

### Key Points

1. **Memo support**: Checks if this is a memo that needs updating
2. **Tracking**: Adds bidirectional links if there's a Listener
3. **Slots**: Stores indices for O(1) cleanup
4. **Transition value**: Returns tValue during transitions

## Implementation: writeSignal

```typescript
function writeSignal<T>(
  node: SignalState<T>,
  value: T,
  isComp?: boolean
): T {
  // Get current value (transition-aware)
  let current = Transition && Transition.running && Transition.sources.has(node)
    ? node.tValue
    : node.value;
  
  // Check if value actually changed
  if (!node.comparator || !node.comparator(current, value)) {
    // Handle transition
    if (Transition) {
      const TransitionRunning = Transition.running;
      
      if (TransitionRunning || (!isComp && Transition.sources.has(node))) {
        // Track this source in transition
        Transition.sources.add(node);
        node.tValue = value;
      }
      
      if (!TransitionRunning) {
        // Not in transition anymore, update real value
        node.value = value;
      }
    } else {
      // No transition, just update
      node.value = value;
    }
    
    // Notify observers
    if (node.observers && node.observers.length) {
      runUpdates(() => {
        for (let i = 0; i < node.observers!.length; i++) {
          const o = node.observers![i];
          const TransitionRunning = Transition && Transition.running;
          
          // Skip disposed computations in transition
          if (TransitionRunning && Transition!.disposed.has(o)) {
            continue;
          }
          
          // Mark as STALE and queue
          if (TransitionRunning ? !o.tState : !o.state) {
            if (o.pure) {
              Updates!.push(o);
            } else {
              Effects!.push(o);
            }
            
            // Mark downstream if this is a memo
            if ((o as any).observers) {
              markDownstream(o as any);
            }
          }
          
          // Set state
          if (!TransitionRunning) {
            o.state = STALE;
          } else {
            o.tState = STALE;
          }
        }
        
        // Infinite loop protection
        if (Updates!.length > 10e5) {
          Updates = [];
          if (IS_DEV) {
            throw new Error("Potential Infinite Loop Detected.");
          }
          throw new Error();
        }
      }, false);
    }
  }
  
  return value;
}
```

### Key Points

1. **Equality check**: Skip update if value hasn't changed
2. **Transition handling**: Updates tValue during transitions
3. **Observer notification**: Marks all observers as STALE
4. **Queue sorting**: Pure computations (memos) go to Updates, effects to Effects
5. **Downstream marking**: Propagates STALE state through memo chains
6. **Loop detection**: Prevents infinite update cycles

## Helper: markDownstream

```typescript
function markDownstream(node: Memo<any>) {
  const runningTransition = Transition && Transition.running;
  
  for (let i = 0; i < node.observers!.length; i++) {
    const o = node.observers![i];
    
    // Only mark if not already marked
    if (runningTransition ? !o.tState : !o.state) {
      // Set to PENDING
      if (runningTransition) {
        o.tState = PENDING;
      } else {
        o.state = PENDING;
      }
      
      // Queue it
      if (o.pure) {
        Updates!.push(o);
      } else {
        Effects!.push(o);
      }
      
      // Recursively mark downstream
      if ((o as any).observers) {
        markDownstream(o as any);
      }
    }
  }
}
```

### Why PENDING vs STALE?

- **STALE**: Direct dependency changed, must recompute
- **PENDING**: Indirect dependency might have changed, check upstream first

This optimization avoids unnecessary recomputation when intermediate memos don't actually change.

## Complete Example

```typescript
// Create a signal
const [count, setCount] = createSignal(0);

// Create an effect that reads it
createEffect(() => {
  console.log("Count:", count());
});

// Update the signal
setCount(1); // Logs: "Count: 1"
setCount(c => c + 1); // Logs: "Count: 2"
setCount(2); // No log (value hasn't changed)
```

### What happens internally:

1. **createSignal(0)**:
   - Creates SignalState with value: 0
   - Returns [read, write] functions

2. **createEffect(...)**:
   - Creates Computation
   - Sets Listener = computation
   - Runs effect function
   - count() is called:
     - Adds computation to signal.observers
     - Adds signal to computation.sources
   - Restores Listener

3. **setCount(1)**:
   - Calls writeSignal
   - Compares 0 !== 1
   - Updates value to 1
   - Marks computation as STALE
   - Adds computation to Effects queue
   - Schedules flush

4. **Flush happens**:
   - Runs computation
   - Sets Listener = computation
   - Executes effect function
   - Logs "Count: 1"

## Testing Your Implementation

```typescript
import { describe, it, expect } from 'vitest';

describe('createSignal', () => {
  it('creates a signal with initial value', () => {
    const [count] = createSignal(0);
    expect(count()).toBe(0);
  });
  
  it('updates signal value', () => {
    const [count, setCount] = createSignal(0);
    setCount(1);
    expect(count()).toBe(1);
  });
  
  it('supports function updates', () => {
    const [count, setCount] = createSignal(0);
    setCount(c => c + 1);
    expect(count()).toBe(1);
  });
  
  it('respects custom equality', () => {
    let runs = 0;
    const [count, setCount] = createSignal(0, {
      equals: (a, b) => Math.abs(a - b) < 0.01
    });
    
    createEffect(() => {
      count();
      runs++;
    });
    
    setCount(0.005); // Should not trigger
    expect(runs).toBe(1);
    
    setCount(0.02); // Should trigger
    expect(runs).toBe(2);
  });
  
  it('tracks dependencies', () => {
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(2);
    let result = 0;
    
    createEffect(() => {
      result = a() + b();
    });
    
    expect(result).toBe(3);
    setA(10);
    expect(result).toBe(12);
    setB(20);
    expect(result).toBe(30);
  });
  
  it('cleans up dependencies', () => {
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(2);
    let result = 0;
    
    createRoot(dispose => {
      createEffect(() => {
        result = a() + b();
      });
      
      // Dispose the effect
      dispose();
      
      // These should not update result
      setA(10);
      setB(20);
      expect(result).toBe(3); // Still the initial value
    });
  });
});
```

## Performance Considerations

### Memory Usage

Each signal requires:
- Base object: ~48 bytes
- Value: varies
- Arrays (when observed): ~32 bytes each
- **Total (unobserved)**: ~80 bytes
- **Total (observed)**: ~144 bytes

### Time Complexity

- **Read (untracked)**: O(1) - just returns value
- **Read (tracked)**: O(1) - pushes to arrays
- **Write (no observers)**: O(1) - just updates value
- **Write (n observers)**: O(n) - marks each observer
- **Cleanup**: O(n) - removes from n observers

### Optimization Tips

1. **Use comparators wisely**: Custom equality can prevent cascading updates
2. **Batch updates**: Use batch() to update multiple signals
3. **Untrack reads**: Use untrack() when you don't want dependencies
4. **Lazy initialization**: Don't create signals until needed

## Common Mistakes

### 1. Forgetting to Call Signal

```typescript
// Wrong
if (count) { ... }

// Right
if (count()) { ... }
```

### 2. Setting Inside Render

```typescript
// Wrong - creates infinite loop
createEffect(() => {
  setCount(count() + 1);
});

// Right - conditional update
createEffect(() => {
  if (count() < 10) {
    setCount(count() + 1);
  }
});
```

### 3. Capturing Value Instead of Accessor

```typescript
// Wrong - captured is not reactive
const captured = count();
createEffect(() => {
  console.log(captured);
});

// Right - call signal inside effect
createEffect(() => {
  console.log(count());
});
```

## Exercise: Enhance Your Signal

Add these features to your signal implementation:

1. **Derived values**: Make signals callable with an updater
   ```typescript
   setCount(c => c * 2);
   ```

2. **Validation**: Add optional validation function
   ```typescript
   createSignal(0, {
     validate: (v) => v >= 0 || throw new Error("Must be positive")
   });
   ```

3. **History**: Track previous values
   ```typescript
   const [count, setCount, history] = createSignal(0, { history: true });
   console.log(history()); // [0, 1, 2, ...]
   ```

4. **Debugging**: Add signal tracing
   ```typescript
   createSignal(0, {
     name: "counter",
     trace: true // Logs reads and writes
   });
   ```

## Next Steps

Now that you have a solid signal implementation, the next lesson will cover computations (effects and memos).

---

**Next Lesson**: [Implementing Effects and Computations](./lesson-03-implementing-effects.md)
