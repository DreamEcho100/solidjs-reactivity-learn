# Project 3: Real-time Dashboard

## Overview

Build a live dashboard that displays real-time metrics using WebSockets, polling, and efficient data updates. Handle high-frequency updates without overwhelming the UI.

## Learning Objectives

- Integrate WebSockets with resources
- Handle high-frequency data updates
- Implement efficient rendering strategies
- Build responsive visualizations
- Manage connection state

## Requirements

### Core Features

1. **Real-time Data Streams**
   - WebSocket connections
   - Automatic reconnection
   - Connection status indicator
   - Fallback to polling

2. **Efficient Updates**
   - Throttle/debounce updates
   - Batch updates for performance
   - Selective re-rendering
   - Virtual scrolling for lists

3. **Data Visualization**
   - Live charts (line, bar, pie)
   - Real-time metrics
   - Historical data comparison
   - Smooth animations

4. **User Controls**
   - Pause/resume updates
   - Time range selection
   - Metric filtering
   - Export data

## Features

### Metrics Display

```typescript
function Dashboard() {
  const metrics = useRealtimeMetrics();
  
  return (
    <div class="dashboard">
      <MetricCard
        title="Active Users"
        value={metrics.activeUsers()}
        trend={metrics.activeUsersTrend()}
        live
      />
      
      <MetricCard
        title="Requests/sec"
        value={metrics.requestsPerSecond()}
        trend={metrics.requestsTrend()}
        live
      />
      
      <LiveChart
        data={metrics.chartData()}
        type="line"
        updateInterval={1000}
      />
    </div>
  );
}
```

### WebSocket Integration

```typescript
const [metrics] = createWebSocketResource(
  'wss://api.example.com/metrics',
  {
    onConnect: () => console.log('Connected'),
    onDisconnect: () => console.log('Disconnected'),
    onError: (err) => console.error('Error:', err),
    reconnect: true,
    reconnectDelay: 1000
  }
);
```

## Architecture

```
src/
├── data/
│   ├── websocket.ts        # WebSocket manager
│   ├── polling.ts          # Polling fallback
│   └── aggregator.ts       # Data aggregation
├── hooks/
│   ├── useRealtimeMetrics.ts  # Real-time metrics
│   ├── useWebSocket.ts     # WebSocket hook
│   └── useChartData.ts     # Chart data processing
├── components/
│   ├── Dashboard.tsx       # Main dashboard
│   ├── MetricCard.tsx      # Metric display
│   ├── LiveChart.tsx       # Real-time chart
│   └── ConnectionStatus.tsx # Connection indicator
└── utils/
    ├── throttle.ts         # Update throttling
    ├── buffer.ts           # Data buffering
    └── aggregation.ts      # Data aggregation
```

## Implementation Guide

### Step 1: WebSocket Manager

```typescript
class WebSocketManager {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectDelay: number;
  private shouldReconnect: boolean = true;
  private listeners = new Set<(data: any) => void>();
  
  constructor(url: string, options: {
    reconnectDelay?: number;
    reconnect?: boolean;
  } = {}) {
    this.url = url;
    this.reconnectDelay = options.reconnectDelay || 1000;
    this.shouldReconnect = options.reconnect ?? true;
  }
  
  connect(): void {
    this.ws = new WebSocket(this.url);
    
    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.onConnect?.();
    };
    
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.listeners.forEach(listener => listener(data));
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.onError?.(error);
    };
    
    this.ws.onclose = () => {
      console.log('WebSocket closed');
      this.onDisconnect?.();
      
      if (this.shouldReconnect) {
        setTimeout(() => this.connect(), this.reconnectDelay);
      }
    };
  }
  
  disconnect(): void {
    this.shouldReconnect = false;
    this.ws?.close();
  }
  
  subscribe(callback: (data: any) => void): () => void {
    this.listeners.add(callback);
    
    return () => {
      this.listeners.delete(callback);
    };
  }
  
  send(data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
  
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}
```

### Step 2: WebSocket Resource

```typescript
function createWebSocketResource<T>(
  url: string,
  options: {
    initialFetcher?: () => Promise<T>;
    onConnect?: () => void;
    onDisconnect?: () => void;
    onError?: (error: Event) => void;
    reconnect?: boolean;
    reconnectDelay?: number;
  } = {}
): ResourceReturn<T> {
  const [data, { mutate }] = createResource(options.initialFetcher);
  
  createEffect(() => {
    const ws = new WebSocketManager(url, {
      reconnect: options.reconnect,
      reconnectDelay: options.reconnectDelay
    });
    
    ws.onConnect = options.onConnect;
    ws.onDisconnect = options.onDisconnect;
    ws.onError = options.onError;
    
    const unsubscribe = ws.subscribe((newData) => {
      mutate(newData);
    });
    
    ws.connect();
    
    onCleanup(() => {
      unsubscribe();
      ws.disconnect();
    });
  });
  
  return [data, { mutate }];
}
```

### Step 3: Throttled Updates

```typescript
function createThrottledResource<T>(
  source: () => T,
  delay: number
): () => T | undefined {
  const [throttled, setThrottled] = createSignal<T | undefined>();
  let lastUpdate = 0;
  let pending: T | undefined;
  let timeout: number | undefined;
  
  createEffect(() => {
    const value = source();
    const now = Date.now();
    
    if (now - lastUpdate >= delay) {
      // Update immediately
      setThrottled(() => value);
      lastUpdate = now;
    } else {
      // Queue update
      pending = value;
      
      if (timeout === undefined) {
        const remaining = delay - (now - lastUpdate);
        timeout = setTimeout(() => {
          if (pending !== undefined) {
            setThrottled(() => pending);
            lastUpdate = Date.now();
            pending = undefined;
          }
          timeout = undefined;
        }, remaining);
      }
    }
  });
  
  onCleanup(() => {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  });
  
  return throttled;
}
```

### Step 4: Data Aggregation

```typescript
class MetricsAggregator {
  private buffer: MetricPoint[] = [];
  private maxBufferSize: number = 1000;
  
  add(point: MetricPoint): void {
    this.buffer.push(point);
    
    // Keep buffer size limited
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }
  }
  
  aggregate(windowMs: number): AggregatedMetric[] {
    const windows = new Map<number, MetricPoint[]>();
    
    // Group by time window
    for (const point of this.buffer) {
      const windowStart = Math.floor(point.timestamp / windowMs) * windowMs;
      
      if (!windows.has(windowStart)) {
        windows.set(windowStart, []);
      }
      
      windows.get(windowStart)!.push(point);
    }
    
    // Aggregate each window
    return Array.from(windows.entries()).map(([timestamp, points]) => ({
      timestamp,
      avg: points.reduce((sum, p) => sum + p.value, 0) / points.length,
      min: Math.min(...points.map(p => p.value)),
      max: Math.max(...points.map(p => p.value)),
      count: points.length
    }));
  }
  
  latest(count: number): MetricPoint[] {
    return this.buffer.slice(-count);
  }
  
  clear(): void {
    this.buffer = [];
  }
}
```

### Step 5: Live Chart Component

```typescript
function LiveChart(props: {
  data: () => ChartDataPoint[];
  type: 'line' | 'bar' | 'area';
  maxPoints?: number;
  updateInterval?: number;
}) {
  const [chartData, setChartData] = createSignal<ChartDataPoint[]>([]);
  const maxPoints = props.maxPoints || 50;
  
  // Throttle updates for smooth animation
  const throttledData = createThrottledResource(
    props.data,
    props.updateInterval || 1000
  );
  
  createEffect(() => {
    const newData = throttledData();
    if (!newData) return;
    
    setChartData(prev => {
      const updated = [...prev, ...newData];
      
      // Keep only recent points
      if (updated.length > maxPoints) {
        return updated.slice(-maxPoints);
      }
      
      return updated;
    });
  });
  
  return (
    <div class="live-chart">
      <canvas ref={(el) => {
        // Render chart using canvas
        renderChart(el, chartData(), props.type);
      }} />
    </div>
  );
}
```

### Step 6: Dashboard Hook

```typescript
function useRealtimeMetrics() {
  // WebSocket connection
  const [rawMetrics] = createWebSocketResource<RawMetrics>(
    'wss://api.example.com/metrics',
    {
      initialFetcher: () => fetch('/api/metrics/latest').then(r => r.json()),
      reconnect: true
    }
  );
  
  // Data aggregation
  const aggregator = new MetricsAggregator();
  
  createEffect(() => {
    const metrics = rawMetrics();
    if (metrics) {
      aggregator.add({
        timestamp: Date.now(),
        value: metrics.activeUsers
      });
    }
  });
  
  // Computed metrics
  const activeUsers = () => rawMetrics()?.activeUsers || 0;
  
  const activeUsersTrend = createMemo(() => {
    const recent = aggregator.latest(10);
    if (recent.length < 2) return 0;
    
    const current = recent[recent.length - 1].value;
    const previous = recent[recent.length - 2].value;
    
    return ((current - previous) / previous) * 100;
  });
  
  const requestsPerSecond = () => rawMetrics()?.requestsPerSecond || 0;
  
  const chartData = createMemo(() => {
    return aggregator.aggregate(60000) // 1 minute windows
      .map(point => ({
        x: point.timestamp,
        y: point.avg
      }));
  });
  
  return {
    activeUsers,
    activeUsersTrend,
    requestsPerSecond,
    chartData
  };
}
```

### Step 7: Connection Status

```typescript
function ConnectionStatus() {
  const [status, setStatus] = createSignal<'connected' | 'disconnected' | 'connecting'>('connecting');
  
  // Monitor WebSocket status
  createEffect(() => {
    // Implementation depends on your WebSocket manager
  });
  
  return (
    <div class={`connection-status ${status()}`}>
      <Show when={status() === 'connected'}>
        <span class="icon">●</span> Connected
      </Show>
      <Show when={status() === 'disconnected'}>
        <span class="icon">●</span> Disconnected
      </Show>
      <Show when={status() === 'connecting'}>
        <span class="icon spinner">◌</span> Connecting...
      </Show>
    </div>
  );
}
```

## UI Components

### MetricCard

```typescript
function MetricCard(props: {
  title: string;
  value: () => number;
  trend?: () => number;
  live?: boolean;
}) {
  const formatValue = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toString();
  };
  
  const formatTrend = (trend: number) => {
    const sign = trend >= 0 ? '+' : '';
    return `${sign}${trend.toFixed(1)}%`;
  };
  
  return (
    <div class="metric-card">
      <div class="metric-title">
        {props.title}
        {props.live && <span class="live-indicator">●</span>}
      </div>
      <div class="metric-value">
        {formatValue(props.value())}
      </div>
      {props.trend && (
        <div class={`metric-trend ${props.trend() >= 0 ? 'positive' : 'negative'}`}>
          {formatTrend(props.trend())}
        </div>
      )}
    </div>
  );
}
```

## Performance Optimization

### 1. Virtual Scrolling for Lists

```typescript
function VirtualList(props: {
  data: () => any[];
  itemHeight: number;
  renderItem: (item: any, index: number) => JSX.Element;
}) {
  const [scrollTop, setScrollTop] = createSignal(0);
  const containerHeight = 600;
  
  const visibleRange = createMemo(() => {
    const start = Math.floor(scrollTop() / props.itemHeight);
    const end = start + Math.ceil(containerHeight / props.itemHeight);
    return { start, end };
  });
  
  const visibleItems = createMemo(() => {
    const range = visibleRange();
    return props.data().slice(range.start, range.end);
  });
  
  return (
    <div 
      class="virtual-list"
      style={{ height: `${containerHeight}px`, overflow: 'auto' }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: `${props.data().length * props.itemHeight}px` }}>
        <div style={{ transform: `translateY(${visibleRange().start * props.itemHeight}px)` }}>
          <For each={visibleItems()}>
            {(item, index) => props.renderItem(item, visibleRange().start + index())}
          </For>
        </div>
      </div>
    </div>
  );
}
```

### 2. Request Animation Frame Updates

```typescript
function useAnimationFrame(callback: () => void) {
  let rafId: number | undefined;
  
  createEffect(() => {
    const animate = () => {
      callback();
      rafId = requestAnimationFrame(animate);
    };
    
    rafId = requestAnimationFrame(animate);
    
    onCleanup(() => {
      if (rafId !== undefined) {
        cancelAnimationFrame(rafId);
      }
    });
  });
}
```

## Testing

```typescript
describe('Real-time Dashboard', () => {
  it('should connect to WebSocket', async () => {
    const mockWS = new MockWebSocket();
    global.WebSocket = mockWS as any;
    
    const { metrics } = useRealtimeMetrics();
    
    await waitFor(() => {
      expect(mockWS.connected).toBe(true);
    });
  });
  
  it('should update metrics on new data', async () => {
    const mockWS = new MockWebSocket();
    
    const { metrics } = useRealtimeMetrics();
    
    mockWS.send({ activeUsers: 100 });
    
    await waitFor(() => {
      expect(metrics.activeUsers()).toBe(100);
    });
  });
});
```

## Bonus Features

1. **Alert System** - Notify on threshold breaches
2. **Data Export** - Download historical data
3. **Custom Metrics** - User-defined calculations
4. **Multi-tenancy** - Switch between different data sources
5. **Dark Mode** - Theme switching

## Deliverables

1. ✅ Working real-time dashboard
2. ✅ WebSocket integration
3. ✅ Live charts and metrics
4. ✅ Performance optimizations
5. ✅ Test suite
6. ✅ Documentation

## Resources

- WebSocket API
- Canvas/SVG for charts
- Chart.js or D3.js
- Lesson 4: Advanced Async Patterns
