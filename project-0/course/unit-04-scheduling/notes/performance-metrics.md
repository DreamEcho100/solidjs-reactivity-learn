# Performance Metrics - Reference Guide

## Overview

Comprehensive guide to measuring, analyzing, and optimizing scheduling performance in reactive systems.

---

## 1. Core Metrics

### Task Execution Time

**What:** Time from task schedule to completion

**Measurement:**
```typescript
class TaskTimer {
  private startTimes = new Map<number, number>();
  
  start(taskId: number) {
    this.startTimes.set(taskId, performance.now());
  }
  
  end(taskId: number): number {
    const startTime = this.startTimes.get(taskId);
    if (!startTime) return 0;
    
    const duration = performance.now() - startTime;
    this.startTimes.delete(taskId);
    return duration;
  }
}
```

**Targets:**
- Critical tasks: < 1ms
- User-blocking: < 50ms
- Normal tasks: < 100ms
- Low priority: < 1000ms

---

### Task Throughput

**What:** Number of tasks completed per unit time

**Measurement:**
```typescript
class ThroughputMeter {
  private completedTasks = 0;
  private windowStart = performance.now();
  private windowSize = 1000; // 1 second
  
  recordTask() {
    this.completedTasks++;
  }
  
  getThroughput(): number {
    const elapsed = performance.now() - this.windowStart;
    if (elapsed < this.windowSize) {
      return this.completedTasks / (elapsed / 1000);
    }
    
    // Reset window
    const throughput = this.completedTasks / (this.windowSize / 1000);
    this.completedTasks = 0;
    this.windowStart = performance.now();
    return throughput;
  }
}
```

**Targets:**
- High-frequency updates: > 1000 tasks/sec
- Normal operation: > 100 tasks/sec
- Low activity: > 10 tasks/sec

---

### Queue Depth

**What:** Number of pending tasks in queue

**Measurement:**
```typescript
class QueueMonitor {
  private queue: Array<() => void> = [];
  private maxDepth = 0;
  private depthSamples: number[] = [];
  
  enqueue(fn: () => void) {
    this.queue.push(fn);
    this.updateDepthMetrics();
  }
  
  dequeue(): (() => void) | undefined {
    const fn = this.queue.shift();
    this.updateDepthMetrics();
    return fn;
  }
  
  private updateDepthMetrics() {
    const currentDepth = this.queue.length;
    
    if (currentDepth > this.maxDepth) {
      this.maxDepth = currentDepth;
    }
    
    this.depthSamples.push(currentDepth);
    if (this.depthSamples.length > 1000) {
      this.depthSamples.shift();
    }
  }
  
  getMetrics() {
    const avgDepth = this.depthSamples.reduce((a, b) => a + b, 0) / 
                     this.depthSamples.length;
    
    return {
      current: this.queue.length,
      max: this.maxDepth,
      average: avgDepth
    };
  }
}
```

**Targets:**
- Average depth: < 10 tasks
- Max depth: < 100 tasks
- Alert if: > 1000 tasks

---

### Latency

**What:** Time from task creation to execution start

**Measurement:**
```typescript
interface TimestampedTask {
  fn: () => void;
  createdAt: number;
  startedAt?: number;
}

class LatencyTracker {
  private latencies: number[] = [];
  
  recordLatency(task: TimestampedTask) {
    if (!task.startedAt) return;
    
    const latency = task.startedAt - task.createdAt;
    this.latencies.push(latency);
    
    // Keep last 1000 samples
    if (this.latencies.length > 1000) {
      this.latencies.shift();
    }
  }
  
  getStats() {
    if (this.latencies.length === 0) return null;
    
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: sum / sorted.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }
}
```

**Targets:**
- P50 (median): < 16ms (one frame)
- P95: < 50ms
- P99: < 100ms

---

## 2. Frame Timing Metrics

### Frame Rate (FPS)

**What:** Rendering frames per second

**Measurement:**
```typescript
class FPSMeter {
  private frameTimes: number[] = [];
  private lastFrameTime = performance.now();
  
  recordFrame() {
    const now = performance.now();
    const frameDuration = now - this.lastFrameTime;
    this.lastFrameTime = now;
    
    this.frameTimes.push(frameDuration);
    if (this.frameTimes.length > 60) {
      this.frameTimes.shift();
    }
  }
  
  getFPS(): number {
    if (this.frameTimes.length === 0) return 0;
    
    const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / 
                         this.frameTimes.length;
    
    return 1000 / avgFrameTime;
  }
  
  getFrameStats() {
    if (this.frameTimes.length === 0) return null;
    
    return {
      fps: this.getFPS(),
      avgFrameTime: this.frameTimes.reduce((a, b) => a + b, 0) / 
                    this.frameTimes.length,
      longestFrame: Math.max(...this.frameTimes),
      shortestFrame: Math.min(...this.frameTimes)
    };
  }
}

// Usage with RAF
const fpsMeter = new FPSMeter();

function animate() {
  fpsMeter.recordFrame();
  
  // Your render logic
  
  requestAnimationFrame(animate);
}

animate();
```

**Targets:**
- Target: 60 FPS (16.67ms per frame)
- Acceptable: > 30 FPS
- Warning: < 24 FPS

---

### Long Tasks

**What:** Tasks that block main thread > 50ms

**Measurement:**
```typescript
class LongTaskDetector {
  private longTasks: Array<{
    duration: number;
    timestamp: number;
    stackTrace?: string;
  }> = [];
  
  wrapTask<T>(fn: () => T, name: string): T {
    const start = performance.now();
    const stackTrace = new Error().stack;
    
    try {
      return fn();
    } finally {
      const duration = performance.now() - start;
      
      if (duration > 50) {
        this.longTasks.push({
          duration,
          timestamp: start,
          stackTrace: stackTrace
        });
        
        console.warn(`Long task detected: ${name} took ${duration}ms`);
      }
    }
  }
  
  getLongTasks() {
    return this.longTasks;
  }
  
  clearLongTasks() {
    this.longTasks = [];
  }
}
```

**Using PerformanceObserver:**
```typescript
class LongTaskObserver {
  private observer: PerformanceObserver | null = null;
  private longTasks: PerformanceEntry[] = [];
  
  start() {
    if (!('PerformanceObserver' in window)) return;
    
    this.observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 50) {
          this.longTasks.push(entry);
          console.warn('Long task detected:', {
            name: entry.name,
            duration: entry.duration,
            startTime: entry.startTime
          });
        }
      }
    });
    
    this.observer.observe({ entryTypes: ['longtask'] });
  }
  
  stop() {
    this.observer?.disconnect();
  }
  
  getLongTasks() {
    return this.longTasks;
  }
}
```

**Targets:**
- No tasks > 50ms during interactions
- Max 1-2 long tasks during page load
- Zero long tasks during idle

---

## 3. Memory Metrics

### Task Queue Memory

**What:** Memory used by pending tasks

**Measurement:**
```typescript
class MemoryMonitor {
  private queue: Array<() => void> = [];
  
  getQueueMemoryEstimate(): number {
    // Rough estimate: 100 bytes per closure
    return this.queue.length * 100;
  }
  
  getQueueSizeKB(): number {
    return this.getQueueMemoryEstimate() / 1024;
  }
  
  checkMemoryPressure(): boolean {
    const estimateKB = this.getQueueSizeKB();
    
    // Alert if queue uses > 1MB
    return estimateKB > 1024;
  }
}
```

**Using Performance.memory (Chrome):**
```typescript
interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

class HeapMonitor {
  getMemoryInfo(): MemoryInfo | null {
    if ('memory' in performance) {
      return (performance as any).memory;
    }
    return null;
  }
  
  getMemoryStats() {
    const memory = this.getMemoryInfo();
    if (!memory) return null;
    
    return {
      usedMB: memory.usedJSHeapSize / (1024 * 1024),
      totalMB: memory.totalJSHeapSize / (1024 * 1024),
      limitMB: memory.jsHeapSizeLimit / (1024 * 1024),
      usagePercent: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100
    };
  }
  
  isMemoryPressure(): boolean {
    const stats = this.getMemoryStats();
    if (!stats) return false;
    
    // Alert if using > 90% of heap
    return stats.usagePercent > 90;
  }
}
```

**Targets:**
- Queue memory: < 1MB
- Heap usage: < 80%
- No memory leaks (steady state)

---

## 4. Batching Metrics

### Batch Size

**What:** Number of tasks per batch

**Measurement:**
```typescript
class BatchMetrics {
  private batchSizes: number[] = [];
  
  recordBatch(size: number) {
    this.batchSizes.push(size);
    
    if (this.batchSizes.length > 100) {
      this.batchSizes.shift();
    }
  }
  
  getStats() {
    if (this.batchSizes.length === 0) return null;
    
    const sum = this.batchSizes.reduce((a, b) => a + b, 0);
    const avg = sum / this.batchSizes.length;
    const max = Math.max(...this.batchSizes);
    const min = Math.min(...this.batchSizes);
    
    return { avg, max, min, total: sum };
  }
  
  getBatchingEfficiency(): number {
    const stats = this.getStats();
    if (!stats) return 0;
    
    // Higher average batch size = better efficiency
    return stats.avg / stats.max;
  }
}
```

**Targets:**
- Average batch size: > 5 tasks
- Good batching: > 10 tasks
- Excellent batching: > 20 tasks

---

### Batch Frequency

**What:** How often batches execute

**Measurement:**
```typescript
class BatchFrequency {
  private lastBatchTime = performance.now();
  private intervals: number[] = [];
  
  recordBatch() {
    const now = performance.now();
    const interval = now - this.lastBatchTime;
    this.lastBatchTime = now;
    
    this.intervals.push(interval);
    if (this.intervals.length > 100) {
      this.intervals.shift();
    }
  }
  
  getBatchesPerSecond(): number {
    if (this.intervals.length === 0) return 0;
    
    const avgInterval = this.intervals.reduce((a, b) => a + b, 0) / 
                        this.intervals.length;
    
    return 1000 / avgInterval;
  }
}
```

**Targets:**
- Low frequency: < 10 batches/sec (good batching)
- Medium: 10-60 batches/sec
- High: > 60 batches/sec (poor batching)

---

## 5. Priority Metrics

### Priority Distribution

**What:** Task distribution across priority levels

**Measurement:**
```typescript
enum Priority {
  Immediate = 0,
  High = 1,
  Normal = 2,
  Low = 3,
  Idle = 4
}

class PriorityMetrics {
  private distribution = new Map<Priority, number>();
  private totalTasks = 0;
  
  recordTask(priority: Priority) {
    const count = this.distribution.get(priority) || 0;
    this.distribution.set(priority, count + 1);
    this.totalTasks++;
  }
  
  getDistribution() {
    const result: Record<string, number> = {};
    
    this.distribution.forEach((count, priority) => {
      const percentage = (count / this.totalTasks) * 100;
      result[Priority[priority]] = percentage;
    });
    
    return result;
  }
  
  isBalanced(): boolean {
    const dist = this.getDistribution();
    
    // Check if any priority dominates (> 80%)
    return Object.values(dist).every(pct => pct < 80);
  }
}
```

**Targets:**
- Balanced distribution
- No single priority > 80%
- Immediate tasks < 5%

---

### Priority Wait Time

**What:** Average wait time per priority level

**Measurement:**
```typescript
interface PriorityTask {
  priority: Priority;
  createdAt: number;
  startedAt?: number;
}

class PriorityWaitTime {
  private waitTimes = new Map<Priority, number[]>();
  
  recordTask(task: PriorityTask) {
    if (!task.startedAt) return;
    
    const waitTime = task.startedAt - task.createdAt;
    const times = this.waitTimes.get(task.priority) || [];
    times.push(waitTime);
    
    if (times.length > 100) times.shift();
    
    this.waitTimes.set(task.priority, times);
  }
  
  getAverageWaitTime(priority: Priority): number {
    const times = this.waitTimes.get(priority);
    if (!times || times.length === 0) return 0;
    
    return times.reduce((a, b) => a + b, 0) / times.length;
  }
  
  getAllWaitTimes() {
    const result: Record<string, number> = {};
    
    this.waitTimes.forEach((times, priority) => {
      result[Priority[priority]] = this.getAverageWaitTime(priority);
    });
    
    return result;
  }
}
```

**Targets:**
- Immediate: < 1ms
- High: < 10ms
- Normal: < 50ms
- Low: < 500ms
- Idle: variable

---

## 6. Comprehensive Monitoring System

### Complete Metrics Collector

```typescript
class SchedulerMetrics {
  private taskTimer = new TaskTimer();
  private throughput = new ThroughputMeter();
  private queueMonitor = new QueueMonitor();
  private latency = new LatencyTracker();
  private fpsMeter = new FPSMeter();
  private longTasks = new LongTaskDetector();
  private batchMetrics = new BatchMetrics();
  private priorityMetrics = new PriorityMetrics();
  
  // Unified interface
  recordTaskStart(taskId: number, priority: Priority) {
    this.taskTimer.start(taskId);
    this.priorityMetrics.recordTask(priority);
  }
  
  recordTaskEnd(taskId: number) {
    const duration = this.taskTimer.end(taskId);
    this.throughput.recordTask();
    return duration;
  }
  
  recordBatch(size: number) {
    this.batchMetrics.recordBatch(size);
  }
  
  recordFrame() {
    this.fpsMeter.recordFrame();
  }
  
  getFullReport() {
    return {
      throughput: this.throughput.getThroughput(),
      queue: this.queueMonitor.getMetrics(),
      latency: this.latency.getStats(),
      fps: this.fpsMeter.getFrameStats(),
      batching: this.batchMetrics.getStats(),
      priority: this.priorityMetrics.getDistribution(),
      longTasks: this.longTasks.getLongTasks().length
    };
  }
  
  printReport() {
    const report = this.getFullReport();
    
    console.log('=== Scheduler Performance Report ===');
    console.log(`Throughput: ${report.throughput.toFixed(2)} tasks/sec`);
    console.log(`Queue Depth: ${report.queue.current} (avg: ${report.queue.average.toFixed(2)})`);
    console.log(`Latency (P95): ${report.latency?.p95.toFixed(2)}ms`);
    console.log(`FPS: ${report.fps?.fps.toFixed(2)}`);
    console.log(`Avg Batch Size: ${report.batching?.avg.toFixed(2)}`);
    console.log(`Long Tasks: ${report.longTasks}`);
    console.log('\nPriority Distribution:');
    Object.entries(report.priority).forEach(([name, pct]) => {
      console.log(`  ${name}: ${pct.toFixed(1)}%`);
    });
  }
}
```

---

## 7. Performance Budgets

### Setting Budgets

```typescript
interface PerformanceBudget {
  maxTaskDuration: number;
  maxQueueDepth: number;
  minFPS: number;
  maxLatencyP95: number;
  maxBatchFrequency: number;
}

const PRODUCTION_BUDGET: PerformanceBudget = {
  maxTaskDuration: 50,      // 50ms
  maxQueueDepth: 100,       // 100 tasks
  minFPS: 30,               // 30 FPS
  maxLatencyP95: 100,       // 100ms
  maxBatchFrequency: 60     // 60 batches/sec
};

class BudgetEnforcer {
  constructor(private budget: PerformanceBudget) {}
  
  checkBudget(metrics: ReturnType<SchedulerMetrics['getFullReport']>): boolean {
    const violations: string[] = [];
    
    if (metrics.queue.max > this.budget.maxQueueDepth) {
      violations.push(`Queue depth exceeded: ${metrics.queue.max}`);
    }
    
    if (metrics.fps && metrics.fps.fps < this.budget.minFPS) {
      violations.push(`FPS too low: ${metrics.fps.fps}`);
    }
    
    if (metrics.latency && metrics.latency.p95 > this.budget.maxLatencyP95) {
      violations.push(`Latency too high: ${metrics.latency.p95}ms`);
    }
    
    if (violations.length > 0) {
      console.error('Performance budget violations:', violations);
      return false;
    }
    
    return true;
  }
}
```

---

## 8. Real-World Monitoring

### Production Setup

```typescript
// Initialize monitoring
const metrics = new SchedulerMetrics();
const budgetEnforcer = new BudgetEnforcer(PRODUCTION_BUDGET);

// Periodic reporting (every 10 seconds)
setInterval(() => {
  const report = metrics.getFullReport();
  
  // Check budget
  const withinBudget = budgetEnforcer.checkBudget(report);
  
  // Send to analytics
  if (!withinBudget) {
    sendAnalytics('performance_budget_violation', report);
  }
  
  // Log in development
  if (process.env.NODE_ENV === 'development') {
    metrics.printReport();
  }
}, 10000);

// Monitor FPS continuously
let frameCount = 0;
function monitorFPS() {
  metrics.recordFrame();
  frameCount++;
  
  if (frameCount % 60 === 0) {
    const fps = metrics.getFullReport().fps?.fps;
    if (fps && fps < 30) {
      console.warn(`Low FPS detected: ${fps}`);
    }
  }
  
  requestAnimationFrame(monitorFPS);
}
monitorFPS();
```

---

## Key Takeaways

1. **Measure what matters** - Focus on user-impacting metrics
2. **Set budgets** - Define acceptable performance limits
3. **Monitor continuously** - Track metrics in production
4. **Alert on violations** - Be notified of performance issues
5. **Optimize based on data** - Let metrics guide improvements

---

## References

- [Web Vitals](https://web.dev/vitals/)
- [Performance APIs](https://developer.mozilla.org/en-US/docs/Web/API/Performance)
- [Long Tasks API](https://developer.mozilla.org/en-US/docs/Web/API/Long_Tasks_API)
- [User Timing API](https://developer.mozilla.org/en-US/docs/Web/API/User_Timing_API)
