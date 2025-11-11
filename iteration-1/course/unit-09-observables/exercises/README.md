# Unit 9 Exercises: Observable Integration

## Exercise 1: Basic Observable Implementation

**Difficulty:** ⭐⭐☆☆☆

Implement a simplified version of the `observable()` function.

### Task

```typescript
function myObservable<T>(signal: Accessor<T>): Observable<T> {
  // Your implementation here
}
```

### Requirements

1. Returns an object with `subscribe` method
2. Subscribe accepts a function or object observer
3. Returns unsubscribe function
4. Calls observer on every signal update
5. Cleans up when unsubscribed

### Test Cases

```typescript
test("observable emits signal values", () => {
  const [count, setCount] = createSignal(0);
  const obs = myObservable(count);
  
  const values: number[] = [];
  const sub = obs.subscribe(v => values.push(v));
  
  setCount(1);
  setCount(2);
  
  expect(values).toEqual([0, 1, 2]);
  
  sub.unsubscribe();
  setCount(3);
  
  expect(values).toEqual([0, 1, 2]); // No more updates
});

test("observable handles object observer", () => {
  const [count, setCount] = createSignal(0);
  const obs = myObservable(count);
  
  const values: number[] = [];
  const sub = obs.subscribe({
    next: v => values.push(v)
  });
  
  setCount(1);
  expect(values).toEqual([0, 1]);
  
  sub.unsubscribe();
});
```

### Solution

<details>
<summary>Click to reveal</summary>

```typescript
import { createRoot, createEffect, untrack, getOwner, onCleanup } from "solid-js";

function myObservable<T>(signal: Accessor<T>): Observable<T> {
  return {
    subscribe(observer) {
      if (!(observer instanceof Object) || observer == null) {
        throw new TypeError("Expected the observer to be an object.");
      }

      const handler =
        typeof observer === "function"
          ? observer
          : observer.next && observer.next.bind(observer);

      if (!handler) {
        return { unsubscribe() {} };
      }

      const dispose = createRoot(disposer => {
        createEffect(() => {
          const v = signal();
          untrack(() => handler(v));
        });

        return disposer;
      });

      if (getOwner()) onCleanup(dispose);

      return {
        unsubscribe() {
          dispose();
        }
      };
    },
    
    [Symbol.observable || "@@observable"]() {
      return this;
    }
  };
}
```

</details>

---

## Exercise 2: Implement from() Function

**Difficulty:** ⭐⭐⭐☆☆

Implement the `from()` function to convert observables to signals.

### Task

```typescript
function myFrom<T>(
  producer: Producer<T>,
  initialValue?: T
): Accessor<T | undefined> {
  // Your implementation here
}
```

### Requirements

1. Support function producers: `(set) => cleanup`
2. Support observable producers: `{ subscribe: (fn) => unsubscribe }`
3. Return signal accessor
4. Register cleanup properly
5. Use `equals: false` for the signal

### Test Cases

```typescript
test("from converts function producer to signal", () => {
  const signal = myFrom((set) => {
    set(1);
    setTimeout(() => set(2), 10);
    return () => {};
  }, 0);
  
  expect(signal()).toBe(1);
  
  return new Promise(resolve => {
    setTimeout(() => {
      expect(signal()).toBe(2);
      resolve();
    }, 20);
  });
});

test("from converts observable producer to signal", () => {
  const producer = {
    subscribe: (next: (v: number) => void) => {
      next(1);
      const id = setTimeout(() => next(2), 10);
      return () => clearTimeout(id);
    }
  };
  
  const signal = myFrom(producer, 0);
  expect(signal()).toBe(1);
});

test("from cleans up on dispose", () => {
  let cleaned = false;
  
  createRoot(dispose => {
    const signal = myFrom((set) => {
      set(1);
      return () => { cleaned = true; };
    }, 0);
    
    expect(signal()).toBe(1);
    dispose();
  });
  
  expect(cleaned).toBe(true);
});
```

### Solution

<details>
<summary>Click to reveal</summary>

```typescript
import { createSignal, onCleanup } from "solid-js";

function myFrom<T>(
  producer: Producer<T | undefined>,
  initialValue: T | undefined = undefined
): Accessor<T | undefined> {
  const [s, set] = createSignal<T | undefined>(initialValue, { equals: false });
  
  if ("subscribe" in producer) {
    const unsub = producer.subscribe(v => set(() => v));
    onCleanup(() => ("unsubscribe" in unsub ? unsub.unsubscribe() : unsub()));
  } else {
    const clean = producer(set);
    onCleanup(clean);
  }
  
  return s;
}
```

</details>

---

## Exercise 3: RxJS Integration

**Difficulty:** ⭐⭐⭐☆☆

Create utilities to seamlessly integrate RxJS with Solid.

### Task

Create two functions:
1. `toObservable()`: Convert Solid signal to RxJS Observable
2. `fromObservable()`: Convert RxJS Observable to Solid signal

### Requirements

```typescript
import { Observable as RxObservable } from "rxjs";

function toObservable<T>(signal: Accessor<T>): RxObservable<T> {
  // Your implementation
}

function fromObservable<T>(
  observable: RxObservable<T>,
  initialValue?: T
): Accessor<T | undefined> {
  // Your implementation
}
```

### Test Cases

```typescript
import { interval } from "rxjs";
import { map, take } from "rxjs/operators";

test("toObservable converts signal to RxJS", (done) => {
  const [count, setCount] = createSignal(0);
  const count$ = toObservable(count);
  
  const values: number[] = [];
  count$.pipe(take(3)).subscribe({
    next: v => values.push(v),
    complete: () => {
      expect(values).toEqual([0, 1, 2]);
      done();
    }
  });
  
  setCount(1);
  setCount(2);
});

test("fromObservable converts RxJS to signal", (done) => {
  const count$ = interval(10).pipe(take(3), map(x => x * 2));
  const count = fromObservable(count$, 0);
  
  setTimeout(() => {
    expect(count()).toBeGreaterThan(0);
    done();
  }, 50);
});
```

### Solution

<details>
<summary>Click to reveal</summary>

```typescript
import { Observable as RxObservable } from "rxjs";
import { createSignal, createRoot, createEffect, untrack, getOwner, onCleanup } from "solid-js";

function toObservable<T>(signal: Accessor<T>): RxObservable<T> {
  return new RxObservable(subscriber => {
    const dispose = createRoot(disposer => {
      createEffect(() => {
        const v = signal();
        untrack(() => subscriber.next(v));
      });

      return disposer;
    });

    if (getOwner()) onCleanup(dispose);

    return () => dispose();
  });
}

function fromObservable<T>(
  observable: RxObservable<T>,
  initialValue?: T
): Accessor<T | undefined> {
  const [s, set] = createSignal<T | undefined>(initialValue, { equals: false });
  
  const subscription = observable.subscribe({
    next: v => set(() => v),
    error: e => console.error("Observable error:", e)
  });
  
  onCleanup(() => subscription.unsubscribe());
  
  return s;
}
```

</details>

---

## Exercise 4: Event Stream to Signal

**Difficulty:** ⭐⭐☆☆☆

Create a utility to convert DOM events to signals.

### Task

```typescript
function fromEvent<K extends keyof WindowEventMap>(
  target: EventTarget,
  eventName: K
): Accessor<WindowEventMap[K] | undefined> {
  // Your implementation
}
```

### Requirements

1. Listen to DOM events
2. Return signal with latest event
3. Clean up event listeners
4. Handle event listener options

### Test Cases

```typescript
test("fromEvent converts events to signals", () => {
  const button = document.createElement("button");
  const click = fromEvent(button, "click");
  
  expect(click()).toBeUndefined();
  
  const event = new MouseEvent("click", { clientX: 100, clientY: 200 });
  button.dispatchEvent(event);
  
  expect(click()?.clientX).toBe(100);
  expect(click()?.clientY).toBe(200);
});
```

### Solution

<details>
<summary>Click to reveal</summary>

```typescript
import { createSignal, onCleanup } from "solid-js";

function fromEvent<K extends keyof WindowEventMap>(
  target: EventTarget,
  eventName: K,
  options?: AddEventListenerOptions
): Accessor<WindowEventMap[K] | undefined> {
  const [event, setEvent] = createSignal<WindowEventMap[K] | undefined>(
    undefined,
    { equals: false }
  );
  
  const handler = (e: Event) => setEvent(e as WindowEventMap[K]);
  target.addEventListener(eventName, handler, options);
  
  onCleanup(() => target.removeEventListener(eventName, handler, options));
  
  return event;
}
```

</details>

---

## Exercise 5: WebSocket Observable

**Difficulty:** ⭐⭐⭐⭐☆

Create a reactive WebSocket wrapper.

### Task

```typescript
interface WebSocketMessage<T = any> {
  type: "open" | "message" | "error" | "close";
  data?: T;
  error?: Error;
}

function createWebSocket<T = any>(
  url: string
): Accessor<WebSocketMessage<T>> {
  // Your implementation
}
```

### Requirements

1. Connect to WebSocket
2. Emit all WebSocket events as signals
3. Handle reconnection
4. Clean up on dispose
5. Support JSON parsing

### Example Usage

```typescript
const ws = createWebSocket("ws://localhost:8080");

createEffect(() => {
  const msg = ws();
  
  switch (msg.type) {
    case "open":
      console.log("Connected");
      break;
    case "message":
      console.log("Received:", msg.data);
      break;
    case "error":
      console.error("Error:", msg.error);
      break;
    case "close":
      console.log("Disconnected");
      break;
  }
});
```

### Solution

<details>
<summary>Click to reveal</summary>

```typescript
import { createSignal, onCleanup } from "solid-js";

function createWebSocket<T = any>(
  url: string,
  options?: { autoReconnect?: boolean; reconnectDelay?: number }
): Accessor<WebSocketMessage<T>> {
  const [message, setMessage] = createSignal<WebSocketMessage<T>>(
    { type: "close" },
    { equals: false }
  );
  
  let ws: WebSocket | null = null;
  let reconnectTimeout: number | null = null;
  let shouldReconnect = options?.autoReconnect ?? false;
  
  function connect() {
    ws = new WebSocket(url);
    
    ws.onopen = () => {
      setMessage({ type: "open" });
    };
    
    ws.onmessage = (event) => {
      let data: T;
      try {
        data = JSON.parse(event.data);
      } catch {
        data = event.data;
      }
      setMessage({ type: "message", data });
    };
    
    ws.onerror = () => {
      setMessage({ type: "error", error: new Error("WebSocket error") });
    };
    
    ws.onclose = () => {
      setMessage({ type: "close" });
      
      if (shouldReconnect) {
        reconnectTimeout = setTimeout(
          connect,
          options?.reconnectDelay ?? 1000
        ) as unknown as number;
      }
    };
  }
  
  connect();
  
  onCleanup(() => {
    shouldReconnect = false;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    if (ws) ws.close();
  });
  
  return message;
}
```

</details>

---

## Exercise 6: Implement enableExternalSource

**Difficulty:** ⭐⭐⭐⭐⭐

Implement a simplified version of `enableExternalSource` to integrate a custom reactive system.

### Task

Create a custom reactive system and integrate it with Solid.

### Custom System

```typescript
class ReactiveValue<T> {
  private value: T;
  private listeners = new Set<() => void>();
  
  constructor(initialValue: T) {
    this.value = initialValue;
  }
  
  get(): T {
    // TODO: Track access
    return this.value;
  }
  
  set(newValue: T): void {
    this.value = newValue;
    this.listeners.forEach(fn => fn());
  }
  
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
```

### Requirements

1. Track which ReactiveValues are accessed during computation
2. Subscribe to those values
3. Trigger Solid updates when values change
4. Clean up subscriptions properly

### Test Cases

```typescript
test("external reactive integration", () => {
  const external = new ReactiveValue(0);
  const [solid, setSolid] = createSignal(0);
  
  const values: number[] = [];
  
  createEffect(() => {
    values.push(external.get() + solid());
  });
  
  expect(values).toEqual([0]);
  
  external.set(1);
  expect(values).toEqual([0, 1]);
  
  setSolid(1);
  expect(values).toEqual([0, 1, 2]);
  
  external.set(2);
  expect(values).toEqual([0, 1, 2, 3]);
});
```

### Solution

<details>
<summary>Click to reveal</summary>

```typescript
import { enableExternalSource, createSignal } from "solid-js";

// Track currently executing effect
let currentTracker: ReactiveValue<any>[] | null = null;

class ReactiveValue<T> {
  private value: T;
  private listeners = new Set<() => void>();
  
  constructor(initialValue: T) {
    this.value = initialValue;
  }
  
  get(): T {
    // Register access if we're tracking
    if (currentTracker) {
      currentTracker.push(this);
    }
    return this.value;
  }
  
  set(newValue: T): void {
    this.value = newValue;
    this.listeners.forEach(fn => fn());
  }
  
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

// Enable integration
enableExternalSource(
  (fn, trigger) => {
    const subscriptions: (() => void)[] = [];
    
    return {
      track: (prev) => {
        // Clean up old subscriptions
        subscriptions.forEach(unsub => unsub());
        subscriptions.length = 0;
        
        // Track which external values are accessed
        currentTracker = [];
        const result = fn(prev);
        const accessed = currentTracker;
        currentTracker = null;
        
        // Subscribe to accessed values
        accessed.forEach(reactive => {
          const unsub = reactive.subscribe(trigger);
          subscriptions.push(unsub);
        });
        
        return result;
      },
      dispose: () => {
        subscriptions.forEach(unsub => unsub());
        subscriptions.length = 0;
      }
    };
  },
  (fn) => {
    // Untrack - don't register accesses
    const prev = currentTracker;
    currentTracker = null;
    try {
      return fn();
    } finally {
      currentTracker = prev;
    }
  }
);
```

</details>

---

## Exercise 7: Throttled Observable

**Difficulty:** ⭐⭐⭐☆☆

Create a function that converts a high-frequency signal to a throttled observable.

### Task

```typescript
function throttledObservable<T>(
  signal: Accessor<T>,
  delay: number
): Observable<T> {
  // Your implementation
}
```

### Requirements

1. Only emit at most once per `delay` milliseconds
2. Always emit the latest value
3. Clean up timers on unsubscribe

### Test Cases

```typescript
test("throttles rapid updates", (done) => {
  const [count, setCount] = createSignal(0);
  const obs = throttledObservable(count, 100);
  
  const values: number[] = [];
  obs.subscribe(v => values.push(v));
  
  setCount(1);
  setCount(2);
  setCount(3);
  
  setTimeout(() => {
    expect(values.length).toBeLessThan(4);
    done();
  }, 50);
});
```

### Solution

<details>
<summary>Click to reveal</summary>

```typescript
import { createRoot, createEffect, untrack } from "solid-js";

function throttledObservable<T>(
  signal: Accessor<T>,
  delay: number
): Observable<T> {
  return {
    subscribe(observer) {
      const handler =
        typeof observer === "function"
          ? observer
          : observer.next && observer.next.bind(observer);

      if (!handler) {
        return { unsubscribe() {} };
      }

      let timeout: number | null = null;
      let latestValue: T;
      let hasPending = false;

      const dispose = createRoot(disposer => {
        createEffect(() => {
          const v = signal();
          
          untrack(() => {
            latestValue = v;
            
            if (!timeout) {
              handler(v);
              timeout = setTimeout(() => {
                timeout = null;
                if (hasPending) {
                  handler(latestValue);
                  hasPending = false;
                }
              }, delay) as unknown as number;
            } else {
              hasPending = true;
            }
          });
        });

        return () => {
          if (timeout) clearTimeout(timeout);
          disposer();
        };
      });

      return {
        unsubscribe() {
          dispose();
        }
      };
    },
    
    [Symbol.observable || "@@observable"]() {
      return this;
    }
  };
}
```

</details>

---

## Challenge Exercise: Build a Reactive LocalStorage Sync

**Difficulty:** ⭐⭐⭐⭐⭐

Create a bidirectional sync between Solid signals and localStorage that works across browser tabs.

### Task

```typescript
function createLocalStorageSignal<T>(
  key: string,
  initialValue: T,
  options?: {
    serializer?: (value: T) => string;
    deserializer?: (value: string) => T;
  }
): Signal<T> {
  // Your implementation
}
```

### Requirements

1. Read from localStorage on initialization
2. Write to localStorage on updates
3. Sync across tabs via storage events
4. Handle serialization/deserialization
5. Clean up event listeners

### Hints

- Use the `storage` event
- Remember to parse/stringify JSON
- Handle initialization carefully
- Consider race conditions

### Solution

<details>
<summary>Click to reveal</summary>

```typescript
import { createSignal, onCleanup } from "solid-js";

function createLocalStorageSignal<T>(
  key: string,
  initialValue: T,
  options?: {
    serializer?: (value: T) => string;
    deserializer?: (value: string) => T;
  }
): Signal<T> {
  const serializer = options?.serializer ?? JSON.stringify;
  const deserializer = options?.deserializer ?? JSON.parse;
  
  // Read from localStorage
  let storedValue: T;
  try {
    const item = localStorage.getItem(key);
    storedValue = item ? deserializer(item) : initialValue;
  } catch {
    storedValue = initialValue;
  }
  
  const [value, setValue] = createSignal<T>(storedValue);
  
  // Custom setter that writes to localStorage
  const setValueAndStore = ((arg: any) => {
    const newValue = typeof arg === "function" ? arg(value()) : arg;
    
    try {
      localStorage.setItem(key, serializer(newValue));
    } catch (e) {
      console.error("Failed to write to localStorage:", e);
    }
    
    return setValue(newValue as any);
  }) as Setter<T>;
  
  // Listen for changes in other tabs
  const handler = (e: StorageEvent) => {
    if (e.key === key && e.newValue) {
      try {
        setValue(deserializer(e.newValue) as any);
      } catch (e) {
        console.error("Failed to parse storage event:", e);
      }
    }
  };
  
  window.addEventListener("storage", handler);
  onCleanup(() => window.removeEventListener("storage", handler));
  
  return [value, setValueAndStore];
}
```

</details>

---

## Bonus: Observable Operators

**Difficulty:** ⭐⭐⭐⭐☆

Implement common RxJS-style operators for Solid observables.

### Task

Implement these operators:

```typescript
function map<T, U>(
  source: Accessor<T>,
  fn: (value: T) => U
): Accessor<U> {
  // Your implementation
}

function filter<T>(
  source: Accessor<T>,
  predicate: (value: T) => boolean
): Accessor<T | undefined> {
  // Your implementation
}

function debounce<T>(
  source: Accessor<T>,
  delay: number
): Accessor<T> {
  // Your implementation
}
```

### Solutions

<details>
<summary>Click to reveal</summary>

```typescript
import { createMemo, createSignal, onCleanup } from "solid-js";

function map<T, U>(
  source: Accessor<T>,
  fn: (value: T) => U
): Accessor<U> {
  return createMemo(() => fn(source()));
}

function filter<T>(
  source: Accessor<T>,
  predicate: (value: T) => boolean
): Accessor<T | undefined> {
  const [filtered, setFiltered] = createSignal<T | undefined>();
  
  createEffect(() => {
    const value = source();
    if (predicate(value)) {
      setFiltered(() => value);
    }
  });
  
  return filtered;
}

function debounce<T>(
  source: Accessor<T>,
  delay: number
): Accessor<T> {
  const [debounced, setDebounced] = createSignal(source());
  let timeout: number | null = null;
  
  createEffect(() => {
    const value = source();
    
    if (timeout) clearTimeout(timeout);
    
    timeout = setTimeout(() => {
      setDebounced(() => value);
      timeout = null;
    }, delay) as unknown as number;
  });
  
  onCleanup(() => {
    if (timeout) clearTimeout(timeout);
  });
  
  return debounced;
}
```

</details>

---

## Summary

These exercises cover:
1. ✅ Basic observable/signal conversion
2. ✅ RxJS integration patterns
3. ✅ Event stream handling
4. ✅ WebSocket reactivity
5. ✅ External source integration
6. ✅ Performance optimization (throttling/debouncing)
7. ✅ Real-world patterns (localStorage sync)
8. ✅ Custom operators

Complete all exercises to master Observable integration in Solid.js!
