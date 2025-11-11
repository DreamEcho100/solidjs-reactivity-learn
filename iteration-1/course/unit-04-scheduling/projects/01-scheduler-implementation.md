# Project 1: Build a Complete Scheduler from Scratch

## Project Overview

In this project, you'll build a production-quality reactive scheduler similar to Solid.js's implementation. This hands-on project will solidify your understanding of:
- MessageChannel-based async scheduling
- Update queue management
- Batching mechanisms
- Priority handling
- Performance optimization

**Estimated Time:** 8-12 hours  
**Difficulty:** Advanced

---

## Learning Objectives

By completing this project, you will:
- ✅ Implement async scheduling with MessageChannel
- ✅ Build a priority-based update queue
- ✅ Create batching utilities
- ✅ Handle edge cases (re-entrance, infinite loops)
- ✅ Write comprehensive tests
- ✅ Measure and optimize performance

---

## Project Setup

### 1. Initialize Project

```bash
mkdir reactive-scheduler
cd reactive-scheduler
npm init -y
npm install --save-dev typescript @types/node vitest
```

### 2. Configure TypeScript

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "moduleResolution": "node"
  }
}
```

### 3. Project Structure

```
reactive-scheduler/
├── src/
│   ├── signal.ts          # Basic signal implementation
│   ├── computation.ts     # Computation interface
│   ├── scheduler.ts       # Main scheduler logic
│   ├── batch.ts           # Batching utilities
│   └── index.ts           # Public API
├── tests/
│   ├── scheduler.test.ts
│   ├── batch.test.ts
│   └── performance.test.ts
├── examples/
│   ├── basic.ts
│   ├── batching.ts
│   └── priority.ts
└── package.json
```

---

## Part 1: Core Scheduler Implementation

### Step 1: Define Types

**src/types.ts:**
```typescript
export const enum ComputationState {
  CLEAN = 0,
  STALE = 1,
  PENDING = 2
}

export interface Computation<T = any> {
  fn: () => T;
  state: ComputationState;
  value: T;
  observers: Computation[] | null;
  sources: Signal<any>[] | null;
  priority: number;
  version: number;
  owned: Computation[] | null;
  owner: Computation | null;
}

export interface Signal<T> {
  value: T;
  observers: Computation[] | null;
  comparator?: (prev: T, next: T) => boolean;
}
```

### Step 2: Implement MessageChannel Scheduler

**src/scheduler.ts:**
```typescript
import { Computation, ComputationState } from './types';

// Global state
let ExecCount = 0;
let Pending = false;
let Running = false;
const Updates: Computation[] = [];

// MessageChannel setup
const channel = new MessageChannel();
let scheduled = false;

channel.port1.onmessage = () => {
  scheduled = false;
  flushQueue();
};

/**
 * Schedule work to execute in the next task
 */
export function scheduleQueue(): void {
  if (!scheduled && !Pending) {
    scheduled = true;
    channel.port2.postMessage(null);
  }
}

/**
 * Add computation to update queue
 */
export function queueUpdate(computation: Computation): void {
  if (computation.state !== ComputationState.STALE) {
    return;
  }

  // Insert based on priority (higher priority first)
  let insertIndex = Updates.length;
  for (let i = 0; i < Updates.length; i++) {
    if (Updates[i].priority < computation.priority) {
      insertIndex = i;
      break;
    }
  }

  Updates.splice(insertIndex, 0, computation);

  // Schedule async flush
  scheduleQueue();
}

/**
 * Execute all pending updates
 */
export function flushQueue(): void {
  if (Running) return;

  Running = true;

  try {
    while (Updates.length > 0) {
      const computation = Updates.shift()!;

      if (computation.state !== ComputationState.STALE) {
        continue;
      }

      updateComputation(computation);
    }
  } finally {
    Running = false;
    Pending = false;
  }
}

/**
 * Execute a computation and update its value
 */
function updateComputation<T>(computation: Computation<T>): void {
  const prevExecCount = ExecCount;
  ExecCount++;

  computation.version = ExecCount;
  computation.state = ComputationState.CLEAN;

  // Execute computation function
  const prevValue = computation.value;
  computation.value = computation.fn();

  // If value changed, notify observers
  if (prevValue !== computation.value) {
    markObserversStale(computation);
  }
}

/**
 * Mark all observers of a computation as stale
 */
function markObserversStale(computation: Computation): void {
  if (!computation.observers) return;

  for (let i = 0; i < computation.observers.length; i++) {
    const observer = computation.observers[i];
    if (observer.state === ComputationState.CLEAN) {
      observer.state = ComputationState.STALE;
      queueUpdate(observer);
    }
  }
}

/**
 * Run updates synchronously
 */
export function runUpdates<T>(fn?: () => T): T | undefined {
  if (Running) {
    return fn?.();
  }

  Pending = true;
  Running = true;

  try {
    const result = fn?.();
    flushQueue();
    return result;
  } finally {
    Pending = false;
    Running = false;
  }
}

/**
 * Check if currently batching
 */
export function isPending(): boolean {
  return Pending;
}

/**
 * Check if currently running updates
 */
export function isRunning(): boolean {
  return Running;
}

/**
 * Get current execution count
 */
export function getExecCount(): number {
  return ExecCount;
}
```

### Step 3: Implement Batching

**src/batch.ts:**
```typescript
import { runUpdates } from './scheduler';

/**
 * Batch multiple updates into a single transaction
 */
export function batch<T>(fn: () => T): T {
  return runUpdates(fn)!;
}

/**
 * Create a batched version of a function
 */
export function createBatched<Args extends any[], Return>(
  fn: (...args: Args) => Return
): (...args: Args) => Return {
  return (...args: Args) => batch(() => fn(...args));
}

/**
 * Defer execution until current batch completes
 */
export function defer(fn: () => void): void {
  Promise.resolve().then(() => {
    batch(fn);
  });
}
```

---

## Part 2: Signal Integration

### Step 4: Create Signals with Scheduler

**src/signal.ts:**
```typescript
import { Signal, Computation, ComputationState } from './types';
import { queueUpdate, getExecCount } from './scheduler';

export function createSignal<T>(
  initialValue: T,
  equals: (a: T, b: T) => boolean = (a, b) => a === b
): [get: () => T, set: (value: T) => void] {
  const signal: Signal<T> = {
    value: initialValue,
    observers: null,
    comparator: equals
  };

  function read(): T {
    // TODO: Track as dependency
    return signal.value;
  }

  function write(nextValue: T): void {
    // Check equality
    if (signal.comparator && signal.comparator(signal.value, nextValue)) {
      return;
    }

    signal.value = nextValue;

    // Notify observers
    if (signal.observers) {
      for (let i = 0; i < signal.observers.length; i++) {
        const observer = signal.observers[i];
        observer.state = ComputationState.STALE;
        observer.version = getExecCount();
        queueUpdate(observer);
      }
    }
  }

  return [read, write];
}
```

---

## Part 3: Testing

### Step 5: Write Comprehensive Tests

**tests/scheduler.test.ts:**
```typescript
import { describe, test, expect, vi } from 'vitest';
import { scheduleQueue, queueUpdate, flushQueue, batch } from '../src/scheduler';
import { createSignal } from '../src/signal';
import { ComputationState } from '../src/types';

describe('Scheduler', () => {
  test('schedules work asynchronously', async () => {
    let executed = false;

    const computation = {
      fn: () => { executed = true; },
      state: ComputationState.STALE,
      value: undefined,
      observers: null,
      sources: null,
      priority: 0,
      version: 0,
      owned: null,
      owner: null
    };

    queueUpdate(computation);

    expect(executed).toBe(false);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(executed).toBe(true);
  });

  test('respects priority ordering', async () => {
    const order: number[] = [];

    const low = {
      fn: () => order.push(1),
      state: ComputationState.STALE,
      priority: 1,
      value: undefined,
      observers: null,
      sources: null,
      version: 0,
      owned: null,
      owner: null
    };

    const high = {
      fn: () => order.push(3),
      state: ComputationState.STALE,
      priority: 3,
      value: undefined,
      observers: null,
      sources: null,
      version: 0,
      owned: null,
      owner: null
    };

    const medium = {
      fn: () => order.push(2),
      state: ComputationState.STALE,
      priority: 2,
      value: undefined,
      observers: null,
      sources: null,
      version: 0,
      owned: null,
      owner: null
    };

    queueUpdate(low);
    queueUpdate(high);
    queueUpdate(medium);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(order).toEqual([3, 2, 1]);
  });
});

describe('Batching', () => {
  test('defers updates until batch completes', () => {
    let runs = 0;
    
    const [value, setValue] = createSignal(0);
    
    // Create mock effect
    const effect = {
      fn: () => {
        value();
        runs++;
      },
      state: ComputationState.STALE,
      value: undefined,
      observers: null,
      sources: null,
      priority: 0,
      version: 0,
      owned: null,
      owner: null
    };

    batch(() => {
      setValue(1);
      setValue(2);
      setValue(3);
      expect(runs).toBe(0); // Not run yet
    });

    expect(runs).toBe(1); // Ran once after batch
  });
});
```

**tests/performance.test.ts:**
```typescript
import { describe, test, expect } from 'vitest';
import { batch } from '../src/batch';
import { createSignal } from '../src/signal';

describe('Performance', () => {
  test('batching reduces effect runs', () => {
    const [a, setA] = createSignal(0);
    const [b, setB] = createSignal(0);
    
    let runs = 0;
    // Mock effect that depends on both signals
    
    // Without batch
    runs = 0;
    setA(1);
    setB(2);
    const unbatchedRuns = runs;
    
    // With batch
    runs = 0;
    batch(() => {
      setA(3);
      setB(4);
    });
    const batchedRuns = runs;
    
    expect(batchedRuns).toBeLessThan(unbatchedRuns);
  });

  test('handles large update volumes', async () => {
    const signals = Array.from({ length: 1000 }, () => createSignal(0));
    
    const start = performance.now();
    
    batch(() => {
      signals.forEach(([_, set]) => set(Math.random()));
    });
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(100); // Should complete quickly
  });
});
```

---

## Part 4: Advanced Features

### Step 6: Priority System

**src/priority.ts:**
```typescript
export const enum Priority {
  IMMEDIATE = 1000,    // Render effects
  HIGH = 100,          // User interactions
  NORMAL = 50,         // Regular effects
  LOW = 10,            // Analytics, logging
  IDLE = 0             // Background work
}

/**
 * Set computation priority
 */
export function withPriority<T>(
  priority: Priority,
  fn: () => T
): T {
  // Store current priority
  const prevPriority = currentPriority;
  currentPriority = priority;
  
  try {
    return fn();
  } finally {
    currentPriority = prevPriority;
  }
}

let currentPriority = Priority.NORMAL;

export function getCurrentPriority(): Priority {
  return currentPriority;
}
```

### Step 7: Debugging Tools

**src/debug.ts:**
```typescript
import { Computation } from './types';

export interface SchedulerStats {
  queueLength: number;
  execCount: number;
  totalUpdates: number;
  averageUpdateTime: number;
}

let totalUpdates = 0;
let totalUpdateTime = 0;

/**
 * Get current scheduler statistics
 */
export function getSchedulerStats(): SchedulerStats {
  return {
    queueLength: Updates.length,
    execCount: getExecCount(),
    totalUpdates,
    averageUpdateTime: totalUpdates > 0 
      ? totalUpdateTime / totalUpdates 
      : 0
  };
}

/**
 * Track update timing
 */
export function trackUpdate(fn: () => void): void {
  const start = performance.now();
  fn();
  const duration = performance.now() - start;
  
  totalUpdates++;
  totalUpdateTime += duration;
}

/**
 * Visualize update queue
 */
export function logQueue(): void {
  console.group('Update Queue');
  Updates.forEach((comp, i) => {
    console.log(`${i}: Priority ${comp.priority}, State ${comp.state}`);
  });
  console.groupEnd();
}

/**
 * Reset statistics
 */
export function resetStats(): void {
  totalUpdates = 0;
  totalUpdateTime = 0;
}
```

---

## Part 5: Examples and Demos

### Example 1: Basic Scheduling

**examples/basic.ts:**
```typescript
import { createSignal } from '../src/signal';
import { batch } from '../src/batch';

// Create signals
const [count, setCount] = createSignal(0);
const [name, setName] = createSignal('John');

// Without batching
console.log('Without batching:');
setCount(1);
setCount(2);
setCount(3);

// With batching
console.log('\nWith batching:');
batch(() => {
  setCount(10);
  setCount(20);
  setCount(30);
});

console.log('Final count:', count());
```

### Example 2: Priority Handling

**examples/priority.ts:**
```typescript
import { withPriority, Priority } from '../src/priority';
import { createSignal } from '../src/signal';

const [uiState, setUiState] = createSignal('idle');
const [analytics, setAnalytics] = createSignal({});

// High priority UI update
withPriority(Priority.HIGH, () => {
  setUiState('loading');
});

// Low priority analytics
withPriority(Priority.LOW, () => {
  setAnalytics({ event: 'page_view' });
});
```

### Example 3: Performance Measurement

**examples/performance.ts:**
```typescript
import { batch } from '../src/batch';
import { createSignal } from '../src/signal';
import { getSchedulerStats, resetStats } from '../src/debug';

// Create many signals
const signals = Array.from({ length: 100 }, () => createSignal(0));

// Measure unbatched updates
resetStats();
const start1 = performance.now();
signals.forEach(([_, set]) => set(Math.random()));
const unbatched = performance.now() - start1;

// Measure batched updates
resetStats();
const start2 = performance.now();
batch(() => {
  signals.forEach(([_, set]) => set(Math.random()));
});
const batched = performance.now() - start2;

console.log('Unbatched time:', unbatched, 'ms');
console.log('Batched time:', batched, 'ms');
console.log('Improvement:', (unbatched / batched).toFixed(2), 'x faster');
console.log('Stats:', getSchedulerStats());
```

---

## Part 6: Challenges

### Challenge 1: Implement Debounced Scheduling

Create a `debounceSchedule()` function that delays execution until updates stop:

```typescript
function debounceSchedule(delay: number): void {
  // Your implementation
}
```

### Challenge 2: Add Time Slicing

Implement time slicing to prevent blocking the main thread:

```typescript
function scheduleWithTimeSlicing(maxTime: number): void {
  // Yield to browser if updates take too long
}
```

### Challenge 3: Infinite Loop Detection

Add detection for infinite update loops:

```typescript
function detectInfiniteLoop(threshold: number): void {
  // Throw error if same computation updates too many times
}
```

---

## Evaluation Criteria

### Functionality (40%)
- [ ] MessageChannel scheduling works correctly
- [ ] Update queue maintains priority order
- [ ] Batching prevents intermediate effects
- [ ] No race conditions or memory leaks

### Code Quality (30%)
- [ ] Clean, readable TypeScript code
- [ ] Proper type definitions
- [ ] Good error handling
- [ ] Clear comments

### Testing (20%)
- [ ] Comprehensive unit tests
- [ ] Performance benchmarks
- [ ] Edge case coverage
- [ ] Integration tests

### Documentation (10%)
- [ ] Clear API documentation
- [ ] Usage examples
- [ ] Performance considerations
- [ ] Architecture explanation

---

## Bonus Features

Implement one or more of these advanced features:

1. **Scheduler Profiling**
   - Visual timeline of update execution
   - Flamegraph of computation dependencies

2. **Custom Scheduling Strategies**
   - requestIdleCallback integration
   - requestAnimationFrame mode

3. **Pause/Resume**
   - Ability to pause the scheduler
   - Drain queue manually

4. **Update Coalescing**
   - Merge duplicate updates automatically
   - Dedupe by computation identity

---

## Submission

Your completed project should include:

1. **Source code** in `src/` directory
2. **Tests** in `tests/` directory with > 80% coverage
3. **Examples** in `examples/` directory
4. **README.md** with:
   - Setup instructions
   - API documentation
   - Performance characteristics
   - Architecture decisions

---

## Solution Hints

<details>
<summary>Click to reveal hints</summary>

### Hint 1: MessageChannel Setup
```typescript
// Create channel once
const channel = new MessageChannel();
channel.port1.onmessage = handleMessage;

// Schedule by posting message
channel.port2.postMessage(null);
```

### Hint 2: Priority Queue
```typescript
// Binary heap or sorted insertion
function insertByPriority(item: Computation) {
  let i = 0;
  while (i < queue.length && queue[i].priority >= item.priority) {
    i++;
  }
  queue.splice(i, 0, item);
}
```

### Hint 3: Prevent Re-entrance
```typescript
let running = false;

function runUpdates() {
  if (running) return;
  running = true;
  try {
    // Execute updates
  } finally {
    running = false;
  }
}
```

</details>

---

## Next Steps

After completing this project:
1. Compare your implementation with Solid.js's source code
2. Profile your scheduler with realistic workloads
3. Integrate with a simple UI framework
4. Explore concurrent rendering patterns

---

## Resources

- [Solid.js Scheduler Source](https://github.com/solidjs/solid/blob/main/packages/solid/src/reactive/scheduler.ts)
- [MessageChannel API](https://developer.mozilla.org/en-US/docs/Web/API/MessageChannel)
- [Priority Queue Algorithms](https://en.wikipedia.org/wiki/Priority_queue)
- [Event Loop Visualization](http://latentflip.com/loupe/)
