# Unit 4: Reactive Scheduling

## Overview

Deep dive into Solid.js's sophisticated scheduling system. Learn how effects are queued, prioritized, and executed to optimize performance and responsiveness.

## Learning Objectives

- ✅ Understand MessageChannel-based scheduling
- ✅ Implement task queue with priorities
- ✅ Master effect scheduling strategies
- ✅ Build batching systems
- ✅ Control execution timing

## Time Commitment

**2 weeks** | **12-16 hours**

## Lessons

### Lesson 1: Scheduler Architecture (4-5 hours)
- MessageChannel vs setTimeout
- Task queue data structures
- Priority and expiration times
- Yielding to the browser
- isInputPending API

From `scheduler.ts`:
```javascript
const channel = new MessageChannel();
channel.port1.onmessage = () => {
  if (scheduledCallback !== null) {
    const hasMoreWork = scheduledCallback(performance.now());
    if (!hasMoreWork) scheduledCallback = null;
  }
};
```

### Lesson 2: Effect Scheduling (3-4 hours)
- runQueue vs scheduleQueue
- User effects vs internal effects
- Effect execution order
- Synchronous vs asynchronous updates
- Queue management

### Lesson 3: Batching and Updates (3-4 hours)
- batch() implementation
- runUpdates algorithm
- ExecCount versioning
- Preventing re-renders
- Update coalescing

### Lesson 4: Advanced Timing Control (2-3 hours)
- requestIdleCallback integration
- Priority-based scheduling
- Interruptible updates
- Time slicing
- Performance monitoring

## Exercises

1. **Build Scheduler** (⭐⭐⭐⭐) - Implement from scratch
2. **Task Priority System** (⭐⭐⭐) - Priority queue
3. **Batching Utilities** (⭐⭐⭐) - Custom batch functions
4. **Performance Profiler** (⭐⭐⭐⭐) - Measure timing

## Projects

- **Scheduler Visualizer** - Visualize task execution
- **Performance Dashboard** - Monitor reactive performance
- **Custom Scheduler** - Build domain-specific scheduler

## Key Concepts

### MessageChannel Scheduling
```javascript
function setupScheduler() {
  const channel = new MessageChannel();
  scheduleCallback = () => channel.port2.postMessage(null);
  channel.port1.onmessage = flushWork;
}
```

### Task Queue
```javascript
interface Task {
  id: number;
  fn: (didTimeout: boolean) => void;
  startTime: number;
  expirationTime: number;
}
```

### Batching Pattern
```javascript
batch(() => {
  setA(1);
  setB(2);
  setC(3);
  // All effects run once after batch
});
```

**Files:**
- `lessons/lesson-01-scheduler-architecture.md`
- `lessons/lesson-02-effect-scheduling.md`
- `lessons/lesson-03-batching-updates.md`
- `lessons/lesson-04-timing-control.md`
- `exercises/01-build-scheduler.md`
- `notes/scheduling-strategies.md`
- `notes/performance-metrics.md`
