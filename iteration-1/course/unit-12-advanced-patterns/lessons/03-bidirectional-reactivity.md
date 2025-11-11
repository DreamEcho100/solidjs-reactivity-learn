# Lesson 3: Bidirectional Reactivity

## Introduction

Bidirectional reactivity occurs when two or more reactive values need to stay synchronized, or when changes flow in both directions. This pattern is common in form bindings, collaborative editing, and state synchronization scenarios.

## The Challenge

### Circular Dependencies

The main challenge with bidirectional reactivity is avoiding infinite loops:

```typescript
// ❌ This creates an infinite loop!
const [a, setA] = createSignal(0);
const [b, setB] = createSignal(0);

createEffect(() => {
  setB(a()); // Update b when a changes
});

createEffect(() => {
  setA(b()); // Update a when b changes
});
// Result: Stack overflow!
```

## Pattern 1: Guarded Updates

Use flags to prevent circular updates:

```typescript
function createBidirectional<T>(
  initialValue: T
): [
  a: Signal<T>,
  b: Signal<T>
] {
  const [a, setA] = createSignal(initialValue);
  const [b, setB] = createSignal(initialValue);
  
  let updating = false;
  
  createEffect(() => {
    if (updating) return;
    updating = true;
    setB(() => a());
    updating = false;
  });
  
  createEffect(() => {
    if (updating) return;
    updating = true;
    setA(() => b());
    updating = false;
  });
  
  return [[a, setA], [b, setB]];
}

// Usage
const [[celsius, setCelsius], [fahrenheit, setFahrenheit]] = 
  createBidirectional(0);

// Convert between scales
createEffect(() => {
  if (updating) return;
  updating = true;
  setFahrenheit(() => celsius() * 9/5 + 32);
  updating = false;
});

createEffect(() => {
  if (updating) return;
  updating = true;
  setCelsius(() => (fahrenheit() - 32) * 5/9);
  updating = false;
});
```

## Pattern 2: Version-Based Synchronization

Track versions to prevent circular updates:

```typescript
interface VersionedValue<T> {
  value: T;
  version: number;
}

function createSyncedSignals<T>(
  initialValue: T,
  transform?: {
    aToB?: (a: T) => T;
    bToA?: (b: T) => T;
  }
): [Signal<T>, Signal<T>] {
  const aToB = transform?.aToB || ((x: T) => x);
  const bToA = transform?.bToA || ((x: T) => x);
  
  const [aState, setAState] = createSignal<VersionedValue<T>>({
    value: initialValue,
    version: 0
  });
  
  const [bState, setBState] = createSignal<VersionedValue<T>>({
    value: initialValue,
    version: 0
  });
  
  // Sync A -> B
  createEffect(() => {
    const a = aState();
    setBState(b => {
      if (b.version >= a.version) return b;
      return {
        value: aToB(a.value),
        version: a.version
      };
    });
  });
  
  // Sync B -> A
  createEffect(() => {
    const b = bState();
    setAState(a => {
      if (a.version >= b.version) return a;
      return {
        value: bToA(b.value),
        version: b.version
      };
    });
  });
  
  const getA = () => aState().value;
  const setA = (value: T | ((prev: T) => T)) => {
    setAState(prev => ({
      value: typeof value === 'function' 
        ? (value as (prev: T) => T)(prev.value)
        : value,
      version: prev.version + 1
    }));
  };
  
  const getB = () => bState().value;
  const setB = (value: T | ((prev: T) => T)) => {
    setBState(prev => ({
      value: typeof value === 'function'
        ? (value as (prev: T) => T)(prev.value)
        : value,
      version: prev.version + 1
    }));
  };
  
  return [[getA, setA], [getB, setB]];
}

// Usage: Temperature converter
const [[celsius, setCelsius], [fahrenheit, setFahrenheit]] = 
  createSyncedSignals(0, {
    aToB: c => c * 9/5 + 32,
    bToA: f => (f - 32) * 5/9
  });

setCelsius(100); // Sets both celsius and fahrenheit
console.log(fahrenheit()); // 212

setFahrenheit(32); // Sets both
console.log(celsius()); // 0
```

## Pattern 3: Controlled vs Uncontrolled

React-style controlled/uncontrolled pattern:

```typescript
function createControlledSignal<T>(
  value?: Accessor<T>,
  onChange?: (value: T) => void,
  defaultValue?: T
): Signal<T> {
  const isControlled = value !== undefined;
  
  const [internalValue, setInternalValue] = createSignal<T>(
    defaultValue as T
  );
  
  const getValue = isControlled ? value : internalValue;
  
  const setValue: Setter<T> = (next) => {
    const newValue = typeof next === 'function'
      ? (next as (prev: T) => T)(getValue())
      : next;
    
    if (isControlled) {
      onChange?.(newValue);
    } else {
      setInternalValue(() => newValue);
      onChange?.(newValue);
    }
    
    return newValue;
  };
  
  return [getValue, setValue];
}

// Usage
function Input(props: {
  value?: Accessor<string>;
  onChange?: (value: string) => void;
  defaultValue?: string;
}) {
  const [value, setValue] = createControlledSignal(
    props.value,
    props.onChange,
    props.defaultValue
  );
  
  return (
    <input
      value={value()}
      onInput={(e) => setValue(e.currentTarget.value)}
    />
  );
}

// Controlled
const [text, setText] = createSignal("controlled");
<Input value={text} onChange={setText} />

// Uncontrolled
<Input defaultValue="uncontrolled" onChange={(v) => console.log(v)} />
```

## Pattern 4: Master-Slave Synchronization

One signal is the master, others are derived:

```typescript
function createDerivedSync<T, U>(
  master: Signal<T>,
  derive: (value: T) => U,
  reverseDerive: (value: U) => T
): Signal<U> {
  const [masterValue, setMasterValue] = master;
  
  const derived = createMemo(() => derive(masterValue()));
  
  const setDerived: Setter<U> = (next) => {
    const newValue = typeof next === 'function'
      ? (next as (prev: U) => U)(derived())
      : next;
    
    setMasterValue(() => reverseDerive(newValue));
    return newValue;
  };
  
  return [derived, setDerived];
}

// Usage: Manage price in dollars, display in cents
const [dollars, setDollars] = createSignal(10);

const [cents, setCents] = createDerivedSync(
  [dollars, setDollars],
  d => d * 100,
  c => c / 100
);

console.log(dollars()); // 10
console.log(cents()); // 1000

setCents(500);
console.log(dollars()); // 5
console.log(cents()); // 500
```

## Pattern 5: Form Field Binding

Bidirectional binding for form fields:

```typescript
interface FieldBinding<T> {
  value: Accessor<T>;
  setValue: Setter<T>;
  bind: {
    value: Accessor<T>;
    onInput: (e: InputEvent) => void;
  };
}

function createField<T>(
  initialValue: T,
  parse: (raw: string) => T = (x) => x as unknown as T,
  format: (value: T) => string = String
): FieldBinding<T> {
  const [value, setValue] = createSignal(initialValue);
  
  return {
    value,
    setValue,
    bind: {
      value: createMemo(() => format(value())),
      onInput: (e: InputEvent) => {
        const raw = (e.currentTarget as HTMLInputElement).value;
        setValue(() => parse(raw));
      }
    }
  };
}

// Usage
const name = createField("John");
const age = createField(25, parseInt, String);

<div>
  <input type="text" {...name.bind} />
  <input type="number" {...age.bind} />
</div>

createEffect(() => {
  console.log("Name:", name.value());
  console.log("Age:", age.value());
});
```

## Pattern 6: Two-Way Computed

A memo that can also be set:

```typescript
function createTwoWayComputed<T, U>(
  source: Signal<T>,
  derive: (value: T) => U,
  reverseDerive: (value: U, prev: T) => T
): Signal<U> {
  const [sourceValue, setSourceValue] = source;
  
  const computed = createMemo(() => derive(sourceValue()));
  
  const setComputed: Setter<U> = (next) => {
    const currentComputed = computed();
    const newComputed = typeof next === 'function'
      ? (next as (prev: U) => U)(currentComputed)
      : next;
    
    const currentSource = sourceValue();
    const newSource = reverseDerive(newComputed, currentSource);
    
    setSourceValue(() => newSource);
    return newComputed;
  };
  
  return [computed, setComputed];
}

// Usage: Manage state in one format, work with another
interface UserState {
  firstName: string;
  lastName: string;
}

const [user, setUser] = createSignal<UserState>({
  firstName: "John",
  lastName: "Doe"
});

const [fullName, setFullName] = createTwoWayComputed(
  [user, setUser],
  u => `${u.firstName} ${u.lastName}`,
  (name, prev) => {
    const [firstName = "", lastName = ""] = name.split(" ");
    return { firstName, lastName };
  }
);

console.log(fullName()); // "John Doe"
setFullName("Jane Smith");
console.log(user()); // { firstName: "Jane", lastName: "Smith" }
```

## Pattern 7: Multi-Source Synchronization

Sync multiple sources with conflict resolution:

```typescript
interface SyncStrategy<T> {
  resolve: (values: T[]) => T;
}

function createMultiSync<T>(
  sources: Signal<T>[],
  strategy: SyncStrategy<T>
): Accessor<T> {
  const [synced, setSynced] = createSignal<T>(
    strategy.resolve(sources.map(([get]) => get()))
  );
  
  sources.forEach(([get, set]) => {
    createEffect(() => {
      const value = get();
      const allValues = sources.map(([g]) => g());
      const resolved = strategy.resolve(allValues);
      
      if (resolved !== value) {
        set(() => resolved);
      }
      setSynced(() => resolved);
    });
  });
  
  return synced;
}

// Strategy: Use latest changed value
const latestWins = <T>(): SyncStrategy<T> => ({
  resolve: (values) => values[values.length - 1]
});

// Strategy: Use maximum value
const maxWins: SyncStrategy<number> = {
  resolve: (values) => Math.max(...values)
};

// Usage
const [a, setA] = createSignal(5);
const [b, setB] = createSignal(10);
const [c, setC] = createSignal(3);

const max = createMultiSync([[a, setA], [b, setB], [c, setC]], maxWins);

console.log(max()); // 10
setA(20);
console.log(max()); // 20
console.log(b()); // 20 (synced to max)
```

## Pattern 8: Reactive Proxy with Bidirectional Sync

Deep object synchronization:

```typescript
function createSyncedProxy<T extends object>(
  source: Signal<T>
): T {
  const [get, set] = source;
  
  return new Proxy({} as T, {
    get(_, prop) {
      return get()[prop as keyof T];
    },
    
    set(_, prop, value) {
      set(prev => ({
        ...prev,
        [prop]: value
      }));
      return true;
    },
    
    has(_, prop) {
      return prop in get();
    },
    
    ownKeys(_) {
      return Reflect.ownKeys(get());
    },
    
    getOwnPropertyDescriptor(_, prop) {
      return {
        enumerable: true,
        configurable: true,
        value: get()[prop as keyof T]
      };
    }
  });
}

// Usage
const [state, setState] = createSignal({
  name: "John",
  age: 30
});

const proxy = createSyncedProxy([state, setState]);

createEffect(() => {
  console.log("State:", state());
});

proxy.name = "Jane"; // Triggers effect
proxy.age = 25; // Triggers effect
```

## Common Pitfalls

### 1. Infinite Loops

```typescript
// ❌ Creates infinite loop
createEffect(() => setA(b()));
createEffect(() => setB(a()));

// ✅ Use guards or version tracking
```

### 2. Timing Issues

```typescript
// ❌ May have timing issues
const [a, setA] = createSignal(0);
setA(a() + 1); // Reading and writing in same tick

// ✅ Use function form
setA(prev => prev + 1);
```

### 3. Lost Updates

```typescript
// ❌ Updates may be lost
batch(() => {
  setA(1);
  setB(2);
  // Only one sync may occur
});

// ✅ Handle batched updates properly
```

## Best Practices

1. **Always use guards** to prevent infinite loops
2. **Version tracking** for complex sync scenarios
3. **Batch updates** when changing multiple related values
4. **Document behavior** clearly for maintainability
5. **Test edge cases** thoroughly

## Exercises

1. **Currency Converter**: Build bidirectional currency converter with multiple currencies
2. **Unit Converter**: Temperature, length, weight with bidirectional sync
3. **Form Builder**: Create form with computed validation that can modify source
4. **Collaborative State**: Sync state between multiple "users" with conflict resolution

## Summary

Bidirectional reactivity requires careful handling to avoid infinite loops and ensure consistency. Use version tracking, guards, or controlled/uncontrolled patterns to manage two-way data flow safely.

## Next Steps

Next lesson: **Reactive State Machines** - Managing complex state transitions with reactivity.
