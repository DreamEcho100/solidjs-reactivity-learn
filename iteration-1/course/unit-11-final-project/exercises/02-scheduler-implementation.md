# Exercise 2: Implementing the Scheduler

## Objective

Build a priority-based task scheduler using MessageChannel, following Solid.js's scheduler implementation.

## Prerequisites

- Understanding of event loop and microtasks
- Knowledge of MessageChannel API
- Familiarity with priority queues

## Background

The scheduler is responsible for:
1. Queuing tasks with priorities
2. Yielding to the browser for user input
3. Executing tasks in priority order
4. Handling task cancellation

## Exercise Structure

### Part 1: Task Structure (20 minutes)

Define the task and scheduler state:

```typescript
interface Task {
  id: number;
  fn: ((didTimeout: boolean) => void) | null;
  startTime: number;
  expirationTime: number;
}

let taskIdCounter = 1;
let taskQueue: Task[] = [];
let currentTask: Task | null = null;
let isCallbackScheduled = false;
let isPerformingWork = false;
```

**TODO**: Implement task creation

```typescript
function requestCallback(
  fn: () => void,
  options?: { timeout?: number }
): Task {
  // TODO: Create and queue task
}
```

### Part 2: Priority Queue (45 minutes)

Implement a binary search insertion for the task queue:

```typescript
function enqueue(taskQueue: Task[], task: Task): void {
  // TODO: Insert task in priority order
  // Hint: Use binary search to find insertion point
  // Sort by expirationTime (earlier = higher priority)
}
```

**Requirements**:
1. Maintain sorted order by expirationTime
2. Use binary search for O(log n) insertion
3. Earlier expiration = higher priority

**Test**:
```typescript
const queue: Task[] = [];

enqueue(queue, { id: 1, expirationTime: 100 } as Task);
enqueue(queue, { id: 2, expirationTime: 50 } as Task);
enqueue(queue, { id: 3, expirationTime: 75 } as Task);

// Queue should be: [id:2 (50), id:3 (75), id:1 (100)]
console.log(queue.map(t => t.id)); // [2, 3, 1]
```

### Part 3: MessageChannel Setup (30 minutes)

Set up MessageChannel for scheduling:

```typescript
let scheduleCallback: (() => void) | null = null;
let scheduledCallback: ((initialTime: number) => boolean) | null = null;

function setupScheduler(): void {
  const channel = new MessageChannel();
  const port = channel.port2;
  
  scheduleCallback = () => {
    // TODO: Post message to trigger work
  };
  
  channel.port1.onmessage = () => {
    // TODO: Execute scheduled work
  };
}
```

**Requirements**:
1. Create MessageChannel
2. Set up message handler
3. Implement scheduleCallback
4. Handle errors during execution

### Part 4: Yielding Logic (45 minutes)

Implement yielding to keep UI responsive:

```typescript
let shouldYieldToHost: (() => boolean) | null = null;
let yieldInterval = 5; // ms
let deadline = 0;
let maxYieldInterval = 300; // ms
let maxDeadline = 0;

function setupYielding(): void {
  // TODO: Check for isInputPending support
  if (navigator.scheduling?.isInputPending) {
    shouldYieldToHost = () => {
      // TODO: Implement smart yielding
      // Yield if:
      // 1. Past deadline AND input pending
      // 2. Past max deadline
    };
  } else {
    shouldYieldToHost = () => {
      // TODO: Simple time-based yielding
    };
  }
}
```

**Requirements**:
1. Check current time vs deadline
2. Use isInputPending if available
3. Fallback to time-based yielding
4. Respect max deadline

### Part 5: Work Loop (60 minutes)

Implement the main work execution loop:

```typescript
function workLoop(initialTime: number): boolean {
  let currentTime = initialTime;
  currentTask = taskQueue[0] || null;
  
  while (currentTask !== null) {
    // TODO: Implement work loop
    // 1. Check if we should yield
    // 2. Execute current task
    // 3. Remove completed tasks
    // 4. Move to next task
  }
  
  // Return whether there's more work
  return currentTask !== null;
}
```

**Requirements**:
1. Process tasks in priority order
2. Yield when necessary
3. Update current time
4. Handle task completion
5. Return remaining work status

### Part 6: Task Cancellation (30 minutes)

Implement cancellation:

```typescript
function cancelCallback(task: Task): void {
  // TODO: Cancel task
  // Hint: Set fn to null
}
```

**Requirements**:
1. Mark task as cancelled
2. Don't remove from queue (will be skipped)
3. Handle null fn in work loop

## Complete Solution

```typescript
interface Task {
  id: number;
  fn: ((didTimeout: boolean) => void) | null;
  startTime: number;
  expirationTime: number;
}

let taskIdCounter = 1;
let isCallbackScheduled = false;
let isPerformingWork = false;
let taskQueue: Task[] = [];
let currentTask: Task | null = null;
let shouldYieldToHost: (() => boolean) | null = null;
let yieldInterval = 5;
let deadline = 0;
let maxYieldInterval = 300;
let maxDeadline = 0;
let scheduleCallback: (() => void) | null = null;
let scheduledCallback: ((initialTime: number) => boolean) | null = null;

const maxSigned31BitInt = 1073741823;

function setupScheduler(): void {
  const channel = new MessageChannel();
  const port = channel.port2;
  
  scheduleCallback = () => port.postMessage(null);
  
  channel.port1.onmessage = () => {
    if (scheduledCallback !== null) {
      const currentTime = performance.now();
      deadline = currentTime + yieldInterval;
      maxDeadline = currentTime + maxYieldInterval;
      
      try {
        const hasMoreWork = scheduledCallback(currentTime);
        if (!hasMoreWork) {
          scheduledCallback = null;
        } else {
          port.postMessage(null);
        }
      } catch (error) {
        port.postMessage(null);
        throw error;
      }
    }
  };
  
  if (navigator.scheduling?.isInputPending) {
    shouldYieldToHost = () => {
      const currentTime = performance.now();
      if (currentTime >= deadline) {
        if (navigator.scheduling!.isInputPending!()) {
          return true;
        }
        return currentTime >= maxDeadline;
      }
      return false;
    };
  } else {
    shouldYieldToHost = () => performance.now() >= deadline;
  }
}

function enqueue(taskQueue: Task[], task: Task): void {
  function findIndex(): number {
    let m = 0;
    let n = taskQueue.length - 1;
    
    while (m <= n) {
      const k = (n + m) >> 1;
      const cmp = task.expirationTime - taskQueue[k].expirationTime;
      if (cmp > 0) m = k + 1;
      else if (cmp < 0) n = k - 1;
      else return k;
    }
    return m;
  }
  
  taskQueue.splice(findIndex(), 0, task);
}

export function requestCallback(
  fn: () => void,
  options?: { timeout: number }
): Task {
  if (!scheduleCallback) setupScheduler();
  
  const startTime = performance.now();
  const timeout = options?.timeout ?? maxSigned31BitInt;
  
  const newTask: Task = {
    id: taskIdCounter++,
    fn,
    startTime,
    expirationTime: startTime + timeout
  };
  
  enqueue(taskQueue, newTask);
  
  if (!isCallbackScheduled && !isPerformingWork) {
    isCallbackScheduled = true;
    scheduledCallback = flushWork;
    scheduleCallback!();
  }
  
  return newTask;
}

export function cancelCallback(task: Task): void {
  task.fn = null;
}

function flushWork(initialTime: number): boolean {
  isCallbackScheduled = false;
  isPerformingWork = true;
  
  try {
    return workLoop(initialTime);
  } finally {
    currentTask = null;
    isPerformingWork = false;
  }
}

function workLoop(initialTime: number): boolean {
  let currentTime = initialTime;
  currentTask = taskQueue[0] || null;
  
  while (currentTask !== null) {
    if (
      currentTask.expirationTime > currentTime &&
      shouldYieldToHost!()
    ) {
      break;
    }
    
    const callback = currentTask.fn;
    if (callback !== null) {
      currentTask.fn = null;
      const didUserCallbackTimeout = currentTask.expirationTime <= currentTime;
      callback(didUserCallbackTimeout);
      currentTime = performance.now();
      
      if (currentTask === taskQueue[0]) {
        taskQueue.shift();
      }
    } else {
      taskQueue.shift();
    }
    
    currentTask = taskQueue[0] || null;
  }
  
  return currentTask !== null;
}
```

## Testing Your Scheduler

```typescript
describe('Scheduler', () => {
  test('executes tasks in priority order', (done) => {
    const results: number[] = [];
    
    requestCallback(() => results.push(3), { timeout: 30 });
    requestCallback(() => results.push(1), { timeout: 10 });
    requestCallback(() => results.push(2), { timeout: 20 });
    
    setTimeout(() => {
      expect(results).toEqual([1, 2, 3]);
      done();
    }, 100);
  });
  
  test('cancels tasks', (done) => {
    const results: number[] = [];
    
    const task1 = requestCallback(() => results.push(1));
    const task2 = requestCallback(() => results.push(2));
    
    cancelCallback(task1);
    
    setTimeout(() => {
      expect(results).toEqual([2]);
      done();
    }, 50);
  });
  
  test('yields to browser', (done) => {
    let ran = false;
    
    // Schedule long-running task
    requestCallback(() => {
      const start = performance.now();
      while (performance.now() - start < 10) {
        // Busy wait
      }
      ran = true;
    });
    
    // Should yield after 5ms
    setTimeout(() => {
      expect(ran).toBe(true);
      done();
    }, 20);
  });
});
```

## Performance Benchmarks

Your scheduler should meet these targets:

| Metric | Target |
|--------|--------|
| Task scheduling | < 10μs |
| Priority insertion | < 50μs (100 tasks) |
| Yield check | < 1μs |
| Work loop iteration | < 100μs |

## Bonus Challenges

### Challenge 1: Add Task Priorities

Extend Task with explicit priorities:

```typescript
interface Task {
  id: number;
  fn: ((didTimeout: boolean) => void) | null;
  startTime: number;
  expirationTime: number;
  priority: 'immediate' | 'user-blocking' | 'normal' | 'low' | 'idle';
}

// Map priorities to timeout values
const PRIORITY_TIMEOUTS = {
  immediate: -1, // Run immediately
  'user-blocking': 250,
  normal: 5000,
  low: 10000,
  idle: maxSigned31BitInt
};
```

### Challenge 2: Add Metrics

Track scheduler performance:

```typescript
interface SchedulerMetrics {
  tasksScheduled: number;
  tasksCompleted: number;
  tasksCancelled: number;
  averageExecutionTime: number;
  totalYields: number;
}

function getMetrics(): SchedulerMetrics {
  // TODO: Return current metrics
}
```

### Challenge 3: Implement Deadline Scheduler

Use the Scheduler API if available:

```typescript
if ('scheduler' in window) {
  scheduleCallback = (priority) => {
    scheduler.postTask(() => {
      // Execute work
    }, { priority });
  };
}
```

## Integration with Reactive System

Connect scheduler to reactive updates:

```typescript
function scheduleUpdate(computation: Computation<any>): void {
  const priority = computation.user ? 'normal' : 'user-blocking';
  
  requestCallback(() => {
    updateComputation(computation);
  }, {
    timeout: PRIORITY_TIMEOUTS[priority]
  });
}
```

## Next Steps

After completing this exercise:
- Integrate scheduler with effect system
- Implement batch updates
- Add transition scheduling

---

**Estimated Time**: 3-4 hours  
**Difficulty**: Advanced  
**Prerequisites**: Exercise 1 completed
