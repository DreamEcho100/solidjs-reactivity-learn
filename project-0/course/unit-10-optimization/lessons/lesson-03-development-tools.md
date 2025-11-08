# Lesson 3: Development Tools

## Introduction

Building reactive applications is easier with proper development tools. This lesson covers debugging techniques, visualization tools, and building custom dev tools for reactive systems.

## The DevHooks System

### Understanding DevHooks

Solid.js provides a hook system for development tools:

```typescript
// From signal.ts
export interface DevHooks {
  afterUpdate?: (computation: Computation) => void;
  afterCreateOwner?: (owner: Owner) => void;
  afterCreateSignal?: (signal: SignalState) => void;
  registerGraph?: (name: string, value: any) => void;
}

export const DevHooks: DevHooks = {};
```

**Purpose:**
- Monitor reactive system behavior
- Track signal/effect creation
- Visualize dependency graphs
- Profile performance

### Implementing DevHooks

```javascript
// Development mode setup
const devState = {
  signals: new Map(),
  computations: new Map(),
  updates: []
};

if (import.meta.env.DEV) {
  DevHooks.afterCreateSignal = (signal) => {
    devState.signals.set(signal, {
      id: devState.signals.size,
      name: signal.name || `signal_${devState.signals.size}`,
      created: Date.now(),
      value: signal.value,
      observers: []
    });
  };
  
  DevHooks.afterCreateOwner = (owner) => {
    if (owner.fn) {  // It's a computation
      devState.computations.set(owner, {
        id: devState.computations.size,
        name: owner.name || `computation_${devState.computations.size}`,
        created: Date.now(),
        sources: []
      });
    }
  };
  
  DevHooks.afterUpdate = (computation) => {
    devState.updates.push({
      computation: computation.name,
      timestamp: Date.now(),
      duration: computation.updatedAt - computation.startedAt
    });
  };
}
```

### Naming Signals and Computations

```javascript
// Make debugging easier with names
function createNamedSignal(value, name) {
  const [get, set] = createSignal(value);
  
  if (import.meta.env.DEV) {
    get.name = name;
  }
  
  return [get, set];
}

function createNamedEffect(fn, name) {
  const effect = createEffect(fn);
  
  if (import.meta.env.DEV) {
    effect.name = name;
  }
  
  return effect;
}

// Usage
const [count, setCount] = createNamedSignal(0, 'counter');
createNamedEffect(() => {
  console.log('Count:', count());
}, 'logCounter');

// In DevTools, you see:
// Signal: "counter" = 0
// Effect: "logCounter" (depends on "counter")
```

## Reactive Graph Visualization

### Building a Graph Visualizer

```javascript
class ReactiveGraphVisualizer {
  constructor() {
    this.nodes = new Map();
    this.edges = [];
  }
  
  trackSignal(signal) {
    this.nodes.set(signal, {
      id: this.nodes.size,
      type: 'signal',
      name: signal.name || `S${this.nodes.size}`,
      value: signal.value,
      observers: new Set()
    });
  }
  
  trackComputation(computation) {
    this.nodes.set(computation, {
      id: this.nodes.size,
      type: computation.pure ? 'memo' : 'effect',
      name: computation.name || `C${this.nodes.size}`,
      sources: new Set()
    });
    
    // Track dependencies
    if (computation.sources) {
      computation.sources.forEach(source => {
        this.addEdge(source, computation);
      });
    }
  }
  
  addEdge(from, to) {
    this.edges.push({ from, to });
    
    const fromNode = this.nodes.get(from);
    const toNode = this.nodes.get(to);
    
    if (fromNode) fromNode.observers.add(to);
    if (toNode) toNode.sources.add(from);
  }
  
  toMermaid() {
    let mermaid = 'graph TD\n';
    
    // Add nodes
    for (const [node, data] of this.nodes) {
      const shape = data.type === 'signal' ? '([{}])' 
                  : data.type === 'memo' ? '{{}}' 
                  : '[]';
      const label = data.type === 'signal' 
        ? `${data.name}: ${data.value}` 
        : data.name;
      
      mermaid += `  ${data.id}${shape.replace('{}', label)}\n`;
    }
    
    // Add edges
    for (const edge of this.edges) {
      const fromId = this.nodes.get(edge.from).id;
      const toId = this.nodes.get(edge.to).id;
      mermaid += `  ${fromId} --> ${toId}\n`;
    }
    
    return mermaid;
  }
  
  toDOT() {
    let dot = 'digraph ReactiveGraph {\n';
    dot += '  rankdir=LR;\n';
    
    // Styling
    dot += '  node [shape=box, style=rounded];\n';
    
    // Add nodes with colors
    for (const [node, data] of this.nodes) {
      const color = data.type === 'signal' ? 'lightblue'
                  : data.type === 'memo' ? 'lightgreen'
                  : 'lightyellow';
      
      const label = data.type === 'signal' 
        ? `${data.name}\\n${data.value}` 
        : data.name;
      
      dot += `  ${data.id} [label="${label}", fillcolor=${color}, style=filled];\n`;
    }
    
    // Add edges
    for (const edge of this.edges) {
      const fromId = this.nodes.get(edge.from).id;
      const toId = this.nodes.get(edge.to).id;
      dot += `  ${fromId} -> ${toId};\n`;
    }
    
    dot += '}';
    return dot;
  }
  
  toJSON() {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: this.edges.map(e => ({
        from: this.nodes.get(e.from).id,
        to: this.nodes.get(e.to).id
      }))
    };
  }
}

// Usage
const visualizer = new ReactiveGraphVisualizer();

if (import.meta.env.DEV) {
  DevHooks.afterCreateSignal = (signal) => {
    visualizer.trackSignal(signal);
  };
  
  DevHooks.afterCreateOwner = (owner) => {
    if (owner.fn) {
      visualizer.trackComputation(owner);
    }
  };
}

// Export graph
console.log(visualizer.toMermaid());
console.log(visualizer.toDOT());
```

### Interactive Graph Explorer

```javascript
class InteractiveGraphExplorer {
  constructor(container) {
    this.container = container;
    this.selectedNode = null;
    this.graph = new ReactiveGraphVisualizer();
  }
  
  selectNode(node) {
    this.selectedNode = node;
    this.render();
  }
  
  render() {
    const data = this.graph.toJSON();
    
    // Clear container
    this.container.innerHTML = '';
    
    // Create SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '800');
    svg.setAttribute('height', '600');
    
    // Layout nodes (simple force-directed layout)
    const positions = this.calculateLayout(data.nodes);
    
    // Draw edges
    data.edges.forEach(edge => {
      const from = positions[edge.from];
      const to = positions[edge.to];
      
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', from.x);
      line.setAttribute('y1', from.y);
      line.setAttribute('x2', to.x);
      line.setAttribute('y2', to.y);
      line.setAttribute('stroke', '#999');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('marker-end', 'url(#arrowhead)');
      
      svg.appendChild(line);
    });
    
    // Draw nodes
    data.nodes.forEach((node, i) => {
      const pos = positions[i];
      const isSelected = this.selectedNode === node;
      
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);
      group.style.cursor = 'pointer';
      
      // Node circle
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', isSelected ? '25' : '20');
      circle.setAttribute('fill', this.getNodeColor(node.type));
      circle.setAttribute('stroke', isSelected ? '#000' : '#666');
      circle.setAttribute('stroke-width', isSelected ? '3' : '1');
      
      group.appendChild(circle);
      
      // Node label
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dy', '30');
      text.textContent = node.name;
      text.style.fontSize = '12px';
      
      group.appendChild(text);
      
      // Click handler
      group.addEventListener('click', () => this.selectNode(node));
      
      svg.appendChild(group);
    });
    
    this.container.appendChild(svg);
    
    // Show node details
    if (this.selectedNode) {
      this.renderNodeDetails();
    }
  }
  
  getNodeColor(type) {
    const colors = {
      signal: '#4FC3F7',
      memo: '#81C784',
      effect: '#FFB74D'
    };
    return colors[type] || '#999';
  }
  
  calculateLayout(nodes) {
    // Simple hierarchical layout
    const positions = [];
    const layers = this.groupByLayer(nodes);
    
    layers.forEach((layer, layerIndex) => {
      const y = 100 + layerIndex * 150;
      const spacing = 800 / (layer.length + 1);
      
      layer.forEach((node, i) => {
        positions[node.id] = {
          x: spacing * (i + 1),
          y: y
        };
      });
    });
    
    return positions;
  }
  
  groupByLayer(nodes) {
    const layers = [];
    const visited = new Set();
    
    // Start with signals (no sources)
    const signals = nodes.filter(n => n.type === 'signal');
    layers.push(signals);
    signals.forEach(s => visited.add(s.id));
    
    // Then computations by depth
    while (visited.size < nodes.length) {
      const layer = nodes.filter(n => 
        !visited.has(n.id) && 
        Array.from(n.sources || []).every(s => visited.has(this.graph.nodes.get(s).id))
      );
      
      if (layer.length === 0) break;
      
      layers.push(layer);
      layer.forEach(n => visited.add(n.id));
    }
    
    return layers;
  }
  
  renderNodeDetails() {
    const details = document.createElement('div');
    details.style.cssText = 'position: fixed; top: 10px; right: 10px; background: white; padding: 20px; border: 1px solid #ccc; border-radius: 4px;';
    
    details.innerHTML = `
      <h3>${this.selectedNode.name}</h3>
      <p><strong>Type:</strong> ${this.selectedNode.type}</p>
      ${this.selectedNode.value !== undefined ? `<p><strong>Value:</strong> ${JSON.stringify(this.selectedNode.value)}</p>` : ''}
      <p><strong>Sources:</strong> ${this.selectedNode.sources?.size || 0}</p>
      <p><strong>Observers:</strong> ${this.selectedNode.observers?.size || 0}</p>
    `;
    
    this.container.appendChild(details);
  }
}

// Usage
const explorer = new InteractiveGraphExplorer(document.getElementById('graph'));
```

## Source Maps and Debugging

### Stack Traces for Reactive Updates

```javascript
// Capture stack traces for debugging
function createDebugSignal(value, options = {}) {
  const { name, captureStack = true } = options;
  
  const [get, set] = createSignal(value);
  
  if (import.meta.env.DEV) {
    const creationStack = captureStack ? new Error().stack : null;
    
    const wrappedSet = (newValue) => {
      const updateStack = captureStack ? new Error().stack : null;
      
      console.group(`Signal update: ${name || 'unnamed'}`);
      console.log('Old value:', get());
      console.log('New value:', typeof newValue === 'function' ? newValue(get()) : newValue);
      
      if (creationStack) {
        console.log('Created at:', creationStack);
      }
      if (updateStack) {
        console.log('Updated at:', updateStack);
      }
      
      console.groupEnd();
      
      return set(newValue);
    };
    
    return [get, wrappedSet];
  }
  
  return [get, set];
}

// Usage
const [count, setCount] = createDebugSignal(0, { name: 'counter' });

setCount(1);
// Console output:
// Signal update: counter
//   Old value: 0
//   New value: 1
//   Created at: [stack trace]
//   Updated at: [stack trace]
```

### Time-Travel Debugging

```javascript
class TimeTravel {
  constructor() {
    this.history = [];
    this.currentIndex = -1;
    this.maxHistory = 100;
  }
  
  createSignal(initialValue, name) {
    const [get, set] = createSignal(initialValue);
    
    this.recordSnapshot(name, initialValue);
    
    const wrappedSet = (newValue) => {
      const value = typeof newValue === 'function' ? newValue(get()) : newValue;
      this.recordSnapshot(name, value);
      return set(value);
    };
    
    return [get, wrappedSet];
  }
  
  recordSnapshot(name, value) {
    // Trim future history if we're not at the end
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }
    
    this.history.push({
      timestamp: Date.now(),
      name,
      value,
      state: this.captureState()
    });
    
    // Limit history size
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    
    this.currentIndex = this.history.length - 1;
  }
  
  captureState() {
    // Capture all signal values
    return new Map(/* current state */);
  }
  
  goBack() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.restoreSnapshot(this.history[this.currentIndex]);
    }
  }
  
  goForward() {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++;
      this.restoreSnapshot(this.history[this.currentIndex]);
    }
  }
  
  goToIndex(index) {
    if (index >= 0 && index < this.history.length) {
      this.currentIndex = index;
      this.restoreSnapshot(this.history[index]);
    }
  }
  
  restoreSnapshot(snapshot) {
    console.log('Restoring state from', new Date(snapshot.timestamp));
    // Restore all signal values
    snapshot.state.forEach((value, signal) => {
      signal.value = value;
    });
  }
  
  getHistory() {
    return this.history.map((snapshot, i) => ({
      index: i,
      timestamp: snapshot.timestamp,
      name: snapshot.name,
      value: snapshot.value,
      isCurrent: i === this.currentIndex
    }));
  }
}

// Usage
const timeTravel = new TimeTravel();
const [count, setCount] = timeTravel.createSignal(0, 'counter');

setCount(1);
setCount(2);
setCount(3);

console.log(timeTravel.getHistory());
timeTravel.goBack(); // Back to count = 2
timeTravel.goBack(); // Back to count = 1
timeTravel.goForward(); // Forward to count = 2
```

## Performance Monitoring

### Update Profiler

```javascript
class UpdateProfiler {
  constructor() {
    this.updates = [];
    this.enabled = false;
  }
  
  start() {
    this.enabled = true;
    this.updates = [];
    
    if (import.meta.env.DEV) {
      DevHooks.afterUpdate = (computation) => {
        if (this.enabled) {
          this.recordUpdate(computation);
        }
      };
    }
  }
  
  stop() {
    this.enabled = false;
    return this.analyze();
  }
  
  recordUpdate(computation) {
    this.updates.push({
      name: computation.name || 'unnamed',
      timestamp: performance.now(),
      duration: computation.updatedAt - computation.startedAt,
      sources: computation.sources?.length || 0,
      observers: computation.observers?.length || 0
    });
  }
  
  analyze() {
    const stats = {
      totalUpdates: this.updates.length,
      totalDuration: 0,
      byName: new Map(),
      slowest: [],
      mostFrequent: []
    };
    
    // Aggregate by name
    this.updates.forEach(update => {
      stats.totalDuration += update.duration;
      
      const existing = stats.byName.get(update.name) || {
        count: 0,
        totalDuration: 0,
        avgDuration: 0
      };
      
      existing.count++;
      existing.totalDuration += update.duration;
      existing.avgDuration = existing.totalDuration / existing.count;
      
      stats.byName.set(update.name, existing);
    });
    
    // Find slowest
    stats.slowest = this.updates
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);
    
    // Find most frequent
    stats.mostFrequent = Array.from(stats.byName.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([name, stats]) => ({ name, ...stats }));
    
    return stats;
  }
  
  report() {
    const stats = this.analyze();
    
    console.group('Update Profile');
    console.log(`Total updates: ${stats.totalUpdates}`);
    console.log(`Total duration: ${stats.totalDuration.toFixed(2)}ms`);
    console.log(`Average: ${(stats.totalDuration / stats.totalUpdates).toFixed(2)}ms`);
    
    console.group('Slowest updates');
    console.table(stats.slowest);
    console.groupEnd();
    
    console.group('Most frequent updates');
    console.table(stats.mostFrequent);
    console.groupEnd();
    
    console.groupEnd();
  }
}

// Usage
const profiler = new UpdateProfiler();
profiler.start();

// Your app code...
for (let i = 0; i < 100; i++) {
  setCount(i);
}

profiler.stop();
profiler.report();
```

### Memory Profiler

```javascript
class MemoryProfiler {
  constructor() {
    this.snapshots = [];
  }
  
  takeSnapshot(label) {
    const snapshot = {
      label,
      timestamp: Date.now(),
      memory: performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
      } : null,
      signals: devState.signals.size,
      computations: devState.computations.size
    };
    
    this.snapshots.push(snapshot);
    return snapshot;
  }
  
  compare(snapshot1, snapshot2) {
    return {
      memoryDelta: snapshot2.memory.usedJSHeapSize - snapshot1.memory.usedJSHeapSize,
      signalsDelta: snapshot2.signals - snapshot1.signals,
      computationsDelta: snapshot2.computations - snapshot1.computations,
      timeDelta: snapshot2.timestamp - snapshot1.timestamp
    };
  }
  
  report() {
    console.table(this.snapshots.map((s, i) => {
      if (i === 0) return { label: s.label, ...s };
      
      const delta = this.compare(this.snapshots[i - 1], s);
      return {
        label: s.label,
        memoryMB: (s.memory.usedJSHeapSize / 1024 / 1024).toFixed(2),
        deltaKB: (delta.memoryDelta / 1024).toFixed(2),
        signals: s.signals,
        signalsDelta: delta.signalsDelta,
        computations: s.computations,
        computationsDelta: delta.computationsDelta
      };
    }));
  }
}

// Usage
const memProfiler = new MemoryProfiler();

memProfiler.takeSnapshot('Initial');

// Create 1000 signals
for (let i = 0; i < 1000; i++) {
  createSignal(i);
}

memProfiler.takeSnapshot('After 1000 signals');

// Cleanup
dispose();

memProfiler.takeSnapshot('After cleanup');

memProfiler.report();
```

## Chrome DevTools Integration

### Custom Panel

```javascript
// devtools.js
chrome.devtools.panels.create(
  'Solid Reactive',
  'icon.png',
  'panel.html',
  (panel) => {
    panel.onShown.addListener((window) => {
      // Panel shown
      window.initializePanel();
    });
  }
);

// panel.html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    .signal { background: #E3F2FD; padding: 10px; margin: 5px; border-radius: 4px; }
    .effect { background: #FFF3E0; padding: 10px; margin: 5px; border-radius: 4px; }
    .memo { background: #E8F5E9; padding: 10px; margin: 5px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Reactive Graph</h1>
  <div id="graph"></div>
  <div id="details"></div>
  
  <script src="panel.js"></script>
</body>
</html>

// panel.js
function initializePanel() {
  // Connect to inspected window
  chrome.devtools.inspectedWindow.eval(
    'window.__SOLID_DEVTOOLS__.getGraph()',
    (result, error) => {
      if (!error) {
        renderGraph(result);
      }
    }
  );
}

function renderGraph(graph) {
  const container = document.getElementById('graph');
  
  graph.nodes.forEach(node => {
    const div = document.createElement('div');
    div.className = node.type;
    div.innerHTML = `
      <strong>${node.name}</strong>
      ${node.value !== undefined ? `<br>Value: ${node.value}` : ''}
      <br>Sources: ${node.sources?.length || 0}
      <br>Observers: ${node.observers?.length || 0}
    `;
    
    div.addEventListener('click', () => {
      showDetails(node);
    });
    
    container.appendChild(div);
  });
}

function showDetails(node) {
  const details = document.getElementById('details');
  details.innerHTML = `
    <h2>${node.name}</h2>
    <pre>${JSON.stringify(node, null, 2)}</pre>
  `;
}
```

## Testing Development Tools

```javascript
import { test, expect } from 'vitest';

test('DevHooks.afterCreateSignal is called', () => {
  const signals = [];
  
  DevHooks.afterCreateSignal = (signal) => {
    signals.push(signal);
  };
  
  const [count] = createSignal(0);
  
  expect(signals).toHaveLength(1);
  expect(signals[0].value).toBe(0);
  
  DevHooks.afterCreateSignal = null;
});

test('Graph visualizer tracks dependencies', () => {
  const viz = new ReactiveGraphVisualizer();
  
  DevHooks.afterCreateSignal = (s) => viz.trackSignal(s);
  DevHooks.afterCreateOwner = (o) => viz.trackComputation(o);
  
  const [count, setCount] = createSignal(0);
  createEffect(() => count());
  
  const graph = viz.toJSON();
  
  expect(graph.nodes).toHaveLength(2); // 1 signal, 1 effect
  expect(graph.edges).toHaveLength(1); // signal -> effect
  
  DevHooks.afterCreateSignal = null;
  DevHooks.afterCreateOwner = null;
});
```

## Best Practices

### Development vs Production

```javascript
// Conditional dev tools
const devTools = import.meta.env.DEV ? {
  visualizer: new ReactiveGraphVisualizer(),
  profiler: new UpdateProfiler(),
  timeTravel: new TimeTravel()
} : null;

// Helper that's stripped in production
function devLog(...args) {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
}

// Assertions for development
function assert(condition, message) {
  if (import.meta.env.DEV && !condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}
```

### Performance Impact

```javascript
// Minimize overhead
const shouldTrace = import.meta.env.DEV && localStorage.getItem('enableTracing') === 'true';

if (shouldTrace) {
  DevHooks.afterUpdate = (computation) => {
    // Only trace if explicitly enabled
    console.log('Update:', computation.name);
  };
}
```

## Summary

**Key development tools:**

1. **DevHooks** for monitoring reactive system
2. **Graph visualization** for understanding dependencies
3. **Stack traces** for debugging updates
4. **Time-travel** for state inspection
5. **Profilers** for performance analysis
6. **Chrome DevTools** integration

**Remember:** Development tools should have minimal impact on production performance!

## Next Steps

- **Exercise 1:** Build a Chrome DevTools extension
- **Exercise 2:** Create a graph visualizer
- **Lesson 4:** Production patterns and deployment
