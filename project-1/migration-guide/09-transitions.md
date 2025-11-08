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
  sources: Set<SignalState<any>>;
  effects: Computation<any>[];
  promises: Set<Promise<any>>;
  disposed: Set<Computation<any>>;
  queue: Set<Computation<any>>;
  scheduler?: (fn: () => void) => unknown;
  running: boolean;
  done?: Promise<void>;
  resolve?: () => void;
}

let Transition: TransitionState | null = null;
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

## 🚀 Next Step

Continue to **[10-error-handling.md](./10-error-handling.md)** to implement error boundaries and error recovery.

---

**💡 Pro Tip**: Transitions are crucial for responsive UIs. Use them for expensive updates like filtering, sorting, or data fetching!
