# Step 6: Effect Scheduling & Multi-Queue System

## 🎯 Goal
Implement Solid.js's complete scheduling system with multi-queue processing, priority handling, and the MessageChannel-based scheduler integration.

## 🚨 Critical Understanding

**This lesson is the foundation** for understanding:
- How Solid.js ensures glitch-free updates
- Why memos always compute before effects
- How transitions work non-blocking
- How Suspense schedules updates

**Without this, you won't understand:** Lessons 7 (Memos), 9 (Transitions), or 10 (Error Handling)

---

## 🤔 The Problem: Your Current Implementation

### What You Probably Have

```javascript
// Single queue, mixed execution
const currentBatchEffects = new Set();

function writeSignal(signal, value) {
  signal.value = value;
  
  // Add all subscribers to queue
  for (const subscriber of signal.subscribers) {
    currentBatchEffects.add(subscriber);
  }
}

function flushEffects() {
  // Execute in random order!
  for (const effect of currentBatchEffects) {
    effect.execute(); // Memo or effect? Who knows!
  }
  currentBatchEffects.clear();
}
```

### The Problems

1. **❌ No Priority System**
   - Memos and effects mixed together
   - Random execution order
   - Race conditions

2. **❌ No Glitch Prevention**
   - Effects might run before memos finish
   - Diamond dependency problem
   - Inconsistent state reads

3. **❌ No Re-entrancy Handling**
   - Nested updates cause chaos
   - Can't handle effect-triggered updates
   - Stack overflow risks

4. **❌ No Scheduler Integration**
   - Everything is synchronous
   - Blocks UI thread
   - No way to defer work

---

## 📊 Solid.js Architecture: The Real System

### The Complete Queue System

```typescript
/**
 * Global state for scheduling
 */

// Queue for pure computations (memos)
let Updates: Computation<any>[] | null = null;

// Queue for side effects (effects)
let Effects: Computation<any>[] | null = null;

// Execution counter for staleness detection
let ExecCount = 0;

// Current effect runner (can be swapped)
let runEffects: typeof runQueue = runQueue;

// External scheduler integration
let Scheduler: ((fn: () => void) => any) | null = null;

// Transition state (concurrent mode)
let Transition: TransitionState | null = null;
```

### The Flow

```
Signal Update
     ↓
┌─────────────────────────────────────┐
│ 1. writeSignal()                    │
│    - Update value                   │
│    - Mark observers STALE           │
│    - Route to queues by pure flag   │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ 2. runUpdates()                     │
│    - Initialize queues              │
│    - Run provided function          │
│    - Call completeUpdates()         │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ 3. completeUpdates()                │
│    ┌─────────────────────────────┐  │
│    │ Phase A: Flush Updates      │  │
│    │ - runQueue(Updates)         │  │
│    │ - All memos compute         │  │
│    │ - Updates = null            │  │
│    └─────────────────────────────┘  │
│               ↓                      │
│    ┌─────────────────────────────┐  │
│    │ Phase B: Flush Effects      │  │
│    │ - runEffects(Effects)       │  │
│    │ - Render effects first      │  │
│    │ - User effects second       │  │
│    │ - Effects = null            │  │
│    └─────────────────────────────┘  │
└─────────────────────────────────────┘
               ↓
            Done!
```

---

## 🏗️ Complete Implementation

### Part 1: Global State Setup

```typescript
// reactive-scheduler.ts

import type { Computation, SignalState, Memo } from './reactive-types';

/**
 * Queue for pure computations (memos)
 * These MUST complete before effects run
 */
export let Updates: Computation<any>[] | null = null;

/**
 * Queue for side effects
 * Run after Updates to see stable derived values
 */
export let Effects: Computation<any>[] | null = null;

/**
 * Execution counter - incremented on each update cycle
 * Used to detect stale computations
 */
export let ExecCount = 0;

/**
 * Effect runner function - can be swapped for different behaviors
 * Default: runQueue (simple queue processing)
 * Can be: runUserEffects (render before user effects)
 */
let runEffects: (queue: Computation<any>[]) => void = runQueue;

/**
 * External scheduler function
 * Allows integration with React Scheduler, etc.
 */
export let Scheduler: ((fn: () => void) => any) | null = null;

/**
 * Current transition state (for concurrent mode)
 */
export let Transition: TransitionState | null = null;
```

### Part 2: Core Scheduling Functions

#### runUpdates() - The Heart of Scheduling

```typescript
/**
 * Core update cycle - manages queue lifecycle
 * 
 * @param fn - Function to run within update context
 * @param init - Is this initializing (first run)?
 * @returns Result of fn()
 * 
 * Critical behaviors:
 * 1. Prevents nested queue initialization (re-entrancy)
 * 2. Sets up both queues if needed
 * 3. Increments ExecCount for staleness detection
 * 4. Ensures completeUpdates() always called
 */
export function runUpdates<T>(fn: () => T, init: boolean): T {
  // Re-entrancy protection: Already in update cycle?
  if (Updates) {
    // Yes - just run the function, don't nest queues
    return fn();
  }
  
  let wait = false;
  
  // Initialize Updates queue if not initializing
  if (!init) Updates = [];
  
  // Initialize Effects queue or mark to wait
  if (Effects) {
    // Effects queue already exists - we're nested
    // Don't touch it, just mark to skip final flush
    wait = true;
  } else {
    // Create new Effects queue
    Effects = [];
  }
  
  // Increment execution counter
  // Used by computations to detect staleness
  ExecCount++;
  
  try {
    // Run the provided function
    // This typically calls writeSignal()
    const res = fn();
    
    // Flush queues
    completeUpdates(wait);
    
    return res;
  } catch (err) {
    // Error handling
    if (!wait) Effects = null;
    Updates = null;
    handleError(err);
    throw err;
  }
}
```

#### completeUpdates() - Process Both Queues

```typescript
/**
 * Completes an update cycle by flushing queues in order
 * 
 * @param wait - Should we skip final effect flush?
 * 
 * Order of operations:
 * 1. Flush Updates (memos) - compute derived values
 * 2. Flush Effects - run side effects with stable values
 * 
 * Critical: Effects ALWAYS see final memo values
 */
export function completeUpdates(wait: boolean): void {
  // Phase 1: Process Updates (memos)
  if (Updates) {
    // Run all pure computations
    runQueue(Updates);
    
    // Clear Updates queue
    Updates = null;
  }
  
  // If waiting (nested), don't flush effects yet
  if (wait) return;
  
  // Phase 2: Process Effects
  const e = Effects!;
  Effects = null;
  
  if (e.length) {
    // CRITICAL: Wrap in new runUpdates
    // This allows effects to trigger new updates
    runUpdates(() => {
      // Use current runEffects strategy
      // Might be runQueue or runUserEffects
      runEffects(e);
    }, false);
  }
}
```

#### runQueue() - Simple Queue Processing

```typescript
/**
 * Simple queue processor - runs computations in order
 * 
 * @param queue - Array of computations to run
 * 
 * Used for:
 * - Updates queue (always)
 * - Effects queue (when no user effects)
 */
export function runQueue(queue: Computation<any>[]): void {
  for (let i = 0; i < queue.length; i++) {
    runTop(queue[i]);
  }
}
```

#### runUserEffects() - Priority Processing

```typescript
/**
 * Advanced queue processor - handles render vs user effects
 * 
 * @param queue - Array of effects (mixed render + user)
 * 
 * Order:
 * 1. Render effects (user: false) - DOM updates, refs
 * 2. User effects (user: true) - side effects, logging
 * 
 * Why: Ensures DOM is stable before user effects run
 */
export function runUserEffects(queue: Computation<any>[]): void {
  let i: number;
  let userLength = 0;
  
  // Phase 1: Run render effects, collect user effects
  for (i = 0; i < queue.length; i++) {
    const e = queue[i];
    
    if (!e.user) {
      // Render effect - run immediately
      runTop(e);
    } else {
      // User effect - defer
      // Compact queue by moving to front
      queue[userLength++] = e;
    }
  }
  
  // Phase 2: Run user effects
  // Queue[0...userLength-1] now contains only user effects
  for (i = 0; i < userLength; i++) {
    runTop(queue[i]);
  }
}
```

---

### Part 3: Signal Write Integration

#### writeSignal() - Route to Queues

```typescript
/**
 * Updates a signal and schedules dependent computations
 * 
 * @param node - SignalState to update
 * @param value - New value
 * @returns The new value
 * 
 * Critical: Routes computations to correct queue by pure flag
 */
export function writeSignal<T>(
  node: SignalState<T>,
  value: T
): T {
  const runningTransition = Transition && Transition.running;
  
  // In transition? Update tValue instead
  if (runningTransition && Transition.sources.has(node)) {
    node.tValue = value;
  }
  
  // Check if value actually changed
  if (!node.comparator || !node.comparator(node.value, value)) {
    // Handle transition state
    if (runningTransition) {
      // In transition - mark but don't update yet
      if (!node.tValue) node.tValue = node.value;
      node.value = value;
    } else {
      // Normal update
      node.value = value;
    }
    
    // Schedule observers
    if (node.observers && node.observers.length) {
      runUpdates(() => {
        // Mark all observers
        for (let i = 0; i < node.observers!.length; i++) {
          const o = node.observers![i];
          const TransitionRunning = runningTransition && Transition.running;
          
          // Check if already marked
          if (TransitionRunning ? !o.tState : !o.state) {
            // Mark as STALE
            if (TransitionRunning) {
              o.tState = STALE;
            } else {
              o.state = STALE;
            }
            
            // ★ CRITICAL: Route by pure flag
            if (o.pure) {
              // Pure computation (memo) → Updates queue
              Updates!.push(o);
            } else {
              // Side effect → Effects queue
              Effects!.push(o);
            }
            
            // If this is a memo, mark its observers too
            if ((o as Memo<any>).observers) {
              markDownstream(o as Memo<any>);
            }
          }
        }
      }, false);
    }
  }
  
  return value;
}
```

#### markDownstream() - Cascade Marking

```typescript
/**
 * Marks downstream computations as PENDING
 * 
 * @param node - Memo to mark downstream from
 * 
 * Why PENDING not STALE:
 * - PENDING means "upstream is STALE, wait for it"
 * - Prevents premature recomputation
 * - Ensures topological order
 */
function markDownstream(node: Memo<any>): void {
  const runningTransition = Transition && Transition.running;
  
  for (let i = 0; i < node.observers!.length; i++) {
    const o = node.observers![i];
    
    // Only mark if not already marked
    if (runningTransition ? !o.tState : !o.state) {
      // Mark as PENDING (not STALE!)
      if (runningTransition) {
        o.tState = PENDING;
      } else {
        o.state = PENDING;
      }
      
      // Add to appropriate queue
      if (o.pure) {
        Updates!.push(o);
      } else {
        Effects!.push(o);
      }
      
      // Recursively mark downstream
      if ((o as Memo<any>).observers) {
        markDownstream(o as Memo<any>);
      }
    }
  }
}
```

---

### Part 4: Effect Creation Functions

```typescript
/**
 * Creates a computed effect (runs in Updates queue)
 * 
 * Characteristics:
 * - pure: true
 * - Runs before render effects
 * - Can have observers
 * - No side effects
 */
export function createComputed<Next>(
  fn: EffectFunction<undefined | NoInfer<Next>, Next>,
  value?: undefined,
  options?: EffectOptions
): void {
  const c = createComputation(
    fn,
    value!,
    true,  // pure = true → Updates queue
    STALE,
    options
  );
  
  // Run immediately
  updateComputation(c);
}

/**
 * Creates a render effect (runs in Effects queue)
 * 
 * Characteristics:
 * - pure: false
 * - user: false
 * - Runs before user effects
 * - DOM manipulation, refs
 */
export function createRenderEffect<Next>(
  fn: EffectFunction<undefined | NoInfer<Next>, Next>,
  value?: undefined,
  options?: EffectOptions
): void {
  const c = createComputation(
    fn,
    value!,
    false, // pure = false → Effects queue
    STALE,
    options
  );
  // user field defaults to false
  
  // Run immediately
  updateComputation(c);
}

/**
 * Creates a user effect (runs in Effects queue, after render)
 * 
 * Characteristics:
 * - pure: false
 * - user: true
 * - Runs after render effects
 * - Side effects, logging, analytics
 */
export function createEffect<Next>(
  fn: EffectFunction<undefined | NoInfer<Next>, Next>,
  value?: undefined,
  options?: EffectOptions
): void {
  // Switch to user effect runner
  runEffects = runUserEffects;
  
  const c = createComputation(
    fn,
    value!,
    false, // pure = false → Effects queue
    STALE,
    options
  );
  
  // Mark as user effect
  c.user = true;
  
  // Add to Effects queue or run immediately
  if (Effects) {
    Effects.push(c);
  } else {
    updateComputation(c);
  }
}
```

---

## 🎨 Complete Execution Examples

### Example 1: Basic Queue Processing

```typescript
const [firstName, setFirstName] = createSignal("John");
const [lastName, setLastName] = createSignal("Doe");

// Memo (Updates queue)
const fullName = createMemo(() => {
  console.log("Computing fullName");
  return `${firstName()} ${lastName()}`;
});

// Effect (Effects queue)
createEffect(() => {
  console.log("Effect sees:", fullName());
});

// Update both
batch(() => {
  setFirstName("Jane");
  setLastName("Smith");
});

/* Execution Flow:
╔═══════════════════════════════════════╗
║ 1. setFirstName("Jane")               ║
║    - firstName.value = "Jane"         ║
║    - fullName marked STALE            ║
║    - fullName added to Updates        ║
║    - effect marked STALE              ║
║    - effect added to Effects          ║
╠═══════════════════════════════════════╣
║ 2. setLastName("Smith")               ║
║    - lastName.value = "Smith"         ║
║    - fullName already in Updates      ║
║    - effect already in Effects        ║
╠═══════════════════════════════════════╣
║ 3. batch() completes                  ║
║    - completeUpdates() called         ║
╠═══════════════════════════════════════╣
║ 4. Flush Updates                      ║
║    - runQueue([fullName])             ║
║    → Logs: "Computing fullName"       ║
║    → fullName.value = "Jane Smith"    ║
║    → fullName.state = CLEAN           ║
╠═══════════════════════════════════════╣
║ 5. Flush Effects                      ║
║    - runEffects([effect])             ║
║    → effect reads fullName()          ║
║    → fullName is CLEAN, returns value ║
║    → Logs: "Effect sees: Jane Smith"  ║
╚═══════════════════════════════════════╝

Output:
  Computing fullName
  Effect sees: Jane Smith

Guarantee: Effect ALWAYS sees final value!
*/
```

### Example 2: Diamond Dependency

```typescript
//       signal
//        ↙  ↘
//      left right (memos)
//        ↘  ↙
//       effect

const [signal, setSignal] = createSignal(1);

const left = createMemo(() => {
  console.log("Computing left");
  return signal() * 2;
});

const right = createMemo(() => {
  console.log("Computing right");
  return signal() * 3;
});

createEffect(() => {
  console.log("Effect:", left() + right());
});

setSignal(5);

/* Execution Flow:
╔═══════════════════════════════════════╗
║ 1. setSignal(5)                       ║
║    Updates: [left, right]             ║
║    Effects: [effect]                  ║
╠═══════════════════════════════════════╣
║ 2. Flush Updates                      ║
║    - runTop(left)                     ║
║      → Logs: "Computing left"         ║
║      → left.value = 10                ║
║    - runTop(right)                    ║
║      → Logs: "Computing right"        ║
║      → right.value = 15               ║
╠═══════════════════════════════════════╣
║ 3. Flush Effects                      ║
║    - runTop(effect)                   ║
║      → Reads left() = 10              ║
║      → Reads right() = 15             ║
║      → Logs: "Effect: 25"             ║
╚═══════════════════════════════════════╝

Output:
  Computing left
  Computing right
  Effect: 25

No glitches! Effect sees both memos updated.
*/
```

### Example 3: Render vs User Effects

```typescript
const [count, setCount] = createSignal(0);

const doubled = createMemo(() => {
  console.log("1. Computing memo");
  return count() * 2;
});

// Render effect (user: false)
createRenderEffect(() => {
  console.log("2. Render effect:", doubled());
  // DOM manipulation happens here
  document.title = `Count: ${doubled()}`;
});

// User effect (user: true)
createEffect(() => {
  console.log("3. User effect:", doubled());
  // Side effects happen here
  localStorage.setItem("count", doubled().toString());
});

setCount(5);

/* Execution Flow:
╔═══════════════════════════════════════╗
║ Updates: [doubled]                    ║
║ Effects: [renderEffect, userEffect]   ║
╠═══════════════════════════════════════╣
║ 1. Flush Updates                      ║
║    → Logs: "1. Computing memo"        ║
║    → doubled = 10                     ║
╠═══════════════════════════════════════╣
║ 2. Flush Effects (runUserEffects)    ║
║    Phase A: Render effects            ║
║    → Logs: "2. Render effect: 10"     ║
║    → document.title updated           ║
║                                       ║
║    Phase B: User effects              ║
║    → Logs: "3. User effect: 10"       ║
║    → localStorage updated             ║
╚═══════════════════════════════════════╝

Output:
  1. Computing memo
  2. Render effect: 10
  3. User effect: 10

Order guaranteed: Memo → Render → User
*/
```

### Example 4: Re-entrant Updates

```typescript
const [outer, setOuter] = createSignal(0);
const [inner, setInner] = createSignal(0);

createEffect(() => {
  console.log("Outer effect:", outer());
  
  if (outer() > 0) {
    // Re-entrant update!
    setInner(outer() * 2);
  }
});

createEffect(() => {
  console.log("Inner effect:", inner());
});

setOuter(5);

/* Execution Flow:
╔═══════════════════════════════════════╗
║ Cycle 1: setOuter(5)                  ║
╠═══════════════════════════════════════╣
║ Effects: [outerEffect, innerEffect]   ║
╠═══════════════════════════════════════╣
║ 1. Run outerEffect                    ║
║    → Logs: "Outer effect: 5"          ║
║    → Calls setInner(10)               ║
║      → runUpdates() called            ║
║      → Updates already exists!        ║
║      → Just marks innerEffect STALE   ║
║      → Returns immediately            ║
║    → outerEffect completes            ║
╠═══════════════════════════════════════╣
║ 2. Run innerEffect                    ║
║    → state = STALE (from setInner)    ║
║    → Recomputes                       ║
║    → Logs: "Inner effect: 10"         ║
╚═══════════════════════════════════════╝

Output:
  Outer effect: 5
  Inner effect: 10

Re-entrancy handled! No nested queue flush.
*/
```

---

## 🔄 Integration with scheduler.ts

### The External Scheduler

Solid.js can integrate with React's scheduler for advanced features:

```typescript
// From scheduler.ts

/**
 * Task scheduling with MessageChannel
 * Allows yielding to browser for responsiveness
 */
export interface Task {
  id: number;
  fn: ((didTimeout: boolean) => void) | null;
  startTime: number;
  expirationTime: number;
}

/**
 * Schedule a callback with priority
 * 
 * @param fn - Function to schedule
 * @param options - Timeout for priority
 * @returns Task handle for cancellation
 */
export function requestCallback(
  fn: () => void,
  options?: { timeout: number }
): Task {
  // Uses MessageChannel for scheduling
  // Binary search insertion for priority queue
  // Yields to browser if input pending
  
  // Implementation details in scheduler.ts...
}

/**
 * Cancel a scheduled callback
 */
export function cancelCallback(task: Task): void {
  task.fn = null;
}
```

### Using the Scheduler

```typescript
// Set custom scheduler
export function setScheduler(
  scheduler: (fn: () => void) => any
): void {
  Scheduler = scheduler;
}

// In writeSignal or completeUpdates:
if (Scheduler) {
  // Use custom scheduler
  Scheduler(() => completeUpdates(false));
} else {
  // Synchronous execution
  completeUpdates(false);
}
```

---

## ✅ Complete Implementation Checklist

### Phase 1: Core Scheduling (2-3 hours)
- [ ] Add global state (Updates, Effects, ExecCount)
- [ ] Implement `runUpdates()` with re-entrancy protection
- [ ] Implement `completeUpdates()` with two-phase flush
- [ ] Implement `runQueue()` for simple processing
- [ ] Test basic queue ordering

### Phase 2: Advanced Features (2-3 hours)
- [ ] Implement `runUserEffects()` with priority
- [ ] Implement `markDownstream()` for cascading
- [ ] Update `writeSignal()` to route by pure flag
- [ ] Add effect creation functions
- [ ] Test render vs user effect ordering

### Phase 3: Integration (1-2 hours)
- [ ] Add Scheduler integration hooks
- [ ] Add Transition support (prep for lesson 9)
- [ ] Test re-entrant updates
- [ ] Test with diamond dependencies

### Phase 4: Edge Cases (1 hour)
- [ ] Test nested batches
- [ ] Test cascading updates
- [ ] Test effect-triggered updates
- [ ] Performance benchmarks

---

## 🧪 Comprehensive Test Suite

```typescript
describe("Effect Scheduling", () => {
  test("memos before effects", () => {
    const log: string[] = [];
    const [s, setS] = createSignal(1);
    
    const memo = createMemo(() => {
      log.push("memo");
      return s() * 2;
    });
    
    createEffect(() => {
      log.push("effect");
      memo();
    });
    
    log.length = 0;
    setS(2);
    
    expect(log).toEqual(["memo", "effect"]);
  });
  
  test("render before user effects", () => {
    const log: string[] = [];
    const [s, setS] = createSignal(1);
    
    createRenderEffect(() => log.push("render"));
    createEffect(() => log.push("user"));
    
    log.length = 0;
    setS(2);
    
    expect(log).toEqual(["render", "user"]);
  });
  
  test("diamond dependency consistency", () => {
    const [a, setA] = createSignal(1);
    const b = createMemo(() => a() * 2);
    const c = createMemo(() => a() * 3);
    
    let result = 0;
    createEffect(() => {
      result = b() + c();
    });
    
    setA(5);
    expect(result).toBe(25); // 10 + 15
  });
  
  test("re-entrant updates", () => {
    const [outer, setOuter] = createSignal(0);
    const [inner, setInner] = createSignal(0);
    
    createEffect(() => {
      if (outer() > 0) {
        setInner(outer() * 2);
      }
    });
    
    const log: number[] = [];
    createEffect(() => {
      log.push(inner());
    });
    
    setOuter(5);
    expect(log[log.length - 1]).toBe(10);
  });
  
  test("cascading updates", () => {
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(0);
    
    createEffect(() => {
      if (a() > 0) {
        setB(a() * 2);
      }
    });
    
    const log: number[] = [];
    createEffect(() => {
      log.push(b());
    });
    
    setA(5);
    expect(log[log.length - 1]).toBe(10);
  });
});
```

---

## 🎓 Key Takeaways

### 1. **Queue Separation is Critical**
- Updates (memos) MUST complete before Effects
- Ensures glitch-free, consistent reads
- Foundation for all other features

### 2. **Re-entrancy Protection**
- `if (Updates)` check prevents nested queue creation
- Current cycle completes before new one starts
- Prevents stack overflow and chaos

### 3. **Priority System**
- Three levels: Computed → Render → User
- Each level sees stable values from previous
- Clear separation of concerns

### 4. **Integration Points**
- Scheduler for async work
- Transition for concurrent mode
- Error handling for robustness

### 5. **Performance**
- Batching reduces redundant work
- Topological ordering prevents duplicate runs
- ExecCount detects stale computations

---

## 🚀 Next Steps

Continue to:
- **[05-computation-states.md](./05-computation-states.md)** - Now you understand how states integrate with scheduling
- **[07-memo-implementation.md](./07-memo-implementation.md)** - Implement memos that use Updates queue
- **[09-transitions.md](./09-transitions.md)** - Build on scheduling for concurrent mode

---

## 📚 Further Reading

From the source code:
- `signal.ts` - lines 450-550: `runUpdates()` and `completeUpdates()`
- `signal.ts` - lines 300-350: `writeSignal()` queue routing
- `scheduler.ts` - Complete MessageChannel implementation

---

**💡 Pro Tip**: Master this lesson before moving on. Everything else builds on this foundation. If something seems unclear, re-read the execution examples - they show exactly how the code flows in practice!
