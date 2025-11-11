# Unit 9 Project: Multi-Source Reactive Dashboard

## Project Overview

Build a real-time dashboard that integrates multiple reactive data sources using Solid.js observables, demonstrating practical patterns for observable integration.

## Learning Objectives

- Integrate multiple external reactive sources
- Handle WebSocket connections reactively
- Sync state across browser tabs
- Implement custom observable operators
- Build production-ready error handling

## Project Specification

Create a dashboard that displays:
1. **Real-time server data** (WebSocket)
2. **Browser events** (mouse position, window size)
3. **Cross-tab sync** (localStorage)
4. **External API data** (fetch with polling)
5. **User preferences** (persisted and synced)

## Architecture

```
Dashboard
├── WebSocket Stream (server updates)
├── Event Streams (mouse, resize, etc.)
├── Storage Sync (cross-tab state)
├── API Polling (external data)
└── Preferences (localStorage + sync)
```

## Part 1: WebSocket Integration

### Requirements

Create a reactive WebSocket manager that:
- Connects to a WebSocket server
- Emits all messages as signals
- Handles reconnection automatically
- Provides connection status
- Cleans up properly

### Implementation

```typescript
// src/websocket.ts

import { createSignal, onCleanup, Accessor } from "solid-js";

interface WebSocketState<T = any> {
  status: "connecting" | "connected" | "disconnected" | "error";
  data: T | null;
  error: Error | null;
}

export function createWebSocketStream<T = any>(
  url: string,
  options?: {
    reconnect?: boolean;
    reconnectDelay?: number;
    heartbeat?: number;
  }
): Accessor<WebSocketState<T>> {
  const [state, setState] = createSignal<WebSocketState<T>>({
    status: "connecting",
    data: null,
    error: null
  });

  let ws: WebSocket | null = null;
  let reconnectTimeout: number | null = null;
  let heartbeatInterval: number | null = null;
  let shouldReconnect = options?.reconnect ?? true;

  function connect() {
    setState({
      status: "connecting",
      data: state().data,
      error: null
    });

    ws = new WebSocket(url);

    ws.onopen = () => {
      setState({
        status: "connected",
        data: state().data,
        error: null
      });

      // Start heartbeat
      if (options?.heartbeat) {
        heartbeatInterval = setInterval(() => {
          ws?.send(JSON.stringify({ type: "ping" }));
        }, options.heartbeat) as unknown as number;
      }
    };

    ws.onmessage = (event) => {
      let data: T;
      try {
        data = JSON.parse(event.data);
      } catch {
        data = event.data as T;
      }

      setState({
        status: "connected",
        data,
        error: null
      });
    };

    ws.onerror = () => {
      setState({
        status: "error",
        data: state().data,
        error: new Error("WebSocket error")
      });
    };

    ws.onclose = () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);

      setState({
        status: "disconnected",
        data: state().data,
        error: null
      });

      if (shouldReconnect) {
        reconnectTimeout = setTimeout(
          connect,
          options?.reconnectDelay ?? 3000
        ) as unknown as number;
      }
    };
  }

  connect();

  onCleanup(() => {
    shouldReconnect = false;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (ws) ws.close();
  });

  return state;
}
```

### Usage

```typescript
const serverData = createWebSocketStream<{ temperature: number }>(
  "ws://localhost:8080/data",
  {
    reconnect: true,
    reconnectDelay: 3000,
    heartbeat: 30000
  }
);

createEffect(() => {
  const state = serverData();
  console.log("Status:", state.status);
  if (state.data) {
    console.log("Temperature:", state.data.temperature);
  }
});
```

## Part 2: Event Streams

### Requirements

Create reactive event stream utilities for:
- Mouse position
- Window size
- Keyboard events
- Scroll position

### Implementation

```typescript
// src/events.ts

import { from, Accessor } from "solid-js";

export function createMousePosition(): Accessor<{ x: number; y: number }> {
  return from((set) => {
    let rafId: number | null = null;
    let latest = { x: 0, y: 0 };

    const handler = (e: MouseEvent) => {
      latest = { x: e.clientX, y: e.clientY };

      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          set(latest);
          rafId = null;
        });
      }
    };

    window.addEventListener("mousemove", handler);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", handler);
    };
  }, { x: 0, y: 0 });
}

export function createWindowSize(): Accessor<{ width: number; height: number }> {
  return from((set) => {
    const handler = () => {
      set({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    handler(); // Set initial value
    window.addEventListener("resize", handler);

    return () => window.removeEventListener("resize", handler);
  }, { width: window.innerWidth, height: window.innerHeight });
}

export function createScrollPosition(): Accessor<{ x: number; y: number }> {
  return from((set) => {
    let rafId: number | null = null;

    const handler = () => {
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          set({
            x: window.scrollX,
            y: window.scrollY
          });
          rafId = null;
        });
      }
    };

    handler(); // Set initial value
    window.addEventListener("scroll", handler, { passive: true });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", handler);
    };
  }, { x: 0, y: 0 });
}

export function createKeyPress(): Accessor<KeyboardEvent | null> {
  return from((set) => {
    const handler = (e: KeyboardEvent) => set(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, null);
}
```

## Part 3: Cross-Tab Storage Sync

### Requirements

Create a reactive localStorage wrapper that syncs across browser tabs.

### Implementation

```typescript
// src/storage.ts

import { createSignal, onCleanup, Signal } from "solid-js";

export function createStorageSignal<T>(
  key: string,
  initialValue: T,
  options?: {
    serializer?: (value: T) => string;
    deserializer?: (value: string) => T;
    storage?: Storage;
  }
): Signal<T> {
  const storage = options?.storage ?? localStorage;
  const serializer = options?.serializer ?? JSON.stringify;
  const deserializer = options?.deserializer ?? JSON.parse;

  // Read from storage
  let storedValue: T;
  try {
    const item = storage.getItem(key);
    storedValue = item ? deserializer(item) : initialValue;
  } catch (e) {
    console.error(`Failed to read from storage (key: ${key}):`, e);
    storedValue = initialValue;
  }

  const [value, setValue] = createSignal<T>(storedValue);

  // Custom setter that writes to storage
  const setValueAndStore = ((arg: any) => {
    const newValue = typeof arg === "function" ? arg(value()) : arg;

    try {
      storage.setItem(key, serializer(newValue));
    } catch (e) {
      console.error(`Failed to write to storage (key: ${key}):`, e);
    }

    return setValue(newValue as any);
  }) as typeof setValue;

  // Listen for changes in other tabs
  const storageHandler = (e: StorageEvent) => {
    if (e.key === key && e.newValue) {
      try {
        setValue(deserializer(e.newValue) as any);
      } catch (e) {
        console.error(`Failed to parse storage event (key: ${key}):`, e);
      }
    } else if (e.key === key && e.newValue === null) {
      // Key was removed
      setValue(initialValue as any);
    }
  };

  window.addEventListener("storage", storageHandler);
  onCleanup(() => window.removeEventListener("storage", storageHandler));

  return [value, setValueAndStore];
}
```

## Part 4: API Polling

### Requirements

Create a reactive API poller that fetches data periodically.

### Implementation

```typescript
// src/polling.ts

import { createSignal, onCleanup, Accessor } from "solid-js";

interface PollingState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  lastUpdate: Date | null;
}

export function createPolling<T>(
  fetcher: () => Promise<T>,
  interval: number,
  options?: {
    immediate?: boolean;
    retryOnError?: boolean;
    retryDelay?: number;
  }
): Accessor<PollingState<T>> {
  const [state, setState] = createSignal<PollingState<T>>({
    data: null,
    loading: options?.immediate ?? true,
    error: null,
    lastUpdate: null
  });

  let timeoutId: number | null = null;
  let isActive = true;

  async function poll() {
    if (!isActive) return;

    setState({
      ...state(),
      loading: true,
      error: null
    });

    try {
      const data = await fetcher();

      if (!isActive) return;

      setState({
        data,
        loading: false,
        error: null,
        lastUpdate: new Date()
      });

      // Schedule next poll
      timeoutId = setTimeout(poll, interval) as unknown as number;
    } catch (error) {
      if (!isActive) return;

      setState({
        ...state(),
        loading: false,
        error: error as Error,
        lastUpdate: new Date()
      });

      // Retry or schedule next poll
      const delay = options?.retryOnError ? (options.retryDelay ?? 1000) : interval;
      timeoutId = setTimeout(poll, delay) as unknown as number;
    }
  }

  if (options?.immediate ?? true) {
    poll();
  } else {
    timeoutId = setTimeout(poll, interval) as unknown as number;
  }

  onCleanup(() => {
    isActive = false;
    if (timeoutId) clearTimeout(timeoutId);
  });

  return state;
}
```

## Part 5: Main Dashboard Component

### Implementation

```typescript
// src/Dashboard.tsx

import { Component, createEffect, For, Show } from "solid-js";
import { createWebSocketStream } from "./websocket";
import { createMousePosition, createWindowSize, createScrollPosition } from "./events";
import { createStorageSignal } from "./storage";
import { createPolling } from "./polling";

interface ServerData {
  temperature: number;
  humidity: number;
  timestamp: number;
}

interface WeatherData {
  temp: number;
  description: string;
}

const Dashboard: Component = () => {
  // WebSocket stream
  const serverData = createWebSocketStream<ServerData>("ws://localhost:8080/data", {
    reconnect: true,
    heartbeat: 30000
  });

  // Event streams
  const mousePos = createMousePosition();
  const windowSize = createWindowSize();
  const scrollPos = createScrollPosition();

  // Cross-tab synced preferences
  const [theme, setTheme] = createStorageSignal("theme", "light");
  const [refreshRate, setRefreshRate] = createStorageSignal("refreshRate", 5000);

  // API polling
  const weather = createPolling<WeatherData>(
    async () => {
      const res = await fetch("/api/weather");
      return res.json();
    },
    refreshRate(),
    { immediate: true, retryOnError: true }
  );

  // Log updates
  createEffect(() => {
    console.log("Server data:", serverData());
  });

  createEffect(() => {
    console.log("Weather:", weather());
  });

  return (
    <div class={`dashboard theme-${theme()}`}>
      <header>
        <h1>Reactive Dashboard</h1>
        <div class="controls">
          <button onClick={() => setTheme(t => t === "light" ? "dark" : "light")}>
            Toggle Theme
          </button>
          <select
            value={refreshRate()}
            onChange={(e) => setRefreshRate(Number(e.target.value))}
          >
            <option value={1000}>1s</option>
            <option value={5000}>5s</option>
            <option value={10000}>10s</option>
          </select>
        </div>
      </header>

      <div class="grid">
        {/* WebSocket Data */}
        <div class="card">
          <h2>Server Data</h2>
          <Show
            when={serverData().status === "connected"}
            fallback={<p>Status: {serverData().status}</p>}
          >
            <Show when={serverData().data}>
              {(data) => (
                <>
                  <p>Temperature: {data().temperature}°C</p>
                  <p>Humidity: {data().humidity}%</p>
                  <p>Updated: {new Date(data().timestamp).toLocaleTimeString()}</p>
                </>
              )}
            </Show>
          </Show>
        </div>

        {/* Weather API */}
        <div class="card">
          <h2>Weather</h2>
          <Show when={!weather().loading} fallback={<p>Loading...</p>}>
            <Show when={weather().data}>
              {(data) => (
                <>
                  <p>Temperature: {data().temp}°C</p>
                  <p>{data().description}</p>
                  <p>
                    Last update:{" "}
                    {weather().lastUpdate?.toLocaleTimeString()}
                  </p>
                </>
              )}
            </Show>
          </Show>
        </div>

        {/* Mouse Position */}
        <div class="card">
          <h2>Mouse Position</h2>
          <p>X: {mousePos().x}px</p>
          <p>Y: {mousePos().y}px</p>
        </div>

        {/* Window Size */}
        <div class="card">
          <h2>Window Size</h2>
          <p>Width: {windowSize().width}px</p>
          <p>Height: {windowSize().height}px</p>
        </div>

        {/* Scroll Position */}
        <div class="card">
          <h2>Scroll Position</h2>
          <p>X: {scrollPos().x}px</p>
          <p>Y: {scrollPos().y}px</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
```

## Part 6: Testing

### WebSocket Tests

```typescript
// tests/websocket.test.ts

import { createRoot } from "solid-js";
import { createWebSocketStream } from "../src/websocket";

test("connects to websocket", (done) => {
  createRoot((dispose) => {
    const ws = createWebSocketStream("ws://localhost:8080");

    const checkStatus = setInterval(() => {
      const state = ws();
      if (state.status === "connected") {
        clearInterval(checkStatus);
        dispose();
        done();
      }
    }, 100);
  });
});
```

### Storage Tests

```typescript
// tests/storage.test.ts

import { createRoot } from "solid-js";
import { createStorageSignal } from "../src/storage";

test("syncs across signals", () => {
  createRoot((dispose1) => {
    const [value1, setValue1] = createStorageSignal("test", "initial");

    createRoot((dispose2) => {
      const [value2] = createStorageSignal("test", "initial");

      expect(value1()).toBe("initial");
      expect(value2()).toBe("initial");

      setValue1("updated");

      // Simulate storage event
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "test",
          newValue: JSON.stringify("updated")
        })
      );

      expect(value2()).toBe("updated");

      dispose2();
    });

    dispose1();
  });
});
```

## Part 7: Bonus Features

### Add These Enhancements:

1. **Error Boundary**
   ```typescript
   import { ErrorBoundary } from "solid-js";

   <ErrorBoundary fallback={(err) => <div>Error: {err.message}</div>}>
     <Dashboard />
   </ErrorBoundary>
   ```

2. **Loading States**
   ```typescript
   const [isLoading, setIsLoading] = createSignal(true);

   createEffect(() => {
     const allLoaded =
       serverData().status === "connected" &&
       !weather().loading;

     setIsLoading(!allLoaded);
   });
   ```

3. **Retry Logic**
   ```typescript
   function createRetryablePolling<T>(
     fetcher: () => Promise<T>,
     maxRetries: number = 3
   ) {
     // Implementation
   }
   ```

4. **Performance Monitoring**
   ```typescript
   const [metrics, setMetrics] = createSignal({
     wsLatency: 0,
     apiLatency: 0,
     updateRate: 0
   });
   ```

## Deliverables

1. ✅ Working dashboard with all features
2. ✅ Unit tests for all utilities
3. ✅ Error handling and loading states
4. ✅ Cross-tab synchronization
5. ✅ Performance optimizations
6. ✅ Documentation

## Success Criteria

- [ ] WebSocket connects and displays data
- [ ] API polling works with configurable interval
- [ ] Theme preference syncs across tabs
- [ ] Event streams update smoothly
- [ ] All tests pass
- [ ] No memory leaks
- [ ] Proper error handling

## Extensions

1. Add chart visualization for server data
2. Implement offline detection and caching
3. Add push notifications for critical alerts
4. Create a settings panel with more preferences
5. Add data export functionality

## Resources

- WebSocket Server: Create with Node.js/ws
- Mock API: Use json-server or create simple Express endpoints
- Styling: Use your preferred CSS framework

Good luck building your reactive dashboard!
