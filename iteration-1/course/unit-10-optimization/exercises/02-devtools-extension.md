# Exercise 2: DevTools Extension

**Difficulty:** ⭐⭐⭐⭐⭐ (Advanced)

## Objective

Build a Chrome DevTools extension that provides real-time visualization and debugging capabilities for Solid.js reactive applications.

## Requirements

### Part 1: Extension Setup

Create a Chrome extension with:
- Manifest configuration
- DevTools panel
- Content script injection
- Background service worker

### Part 2: Reactive Graph Visualization

Implement visualization that:
- Shows all signals, memos, and effects
- Displays dependency connections
- Highlights active computations
- Updates in real-time

### Part 3: Interactive Debugging

Add debugging features:
- Inspect signal values
- View computation dependencies
- Track update propagation
- Time-travel debugging

### Part 4: Performance Analysis

Include performance tools:
- Update profiling
- Memory tracking
- Batch analysis
- Performance suggestions

## Project Structure

```
devtools-extension/
├── manifest.json
├── devtools.html
├── devtools.js
├── panel.html
├── panel.js
├── content-script.js
├── background.js
└── styles/
    └── panel.css
```

## Starter Code

### manifest.json

```json
{
  "manifest_version": 3,
  "name": "Solid.js DevTools",
  "version": "1.0.0",
  "description": "DevTools for Solid.js reactive applications",
  
  "devtools_page": "devtools.html",
  
  "permissions": [
    "activeTab",
    "scripting"
  ],
  
  "background": {
    "service_worker": "background.js"
  },
  
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content-script.js"],
    "run_at": "document_start"
  }],
  
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

### devtools.html

```html
<!DOCTYPE html>
<html>
<head>
  <script src="devtools.js"></script>
</head>
<body>
</body>
</html>
```

### devtools.js

```javascript
// Create the DevTools panel
chrome.devtools.panels.create(
  'Solid Reactive',
  'icons/icon48.png',
  'panel.html',
  (panel) => {
    panel.onShown.addListener((window) => {
      // Panel shown
    });
  }
);
```

### content-script.js

```javascript
// Inject hook into page
function injectHook() {
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      // Hook into Solid.js
      if (window.SolidJS && window.SolidJS.DevHooks) {
        const DevHooks = window.SolidJS.DevHooks;
        
        // Notify extension
        window.postMessage({
          type: 'SOLID_DEVTOOLS_INIT',
          version: window.SolidJS.version
        }, '*');
        
        // Track signals
        DevHooks.afterCreateSignal = (signal) => {
          window.postMessage({
            type: 'SOLID_SIGNAL_CREATED',
            signal: {
              id: signal.id,
              name: signal.name,
              value: signal.value
            }
          }, '*');
        };
        
        // Track computations
        DevHooks.afterCreateOwner = (owner) => {
          if (owner.fn) {
            window.postMessage({
              type: 'SOLID_COMPUTATION_CREATED',
              computation: {
                id: owner.id,
                name: owner.name,
                type: owner.pure ? 'memo' : 'effect'
              }
            }, '*');
          }
        };
        
        // Track updates
        DevHooks.afterUpdate = (computation) => {
          window.postMessage({
            type: 'SOLID_UPDATE',
            update: {
              id: computation.id,
              timestamp: Date.now()
            }
          }, '*');
        };
      }
    })();
  `;
  
  document.documentElement.appendChild(script);
  script.remove();
}

// Listen for messages from page
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  // Forward to background script
  if (event.data.type?.startsWith('SOLID_')) {
    chrome.runtime.sendMessage(event.data);
  }
});

injectHook();
```

### panel.html

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="styles/panel.css">
</head>
<body>
  <div id="app">
    <div id="toolbar">
      <button id="refresh">🔄 Refresh</button>
      <button id="clear">🗑️ Clear</button>
      <button id="snapshot">📸 Snapshot</button>
    </div>
    
    <div id="content">
      <div id="graph-view">
        <h2>Reactive Graph</h2>
        <div id="graph"></div>
      </div>
      
      <div id="inspector">
        <h2>Inspector</h2>
        <div id="details"></div>
      </div>
      
      <div id="timeline">
        <h2>Updates Timeline</h2>
        <div id="timeline-content"></div>
      </div>
    </div>
  </div>
  
  <script src="panel.js"></script>
</body>
</html>
```

## Tasks

### Task 1: Implement Graph Visualization

```javascript
// panel.js
class ReactiveGraphView {
  constructor(container) {
    this.container = container;
    this.nodes = new Map();
    this.edges = [];
  }
  
  addSignal(signal) {
    const node = {
      id: signal.id,
      type: 'signal',
      name: signal.name || `Signal ${signal.id}`,
      value: signal.value,
      x: 0,
      y: 0
    };
    
    this.nodes.set(signal.id, node);
    this.render();
  }
  
  addComputation(computation) {
    // TODO: Implement
  }
  
  addEdge(fromId, toId) {
    // TODO: Implement
  }
  
  render() {
    // TODO: Implement SVG rendering
    const svg = this.createSVG();
    this.container.innerHTML = '';
    this.container.appendChild(svg);
  }
  
  createSVG() {
    // TODO: Create SVG elements
  }
}
```

### Task 2: Implement Inspector

```javascript
class Inspector {
  constructor(container) {
    this.container = container;
    this.selected = null;
  }
  
  selectNode(node) {
    this.selected = node;
    this.render();
  }
  
  render() {
    if (!this.selected) {
      this.container.innerHTML = '<p>Select a node to inspect</p>';
      return;
    }
    
    const html = `
      <div class="inspector-content">
        <h3>${this.selected.name}</h3>
        <table>
          <tr>
            <th>Type</th>
            <td>${this.selected.type}</td>
          </tr>
          <tr>
            <th>ID</th>
            <td>${this.selected.id}</td>
          </tr>
          ${this.selected.value !== undefined ? `
            <tr>
              <th>Value</th>
              <td><pre>${JSON.stringify(this.selected.value, null, 2)}</pre></td>
            </tr>
          ` : ''}
          <tr>
            <th>Sources</th>
            <td>${this.selected.sources?.length || 0}</td>
          </tr>
          <tr>
            <th>Observers</th>
            <td>${this.selected.observers?.length || 0}</td>
          </tr>
        </table>
      </div>
    `;
    
    this.container.innerHTML = html;
  }
}
```

### Task 3: Implement Timeline

```javascript
class Timeline {
  constructor(container) {
    this.container = container;
    this.updates = [];
    this.maxUpdates = 100;
  }
  
  addUpdate(update) {
    this.updates.push({
      ...update,
      timestamp: Date.now()
    });
    
    if (this.updates.length > this.maxUpdates) {
      this.updates.shift();
    }
    
    this.render();
  }
  
  render() {
    const html = this.updates.map(update => `
      <div class="update-item">
        <span class="time">${new Date(update.timestamp).toLocaleTimeString()}</span>
        <span class="computation">${update.name || update.id}</span>
        <span class="type">${update.type}</span>
      </div>
    `).join('');
    
    this.container.innerHTML = html;
  }
  
  clear() {
    this.updates = [];
    this.render();
  }
}
```

### Task 4: Connect to Background Script

```javascript
// background.js
const connections = new Map();

chrome.runtime.onConnect.addListener((port) => {
  const tabId = port.sender.tab.id;
  connections.set(tabId, port);
  
  port.onDisconnect.addListener(() => {
    connections.delete(tabId);
  });
});

chrome.runtime.onMessage.addListener((message, sender) => {
  const tabId = sender.tab.id;
  const port = connections.get(tabId);
  
  if (port) {
    port.postMessage(message);
  }
});
```

```javascript
// panel.js - connect to background
const port = chrome.runtime.connect({ name: 'devtools-panel' });

port.onMessage.addListener((message) => {
  switch (message.type) {
    case 'SOLID_SIGNAL_CREATED':
      graphView.addSignal(message.signal);
      break;
      
    case 'SOLID_COMPUTATION_CREATED':
      graphView.addComputation(message.computation);
      break;
      
    case 'SOLID_UPDATE':
      timeline.addUpdate(message.update);
      break;
  }
});
```

## Bonus Features

1. **Time-Travel Debugging**
   ```javascript
   class TimeTravelDebugger {
     // Record state snapshots
     // Allow jumping to previous states
   }
   ```

2. **Performance Profiler**
   ```javascript
   class PerformanceProfiler {
     // Track update duration
     // Identify slow computations
     // Suggest optimizations
   }
   ```

3. **Export/Import**
   ```javascript
   function exportGraph() {
     return JSON.stringify(graphView.toJSON());
   }
   
   function importGraph(json) {
     graphView.loadFromJSON(JSON.parse(json));
   }
   ```

## Testing

Test your extension:

1. Load unpacked extension in Chrome
2. Open DevTools on a Solid.js app
3. Navigate to "Solid Reactive" panel
4. Verify graph updates in real-time
5. Test inspector functionality
6. Check timeline accuracy

## Expected Output

The extension should display:
- Real-time reactive graph
- Interactive node inspection
- Update timeline
- Performance metrics
- Memory usage

## Solution Hints

<details>
<summary>Hint 1: SVG Rendering</summary>

Use D3.js or custom SVG:
```javascript
function createNode(node) {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('r', '20');
  circle.setAttribute('fill', getNodeColor(node.type));
  group.appendChild(circle);
  return group;
}
```
</details>

<details>
<summary>Hint 2: Layout Algorithm</summary>

Use force-directed layout:
```javascript
function forceLayout(nodes, edges) {
  // Repulsion between nodes
  // Attraction along edges
  // Iterate until stable
}
```
</details>

## Submission

Submit:
1. Complete extension code
2. Installation instructions
3. Usage guide
4. Screenshots/demo video

## Evaluation Criteria

- ✅ Extension installs correctly
- ✅ Graph visualizes accurately
- ✅ Inspector shows correct data
- ✅ Timeline updates in real-time
- ✅ Performance is acceptable
- ✅ UI is polished and usable
