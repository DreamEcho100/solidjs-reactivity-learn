# Optimization Checklist

## Pre-Optimization

### Before You Start

- [ ] **Profile first** - Measure before optimizing
- [ ] **Set targets** - Define what "fast enough" means
- [ ] **Identify bottlenecks** - Find the actual slow parts
- [ ] **Document baseline** - Record current performance

### Tools Setup

- [ ] Browser DevTools configured
- [ ] Performance profiler ready
- [ ] Memory profiler available
- [ ] Benchmarking suite prepared

## Memory Optimization

### Leak Prevention

- [ ] All `createRoot` calls have matching `dispose()`
- [ ] Event listeners cleaned up with `onCleanup()`
- [ ] Timers cleared in cleanup functions
- [ ] External subscriptions unsubscribed
- [ ] No circular references in effects

### Memory Patterns

- [ ] Use `WeakMap` for metadata
- [ ] Implement LRU caches for bounded collections
- [ ] Object pooling for frequently created objects
- [ ] Lazy initialization for expensive resources
- [ ] Structural sharing for immutable updates

### Testing

- [ ] Memory leak tests pass
- [ ] Heap snapshots before/after show no growth
- [ ] Long-running stress tests complete
- [ ] Browser memory usage stable over time

## Performance Optimization

### Signal Optimization

- [ ] **Remove unused signals** - Clean up dead code
- [ ] **Combine related signals** - Reduce overhead
- [ ] **Use memos for expensive computations**
- [ ] **Avoid unnecessary signal reads**
- [ ] **Batch related updates**

```javascript
// ❌ Bad
const [firstName, setFirstName] = createSignal('');
const [lastName, setLastName] = createSignal('');
const [middleName, setMiddleName] = createSignal('');

setFirstName('John');
setMiddleName('Q');
setLastName('Doe');
// 3 separate updates

// ✅ Good
const [name, setName] = createSignal({ first: '', middle: '', last: '' });

setName({ first: 'John', middle: 'Q', last: 'Doe' });
// 1 update
```

### Effect Optimization

- [ ] **Minimize effect count** - Combine when possible
- [ ] **Use `untrack()` strategically** - Avoid unnecessary dependencies
- [ ] **Debounce high-frequency updates**
- [ ] **Use `on()` for explicit dependencies**
- [ ] **Avoid effects in loops**

```javascript
// ❌ Bad
items().forEach(item => {
  createEffect(() => {
    console.log(item);
  });
});

// ✅ Good
createEffect(() => {
  items().forEach(item => {
    console.log(item);
  });
});
```

### Computation Optimization

- [ ] **Flatten deep computation chains**
- [ ] **Use `createSelector()` for lists**
- [ ] **Cache expensive operations with memos**
- [ ] **Reduce computation depth**
- [ ] **Strategic untracking**

```javascript
// ❌ Bad - deep chain
const a = createMemo(() => signal() * 2);
const b = createMemo(() => a() + 1);
const c = createMemo(() => b() * 3);
const d = createMemo(() => c() - 5);

// ✅ Good - flattened
const result = createMemo(() => {
  const base = signal();
  return ((base * 2 + 1) * 3 - 5);
});
```

### List Optimization

- [ ] **Use `For` for referentially stable items**
- [ ] **Use `Index` for value-based reconciliation**
- [ ] **Implement virtual scrolling for large lists**
- [ ] **Use `createSelector()` for selections**
- [ ] **Key-based reconciliation where appropriate**

```javascript
// ✅ For large lists
<For each={items()}>
  {(item) => <Item data={item} />}
</For>

// ✅ With selection
const isSelected = createSelector(selectedId);

<For each={items()}>
  {(item) => <Item data={item} selected={isSelected(item.id)} />}
</For>
```

### Rendering Optimization

- [ ] **Code splitting** - Lazy load routes
- [ ] **Suspense boundaries** - Split expensive components
- [ ] **Progressive enhancement** - Show quick, enhance later
- [ ] **Windowing** - Virtual lists for large data
- [ ] **Image optimization** - Lazy load, responsive images

## Build Optimization

### Bundle Size

- [ ] **Tree shaking enabled**
- [ ] **Dead code eliminated**
- [ ] **Code splitting configured**
- [ ] **Dependencies analyzed**
- [ ] **Bundle size within budget**

```javascript
// vite.config.js
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['solid-js'],
          router: ['@solidjs/router']
        }
      }
    }
  }
};
```

### Asset Optimization

- [ ] Images compressed
- [ ] Fonts subset and optimized
- [ ] CSS purged
- [ ] SVGs optimized
- [ ] Compression enabled (gzip/brotli)

### Source Maps

- [ ] Source maps generated for production
- [ ] Source maps uploaded to error tracking
- [ ] Debug symbols preserved

## Runtime Optimization

### Initial Load

- [ ] **Critical CSS inlined**
- [ ] **Resource hints** - preload, prefetch
- [ ] **Service worker** - cache assets
- [ ] **CDN configured**
- [ ] **Compression enabled**

### Hydration

- [ ] **Progressive hydration** if applicable
- [ ] **Selective hydration** for interactive parts
- [ ] **Hydration errors handled**

### Caching

- [ ] **Browser caching** - Set proper headers
- [ ] **API caching** - Cache responses
- [ ] **Memo caching** - Cache computations
- [ ] **Asset caching** - Long-term cache static assets

## Development Tools

### Profiling

- [ ] Performance profiler implemented
- [ ] Memory profiler available
- [ ] Update tracker working
- [ ] Benchmark suite ready

### Debugging

- [ ] DevTools integration
- [ ] Graph visualization
- [ ] Source maps working
- [ ] Error tracking configured

### Monitoring

- [ ] Performance monitoring active
- [ ] Error tracking enabled
- [ ] Analytics configured
- [ ] Alerts set up

## Testing

### Performance Tests

- [ ] Benchmark tests pass
- [ ] Performance regressions caught
- [ ] Load time within targets
- [ ] Memory usage acceptable

### Stress Tests

- [ ] Large data sets handled
- [ ] High-frequency updates work
- [ ] Long-running stability verified
- [ ] Memory leaks absent

## Production Checklist

### Pre-Deployment

- [ ] All tests passing
- [ ] Performance targets met
- [ ] Bundle size acceptable
- [ ] Lighthouse score > 90
- [ ] Accessibility verified

### Deployment

- [ ] CI/CD pipeline configured
- [ ] Zero-downtime deployment
- [ ] Rollback plan ready
- [ ] Health checks configured
- [ ] Monitoring active

### Post-Deployment

- [ ] Metrics being collected
- [ ] Errors being tracked
- [ ] Performance monitored
- [ ] User feedback collected
- [ ] Team notified

## Common Pitfalls

### ❌ Avoid

1. **Premature optimization** - Profile first!
2. **Over-memoization** - Don't memo everything
3. **Deep effect nesting** - Flatten when possible
4. **Excessive signals** - Combine related state
5. **Missing cleanup** - Always clean up resources
6. **Unbounded collections** - Use LRU caches
7. **Blocking operations** - Make async when possible
8. **Unnecessary tracking** - Use `untrack()` wisely

### ✅ Do

1. **Measure before optimizing**
2. **Set performance budgets**
3. **Profile regularly**
4. **Test with realistic data**
5. **Monitor production**
6. **Document optimizations**
7. **Review periodically**
8. **Keep it simple**

## Performance Budgets

### Metrics Targets

```
Time to First Byte (TTFB):     < 200ms
First Contentful Paint (FCP):  < 1.0s
Largest Contentful Paint (LCP):< 2.5s
Time to Interactive (TTI):     < 3.5s
Cumulative Layout Shift (CLS): < 0.1
First Input Delay (FID):       < 100ms
```

### Size Budgets

```
Initial JavaScript:  < 100KB (gzipped)
Total JavaScript:    < 300KB (gzipped)
CSS:                 < 30KB (gzipped)
Images:              Lazy loaded
Fonts:               < 50KB
Total Page Size:     < 500KB
```

### Update Budgets

```
Signal update:       < 1ms
Effect execution:    < 5ms
Render:              < 16ms (60fps)
Interaction:         < 50ms
```

## Quick Reference

### Optimization Priority

1. **Eliminate unnecessary work** (highest impact)
2. **Batch related updates**
3. **Memoize expensive computations**
4. **Optimize critical paths**
5. **Reduce bundle size**
6. **Improve caching**
7. **Fine-tune details** (lowest impact)

### When to Optimize

- ✅ After profiling shows bottleneck
- ✅ When performance targets not met
- ✅ When users report slowness
- ✅ Before production deployment
- ❌ During initial development
- ❌ Without measuring first
- ❌ For micro-optimizations

### Optimization Tools

| Tool | Purpose |
|------|---------|
| Chrome DevTools | Profiling, debugging |
| Lighthouse | Performance audit |
| webpack-bundle-analyzer | Bundle analysis |
| React DevTools Profiler | Component profiling |
| Memory profiler | Leak detection |
| Benchmark suite | Performance testing |

## Summary

**Remember:**
1. **Profile first** - Always measure
2. **Optimize what matters** - Focus on bottlenecks
3. **Test thoroughly** - Verify improvements
4. **Monitor continuously** - Track production
5. **Document everything** - Help future you

**The best optimization is the code you don't write.**
