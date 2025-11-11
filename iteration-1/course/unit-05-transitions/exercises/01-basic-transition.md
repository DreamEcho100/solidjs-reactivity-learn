# Exercise 1: Basic Transition Implementation ⭐⭐⭐

## Objective

Implement a basic transition system with double buffering, demonstrating how values are isolated during transitions.

## Background

Transitions use double buffering to keep the UI responsive:
- `value`: The committed value (currently shown)
- `tValue`: The transition value (being computed)

## Requirements

Implement the following functions:

```javascript
// Global transition state
let Transition = null;

function startTransition(fn) {
  // Your implementation
}

function createSignal(initialValue) {
  // Your implementation with tValue support
}
```

### Features to Implement

1. **Basic Transition State**
   - Create `TransitionState` with `sources`, `running`, `done`, `resolve`
   - Track signals modified during transition

2. **Double Buffering**
   - Signals should have `value` and `tValue` properties
   - Reading during transition returns `tValue`
   - Reading outside transition returns `value`

3. **Commit Logic**
   - Copy all `tValue` to `value`
   - Clean up `tValue` properties
   - Resolve the done promise

## Starter Code

```javascript
// ===== YOUR IMPLEMENTATION =====

let Transition = null;

function createSignal(initialValue) {
  const signal = {
    value: initialValue,
    tValue: undefined,
    observers: []
  };
  
  const read = () => {
    // TODO: Return tValue if in running transition, else value
  };
  
  const write = (newValue) => {
    // TODO: Set tValue if in transition, else value
    // TODO: Add signal to Transition.sources if in transition
  };
  
  return [read, write];
}

function startTransition(fn) {
  // TODO: Implement startTransition
  // 1. Create TransitionState
  // 2. Set running = true
  // 3. Execute fn
  // 4. Commit changes
  // 5. Return promise
}

function commitTransition() {
  // TODO: Copy tValue to value for all sources
  // TODO: Clean up tValue
  // TODO: Resolve promise
}

// ===== TEST CASES =====

// Test 1: Basic transition
console.log('Test 1: Basic transition');
{
  const [count, setCount] = createSignal(0);
  
  console.log('Initial:', count());  // 0
  
  startTransition(() => {
    setCount(5);
    console.log('During transition:', count());  // Should be 5
  });
  
  console.log('After commit:', count());  // Should be 5
}

// Test 2: Values isolated during transition
console.log('\nTest 2: Isolated values');
{
  const [count, setCount] = createSignal(0);
  
  let transitionValue;
  let outsideValue;
  
  startTransition(() => {
    setCount(10);
    transitionValue = count();  // Should be 10 (tValue)
  });
  
  // Read outside transition before commit
  // (In real implementation, this would be after microtask)
  outsideValue = count();  // Should be 0 (value, before commit)
  
  console.log('Inside transition:', transitionValue);  // 10
  console.log('Outside transition:', outsideValue);    // 0
}

// Test 3: Multiple signals
console.log('\nTest 3: Multiple signals');
{
  const [a, setA] = createSignal(1);
  const [b, setB] = createSignal(2);
  const [c, setC] = createSignal(3);
  
  startTransition(() => {
    setA(10);
    setB(20);
    setC(30);
    
    console.log('During:', a(), b(), c());  // 10, 20, 30
  });
  
  console.log('After:', a(), b(), c());  // Should all be committed
}

// Test 4: Nested transitions (flattening)
console.log('\nTest 4: Nested transitions');
{
  const [count, setCount] = createSignal(0);
  
  startTransition(() => {
    setCount(5);
    
    startTransition(() => {
      setCount(10);  // Should use same transition
    });
    
    console.log('After nested:', count());  // 10
  });
  
  console.log('Final:', count());  // 10
}

// Test 5: Promise resolution
console.log('\nTest 5: Promise resolution');
{
  const [count, setCount] = createSignal(0);
  
  const promise = startTransition(() => {
    setCount(5);
  });
  
  promise.then(() => {
    console.log('Promise resolved! Count:', count());  // 5
  });
}
```

## Expected Output

```
Test 1: Basic transition
Initial: 0
During transition: 5
After commit: 5

Test 2: Isolated values
Inside transition: 10
Outside transition: 0

Test 3: Multiple signals
During: 10 20 30
After: 10 20 30

Test 4: Nested transitions
After nested: 10
Final: 10

Test 5: Promise resolution
Promise resolved! Count: 5
```

## Hints

1. **Reading Signals**
   ```javascript
   const read = () => {
     if (Transition && Transition.running) {
       return signal.tValue !== undefined ? signal.tValue : signal.value;
     }
     return signal.value;
   };
   ```

2. **Writing Signals**
   ```javascript
   const write = (newValue) => {
     if (Transition && Transition.running) {
       signal.tValue = newValue;
       Transition.sources.add(signal);
     } else {
       signal.value = newValue;
     }
   };
   ```

3. **Committing**
   ```javascript
   for (const signal of Transition.sources) {
     signal.value = signal.tValue;
     delete signal.tValue;
   }
   ```

## Bonus Challenges

1. **Microtask Deferral**: Make startTransition defer to next microtask
2. **Context Capture**: Implement Listener/Owner capture and restoration
3. **Nested Detection**: Handle already-running transitions properly
4. **Signal Tracking**: Keep track of which computations depend on which signals

## Solution

<details>
<summary>Click to reveal solution</summary>

```javascript
let Transition = null;

function createSignal(initialValue) {
  const signal = {
    value: initialValue,
    tValue: undefined,
    observers: []
  };
  
  const read = () => {
    if (Transition && Transition.running) {
      return signal.tValue !== undefined ? signal.tValue : signal.value;
    }
    return signal.value;
  };
  
  const write = (newValue) => {
    if (typeof newValue === 'function') {
      newValue = newValue(read());
    }
    
    if (Transition && Transition.running) {
      signal.tValue = newValue;
      Transition.sources.add(signal);
    } else {
      signal.value = newValue;
    }
  };
  
  return [read, write];
}

function startTransition(fn) {
  // Handle nested transitions
  if (Transition && Transition.running) {
    fn();
    return Transition.done;
  }
  
  // Create transition state
  Transition = {
    sources: new Set(),
    running: true,
    done: null,
    resolve: null
  };
  
  // Setup promise
  Transition.done = new Promise(resolve => {
    Transition.resolve = resolve;
  });
  
  // Execute function
  try {
    fn();
  } catch (err) {
    console.error('Error in transition:', err);
  }
  
  // Commit
  commitTransition();
  
  return Transition.done;
}

function commitTransition() {
  if (!Transition) return;
  
  // Copy tValue to value
  for (const signal of Transition.sources) {
    if (signal.tValue !== undefined) {
      signal.value = signal.tValue;
      delete signal.tValue;
    }
  }
  
  // Resolve promise
  const resolve = Transition.resolve;
  Transition = null;
  
  if (resolve) {
    resolve();
  }
}
```

</details>

## Verification

Run the test cases and verify:
1. ✅ Values are isolated during transitions
2. ✅ Multiple signals tracked correctly
3. ✅ Nested transitions flatten
4. ✅ Promise resolves after commit
5. ✅ No memory leaks (tValue cleaned up)

## What You Learned

- Double buffering technique
- TransitionState structure
- Signal value isolation
- Commit logic
- Promise-based API

## Next Exercise

**Exercise 2: Transition Scheduler** - Add async execution and scheduling support.
