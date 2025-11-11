# Lesson 2: Conditional Reactivity and Selective Tracking

## Table of Contents

1. [The Problem with Always Tracking](#the-problem-with-always-tracking)
2. [The on() Helper](#the-on-helper)
3. [createSelector Pattern](#createselector-pattern)
4. [Dynamic Dependencies](#dynamic-dependencies)
5. [Untracking Strategies](#untracking-strategies)
6. [Performance Optimization](#performance-optimization)
7. [Real-World Patterns](#real-world-patterns)

---

## The Problem with Always Tracking

### Automatic Dependency Collection

```javascript
const [firstName, setFirstName] = createSignal('John');
const [lastName, setLastName] = createSignal('Doe');
const [age, setAge] = createSignal(30);

createEffect(() => {
  console.log(`Name: ${firstName()} ${lastName()}`);
  // age() was read here by mistake!
  if (age() > 18) {
    console.log('Adult');
  }
});

// Problem: Effect runs even when only age changes
setAge(31); // Effect runs (unnecessary!)
```

### Why This Happens

```
Effect dependencies: [firstName, lastName, age]
                                           ^^^
                                  Unintended dependency!
```

### The Cost

```javascript
// Expensive computation
const [filter, setFilter] = createSignal('');
const [data, setData] = createSignal(bigArray);

const filtered = createMemo(() => {
  const f = filter();
  const d = data();
  
  // This runs on EVERY data change, even if filter didn't change
  return d.filter(item => item.name.includes(f));
});

// Problem: data changes frequently, but filter rarely
// Solution: Only re-run when filter changes
```

---

## The on() Helper

### Purpose

Execute effect only when specific dependencies change, but still read other values.

### Basic Usage

```javascript
import { on } from 'solid-js';

const [firstName, setFirstName] = createSignal('John');
const [lastName, setLastName] = createSignal('Doe');

createEffect(
  on(firstName, (name) => {
    // Only runs when firstName changes
    console.log(`First: ${name}, Last: ${lastName()}`);
    // lastName is read but NOT tracked
  })
);

setLastName('Smith'); // Effect does NOT run
setFirstName('Jane'); // Effect runs
```

### Implementation

```javascript
function on(deps, fn, options = {}) {
  const isArray = Array.isArray(deps);
  let prevInput;
  let defer = options.defer;
  
  return prevValue => {
    let input;
    
    if (isArray) {
      // Multiple dependencies
      input = Array(deps.length);
      for (let i = 0; i < deps.length; i++) {
        input[i] = deps[i]();
      }
    } else {
      // Single dependency
      input = deps();
    }
    
    if (defer) {
      defer = false;
      return undefined;
    }
    
    const result = untrack(() => 
      fn(input, prevInput, prevValue)
    );
    
    prevInput = input;
    return result;
  };
}
```

### How It Works

```javascript
// Step by step:

// 1. on() wraps your function
const wrappedFn = on(firstName, (name) => {
  console.log(name, lastName());
});

// 2. createEffect calls wrappedFn
createEffect(wrappedFn);

// 3. When effect runs:
//    - firstName() is called (TRACKED)
//    - fn is called inside untrack() (NOT TRACKED)
//    - lastName() is read but not tracked
```

### Multiple Dependencies

```javascript
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);
const [c, setC] = createSignal(3);

createEffect(
  on([a, b], ([aVal, bVal]) => {
    // Runs when a OR b changes
    // c is read but not tracked
    console.log(aVal + bVal + c());
  })
);

setC(10); // NO effect run
setA(5);  // Effect runs
setB(7);  // Effect runs
```

### Defer Option

```javascript
const [count, setCount] = createSignal(0);

createEffect(
  on(
    count,
    (value) => {
      console.log('Count changed to:', value);
    },
    { defer: true } // Skip initial run
  )
);

// Initial: nothing logged
setCount(1); // Logs: "Count changed to: 1"
```

### Practical Example: Fetch on ID Change

```javascript
const [userId, setUserId] = createSignal(1);
const [refresh, setRefresh] = createSignal(0);

createEffect(
  on(userId, async (id) => {
    // Only fetches when userId changes
    // refresh is ignored
    console.log('Fetching user', id);
    const user = await fetchUser(id);
    
    // Read refresh without tracking
    console.log('Refresh count:', refresh());
  })
);

setRefresh(1); // No fetch
setUserId(2);  // Fetches!
```

---

## createSelector Pattern

### The O(n²) Problem

```javascript
const [selected, setSelected] = createSignal(1);

const items = [1, 2, 3, 4, 5].map(id => {
  const isSelected = createMemo(() => selected() === id);
  return { id, isSelected };
});

// Problem: All 5 memos run on every selection change
// O(n) updates where n = number of items
```

### Visualization

```
selected changes from 1 → 2

Item 1: was selected, now not     → recompute ✓
Item 2: was not, now selected     → recompute ✓
Item 3: was not, still not        → recompute ✗ (unnecessary!)
Item 4: was not, still not        → recompute ✗ (unnecessary!)
Item 5: was not, still not        → recompute ✗ (unnecessary!)

Result: 5 updates, but only 2 actually changed
```

### The Solution: createSelector

```javascript
function createSelector(source) {
  const [selected, setSelected] = createSignal(source());
  
  createEffect(() => setSelected(source()));
  
  return (key) => key === selected();
}
```

### Usage

```javascript
const [selected, setSelected] = createSignal(1);
const isSelected = createSelector(selected);

const items = [1, 2, 3, 4, 5].map(id => {
  // Each calls isSelected(id)
  // But isSelected is a FUNCTION, not a signal!
  return {
    id,
    get isActive() {
      return isSelected(id); // Simple equality check
    }
  };
});

// When selected changes:
// Only the component reading the changed items re-render
```

### Why It's O(2)

```
selected changes from 1 → 2

Old value: 1 → signal updates (1 notification)
New value: 2 → signal updates (1 notification)

Total: 2 updates regardless of list size!
```

### Advanced Implementation

```javascript
function createSelector(source, fn = (a, b) => a === b) {
  const subs = new Map();
  const [selected, setSelected] = createSignal(source(), { equals: false });
  
  createEffect(() => {
    const newValue = source();
    const oldValue = selected();
    
    // Notify old value subscribers
    if (oldValue !== undefined) {
      const oldSubs = subs.get(oldValue);
      if (oldSubs) {
        for (const sub of oldSubs) {
          sub(false);
        }
      }
    }
    
    // Notify new value subscribers
    if (newValue !== undefined) {
      const newSubs = subs.get(newValue);
      if (newSubs) {
        for (const sub of newSubs) {
          sub(true);
        }
      }
    }
    
    setSelected(newValue);
  });
  
  return (key) => {
    const [isSelected, setIsSelected] = createSignal(
      fn(key, selected())
    );
    
    // Register subscriber
    if (!subs.has(key)) {
      subs.set(key, new Set());
    }
    subs.get(key).add(setIsSelected);
    
    // Cleanup on disposal
    onCleanup(() => {
      const keySubs = subs.get(key);
      if (keySubs) {
        keySubs.delete(setIsSelected);
        if (keySubs.size === 0) {
          subs.delete(key);
        }
      }
    });
    
    return isSelected;
  };
}
```

### Real-World Example: Active Tab

```javascript
const [activeTab, setActiveTab] = createSignal('home');
const isActive = createSelector(activeTab);

function Tab(props) {
  const active = isActive(props.name);
  
  return (
    <div class={active() ? 'tab-active' : 'tab'}>
      {props.children}
    </div>
  );
}

// 100 tabs, only 2 update on selection change!
<Tab name="home">Home</Tab>
<Tab name="about">About</Tab>
// ... 98 more tabs
```

---

## Dynamic Dependencies

### Conditional Reads

```javascript
const [mode, setMode] = createSignal('simple');
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);

createEffect(() => {
  console.log('Effect running');
  
  if (mode() === 'simple') {
    console.log('A:', a());
    // Dependencies: [mode, a]
  } else {
    console.log('B:', b());
    // Dependencies: [mode, b]
  }
});

// Behavior:
setA(10); // Runs (mode is 'simple')
setB(20); // Does NOT run
setMode('advanced');
setB(30); // NOW it runs
setA(15); // Does NOT run anymore
```

### How Solid Handles This

```javascript
// On each effect run:
// 1. Clear old dependencies
cleanupSources(computation);

// 2. Set up tracking
Listener = computation;

// 3. Run function (tracks new reads)
fn();

// 4. New dependencies are now established
// 5. Old dependencies no longer notify this effect
```

### Example: Fetch Based on Filter

```javascript
const [filterType, setFilterType] = createSignal('name');
const [nameFilter, setNameFilter] = createSignal('');
const [ageFilter, setAgeFilter] = createSignal(0);

const filtered = createMemo(() => {
  const type = filterType();
  
  if (type === 'name') {
    const name = nameFilter();
    return data.filter(item => item.name.includes(name));
  } else {
    const age = ageFilter();
    return data.filter(item => item.age >= age);
  }
});

// When filterType is 'name':
// - nameFilter changes → recompute
// - ageFilter changes → NO recompute

// When filterType is 'age':
// - ageFilter changes → recompute
// - nameFilter changes → NO recompute
```

---

## Untracking Strategies

### Why Untrack?

```javascript
// Problem: Reading derived state in an effect
const [count, setCount] = createSignal(0);
const doubled = createMemo(() => count() * 2);

createEffect(() => {
  console.log('Count:', count());
  
  // Want to log doubled, but don't want to depend on it
  console.log('Doubled:', doubled()); // Creates unwanted dependency!
});

// Now effect runs when EITHER count or doubled changes
// But doubled always changes when count changes
// So effect runs twice per count update!
```

### Solution: untrack()

```javascript
import { untrack } from 'solid-js';

createEffect(() => {
  console.log('Count:', count());
  
  // Read doubled without tracking
  console.log('Doubled:', untrack(doubled));
});

// Now runs only when count changes directly
```

### Implementation

```javascript
function untrack(fn) {
  const prevListener = Listener;
  Listener = null;
  
  try {
    return fn();
  } finally {
    Listener = prevListener;
  }
}
```

### Common Use Cases

#### 1. Logging Without Side Effects

```javascript
createEffect(() => {
  const value = signal();
  
  // Log context without tracking
  untrack(() => {
    console.log('Context:', getContext());
    console.log('Timestamp:', Date.now());
  });
  
  processValue(value);
});
```

#### 2. Reading Props in Effects

```javascript
function Component(props) {
  createEffect(() => {
    // Track only the data signal
    const data = props.data();
    
    // Read config without tracking
    const config = untrack(() => props.config);
    
    process(data, config);
  });
}
```

#### 3. Preventing Infinite Loops

```javascript
const [a, setA] = createSignal(0);
const [b, setB] = createSignal(0);

createEffect(() => {
  const aVal = a();
  
  // Update b without tracking it
  untrack(() => {
    setB(aVal * 2);
  });
});

// Without untrack: infinite loop!
// With untrack: runs only when a changes
```

#### 4. Batch Reads

```javascript
const signals = [
  createSignal(1),
  createSignal(2),
  createSignal(3)
];

const sum = createMemo(() => {
  // Read all without tracking
  return untrack(() => {
    return signals.reduce((acc, [s]) => acc + s(), 0);
  });
});

// sum only updates when explicitly invalidated
// Not when any signal changes
```

---

## Performance Optimization

### Pattern 1: Explicit Dependencies with on()

```javascript
// ❌ Bad: Tracks everything
createEffect(() => {
  const id = userId();
  const filter = searchFilter();
  const sort = sortOrder();
  
  fetchData(id, filter, sort);
});
// Runs on ANY change

// ✅ Good: Only track ID
createEffect(
  on(userId, (id) => {
    const filter = searchFilter();
    const sort = sortOrder();
    
    fetchData(id, filter, sort);
  })
);
// Runs only on ID change
```

### Pattern 2: Selector for Large Lists

```javascript
// ❌ Bad: O(n) updates
const items = data.map(item => ({
  ...item,
  isSelected: createMemo(() => selectedId() === item.id)
}));

// ✅ Good: O(2) updates
const isSelected = createSelector(selectedId);
const items = data.map(item => ({
  ...item,
  isSelected: () => isSelected(item.id)
}));
```

### Pattern 3: Untrack for Derived Reads

```javascript
// ❌ Bad: Double tracking
const derived = createMemo(() => {
  const a = sourceA();
  const b = sourceB(); // Creates dependency
  return a + b;
});

createEffect(() => {
  const a = sourceA(); // Already tracking
  const d = derived(); // Tracks again!
});

// ✅ Good: Untrack derived
createEffect(() => {
  const a = sourceA();
  const d = untrack(derived); // No extra tracking
});
```

### Pattern 4: Defer Initial Execution

```javascript
// ❌ Bad: Runs on mount
createEffect(() => {
  saveToLocalStorage(data());
});
// Saves immediately on load!

// ✅ Good: Skip first run
createEffect(
  on(data, (value) => {
    saveToLocalStorage(value);
  }, { defer: true })
);
// Only saves on changes
```

---

## Real-World Patterns

### Pattern 1: Smart Data Fetching

```javascript
function createQuery(queryKey, fetcher) {
  const [data, setData] = createSignal();
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal();
  
  createEffect(
    on(queryKey, async (key) => {
      setLoading(true);
      setError(undefined);
      
      try {
        // Fetch data
        const result = await fetcher(key);
        
        // Update state without tracking
        untrack(() => {
          setData(result);
          setLoading(false);
        });
      } catch (err) {
        untrack(() => {
          setError(err);
          setLoading(false);
        });
      }
    })
  );
  
  return { data, loading, error };
}

// Usage
const userId = createSignal(1);
const query = createQuery(userId, fetchUser);
```

### Pattern 2: Optimized Search

```javascript
function createSearch(items, searchTerm) {
  // Only recompute when search term changes
  const results = createMemo(
    on(searchTerm, (term) => {
      if (!term) return untrack(items);
      
      const termLower = term.toLowerCase();
      return untrack(items).filter(item =>
        item.name.toLowerCase().includes(termLower)
      );
    })
  );
  
  return results;
}

const [items, setItems] = createSignal([...]);
const [search, setSearch] = createSignal('');
const results = createSearch(items, search);

// Items change: no recompute
// Search changes: recompute
```

### Pattern 3: Multi-Select with Selector

```javascript
function createMultiSelect(initial = []) {
  const [selected, setSelected] = createSignal(new Set(initial));
  
  const isSelected = (id) => {
    return createMemo(() => selected().has(id));
  };
  
  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };
  
  return { isSelected, toggle, selected };
}

// Usage
const selection = createMultiSelect();

function Item(props) {
  const isSelected = selection.isSelected(props.id);
  
  return (
    <div class={isSelected() ? 'selected' : ''}>
      {props.name}
    </div>
  );
}
```

### Pattern 4: Conditional Effects

```javascript
function createConditionalEffect(condition, effect) {
  createEffect(() => {
    if (untrack(condition)) {
      createEffect(
        on(condition, (isTrue) => {
          if (isTrue) {
            effect();
          }
        })
      );
    }
  });
}

// Usage
const [isEnabled, setIsEnabled] = createSignal(false);

createConditionalEffect(
  () => isEnabled(),
  () => {
    console.log('Enabled!');
    // Expensive operation
  }
);
```

---

## Summary

### Key Takeaways

1. **on() for Explicit Dependencies**
   - Control what triggers effects
   - Read other values without tracking
   - Use defer to skip initial run

2. **createSelector for Lists**
   - O(2) updates instead of O(n)
   - Only affected items re-render
   - Perfect for selections and tabs

3. **Dynamic Dependencies Are Automatic**
   - Dependencies change based on execution path
   - Cleaned up on each run
   - No manual management needed

4. **untrack() for Controlled Reads**
   - Read values without creating dependencies
   - Prevent infinite loops
   - Optimize performance

5. **Performance Patterns**
   - Use on() for expensive effects
   - Use selector for large lists
   - Untrack derived computations
   - Defer unnecessary initial runs

### What You've Learned

- ✅ Control reactive dependencies precisely
- ✅ Optimize list rendering with selectors
- ✅ Handle dynamic dependencies
- ✅ Use untrack() strategically
- ✅ Build performant reactive patterns

### Next Steps

Continue to Lesson 3: Deferred Computations and Advanced Scheduling

---

## Further Reading

- **Next:** [Lesson 3: Deferred Computations](./lesson-03-deferred-computations.md)
- **Exercise:** [Conditional Reactivity Exercise](../exercises/02-conditional-reactivity.md)
- **Reference:** [Solid.js on() documentation](https://docs.solidjs.com/reference/reactive-utilities/on)
