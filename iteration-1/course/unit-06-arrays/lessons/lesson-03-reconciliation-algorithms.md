# Lesson 3: Reconciliation Algorithms Deep Dive

## Overview

Both `mapArray` and `indexArray` use sophisticated reconciliation algorithms to minimize DOM operations. In this lesson, we'll explore the algorithms in depth, understand their optimizations, and learn how to apply these techniques in your own code.

## Learning Objectives

By the end of this lesson, you will:
- ✅ Understand reconciliation algorithm fundamentals
- ✅ Master prefix/suffix optimization
- ✅ Implement map-based diffing
- ✅ Analyze complexity and performance
- ✅ Apply reconciliation patterns to custom scenarios

## What is Reconciliation?

**Reconciliation** is the process of efficiently updating a view when its underlying data changes. The goal is to minimize expensive operations (like DOM manipulation) by reusing existing elements where possible.

### The Core Challenge

```typescript
// Old array
const oldItems = ['A', 'B', 'C', 'D', 'E'];

// New array
const newItems = ['C', 'A', 'F', 'D'];

// Question: How do we transform old → new with minimal operations?
```

**Naive approach**: Destroy all old items, create all new items  
**Cost**: 5 destroys + 4 creates = 9 operations

**Smart approach**: Reuse what we can  
**Cost**: 2 destroys ('B', 'E') + 1 create ('F') + some updates = 3-5 operations

## Reconciliation Strategies

### 1. Full Replacement (Worst)

```typescript
function naiveReconcile(old: T[], new: T[]): Operation[] {
  return [
    ...old.map(item => ({ type: 'remove', item })),
    ...new.map(item => ({ type: 'create', item }))
  ];
}
```

**Complexity**: O(n + m)  
**Operations**: n + m  
**Use when**: Arrays are completely different

### 2. Index-Based Update (mapArray approach)

```typescript
function indexReconcile(old: T[], new: T[]): Operation[] {
  const ops: Operation[] = [];
  const minLen = Math.min(old.length, new.length);
  
  // Update existing positions
  for (let i = 0; i < minLen; i++) {
    if (old[i] !== new[i]) {
      ops.push({ type: 'update', index: i, from: old[i], to: new[i] });
    }
  }
  
  // Remove excess
  for (let i = minLen; i < old.length; i++) {
    ops.push({ type: 'remove', index: i, item: old[i] });
  }
  
  // Add new
  for (let i = minLen; i < new.length; i++) {
    ops.push({ type: 'create', index: i, item: new[i] });
  }
  
  return ops;
}
```

**Complexity**: O(n)  
**Operations**: ~n updates  
**Use when**: Position matters more than identity

### 3. Value-Based Matching (indexArray approach)

```typescript
function valueReconcile(old: T[], new: T[]): Operation[] {
  const ops: Operation[] = [];
  const seen = new Set<T>();
  
  // Match by value
  for (let i = 0; i < new.length; i++) {
    const item = new[i];
    const oldIndex = old.indexOf(item);
    
    if (oldIndex >= 0 && !seen.has(item)) {
      ops.push({ type: 'move', from: oldIndex, to: i, item });
      seen.add(item);
    } else {
      ops.push({ type: 'create', index: i, item });
    }
  }
  
  // Remove unmatched
  for (let i = 0; i < old.length; i++) {
    if (!seen.has(old[i])) {
      ops.push({ type: 'remove', index: i, item: old[i] });
    }
  }
  
  return ops;
}
```

**Complexity**: O(n * m) naive, O(n + m) with Map  
**Operations**: Minimal creates/removes  
**Use when**: Identity matters, items reorder frequently

## The Solid.js Optimization: Prefix/Suffix Matching

Both mapArray and indexArray use a clever optimization: **skip common prefix and suffix**.

### Why It Matters

Most array changes are localized:
- **Append**: `[...items, newItem]` - only suffix changes
- **Prepend**: `[newItem, ...items]` - only prefix changes
- **Filter middle**: `items.slice(0, 5).concat(items.slice(10))` - prefix and suffix unchanged

### The Algorithm

```typescript
function reconcileWithPrefixSuffix<T>(
  old: T[],
  new: T[]
): { start: number; oldEnd: number; newEnd: number } {
  const oldLen = old.length;
  const newLen = new.length;
  const minLen = Math.min(oldLen, newLen);
  
  // Find common prefix
  let start = 0;
  while (start < minLen && old[start] === new[start]) {
    start++;
  }
  
  // All same? Done!
  if (start === minLen) {
    return {
      start,
      oldEnd: oldLen - 1,
      newEnd: newLen - 1
    };
  }
  
  // Find common suffix
  let oldEnd = oldLen - 1;
  let newEnd = newLen - 1;
  
  while (
    oldEnd >= start &&
    newEnd >= start &&
    old[oldEnd] === new[newEnd]
  ) {
    oldEnd--;
    newEnd--;
  }
  
  return { start, oldEnd, newEnd };
}
```

### Example Walkthrough

```typescript
const old = ['A', 'B', 'C', 'D', 'E', 'F'];
const new = ['A', 'B', 'X', 'Y', 'E', 'F'];
```

**Step 1: Find Prefix**
```
old: ['A', 'B', 'C', 'D', 'E', 'F']
      ✓    ✓    ✗
new: ['A', 'B', 'X', 'Y', 'E', 'F']

start = 2  // First mismatch at index 2
```

**Step 2: Find Suffix**
```
old: ['A', 'B', 'C', 'D', 'E', 'F']
                       ✓    ✓
new: ['A', 'B', 'X', 'Y', 'E', 'F']

oldEnd = 3  // old[4,5] match new[4,5]
newEnd = 3  // Only need to reconcile [2..3]
```

**Result**: Only reconcile middle section `['C', 'D']` → `['X', 'Y']`

**Savings**:
- **Without optimization**: Check all 6 items
- **With optimization**: Check only 2 items (67% reduction!)

## Map-Based Diffing in mapArray

After prefix/suffix optimization, mapArray uses map-based diffing for the middle section.

### The Algorithm

```typescript
function mapBasedDiff<T>(
  oldItems: T[],
  newItems: T[],
  start: number,
  oldEnd: number,
  newEnd: number
): ReconcileResult {
  // Build map of new items → positions
  const newIndices = new Map<T, number>();
  const newIndicesNext = new Array(newEnd + 1);
  
  // Scan backwards to find all occurrences
  for (let j = newEnd; j >= start; j--) {
    const item = newItems[j];
    const prevPos = newIndices.get(item);
    newIndicesNext[j] = prevPos !== undefined ? prevPos : -1;
    newIndices.set(item, j);
  }
  
  // Try to match old items
  const reused = new Map<number, number>(); // oldIndex → newIndex
  const toRemove = new Set<number>();
  
  for (let i = start; i <= oldEnd; i++) {
    const item = oldItems[i];
    let newPos = newIndices.get(item);
    
    if (newPos !== undefined && newPos !== -1) {
      // Found! Reuse this item
      reused.set(i, newPos);
      
      // Update to next occurrence for duplicates
      newPos = newIndicesNext[newPos];
      newIndices.set(item, newPos);
    } else {
      // Not found - remove it
      toRemove.add(i);
    }
  }
  
  // Find positions that need creation
  const toCreate = new Set<number>();
  for (let j = start; j <= newEnd; j++) {
    if (![...reused.values()].includes(j)) {
      toCreate.add(j);
    }
  }
  
  return { reused, toRemove, toCreate };
}
```

### Why Use a Map?

**Without Map** (naive):
```typescript
for (let i = 0; i < old.length; i++) {
  const newIndex = new.indexOf(old[i]);  // O(m) per iteration
  // Total: O(n * m)
}
```

**With Map**:
```typescript
const map = new Map(new.map((item, i) => [item, i]));  // O(m)
for (let i = 0; i < old.length; i++) {
  const newIndex = map.get(old[i]);  // O(1) per iteration
  // Total: O(n + m)
}
```

**Speedup**: From O(n*m) to O(n+m) - **massive** for large arrays!

### Handling Duplicates

```typescript
const old = ['A', 'B', 'A', 'C'];
const new = ['A', 'A', 'B', 'C'];
```

**Challenge**: Two 'A's - which old 'A' maps to which new 'A'?

**Solution**: Scan backwards and track next occurrence

```typescript
// Scan new items backwards
j=3: 'C' → newIndices.set('C', 3)
j=2: 'B' → newIndices.set('B', 2)
j=1: 'A' → newIndicesNext[1] = -1, newIndices.set('A', 1)
j=0: 'A' → newIndicesNext[0] = 1, newIndices.set('A', 0)

// Now match old items
i=0: 'A' → found at 0, next is 1
i=1: 'B' → found at 2
i=2: 'A' → found at 1 (next occurrence)
i=3: 'C' → found at 3
```

This ensures each old item finds the "earliest available" new position.

## Complexity Analysis

### Prefix/Suffix Optimization

| Case | Prefix | Suffix | Middle | Total |
|------|--------|--------|--------|-------|
| **Best** | O(n) | Skip | Skip | O(n) |
| **Average** | O(k) | O(k) | O(m) | O(n+m) |
| **Worst** | Skip | Skip | O(n+m) | O(n+m) |

Where:
- n = old array length
- m = new array length
- k = common prefix/suffix length

### Map-Based Diffing

**Time Complexity**:
- Build map: O(m)
- Match old items: O(n)
- Find gaps: O(m)
- **Total**: O(n + m)

**Space Complexity**:
- Map: O(m)
- Temporary arrays: O(m)
- **Total**: O(m)

### Comparison with Alternatives

| Algorithm | Time | Space | Best For |
|-----------|------|-------|----------|
| **Naive** | O(n+m) | O(1) | Complete replacement |
| **indexOf** | O(n*m) | O(1) | Small arrays |
| **Map-based** | O(n+m) | O(m) | Large arrays |
| **LCS** | O(n*m) | O(n*m) | Minimize edits |
| **Patience** | O(n*log(n)) | O(n) | Optimal for patches |

Solid uses **Map-based** for the best time/space tradeoff.

## Real-World Performance

### Benchmark: 1000 Items

```typescript
const old = Array.from({ length: 1000 }, (_, i) => i);
const new = old.slice().sort(() => Math.random() - 0.5); // Shuffle

// Naive O(n*m)
console.time('naive');
naiveDiff(old, new);
console.timeEnd('naive'); // ~500ms

// Map-based O(n+m)
console.time('map-based');
mapBasedDiff(old, new);
console.timeEnd('map-based'); // ~2ms

// 250x faster!
```

### Common Scenarios

#### Append to End
```typescript
// Old: [1, 2, 3]
// New: [1, 2, 3, 4]

// Prefix matches all → skip to end
// Only process [4]
// Operations: 1 create
```

#### Remove from Middle
```typescript
// Old: [1, 2, 3, 4, 5]
// New: [1, 2, 4, 5]

// Prefix: [1, 2]
// Suffix: [4, 5]
// Middle: [3] → []
// Operations: 1 remove
```

#### Reverse Array
```typescript
// Old: [1, 2, 3, 4, 5]
// New: [5, 4, 3, 2, 1]

// No common prefix/suffix
// Map all items → reuse all
// Operations: 5 moves (or 5 updates for mapArray)
```

## Advanced Techniques

### Longest Common Subsequence (LCS)

For **minimal edits**, use LCS:

```typescript
function lcs<T>(old: T[], new: T[]): number[][] {
  const m = old.length;
  const n = new.length;
  const dp = Array.from({ length: m + 1 }, () => 
    Array(n + 1).fill(0)
  );
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (old[i-1] === new[j-1]) {
        dp[i][j] = dp[i-1][j-1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
      }
    }
  }
  
  return dp;
}

function minEditDistance(old: T[], new: T[]): Edit[] {
  const dp = lcs(old, new);
  // Backtrack to find edits...
  // Returns minimal set of insert/delete/move operations
}
```

**Complexity**: O(n*m) time, O(n*m) space  
**Use case**: When minimizing operations is critical (e.g., undo/redo)

### Patience Diff

Used by git, optimal for line-based diffing:

```typescript
function patienceDiff<T>(old: T[], new: T[]): Edit[] {
  // Find unique common items
  const unique = findUniqueMatches(old, new);
  
  // These form an LCS
  const lcs = longestIncreasingSubsequence(unique);
  
  // Recursively diff non-matching sections
  // ...
}
```

**Complexity**: O(n*log(n)) typical  
**Use case**: Text diffing, version control

### Myers Algorithm

Classic diff algorithm:

```typescript
function myersDiff<T>(old: T[], new: T[]): Edit[] {
  // Build edit graph
  // Find shortest path (minimal edits)
  // Returns optimal edit script
}
```

**Complexity**: O((n+m)*d) where d = edit distance  
**Use case**: When you need optimal solution

## Practical Optimizations

### 1. Early Exit

```typescript
// If arrays are identical, skip everything
if (old === new) return [];
if (old.length === 0) return new.map(createOp);
if (new.length === 0) return old.map(removeOp);
```

### 2. Length Check

```typescript
// If lengths differ significantly, might be faster to replace
if (Math.abs(old.length - new.length) > old.length * 0.8) {
  return fullReplace(old, new);
}
```

### 3. Sampling

For very large arrays, sample before full reconciliation:

```typescript
// Check if arrays are mostly same
const sampleSize = Math.min(100, old.length);
let changes = 0;

for (let i = 0; i < sampleSize; i++) {
  const idx = Math.floor(Math.random() * old.length);
  if (old[idx] !== new[idx]) changes++;
}

// If >50% changed, might be faster to replace
if (changes > sampleSize * 0.5) {
  return fullReplace(old, new);
}
```

### 4. Key-Based Optimization

If items have unique keys:

```typescript
interface Keyed {
  key: string;
  data: any;
}

function keyedDiff(old: Keyed[], new: Keyed[]): Edit[] {
  const oldMap = new Map(old.map(item => [item.key, item]));
  const newMap = new Map(new.map(item => [item.key, item]));
  
  // Much faster - direct lookup by key
  // ...
}
```

## Implementation Tips

### Choosing an Algorithm

```typescript
function chooseReconciliation<T>(
  old: T[],
  new: T[],
  options: ReconcileOptions
): Reconciler<T> {
  // Small arrays - simple is fine
  if (old.length < 10 && new.length < 10) {
    return naiveReconcile;
  }
  
  // Have keys - use keyed diff
  if (options.getKey) {
    return keyedReconcile;
  }
  
  // Large arrays - use optimized algorithm
  if (old.length > 1000 || new.length > 1000) {
    return mapBasedReconcile;
  }
  
  // Default - balanced approach
  return solidReconcile;
}
```

### Testing Reconciliation

```typescript
describe('Reconciliation', () => {
  it('handles append', () => {
    const ops = reconcile([1, 2], [1, 2, 3]);
    expect(ops).toEqual([{ type: 'create', index: 2, item: 3 }]);
  });
  
  it('handles prepend', () => {
    const ops = reconcile([2, 3], [1, 2, 3]);
    expect(ops).toHaveLength(3); // Depends on algorithm
  });
  
  it('handles remove', () => {
    const ops = reconcile([1, 2, 3], [1, 3]);
    expect(ops).toContainEqual({ type: 'remove', item: 2 });
  });
  
  it('handles reorder', () => {
    const ops = reconcile([1, 2, 3], [3, 2, 1]);
    // Verify minimal operations
  });
  
  it('handles duplicates', () => {
    const ops = reconcile([1, 2, 1], [1, 1, 2]);
    // Verify correct matching
  });
});
```

## Summary

Reconciliation algorithms are crucial for performance:

1. **Prefix/Suffix Optimization**: Skip unchanged portions (huge win)
2. **Map-Based Diffing**: O(n+m) instead of O(n*m)
3. **Duplicate Handling**: Scan backwards with "next" pointers
4. **Trade-offs**: Time vs space vs optimality

Solid.js uses a balanced approach that:
- ✅ Is fast for common cases (append, prepend, filter)
- ✅ Scales to large arrays
- ✅ Handles edge cases (duplicates, empty arrays)
- ✅ Uses reasonable memory

Understanding these algorithms helps you:
- Choose the right list primitive (For vs Index)
- Optimize your data flow
- Build custom reconciliation for special cases
- Debug performance issues

## Next Steps

In the next lesson, we'll explore **list optimization techniques** including virtual scrolling, windowing, and pagination - building on these reconciliation fundamentals.

## Further Reading

- [Myers Diff Algorithm](https://blog.jcoglan.com/2017/02/12/the-myers-diff-algorithm-part-1/)
- [Patience Diff](https://alfedenzo.livejournal.com/170301.html)
- [React Reconciliation](https://react.dev/learn/preserving-and-resetting-state)
- [Vue List Rendering](https://vuejs.org/guide/essentials/list.html)

---

**Practice Exercise**: Implement three different reconciliation algorithms and benchmark them against various array change patterns. Which performs best in which scenarios?
