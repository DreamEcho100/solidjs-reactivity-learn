# Step 9: Transitions - Concurrent Mode

## 🎯 Goal
Implement transitions for non-blocking UI updates that keep your app responsive during expensive state changes.

## 🤔 The Problem: Blocking Updates

```typescript
const [search, setSearch] = createSignal("");
const [items, setItems] = createSignal([]);

// Expensive filtering
const filtered = createMemo(() => {
  return items().filter(item => 
    item.name.includes(search())
  );
});

createEffect(() => {
  render(filtered()); // Blocks UI!
});

// User types in search box
setSearch("a"); // UI freezes while filtering 10,000 items 😱
```

## 🌟 The Solution: Transitions

```typescript
const [search, setSearch] = createSignal("");
const [pending, setPending] = createSignal(false);

// Wrap expensive update in transition
const handleSearch = (value: string) => {
  startTransition(() => {
    setSearch(value); // Non-blocking!
  });
};

// UI stays responsive! Old results show while computing
```

## 📊 How Transitions Work

### Normal Update Flow
```
setSignal(value)
    ↓
signal.value = value  ← Immediate
    ↓
Mark observers STALE
    ↓
Run effects ← BLOCKS until complete
    ↓
UI updates
```

### Transition Update Flow
```
startTransition(() => {
  setSignal(value)
})
    ↓
signal.tValue = value  ← Temporary value
signal.value unchanged ← Old value still visible!
    ↓
Mark observers STALE
    ↓
Schedule (non-blocking) ← Doesn't block!
    ↓
UI stays responsive
    ↓
Later (when idle):
  signal.value = signal.tValue
  Run effects
  UI updates
```

## 🏗️ Implementation

### Step 1: Transition State

```typescript
export interface TransitionState {
  sources: Set<SignalState<any>>;       // Signals updated in transition
  effects: Computation<any>[];          // Effects to run after transition
  promises: Set<Promise<any>>;          // Async operations to wait for
  disposed: Set<Computation<any>>;      // Computations disposed during transition
  queue: Set<Computation<any>>;         // Computations queued for update
  scheduler?: (fn: () => void) => unknown; // Optional scheduler for work
  running: boolean;                     // Is transition currently active?
  done?: Promise<void>;                 // Promise that resolves when done
  resolve?: () => void;                 // Function to resolve done promise
}

let Transition: TransitionState | null = null;
```

### Extended Types for Transitions

Computations and signals need **parallel state** during transitions:

```typescript
export interface Computation<Init, Next extends Init = Init> extends Owner {
  fn: EffectFunction<Init, Next>;
  state: ComputationState;              // Normal state (CLEAN/STALE/PENDING)
  tState?: ComputationState;            // Transition state (parallel tracking)
  sources: SignalState<Next>[] | null;
  sourceSlots: number[] | null;
  value?: Init;
  updatedAt: number | null;
  pure: boolean;
  user?: boolean;
}

export interface SignalState<T> {
  value: T;                              // Current visible value
  tValue?: T;                            // Transition value (what we're moving to)
  observers: Computation<any>[] | null;
  observerSlots: number[] | null;
  comparator?: (prev: T, next: T) => boolean;
}

export interface Memo<Prev, Next = Prev>
  extends SignalState<Next>, Computation<Next> {
  value: Next;
  tOwned?: Computation<Prev | Next, Next>[]; // Owned computations during transition
}
```

### Why Parallel State?

**The Problem:**

```typescript
// Without parallel state:
startTransition(() => {
  setA(5);  // a.value = 5
});

// Outside transition code reads signal:
const value = a(); // Gets 5! Sees new value too early! ❌
```

**The Solution:**

```typescript
// With parallel state:
startTransition(() => {
  setA(5);  // a.tValue = 5, a.value stays unchanged
});

// Outside transition:
const value = a(); // Gets old value ✓

// Inside transition:
startTransition(() => {
  const value = a(); // Gets tValue = 5 ✓
});

// After transition completes:
const value = a(); // Gets value = 5 ✓
```

### State Tracking During Transitions

```
Normal Tracking (No Transition):
┌──────────────┐
│ computation  │
│ state: CLEAN │ ← Single state
│ value: 42    │ ← Single value
└──────────────┘

Transition Tracking:
┌──────────────────────┐
│ computation          │
│ state: CLEAN         │ ← Visible to outside
│ tState: STALE        │ ← Used during transition
│ value: 42            │ ← Visible to outside
│ tValue: 100          │ ← Being computed
│ owned: [comp1]       │ ← Normal children
│ tOwned: [comp2]      │ ← Transition children
└──────────────────────┘
```

### Step 2: startTransition

```typescript
export function startTransition(fn: () => void): Promise<void> {
  // Already in transition? Just run the function
  if (Transition && Transition.running) {
    fn();
    return Transition.done!;
  }
  
  // Store previous transition
  const prevTransition = Transition;
  
  // Create new transition
  let resolve: (() => void) | undefined;
  const done = new Promise<void>(res => (resolve = res));
  
  Transition = {
    sources: new Set(),
    effects: [],
    promises: new Set(),
    disposed: new Set(),
    queue: new Set(),
    running: true,
    done,
    resolve
  };
  
  // Run the function
  const res = fn();
  
  // Schedule completion
  queueMicrotask(() => {
    completeTransition(Transition!);
    Transition = prevTransition;
  });
  
  return done;
}
```

### Step 2.5: How tState Works

**During a transition, the state machine runs in parallel:**

```typescript
// From actual Solid.js code
function readSignal(this: SignalState<any> | Memo<any>): any {
  const runningTransition = Transition && Transition.running;
  
  // Check if this is a memo that needs updating
  if ((this as Memo<any>).sources) {
    // Use tState if in transition, otherwise use state
    const stateToCheck = runningTransition 
      ? (this as Memo<any>).tState 
      : (this as Memo<any>).state;
    
    if (stateToCheck === STALE) {
      updateComputation(this as Memo<any>);
    } else if (stateToCheck === PENDING) {
      lookUpstream(this as Memo<any>);
    }
  }
  
  // ... tracking ...
  
  // Return tValue if in transition and available
  return runningTransition && this.tValue !== undefined
    ? this.tValue
    : this.value;
}
```

**State Machine Flow During Transition:**

```
Outside Transition:
  signal.state = CLEAN
  computation.state = CLEAN

startTransition(() => {
  setSignal(value);
  
  // Updates tState, not state
  signal.tValue = value
  computation.tState = STALE  ← Marked for transition update
  computation.state = CLEAN   ← Still appears clean outside!
});

Later (when scheduled):
  // Update using tState
  if (computation.tState === STALE) {
    updateComputation(computation);
  }
  
  // After update:
  computation.value = newValue
  computation.tState = 0 (CLEAN)
  computation.state = 0 (CLEAN)
```

**Why This Matters:**

```typescript
const [a, setA] = createSignal(1);
const doubled = createMemo(() => {
  console.log("Computing doubled");
  return a() * 2;
});

createEffect(() => {
  console.log("Effect sees:", doubled());
});

// Normal update:
setA(5);
// Logs immediately:
// Computing doubled
// Effect sees: 10

// Transition update:
startTransition(() => {
  setA(5);
});
// Effect still sees old value (2)!
// Computing and Effect logs happen later, scheduled
```

### Step 3: Update writeSignal for Transitions

```typescript
export function writeSignal(node: SignalState<any>, value: any, isComp?: boolean): any {
  if (typeof value === "function") {
    value = value(node.value);
  }
  
  if (!node.comparator || !node.comparator(node.value, value)) {
    // In a transition?
    if (Transition && Transition.running && !isComp) {
      // Store temporary value
      node.tValue = value;
      
      // Track this signal
      if (!Transition.sources.has(node)) {
        Transition.sources.add(node);
      }
      
      // Don't update real value yet!
    } else {
      // Normal update
      node.value = value;
    }
    
    if (node.observers && node.observers.length) {
      runUpdates(() => {
        for (let i = 0; i < node.observers!.length; i++) {
          const o = node.observers![i];
          
          if (Transition && Transition.running) {
            // Queue for transition
            Transition.queue.add(o);
          } else {
            // Normal queueing
            if (!o.state) {
              if (o.pure) Updates!.push(o);
              else Effects!.push(o);
              
              if ((o as Memo<any>).observers) {
                markDownstream(o as Memo<any>);
              }
            }
          }
          
          o.state = STALE;
        }
      }, false);
    }
  }
  
  return value;
}
```

### Step 4: Update readSignal for Transitions

```typescript
export function readSignal(this: SignalState<any> | Memo<any>): any {
  // Check if this is a memo that needs updating
  if ((this as Memo<any>).sources && (this as Memo<any>).state) {
    const memo = this as Memo<any>;
    
    if (memo.state === STALE) {
      updateComputation(memo);
    } else if (memo.state === PENDING) {
      const updates = Updates;
      Updates = null;
      runUpdates(() => lookUpstream(memo), false);
      Updates = updates;
    }
  }
  
  // Track dependency
  if (Listener) {
    const sSlot = this.observers ? this.observers.length : 0;
    
    if (!Listener.sources) {
      Listener.sources = [this];
      Listener.sourceSlots = [sSlot];
    } else {
      Listener.sources.push(this);
      Listener.sourceSlots!.push(sSlot);
    }
    
    if (!this.observers) {
      this.observers = [Listener];
      this.observerSlots = [Listener.sources.length - 1];
    } else {
      this.observers.push(Listener);
      this.observerSlots!.push(Listener.sources.length - 1);
    }
  }
  
  // Return transition value if available, otherwise normal value
  return Transition && Transition.running && this.tValue !== undefined
    ? this.tValue
    : this.value;
}
```

### Step 4.5: Understanding tOwned (Transition Ownership)

**The Problem:** Computations created during a transition shouldn't be visible immediately.

```typescript
// Without tOwned:
const [show, setShow] = createSignal(false);

createEffect(() => {
  if (show()) {
    // This creates a computation
    const child = createMemo(() => expensiveCalc());
    // If setShow was in a transition, we don't want this visible yet!
  }
});

startTransition(() => {
  setShow(true); // Creates child immediately - WRONG!
});
```

**The Solution:** Store transition-created children separately:

```typescript
// From actual Solid.js implementation
function createComputation(/*...*/) {
  const comp: Computation<Init, Next> = {
    fn,
    state,
    owned: null,  // Normal children
    // ... other fields
  };
  
  if (Owner) {
    // If in a transition, use tOwned
    if (Transition && Transition.running && (Owner as Memo<any>).pure) {
      ((Owner as Memo<any>).tOwned ??= []).push(comp);
    } else {
      // Normal ownership
      (Owner.owned ??= []).push(comp);
    }
  }
  
  return comp;
}
```

**Cleanup During Transitions:**

```typescript
// From cleanNode implementation
function cleanNode(node: Owner) {
  // Clean transition-owned children first
  if ((node as Memo<any>).tOwned) {
    for (let i = (node as Memo<any>).tOwned!.length - 1; i >= 0; i--) {
      cleanNode((node as Memo<any>).tOwned![i]);
    }
    delete (node as Memo<any>).tOwned;
  }
  
  // If in a transition and this is pure, reset it
  if (Transition && Transition.running && (node as Memo<any>).pure) {
    reset(node as Computation<any>, true);
  } else if (node.owned) {
    // Clean normal children
    for (let i = node.owned.length - 1; i >= 0; i--) {
      cleanNode(node.owned[i]);
    }
    node.owned = null;
  }
  
  // ... cleanup functions ...
}
```

**Why This Matters:**

```
Normal Execution:
  parent.owned = [child1, child2]
  └─ All children visible immediately

Transition Execution:
  parent.owned = [child1]      ← Old children
  parent.tOwned = [child2]     ← New children (not visible yet)
  
After Transition Completes:
  parent.owned = [child1, child2]  ← Merged
  parent.tOwned = undefined        ← Removed
```

### Step 5: Complete Transition

```typescript
function completeTransition(t: TransitionState) {
  // Apply all temporary values
  for (const source of t.sources) {
    if (source.tValue !== undefined) {
      source.value = source.tValue;
      delete source.tValue;
    }
  }
  
  // Merge tOwned into owned for all computations
  t.queue.forEach(comp => {
    if ((comp as Memo<any>).tOwned) {
      comp.owned = comp.owned || [];
      comp.owned.push(...(comp as Memo<any>).tOwned!);
      delete (comp as Memo<any>).tOwned;
    }
  });
  
  // Run queued effects
  runUpdates(() => {
    for (const comp of t.queue) {
      if (comp.pure) Updates!.push(comp);
      else Effects!.push(comp);
    }
  }, false);
  
  // Wait for all promises
  if (t.promises.size) {
    Promise.all(t.promises).then(() => {
      t.resolve!();
    });
  } else {
    t.resolve!();
  }
}
```

### Step 6: isPending Helper

```typescript
export function useTransition(): [
  Accessor<boolean>,
  (fn: () => void) => Promise<void>
] {
  const [pending, setPending] = createSignal(false);
  
  const start = (fn: () => void) => {
    setPending(true);
    return startTransition(fn).finally(() => {
      setPending(false);
    });
  };
  
  return [pending, start];
}
```

## 🎨 Usage Examples

### Example 1: Search Filter

```typescript
const [search, setSearch] = createSignal("");
const [items] = createSignal(Array.from({ length: 10000 }, (_, i) => ({
  id: i,
  name: `Item ${i}`
})));

const [isPending, startTransition] = useTransition();

const filtered = createMemo(() => {
  return items().filter(item => 
    item.name.toLowerCase().includes(search().toLowerCase())
  );
});

function handleInput(e: Event) {
  const value = (e.target as HTMLInputElement).value;
  
  // Non-blocking update
  startTransition(() => {
    setSearch(value);
  });
}

createEffect(() => {
  console.log("Filtered count:", filtered().length);
  console.log("Pending:", isPending());
});
```

### Example 2: Tab Switching

```typescript
const [tab, setTab] = createSignal("home");
const [isPending, start] = useTransition();

function switchTab(newTab: string) {
  start(() => {
    setTab(newTab); // Non-blocking
  });
}

createEffect(() => {
  if (isPending()) {
    showSpinner(); // Show loading state
  } else {
    hideSpinner();
  }
  
  renderTab(tab()); // Uses old tab while pending
});
```

### Example 3: Data Fetching

```typescript
const [data, setData] = createSignal(null);
const [isPending, start] = useTransition();

async function fetchData(id: string) {
  start(async () => {
    const response = await fetch(`/api/data/${id}`);
    const json = await response.json();
    setData(json);
  });
}

createEffect(() => {
  if (isPending()) {
    showSkeleton(); // Old data still visible
  } else {
    renderData(data());
  }
});
```

## 🔍 Key Concepts

### Temporary Values (tValue)

```
Signal State During Transition:
{
  value: "old",     ← What's currently rendered
  tValue: "new"     ← What we're transitioning to
}

Reads:
  - Normal code: gets "old"
  - Transition code: gets "new"
  
After transition:
{
  value: "new",     ← Updated
  tValue: undefined ← Removed
}
```

### Update Visibility

```typescript
// Outside transition
const value = signal(); // Gets signal.value

// Inside transition  
startTransition(() => {
  setSignal("new");
  const value = signal(); // Gets signal.tValue = "new"
});

// Outside again (before completion)
const value = signal(); // Still gets signal.value = "old"

// After transition completes
const value = signal(); // Gets signal.value = "new"
```

## ✅ Implementation Checklist

- [ ] Add Transition global state
- [ ] Implement startTransition
- [ ] Update writeSignal for tValue
- [ ] Update readSignal to return tValue in transitions
- [ ] Implement completeTransition
- [ ] Add useTransition hook
- [ ] Test with expensive updates
- [ ] Verify UI stays responsive

## 🧪 Testing

```typescript
test("transitions keep old values visible", () => {
  const [s, setS] = createSignal("old");
  
  let value = "";
  createEffect(() => {
    value = s();
  });
  
  expect(value).toBe("old");
  
  startTransition(() => {
    setS("new");
    // Inside transition, signal still shows "old" to effects
  });
  
  expect(value).toBe("old"); // Still old!
  
  // After microtask, transition completes
  await Promise.resolve();
  expect(value).toBe("new"); // Now new!
});

test("isPending reflects transition state", async () => {
  const [isPending, start] = useTransition();
  
  expect(isPending()).toBe(false);
  
  start(() => {
    expect(isPending()).toBe(true);
  });
  
  await Promise.resolve();
  expect(isPending()).toBe(false);
});
```

## 🎓 Complete Example: Parallel State Machine

Let's trace through a complete transition to see how tValue, tState, and tOwned work together:

```typescript
console.log("=== Transition Deep Dive ===\n");

const [count, setCount] = createSignal(0, { name: "count" });

const doubled = createMemo(() => {
  console.log(`  [Memo] Computing doubled: ${count()} * 2`);
  return count() * 2;
}, undefined, { name: "doubled" });

createEffect(() => {
  console.log(`  [Effect] Sees doubled = ${doubled()}`);
});

console.log("\n--- Initial State ---");
console.log("count:", { value: count(), state: "CLEAN" });
console.log("doubled:", { value: doubled(), state: "CLEAN" });

console.log("\n--- Start Transition ---");
startTransition(() => {
  console.log("Inside transition block...");
  setCount(5);
  console.log("  count.tValue = 5");
  console.log("  count.value still = 0 (visible outside)");
  console.log("  doubled.tState = STALE");
  console.log("  doubled.state still = CLEAN (visible outside)");
});

console.log("\n--- During Transition (outside block) ---");
console.log("count() =", count()); // Still 0!
console.log("doubled() =", doubled()); // Still 0!
console.log("Effect hasn't re-run yet");

console.log("\n--- After Microtask (transition completes) ---");
await Promise.resolve();
console.log("count.value = 5 (tValue applied)");
console.log("doubled recomputed with new value");
console.log("Effect runs with final value");
console.log("count() =", count()); // Now 5
console.log("doubled() =", doubled()); // Now 10

/* Expected Output:
=== Transition Deep Dive ===

  [Memo] Computing doubled: 0 * 2
  [Effect] Sees doubled = 0

--- Initial State ---
count: { value: 0, state: "CLEAN" }
doubled: { value: 0, state: "CLEAN" }

--- Start Transition ---
Inside transition block...
  count.tValue = 5
  count.value still = 0 (visible outside)
  doubled.tState = STALE
  doubled.state still = CLEAN (visible outside)

--- During Transition (outside block) ---
count() = 0
doubled() = 0
Effect hasn't re-run yet

--- After Microtask (transition completes) ---
count.value = 5 (tValue applied)
doubled recomputed with new value
Effect runs with final value
  [Memo] Computing doubled: 5 * 2
  [Effect] Sees doubled = 10
count() = 5
doubled() = 10
*/
```

## 🔬 Debugging Transitions

### Inspect Transition State

```typescript
function debugTransition() {
  if (Transition && Transition.running) {
    console.log("📊 Transition Active:");
    console.log("  Sources:", Array.from(Transition.sources).map(s => ({
      name: s.name,
      value: s.value,
      tValue: s.tValue
    })));
    console.log("  Queue size:", Transition.queue.size);
    console.log("  Promises pending:", Transition.promises.size);
  } else {
    console.log("No active transition");
  }
}

// Use during development
startTransition(() => {
  setSignal(value);
  debugTransition(); // See what's queued
});
```

### Visualize State

```typescript
function visualizeComputation(comp: Computation<any>) {
  const runningTransition = Transition && Transition.running;
  
  console.log({
    name: comp.name,
    state: comp.state === 0 ? "CLEAN" : comp.state === 1 ? "STALE" : "PENDING",
    tState: runningTransition && comp.tState !== undefined
      ? comp.tState === 0 ? "CLEAN" : comp.tState === 1 ? "STALE" : "PENDING"
      : "N/A",
    value: comp.value,
    owned: comp.owned?.length || 0,
    tOwned: (comp as Memo<any>).tOwned?.length || 0
  });
}
```

## 🚀 Next Step

Continue to **[10-error-handling.md](./10-error-handling.md)** to implement error boundaries and error recovery.

---

**💡 Key Takeaways**

1. **tValue** = Temporary signal value during transition
2. **tState** = Parallel state machine (CLEAN/STALE/PENDING) for transition
3. **tOwned** = Children created during transition (not visible yet)
4. **Scheduler Integration** = Uses task scheduler to break up work
5. **Promise Tracking** = Waits for async operations before completing

**When to Use Transitions:**
- ✅ Expensive filtering/sorting (search results)
- ✅ Tab switching with heavy content
- ✅ Data fetching with loading states
- ✅ Large list rendering
- ❌ Critical immediate updates (form validation)
- ❌ Animations (use CSS or motion library)

**Pro Tip**: Transitions are crucial for responsive UIs. Use them for expensive updates like filtering, sorting, or data fetching!
