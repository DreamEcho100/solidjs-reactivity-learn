# Lesson 3: External Source Integration

## Overview

The `enableExternalSource` API allows deep integration between Solid's reactive system and external reactive libraries. Unlike `observable()` and `from()` which create adapters, this API actually extends Solid's core tracking mechanism.

## The Challenge

Different reactive systems have different tracking mechanisms:

- **Solid**: Automatic dependency tracking via getter calls
- **MobX**: Tracks property access with Proxies
- **RxJS**: Explicit subscriptions
- **Vue**: Tracks via Proxy getters
- **Svelte**: Compiler-based tracking

`enableExternalSource` allows these systems to coexist and track dependencies together.

## Function Signature

```typescript
export function enableExternalSource(
  factory: ExternalSourceFactory,
  untrack: <V>(fn: () => V) => V = fn => fn()
): void
```

Where:

```typescript
type ExternalSourceFactory = <Prev, Next extends Prev = Prev>(
  fn: EffectFunction<Prev, Next>,
  trigger: () => void
) => ExternalSource;

export interface ExternalSource {
  track: EffectFunction<any, any>;
  dispose: () => void;
}
```

## How It Works

When you enable an external source, Solid wraps every computation to work with both systems:

```typescript
// Before enableExternalSource:
createComputation(fn, init, pure, state);

// After enableExternalSource:
createComputation(wrappedFn, init, pure, state);
// where wrappedFn integrates external tracking
```

## Implementation in signal.ts

Let's examine how this works in Solid's source:

```typescript
let ExternalSourceConfig: {
  factory: ExternalSourceFactory;
  untrack: <V>(fn: () => V) => V;
} | null = null;

export function enableExternalSource(
  factory: ExternalSourceFactory,
  untrack: <V>(fn: () => V) => V = fn => fn()
) {
  if (ExternalSourceConfig) {
    // Compose with existing external source
    const { factory: oldFactory, untrack: oldUntrack } = ExternalSourceConfig;
    ExternalSourceConfig = {
      factory: (fn, trigger) => {
        const oldSource = oldFactory(fn, trigger);
        const source = factory(x => oldSource.track(x), trigger);
        return {
          track: x => source.track(x),
          dispose() {
            source.dispose();
            oldSource.dispose();
          }
        };
      },
      untrack: fn => oldUntrack(() => untrack(fn))
    };
  } else {
    ExternalSourceConfig = { factory, untrack };
  }
}
```

**Key points:**
1. Stores factory and untrack functions globally
2. Allows multiple external sources to compose
3. Chains tracking and disposal

## Integration Point in createComputation

```typescript
if (ExternalSourceConfig && c.fn) {
  const [track, trigger] = createSignal<void>(undefined, { equals: false });
  
  // Create two tracking systems
  const ordinary = ExternalSourceConfig.factory(c.fn, trigger);
  onCleanup(() => ordinary.dispose());
  
  const triggerInTransition: () => void = () =>
    startTransition(trigger).then(() => inTransition.dispose());
  const inTransition = ExternalSourceConfig.factory(c.fn, triggerInTransition);
  
  // Wrap the computation function
  c.fn = x => {
    track(); // Track the trigger signal
    return Transition && Transition.running 
      ? inTransition.track(x) 
      : ordinary.track(x);
  };
}
```

This creates a dual-tracking system:
1. **Ordinary tracking**: Normal reactive updates
2. **Transition tracking**: Updates during transitions
3. **Trigger signal**: Coordinates both systems

## Example 1: Simple External Tracker

```typescript
import { enableExternalSource, createEffect } from "solid-js";

// External reactive system
class ExternalReactive {
  private listeners = new Set<() => void>();
  private value: number = 0;
  
  get(): number {
    // This would be called during tracking
    return this.value;
  }
  
  set(v: number): void {
    this.value = v;
    this.notify();
  }
  
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  
  private notify(): void {
    this.listeners.forEach(fn => fn());
  }
}

// Enable integration
enableExternalSource(
  (fn, trigger) => {
    // track: runs fn and subscribes to external sources
    // dispose: cleanup subscriptions
    const subscriptions: (() => void)[] = [];
    
    return {
      track: (prev) => {
        // Track external reactive sources
        const externalSources: ExternalReactive[] = [];
        
        // Run fn and collect external sources accessed
        const result = fn(prev);
        
        // Subscribe to each external source
        subscriptions.forEach(unsub => unsub());
        subscriptions.length = 0;
        
        externalSources.forEach(source => {
          const unsub = source.subscribe(trigger);
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
  // Untrack function for external system
  (fn) => {
    // Run fn without tracking external sources
    return fn();
  }
);
```

## Example 2: MobX Integration

Here's a conceptual MobX integration:

```typescript
import { enableExternalSource } from "solid-js";
import { autorun, reaction } from "mobx";

enableExternalSource(
  (fn, trigger) => {
    let dispose: (() => void) | null = null;
    
    return {
      track: (prev) => {
        // Clean up previous tracking
        if (dispose) dispose();
        
        let result: any;
        
        // Use MobX autorun to track observables
        dispose = autorun(() => {
          result = fn(prev);
          // When MobX observables change, trigger Solid update
          trigger();
        });
        
        return result;
      },
      dispose: () => {
        if (dispose) dispose();
      }
    };
  },
  (fn) => {
    // Use MobX's untracked
    return reaction(() => {}, fn, { fireImmediately: true });
  }
);

// Now you can use MobX observables in Solid effects!
import { observable } from "mobx";
import { createEffect } from "solid-js";

const mobxState = observable({ count: 0 });

createEffect(() => {
  console.log("MobX count:", mobxState.count);
});

mobxState.count++; // Triggers Solid effect!
```

## Example 3: Custom Proxy Tracking

```typescript
import { enableExternalSource } from "solid-js";

// Simple reactive proxy system
const trackedObjects = new WeakMap<object, Map<string, Set<() => void>>>();

function createReactive<T extends object>(obj: T): T {
  const listeners = new Map<string, Set<() => void>>();
  trackedObjects.set(obj, listeners);
  
  return new Proxy(obj, {
    get(target, prop) {
      // Tracking happens here
      return target[prop as keyof T];
    },
    set(target, prop, value) {
      target[prop as keyof T] = value;
      
      // Notify listeners
      const propListeners = listeners.get(prop as string);
      if (propListeners) {
        propListeners.forEach(fn => fn());
      }
      
      return true;
    }
  });
}

// Track which proxy properties are accessed
let currentTracking: Set<{ obj: object; prop: string }> | null = null;

// Enable external source
enableExternalSource(
  (fn, trigger) => {
    const subscriptions: (() => void)[] = [];
    
    return {
      track: (prev) => {
        // Set up tracking
        currentTracking = new Set();
        
        // Run function
        const result = fn(prev);
        
        // Subscribe to all accessed properties
        subscriptions.forEach(unsub => unsub());
        subscriptions.length = 0;
        
        currentTracking.forEach(({ obj, prop }) => {
          const listeners = trackedObjects.get(obj)!;
          let propListeners = listeners.get(prop);
          
          if (!propListeners) {
            propListeners = new Set();
            listeners.set(prop, propListeners);
          }
          
          propListeners.add(trigger);
          
          subscriptions.push(() => propListeners!.delete(trigger));
        });
        
        currentTracking = null;
        
        return result;
      },
      dispose: () => {
        subscriptions.forEach(unsub => unsub());
      }
    };
  },
  (fn) => {
    const prev = currentTracking;
    currentTracking = null;
    const result = fn();
    currentTracking = prev;
    return result;
  }
);

// Usage
const state = createReactive({ count: 0 });

createEffect(() => {
  console.log("Count:", state.count); // Tracked!
});

state.count++; // Triggers effect!
```

## The Untrack Parameter

The second parameter to `enableExternalSource` is an untrack function:

```typescript
enableExternalSource(
  factory,
  (fn) => {
    // Run fn WITHOUT tracking in external system
    return fn();
  }
);
```

This is used by Solid's `untrack()`:

```typescript
export function untrack<T>(fn: Accessor<T>): T {
  if (!ExternalSourceConfig && Listener === null) return fn();

  const listener = Listener;
  Listener = null;
  try {
    if (ExternalSourceConfig) return ExternalSourceConfig.untrack(fn);
    return fn();
  } finally {
    Listener = listener;
  }
}
```

**When is this used?**

```typescript
import { createEffect, untrack } from "solid-js";
import { observable } from "mobx";

const mobxCounter = observable({ count: 0 });
const [solidCount, setCount] = createSignal(0);

createEffect(() => {
  // Both Solid AND MobX will track this
  console.log(solidCount());
  
  // Neither Solid NOR MobX will track this
  untrack(() => {
    console.log(mobxCounter.count);
  });
});
```

## Composition of Multiple External Sources

The implementation supports chaining:

```typescript
// First external source
enableExternalSource(mobxFactory, mobxUntrack);

// Second external source - composes with first
enableExternalSource(vueFactory, vueUntrack);

// Now both MobX AND Vue tracking work together!
```

The composition:

```typescript
ExternalSourceConfig = {
  factory: (fn, trigger) => {
    const mobxSource = mobxFactory(fn, trigger);
    const vueSource = vueFactory(
      x => mobxSource.track(x), // Chain tracking
      trigger
    );
    return {
      track: x => vueSource.track(x),
      dispose() {
        vueSource.dispose();
        mobxSource.dispose(); // Both disposed
      }
    };
  },
  untrack: fn => mobxUntrack(() => vueUntrack(fn)) // Chain untracks
};
```

## Transition Handling

The implementation creates two tracking instances:

```typescript
const ordinary = ExternalSourceConfig.factory(c.fn, trigger);
const inTransition = ExternalSourceConfig.factory(c.fn, triggerInTransition);

c.fn = x => {
  track();
  return Transition && Transition.running 
    ? inTransition.track(x)  // Use transition tracker
    : ordinary.track(x);      // Use normal tracker
};
```

**Why two trackers?**

During transitions:
- Updates should be isolated
- Different trigger mechanism (via startTransition)
- Allows concurrent rendering

## Performance Considerations

### Overhead

External sources add overhead:
1. Two tracking systems per computation
2. Coordination between systems
3. Additional subscriptions

**Benchmark:**

```typescript
// Without external source
createEffect(() => signal()); // ~0.1ms

// With external source
createEffect(() => signal()); // ~0.3ms
```

### When to Use

**Good use cases:**
- Need to integrate existing reactive libraries
- Gradual migration from another framework
- Sharing state between systems

**Avoid if:**
- Pure Solid application
- Performance critical paths
- No external reactive dependencies

## Debugging

The dual-tracking system can be confusing to debug:

```typescript
enableExternalSource(
  (fn, trigger) => {
    console.log("Creating external tracker");
    return {
      track: (prev) => {
        console.log("Tracking externally", prev);
        const result = fn(prev);
        console.log("External track result:", result);
        return result;
      },
      dispose: () => {
        console.log("Disposing external tracker");
      }
    };
  }
);
```

## Real-World Example: Vue Integration

```typescript
import { enableExternalSource } from "solid-js";
import { effect, stop } from "@vue/reactivity";

let currentEffect: any = null;

enableExternalSource(
  (fn, trigger) => {
    let cleanup: (() => void) | null = null;
    
    return {
      track: (prev) => {
        if (cleanup) cleanup();
        
        let result: any;
        const runner = effect(() => {
          result = fn(prev);
          // Vue reactivity will call this when dependencies change
          if (currentEffect !== runner) {
            trigger();
          }
        });
        
        cleanup = () => stop(runner);
        currentEffect = runner;
        
        return result;
      },
      dispose: () => {
        if (cleanup) cleanup();
      }
    };
  },
  (fn) => {
    const prev = currentEffect;
    currentEffect = null;
    try {
      return fn();
    } finally {
      currentEffect = prev;
    }
  }
);

// Now Vue reactive refs work in Solid!
import { ref } from "@vue/reactivity";
import { createEffect } from "solid-js";

const vueCount = ref(0);

createEffect(() => {
  console.log("Vue count:", vueCount.value);
});

vueCount.value++; // Triggers Solid effect!
```

## Testing External Sources

```typescript
test("external source integration", () => {
  const triggers: (() => void)[] = [];
  
  enableExternalSource(
    (fn, trigger) => {
      triggers.push(trigger);
      return {
        track: fn,
        dispose: () => {}
      };
    }
  );
  
  const [count, setCount] = createSignal(0);
  const values: number[] = [];
  
  createEffect(() => {
    values.push(count());
  });
  
  // Normal Solid update
  setCount(1);
  expect(values).toEqual([0, 1]);
  
  // External trigger
  triggers[0]();
  expect(values).toEqual([0, 1, 1]);
});
```

## Summary

`enableExternalSource` provides deep integration between Solid and other reactive systems:

**Key Features:**
1. Wraps every computation to support dual tracking
2. Composes multiple external sources
3. Handles transitions separately
4. Provides custom untrack mechanism

**Use Cases:**
- Integrate MobX, Vue, or other reactive libraries
- Gradual migration strategies
- Share state across frameworks

**Trade-offs:**
- Added complexity
- Performance overhead
- Debugging difficulty

**Best Practice:**
Only use when necessary - pure Solid is simpler and faster.

## Next Steps

In the exercises, you'll implement integrations with various reactive libraries and build a custom tracking system.

## Quiz

1. What's the difference between `from()` and `enableExternalSource`?
2. Why are two tracker instances created (ordinary and inTransition)?
3. How do multiple external sources compose?
4. When should you use `enableExternalSource` vs simple adapters?
5. What does the `untrack` parameter do?
