# Unit 9 Notes: Observable Integration

## Quick Reference

### Converting Signals to Observables

```typescript
import { observable } from "solid-js";
import { from } from "rxjs";

const [count, setCount] = createSignal(0);
const count$ = from(observable(count));
```

### Converting Observables to Signals

```typescript
import { from } from "solid-js";

const signal = from({
  subscribe: (next) => {
    const id = setInterval(() => next(Date.now()), 1000);
    return () => clearInterval(id);
  }
}, Date.now());
```

---

## Key Concepts

### 1. Observable Pattern

**Definition:** A standardized interface for producing values over time.

**Interface:**
```typescript
interface Observable<T> {
  subscribe(observer: Observer<T>): Subscription;
  [Symbol.observable](): Observable<T>;
}
```

**Use Cases:**
- Integration with RxJS
- Event streams
- Async data sources
- Cross-library communication

---

### 2. Signal vs Observable

| Feature | Signal | Observable |
|---------|--------|------------|
| **Tracking** | Automatic | Manual subscription |
| **Cleanup** | Automatic (owner-based) | Manual unsubscribe |
| **API** | Solid-specific | Standard (TC39) |
| **Performance** | Optimized for UI | General purpose |
| **Initial value** | Always has value | May not have |

---

### 3. observable() Implementation Pattern

```typescript
export function observable<T>(input: Accessor<T>): Observable<T> {
  return {
    subscribe(observer) {
      // 1. Validate observer
      const handler = extractHandler(observer);
      
      // 2. Create isolated reactive scope
      const dispose = createRoot(disposer => {
        createEffect(() => {
          const v = input();           // Track signal
          untrack(() => handler(v));   // Call without tracking
        });
        return disposer;
      });
      
      // 3. Auto-cleanup
      if (getOwner()) onCleanup(dispose);
      
      // 4. Return subscription
      return { unsubscribe: dispose };
    },
    
    [Symbol.observable]() {
      return this;
    }
  };
}
```

**Why createRoot?**
- Isolates the subscription
- Prevents memory leaks
- Enables manual cleanup

**Why untrack the handler?**
- Handler shouldn't create dependencies
- Prevents accidental tracking
- Cleaner dependency graph

---

### 4. from() Implementation Pattern

```typescript
export function from<T>(
  producer: Producer<T>,
  initialValue?: T
): Accessor<T> {
  const [s, set] = createSignal(initialValue, { equals: false });
  
  if ("subscribe" in producer) {
    const unsub = producer.subscribe(v => set(() => v));
    onCleanup(() => unsub.unsubscribe?.() ?? unsub());
  } else {
    const clean = producer(set);
    onCleanup(clean);
  }
  
  return s;
}
```

**Why equals: false?**
- External sources may emit same value intentionally
- Can't assume value comparability
- Preserves all updates

**Two producer patterns:**
1. Observable: `{ subscribe: (fn) => unsubscribe }`
2. Function: `(set) => cleanup`

---

### 5. External Source Integration

**Purpose:** Deep integration with other reactive systems

```typescript
enableExternalSource(
  (fn, trigger) => ({
    track: (prev) => {
      // Subscribe to external reactive sources
      // Return fn(prev)
    },
    dispose: () => {
      // Cleanup subscriptions
    }
  }),
  (fn) => {
    // Run fn without tracking external sources
    return fn();
  }
);
```

**When to use:**
- Integrating MobX, Vue, or other reactive libraries
- Building framework bridges
- Gradual migrations

**Trade-offs:**
- ✅ Deep integration
- ❌ Added complexity
- ❌ Performance overhead

---

## Common Patterns

### Pattern 1: Timer/Interval

```typescript
const createInterval = (ms: number, initialValue = 0) =>
  from((set) => {
    let count = initialValue;
    const id = setInterval(() => set(count++), ms);
    return () => clearInterval(id);
  }, initialValue);

const tick = createInterval(1000);
```

### Pattern 2: DOM Events

```typescript
function fromEvent<K extends keyof WindowEventMap>(
  target: EventTarget,
  eventName: K
): Accessor<WindowEventMap[K] | undefined> {
  return from((set) => {
    const handler = (e: Event) => set(e as WindowEventMap[K]);
    target.addEventListener(eventName, handler);
    return () => target.removeEventListener(eventName, handler);
  }, undefined);
}

const clicks = fromEvent(document, "click");
```

### Pattern 3: WebSocket

```typescript
function createWebSocket(url: string) {
  return from((set) => {
    const ws = new WebSocket(url);
    ws.onmessage = (e) => set(JSON.parse(e.data));
    ws.onerror = (e) => console.error(e);
    return () => ws.close();
  }, null);
}

const wsData = createWebSocket("ws://localhost:8080");
```

### Pattern 4: Media Query

```typescript
const createMediaQuery = (query: string) =>
  from((set) => {
    const mql = window.matchMedia(query);
    const handler = () => set(mql.matches);
    handler(); // Initial value
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, false);

const isDark = createMediaQuery("(prefers-color-scheme: dark)");
```

### Pattern 5: LocalStorage Sync

```typescript
function createLocalStorage(key: string, initialValue: string) {
  return from((set) => {
    const stored = localStorage.getItem(key);
    if (stored) set(stored);
    
    const handler = (e: StorageEvent) => {
      if (e.key === key && e.newValue) {
        set(e.newValue);
      }
    };
    
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, initialValue);
}

const theme = createLocalStorage("theme", "light");
```

### Pattern 6: Geolocation

```typescript
const createGeolocation = () =>
  from((set) => {
    const watchId = navigator.geolocation.watchPosition(
      (pos) => set({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      }),
      (error) => console.error(error)
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, { lat: 0, lng: 0 });

const location = createGeolocation();
```

### Pattern 7: Bidirectional RxJS Pipeline

```typescript
import { from as rxFrom } from "rxjs";
import { map, filter } from "rxjs/operators";
import { observable, from } from "solid-js";

const [input, setInput] = createSignal(0);

// Solid → RxJS
const input$ = rxFrom(observable(input));

// RxJS transformations
const output$ = input$.pipe(
  filter(x => x > 0),
  map(x => x * 2)
);

// RxJS → Solid
const output = from({
  subscribe: (next) => {
    const sub = output$.subscribe(next);
    return () => sub.unsubscribe();
  }
}, 0);

setInput(5);
console.log(output()); // 10
```

---

## Performance Optimization

### Throttling High-Frequency Sources

```typescript
function throttledFrom<T>(
  producer: Producer<T>,
  delay: number,
  initialValue: T
): Accessor<T> {
  const [signal, setSignal] = createSignal(initialValue);
  let timeout: number | null = null;
  let latest: T;
  
  const throttledProducer = (set: Setter<T>) => {
    const originalCleanup = producer((value) => {
      latest = value;
      if (!timeout) {
        set(value);
        timeout = setTimeout(() => {
          timeout = null;
          set(latest);
        }, delay) as unknown as number;
      }
    });
    
    return () => {
      if (timeout) clearTimeout(timeout);
      originalCleanup();
    };
  };
  
  return from(throttledProducer, initialValue);
}
```

### Debouncing Updates

```typescript
function debouncedFrom<T>(
  producer: Producer<T>,
  delay: number,
  initialValue: T
): Accessor<T> {
  const [signal, setSignal] = createSignal(initialValue);
  let timeout: number | null = null;
  
  const debouncedProducer = (set: Setter<T>) => {
    const originalCleanup = producer((value) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        set(value);
        timeout = null;
      }, delay) as unknown as number;
    });
    
    return () => {
      if (timeout) clearTimeout(timeout);
      originalCleanup();
    };
  };
  
  return from(debouncedProducer, initialValue);
}
```

---

## Debugging Tips

### 1. Track Subscriptions

```typescript
let subscriptionCount = 0;

const trackedObservable = <T>(signal: Accessor<T>) => ({
  subscribe(observer: any) {
    const id = ++subscriptionCount;
    console.log(`[Subscribe #${id}]`);
    
    const sub = observable(signal).subscribe(observer);
    
    return {
      unsubscribe() {
        console.log(`[Unsubscribe #${id}]`);
        sub.unsubscribe();
      }
    };
  }
});
```

### 2. Log Observable Emissions

```typescript
function tap<T>(
  source: Accessor<T>,
  fn: (value: T) => void
): Accessor<T> {
  createEffect(() => {
    fn(source());
  });
  return source;
}

const logged = tap(signal, v => console.log("Emitted:", v));
```

### 3. Verify Cleanup

```typescript
test("subscription cleans up", () => {
  let cleaned = false;
  
  const producer = (set: any) => {
    return () => { cleaned = true; };
  };
  
  createRoot(dispose => {
    const sig = from(producer, 0);
    expect(cleaned).toBe(false);
    dispose();
  });
  
  expect(cleaned).toBe(true);
});
```

---

## Common Pitfalls

### ❌ Forgetting to Unsubscribe

```typescript
// BAD
const count$ = from(observable(signal));
count$.subscribe(v => console.log(v));
// Subscription never cleaned up!
```

```typescript
// GOOD
createRoot(dispose => {
  const count$ = from(observable(signal));
  count$.subscribe(v => console.log(v));
  // ... later
  dispose(); // Cleanup!
});
```

### ❌ Not Using equals: false in from()

```typescript
// BAD: External source that emits duplicates
const [signal, setSignal] = createSignal(0); // equals: true (default)

// GOOD
const [signal, setSignal] = createSignal(0, { equals: false });
```

### ❌ Tracking in Observer

```typescript
// BAD
const [other, setOther] = createSignal(0);

observable(signal).subscribe(v => {
  console.log(v, other()); // Creates unwanted dependency!
});

// GOOD
observable(signal).subscribe(v => {
  untrack(() => console.log(v, other()));
});
```

### ❌ Memory Leaks with Event Listeners

```typescript
// BAD
const clicks = from((set) => {
  window.addEventListener("click", (e) => set(e));
  // No cleanup!
}, undefined);

// GOOD
const clicks = from((set) => {
  const handler = (e) => set(e);
  window.addEventListener("click", handler);
  return () => window.removeEventListener("click", handler);
}, undefined);
```

---

## Testing Strategies

### Testing observable()

```typescript
test("observable emits on signal change", async () => {
  const [count, setCount] = createSignal(0);
  const values: number[] = [];
  
  const sub = from(observable(count)).subscribe(v => values.push(v));
  
  setCount(1);
  setCount(2);
  
  expect(values).toEqual([0, 1, 2]);
  sub.unsubscribe();
});
```

### Testing from()

```typescript
test("from handles async producer", async () => {
  const signal = from((set) => {
    setTimeout(() => set(42), 10);
    return () => {};
  }, 0);
  
  expect(signal()).toBe(0);
  
  await new Promise(resolve => setTimeout(resolve, 20));
  
  expect(signal()).toBe(42);
});
```

### Testing External Sources

```typescript
test("external source integration", () => {
  const external = new ReactiveValue(0);
  
  enableExternalSource(/* ... */);
  
  const values: number[] = [];
  createEffect(() => values.push(external.get()));
  
  expect(values).toEqual([0]);
  
  external.set(1);
  expect(values).toEqual([0, 1]);
});
```

---

## Best Practices

### ✅ Always Clean Up

```typescript
// Use createRoot or reactive scopes
createRoot(dispose => {
  const sub = observable(signal).subscribe(handler);
  // Auto-cleanup when dispose() is called
});
```

### ✅ Use Type Safety

```typescript
interface Message {
  type: string;
  data: any;
}

const ws: Accessor<Message | null> = createWebSocket("ws://...");
```

### ✅ Handle Errors

```typescript
const safe = from({
  subscribe: (next) => {
    try {
      // risky operation
      const id = setInterval(() => {
        try {
          next(riskyFunction());
        } catch (e) {
          console.error("Update error:", e);
        }
      }, 1000);
      return () => clearInterval(id);
    } catch (e) {
      console.error("Setup error:", e);
      return () => {};
    }
  }
}, null);
```

### ✅ Document Observable Contracts

```typescript
/**
 * Creates a WebSocket signal
 * @param url - WebSocket server URL
 * @returns Signal that emits parsed JSON messages
 * @throws Never throws - logs errors to console
 * @cleanup Automatically closes WebSocket on scope disposal
 */
function createWebSocket(url: string): Accessor<any> {
  // ...
}
```

---

## Summary Cheatsheet

| Task | Function | Example |
|------|----------|---------|
| Signal → Observable | `observable()` | `from(observable(signal))` |
| Observable → Signal | `from()` | `from(producer, initialValue)` |
| DOM Event → Signal | `from()` | `from((set) => { addEventListener(...) })` |
| External Library | `enableExternalSource()` | For MobX, Vue integration |
| Throttle | Custom wrapper | `throttledFrom(producer, 100)` |
| Debounce | Custom wrapper | `debouncedFrom(producer, 100)` |

---

## Additional Resources

- [TC39 Observable Proposal](https://github.com/tc39/proposal-observable)
- [RxJS Documentation](https://rxjs.dev/)
- [Solid.js Observable API](https://docs.solidjs.com/reference/reactive-utilities/observable)
- [Symbol.observable](https://github.com/tc39/proposal-observable#symbolobservable)

---

## Next Unit Preview

**Unit 10: Advanced Patterns and Optimization**
- Memory management deep dive
- Performance profiling
- Production patterns
- Testing strategies
