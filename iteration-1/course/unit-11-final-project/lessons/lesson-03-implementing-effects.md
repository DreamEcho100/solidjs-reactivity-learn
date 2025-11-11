# Lesson 3: Implementing Effects and Computations

## Introduction

Effects and memos are built on top of the Computation abstraction. Understanding computations is key to implementing the entire reactive system.

## The Computation Structure

```typescript
interface Computation<Init, Next extends Init = Init> {
  // The function to execute
  fn: EffectFunction<Init, Next>;
  
  // Current state: 0 (fresh), STALE (1), or PENDING (2)
  state: ComputationState;
  
  // Transition state (for concurrent rendering)
  tState?: ComputationState;
  
  // Signals this computation reads
  sources: SignalState<any>[] | null;
  
  // Indices in each source's observers array
  sourceSlots: number[] | null;
  
  // Current computed value
  value?: Init;
  
  // Last update timestamp
  updatedAt: number | null;
  
  // Is this a pure computation (memo vs effect)?
  pure: boolean;
  
  // Is this a user-created effect?
  user?: boolean;
  
  // Parent scope
  owner: Owner | null;
  
  // Child scopes
  owned: Computation<any>[] | null;
  
  // Cleanup functions
  cleanups: (() => void)[] | null;
  
  // Context data
  context: any | null;
  
  // For memos: observers of this computation
  observers?: Computation<any>[] | null;
  observerSlots?: number[] | null;
  
  // Suspense context
  suspense?: SuspenseContextType;
}
```

### State Meanings

```typescript
const FRESH = 0;    // Up to date, no need to recompute
const STALE = 1;    // Needs recomputation
const PENDING = 2;  // Might need recomputation, check upstream first
```

## Creating Computations

```typescript
function createComputation<Next, Init = unknown>(
  fn: EffectFunction<Init | Next, Next>,
  init: Init,
  pure: boolean,
  state: ComputationState = STALE,
  options?: EffectOptions
): Computation<Init | Next, Next> {
  const c: Computation<Init | Next, Next> = {
    fn,
    state: state,
    updatedAt: null,
    owned: null,
    sources: null,
    sourceSlots: null,
    cleanups: null,
    value: init,
    owner: Owner,
    context: Owner ? Owner.context : null,
    pure
  };
  
  // Transition support
  if (Transition && Transition.running) {
    c.state = 0;
    c.tState = state;
  }
  
  // Add to owner's owned array
  if (Owner === null) {
    if (IS_DEV) {
      console.warn(
        "computations created outside a `createRoot` or `render` will never be disposed"
      );
    }
  } else if (Owner !== UNOWNED) {
    if (Transition && Transition.running && (Owner as any).pure) {
      // Transition-owned
      if (!(Owner as any).tOwned) {
        (Owner as any).tOwned = [c];
      } else {
        (Owner as any).tOwned!.push(c);
      }
    } else {
      // Normal ownership
      if (!Owner.owned) {
        Owner.owned = [c];
      } else {
        Owner.owned.push(c);
      }
    }
  }
  
  // Dev mode: set debug name
  if (IS_DEV && options?.name) {
    c.name = options.name;
  }
  
  return c;
}
```

### Key Points

1. **Pure flag**: Distinguishes memos (pure=true) from effects (pure=false)
2. **Ownership**: Automatically added to current Owner
3. **Initial state**: Usually STALE to trigger first run
4. **Transition support**: Uses tOwned and tState during transitions

## Running Computations

```typescript
function runComputation<Init, Next extends Init = Init>(
  node: Computation<Init, Next>,
  value: Init,
  time: number
): void {
  let nextValue;
  const owner = Owner;
  const listener = Listener;
  
  // Set context
  Listener = Owner = node;
  
  try {
    // Execute the function
    nextValue = node.fn(value);
  } catch (err) {
    // Handle errors
    if (node.pure) {
      // For memos, mark as stale and clean up
      if (Transition && Transition.running) {
        node.tState = STALE;
        if ((node as any).tOwned) {
          (node as any).tOwned!.forEach(cleanNode);
          (node as any).tOwned = undefined;
        }
      } else {
        node.state = STALE;
        if (node.owned) {
          node.owned.forEach(cleanNode);
          node.owned = null;
        }
      }
    }
    
    // Mark as updated to prevent re-running
    node.updatedAt = time + 1;
    
    // Propagate error
    return handleError(err);
  } finally {
    // Restore context
    Listener = listener;
    Owner = owner;
  }
  
  // Update value if this is the first run or value changed
  if (!node.updatedAt || node.updatedAt <= time) {
    if (node.updatedAt != null && 'observers' in node) {
      // This is a memo, write the signal
      writeSignal(node as any, nextValue, true);
    } else if (Transition && Transition.running && node.pure) {
      // Transition memo
      Transition.sources.add(node as any);
      (node as any).tValue = nextValue;
    } else {
      // Regular effect or first-run memo
      node.value = nextValue;
    }
    
    node.updatedAt = time;
  }
}
```

### Key Points

1. **Context switching**: Sets Owner and Listener to the computation
2. **Error handling**: Cleans up on errors, prevents re-running
3. **Memo vs Effect**: Memos write their value as a signal
4. **Timestamp tracking**: Uses ExecCount to prevent duplicate runs

## Updating Computations

```typescript
function updateComputation(node: Computation<any>): void {
  if (!node.fn) return;
  
  // Clean up old dependencies
  cleanNode(node);
  
  const time = ExecCount;
  
  // Run the computation
  runComputation(
    node,
    Transition && Transition.running && Transition.sources.has(node as any)
      ? (node as any).tValue
      : node.value,
    time
  );
  
  // Handle transition completion
  if (Transition && !Transition.running && Transition.sources.has(node as any)) {
    queueMicrotask(() => {
      runUpdates(() => {
        Transition && (Transition.running = true);
        Listener = Owner = node;
        runComputation(node, (node as any).tValue, time);
        Listener = Owner = null;
      }, false);
    });
  }
}
```

### Key Points

1. **Clean first**: Removes old dependencies before running
2. **Pass current value**: Computations receive their previous value
3. **Transition handling**: Special logic for transition completion

## createEffect

```typescript
export function createEffect<Next>(
  fn: EffectFunction<undefined | Next, Next>
): void;
export function createEffect<Next, Init = Next>(
  fn: EffectFunction<Init | Next, Next>,
  value: Init,
  options?: EffectOptions
): void;
export function createEffect<Next, Init>(
  fn: EffectFunction<Init | Next, Next>,
  value?: Init,
  options?: EffectOptions
): void {
  // Use user effects runner
  runEffects = runUserEffects;
  
  // Create the computation
  const c = createComputation(
    fn,
    value!,
    false, // not pure (it's an effect)
    STALE,
    IS_DEV ? options : undefined
  );
  
  // Get suspense context if available
  const s = SuspenseContext && useContext(SuspenseContext);
  if (s) c.suspense = s;
  
  // Mark as user effect
  c.user = true;
  
  // Queue or run immediately
  if (Effects) {
    Effects.push(c);
  } else {
    updateComputation(c);
  }
}
```

### Key Points

1. **pure = false**: Effects are not pure computations
2. **user = true**: User effects run after render effects
3. **Suspense integration**: Connects to suspense context
4. **Queued execution**: Added to Effects queue

## createComputed

```typescript
export function createComputed<Next>(
  fn: EffectFunction<undefined | Next, Next>
): void;
export function createComputed<Next, Init = Next>(
  fn: EffectFunction<Init | Next, Next>,
  value: Init,
  options?: EffectOptions
): void;
export function createComputed<Next, Init>(
  fn: EffectFunction<Init | Next, Next>,
  value?: Init,
  options?: EffectOptions
): void {
  // Create computation
  const c = createComputation(
    fn,
    value!,
    true, // pure computation
    STALE,
    IS_DEV ? options : undefined
  );
  
  // Run synchronously or queue
  if (Scheduler && Transition && Transition.running) {
    Updates!.push(c);
  } else {
    updateComputation(c);
  }
}
```

### Key Points

1. **pure = true**: Computed are pure (synchronous)
2. **Immediate execution**: Runs immediately unless in transition
3. **Synchronous**: No queuing in Effects

## createRenderEffect

```typescript
export function createRenderEffect<Next>(
  fn: EffectFunction<undefined | Next, Next>
): void;
export function createRenderEffect<Next, Init = Next>(
  fn: EffectFunction<Init | Next, Next>,
  value: Init,
  options?: EffectOptions
): void;
export function createRenderEffect<Next, Init>(
  fn: EffectFunction<Init | Next, Next>,
  value?: Init,
  options?: EffectOptions
): void {
  const c = createComputation(
    fn,
    value!,
    false, // not pure
    STALE,
    IS_DEV ? options : undefined
  );
  
  if (Scheduler && Transition && Transition.running) {
    Updates!.push(c);
  } else {
    updateComputation(c);
  }
}
```

### Key Points

1. **Render timing**: Runs during render phase
2. **Not user**: user flag not set, runs before user effects

## Cleanup System

```typescript
function cleanNode(node: Owner): void {
  let i;
  
  // Clean up sources (dependencies)
  if ((node as Computation<any>).sources) {
    while ((node as Computation<any>).sources!.length) {
      const source = (node as Computation<any>).sources!.pop()!;
      const index = (node as Computation<any>).sourceSlots!.pop()!;
      const obs = source.observers;
      
      if (obs && obs.length) {
        // Swap and pop for O(1) removal
        const n = obs.pop()!;
        const s = source.observerSlots!.pop()!;
        
        if (index < obs.length) {
          n.sourceSlots![s] = index;
          obs[index] = n;
          source.observerSlots![index] = s;
        }
      }
    }
  }
  
  // Clean up transition-owned
  if ((node as any).tOwned) {
    for (i = (node as any).tOwned!.length - 1; i >= 0; i--) {
      cleanNode((node as any).tOwned![i]);
    }
    delete (node as any).tOwned;
  }
  
  // Reset or clean up owned
  if (Transition && Transition.running && (node as Computation<any>).pure) {
    reset(node as Computation<any>, true);
  } else if (node.owned) {
    for (i = node.owned.length - 1; i >= 0; i--) {
      cleanNode(node.owned[i]);
    }
    node.owned = null;
  }
  
  // Run cleanup functions
  if (node.cleanups) {
    for (i = node.cleanups.length - 1; i >= 0; i--) {
      node.cleanups[i]();
    }
    node.cleanups = null;
  }
  
  // Reset state
  if (Transition && Transition.running) {
    (node as Computation<any>).tState = 0;
  } else {
    (node as Computation<any>).state = 0;
  }
}
```

### Why Swap and Pop?

```
Before removal (removing obs[1]):
obs = [comp1, comp2, comp3]
slots = [0, 1, 2]

After swap:
obs = [comp1, comp3]
slots = [0, 1]

comp3.sourceSlots updated: [1] (was [2])
```

This avoids shifting all elements, making removal O(1).

## Complete Example

```typescript
// Create a signal
const [count, setCount] = createSignal(0);

// Create a derived value (memo)
const doubled = createMemo(() => count() * 2);

// Create an effect
createEffect(() => {
  console.log("Doubled:", doubled());
});

// Update
setCount(1); // Logs: "Doubled: 2"
```

### Execution Flow

1. **createMemo()**:
   - Creates computation with pure=true
   - Adds observers/observerSlots to match SignalState
   - Runs immediately to compute initial value

2. **createEffect()**:
   - Creates computation with pure=false, user=true
   - Sets Listener = effect computation
   - Runs effect function
   - doubled() is called:
     - Checks if memo is stale
     - Adds effect to memo.observers
     - Returns current value
   - Logs "Doubled: 0"

3. **setCount(1)**:
   - Writes to count signal
   - Marks doubled memo as STALE
   - Adds doubled to Updates queue
   - Marks effect as STALE (indirectly via memo)
   - Adds effect to Effects queue

4. **Updates flush**:
   - Runs doubled memo first
   - Sets Listener = doubled
   - Executes memo function
   - count() tracks dependency
   - Returns 2
   - Writes 2 to memo's value

5. **Effects flush**:
   - Runs effect
   - Sets Listener = effect
   - Executes effect function
   - doubled() tracks dependency
   - Logs "Doubled: 2"

## Testing Computations

```typescript
describe('createEffect', () => {
  it('runs immediately', () => {
    let ran = false;
    createEffect(() => {
      ran = true;
    });
    expect(ran).toBe(true);
  });
  
  it('tracks dependencies', () => {
    const [count, setCount] = createSignal(0);
    let result = 0;
    
    createEffect(() => {
      result = count();
    });
    
    expect(result).toBe(0);
    setCount(1);
    expect(result).toBe(1);
  });
  
  it('receives previous value', () => {
    const [count, setCount] = createSignal(0);
    const values: number[] = [];
    
    createEffect((prev) => {
      values.push(prev ?? -1, count());
      return count();
    });
    
    setCount(1);
    setCount(2);
    
    expect(values).toEqual([-1, 0, 0, 1, 1, 2]);
  });
  
  it('cleans up on dispose', () => {
    const [count, setCount] = createSignal(0);
    let runs = 0;
    
    const dispose = createRoot((dispose) => {
      createEffect(() => {
        count();
        runs++;
      });
      return dispose;
    });
    
    expect(runs).toBe(1);
    setCount(1);
    expect(runs).toBe(2);
    
    dispose();
    setCount(2);
    expect(runs).toBe(2); // Didn't run again
  });
});
```

## Exercise: Implement createReaction

Create a `createReaction` primitive that gives you manual control over tracking:

```typescript
const reaction = createReaction(() => {
  console.log("Something changed!");
});

// Later, track specific code
reaction(() => {
  console.log(count());
});
```

**Hint**: Use a flag to control when the function runs.

## Next Steps

Next, we'll implement the scheduling system that coordinates all these updates efficiently.

---

**Next Lesson**: [Implementing the Scheduler](./lesson-04-implementing-scheduler.md)
