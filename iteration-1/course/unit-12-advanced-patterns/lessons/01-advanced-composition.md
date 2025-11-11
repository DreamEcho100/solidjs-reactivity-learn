# Lesson 1: Advanced Composition Patterns

## Introduction

Composition is at the heart of reactive programming. While basic composition involves combining signals and effects, advanced composition patterns enable you to build complex, reusable reactive abstractions that solve real-world problems elegantly.

## Higher-Order Reactive Functions

### Concept

Higher-order reactive functions are functions that either:
1. Take reactive primitives as arguments
2. Return reactive primitives
3. Both

These patterns allow you to abstract common reactive behaviors.

### Pattern 1: createDerivedSignal

Creating a signal that's always derived from another source:

```typescript
function createDerivedSignal<T, U>(
  source: Accessor<T>,
  transform: (value: T) => U,
  options?: SignalOptions<U>
): Signal<U> {
  const [get, set] = createSignal<U>(transform(source()), options);
  
  createEffect(() => {
    set(() => transform(source()));
  });
  
  return [get, set];
}

// Usage
const [count, setCount] = createSignal(0);
const [doubled, setDoubled] = createDerivedSignal(
  count,
  n => n * 2
);

console.log(doubled()); // 0
setCount(5);
console.log(doubled()); // 10
setDoubled(100); // Can still manually set
console.log(doubled()); // 100
```

### Pattern 2: createComposedSignal

Compose multiple signals into one:

```typescript
function createComposedSignal<T extends readonly unknown[]>(
  ...sources: AccessorArray<T>
): Accessor<T> {
  return createMemo(() => {
    return sources.map(s => s()) as unknown as T;
  });
}

// Usage
const [first, setFirst] = createSignal("Hello");
const [second, setSecond] = createSignal("World");
const composed = createComposedSignal(first, second);

console.log(composed()); // ["Hello", "World"]
```

### Pattern 3: createLatest

Get the latest value from multiple async sources:

```typescript
function createLatest<T>(
  ...sources: Array<ResourceSource<T>>
): Accessor<T | undefined> {
  const [latest, setLatest] = createSignal<T | undefined>();
  
  sources.forEach(source => {
    createEffect(() => {
      const value = typeof source === 'function' ? source() : source;
      if (value !== null && value !== undefined) {
        setLatest(() => value as T);
      }
    });
  });
  
  return latest;
}
```

## Reactive Pipelines

### Concept

Pipelines allow you to chain transformations in a declarative way, similar to array methods but reactive.

### Implementation

```typescript
class ReactivePipeline<T> {
  constructor(private source: Accessor<T>) {}
  
  map<U>(fn: (value: T) => U): ReactivePipeline<U> {
    const mapped = createMemo(() => fn(this.source()));
    return new ReactivePipeline(mapped);
  }
  
  filter(predicate: (value: T) => boolean): ReactivePipeline<T | undefined> {
    const filtered = createMemo(() => {
      const value = this.source();
      return predicate(value) ? value : undefined;
    });
    return new ReactivePipeline(filtered);
  }
  
  debounce(ms: number): ReactivePipeline<T> {
    const [debounced, setDebounced] = createSignal<T>(this.source());
    let timeoutId: number | undefined;
    
    createEffect(() => {
      const value = this.source();
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setDebounced(() => value), ms) as unknown as number;
    });
    
    onCleanup(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });
    
    return new ReactivePipeline(debounced);
  }
  
  throttle(ms: number): ReactivePipeline<T> {
    const [throttled, setThrottled] = createSignal<T>(this.source());
    let lastRun = 0;
    
    createEffect(() => {
      const value = this.source();
      const now = Date.now();
      
      if (now - lastRun >= ms) {
        setThrottled(() => value);
        lastRun = now;
      }
    });
    
    return new ReactivePipeline(throttled);
  }
  
  distinctUntilChanged(
    equals: (a: T, b: T) => boolean = (a, b) => a === b
  ): ReactivePipeline<T> {
    const distinct = createMemo((prev: T | undefined) => {
      const next = this.source();
      return prev !== undefined && equals(prev, next) ? prev : next;
    });
    return new ReactivePipeline(distinct as Accessor<T>);
  }
  
  combine<U>(
    other: Accessor<U>
  ): ReactivePipeline<[T, U]> {
    const combined = createMemo(() => [this.source(), other()] as [T, U]);
    return new ReactivePipeline(combined);
  }
  
  toAccessor(): Accessor<T> {
    return this.source;
  }
  
  subscribe(fn: (value: T) => void): () => void {
    createEffect(() => fn(this.source()));
    return () => {}; // Cleanup handled by effect disposal
  }
}

// Helper function
function pipe<T>(source: Accessor<T>): ReactivePipeline<T> {
  return new ReactivePipeline(source);
}

// Usage
const [input, setInput] = createSignal("");

const processed = pipe(input)
  .debounce(300)
  .filter(value => value.length > 3)
  .map(value => value.toUpperCase())
  .distinctUntilChanged()
  .toAccessor();

createEffect(() => {
  console.log("Processed:", processed());
});

setInput("hi");     // No output (filtered)
setInput("hello");  // After 300ms: "HELLO"
setInput("hello");  // No output (distinct)
setInput("world");  // After 300ms: "WORLD"
```

## Reactive Lenses

### Concept

Lenses provide a way to focus on a specific part of a complex reactive structure, enabling deep updates while maintaining reactivity.

### Implementation

```typescript
interface Lens<S, A> {
  get: (state: S) => A;
  set: (state: S, value: A) => S;
}

function createLens<S, A>(
  getter: (state: S) => A,
  setter: (state: S, value: A) => S
): Lens<S, A> {
  return { get: getter, set: setter };
}

function focusLens<S>(
  signal: Signal<S>
): <A>(lens: Lens<S, A>) => Signal<A> {
  return <A>(lens: Lens<S, A>): Signal<A> => {
    const [state, setState] = signal;
    
    const get = createMemo(() => lens.get(state()));
    const set = (value: A | ((prev: A) => A)) => {
      setState(prevState => {
        const currentValue = lens.get(prevState);
        const nextValue = typeof value === 'function'
          ? (value as (prev: A) => A)(currentValue)
          : value;
        return lens.set(prevState, nextValue);
      });
    };
    
    return [get, set];
  };
}

// Usage example
interface User {
  name: string;
  email: string;
  address: {
    street: string;
    city: string;
    country: string;
  };
}

const [user, setUser] = createSignal<User>({
  name: "John Doe",
  email: "john@example.com",
  address: {
    street: "123 Main St",
    city: "Springfield",
    country: "USA"
  }
});

// Create lenses
const nameLens = createLens<User, string>(
  user => user.name,
  (user, name) => ({ ...user, name })
);

const cityLens = createLens<User, string>(
  user => user.address.city,
  (user, city) => ({
    ...user,
    address: { ...user.address, city }
  })
);

// Focus on specific fields
const focus = focusLens([user, setUser]);
const [name, setName] = focus(nameLens);
const [city, setCity] = focus(cityLens);

// Now you can work with focused values reactively
createEffect(() => {
  console.log("Name:", name()); // "John Doe"
  console.log("City:", city()); // "Springfield"
});

setName("Jane Doe"); // Updates only the name
setCity("New York"); // Updates only the city
```

## Reactive Validators

### Pattern: Composable Validation

```typescript
type Validator<T> = (value: T) => string | undefined;

function composeValidators<T>(
  ...validators: Validator<T>[]
): Validator<T> {
  return (value: T) => {
    for (const validator of validators) {
      const error = validator(value);
      if (error) return error;
    }
    return undefined;
  };
}

function createValidatedSignal<T>(
  initialValue: T,
  validator: Validator<T>,
  options?: SignalOptions<T>
): [
  getter: Accessor<T>,
  setter: Setter<T>,
  error: Accessor<string | undefined>,
  isValid: Accessor<boolean>
] {
  const [value, setValue] = createSignal(initialValue, options);
  const [error, setError] = createSignal<string | undefined>();
  
  const isValid = createMemo(() => error() === undefined);
  
  const wrappedSetter: Setter<T> = (next) => {
    const newValue = typeof next === 'function'
      ? (next as (prev: T) => T)(value())
      : next;
    
    const validationError = validator(newValue);
    setError(validationError);
    
    if (!validationError) {
      setValue(() => newValue);
    }
    
    return newValue;
  };
  
  return [value, wrappedSetter, error, isValid];
}

// Validators library
const validators = {
  required: <T>(value: T): string | undefined =>
    value ? undefined : "This field is required",
  
  minLength: (min: number) => (value: string): string | undefined =>
    value.length >= min ? undefined : `Minimum length is ${min}`,
  
  maxLength: (max: number) => (value: string): string | undefined =>
    value.length <= max ? undefined : `Maximum length is ${max}`,
  
  email: (value: string): string | undefined =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      ? undefined
      : "Invalid email address",
  
  pattern: (regex: RegExp, message: string) => 
    (value: string): string | undefined =>
      regex.test(value) ? undefined : message,
};

// Usage
const emailValidator = composeValidators(
  validators.required,
  validators.email
);

const [email, setEmail, emailError, isEmailValid] = 
  createValidatedSignal("", emailValidator);

createEffect(() => {
  console.log("Email:", email());
  console.log("Error:", emailError());
  console.log("Valid:", isEmailValid());
});

setEmail("invalid"); // Error: "Invalid email address"
setEmail("test@example.com"); // Valid!
```

## Reactive State Combinators

### Pattern: Combining Multiple Reactive States

```typescript
function createCombinedState<T extends Record<string, any>>(
  states: { [K in keyof T]: Accessor<T[K]> }
): Accessor<T> {
  return createMemo(() => {
    const result = {} as T;
    for (const key in states) {
      result[key] = states[key]();
    }
    return result;
  });
}

// Usage
const [firstName, setFirstName] = createSignal("John");
const [lastName, setLastName] = createSignal("Doe");
const [age, setAge] = createSignal(30);

const person = createCombinedState({
  firstName,
  lastName,
  age
});

createEffect(() => {
  console.log("Person:", person());
  // { firstName: "John", lastName: "Doe", age: 30 }
});
```

## Reactive Selectors with Caching

### Advanced Selector Pattern

```typescript
function createCachedSelector<T, U>(
  source: Accessor<T[]>,
  selector: (item: T) => U,
  keyFn: (item: T) => any = item => item
): Accessor<Map<any, U>> {
  const cache = new Map<any, U>();
  
  return createMemo(() => {
    const items = source();
    const newCache = new Map<any, U>();
    
    items.forEach(item => {
      const key = keyFn(item);
      if (cache.has(key)) {
        newCache.set(key, cache.get(key)!);
      } else {
        newCache.set(key, selector(item));
      }
    });
    
    cache.clear();
    newCache.forEach((value, key) => cache.set(key, value));
    
    return cache;
  });
}

// Usage for expensive computations
const [items, setItems] = createSignal([
  { id: 1, data: "..." },
  { id: 2, data: "..." },
  { id: 3, data: "..." }
]);

const processedItems = createCachedSelector(
  items,
  item => {
    // Expensive computation
    console.log("Processing", item.id);
    return { ...item, processed: true };
  },
  item => item.id
);

createEffect(() => {
  console.log("Processed:", processedItems());
});

// Only processes new or changed items
setItems([
  { id: 1, data: "..." }, // Uses cache
  { id: 2, data: "..." }, // Uses cache
  { id: 4, data: "..." }  // Processes new item
]);
```

## Best Practices

### 1. Keep Composition Pure

```typescript
// ❌ Bad: Side effects in composition
function badCompose<T>(source: Accessor<T>) {
  console.log("Creating composition"); // Side effect!
  return createMemo(() => source());
}

// ✅ Good: Pure composition
function goodCompose<T>(source: Accessor<T>) {
  return createMemo(() => {
    const value = source();
    // All effects inside reactive context
    return value;
  });
}
```

### 2. Memoize Expensive Compositions

```typescript
// ✅ Memoize the composition result
const expensiveComposition = createMemo(() => {
  return pipe(source)
    .map(expensiveTransform)
    .filter(complexPredicate)
    .toAccessor();
});
```

### 3. Cleanup Resources

```typescript
function createResourcefulComposition<T>(source: Accessor<T>) {
  const resource = acquireResource();
  
  onCleanup(() => {
    resource.dispose();
  });
  
  return createMemo(() => {
    return resource.transform(source());
  });
}
```

## Performance Considerations

### Composition Overhead

Each composition level adds overhead. Balance abstraction with performance:

```typescript
// ❌ Too many composition layers
const result = pipe(source)
  .map(x => x)
  .map(x => x)
  .map(x => x)
  .toAccessor();

// ✅ Combine transformations
const result = pipe(source)
  .map(x => {
    // All transformations in one step
    return processValue(x);
  })
  .toAccessor();
```

## Exercises

1. **Implement `createBiDirectional`**: Create a helper that maintains bidirectional sync between two signals
2. **Build Reactive Form**: Use composition to create a complete form validation system
3. **Create Timeline**: Implement a reactive timeline with undo/redo using composition
4. **Build Query Builder**: Create a reactive query builder with fluent API

## Summary

Advanced composition patterns enable:
- Reusable reactive abstractions
- Declarative data transformations
- Type-safe reactive pipelines
- Efficient caching and memoization
- Clean separation of concerns

Master these patterns to build sophisticated reactive systems with elegant, maintainable code.

## Next Steps

In the next lesson, we'll explore **Custom Reactive Primitives** - building your own reactive abstractions from the ground up.
