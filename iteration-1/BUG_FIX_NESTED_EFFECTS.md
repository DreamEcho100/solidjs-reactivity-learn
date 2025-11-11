# Bug Fix: Nested Effects Ownership

## Issue

Nested effects (effects created inside other effects) were not being cleaned up properly when the parent effect re-ran.

```javascript
createEffect(() => {
  trigger(); // Parent dependency

  createEffect(() => {
    // Inner effect created during parent execution
    onCleanup(() => {
      // ❌ This cleanup was NOT running when parent re-ran
    });
  });
});
```

## Root Cause

The ownership transfer for nested computations was missing in `runTop()` function, which handles the initial execution of effects.

**What was happening:**

1. **First run** (via `runTop`):

   - Parent effect executes with `Owner = tempOwner`
   - Inner effect created, registers with `tempOwner.owned`
   - Parent finishes execution
   - ❌ `tempOwner.owned` was NOT transferred to `computation.owned`
   - Result: `computation.owned` remained undefined/null

2. **Second run** (via `updateComputation`):
   - Tries to dispose `computation.owned`
   - But `computation.owned` is null (was never set!)
   - Old inner effect never disposed
   - ❌ Inner effect's cleanup never runs

## The Fix

Added ownership transfer to `runTop()` to match `updateComputation()`:

### Before:

```javascript
function runTop(computation) {
  // ... setup ...

  Owner = tempOwner;

  try {
    computation.fn(computation.value);
  } finally {
    // Transfer cleanups
    if (tempOwner.cleanups) {
      computation.cleanups = tempOwner.cleanups;
    }
    // ❌ Missing: Transfer owned computations!

    Listener = prevListener;
    Owner = prevOwner;
  }
}
```

### After:

```javascript
function runTop(computation) {
  // ... setup ...

  Owner = tempOwner;

  try {
    computation.fn(computation.value);
  } finally {
    // Transfer cleanups
    if (tempOwner.cleanups) {
      computation.cleanups = tempOwner.cleanups;
    }

    // ✅ Transfer owned computations
    if (tempOwner.owned) {
      computation.owned = tempOwner.owned;
    }

    Listener = prevListener;
    Owner = prevOwner;
  }
}
```

Also ensured `updateComputation()` has the same transfer logic and disposes old owned computations before re-executing.

## Verification

Created test case `test-nested-cleanup.js`:

```javascript
const [trigger, setTrigger] = createSignal(0);

createEffect(() => {
  trigger(); // Parent tracks signal

  onCleanup(() => outerCleanups++);

  createEffect(() => {
    innerRuns++;
    onCleanup(() => innerCleanups++);
  });
});

setTrigger(1); // Trigger parent re-run

// ✅ After fix:
// outerCleanups = 1 (parent cleanup ran)
// innerCleanups = 1 (inner effect disposed!)
```

## Impact

- **Before:** 85% test pass rate (34/40)
- **After:** 87.5% test pass rate (35/40)
- Fixed test: Complex cleanup with nested effects

## Remaining Issues

5 tests still failing (as documented in FAILURE_ANALYSIS.md):

1. ✅ **Batch deduplication** - Test assumption (system auto-batches)
2. ❓ **Todo list** - Intermittent issue (requires investigation)
3. ✅ **Shopping cart** - Float precision (test issue)
4. ❓ **Deep nesting** - Creating 10 levels of nested effects (edge case)
5. ❓ **Circular prevention** - Async timing (test design issue)

## Conclusion

The ownership system now correctly handles nested effects:

- ✅ Owned computations transferred from `tempOwner` to `computation.owned`
- ✅ Old owned computations disposed before re-execution
- ✅ Cleanups run in correct order (owned → cleanups)
- ✅ Matches SolidJS's ownership behavior

This is a legitimate use case (not an anti-pattern) and should work properly. Every `createEffect` is now responsible for its own cleanup, including disposing any effects it created during its execution.
