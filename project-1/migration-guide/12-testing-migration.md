# Step 12: Testing Your Migration

## 🎯 Goal
Ensure your migrated reactive system is production-ready with comprehensive testing.

## 📋 Test Categories

### 1. Core Functionality Tests
### 2. Performance Tests
### 3. Memory Leak Tests
### 4. Integration Tests
### 5. Edge Case Tests

## 🧪 Core Functionality Tests

### Signal Tests

```typescript
describe('Signals', () => {
  test('createSignal basic functionality', () => {
    const [count, setCount] = createSignal(0);
    
    expect(count()).toBe(0);
    
    setCount(5);
    expect(count()).toBe(5);
    
    setCount(c => c + 1);
    expect(count()).toBe(6);
  });
  
  test('signal equality check', () => {
    const [count, setCount] = createSignal(0, { equals: (a, b) => a === b });
    let runs = 0;
    
    createEffect(() => {
      count();
      runs++;
    });
    
    runs = 0;
    setCount(0); // Same value
    expect(runs).toBe(0); // Should not trigger
    
    setCount(1); // Different value
    expect(runs).toBe(1); // Should trigger
  });
  
  test('signal with custom equality', () => {
    const [obj, setObj] = createSignal(
      { value: 1 },
      { equals: (a, b) => a.value === b.value }
    );
    
    let runs = 0;
    createEffect(() => {
      obj();
      runs++;
    });
    
    runs = 0;
    setObj({ value: 1 }); // Same value property
    expect(runs).toBe(0);
    
    setObj({ value: 2 }); // Different value
    expect(runs).toBe(1);
  });
});
```

### Effect Tests

```typescript
describe('Effects', () => {
  test('createEffect runs on dependencies', () => {
    const [count, setCount] = createSignal(0);
    let value = 0;
    
    createEffect(() => {
      value = count();
    });
    
    expect(value).toBe(0);
    
    setCount(5);
    expect(value).toBe(5);
  });
  
  test('effect cleanup runs', () => {
    const [sig, setSig] = createSignal(0);
    let cleanupRuns = 0;
    
    createRoot(dispose => {
      createEffect(() => {
        sig();
        onCleanup(() => cleanupRuns++);
      });
      
      setSig(1); // Triggers cleanup
      setSig(2); // Triggers cleanup again
      
      expect(cleanupRuns).toBe(2);
      
      dispose(); // Final cleanup
      expect(cleanupRuns).toBe(3);
    });
  });
  
  test('nested effects dispose properly', () => {
    const [sig, setSig] = createSignal(0);
    let childCreations = 0;
    let childCleanups = 0;
    
    createRoot(() => {
      createEffect(() => {
        sig();
        createEffect(() => {
          childCreations++;
          onCleanup(() => childCleanups++);
        });
      });
      
      setSig(1);
      setSig(2);
      setSig(3);
      
      // Only 1 child should exist at a time
      expect(childCreations).toBe(4); // Initial + 3 updates
      expect(childCleanups).toBe(3); // 3 cleanups
    });
  });
});
```

### Memo Tests

```typescript
describe('Memos', () => {
  test('memo caches value', () => {
    const [count, setCount] = createSignal(0);
    let computations = 0;
    
    const doubled = createMemo(() => {
      computations++;
      return count() * 2;
    });
    
    expect(computations).toBe(1); // Initial
    
    doubled(); // Read
    doubled(); // Read again
    expect(computations).toBe(1); // Still 1, cached!
    
    setCount(5);
    expect(computations).toBe(1); // Not yet recomputed (lazy)
    
    doubled(); // Now recompute
    expect(computations).toBe(2);
  });
  
  test('memo chains efficiently', () => {
    const [a, setA] = createSignal(1);
    let computations = 0;
    
    const b = createMemo(() => { computations++; return a() * 2; });
    const c = createMemo(() => { computations++; return b() * 2; });
    const d = createMemo(() => { computations++; return c() * 2; });
    
    computations = 0;
    setA(2);
    
    const result = d();
    expect(result).toBe(16); // 2 * 2 * 2 * 2
    expect(computations).toBe(3); // Each computed once
  });
});
```

### Batch Tests

```typescript
describe('Batching', () => {
  test('batch deduplicates effects', () => {
    const [a, setA] = createSignal(0);
    const [b, setB] = createSignal(0);
    let runs = 0;
    
    createEffect(() => {
      a();
      b();
      runs++;
    });
    
    runs = 0;
    
    batch(() => {
      setA(1);
      setB(2);
      setA(3);
      setB(4);
    });
    
    expect(runs).toBe(1); // Only 1 effect run
  });
  
  test('batch with memos', () => {
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(2);
    let memoRuns = 0;
    let effectRuns = 0;
    
    const sum = createMemo(() => {
      memoRuns++;
      return a() + b();
    });
    
    createEffect(() => {
      sum();
      effectRuns++;
    });
    
    memoRuns = 0;
    effectRuns = 0;
    
    batch(() => {
      setA(5);
      setB(10);
    });
    
    expect(memoRuns).toBe(1); // Memo computed once
    expect(effectRuns).toBe(1); // Effect run once
  });
});
```

## 📊 Performance Tests

```typescript
describe('Performance', () => {
  test('cleanup 10,000 dependencies in <50ms', () => {
    const [s, setS] = createSignal(0);
    
    const dispose = createRoot(dispose => {
      for (let i = 0; i < 10000; i++) {
        createEffect(() => s());
      }
      return dispose;
    });
    
    const start = performance.now();
    dispose();
    const duration = performance.now() - start;
    
    expect(duration).toBeLessThan(50);
  });
  
  test('update 1,000 memos in <10ms', () => {
    const [s, setS] = createSignal(0);
    const memos: Accessor<number>[] = [];
    
    for (let i = 0; i < 1000; i++) {
      memos.push(createMemo(() => s() * 2));
    }
    
    const start = performance.now();
    setS(5);
    memos.forEach(m => m()); // Force read
    const duration = performance.now() - start;
    
    expect(duration).toBeLessThan(10);
  });
  
  test('diamond dependency no glitches', () => {
    const [a, setA] = createSignal(1);
    const b = createMemo(() => a() * 2);
    const c = createMemo(() => a() * 3);
    
    const results: number[] = [];
    createEffect(() => {
      results.push(b() + c());
    });
    
    results.length = 0;
    
    batch(() => {
      setA(5);
      setA(10);
      setA(15);
    });
    
    // Should only see final result
    expect(results).toEqual([45]); // 30 + 15
  });
});
```

## 🔍 Memory Leak Tests

```typescript
describe('Memory Management', () => {
  test('no leaks with nested effects', () => {
    const [signal, setSignal] = createSignal(0);
    let childRuns = 0;
    
    createRoot(() => {
      createEffect(() => {
        signal();
        createEffect(() => {
          childRuns++;
        });
      });
      
      setSignal(1);
      setSignal(2);
      setSignal(3);
      
      // Should only have 1 child at a time
      expect(childRuns).toBe(4); // Initial + 3 updates
    });
  });
  
  test('ownership disposes children', () => {
    let childDisposed = false;
    
    const dispose = createRoot(dispose => {
      createEffect(() => {
        createEffect(() => {
          onCleanup(() => {
            childDisposed = true;
          });
        });
      });
      
      return dispose;
    });
    
    expect(childDisposed).toBe(false);
    dispose();
    expect(childDisposed).toBe(true);
  });
  
  test('cyclic references dont leak', () => {
    const [a, setA] = createSignal(0);
    const [b, setB] = createSignal(0);
    
    const dispose = createRoot(dispose => {
      createEffect(() => {
        if (a() > 0) setB(a());
      });
      
      createEffect(() => {
        if (b() > 0) setA(b());
      });
      
      return dispose;
    });
    
    setA(1); // Trigger cycle
    
    // Should not hang or leak
    dispose();
  });
});
```

## 🔗 Integration Tests

```typescript
describe('Integration', () => {
  test('complete app scenario', () => {
    // Simulate a real app
    const [user, setUser] = createSignal(null);
    const [posts, setPosts] = createSignal([]);
    
    const userPosts = createMemo(() => {
      const u = user();
      return posts().filter(p => p.userId === u?.id);
    });
    
    let renderCount = 0;
    createEffect(() => {
      userPosts();
      renderCount++;
    });
    
    // Initial load
    expect(renderCount).toBe(1);
    
    // Load user
    batch(() => {
      setUser({ id: 1, name: "Alice" });
      setPosts([
        { id: 1, userId: 1, title: "Post 1" },
        { id: 2, userId: 2, title: "Post 2" },
        { id: 3, userId: 1, title: "Post 3" }
      ]);
    });
    
    expect(renderCount).toBe(2); // Only 1 additional render
    expect(userPosts().length).toBe(2); // Filtered correctly
  });
  
  test('resource with suspense', async () => {
    const fetchData = () => Promise.resolve({ data: "test" });
    const [resource] = createResource(fetchData);
    
    expect(resource.loading).toBe(true);
    
    await new Promise(resolve => setTimeout(resolve, 0));
    
    expect(resource.loading).toBe(false);
    expect(resource()).toEqual({ data: "test" });
  });
});
```

## ✅ Test Checklist

### Core Features
- [ ] Signals read and write
- [ ] Effects subscribe to signals
- [ ] Memos cache computations
- [ ] Batching deduplicates
- [ ] Cleanup functions run
- [ ] Untrack prevents subscription

### Ownership
- [ ] createRoot creates scope
- [ ] Children dispose with parent
- [ ] Context propagates
- [ ] No memory leaks

### Performance
- [ ] O(1) cleanup operations
- [ ] No glitches in diamond dependencies
- [ ] Lazy evaluation works
- [ ] Efficient at scale (10k+ nodes)

### Advanced
- [ ] Transitions work
- [ ] Error boundaries catch errors
- [ ] Resources fetch data
- [ ] Suspense shows fallback

## 🎯 Coverage Goals

- **Line Coverage**: >90%
- **Branch Coverage**: >85%
- **Function Coverage**: 100%
- **No memory leaks**: All roots dispose cleanly

## 🚀 Final Steps

1. Run all tests: `npm test`
2. Check coverage: `npm run test:coverage`
3. Run memory profiler
4. Benchmark against baseline
5. Test in real application

---

## 🎉 Congratulations!

You've completed the migration! Your reactive system now has:

✅ Production-ready architecture
✅ Automatic memory management
✅ O(1) performance at scale
✅ Glitch-free updates
✅ Full TypeScript support
✅ Advanced features (transitions, resources, suspense)

**You're ready for production!** 🚀

---

**💡 Final Tip**: Keep testing as you add features. The best code is well-tested code!
