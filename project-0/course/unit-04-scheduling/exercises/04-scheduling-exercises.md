# Unit 4: Scheduling - Exercises

## Exercise 4.1: Understanding MessageChannel Scheduling

**Objective:** Understand how MessageChannel enables microtask-like scheduling.

### Part A: Compare Scheduling Mechanisms

```typescript
// Implement different scheduling strategies and compare

function testScheduling() {
  const results: string[] = [];
  
  console.log("1. Start");
  results.push("start");
  
  // setTimeout
  setTimeout(() => {
    console.log("4. setTimeout");
    results.push("setTimeout");
  }, 0);
  
  // Promise microtask
  Promise.resolve().then(() => {
    console.log("3. Promise");
    results.push("promise");
  });
  
  // MessageChannel
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    console.log("5. MessageChannel");
    results.push("messageChannel");
  };
  channel.port2.postMessage(null);
  
  // requestAnimationFrame
  requestAnimationFrame(() => {
    console.log("6. rAF");
    results.push("rAF");
  });
  
  console.log("2. End");
  results.push("end");
  
  // Wait and check order
  setTimeout(() => {
    console.log("Final order:", results);
    // TODO: What's the expected order and why?
  }, 100);
}

testScheduling();

// YOUR ANSWER:
// Expected order: ___________________
// Explanation:
// - Synchronous code runs first: ___
// - Microtasks (Promise) run next: ___
// - Macrotasks run after: ___
// - MessageChannel is a ___ task
// - rAF runs before next paint: ___
```

### Part B: Build a Simple Scheduler

```typescript
// Implement a basic task scheduler using MessageChannel

interface Task {
  id: number;
  fn: () => void;
  priority: number;
}

class SimpleScheduler {
  private queue: Task[] = [];
  private taskId = 0;
  private channel: MessageChannel;
  private isScheduled = false;
  
  constructor() {
    this.channel = new MessageChannel();
    this.channel.port1.onmessage = () => this.flush();
  }
  
  schedule(fn: () => void, priority: number = 0): number {
    const id = this.taskId++;
    const task: Task = { id, fn, priority };
    
    // TODO: Insert task in priority order
    this.insertTask(task);
    
    // TODO: Schedule flush if not already scheduled
    if (!this.isScheduled) {
      this.isScheduled = true;
      this.channel.port2.postMessage(null);
    }
    
    return id;
  }
  
  private insertTask(task: Task) {
    // TODO: Binary search insertion by priority
    // Higher priority = runs first
  }
  
  private flush() {
    this.isScheduled = false;
    
    // TODO: Run all tasks in priority order
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      task.fn();
    }
  }
  
  cancel(id: number) {
    // TODO: Remove task from queue
    const index = this.queue.findIndex(t => t.id === id);
    if (index !== -1) {
      this.queue.splice(index, 1);
    }
  }
}

// Test
const scheduler = new SimpleScheduler();

scheduler.schedule(() => console.log("Low priority"), 1);
scheduler.schedule(() => console.log("High priority"), 10);
scheduler.schedule(() => console.log("Medium priority"), 5);

// Expected output:
// High priority
// Medium priority
// Low priority
```

---

## Exercise 4.2: Yielding to the Browser

**Objective:** Understand when and why to yield to the browser.

### Part A: Long-Running Task

```typescript
// Simulate a long-running computation
function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

// BAD: Blocks the main thread
function computeAllBlocking(inputs: number[]) {
  const results: number[] = [];
  
  for (const input of inputs) {
    results.push(fibonacci(input));
  }
  
  return results;
}

// GOOD: Yields periodically
async function computeAllYielding(inputs: number[]) {
  const results: number[] = [];
  const startTime = performance.now();
  const YIELD_INTERVAL = 50; // ms
  
  for (let i = 0; i < inputs.length; i++) {
    results.push(fibonacci(inputs[i]));
    
    // TODO: Yield if we've been running too long
    if (performance.now() - startTime > YIELD_INTERVAL) {
      // How do we yield?
      // Options:
      // 1. setTimeout(() => {}, 0)
      // 2. await new Promise(resolve => setTimeout(resolve, 0))
      // 3. MessageChannel
      // 4. requestIdleCallback
      
      // Implement yielding here
    }
  }
  
  return results;
}

// Test
const inputs = [30, 31, 32, 33, 34, 35];

console.time("blocking");
const blocked = computeAllBlocking(inputs);
console.timeEnd("blocking");

console.time("yielding");
const yielded = await computeAllYielding(inputs);
console.timeEnd("yielding");

// Question: Which is faster? Which is more responsive?
// Answer: ____________________
```

### Part B: Implement shouldYieldToHost

```typescript
// Implement the yielding logic from Solid's scheduler

function createYieldChecker() {
  const YIELD_INTERVAL = 5; // ms
  const MAX_YIELD_INTERVAL = 300; // ms
  let deadline = 0;
  let maxDeadline = 0;
  
  function resetDeadline() {
    const currentTime = performance.now();
    deadline = currentTime + YIELD_INTERVAL;
    maxDeadline = currentTime + MAX_YIELD_INTERVAL;
  }
  
  function shouldYieldToHost(): boolean {
    const currentTime = performance.now();
    
    if (currentTime >= deadline) {
      // We've exceeded the yield interval
      
      // TODO: Check if there's pending input
      // Use navigator.scheduling.isInputPending() if available
      
      if (navigator.scheduling?.isInputPending?.()) {
        return true; // User is interacting
      }
      
      // No pending input, check max deadline
      return currentTime >= maxDeadline;
    }
    
    return false; // Still have time
  }
  
  return { shouldYieldToHost, resetDeadline };
}

// Test with a work loop
async function workLoop(tasks: (() => void)[]) {
  const { shouldYieldToHost, resetDeadline } = createYieldChecker();
  resetDeadline();
  
  for (const task of tasks) {
    if (shouldYieldToHost()) {
      console.log("Yielding to browser...");
      await new Promise(resolve => setTimeout(resolve, 0));
      resetDeadline();
    }
    
    task();
  }
}

// Generate many tasks
const tasks = Array.from({ length: 1000 }, (_, i) => 
  () => fibonacci(25) // Each task does some work
);

await workLoop(tasks);
```

---

## Exercise 4.3: Effect Scheduling Priorities

**Objective:** Understand the difference between Updates and Effects queues.

### Part A: Queue Separation

```typescript
// Simulate Solid's two-queue system

type Computation = {
  fn: () => void;
  pure: boolean; // true = memo/computed, false = effect
};

const Updates: Computation[] = [];
const Effects: Computation[] = [];

function scheduleComputation(comp: Computation) {
  if (comp.pure) {
    Updates.push(comp);
  } else {
    Effects.push(comp);
  }
}

function flushUpdates() {
  console.log("=== Flushing Updates (memos/computeds) ===");
  while (Updates.length > 0) {
    const comp = Updates.shift()!;
    comp.fn();
  }
  
  console.log("=== Flushing Effects ===");
  while (Effects.length > 0) {
    const comp = Effects.shift()!;
    comp.fn();
  }
}

// Test the order
const [count, setCount] = createSignal(0);

// Memo (pure computation)
const doubled = createMemo(() => {
  console.log("Computing doubled");
  return count() * 2;
});

// Effect (not pure)
createEffect(() => {
  console.log("Effect runs, doubled =", doubled());
});

// Trigger update
console.log("Updating count...");
setCount(5);

// Expected output:
// Updating count...
// === Flushing Updates (memos/computeds) ===
// Computing doubled
// === Flushing Effects ===
// Effect runs, doubled = 10
```

### Part B: Effect Ordering

```typescript
// Understand topological ordering of effects

const [a, setA] = createSignal(1);

const b = createMemo(() => {
  console.log("Computing b");
  return a() * 2;
});

const c = createMemo(() => {
  console.log("Computing c");
  return b() + 1;
});

const d = createMemo(() => {
  console.log("Computing d");
  return b() * 3;
});

const e = createMemo(() => {
  console.log("Computing e");
  return c() + d();
});

createEffect(() => {
  console.log("Final effect:", e());
});

// Question: What order should these compute in?
// Current: a = 1
// After: setA(2)
// 
// Dependency graph:
//       a
//       |
//       b
//      / \
//     c   d
//      \ /
//       e
//
// Expected order: ___________
// Why: ___________
```

---

## Exercise 4.4: Batching and Transactions

**Objective:** Implement batching to optimize updates.

### Part A: Manual Batching

```typescript
// Implement a batch() function

let batchDepth = 0;
let batchedUpdates: Set<() => void> = new Set();

function batch<T>(fn: () => T): T {
  batchDepth++;
  
  try {
    return fn();
  } finally {
    batchDepth--;
    
    if (batchDepth === 0) {
      // Flush all batched updates
      const updates = Array.from(batchedUpdates);
      batchedUpdates.clear();
      
      updates.forEach(update => update());
    }
  }
}

function scheduleUpdate(fn: () => void) {
  if (batchDepth > 0) {
    batchedUpdates.add(fn);
  } else {
    fn();
  }
}

// Test
const [a, setA] = createSignal(0);
const [b, setB] = createSignal(0);
const [c, setC] = createSignal(0);

let effectRuns = 0;

createEffect(() => {
  effectRuns++;
  console.log("Effect:", a() + b() + c());
});

console.log("Initial runs:", effectRuns); // 1

// Without batching
setA(1); // Run 2
setB(2); // Run 3
setC(3); // Run 4

console.log("Without batch:", effectRuns); // 4

// With batching
batch(() => {
  setA(10);
  setB(20);
  setC(30);
}); // Run 5 (only once!)

console.log("With batch:", effectRuns); // 5
```

### Part B: Nested Batching

```typescript
// Test nested batch calls

batch(() => {
  console.log("Outer batch start");
  setA(1);
  
  batch(() => {
    console.log("Inner batch start");
    setB(2);
    console.log("Inner batch end");
  });
  
  setC(3);
  console.log("Outer batch end");
});

console.log("After nested batch");

// Question: When do updates actually run?
// Answer: ___________
```

---

## Exercise 4.5: Scheduler Integration

**Objective:** Integrate scheduling with the reactive system.

### Part A: Deferred Effect Execution

```typescript
// Implement deferred effect execution with scheduler

function createDeferredEffect(fn: () => void) {
  let scheduled = false;
  const channel = new MessageChannel();
  
  channel.port1.onmessage = () => {
    scheduled = false;
    fn();
  };
  
  return () => {
    if (!scheduled) {
      scheduled = true;
      channel.port2.postMessage(null);
    }
  };
}

// Test
const [count, setCount] = createSignal(0);
const runEffect = createDeferredEffect(() => {
  console.log("Deferred effect:", count());
});

// Track changes
createEffect(() => {
  count(); // Track dependency
  runEffect(); // Schedule deferred execution
});

console.log("Before updates");

setCount(1);
setCount(2);
setCount(3);

console.log("After updates (effect hasn't run yet)");

// Wait for MessageChannel
await new Promise(resolve => setTimeout(resolve, 0));

console.log("After MessageChannel flush");
// Expected: "Deferred effect: 3" (only runs once with latest value)
```

### Part B: Priority-Based Scheduling

```typescript
// Implement priority levels for effects

enum Priority {
  Immediate = 0,  // Run synchronously
  High = 1,       // Run in next microtask
  Normal = 2,     // Run in next macrotask
  Low = 3,        // Run when idle
  Idle = 4        // Run during idle time
}

function createPrioritizedEffect(
  fn: () => void,
  priority: Priority = Priority.Normal
) {
  switch (priority) {
    case Priority.Immediate:
      return createEffect(fn);
      
    case Priority.High:
      return createEffect(() => {
        Promise.resolve().then(fn);
      });
      
    case Priority.Normal:
      return createEffect(() => {
        setTimeout(fn, 0);
      });
      
    case Priority.Low:
      return createEffect(() => {
        requestIdleCallback(fn);
      });
      
    case Priority.Idle:
      return createEffect(() => {
        requestIdleCallback(fn, { timeout: 5000 });
      });
  }
}

// Test different priorities
const [data, setData] = createSignal("test");

createPrioritizedEffect(() => {
  console.log("Immediate:", data());
}, Priority.Immediate);

createPrioritizedEffect(() => {
  console.log("High:", data());
}, Priority.High);

createPrioritizedEffect(() => {
  console.log("Normal:", data());
}, Priority.Normal);

setData("updated");

// Expected order:
// 1. Immediate: updated
// 2. High: updated
// 3. Normal: updated
```

---

## Challenge Exercises

### Challenge 1: Build a Complete Scheduler

Implement a production-ready scheduler with:
- Priority queue
- Yielding to browser
- Deadline management
- Cancellation
- Error handling

```typescript
class ProductionScheduler {
  // TODO: Implement all features
  schedule(fn: () => void, options: {
    priority?: number;
    timeout?: number;
  }): { cancel: () => void };
  
  flush(): void;
  shouldYield(): boolean;
}
```

### Challenge 2: Concurrent Mode Simulation

Implement a basic concurrent mode:
- Start a transition
- Allow interruption
- Commit when ready

```typescript
function startTransition(fn: () => void): Promise<void> {
  // TODO: Implement non-blocking updates
}
```

---

## Solutions

Solutions are in `solutions/unit-04-solutions.md`.

## Key Takeaways

1. **MessageChannel** provides immediate, yielding scheduling
2. **Yielding** keeps the UI responsive during long tasks
3. **Two queues** (Updates/Effects) prevent redundant work
4. **Batching** reduces unnecessary updates
5. **Priorities** ensure important work runs first

Next: Unit 5 - Transitions and Suspense!
