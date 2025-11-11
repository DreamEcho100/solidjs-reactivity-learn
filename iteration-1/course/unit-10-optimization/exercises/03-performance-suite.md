# Exercise 3: Performance Suite

**Difficulty:** ⭐⭐⭐⭐ (Advanced)

## Objective

Create a comprehensive performance testing and optimization suite for reactive applications.

## Requirements

Build a suite that includes:
- Benchmarking tools
- Performance profilers
- Optimization analyzers
- Comparison utilities

## Tasks

### Task 1: Create Benchmark Suite

```javascript
class BenchmarkSuite {
  constructor() {
    this.benchmarks = [];
  }
  
  add(name, setup, fn, options = {}) {
    this.benchmarks.push({ name, setup, fn, options });
  }
  
  async run() {
    const results = [];
    
    for (const benchmark of this.benchmarks) {
      const result = await this.runBenchmark(benchmark);
      results.push(result);
    }
    
    return results;
  }
  
  async runBenchmark(benchmark) {
    const { iterations = 1000, warmup = 10 } = benchmark.options;
    const context = benchmark.setup();
    
    // Warmup
    for (let i = 0; i < warmup; i++) {
      await benchmark.fn(context);
    }
    
    // Measure
    const times = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await benchmark.fn(context);
      times.push(performance.now() - start);
    }
    
    // Cleanup
    if (context.dispose) context.dispose();
    
    return {
      name: benchmark.name,
      iterations,
      times,
      stats: this.calculateStats(times)
    };
  }
  
  calculateStats(times) {
    const sorted = times.slice().sort((a, b) => a - b);
    
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: times.reduce((a, b) => a + b) / times.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }
  
  report(results) {
    console.table(results.map(r => ({
      name: r.name,
      mean: `${r.stats.mean.toFixed(3)}ms`,
      median: `${r.stats.median.toFixed(3)}ms`,
      p95: `${r.stats.p95.toFixed(3)}ms`,
      min: `${r.stats.min.toFixed(3)}ms`,
      max: `${r.stats.max.toFixed(3)}ms`
    })));
  }
}
```

**Usage:**

```javascript
const suite = new BenchmarkSuite();

suite.add('Signal creation', 
  () => ({}),
  () => {
    const [count, setCount] = createSignal(0);
  }
);

suite.add('Effect execution',
  () => {
    const [count, setCount] = createSignal(0);
    let runs = 0;
    createEffect(() => { count(); runs++; });
    return { setCount };
  },
  (ctx) => {
    ctx.setCount(Math.random());
  }
);

const results = await suite.run();
suite.report(results);
```

### Task 2: Update Profiler

```javascript
class UpdateProfiler {
  constructor() {
    this.profiles = [];
    this.currentProfile = null;
  }
  
  start(name) {
    this.currentProfile = {
      name,
      updates: [],
      startTime: performance.now()
    };
  }
  
  recordUpdate(computation, duration) {
    if (!this.currentProfile) return;
    
    this.currentProfile.updates.push({
      computation: computation.name || computation.id,
      duration,
      timestamp: performance.now()
    });
  }
  
  stop() {
    if (!this.currentProfile) return null;
    
    this.currentProfile.endTime = performance.now();
    this.currentProfile.totalDuration = 
      this.currentProfile.endTime - this.currentProfile.startTime;
    
    this.profiles.push(this.currentProfile);
    
    const profile = this.currentProfile;
    this.currentProfile = null;
    
    return this.analyze(profile);
  }
  
  analyze(profile) {
    const updatesByComputation = new Map();
    
    profile.updates.forEach(update => {
      const existing = updatesByComputation.get(update.computation) || {
        count: 0,
        totalDuration: 0
      };
      
      existing.count++;
      existing.totalDuration += update.duration;
      
      updatesByComputation.set(update.computation, existing);
    });
    
    return {
      name: profile.name,
      totalUpdates: profile.updates.length,
      totalDuration: profile.totalDuration,
      updatesByComputation: Array.from(updatesByComputation.entries())
        .map(([name, stats]) => ({
          name,
          count: stats.count,
          totalDuration: stats.totalDuration,
          avgDuration: stats.totalDuration / stats.count
        }))
        .sort((a, b) => b.totalDuration - a.totalDuration)
    };
  }
}
```

### Task 3: Optimization Analyzer

```javascript
class OptimizationAnalyzer {
  analyzeReactiveGraph(root) {
    const issues = [];
    
    // Check for unnecessary effects
    const effects = this.findAllEffects(root);
    effects.forEach(effect => {
      if (effect.sources.length === 0) {
        issues.push({
          type: 'unnecessary-effect',
          severity: 'warning',
          message: `Effect "${effect.name}" has no dependencies`,
          suggestion: 'Remove effect or add dependencies'
        });
      }
    });
    
    // Check for deep computation chains
    const chains = this.findComputationChains(root);
    chains.forEach(chain => {
      if (chain.length > 5) {
        issues.push({
          type: 'deep-chain',
          severity: 'warning',
          message: `Computation chain is ${chain.length} levels deep`,
          suggestion: 'Consider flattening the computation'
        });
      }
    });
    
    // Check for excessive observers
    const signals = this.findAllSignals(root);
    signals.forEach(signal => {
      if (signal.observers.length > 100) {
        issues.push({
          type: 'excessive-observers',
          severity: 'error',
          message: `Signal "${signal.name}" has ${signal.observers.length} observers`,
          suggestion: 'Use selectors or split into multiple signals'
        });
      }
    });
    
    return issues;
  }
  
  suggestOptimizations(issues) {
    const suggestions = [];
    
    issues.forEach(issue => {
      switch (issue.type) {
        case 'unnecessary-effect':
          suggestions.push({
            issue,
            optimization: 'Remove the effect',
            impact: 'Low',
            difficulty: 'Easy'
          });
          break;
          
        case 'deep-chain':
          suggestions.push({
            issue,
            optimization: 'Flatten computation chain',
            impact: 'Medium',
            difficulty: 'Medium'
          });
          break;
          
        case 'excessive-observers':
          suggestions.push({
            issue,
            optimization: 'Use createSelector or split signal',
            impact: 'High',
            difficulty: 'Medium'
          });
          break;
      }
    });
    
    return suggestions;
  }
}
```

### Task 4: Comparison Utilities

```javascript
class PerformanceComparator {
  compare(baseline, optimized) {
    const improvement = {
      updates: this.compareUpdates(baseline, optimized),
      memory: this.compareMemory(baseline, optimized),
      duration: this.compareDuration(baseline, optimized)
    };
    
    return improvement;
  }
  
  compareUpdates(baseline, optimized) {
    const diff = baseline.updates - optimized.updates;
    const percent = (diff / baseline.updates) * 100;
    
    return {
      baseline: baseline.updates,
      optimized: optimized.updates,
      difference: diff,
      improvement: `${percent.toFixed(1)}%`
    };
  }
  
  compareMemory(baseline, optimized) {
    // Similar to compareUpdates
  }
  
  compareDuration(baseline, optimized) {
    // Similar to compareUpdates
  }
  
  report(improvement) {
    console.log('Performance Comparison');
    console.log('=====================');
    console.table([
      {
        metric: 'Updates',
        baseline: improvement.updates.baseline,
        optimized: improvement.updates.optimized,
        improvement: improvement.updates.improvement
      },
      // ... other metrics
    ]);
  }
}
```

## Example Usage

```javascript
// Create suite
const perfSuite = {
  benchmark: new BenchmarkSuite(),
  profiler: new UpdateProfiler(),
  analyzer: new OptimizationAnalyzer(),
  comparator: new PerformanceComparator()
};

// Add benchmarks
perfSuite.benchmark.add('Baseline', ...);
perfSuite.benchmark.add('Optimized', ...);

// Run and compare
const results = await perfSuite.benchmark.run();
const comparison = perfSuite.comparator.compare(results[0], results[1]);
perfSuite.comparator.report(comparison);

// Analyze for issues
const issues = perfSuite.analyzer.analyzeReactiveGraph(root);
const suggestions = perfSuite.analyzer.suggestOptimizations(issues);

console.log('Optimization Suggestions:');
suggestions.forEach(s => {
  console.log(`- ${s.optimization} (Impact: ${s.impact}, Difficulty: ${s.difficulty})`);
});
```

## Testing

```javascript
import { test, expect } from 'vitest';

test('benchmark suite runs correctly', async () => {
  const suite = new BenchmarkSuite();
  
  suite.add('test', 
    () => ({}),
    () => { /* work */ },
    { iterations: 10 }
  );
  
  const results = await suite.run();
  
  expect(results).toHaveLength(1);
  expect(results[0].stats).toHaveProperty('mean');
});

test('profiler detects updates', () => {
  const profiler = new UpdateProfiler();
  
  profiler.start('test');
  profiler.recordUpdate({ name: 'effect1' }, 5);
  profiler.recordUpdate({ name: 'effect1' }, 3);
  
  const analysis = profiler.stop();
  
  expect(analysis.totalUpdates).toBe(2);
});

test('analyzer finds issues', () => {
  const analyzer = new OptimizationAnalyzer();
  
  // Create graph with issues
  const root = createTestGraph();
  
  const issues = analyzer.analyzeReactiveGraph(root);
  
  expect(issues.length).toBeGreaterThan(0);
});
```

## Submission

Submit:
1. Complete performance suite implementation
2. Example benchmarks for common patterns
3. Documentation with usage examples
4. Test suite

## Evaluation Criteria

- ✅ Accurate benchmarking
- ✅ Useful profiling data
- ✅ Actionable suggestions
- ✅ Clear comparison reports
- ✅ Well-tested code
