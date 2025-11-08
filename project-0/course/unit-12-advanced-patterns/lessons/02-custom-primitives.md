# Lesson 2: Custom Reactive Primitives

## Introduction

While Solid.js provides powerful built-in primitives (`createSignal`, `createMemo`, `createEffect`, etc.), there are scenarios where custom primitives better express domain logic or provide specialized behavior. This lesson teaches you how to build your own reactive primitives that integrate seamlessly with Solid's reactivity system.

## Understanding the Foundation

### Core Requirements for Custom Primitives

Any custom primitive must:
1. **Participate in dependency tracking** - React to changes in dependencies
2. **Notify dependents** - Trigger updates when internal state changes
3. **Manage lifecycle** - Clean up resources properly
4. **Maintain consistency** - Prevent glitches and inconsistencies

### Building on Existing Primitives

The safest way to create custom primitives is to compose existing ones:

```typescript
function createCustomPrimitive<T>(/* params */) {
  // Use createSignal, createMemo, createEffect internally
  // Add custom logic and expose clean API
  return /* custom API */;
}
```

## Pattern 1: createToggle

A simple but useful boolean toggle primitive:

```typescript
interface ToggleAPI {
  (): boolean;
  toggle: () => void;
  setTrue: () => void;
  setFalse: () => void;
  set: Setter<boolean>;
}

function createToggle(initial: boolean = false): ToggleAPI {
  const [value, setValue] = createSignal(initial);
  
  const api: any = value;
  api.toggle = () => setValue(v => !v);
  api.setTrue = () => setValue(true);
  api.setFalse = () => setValue(false);
  api.set = setValue;
  
  return api as ToggleAPI;
}

// Usage
const isOpen = createToggle(false);

console.log(isOpen()); // false
isOpen.toggle(); // true
isOpen.setFalse(); // false
isOpen.set(true); // true

// Reactive
createEffect(() => {
  console.log("Open state:", isOpen());
});
```

## Pattern 2: createAsyncState

Managing async operations with proper state tracking:

```typescript
interface AsyncState<T, E = Error> {
  data: Accessor<T | undefined>;
  error: Accessor<E | undefined>;
  loading: Accessor<boolean>;
  execute: (...args: any[]) => Promise<T>;
  reset: () => void;
}

function createAsyncState<T, Args extends any[] = any[], E = Error>(
  asyncFn: (...args: Args) => Promise<T>,
  options: {
    initialData?: T;
    onSuccess?: (data: T) => void;
    onError?: (error: E) => void;
  } = {}
): AsyncState<T, E> {
  const [data, setData] = createSignal<T | undefined>(options.initialData);
  const [error, setError] = createSignal<E | undefined>();
  const [loading, setLoading] = createSignal(false);
  
  const execute = async (...args: Args): Promise<T> => {
    setLoading(true);
    setError(undefined);
    
    try {
      const result = await asyncFn(...args);
      setData(() => result);
      options.onSuccess?.(result);
      return result;
    } catch (err) {
      const error = err as E;
      setError(() => error);
      options.onError?.(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };
  
  const reset = () => {
    setData(() => options.initialData);
    setError(undefined);
    setLoading(false);
  };
  
  return {
    data,
    error,
    loading,
    execute,
    reset
  };
}

// Usage
const userFetch = createAsyncState(
  async (userId: number) => {
    const response = await fetch(`/api/users/${userId}`);
    return response.json();
  },
  {
    onSuccess: (user) => console.log("Loaded:", user),
    onError: (err) => console.error("Failed:", err)
  }
);

// Reactive UI
createEffect(() => {
  if (userFetch.loading()) {
    console.log("Loading...");
  } else if (userFetch.error()) {
    console.log("Error:", userFetch.error());
  } else if (userFetch.data()) {
    console.log("Data:", userFetch.data());
  }
});

// Trigger fetch
userFetch.execute(123);
```

## Pattern 3: createLocalStorage

Reactive localStorage with type safety:

```typescript
function createLocalStorage<T>(
  key: string,
  initialValue: T,
  options: {
    serializer?: (value: T) => string;
    deserializer?: (value: string) => T;
  } = {}
): Signal<T> {
  const serializer = options.serializer || JSON.stringify;
  const deserializer = options.deserializer || JSON.parse;
  
  // Read initial value from localStorage
  const stored = localStorage.getItem(key);
  const initial = stored !== null 
    ? deserializer(stored) 
    : initialValue;
  
  const [value, setValueInternal] = createSignal<T>(initial);
  
  // Sync with localStorage
  const setValue: Setter<T> = (next) => {
    const newValue = typeof next === 'function'
      ? (next as (prev: T) => T)(value())
      : next;
    
    setValueInternal(() => newValue);
    
    try {
      localStorage.setItem(key, serializer(newValue));
    } catch (err) {
      console.error("Failed to save to localStorage:", err);
    }
    
    return newValue;
  };
  
  // Listen for changes in other tabs
  const handleStorage = (e: StorageEvent) => {
    if (e.key === key && e.newValue !== null) {
      try {
        setValueInternal(() => deserializer(e.newValue!));
      } catch (err) {
        console.error("Failed to parse localStorage value:", err);
      }
    }
  };
  
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorage);
    onCleanup(() => {
      window.removeEventListener('storage', handleStorage);
    });
  }
  
  return [value, setValue];
}

// Usage
const [theme, setTheme] = createLocalStorage('app-theme', 'light');

createEffect(() => {
  document.body.className = theme();
});

setTheme('dark'); // Persists to localStorage
```

## Pattern 4: createMediaQuery

Reactive media query matching:

```typescript
function createMediaQuery(query: string): Accessor<boolean> {
  const [matches, setMatches] = createSignal(
    typeof window !== 'undefined'
      ? window.matchMedia(query).matches
      : false
  );
  
  if (typeof window !== 'undefined') {
    const mediaQuery = window.matchMedia(query);
    
    const handleChange = (e: MediaQueryListEvent) => {
      setMatches(e.matches);
    };
    
    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      onCleanup(() => {
        mediaQuery.removeEventListener('change', handleChange);
      });
    } else {
      // Legacy browsers
      mediaQuery.addListener(handleChange);
      onCleanup(() => {
        mediaQuery.removeListener(handleChange);
      });
    }
  }
  
  return matches;
}

// Usage
const isMobile = createMediaQuery('(max-width: 768px)');
const isDark = createMediaQuery('(prefers-color-scheme: dark)');
const isPortrait = createMediaQuery('(orientation: portrait)');

createEffect(() => {
  console.log("Mobile:", isMobile());
  console.log("Dark mode:", isDark());
  console.log("Portrait:", isPortrait());
});
```

## Pattern 5: createDebounced

Debounced signal that only updates after a delay:

```typescript
function createDebounced<T>(
  source: Accessor<T>,
  delay: number
): Accessor<T> {
  const [debounced, setDebounced] = createSignal<T>(source());
  let timeoutId: number | undefined;
  
  createEffect(() => {
    const value = source();
    
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      setDebounced(() => value);
    }, delay) as unknown as number;
  });
  
  onCleanup(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  });
  
  return debounced;
}

// Usage
const [search, setSearch] = createSignal("");
const debouncedSearch = createDebounced(search, 300);

createEffect(() => {
  // Only fires 300ms after last change
  console.log("Search API call:", debouncedSearch());
});

setSearch("h");
setSearch("he");
setSearch("hel");
setSearch("hell");
setSearch("hello"); // Only this triggers effect after 300ms
```

## Pattern 6: createThrottled

Throttled signal that limits update frequency:

```typescript
function createThrottled<T>(
  source: Accessor<T>,
  interval: number,
  options: { leading?: boolean; trailing?: boolean } = {}
): Accessor<T> {
  const { leading = true, trailing = true } = options;
  
  const [throttled, setThrottled] = createSignal<T>(source());
  let lastRun = 0;
  let timeoutId: number | undefined;
  
  createEffect(() => {
    const value = source();
    const now = Date.now();
    
    const runNow = leading && (now - lastRun) >= interval;
    
    if (runNow) {
      setThrottled(() => value);
      lastRun = now;
      
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    } else if (trailing) {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      
      timeoutId = setTimeout(() => {
        setThrottled(() => value);
        lastRun = Date.now();
        timeoutId = undefined;
      }, interval - (now - lastRun)) as unknown as number;
    }
  });
  
  onCleanup(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  });
  
  return throttled;
}

// Usage
const [scrollY, setScrollY] = createSignal(0);
const throttledScroll = createThrottled(scrollY, 100);

if (typeof window !== 'undefined') {
  window.addEventListener('scroll', () => {
    setScrollY(window.scrollY);
  });
}

createEffect(() => {
  // Max 10 calls per second
  console.log("Scroll position:", throttledScroll());
});
```

## Pattern 7: createPrevious

Track previous value of a signal:

```typescript
function createPrevious<T>(
  source: Accessor<T>,
  initialValue?: T
): Accessor<T | undefined> {
  const [previous, setPrevious] = createSignal<T | undefined>(initialValue);
  
  createEffect((prev: T | undefined) => {
    const current = source();
    setPrevious(() => prev);
    return current;
  }, source());
  
  return previous;
}

// Usage
const [count, setCount] = createSignal(0);
const previousCount = createPrevious(count);

createEffect(() => {
  console.log(`Count changed from ${previousCount()} to ${count()}`);
});

setCount(1); // "Count changed from 0 to 1"
setCount(5); // "Count changed from 1 to 5"
```

## Pattern 8: createCounter

Full-featured counter with bounds and step:

```typescript
interface CounterOptions {
  min?: number;
  max?: number;
  step?: number;
}

interface CounterAPI {
  count: Accessor<number>;
  increment: () => void;
  decrement: () => void;
  reset: () => void;
  set: (value: number) => void;
}

function createCounter(
  initialValue: number = 0,
  options: CounterOptions = {}
): CounterAPI {
  const { min = -Infinity, max = Infinity, step = 1 } = options;
  
  const clamp = (value: number) => Math.max(min, Math.min(max, value));
  
  const [count, setCount] = createSignal(clamp(initialValue));
  
  return {
    count,
    increment: () => setCount(v => clamp(v + step)),
    decrement: () => setCount(v => clamp(v - step)),
    reset: () => setCount(clamp(initialValue)),
    set: (value: number) => setCount(clamp(value))
  };
}

// Usage
const counter = createCounter(0, { min: 0, max: 10, step: 2 });

console.log(counter.count()); // 0
counter.increment(); // 2
counter.increment(); // 4
counter.increment(); // 6
counter.set(15); // Clamped to 10
console.log(counter.count()); // 10
```

## Pattern 9: createInterval

Reactive interval timer:

```typescript
function createInterval(
  callback: () => void,
  delay: Accessor<number> | number
): {
  isRunning: Accessor<boolean>;
  start: () => void;
  stop: () => void;
  toggle: () => void;
} {
  const [isRunning, setIsRunning] = createSignal(false);
  let intervalId: number | undefined;
  
  const stop = () => {
    if (intervalId !== undefined) {
      clearInterval(intervalId);
      intervalId = undefined;
    }
    setIsRunning(false);
  };
  
  const start = () => {
    stop(); // Clear any existing interval
    
    const ms = typeof delay === 'function' ? delay() : delay;
    intervalId = setInterval(callback, ms) as unknown as number;
    setIsRunning(true);
  };
  
  const toggle = () => {
    if (isRunning()) {
      stop();
    } else {
      start();
    }
  };
  
  // React to delay changes
  if (typeof delay === 'function') {
    createEffect(() => {
      const ms = delay();
      if (isRunning()) {
        start(); // Restart with new delay
      }
    });
  }
  
  onCleanup(stop);
  
  return {
    isRunning,
    start,
    stop,
    toggle
  };
}

// Usage
const [count, setCount] = createSignal(0);
const [speed, setSpeed] = createSignal(1000);

const timer = createInterval(
  () => setCount(c => c + 1),
  speed
);

timer.start();

// Change speed dynamically
setSpeed(500); // Interval automatically restarts with new delay

// Stop when count reaches 10
createEffect(() => {
  if (count() >= 10) {
    timer.stop();
  }
});
```

## Pattern 10: createComputedAsync

Async memo with loading/error states:

```typescript
interface AsyncMemoState<T> {
  data: Accessor<T | undefined>;
  loading: Accessor<boolean>;
  error: Accessor<Error | undefined>;
}

function createComputedAsync<T>(
  fn: () => Promise<T>,
  initialValue?: T
): AsyncMemoState<T> {
  const [data, setData] = createSignal<T | undefined>(initialValue);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<Error | undefined>();
  
  createEffect(() => {
    setLoading(true);
    setError(undefined);
    
    fn()
      .then(result => {
        setData(() => result);
        setError(undefined);
      })
      .catch(err => {
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        setLoading(false);
      });
  });
  
  return { data, loading, error };
}

// Usage
const [userId, setUserId] = createSignal(1);

const user = createComputedAsync(async () => {
  const response = await fetch(`/api/users/${userId()}`);
  return response.json();
});

createEffect(() => {
  if (user.loading()) {
    console.log("Loading user...");
  } else if (user.error()) {
    console.log("Error:", user.error());
  } else {
    console.log("User:", user.data());
  }
});

setUserId(2); // Automatically refetches
```

## Advanced: Direct Integration with Reactivity Core

For primitives that need direct integration with the reactivity system:

```typescript
import { 
  Owner, 
  Listener,
  createComputation,
  readSignal,
  writeSignal,
  SignalState
} from 'solid-js/dist/signal';

// This is advanced and requires deep understanding
// Usually not needed - composition is preferred
```

## Best Practices

### 1. Compose, Don't Reinvent

```typescript
// ✅ Good: Build on existing primitives
function createGood() {
  const [value, setValue] = createSignal(0);
  // Add custom logic
  return [value, setValue];
}

// ❌ Bad: Reimplementing signal from scratch
function createBad() {
  // Don't do this unless you really know what you're doing
}
```

### 2. Clean Up Resources

```typescript
function createResource() {
  const resource = acquireResource();
  
  onCleanup(() => {
    resource.dispose(); // Always cleanup!
  });
  
  return resource;
}
```

### 3. Type Safety

```typescript
// ✅ Good: Strong types
function createTyped<T>(initial: T): Signal<T> {
  return createSignal(initial);
}

// ❌ Bad: Weak types
function createUntyped(initial: any): any {
  return createSignal(initial);
}
```

### 4. Document Behavior

```typescript
/**
 * Creates a debounced accessor that only updates after a delay
 * @param source - The source accessor to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced accessor
 */
function createDebounced<T>(
  source: Accessor<T>,
  delay: number
): Accessor<T> {
  // Implementation
}
```

## Testing Custom Primitives

```typescript
import { createRoot } from 'solid-js';

describe('createToggle', () => {
  test('initial value', () => {
    createRoot(dispose => {
      const toggle = createToggle(false);
      expect(toggle()).toBe(false);
      dispose();
    });
  });
  
  test('toggle', () => {
    createRoot(dispose => {
      const toggle = createToggle(false);
      toggle.toggle();
      expect(toggle()).toBe(true);
      toggle.toggle();
      expect(toggle()).toBe(false);
      dispose();
    });
  });
});
```

## Exercises

1. **createHistory**: Implement undo/redo for a signal
2. **createValidated**: Signal with runtime validation
3. **createPersisted**: Auto-save to IndexedDB
4. **createBroadcast**: Sync signal across browser tabs using BroadcastChannel

## Summary

Custom primitives let you:
- Encapsulate complex reactive logic
- Create domain-specific APIs
- Improve code reusability
- Maintain type safety
- Integrate external systems

Build custom primitives by composing existing ones, always clean up resources, and maintain strong typing.

## Next Steps

Next lesson: **Bidirectional Reactivity** - Managing two-way data flow and circular dependencies.
