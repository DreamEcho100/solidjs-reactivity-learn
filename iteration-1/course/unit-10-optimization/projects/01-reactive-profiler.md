# Project 1: Reactive Performance Profiler

## Overview

Build a comprehensive performance profiler for reactive applications that provides insights into update patterns, identifies bottlenecks, and suggests optimizations.

## Objectives

- Track all reactive updates
- Measure update durations
- Identify performance bottlenecks
- Visualize dependency graphs
- Generate optimization reports

## Features

### Core Features

1. **Update Tracking**
   - Record every signal update
   - Measure effect execution times
   - Track memo computations
   - Monitor batch operations

2. **Performance Metrics**
   - Average update time
   - P95/P99 latencies
   - Updates per second
   - Memory usage trends

3. **Bottleneck Detection**
   - Identify slow computations
   - Find excessive updates
   - Detect deep dependency chains
   - Flag memory leaks

4. **Visualization**
   - Real-time update timeline
   - Dependency graph
   - Performance charts
   - Flamegraphs

5. **Reporting**
   - Performance summary
   - Optimization suggestions
   - Export data (JSON/CSV)
   - Compare baseline vs optimized

## Implementation Guide

### Step 1: Setup Project

```bash
npm create vite@latest reactive-profiler -- --template solid-ts
cd reactive-profiler
npm install
npm install d3 chart.js
```

### Step 2: Create Profiler Core

```typescript
// src/profiler/core.ts
export interface UpdateRecord {
  id: string;
  type: 'signal' | 'effect' | 'memo';
  name: string;
  timestamp: number;
  duration: number;
  sources: string[];
  value?: any;
}

export class ReactiveProfiler {
  private updates: UpdateRecord[] = [];
  private running = false;
  private maxRecords = 10000;
  
  start() {
    this.running = true;
    this.updates = [];
    this.hookIntoReactiveSystem();
  }
  
  stop() {
    this.running = false;
    return this.analyze();
  }
  
  private hookIntoReactiveSystem() {
    // Hook into DevHooks
    if (window.SolidJS?.DevHooks) {
      const DevHooks = window.SolidJS.DevHooks;
      
      DevHooks.afterUpdate = (computation) => {
        if (!this.running) return;
        
        this.recordUpdate({
          id: computation.id || String(this.updates.length),
          type: computation.pure ? 'memo' : 'effect',
          name: computation.name || 'unnamed',
          timestamp: performance.now(),
          duration: computation.updatedAt - computation.startedAt,
          sources: computation.sources?.map(s => s.name) || []
        });
      };
      
      DevHooks.afterCreateSignal = (signal) => {
        if (!this.running) return;
        
        this.recordUpdate({
          id: signal.id || String(this.updates.length),
          type: 'signal',
          name: signal.name || 'unnamed',
          timestamp: performance.now(),
          duration: 0,
          sources: [],
          value: signal.value
        });
      };
    }
  }
  
  private recordUpdate(update: UpdateRecord) {
    this.updates.push(update);
    
    // Limit memory usage
    if (this.updates.length > this.maxRecords) {
      this.updates.shift();
    }
  }
  
  analyze() {
    return {
      summary: this.getSummary(),
      bottlenecks: this.findBottlenecks(),
      timeline: this.updates,
      suggestions: this.generateSuggestions()
    };
  }
  
  private getSummary() {
    const durations = this.updates
      .filter(u => u.duration > 0)
      .map(u => u.duration);
    
    const sorted = durations.slice().sort((a, b) => a - b);
    
    return {
      totalUpdates: this.updates.length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      slowest: Math.max(...durations)
    };
  }
  
  private findBottlenecks() {
    const byName = new Map<string, UpdateRecord[]>();
    
    this.updates.forEach(update => {
      const existing = byName.get(update.name) || [];
      existing.push(update);
      byName.set(update.name, existing);
    });
    
    return Array.from(byName.entries())
      .map(([name, updates]) => ({
        name,
        count: updates.length,
        totalDuration: updates.reduce((sum, u) => sum + u.duration, 0),
        avgDuration: updates.reduce((sum, u) => sum + u.duration, 0) / updates.length
      }))
      .sort((a, b) => b.totalDuration - a.totalDuration)
      .slice(0, 10);
  }
  
  private generateSuggestions() {
    const suggestions = [];
    const summary = this.getSummary();
    
    // Check for excessive updates
    if (summary.totalUpdates > 1000) {
      suggestions.push({
        type: 'excessive-updates',
        severity: 'high',
        message: `${summary.totalUpdates} updates detected. Consider batching or reducing reactivity.`
      });
    }
    
    // Check for slow updates
    if (summary.p95 > 10) {
      suggestions.push({
        type: 'slow-updates',
        severity: 'medium',
        message: `P95 latency is ${summary.p95.toFixed(2)}ms. Optimize slow computations.`
      });
    }
    
    return suggestions;
  }
}
```

### Step 3: Create Visualization Components

```typescript
// src/components/Timeline.tsx
import { For, createSignal } from 'solid-js';
import type { UpdateRecord } from '../profiler/core';

interface TimelineProps {
  updates: UpdateRecord[];
}

export function Timeline(props: TimelineProps) {
  const [selectedUpdate, setSelectedUpdate] = createSignal<UpdateRecord | null>(null);
  
  return (
    <div class="timeline">
      <h2>Update Timeline</h2>
      
      <div class="timeline-container">
        <For each={props.updates}>
          {(update) => (
            <div
              class={`update-bar ${update.type}`}
              style={{
                width: `${update.duration * 10}px`,
                left: `${(update.timestamp % 10000) / 10}px`
              }}
              onClick={() => setSelectedUpdate(update)}
            >
              <span class="update-name">{update.name}</span>
            </div>
          )}
        </For>
      </div>
      
      {selectedUpdate() && (
        <div class="update-details">
          <h3>{selectedUpdate()!.name}</h3>
          <p>Type: {selectedUpdate()!.type}</p>
          <p>Duration: {selectedUpdate()!.duration.toFixed(2)}ms</p>
          <p>Sources: {selectedUpdate()!.sources.join(', ')}</p>
        </div>
      )}
    </div>
  );
}
```

```typescript
// src/components/PerformanceChart.tsx
import { onMount } from 'solid-js';
import { Chart } from 'chart.js/auto';

interface PerformanceChartProps {
  data: { timestamp: number; duration: number }[];
}

export function PerformanceChart(props: PerformanceChartProps) {
  let canvas: HTMLCanvasElement;
  
  onMount(() => {
    new Chart(canvas, {
      type: 'line',
      data: {
        labels: props.data.map(d => new Date(d.timestamp).toLocaleTimeString()),
        datasets: [{
          label: 'Update Duration (ms)',
          data: props.data.map(d => d.duration),
          borderColor: 'rgb(75, 192, 192)',
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  });
  
  return <canvas ref={canvas!} />;
}
```

### Step 4: Create Dashboard

```typescript
// src/App.tsx
import { createSignal, Show } from 'solid-js';
import { ReactiveProfiler } from './profiler/core';
import { Timeline } from './components/Timeline';
import { PerformanceChart } from './components/PerformanceChart';

function App() {
  const [profiler] = createSignal(new ReactiveProfiler());
  const [profiling, setProfiling] = createSignal(false);
  const [results, setResults] = createSignal(null);
  
  const startProfiling = () => {
    profiler().start();
    setProfiling(true);
  };
  
  const stopProfiling = () => {
    const analysis = profiler().stop();
    setResults(analysis);
    setProfiling(false);
  };
  
  return (
    <div class="app">
      <header>
        <h1>Reactive Performance Profiler</h1>
        
        <div class="controls">
          <Show
            when={!profiling()}
            fallback={<button onClick={stopProfiling}>Stop Profiling</button>}
          >
            <button onClick={startProfiling}>Start Profiling</button>
          </Show>
        </div>
      </header>
      
      <Show when={results()}>
        <div class="results">
          <section class="summary">
            <h2>Summary</h2>
            <div class="stats">
              <div class="stat">
                <span class="label">Total Updates</span>
                <span class="value">{results().summary.totalUpdates}</span>
              </div>
              <div class="stat">
                <span class="label">Avg Duration</span>
                <span class="value">{results().summary.avgDuration.toFixed(2)}ms</span>
              </div>
              <div class="stat">
                <span class="label">P95 Latency</span>
                <span class="value">{results().summary.p95.toFixed(2)}ms</span>
              </div>
            </div>
          </section>
          
          <section class="timeline-section">
            <Timeline updates={results().timeline} />
          </section>
          
          <section class="chart-section">
            <h2>Performance Trend</h2>
            <PerformanceChart data={results().timeline} />
          </section>
          
          <section class="bottlenecks">
            <h2>Bottlenecks</h2>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Count</th>
                  <th>Total Time</th>
                  <th>Avg Time</th>
                </tr>
              </thead>
              <tbody>
                <For each={results().bottlenecks}>
                  {(bottleneck) => (
                    <tr>
                      <td>{bottleneck.name}</td>
                      <td>{bottleneck.count}</td>
                      <td>{bottleneck.totalDuration.toFixed(2)}ms</td>
                      <td>{bottleneck.avgDuration.toFixed(2)}ms</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </section>
          
          <section class="suggestions">
            <h2>Optimization Suggestions</h2>
            <For each={results().suggestions}>
              {(suggestion) => (
                <div class={`suggestion ${suggestion.severity}`}>
                  <strong>{suggestion.type}</strong>
                  <p>{suggestion.message}</p>
                </div>
              )}
            </For>
          </section>
        </div>
      </Show>
    </div>
  );
}

export default App;
```

## Testing

```typescript
// src/profiler/core.test.ts
import { describe, it, expect } from 'vitest';
import { createRoot, createSignal, createEffect } from 'solid-js';
import { ReactiveProfiler } from './core';

describe('ReactiveProfiler', () => {
  it('tracks updates', () => {
    const profiler = new ReactiveProfiler();
    profiler.start();
    
    createRoot(dispose => {
      const [count, setCount] = createSignal(0);
      
      createEffect(() => {
        count();
      });
      
      setCount(1);
      setCount(2);
      
      const results = profiler.stop();
      
      expect(results.summary.totalUpdates).toBeGreaterThan(0);
      
      dispose();
    });
  });
  
  it('identifies bottlenecks', () => {
    const profiler = new ReactiveProfiler();
    profiler.start();
    
    createRoot(dispose => {
      const [count, setCount] = createSignal(0);
      
      // Create slow computation
      createEffect(() => {
        const value = count();
        let sum = 0;
        for (let i = 0; i < 1000000; i++) {
          sum += i;
        }
      });
      
      setCount(1);
      
      const results = profiler.stop();
      
      expect(results.bottlenecks.length).toBeGreaterThan(0);
      
      dispose();
    });
  });
});
```

## Deliverables

1. **Working Profiler**
   - [ ] Tracks all reactive updates
   - [ ] Measures performance accurately
   - [ ] Identifies bottlenecks
   - [ ] Generates suggestions

2. **Visualization**
   - [ ] Update timeline
   - [ ] Performance charts
   - [ ] Dependency graph
   - [ ] Interactive controls

3. **Documentation**
   - [ ] Usage guide
   - [ ] API documentation
   - [ ] Example applications
   - [ ] Performance tips

4. **Tests**
   - [ ] Unit tests for profiler
   - [ ] Integration tests
   - [ ] Performance benchmarks

## Extensions

1. **Export Functionality**
   - Export to JSON
   - Export to CSV
   - Generate PDF report

2. **Real-time Mode**
   - Stream updates to dashboard
   - Live performance graphs
   - Auto-detect regressions

3. **Integration**
   - Chrome DevTools extension
   - VS Code extension
   - CI/CD integration

## Resources

- [Chart.js Documentation](https://www.chartjs.org/docs/)
- [D3.js for Graphs](https://d3js.org/)
- [Performance API](https://developer.mozilla.org/en-US/docs/Web/API/Performance)

## Evaluation

- ✅ Profiler accurately tracks updates
- ✅ Visualization is clear and useful
- ✅ Bottleneck detection works
- ✅ Suggestions are actionable
- ✅ Code is well-tested
- ✅ Documentation is complete
