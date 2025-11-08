# Exercise 1: Memory Profiler

**Difficulty:** ⭐⭐⭐⭐⭐ (Advanced)

## Objective

Build a comprehensive memory profiler that can detect leaks, track allocations, and provide actionable insights for reactive applications.

## Requirements

### Part 1: Basic Tracking

Implement a memory tracker that:
- Tracks all signal creations
- Tracks all computation creations
- Records cleanup operations
- Detects orphaned computations

### Part 2: Leak Detection

Add leak detection that:
- Identifies computations that were never disposed
- Finds signals with no observers (potential leaks)
- Detects circular references
- Reports memory usage over time

### Part 3: Visualization

Create a visualization that:
- Shows allocation timeline
- Displays current memory usage
- Highlights potential leaks
- Provides cleanup suggestions

## Starter Code

```javascript
class MemoryProfiler {
  constructor() {
    this.signals = new WeakMap();
    this.computations = new WeakMap();
    this.allocations = [];
    this.registry = new FinalizationRegistry((id) => {
      this.handleGarbageCollection(id);
    });
  }
  
  // TODO: Implement tracking methods
  trackSignal(signal) {
    // Your code here
  }
  
  trackComputation(computation) {
    // Your code here
  }
  
  // TODO: Implement leak detection
  detectLeaks() {
    // Your code here
  }
  
  // TODO: Implement reporting
  generateReport() {
    // Your code here
  }
}
```

## Tasks

1. **Implement Signal Tracking**
   ```javascript
   // Track signal creation with metadata
   trackSignal(signal) {
     const metadata = {
       id: this.nextId++,
       type: 'signal',
       created: Date.now(),
       value: signal.value,
       observers: [],
       stack: new Error().stack
     };
     
     this.signals.set(signal, metadata);
     this.allocations.push(metadata);
     
     // Track for GC
     this.registry.register(signal, metadata.id);
   }
   ```

2. **Implement Computation Tracking**
   ```javascript
   trackComputation(computation) {
     // Similar to signal tracking
     // Track sources, observers, owner
   }
   ```

3. **Detect Memory Leaks**
   ```javascript
   detectLeaks() {
     const leaks = [];
     
     // Find orphaned computations
     for (const [comp, metadata] of this.computations) {
       if (!comp.owner && comp.state !== DISPOSED) {
         leaks.push({
           type: 'orphaned-computation',
           id: metadata.id,
           created: metadata.created,
           age: Date.now() - metadata.created
         });
       }
     }
     
     // Find circular references
     // Your code here
     
     return leaks;
   }
   ```

4. **Generate Report**
   ```javascript
   generateReport() {
     return {
       summary: {
         totalSignals: this.signals.size,
         totalComputations: this.computations.size,
         totalAllocations: this.allocations.length
       },
       leaks: this.detectLeaks(),
       timeline: this.allocations,
       recommendations: this.getRecommendations()
     };
   }
   ```

5. **Create Visualization**
   ```javascript
   visualize() {
     const report = this.generateReport();
     
     // Create HTML report
     const html = `
       <!DOCTYPE html>
       <html>
       <head>
         <style>
           /* Your styles */
         </style>
       </head>
       <body>
         <h1>Memory Profile Report</h1>
         <!-- Display report data -->
       </body>
       </html>
     `;
     
     return html;
   }
   ```

## Testing

```javascript
import { test, expect } from 'vitest';

test('detects memory leaks', () => {
  const profiler = new MemoryProfiler();
  
  // Create leak
  createRoot(() => {
    const [count] = createSignal(0);
    createEffect(() => count());
    // Never disposed!
  });
  
  const report = profiler.generateReport();
  expect(report.leaks.length).toBeGreaterThan(0);
});

test('tracks allocations over time', () => {
  const profiler = new MemoryProfiler();
  
  for (let i = 0; i < 100; i++) {
    createSignal(i);
  }
  
  const report = profiler.generateReport();
  expect(report.timeline.length).toBe(100);
});
```

## Bonus Challenges

1. **Chrome DevTools Integration**
   - Export data in Chrome's heap snapshot format
   - Create a DevTools panel

2. **Real-time Monitoring**
   - Stream data to a monitoring dashboard
   - Set up alerts for memory thresholds

3. **Automatic Leak Prevention**
   - Suggest code improvements
   - Auto-dispose orphaned computations

## Expected Output

```
Memory Profile Report
===================

Summary:
  Total Signals: 234
  Total Computations: 187
  Total Allocations: 421
  Current Memory: 2.3 MB

Leaks Detected:
  ⚠️  5 orphaned computations
  ⚠️  12 signals with no observers
  ⚠️  2 circular references

Recommendations:
  - Use createRoot for top-level components
  - Call dispose() when components unmount
  - Review circular dependencies in effects
```

## Solution Hints

<details>
<summary>Hint 1: Tracking Sources</summary>

Use `DevHooks` to intercept creations:
```javascript
DevHooks.afterCreateSignal = (signal) => {
  profiler.trackSignal(signal);
};

DevHooks.afterCreateOwner = (owner) => {
  if (owner.fn) {
    profiler.trackComputation(owner);
  }
};
```
</details>

<details>
<summary>Hint 2: Detecting Circular References</summary>

Use depth-first search to find cycles:
```javascript
function hasCycle(computation, visited = new Set(), path = new Set()) {
  if (path.has(computation)) return true;
  if (visited.has(computation)) return false;
  
  visited.add(computation);
  path.add(computation);
  
  for (const source of computation.sources || []) {
    if (hasCycle(source, visited, path)) return true;
  }
  
  path.delete(computation);
  return false;
}
```
</details>

<details>
<summary>Hint 3: Memory Estimation</summary>

Estimate object size:
```javascript
function estimateSize(obj) {
  let bytes = 0;
  
  function traverse(value) {
    if (value === null || typeof value !== 'object') {
      bytes += 8; // Primitive
      return;
    }
    
    bytes += 32; // Object overhead
    
    for (const key in value) {
      bytes += key.length * 2; // UTF-16
      traverse(value[key]);
    }
  }
  
  traverse(obj);
  return bytes;
}
```
</details>

## Submission

Submit:
1. Complete `MemoryProfiler` class
2. Test suite with 10+ tests
3. HTML visualization
4. README with usage instructions

## Evaluation Criteria

- ✅ Correctly tracks all allocations
- ✅ Accurately detects leaks
- ✅ Provides actionable insights
- ✅ Clean, well-documented code
- ✅ Comprehensive tests
