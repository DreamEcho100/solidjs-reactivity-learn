# Lesson 1: MessageChannel-Based Scheduling

## Table of Contents

1. [Why Scheduling Matters](#why-scheduling-matters)
2. [MessageChannel Architecture](#messagechannel-architecture)
3. [Task Queue Management](#task-queue-management)
4. [Yielding to the Browser](#yielding-to-the-browser)
5. [Priority and Expiration](#priority-and-expiration)
6. [Complete Scheduler Implementation](#complete-scheduler-implementation)
7. [Integration with Reactivity](#integration-with-reactivity)

---

## Why Scheduling Matters

### The Problem: Long-Running Updates

```javascript
const [data, setData] = createSignal([]);

createEffect(() => {
  const items = data();
  
  // Expensive computation blocking the main thread
  for (let i = 0; i < 100000; i++) {
    processItem(items[i]);
  }
});

setData(bigArray); // Browser freezes!
```

### Without Scheduling

```
User clicks button → Signal updates → Effect runs → 5 seconds of blocking
                                                  ↓
                                            UI frozen
                                            No user input
                                            No animations
```

### With Scheduling

```
User clicks button → Signal updates → Schedule work → Return control
                                                    ↓
                                            Browser handles:
                                            - User input
                                            - Animations
                                            - Rendering
                                                    ↓
                                            Run work in chunks
```

---

## MessageChannel Architecture

### Why MessageChannel?

Traditional approaches:
- ❌ `setTimeout(fn, 0)` - Clamped to 4ms minimum
- ❌ `setImmediate` - Not standard, limited browser support
- ❌ `Promise.resolve().then(fn)` - Microtask, can block rendering
- ✅ **MessageChannel** - True task scheduling, not clamped

### Basic MessageChannel

```javascript
const channel = new MessageChannel();
const port1 = channel.port1;
const port2 = channel.port2;

// Send message
port2.postMessage('hello');

// Receive message (async)
port1.onmessage = (event) => {
  console.log(event.data); // 'hello'
};
```

### As a Scheduler

```javascript
const channel = new MessageChannel();
const port = channel.port2;

let scheduledCallback = null;

// Schedule function
function scheduleWork(fn) {
  scheduledCallback = fn;
  port.postMessage(null);
}

// Execute when browser is ready
channel.port1.onmessage = () => {
  if (scheduledCallback) {
    const fn = scheduledCallback;
    scheduledCallback = null;
    fn();
  }
};

// Usage
scheduleWork(() => {
  console.log('Running async!');
});
```

### Why It Works

```
Call stack:          Task queue:
┌────────────┐      ┌────────────┐
│ User event │      │            │
│ setData()  │      │            │
│ schedule() │ ───> │ Scheduled  │
└────────────┘      │   work     │
                    └────────────┘
      ↓                    ↓
Browser processes:    Browser calls:
- Rendering          - port1.onmessage
- Input              - Execute work
- Animations
```

---

## Task Queue Management

### Task Structure

```javascript
interface Task {
  id: number;                  // Unique identifier
  fn: ((didTimeout: boolean) => void) | null;
  startTime: number;           // When task was created
  expirationTime: number;      // When task expires
}
```

### Queue with Binary Search Insertion

```javascript
const taskQueue = [];
let taskIdCounter = 1;

function enqueue(task) {
  // Binary search for insertion point
  let start = 0;
  let end = taskQueue.length - 1;
  
  while (start <= end) {
    const mid = (start + end) >> 1; // Fast floor division by 2
    const comparison = task.expirationTime - taskQueue[mid].expirationTime;
    
    if (comparison > 0) {
      start = mid + 1;
    } else if (comparison < 0) {
      end = mid - 1;
    } else {
      start = mid;
      break;
    }
  }
  
  taskQueue.splice(start, 0, task);
}

function dequeue() {
  return taskQueue.shift();
}
```

### Why Binary Search?

```
Linear insertion: O(n)
┌───┬───┬───┬───┬───┐
│ 1 │ 3 │ 5 │ 7 │ 9 │  Insert 6
└───┴───┴───┴───┴───┘  Check each: 1,3,5,6 (4 comparisons)

Binary insertion: O(log n)
┌───┬───┬───┬───┬───┐
│ 1 │ 3 │ 5 │ 7 │ 9 │  Insert 6
└───┴───┴─▲─┴───┴───┘  Check: 5 (mid) → 7 (right) → found! (2 comparisons)
```

### Creating Tasks

```javascript
function requestCallback(fn, options = {}) {
  const startTime = performance.now();
  const timeout = options.timeout || 5000; // Default 5s
  
  const task = {
    id: taskIdCounter++,
    fn,
    startTime,
    expirationTime: startTime + timeout
  };
  
  enqueue(task);
  
  // Start processing if not already
  if (!isScheduled) {
    scheduleWork();
  }
  
  return task;
}
```

### Cancelling Tasks

```javascript
function cancelCallback(task) {
  // Mark as cancelled
  task.fn = null;
}

// Tasks with null fn are skipped during execution
```

---

## Yielding to the Browser

### The Yield Interval

```javascript
const YIELD_INTERVAL = 5;        // 5ms timeslice
const MAX_YIELD_INTERVAL = 300;  // 300ms absolute max

let deadline = 0;
let maxDeadline = 0;
```

### Time-Based Yielding

```javascript
function shouldYieldToHost() {
  const currentTime = performance.now();
  
  // Simple version: yield after 5ms
  return currentTime >= deadline;
}
```

### Smart Yielding with isInputPending

```javascript
function setupYielding() {
  if (navigator?.scheduling?.isInputPending) {
    // Modern browsers with input detection
    const scheduling = navigator.scheduling;
    
    shouldYieldToHost = () => {
      const currentTime = performance.now();
      
      if (currentTime >= deadline) {
        // Check for pending user input
        if (scheduling.isInputPending()) {
          return true; // Yield immediately for input
        }
        
        // No input, but check max deadline
        return currentTime >= maxDeadline;
      }
      
      return false;
    };
  } else {
    // Fallback: simple time-based
    shouldYieldToHost = () => {
      return performance.now() >= deadline;
    };
  }
}
```

### Why Two Deadlines?

```javascript
// Scenario: Processing 1000 items

// Deadline (5ms):
// ├─ Process items ─┤ Yield ├─ Process ─┤ Yield
//    (responsive)           (responsive)

// Max Deadline (300ms):
// ├────── Process many items ──────┤ Force yield
//         (can delay if no input)

// With input pending:
// ├─ Process ─┤ INPUT! → Immediate yield
```

### Work Loop with Yielding

```javascript
function workLoop(initialTime) {
  let currentTime = initialTime;
  currentTask = taskQueue[0] || null;
  
  while (currentTask !== null) {
    // Check if we should yield
    if (currentTask.expirationTime > currentTime && 
        shouldYieldToHost()) {
      // Task not expired but need to yield
      break;
    }
    
    // Execute task
    const callback = currentTask.fn;
    if (callback !== null) {
      currentTask.fn = null;
      const didTimeout = currentTask.expirationTime <= currentTime;
      callback(didTimeout);
      currentTime = performance.now();
      
      // Remove completed task
      if (currentTask === taskQueue[0]) {
        taskQueue.shift();
      }
    } else {
      // Cancelled task
      taskQueue.shift();
    }
    
    currentTask = taskQueue[0] || null;
  }
  
  // Return true if more work remains
  return currentTask !== null;
}
```

---

## Priority and Expiration

### Priority Levels

```javascript
const Priority = {
  IMMEDIATE: -1,        // Sync, no timeout
  USER_BLOCKING: 250,   // User interactions
  NORMAL: 5000,         // Default
  LOW: 10000,           // Deferred work
  IDLE: Infinity        // When idle
};
```

### Scheduling with Priority

```javascript
function scheduleTask(fn, priority = Priority.NORMAL) {
  return requestCallback(fn, {
    timeout: priority
  });
}

// High priority (expires in 250ms)
scheduleTask(() => {
  updateUIFromInput();
}, Priority.USER_BLOCKING);

// Low priority (expires in 10s)
scheduleTask(() => {
  preloadData();
}, Priority.LOW);
```

### Handling Timeouts

```javascript
function workLoop(initialTime) {
  let currentTime = initialTime;
  currentTask = taskQueue[0];
  
  while (currentTask) {
    const didTimeout = currentTask.expirationTime <= currentTime;
    
    if (didTimeout) {
      // Force execution even if we should yield
      const callback = currentTask.fn;
      if (callback) {
        callback(true); // didTimeout = true
      }
    } else if (shouldYieldToHost()) {
      // Not expired, but need to yield
      break;
    } else {
      // Normal execution
      const callback = currentTask.fn;
      if (callback) {
        callback(false); // didTimeout = false
      }
    }
    
    taskQueue.shift();
    currentTime = performance.now();
    currentTask = taskQueue[0];
  }
  
  return currentTask !== null;
}
```

---

## Complete Scheduler Implementation

### Full Solid.js-Style Scheduler

```javascript
// From scheduler.ts
let taskIdCounter = 1;
let isCallbackScheduled = false;
let isPerformingWork = false;
let taskQueue = [];
let currentTask = null;
let shouldYieldToHost = null;
let yieldInterval = 5;
let deadline = 0;
let maxYieldInterval = 300;
let maxDeadline = 0;
let scheduleCallback = null;
let scheduledCallback = null;

const maxSigned31BitInt = 1073741823;

function setupScheduler() {
  const channel = new MessageChannel();
  const port = channel.port2;
  
  // Schedule callback
  scheduleCallback = () => port.postMessage(null);
  
  // Message handler
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
          // Continue processing
          port.postMessage(null);
        }
      } catch (error) {
        // Re-throw to allow error to be observed
        port.postMessage(null);
        throw error;
      }
    }
  };
  
  // Setup yielding strategy
  if (navigator?.scheduling?.isInputPending) {
    const scheduling = navigator.scheduling;
    shouldYieldToHost = () => {
      const currentTime = performance.now();
      if (currentTime >= deadline) {
        if (scheduling.isInputPending()) {
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

function enqueue(taskQueue, task) {
  let m = 0;
  let n = taskQueue.length - 1;
  
  while (m <= n) {
    const k = (n + m) >> 1;
    const cmp = task.expirationTime - taskQueue[k].expirationTime;
    if (cmp > 0) m = k + 1;
    else if (cmp < 0) n = k - 1;
    else return k;
  }
  
  taskQueue.splice(m, 0, task);
}

function requestCallback(fn, options) {
  if (!scheduleCallback) setupScheduler();
  
  const startTime = performance.now();
  const timeout = options?.timeout ?? maxSigned31BitInt;
  
  const newTask = {
    id: taskIdCounter++,
    fn,
    startTime,
    expirationTime: startTime + timeout
  };
  
  enqueue(taskQueue, newTask);
  
  if (!isCallbackScheduled && !isPerformingWork) {
    isCallbackScheduled = true;
    scheduledCallback = flushWork;
    scheduleCallback();
  }
  
  return newTask;
}

function cancelCallback(task) {
  task.fn = null;
}

function flushWork(initialTime) {
  isCallbackScheduled = false;
  isPerformingWork = true;
  
  try {
    return workLoop(initialTime);
  } finally {
    currentTask = null;
    isPerformingWork = false;
  }
}

function workLoop(initialTime) {
  let currentTime = initialTime;
  currentTask = taskQueue[0] || null;
  
  while (currentTask !== null) {
    if (currentTask.expirationTime > currentTime && 
        shouldYieldToHost()) {
      break;
    }
    
    const callback = currentTask.fn;
    if (callback !== null) {
      currentTask.fn = null;
      const didTimeout = currentTask.expirationTime <= currentTime;
      callback(didTimeout);
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

// Export API
export { requestCallback, cancelCallback };
```

---

## Integration with Reactivity

### Scheduling Effects

```javascript
const Effects = [];

function runEffects() {
  if (Effects.length === 0) return;
  
  requestCallback(() => {
    while (Effects.length > 0) {
      const effect = Effects.shift();
      runEffect(effect);
    }
  }, { timeout: 250 }); // USER_BLOCKING priority
}

function writeSignal(signal, value) {
  if (signal.value !== value) {
    signal.value = value;
    
    // Mark observers as stale
    if (signal.observers) {
      for (const observer of signal.observers) {
        observer.state = STALE;
        Effects.push(observer);
      }
    }
    
    // Schedule effect execution
    runEffects();
  }
}
```

### Sync vs Async Updates

```javascript
let Scheduler = null;

function runUpdates(fn) {
  if (Scheduler) {
    // Use custom scheduler
    Scheduler(fn);
  } else {
    // Default: run synchronously
    fn();
  }
}

// Set custom scheduler
function setScheduler(fn) {
  Scheduler = fn;
}

// Async scheduler
setScheduler(fn => {
  requestCallback(fn, { timeout: 5000 });
});
```

### Batching with Scheduling

```javascript
let batchDepth = 0;
const pendingEffects = new Set();

function batch(fn) {
  batchDepth++;
  try {
    fn();
  } finally {
    batchDepth--;
    
    if (batchDepth === 0) {
      // Schedule all pending effects
      requestCallback(() => {
        for (const effect of pendingEffects) {
          runEffect(effect);
        }
        pendingEffects.clear();
      });
    }
  }
}

function queueEffect(effect) {
  if (batchDepth > 0) {
    pendingEffects.add(effect);
  } else {
    requestCallback(() => runEffect(effect));
  }
}
```

---

## Summary

### Key Takeaways

1. **MessageChannel Scheduling**
   - True async task scheduling
   - Not clamped like setTimeout
   - Allows browser to stay responsive

2. **Binary Search Queue**
   - O(log n) insertion
   - Sorted by expiration time
   - Efficient priority handling

3. **Smart Yielding**
   - 5ms timeslices
   - isInputPending() for user input
   - 300ms max before forced yield

4. **Priority System**
   - Timeout = priority
   - Expired tasks run immediately
   - Flexible scheduling strategy

5. **Integration with Reactivity**
   - Schedule effect execution
   - Support sync/async modes
   - Batch updates efficiently

### What You've Learned

- ✅ MessageChannel-based scheduling
- ✅ Priority queue implementation
- ✅ Yielding strategies
- ✅ Task lifecycle management
- ✅ Integration with reactive system

### Next Steps

Continue to Lesson 2: Effect Scheduling and Queue Management

---

## Further Reading

- **Next:** [Lesson 2: Effect Scheduling](./lesson-02-effect-scheduling.md)
- **Exercise:** [Build a Scheduler](../exercises/01-scheduler-implementation.md)
- **Source:** [Solid.js scheduler.ts](https://github.com/solidjs/solid/blob/main/packages/solid/src/reactive/scheduler.ts)
- **Reference:** [React Scheduler](https://github.com/facebook/react/tree/main/packages/scheduler)
