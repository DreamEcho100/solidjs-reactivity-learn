# Exercise 1: Build Core Signals

## Objective

Implement a complete signal system with bidirectional tracking, following Solid.js's architecture.

## Prerequisites

- Understanding of closures and functions
- Basic TypeScript knowledge
- Familiarity with observer pattern

## Exercise Structure

### Part 1: Basic Signal (30 minutes)

Implement a minimal signal that can store and retrieve values.

```typescript
interface SignalState<T> {
  value: T;
}

type Accessor<T> = () => T;
type Setter<T> = (value: T | ((prev: T) => T)) => T;
type Signal<T> = [Accessor<T>, Setter<T>];

function createSignal<T>(initialValue: T): Signal<T> {
  // TODO: Implement
}
```

**Requirements**:
1. Store the value
2. Return getter and setter
3. Handle function updates

**Test**:
```typescript
const [count, setCount] = createSignal(0);
console.log(count()); // 0
setCount(1);
console.log(count()); // 1
setCount(c => c + 1);
console.log(count()); // 2
```

### Part 2: Add Tracking (45 minutes)

Add dependency tracking using a global Listener.

```typescript
interface Computation<T> {
  fn: () => T;
  sources: SignalState<any>[];
}

let Listener: Computation<any> | null = null;

function readSignal<T>(this: SignalState<T>): T {
  // TODO: Track if Listener exists
  return this.value;
}

function writeSignal<T>(signal: SignalState<T>, value: T): T {
  // TODO: Notify tracked computations
  signal.value = value;
  return value;
}
```

**Requirements**:
1. Track signal reads when Listener is set
2. Add signal to Listener.sources
3. Store observers on signal

**Test**:
```typescript
const [count, setCount] = createSignal(0);
const comp: Computation<void> = {
  fn: () => { console.log(count()); },
  sources: []
};

Listener = comp;
comp.fn(); // Should track count
Listener = null;

console.log(comp.sources.length); // 1
console.log(comp.sources[0] === countSignal); // true
```

### Part 3: Bidirectional Tracking (60 minutes)

Implement full bidirectional tracking with slots for O(1) cleanup.

```typescript
interface SignalState<T> {
  value: T;
  observers: Computation<any>[] | null;
  observerSlots: number[] | null;
}

interface Computation<T> {
  fn: () => T;
  sources: SignalState<any>[] | null;
  sourceSlots: number[] | null;
}
```

**Requirements**:
1. Track both directions (observers + observerSlots)
2. Store correct slot indices
3. Implement O(1) cleanup

**Test**:
```typescript
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);

const comp: Computation<number> = {
  fn: () => a() + b(),
  sources: null,
  sourceSlots: null
};

Listener = comp;
comp.fn();
Listener = null;

// Check bidirectional links
console.log(comp.sources?.length); // 2
console.log(a.observers?.length); // 1
console.log(b.observers?.length); // 1
console.log(a.observers?.[0] === comp); // true
```

### Part 4: Equality Checking (30 minutes)

Add custom equality functions to prevent unnecessary updates.

```typescript
interface SignalOptions<T> {
  equals?: false | ((prev: T, next: T) => boolean);
}

function createSignal<T>(
  initialValue: T,
  options?: SignalOptions<T>
): Signal<T> {
  // TODO: Use comparator
}
```

**Requirements**:
1. Default to === comparison
2. Support custom comparators
3. Support equals: false to always update

**Test**:
```typescript
let runs = 0;
const [count, setCount] = createSignal(0, {
  equals: (a, b) => Math.abs(a - b) < 0.01
});

// Create an effect that counts runs
const comp: Computation<void> = {
  fn: () => { count(); runs++; },
  sources: null,
  sourceSlots: null
};

Listener = comp;
comp.fn();
Listener = null;

setCount(0.005); // Should NOT notify
console.log(runs); // 1

setCount(0.02); // Should notify
console.log(runs); // 2
```

### Part 5: Transition Support (60 minutes)

Add support for concurrent rendering with tValue.

```typescript
interface SignalState<T> {
  value: T;
  tValue?: T; // Transition value
  observers: Computation<any>[] | null;
  observerSlots: number[] | null;
  comparator?: (prev: T, next: T) => boolean;
}

interface TransitionState {
  sources: Set<SignalState<any>>;
  running: boolean;
}

let Transition: TransitionState | null = null;
```

**Requirements**:
1. Track transition sources
2. Use tValue during transition
3. Commit to value after transition

**Test**:
```typescript
const [count, setCount] = createSignal(0);

Transition = {
  sources: new Set(),
  running: true
};

setCount(5);
console.log(count.value); // 0 (not committed yet)
console.log(count.tValue); // 5 (transition value)

// In transition, read returns tValue
console.log(count()); // 5

Transition.running = false;
Transition = null;

// Commit transition
count.value = count.tValue;
delete count.tValue;

console.log(count()); // 5
```

## Solutions

### Part 1 Solution

```typescript
interface SignalState<T> {
  value: T;
}

type Accessor<T> = () => T;
type Setter<T> = (value: T | ((prev: T) => T)) => T;
type Signal<T> = [Accessor<T>, Setter<T>];

function createSignal<T>(initialValue: T): Signal<T> {
  const state: SignalState<T> = {
    value: initialValue
  };
  
  const read: Accessor<T> = () => state.value;
  
  const write: Setter<T> = (nextValue) => {
    if (typeof nextValue === 'function') {
      nextValue = (nextValue as Function)(state.value);
    }
    state.value = nextValue;
    return nextValue;
  };
  
  return [read, write];
}
```

### Part 2 Solution

```typescript
interface SignalState<T> {
  value: T;
  observers: Computation<any>[];
}

interface Computation<T> {
  fn: () => T;
  sources: SignalState<any>[];
}

let Listener: Computation<any> | null = null;

function createSignal<T>(initialValue: T): Signal<T> {
  const state: SignalState<T> = {
    value: initialValue,
    observers: []
  };
  
  const read = () => {
    if (Listener && !Listener.sources.includes(state)) {
      Listener.sources.push(state);
      state.observers.push(Listener);
    }
    return state.value;
  };
  
  const write = (nextValue: T | ((prev: T) => T)) => {
    if (typeof nextValue === 'function') {
      nextValue = (nextValue as Function)(state.value);
    }
    state.value = nextValue;
    
    // Notify observers
    for (const observer of state.observers) {
      observer.fn();
    }
    
    return nextValue;
  };
  
  return [read, write];
}
```

### Part 3 Solution

```typescript
interface SignalState<T> {
  value: T;
  observers: Computation<any>[] | null;
  observerSlots: number[] | null;
}

interface Computation<T> {
  fn: () => T;
  sources: SignalState<any>[] | null;
  sourceSlots: number[] | null;
}

let Listener: Computation<any> | null = null;

function readSignal<T>(this: SignalState<T>): T {
  if (Listener) {
    const sSlot = this.observers ? this.observers.length : 0;
    
    if (!Listener.sources) {
      Listener.sources = [this];
      Listener.sourceSlots = [sSlot];
    } else {
      Listener.sources.push(this);
      Listener.sourceSlots.push(sSlot);
    }
    
    if (!this.observers) {
      this.observers = [Listener];
      this.observerSlots = [Listener.sources.length - 1];
    } else {
      this.observers.push(Listener);
      this.observerSlots.push(Listener.sources.length - 1);
    }
  }
  
  return this.value;
}

function writeSignal<T>(signal: SignalState<T>, value: T): T {
  signal.value = value;
  
  if (signal.observers) {
    for (const observer of signal.observers) {
      observer.fn();
    }
  }
  
  return value;
}

function createSignal<T>(initialValue: T): Signal<T> {
  const state: SignalState<T> = {
    value: initialValue,
    observers: null,
    observerSlots: null
  };
  
  return [readSignal.bind(state), (v) => writeSignal(state, 
    typeof v === 'function' ? v(state.value) : v
  )];
}
```

## Bonus Challenges

### Challenge 1: Implement Cleanup

Write a `cleanNode` function that removes a computation from all its sources:

```typescript
function cleanNode(comp: Computation<any>): void {
  // TODO: Remove comp from all source.observers
  // Use swap-and-pop for O(1) removal
}
```

### Challenge 2: Add Debug Names

Add a `name` option for better debugging:

```typescript
interface SignalOptions<T> {
  equals?: false | ((prev: T, next: T) => boolean);
  name?: string;
}

// Usage:
const [count, setCount] = createSignal(0, { name: 'counter' });
```

### Challenge 3: Implement Signal History

Track the last N values:

```typescript
interface SignalState<T> {
  value: T;
  history?: T[];
  observers: Computation<any>[] | null;
  observerSlots: number[] | null;
}

// Usage:
const [count, setCount] = createSignal(0, { history: 3 });
setCount(1);
setCount(2);
setCount(3);
console.log(count.history); // [0, 1, 2]
```

## Verification

Run these tests to verify your implementation:

```typescript
describe('Signal Implementation', () => {
  test('basic read/write', () => {
    const [count, setCount] = createSignal(0);
    expect(count()).toBe(0);
    setCount(5);
    expect(count()).toBe(5);
  });
  
  test('function updates', () => {
    const [count, setCount] = createSignal(0);
    setCount(c => c + 1);
    expect(count()).toBe(1);
  });
  
  test('tracking', () => {
    const [count, setCount] = createSignal(0);
    const comp: Computation<void> = {
      fn: () => count(),
      sources: null,
      sourceSlots: null
    };
    
    Listener = comp;
    comp.fn();
    Listener = null;
    
    expect(comp.sources?.length).toBe(1);
  });
  
  test('custom equality', () => {
    let runs = 0;
    const [count, setCount] = createSignal(0, {
      equals: (a, b) => Math.abs(a - b) < 0.01
    });
    
    const comp: Computation<void> = {
      fn: () => { count(); runs++; },
      sources: null,
      sourceSlots: null
    };
    
    Listener = comp;
    comp.fn();
    Listener = null;
    
    setCount(0.005);
    expect(runs).toBe(1);
    
    setCount(0.02);
    expect(runs).toBe(2);
  });
});
```

## Next Steps

After completing this exercise, move on to:
- Exercise 2: Implementing Effects
- Exercise 3: Building the Scheduler
- Exercise 4: Transition System

---

**Estimated Time**: 3-4 hours  
**Difficulty**: Intermediate  
**Prerequisites**: Unit 1-2 completed
