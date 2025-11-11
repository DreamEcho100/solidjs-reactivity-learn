# Solid.js Source Code Analysis

## Deep Review of Core Reactive Implementation

Based on analyzing the actual Solid.js source code at commit `a5b51fe200fd59a158410f4008677948fec611d9`:

---

## 1. **signal.ts** - The Core Reactive Engine

### Key Data Structures

#### **SignalState<T>**
```typescript
interface SignalState<T> {
  value: T;                        // Current value
  observers: Computation[] | null; // Who's watching
  observerSlots: number[] | null;  // Indices for O(1) removal
  tValue?: T;                      // Transition value
  comparator?: (prev: T, next: T) => boolean;
}
```

#### **Computation<Init, Next>**
```typescript
interface Computation<Init, Next> {
  fn: EffectFunction<Init, Next>;
  state: 0 | 1 | 2;               // FRESH=0, STALE=1, PENDING=2
  tState?: ComputationState;       // Transition state
  sources: SignalState[] | null;   // Dependencies
  sourceSlots: number[] | null;    // Indices into source.observers
  value?: Init;
  updatedAt: number | null;        // For glitch-free updates
  owned: Computation[] | null;     // Child computations
  owner: Owner | null;             // Parent owner
  context: any | null;             // Context values
  pure: boolean;                   // Can have observers (memo)
  user?: boolean;                  // User effect vs system
  suspense?: SuspenseContextType;
  cleanups: (() => void)[] | null;
}
```

### Critical Global State

```typescript
let Owner: Owner | null = null;           // Current reactive scope
let Listener: Computation | null = null;  // Currently tracking
let Updates: Computation[] | null = null; // Memos to update
let Effects: Computation[] | null = null; // Effects to run
let ExecCount = 0;                        // Execution version
let Transition: TransitionState | null = null;  // Current transition
let Scheduler: ((fn) => any) | null = null;
```

### Core Algorithms

#### **readSignal()** - Dependency Tracking
```typescript
function readSignal() {
  // 1. Check if memo needs update
  if (this.sources && this.state) {
    if (this.state === STALE) updateComputation(this);
    else lookUpstream(this);
  }
  
  // 2. Register dependency (bidirectional)
  if (Listener) {
    const sSlot = this.observers ? this.observers.length : 0;
    
    // Add to signal's observers
    if (!this.observers) {
      this.observers = [Listener];
      this.observerSlots = [Listener.sources.length - 1];
    } else {
      this.observers.push(Listener);
      this.observerSlots.push(Listener.sources.length - 1);
    }
    
    // Add signal to computation's sources
    if (!Listener.sources) {
      Listener.sources = [this];
      Listener.sourceSlots = [sSlot];
    } else {
      Listener.sources.push(this);
      Listener.sourceSlots.push(sSlot);
    }
  }
  
  // 3. Return current or transition value
  return Transition && Transition.sources.has(this) 
    ? this.tValue 
    : this.value;
}
```

#### **writeSignal()** - Update Propagation
```typescript
function writeSignal(node, value, isComp?) {
  // 1. Check if value actually changed
  if (!node.comparator || !node.comparator(current, value)) {
    
    // 2. Handle transitions
    if (Transition) {
      if (Transition.running || Transition.sources.has(node)) {
        Transition.sources.add(node);
        node.tValue = value;
      }
      if (!Transition.running) node.value = value;
    } else {
      node.value = value;
    }
    
    // 3. Mark all observers as STALE
    if (node.observers && node.observers.length) {
      runUpdates(() => {
        for (const o of node.observers) {
          if (!o.state || (Transition && !o.tState)) {
            // Queue for update
            if (o.pure) Updates.push(o);
            else Effects.push(o);
            
            // Cascade if memo has observers
            if (o.observers) markDownstream(o);
          }
          o.state = STALE;
          if (Transition) o.tState = STALE;
        }
      }, false);
    }
  }
  return value;
}
```

#### **lookUpstream()** - Glitch Prevention
```typescript
function lookUpstream(node, ignore?) {
  // Set to checking state
  node.state = 0; // FRESH or PENDING check
  
  // Check each dependency
  for (const source of node.sources) {
    if (source.sources) {
      const state = source.state;
      
      if (state === STALE) {
        // Need to update dependency first
        if (source !== ignore && 
            (!source.updatedAt || source.updatedAt < ExecCount)) {
          runTop(source);
        }
      } else if (state === PENDING) {
        // Recursively check
        lookUpstream(source, ignore);
      }
    }
  }
}
```

#### **runTop()** - Smart Execution
```typescript
function runTop(node) {
  // Skip if fresh
  if (node.state === 0) return;
  if (node.state === PENDING) return lookUpstream(node);
  
  // Build ancestor chain
  const ancestors = [node];
  while ((node = node.owner) && 
         (!node.updatedAt || node.updatedAt < ExecCount)) {
    if (node.state) ancestors.push(node);
  }
  
  // Update from top down
  for (let i = ancestors.length - 1; i >= 0; i--) {
    node = ancestors[i];
    if (node.state === STALE) updateComputation(node);
    else if (node.state === PENDING) lookUpstream(node, ancestors[0]);
  }
}
```

#### **cleanNode()** - O(1) Disposal
```typescript
function cleanNode(node) {
  // 1. Remove from all dependencies
  while (node.sources && node.sources.length) {
    const source = node.sources.pop();
    const index = node.sourceSlots.pop();
    const obs = source.observers;
    
    if (obs && obs.length) {
      // O(1) swap-and-pop removal
      const last = obs.pop();
      const lastSlot = source.observerSlots.pop();
      
      if (index < obs.length) {
        // Swap with last
        last.sourceSlots[lastSlot] = index;
        obs[index] = last;
        source.observerSlots[index] = lastSlot;
      }
    }
  }
  
  // 2. Clean owned computations
  if (node.owned) {
    for (let i = node.owned.length - 1; i >= 0; i--) {
      cleanNode(node.owned[i]);
    }
    node.owned = null;
  }
  
  // 3. Run cleanup functions
  if (node.cleanups) {
    for (let i = node.cleanups.length - 1; i >= 0; i--) {
      node.cleanups[i]();
    }
    node.cleanups = null;
  }
  
  node.state = 0;
}
```

### Transitions System

#### **TransitionState**
```typescript
interface TransitionState {
  sources: Set<SignalState>;      // Modified signals
  effects: Computation[];         // Deferred effects
  promises: Set<Promise>;         // Pending async
  disposed: Set<Computation>;     // Cleaned up
  queue: Set<Computation>;        // Scheduled
  running: boolean;
  done?: Promise<void>;
  resolve?: () => void;
}
```

#### **startTransition()**
```typescript
function startTransition(fn) {
  return Promise.resolve().then(() => {
    const t = Transition = {
      sources: new Set(),
      effects: [],
      promises: new Set(),
      disposed: new Set(),
      queue: new Set(),
      running: true
    };
    
    t.done = new Promise(res => t.resolve = res);
    
    runUpdates(fn, false);
    
    return t.done;
  });
}
```

---

## 2. **array.ts** - Efficient List Reconciliation

### **mapArray()** - The `<For>` Helper

**Key Innovation:** Minimal re-rendering by tracking identity

```typescript
function mapArray(list, mapFn, options) {
  let items = [];
  let mapped = [];
  let disposers = [];
  
  return () => {
    const newItems = list() || [];
    
    // Fast path: empty
    if (newItems.length === 0) {
      dispose(disposers);
      return options.fallback ? [options.fallback()] : [];
    }
    
    // Fast path: fresh create
    if (items.length === 0) {
      mapped = new Array(newItems.length);
      for (let j = 0; j < newItems.length; j++) {
        mapped[j] = createRoot(disposer => {
          disposers[j] = disposer;
          return mapFn(newItems[j], () => j);
        });
      }
      items = newItems.slice();
      return mapped;
    }
    
    // Incremental update with map-based diffing
    
    // 1. Skip common prefix
    let start = 0;
    const end = Math.min(items.length, newItems.length);
    while (start < end && items[start] === newItems[start]) start++;
    
    // 2. Skip common suffix
    let oldEnd = items.length - 1;
    let newEnd = newItems.length - 1;
    while (oldEnd >= start && newEnd >= start && 
           items[oldEnd] === newItems[newEnd]) {
      oldEnd--;
      newEnd--;
    }
    
    // 3. Build index map of remaining items
    const newIndices = new Map();
    const newIndicesNext = new Array(newEnd + 1);
    
    for (let j = newEnd; j >= start; j--) {
      const i = newIndices.get(newItems[j]);
      newIndicesNext[j] = i === undefined ? -1 : i;
      newIndices.set(newItems[j], j);
    }
    
    // 4. Move or remove old items
    for (let i = start; i <= oldEnd; i++) {
      let j = newIndices.get(items[i]);
      if (j !== undefined && j !== -1) {
        // Item moved
        temp[j] = mapped[i];
        j = newIndicesNext[j];
        newIndices.set(items[i], j);
      } else {
        // Item removed
        disposers[i]();
      }
    }
    
    // 5. Create or reuse items
    for (let j = start; j < newItems.length; j++) {
      if (j in temp) {
        mapped[j] = temp[j];
        indexes[j](j); // Update index signal
      } else {
        mapped[j] = createRoot(mapper);
      }
    }
    
    items = newItems.slice();
    return mapped;
  };
}
```

### **indexArray()** - The `<Index>` Helper

**Key Innovation:** Each item is a signal, updates in place

```typescript
function indexArray(list, mapFn, options) {
  let signals = [];
  let mapped = [];
  
  return () => {
    const newItems = list() || [];
    
    for (let i = 0; i < newItems.length; i++) {
      if (i < items.length && items[i] !== newItems[i]) {
        // Update existing signal
        signals[i](() => newItems[i]);
      } else if (i >= items.length) {
        // Create new
        mapped[i] = createRoot(disposer => {
          const [s, set] = createSignal(newItems[i]);
          signals[i] = set;
          return mapFn(s, i);
        });
      }
    }
    
    // Dispose extras
    for (let i = newItems.length; i < items.length; i++) {
      disposers[i]();
    }
    
    items = newItems.slice();
    return mapped.slice(0, newItems.length);
  };
}
```

---

## 3. **scheduler.ts** - Cooperative Scheduling

### Architecture

Uses **MessageChannel** for non-blocking scheduling:

```typescript
const channel = new MessageChannel();
const port = channel.port2;

scheduleCallback = () => port.postMessage(null);

channel.port1.onmessage = () => {
  if (scheduledCallback) {
    const currentTime = performance.now();
    deadline = currentTime + yieldInterval; // 5ms
    maxDeadline = currentTime + maxYieldInterval; // 300ms
    
    const hasMoreWork = scheduledCallback(currentTime);
    if (hasMoreWork) port.postMessage(null);
  }
};
```

### Smart Yielding

```typescript
shouldYieldToHost = () => {
  const currentTime = performance.now();
  
  if (currentTime >= deadline) {
    // Check for pending input
    if (navigator.scheduling?.isInputPending?.()) {
      return true;
    }
    // Or max deadline reached
    return currentTime >= maxDeadline;
  }
  
  return false;
};
```

### Task Queue with Binary Search

```typescript
function enqueue(taskQueue, task) {
  // Binary search for insertion point
  let m = 0, n = taskQueue.length - 1;
  
  while (m <= n) {
    const k = (n + m) >> 1;
    const cmp = task.expirationTime - taskQueue[k].expirationTime;
    
    if (cmp > 0) m = k + 1;
    else if (cmp < 0) n = k - 1;
    else return k;
  }
  
  taskQueue.splice(m, 0, task);
}
```

---

## 4. **observable.ts** - External Integration

### Creating Observables from Signals

```typescript
function observable<T>(input: Accessor<T>): Observable<T> {
  return {
    subscribe(observer) {
      const handler = typeof observer === 'function'
        ? observer
        : observer.next?.bind(observer);
      
      const dispose = createRoot(disposer => {
        createEffect(() => {
          const v = input();
          untrack(() => handler(v));
        });
        return disposer;
      });
      
      return { unsubscribe: dispose };
    },
    
    [Symbol.observable]() {
      return this;
    }
  };
}
```

### Converting Observables to Signals

```typescript
function from<T>(producer, initialValue?) {
  const [s, set] = createSignal(initialValue);
  
  if ('subscribe' in producer) {
    const unsub = producer.subscribe(v => set(() => v));
    onCleanup(() => 
      'unsubscribe' in unsub ? unsub.unsubscribe() : unsub()
    );
  } else {
    const clean = producer(set);
    onCleanup(clean);
  }
  
  return s;
}
```

---

## Key Insights for Course Design

### 1. **Bidirectional Tracking is Critical**
- Signals track observers
- Computations track sources
- Both store slot indices for O(1) operations

### 2. **Three-State Machine Prevents Glitches**
- FRESH (0): Up to date
- STALE (1): Needs update
- PENDING (2): Checking dependencies
- `lookUpstream()` ensures correct ordering

### 3. **Transitions Enable Concurrent Rendering**
- Separate `tValue` and `tState`
- Batch updates in transition
- Commit all at once

### 4. **Scheduler Cooperates with Browser**
- Yields for user input
- Uses priority queue
- Respects frame budgets

### 5. **Array Reconciliation is Sophisticated**
- Map-based diffing
- Prefix/suffix optimization
- Minimal disposals and creations

### 6. **Memory Management is Explicit**
- Swap-and-pop for O(1) removal
- Proper cleanup cascades
- No memory leaks

### 7. **External Integration is First-Class**
- Standard Symbol.observable
- Bidirectional conversion
- Works with RxJS, etc.

---

## Course Adjustment Recommendations

### ✅ **Already Well Covered:**
- Unit 1-2: Core concepts
- Bidirectional tracking
- Ownership model

### 🔧 **Needs More Emphasis:**

1. **Unit 3:** Add more on `updatedAt` and glitch prevention
2. **Unit 4:** Deep dive into MessageChannel scheduling
3. **Unit 5:** Emphasize `tValue`/`tState` pattern more
4. **Unit 6:** Show the map-based diffing algorithm in detail
5. **Unit 7:** Cover hydration with SSR patterns

### 📝 **New Topics to Add:**

1. **ExecCount versioning** - How it prevents duplicate updates
2. **runTop() ancestor chain** - Topological execution order
3. **navigator.scheduling.isInputPending** - Modern browser APIs
4. **Binary search insertion** - Priority queue optimization
5. **DevHooks system** - Building dev tools

---

## Next Steps for Course Content

1. ✅ **Continue Unit 3** with emphasis on:
   - State machine transitions
   - lookUpstream/markDownstream
   - updatedAt versioning

2. Create comprehensive exercises showing:
   - Diamond dependency handling
   - Glitch-free updates
   - Performance profiling

3. Build visual debugging tools:
   - Dependency graph viewer
   - State transition tracer
   - Update propagation visualizer

---

**This analysis confirms the course structure is solid and aligned with actual Solid.js implementation. Ready to continue creating detailed lessons for Units 3-11!**
