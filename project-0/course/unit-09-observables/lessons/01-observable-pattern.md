# Lesson 1: The Observable Pattern

## Overview

In this lesson, we explore how Solid.js implements the **Observable pattern** to integrate with external reactive systems like RxJS, allowing bidirectional communication between Solid's signal-based reactivity and other observable-based libraries.

## What is the Observable Pattern?

The **Observable pattern** (also called Observable/Observer) is a design pattern where:

1. **Observable** - An object that produces values over time
2. **Observer** - An object that consumes those values

This is similar to signals, but follows a standardized interface defined by the [TC39 Observable proposal](https://github.com/tc39/proposal-observable).

## Why Observables in Solid.js?

Solid.js uses signals as its core reactive primitive, but many libraries (RxJS, Most.js, etc.) use Observables. The `observable()` function bridges these two worlds:

```typescript
import { from } from "rxjs";
import { observable } from "solid-js";

const [count, setCount] = createSignal(0);
const count$ = from(observable(count));

count$.subscribe(value => {
  console.log("RxJS received:", value);
});
```

## The Symbol.observable Standard

The Observable standard uses `Symbol.observable` (or `@@observable` as fallback) as a unique identifier:

```typescript
declare global {
  interface SymbolConstructor {
    readonly observable: symbol;
  }
}
```

This symbol ensures that different observable implementations can interoperate.

## Observable Interface

An Observable in Solid.js follows this interface:

```typescript
interface Observable<T> {
  subscribe(observer: ObservableObserver<T>): {
    unsubscribe(): void;
  };
  [Symbol.observable](): Observable<T>;
}
```

### Observer Types

An observer can be either a function or an object with callbacks:

```typescript
export type ObservableObserver<T> =
  | ((v: T) => void)  // Simple function
  | {                 // Object with methods
      next?: (v: T) => void;
      error?: (v: any) => void;
      complete?: (v: boolean) => void;
    };
```

## How observable() Works

Let's break down the `observable()` implementation from Solid.js:

```typescript
export function observable<T>(input: Accessor<T>): Observable<T> {
  return {
    subscribe(observer: ObservableObserver<T>) {
      // 1. Validate observer
      if (!(observer instanceof Object) || observer == null) {
        throw new TypeError("Expected the observer to be an object.");
      }

      // 2. Extract handler function
      const handler =
        typeof observer === "function" 
          ? observer 
          : observer.next && observer.next.bind(observer);

      // 3. Early return if no handler
      if (!handler) {
        return { unsubscribe() {} };
      }

      // 4. Create reactive subscription
      const dispose = createRoot(disposer => {
        createEffect(() => {
          const v = input();
          untrack(() => handler(v));
        });

        return disposer;
      });

      // 5. Auto-cleanup if inside reactive scope
      if (getOwner()) onCleanup(dispose);

      // 6. Return subscription object
      return {
        unsubscribe() {
          dispose();
        }
      };
    },
    
    // 7. Symbol.observable method
    [Symbol.observable || "@@observable"]() {
      return this;
    }
  };
}
```

## Step-by-Step Breakdown

### Step 1: Validate Observer

```typescript
if (!(observer instanceof Object) || observer == null) {
  throw new TypeError("Expected the observer to be an object.");
}
```

Ensures the observer is a valid object (not a primitive).

### Step 2: Extract Handler Function

```typescript
const handler =
  typeof observer === "function" 
    ? observer 
    : observer.next && observer.next.bind(observer);
```

- If observer is a function, use it directly
- If it's an object, extract the `next` method and bind it

### Step 3: Early Return for No Handler

```typescript
if (!handler) {
  return { unsubscribe() {} };
}
```

If there's no handler, return a no-op subscription.

### Step 4: Create Reactive Subscription

```typescript
const dispose = createRoot(disposer => {
  createEffect(() => {
    const v = input();      // Track signal
    untrack(() => handler(v)); // Call handler without tracking
  });

  return disposer;
});
```

**Key points:**
- Creates isolated reactive scope with `createRoot`
- Effect tracks the signal accessor
- Handler called in `untrack()` to prevent it from creating dependencies
- Returns disposer function

### Step 5: Auto-Cleanup

```typescript
if (getOwner()) onCleanup(dispose);
```

If called within a reactive scope, automatically cleanup when scope disposes.

### Step 6: Return Subscription

```typescript
return {
  unsubscribe() {
    dispose();
  }
};
```

Returns object with `unsubscribe` method matching Observable spec.

### Step 7: Symbol.observable Method

```typescript
[Symbol.observable || "@@observable"]() {
  return this;
}
```

Makes the object itself observable, allowing interop with libraries.

## Why createRoot?

The `createRoot` wrapper is crucial:

```typescript
createRoot(disposer => {
  // This creates an isolated reactive scope
  createEffect(() => {
    // Effect runs here
  });
  return disposer;
});
```

**Without createRoot:**
- The effect would belong to the parent reactive scope
- Unsubscribing wouldn't cleanup the effect

**With createRoot:**
- Effect has its own independent scope
- Calling `dispose()` cleans up everything
- No memory leaks

## Why untrack the Handler?

```typescript
createEffect(() => {
  const v = input();           // TRACKED: Creates dependency
  untrack(() => handler(v));   // UNTRACKED: Doesn't create dependencies
});
```

**Reason:**
- We want to track the signal (`input()`)
- We don't want to track anything the handler does
- Handler might read other signals - we don't want those as dependencies

## Example: Converting Signal to RxJS

```typescript
import { createSignal } from "solid-js";
import { observable } from "solid-js";
import { from } from "rxjs";
import { map, filter } from "rxjs/operators";

const [count, setCount] = createSignal(0);

// Convert signal to RxJS observable
const count$ = from(observable(count));

// Use RxJS operators
const evenDoubled$ = count$.pipe(
  filter(n => n % 2 === 0),
  map(n => n * 2)
);

// Subscribe
const subscription = evenDoubled$.subscribe(value => {
  console.log("Even doubled:", value);
});

// Updates work
setCount(1); // No output (filtered)
setCount(2); // Logs: "Even doubled: 4"
setCount(4); // Logs: "Even doubled: 8"

// Cleanup
subscription.unsubscribe();
```

## Example: Multiple Subscribers

```typescript
const [temp, setTemp] = createSignal(20);
const temp$ = from(observable(temp));

// Multiple independent subscriptions
const sub1 = temp$.subscribe(t => console.log("Celsius:", t));
const sub2 = temp$.subscribe(t => console.log("Fahrenheit:", t * 9/5 + 32));

setTemp(25);
// Logs:
// "Celsius: 25"
// "Fahrenheit: 77"

sub1.unsubscribe();
setTemp(30);
// Logs only:
// "Fahrenheit: 86"

sub2.unsubscribe();
```

## Auto-Cleanup Example

```typescript
import { createRoot, createSignal, observable } from "solid-js";
import { from } from "rxjs";

createRoot(dispose => {
  const [count, setCount] = createSignal(0);
  const count$ = from(observable(count));
  
  // Subscription created inside reactive scope
  count$.subscribe(v => console.log(v));
  
  setCount(1); // Logs: 1
  setCount(2); // Logs: 2
  
  // Dispose the root
  dispose();
  
  setCount(3); // No log - subscription was auto-cleaned
});
```

## Common Patterns

### Pattern 1: Signal to Observable

```typescript
const [state, setState] = createSignal(initialValue);
const state$ = from(observable(state));
```

### Pattern 2: Derived Observable

```typescript
const [firstName, setFirstName] = createSignal("John");
const [lastName, setLastName] = createSignal("Doe");

const fullName = createMemo(() => `${firstName()} ${lastName()}`);
const fullName$ = from(observable(fullName));
```

### Pattern 3: Conditional Subscriptions

```typescript
const [enabled, setEnabled] = createSignal(true);
const [data, setData] = createSignal(0);

createEffect(() => {
  if (enabled()) {
    const data$ = from(observable(data));
    const sub = data$.subscribe(v => console.log(v));
    
    onCleanup(() => sub.unsubscribe());
  }
});
```

## Error Handling

The observable implementation doesn't currently use `error` or `complete` callbacks:

```typescript
observable(signal).subscribe({
  next: (v) => console.log(v),
  error: (e) => console.error(e),  // Never called
  complete: () => console.log("done") // Never called
});
```

Signals don't "error" or "complete" - they just update continuously.

## Performance Considerations

### Memory

Each subscription creates:
- One `createRoot` scope
- One `createEffect`
- One disposal function

**Best Practice:** Always unsubscribe when done.

### Execution

- Handler is called immediately on subscription with current value
- Handler is called on every signal update
- `untrack` prevents unnecessary dependency creation

## Comparison: Signal Effects vs Observable Subscriptions

### Signal Effect
```typescript
createEffect(() => {
  console.log(signal());
});
```

### Observable Subscription
```typescript
from(observable(signal)).subscribe(v => {
  console.log(v);
});
```

**Differences:**
1. Observable subscription requires manual cleanup
2. Observable follows standard interface (interoperable)
3. Effect auto-cleans when owner disposes
4. Observable can use RxJS operators

## Testing Observables

```typescript
import { createSignal, observable } from "solid-js";
import { from } from "rxjs";
import { take, toArray } from "rxjs/operators";

test("observable emits signal values", async () => {
  const [count, setCount] = createSignal(0);
  const count$ = from(observable(count));
  
  const promise = count$.pipe(
    take(3),
    toArray()
  ).toPromise();
  
  setCount(1);
  setCount(2);
  
  const values = await promise;
  expect(values).toEqual([0, 1, 2]); // Includes initial value
});
```

## Summary

The `observable()` function:
- Converts Solid signals to standard Observables
- Uses `createRoot` for isolated reactive scopes
- Calls handler in `untrack()` to avoid extra dependencies
- Auto-cleans up when in reactive scope
- Enables interop with RxJS and other libraries

**Key Insights:**
1. Signals can be consumed as Observables
2. Subscriptions are independent reactive scopes
3. Cleanup is crucial to prevent memory leaks
4. The pattern bridges two reactive paradigms

## Next Steps

In the next lesson, we'll explore the **from()** function which does the opposite: converting Observables into Signals.

## Quiz

1. Why does `observable()` wrap the effect in `createRoot`?
2. What would happen if we didn't use `untrack()` around the handler call?
3. When is `onCleanup(dispose)` called automatically?
4. Can a signal observable emit error or complete events?
5. What's the difference between a function observer and an object observer?
