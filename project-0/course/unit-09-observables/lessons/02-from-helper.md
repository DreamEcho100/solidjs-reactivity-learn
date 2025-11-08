# Lesson 2: The from() Helper

## Overview

While `observable()` converts Signals to Observables, the `from()` function does the opposite: it converts Observables (or any subscription-based source) into Solid.js Signals. This enables bringing external reactive sources into Solid's reactive system.

## Function Signature

```typescript
export function from<T>(producer: Producer<T>, initialValue: T): Accessor<T>;
export function from<T>(producer: Producer<T | undefined>): Accessor<T | undefined>;
```

Where `Producer` is:

```typescript
type Producer<T> =
  | ((setter: Setter<T>) => () => void)
  | { subscribe: (fn: (v: T) => void) => (() => void) | { unsubscribe: () => void } };
```

## Two Producer Types

### Type 1: Function Producer

A function that receives a setter and returns a cleanup function:

```typescript
const producer = (set: Setter<number>) => {
  const interval = setInterval(() => {
    set(prev => prev + 1);
  }, 1000);
  
  return () => clearInterval(interval);
};

const count = from(producer, 0);
```

### Type 2: Observable Producer

An object with a `subscribe` method:

```typescript
const producer = {
  subscribe: (fn: (v: number) => void) => {
    const interval = setInterval(() => fn(Date.now()), 1000);
    return () => clearInterval(interval);
  }
};

const time = from(producer, Date.now());
```

## Implementation Breakdown

Let's analyze the Solid.js implementation:

```typescript
export function from<T>(
  producer: Producer<T | undefined>,
  initialValue: T | undefined = undefined
): Accessor<T | undefined> {
  // 1. Create a signal with initial value
  const [s, set] = createSignal<T | undefined>(initialValue, { equals: false });
  
  // 2. Subscribe to producer
  if ("subscribe" in producer) {
    // Observable-style producer
    const unsub = producer.subscribe(v => set(() => v));
    onCleanup(() => ("unsubscribe" in unsub ? unsub.unsubscribe() : unsub()));
  } else {
    // Function-style producer
    const clean = producer(set);
    onCleanup(clean);
  }
  
  // 3. Return the signal accessor
  return s;
}
```

## Step-by-Step Analysis

### Step 1: Create Signal

```typescript
const [s, set] = createSignal<T | undefined>(initialValue, { equals: false });
```

**Key points:**
- Signal initialized with `initialValue`
- `equals: false` means **every update triggers subscribers**
- This prevents value comparison optimization

**Why `equals: false`?**

```typescript
// Without equals: false
const [count, setCount] = createSignal(1);
setCount(1); // No update - same value
setCount(1); // No update - same value

// With equals: false
const [count, setCount] = createSignal(1, { equals: false });
setCount(1); // Update!
setCount(1); // Update!
```

For external sources, we can't assume values are comparable or that duplicates should be ignored.

### Step 2: Subscribe to Producer

#### Observable-style:

```typescript
if ("subscribe" in producer) {
  const unsub = producer.subscribe(v => set(() => v));
  onCleanup(() => ("unsubscribe" in unsub ? unsub.unsubscribe() : unsub()));
}
```

**Breaking down:**

1. Check if producer has `subscribe` method
2. Subscribe with a callback that updates the signal
3. Get unsubscribe function/object
4. Register cleanup that handles both patterns:
   - `{ unsubscribe: () => void }` object
   - `() => void` function

**Why `set(() => v)`?**

```typescript
// These are equivalent for primitives:
set(v);
set(() => v);

// But for updater functions, they differ:
const funcValue = () => 42;

set(funcValue);      // Calls funcValue() → sets to 42
set(() => funcValue); // Sets the actual function
```

Using `set(() => v)` ensures that if `v` is a function, it's set as the value, not called.

#### Function-style:

```typescript
else {
  const clean = producer(set);
  onCleanup(clean);
}
```

**Simpler:**
1. Call producer with setter
2. Producer returns cleanup function
3. Register cleanup

### Step 3: Return Accessor

```typescript
return s;
```

Returns just the getter (Accessor), not the setter.

## Example 1: Timer Observable

```typescript
import { from } from "solid-js";
import { createEffect } from "solid-js";

// Create a timer observable
const timer$ = {
  subscribe: (next: (v: number) => void) => {
    let count = 0;
    const id = setInterval(() => next(count++), 1000);
    
    return () => clearInterval(id);
  }
};

// Convert to signal
const timer = from(timer$, 0);

// Use in reactive context
createEffect(() => {
  console.log("Timer:", timer());
});

// After 1s: "Timer: 1"
// After 2s: "Timer: 2"
// After 3s: "Timer: 3"
```

## Example 2: WebSocket Observable

```typescript
function createWebSocketObservable(url: string) {
  return {
    subscribe: (next: (data: any) => void) => {
      const ws = new WebSocket(url);
      
      ws.onmessage = (event) => {
        next(JSON.parse(event.data));
      };
      
      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
      
      return () => ws.close();
    }
  };
}

// Usage
const wsData = from(createWebSocketObservable("ws://localhost:8080"), null);

createEffect(() => {
  const data = wsData();
  if (data) {
    console.log("Received:", data);
  }
});
```

## Example 3: RxJS Integration

```typescript
import { from } from "solid-js";
import { interval } from "rxjs";
import { map } from "rxjs/operators";

// Create RxJS observable
const rxCount$ = interval(1000).pipe(
  map(n => n * 10)
);

// Convert to Solid signal
const count = from({
  subscribe: (next) => {
    const subscription = rxCount$.subscribe(next);
    return () => subscription.unsubscribe();
  }
}, 0);

// Use reactively
createEffect(() => {
  console.log("Count:", count());
});
```

## Example 4: Function Producer

```typescript
import { from } from "solid-js";

// Mouse position producer
const mousePosition = from((set) => {
  const handler = (e: MouseEvent) => {
    set({ x: e.clientX, y: e.clientY });
  };
  
  window.addEventListener("mousemove", handler);
  
  return () => {
    window.removeEventListener("mousemove", handler);
  };
}, { x: 0, y: 0 });

// Use in component
createEffect(() => {
  const pos = mousePosition();
  console.log(`Mouse at: ${pos.x}, ${pos.y}`);
});
```

## Example 5: Geolocation

```typescript
const location = from((set) => {
  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      set({
        lat: position.coords.latitude,
        lng: position.coords.longitude
      });
    },
    (error) => {
      console.error("Geolocation error:", error);
    }
  );
  
  return () => {
    navigator.geolocation.clearWatch(watchId);
  };
}, { lat: 0, lng: 0 });
```

## Example 6: Browser Events

```typescript
function fromEvent<K extends keyof WindowEventMap>(
  target: EventTarget,
  eventName: K
): Accessor<WindowEventMap[K] | undefined> {
  return from((set) => {
    const handler = (event: Event) => set(event as WindowEventMap[K]);
    target.addEventListener(eventName, handler);
    return () => target.removeEventListener(eventName, handler);
  }, undefined);
}

// Usage
const click = fromEvent(document, "click");

createEffect(() => {
  const event = click();
  if (event) {
    console.log("Clicked at:", event.clientX, event.clientY);
  }
});
```

## The equals: false Decision

Why does `from()` use `{ equals: false }`?

### Consider this producer:

```typescript
const producer = (set) => {
  let count = 0;
  const id = setInterval(() => {
    // Always emits same value
    set(42);
  }, 1000);
  return () => clearInterval(id);
};

const signal = from(producer, 42);
```

**With equals: true (default):**
```typescript
// First emission: 42 → 42 (no change, no update)
// Second emission: 42 → 42 (no change, no update)
// Effects never run!
```

**With equals: false:**
```typescript
// First emission: 42 (update triggered!)
// Second emission: 42 (update triggered!)
// Effects run every time
```

External sources might intentionally emit the same value to signal events.

## Cleanup Lifecycle

### Observable Producer Cleanup

```typescript
const producer = {
  subscribe: (next) => {
    const id = setInterval(() => next(Date.now()), 1000);
    return () => clearInterval(id); // Cleanup function
  }
};

const time = from(producer, 0);

// Cleanup happens when:
// 1. Owner scope disposes
// 2. Component unmounts
// 3. Explicit cleanup called
```

### Function Producer Cleanup

```typescript
const producer = (set) => {
  const handler = (e) => set(e);
  window.addEventListener("resize", handler);
  
  return () => {
    window.removeEventListener("resize", handler);
  };
};

const size = from(producer, { width: 0, height: 0 });

// Cleanup registered automatically via onCleanup
```

## Common Patterns

### Pattern 1: Interval

```typescript
const createInterval = (ms: number) => from((set) => {
  let count = 0;
  const id = setInterval(() => set(count++), ms);
  return () => clearInterval(id);
}, 0);

const tick = createInterval(1000);
```

### Pattern 2: Promise to Signal

```typescript
const fromPromise = <T>(promise: Promise<T>, initialValue: T) =>
  from((set) => {
    promise.then(set);
    return () => {}; // Promises can't be cancelled
  }, initialValue);

const userData = fromPromise(
  fetch("/api/user").then(r => r.json()),
  null
);
```

### Pattern 3: Media Query

```typescript
const createMediaQuery = (query: string) =>
  from((set) => {
    const mql = window.matchMedia(query);
    const handler = () => set(mql.matches);
    
    handler(); // Set initial value
    mql.addListener(handler);
    
    return () => mql.removeListener(handler);
  }, false);

const isDark = createMediaQuery("(prefers-color-scheme: dark)");
```

### Pattern 4: Local Storage Sync

```typescript
const createLocalStorage = (key: string, initialValue: string) =>
  from((set) => {
    // Set from storage
    const stored = localStorage.getItem(key);
    if (stored) set(stored);
    
    // Listen to storage events
    const handler = (e: StorageEvent) => {
      if (e.key === key && e.newValue) {
        set(e.newValue);
      }
    };
    
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, initialValue);

const theme = createLocalStorage("theme", "light");
```

## Bidirectional Observable Integration

Combining `observable()` and `from()`:

```typescript
import { createSignal, observable, from } from "solid-js";
import { from as rxFrom } from "rxjs";
import { map } from "rxjs/operators";

// Solid signal
const [input, setInput] = createSignal(0);

// Convert to RxJS observable
const input$ = rxFrom(observable(input));

// Transform with RxJS
const output$ = input$.pipe(
  map(x => x * 2)
);

// Convert back to Solid signal
const output = from({
  subscribe: (next) => {
    const sub = output$.subscribe(next);
    return () => sub.unsubscribe();
  }
}, 0);

// Now we have reactive pipeline:
// input → RxJS pipeline → output

setInput(5);
console.log(output()); // 10
```

## Error Handling

`from()` doesn't handle errors by default:

```typescript
const failing = from({
  subscribe: (next) => {
    setTimeout(() => {
      throw new Error("Boom!"); // Uncaught!
    }, 1000);
    return () => {};
  }
}, 0);
```

**Solution: Wrap in try/catch or use error boundaries:**

```typescript
const safeProducer = {
  subscribe: (next) => {
    try {
      // potentially failing code
      const id = setInterval(() => {
        try {
          next(riskyComputation());
        } catch (e) {
          console.error(e);
        }
      }, 1000);
      return () => clearInterval(id);
    } catch (e) {
      console.error(e);
      return () => {};
    }
  }
};
```

## Performance Considerations

### Memory

Each `from()` creates:
- One signal
- One subscription
- One cleanup handler

**Best Practice:** Create at component level, not in loops.

### Updates

With `equals: false`, every emission triggers updates:

```typescript
// High frequency source
const mouseMoveSignal = from((set) => {
  const handler = (e) => set({ x: e.clientX, y: e.clientY });
  window.addEventListener("mousemove", handler);
  return () => window.removeEventListener("mousemove", handler);
}, { x: 0, y: 0 });

// Can cause many updates!
```

**Solution: Throttle/debounce the producer:**

```typescript
const throttledMouse = from((set) => {
  let timeout: number | null = null;
  const handler = (e: MouseEvent) => {
    if (!timeout) {
      timeout = setTimeout(() => {
        set({ x: e.clientX, y: e.clientY });
        timeout = null;
      }, 16); // ~60fps
    }
  };
  window.addEventListener("mousemove", handler);
  return () => {
    if (timeout) clearTimeout(timeout);
    window.removeEventListener("mousemove", handler);
  };
}, { x: 0, y: 0 });
```

## Testing

```typescript
import { from, createEffect } from "solid-js";
import { createRoot } from "solid-js";

test("from converts observable to signal", () => {
  const values: number[] = [];
  
  const producer = (set: (v: number) => void) => {
    set(1);
    setTimeout(() => set(2), 10);
    setTimeout(() => set(3), 20);
    return () => {};
  };
  
  createRoot(dispose => {
    const signal = from(producer, 0);
    
    createEffect(() => {
      values.push(signal());
    });
    
    setTimeout(() => {
      expect(values).toEqual([0, 1, 2, 3]);
      dispose();
    }, 50);
  });
});
```

## Summary

The `from()` function:
- Converts external reactive sources to Signals
- Supports both observable and function patterns
- Uses `equals: false` to capture all emissions
- Automatically manages cleanup
- Enables integration with any reactive library

**Key Insights:**
1. Bridges external reactivity into Solid
2. Two patterns: observable and function producer
3. Cleanup is automatic via `onCleanup`
4. Always emits updates (no equality check)

## Next Steps

Next lesson: **External Source Integration** - How to integrate custom reactive systems with Solid.js using `enableExternalSource`.

## Quiz

1. Why does `from()` use `{ equals: false }`?
2. What's the difference between function and observable producers?
3. When is the cleanup function called?
4. How would you convert an RxJS observable to a Solid signal?
5. What happens if a producer emits very frequently?
