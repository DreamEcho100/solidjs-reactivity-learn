# Lesson 4: Advanced Timing Control

## Duration: 2-3 hours

## Overview

Master advanced timing control techniques including priority-based scheduling, time slicing, and integration with browser idle periods. Learn how Solid.js optimizes responsiveness while maintaining high performance.

---

## Learning Objectives

- Understand requestIdleCallback integration
- Implement priority-based task scheduling
- Master interruptible updates
- Apply time slicing techniques
- Monitor and optimize timing performance

---

## 1. requestIdleCallback Integration

### Browser Idle Time

The browser has idle periods when it's not busy with rendering, input, or other critical tasks. We can use these periods for non-urgent work.

```typescript
// Basic requestIdleCallback pattern
interface IdleDeadline {
  didTimeout: boolean;
  timeRemaining(): number;
}

function scheduleIdleWork(callback: (deadline: IdleDeadline) => void) {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(callback, { timeout: 5000 });
  } else {
    // Fallback for browsers without support
    setTimeout(() => callback({ 
      didTimeout: true, 
      timeRemaining: () => 0 
    }), 1);
  }
}
```

### Integrating with Reactive System

```typescript
interface DeferredTask {
  fn: () => void;
  priority: 'idle' | 'normal' | 'high';
  deadline?: number;
}

class TimingScheduler {
  private idleQueue: DeferredTask[] = [];
  private normalQueue: DeferredTask[] = [];
  private highQueue: DeferredTask[] = [];
  private idleCallbackId: number | null = null;

  scheduleTask(task: DeferredTask) {
    switch (task.priority) {
      case 'high':
        this.highQueue.push(task);
        this.flushHighPriority();
        break;
      case 'normal':
        this.normalQueue.push(task);
        this.scheduleNormalWork();
        break;
      case 'idle':
        this.idleQueue.push(task);
        this.scheduleIdleWork();
        break;
    }
  }

  private scheduleIdleWork() {
    if (this.idleCallbackId !== null) return;
    
    this.idleCallbackId = requestIdleCallback((deadline) => {
      this.idleCallbackId = null;
      this.processIdleQueue(deadline);
    }, { timeout: 5000 });
  }

  private processIdleQueue(deadline: IdleDeadline) {
    // Work until deadline or queue is empty
    while (this.idleQueue.length > 0 && 
           (deadline.timeRemaining() > 1 || deadline.didTimeout)) {
      const task = this.idleQueue.shift()!;
      task.fn();
    }

    // If more work remains, schedule again
    if (this.idleQueue.length > 0) {
      this.scheduleIdleWork();
    }
  }

  private flushHighPriority() {
    // Execute immediately, synchronously
    while (this.highQueue.length > 0) {
      const task = this.highQueue.shift()!;
      task.fn();
    }
  }

  private scheduleNormalWork() {
    // Use MessageChannel for next frame
    if (this.normalQueue.length > 0) {
      scheduleCallback(() => {
        const task = this.normalQueue.shift();
        if (task) task.fn();
        return this.normalQueue.length > 0;
      });
    }
  }
}
```

---

## 2. Priority-Based Scheduling

### Priority Levels

Different types of updates need different priorities:

```typescript
enum TaskPriority {
  Immediate = 0,      // User input, critical updates
  UserBlocking = 1,   // User interactions (clicks, typing)
  Normal = 2,         // Default priority
  Low = 3,            // Analytics, logging
  Idle = 4            // Background work
}

interface PriorityTask {
  id: number;
  fn: () => void;
  priority: TaskPriority;
  expirationTime: number;
  startTime: number;
}
```

### Priority Queue Implementation

```typescript
class PriorityScheduler {
  private taskIdCounter = 0;
  private taskQueue: PriorityTask[] = [];
  private isHostCallbackScheduled = false;
  private currentTask: PriorityTask | null = null;

  // Priority timeout durations (in milliseconds)
  private readonly TIMEOUTS = {
    [TaskPriority.Immediate]: -1,        // Execute immediately
    [TaskPriority.UserBlocking]: 250,    // 250ms
    [TaskPriority.Normal]: 5000,         // 5s
    [TaskPriority.Low]: 10000,           // 10s
    [TaskPriority.Idle]: Infinity        // No timeout
  };

  scheduleCallback(
    priority: TaskPriority, 
    callback: () => void
  ): number {
    const startTime = performance.now();
    const timeout = this.TIMEOUTS[priority];
    const expirationTime = timeout === -1 
      ? startTime 
      : startTime + timeout;

    const task: PriorityTask = {
      id: ++this.taskIdCounter,
      fn: callback,
      priority,
      expirationTime,
      startTime
    };

    // Insert task in sorted order by expiration time
    this.insertTask(task);

    // Schedule execution if not already scheduled
    if (!this.isHostCallbackScheduled) {
      this.isHostCallbackScheduled = true;
      this.requestHostCallback();
    }

    return task.id;
  }

  private insertTask(task: PriorityTask) {
    // Binary search insert to maintain sorted order
    let start = 0;
    let end = this.taskQueue.length;

    while (start < end) {
      const mid = (start + end) >>> 1;
      if (this.taskQueue[mid].expirationTime < task.expirationTime) {
        start = mid + 1;
      } else {
        end = mid;
      }
    }

    this.taskQueue.splice(start, 0, task);
  }

  private requestHostCallback() {
    if (this.taskQueue.length === 0) return;

    const firstTask = this.taskQueue[0];
    const currentTime = performance.now();

    if (firstTask.priority === TaskPriority.Immediate ||
        firstTask.expirationTime <= currentTime) {
      // Execute immediately
      this.flushWork(currentTime);
    } else {
      // Schedule for next frame
      scheduleCallback(() => this.flushWork(performance.now()));
    }
  }

  private flushWork(initialTime: number): boolean {
    this.isHostCallbackScheduled = false;
    
    const deadline = initialTime + 5; // 5ms time slice
    
    try {
      return this.workLoop(initialTime, deadline);
    } finally {
      this.currentTask = null;
      
      if (this.taskQueue.length > 0) {
        this.isHostCallbackScheduled = true;
        this.requestHostCallback();
      }
    }
  }

  private workLoop(initialTime: number, deadline: number): boolean {
    let currentTime = initialTime;
    this.currentTask = this.taskQueue[0];

    while (this.currentTask !== null) {
      // Check if task has expired or we have time
      if (this.currentTask.expirationTime > currentTime &&
          performance.now() >= deadline) {
        // Yield to browser
        break;
      }

      // Execute task
      const callback = this.currentTask.fn;
      this.taskQueue.shift();
      callback();

      currentTime = performance.now();
      this.currentTask = this.taskQueue[0];
    }

    // Return true if there's more work
    return this.taskQueue.length > 0;
  }

  cancelCallback(taskId: number) {
    const index = this.taskQueue.findIndex(t => t.id === taskId);
    if (index !== -1) {
      this.taskQueue.splice(index, 1);
    }
  }
}
```

---

## 3. Time Slicing

### Interruptible Updates

Break long-running work into smaller chunks that can be interrupted:

```typescript
class TimeSlicedScheduler {
  private workQueue: Array<() => boolean> = [];
  private isPerformingWork = false;
  private yieldInterval = 5; // ms

  scheduleWork(work: () => boolean) {
    this.workQueue.push(work);
    
    if (!this.isPerformingWork) {
      this.isPerformingWork = true;
      this.performWork();
    }
  }

  private async performWork() {
    while (this.workQueue.length > 0) {
      const startTime = performance.now();
      const shouldYield = this.createYieldChecker(startTime);

      while (this.workQueue.length > 0 && !shouldYield()) {
        const work = this.workQueue[0];
        const hasMoreWork = work();

        if (!hasMoreWork) {
          this.workQueue.shift();
        }
      }

      if (this.workQueue.length > 0) {
        // Yield to browser
        await this.yieldToMain();
      }
    }

    this.isPerformingWork = false;
  }

  private createYieldChecker(startTime: number) {
    return () => {
      const elapsed = performance.now() - startTime;
      return elapsed >= this.yieldInterval;
    };
  }

  private yieldToMain(): Promise<void> {
    return new Promise(resolve => {
      scheduleCallback(() => resolve());
    });
  }
}
```

### Chunked Effect Execution

```typescript
function createChunkedEffect(
  fn: () => void,
  options: { chunkSize?: number; priority?: TaskPriority } = {}
) {
  const { chunkSize = 50, priority = TaskPriority.Normal } = options;
  
  const scheduler = new PriorityScheduler();
  let workItems: Array<() => void> = [];
  let isScheduled = false;

  const executeChunk = () => {
    const startTime = performance.now();
    let itemsProcessed = 0;

    while (workItems.length > 0 && itemsProcessed < chunkSize) {
      const work = workItems.shift()!;
      work();
      itemsProcessed++;

      // Check if we should yield
      if (performance.now() - startTime > 16) {
        break;
      }
    }

    if (workItems.length > 0) {
      scheduler.scheduleCallback(priority, executeChunk);
    } else {
      isScheduled = false;
    }
  };

  return (items: Array<() => void>) => {
    workItems.push(...items);

    if (!isScheduled) {
      isScheduled = true;
      scheduler.scheduleCallback(priority, executeChunk);
    }
  };
}
```

---

## 4. isInputPending API

### Checking for Pending Input

The `isInputPending` API allows checking if user input is waiting:

```typescript
interface NavigatorScheduling {
  isInputPending(options?: { includeContinuous?: boolean }): boolean;
}

declare global {
  interface Navigator {
    scheduling?: NavigatorScheduling;
  }
}

class InputAwareScheduler {
  private hasInputPending(): boolean {
    if (navigator.scheduling?.isInputPending) {
      return navigator.scheduling.isInputPending({
        includeContinuous: true
      });
    }
    return false;
  }

  performWork(work: () => boolean, deadline: number): boolean {
    let currentTime = performance.now();

    while (currentTime < deadline) {
      // Check for pending input
      if (this.hasInputPending()) {
        // Yield to handle input
        return true; // Has more work
      }

      const hasMoreWork = work();
      if (!hasMoreWork) {
        return false; // Work complete
      }

      currentTime = performance.now();
    }

    return true; // Still has work
  }
}
```

---

## 5. Performance Monitoring

### Timing Metrics

Track scheduling performance:

```typescript
interface SchedulingMetrics {
  taskCount: number;
  totalExecutionTime: number;
  averageExecutionTime: number;
  longestTask: number;
  shortestTask: number;
  yieldCount: number;
  priorityDistribution: Map<TaskPriority, number>;
}

class PerformanceMonitor {
  private metrics: SchedulingMetrics = {
    taskCount: 0,
    totalExecutionTime: 0,
    averageExecutionTime: 0,
    longestTask: 0,
    shortestTask: Infinity,
    yieldCount: 0,
    priorityDistribution: new Map()
  };

  recordTask(priority: TaskPriority, duration: number) {
    this.metrics.taskCount++;
    this.metrics.totalExecutionTime += duration;
    this.metrics.averageExecutionTime = 
      this.metrics.totalExecutionTime / this.metrics.taskCount;

    if (duration > this.metrics.longestTask) {
      this.metrics.longestTask = duration;
    }
    if (duration < this.metrics.shortestTask) {
      this.metrics.shortestTask = duration;
    }

    const count = this.metrics.priorityDistribution.get(priority) || 0;
    this.metrics.priorityDistribution.set(priority, count + 1);
  }

  recordYield() {
    this.metrics.yieldCount++;
  }

  getMetrics(): SchedulingMetrics {
    return { ...this.metrics };
  }

  reset() {
    this.metrics = {
      taskCount: 0,
      totalExecutionTime: 0,
      averageExecutionTime: 0,
      longestTask: 0,
      shortestTask: Infinity,
      yieldCount: 0,
      priorityDistribution: new Map()
    };
  }

  printReport() {
    console.log('=== Scheduling Performance Report ===');
    console.log(`Total Tasks: ${this.metrics.taskCount}`);
    console.log(`Total Time: ${this.metrics.totalExecutionTime.toFixed(2)}ms`);
    console.log(`Average Time: ${this.metrics.averageExecutionTime.toFixed(2)}ms`);
    console.log(`Longest Task: ${this.metrics.longestTask.toFixed(2)}ms`);
    console.log(`Shortest Task: ${this.metrics.shortestTask.toFixed(2)}ms`);
    console.log(`Yields: ${this.metrics.yieldCount}`);
    console.log('\nPriority Distribution:');
    this.metrics.priorityDistribution.forEach((count, priority) => {
      console.log(`  ${TaskPriority[priority]}: ${count}`);
    });
  }
}
```

### Integration with Reactive System

```typescript
const monitor = new PerformanceMonitor();

function createMonitoredEffect(fn: () => void, priority = TaskPriority.Normal) {
  const startTime = performance.now();
  
  createEffect(() => {
    const taskStart = performance.now();
    fn();
    const taskEnd = performance.now();
    
    monitor.recordTask(priority, taskEnd - taskStart);
  });
}
```

---

## 6. Complete Integration Example

### Production-Ready Scheduler

```typescript
class ProductionScheduler {
  private priorityScheduler: PriorityScheduler;
  private timeSlicer: TimeSlicedScheduler;
  private monitor: PerformanceMonitor;
  private idleQueue: Array<() => void> = [];

  constructor() {
    this.priorityScheduler = new PriorityScheduler();
    this.timeSlicer = new TimeSlicedScheduler();
    this.monitor = new PerformanceMonitor();
    this.setupIdleCallback();
  }

  scheduleEffect(
    fn: () => void, 
    options: {
      priority?: TaskPriority;
      interruptible?: boolean;
      onIdle?: boolean;
    } = {}
  ) {
    const { 
      priority = TaskPriority.Normal, 
      interruptible = false,
      onIdle = false 
    } = options;

    if (onIdle) {
      this.idleQueue.push(fn);
      return;
    }

    const startTime = performance.now();
    const task = () => {
      fn();
      const duration = performance.now() - startTime;
      this.monitor.recordTask(priority, duration);
    };

    if (interruptible) {
      this.timeSlicer.scheduleWork(() => {
        task();
        return false; // No more work
      });
    } else {
      this.priorityScheduler.scheduleCallback(priority, task);
    }
  }

  private setupIdleCallback() {
    const processIdleQueue = (deadline: IdleDeadline) => {
      while (this.idleQueue.length > 0 && 
             (deadline.timeRemaining() > 1 || deadline.didTimeout)) {
        const task = this.idleQueue.shift()!;
        task();
      }

      if (this.idleQueue.length > 0) {
        requestIdleCallback(processIdleQueue, { timeout: 5000 });
      }
    };

    requestIdleCallback(processIdleQueue, { timeout: 5000 });
  }

  getMetrics() {
    return this.monitor.getMetrics();
  }

  printReport() {
    this.monitor.printReport();
  }
}

// Global instance
export const scheduler = new ProductionScheduler();
```

---

## 7. Practical Patterns

### Responsive UI Updates

```typescript
function createResponsiveUpdate() {
  const [state, setState] = createSignal({ items: [], loading: false });

  const updateItems = (newItems: any[]) => {
    if (newItems.length > 1000) {
      // Large update - use time slicing
      scheduler.scheduleEffect(
        () => setState({ items: newItems, loading: false }),
        { interruptible: true, priority: TaskPriority.Normal }
      );
    } else {
      // Small update - immediate
      scheduler.scheduleEffect(
        () => setState({ items: newItems, loading: false }),
        { priority: TaskPriority.UserBlocking }
      );
    }
  };

  return { state, updateItems };
}
```

### Background Analytics

```typescript
function trackAnalytics(event: string, data: any) {
  scheduler.scheduleEffect(
    () => {
      // Send analytics
      fetch('/analytics', {
        method: 'POST',
        body: JSON.stringify({ event, data })
      });
    },
    { onIdle: true }
  );
}
```

---

## Key Takeaways

1. **requestIdleCallback** - Use browser idle time for non-critical work
2. **Priority Scheduling** - Different updates need different urgency levels
3. **Time Slicing** - Break long work into interruptible chunks
4. **Input Awareness** - Yield to pending user input
5. **Performance Monitoring** - Track and optimize scheduling metrics

---

## Common Pitfalls

1. **Not yielding** - Long tasks block the main thread
2. **Wrong priorities** - User input should be high priority
3. **Too many yields** - Overhead from excessive yielding
4. **No monitoring** - Can't optimize what you don't measure
5. **Blocking idle work** - Idle callbacks should be truly non-critical

---

## Practice Exercises

1. Implement a priority queue with time slicing
2. Build a scheduler that respects `isInputPending`
3. Create a performance monitoring dashboard
4. Optimize a slow reactive application
5. Compare different scheduling strategies

---

## Next Steps

- Complete exercises in `exercises/`
- Build the scheduler visualizer project
- Move to **Unit 5: Transitions and Concurrency**

---

## References

- [Scheduler Polyfill](https://github.com/facebook/react/tree/main/packages/scheduler)
- [isInputPending API](https://developer.chrome.com/articles/isinputpending/)
- [requestIdleCallback](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback)
- Solid.js `scheduler.ts` source code
