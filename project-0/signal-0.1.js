/** @param {() => void} fn  */
function createRenderEffect(fn) {
  /** @type {Computation<any>} */
  const computation = {
    fn,
    state: FRESH,
    sources: [],
    sourceSlots: [],
    cleanups: null,
    observers: [],
    observerSlots: [],
    owner: Owner,
    pure: false,
    user: false,
  };

  if (Owner) {
    if (!Owner.owned) Owner.owned = [];
    Owner.owned.push(computation);
  }

  // Add to render queue
  if (ExecCount) {
    Updates.push(computation);
  } else {
    runTop(computation);
  }

  return computation;
}

/*
const [count, setCount] = createSignal(0);

createComputed(() => {
  console.log('1. Computed runs synchronously');
});

createRenderEffect(() => {
  console.log('2. Render effect runs during render');
});

createEffect(() => {
  console.log('3. Effect runs after render (microtask)');
});

setCount(1);

// Output order:
// 1. Computed runs synchronously
// 2. Render effect runs during render
// 3. Effect runs after render (microtask)
*/

/**
 *
 * @param {*} deps
 * @param {*} fn
 * @param {*} options
 *
 * @example
 *
 * ```js
 * // Usage
 * const [a, setA] = createSignal(1);
 * const [b, setB] = createSignal(2);
 *
 * createEffect(
 *   on(a, (value) => {
 *     // Only re-runs when 'a' changes
 *     // Can read 'b' without tracking it
 *     console.log('A:', value, 'B:', b());
 *   })
 * );
 * ```
 */
function on(deps, fn, options = {}) {
  const defer = options.defer;

  return (prev) => {
    // Only track dependencies
    const values = Array.isArray(deps) ? deps.map((d) => d()) : [deps()];

    // Execute function without tracking
    if (defer && prev === undefined) {
      return undefined;
    }

    return untrack(() => fn(values, prev));
  };
}
/*
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
*/

/**
 *
 * @param {*} source
 * @param {*} fn
 *
 * @example
 *
 * ```js
 * // Usage
 * const [selected, setSelected] = createSignal(1);
 * const [items, setItems] = createSignal([1, 2, 3, 4, 5]);
 *
 * const isSelected = createSelector(selected, (k, s) => k === s);
 *
 * createEffect(() => {
 *   items().forEach(item => {
 *     // Only re-runs for the selected item
 *     if (isSelected(item)) {
 *       console.log('Selected:', item);
 *     }
 *   });
 * });
 * ```
 */
function createSelector(source, fn) {
  const map = new Map();

  return (key) => {
    // Track source
    const s = source();

    // Don't track individual reads
    return untrack(() => {
      if (!map.has(key)) {
        const memo = createMemo(() => fn(key, s));
        map.set(key, memo);
      }
      return map.get(key)();
    });
  };
}
/*
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
*/

/**
 *
 * @param {*} fn
 *
 * @example
 *
 * ```js
 * // Usage
 * const [expensive, setExpensive] = createSignal(() => {
 *   console.log('Computing...');
 *   return veryExpensiveCalculation();
 * });
 *
 * const lazyValue = lazy(expensive);
 *
 * createEffect(() => {
 *   // Only computes when accessed
 *   if (someCondition()) {
 *     console.log(lazyValue());
 *   }
 * });
 * ```
 */
function lazy(fn) {
  let cached;
  let hasValue = false;

  return () => {
    if (!hasValue) {
      cached = untrack(fn);
      hasValue = true;
    }
    return cached;
  };
}

/**
 *
 * @param {*} fn
 * @param {*} delay
 *
 * @example
 *
 * ```js
 * // Usage
 * const [search, setSearch] = createSignal('');
 *
 * createDebouncedEffect(() => search(), 300);
 * ```
 */
function createDebouncedEffect(fn, delay) {
  let timeoutId;
  let pendingArgs;

  createEffect(() => {
    // Track dependencies immediately
    const args = fn();

    clearTimeout(timeoutId);

    // Execute after delay without re-tracking
    timeoutId = setTimeout(() => {
      untrack(() => {
        // Use captured args
        console.log("Debounced:", args);
      });
    }, delay);
  });
}

/**
 *
 * @param {*} items
 * @param {*} processFn
 * @param {*} chunkSize
 *
 * @example
 *
 * ```js
 * // Usage
 * const [items, setItems] = createSignal(Array(10000).fill(0));
 * const { result, progress } = createChunkedComputation(
 *   items,
 *   (item, index) => ({ value: item * 2, index }),
 *   500
 * );
 * ```
 */
function createChunkedComputation(items, processFn, chunkSize = 100) {
  const [progress, setProgress] = createSignal(0);
  const [result, setResult] = createSignal([]);

  createEffect(() => {
    const itemList = items();
    const chunks = [];

    // Split into chunks
    for (let i = 0; i < itemList.length; i += chunkSize) {
      chunks.push(itemList.slice(i, i + chunkSize));
    }

    let processed = [];
    let currentChunk = 0;

    function processChunk() {
      if (currentChunk >= chunks.length) {
        setResult(processed);
        setProgress(100);
        return;
      }

      requestIdleCallback((deadline) => {
        // Process while we have time
        while (currentChunk < chunks.length && deadline.timeRemaining() > 10) {
          const chunk = chunks[currentChunk];
          const chunkResult = chunk.map(processFn);
          processed.push(...chunkResult);
          currentChunk++;
          setProgress((currentChunk / chunks.length) * 100);
        }

        // Schedule next chunk
        if (currentChunk < chunks.length) {
          processChunk();
        } else {
          setResult(processed);
        }
      });
    }

    processChunk();
  });

  return { result, progress };
}

/**
 *
 * @param {*} fn
 *
 * @example
 *
 * ```js
 * // Usage
 * const [data, setData] = createSignal(bigData);
 *
 * const processed = createIdleComputation(() => {
 *   return expensiveProcess(data());
 * });
 * ```
 */
function createIdleComputation(fn) {
  const [result, setResult] = createSignal();
  let scheduled = false;

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;

    requestIdleCallback((deadline) => {
      scheduled = false;

      if (deadline.timeRemaining() > 5) {
        const value = fn();
        setResult(value);
      } else {
        // Reschedule if not enough time
        schedule();
      }
    });
  };

  createEffect(() => {
    // Track dependencies
    schedule();
  });

  return result;
}

/**
 *
 * @param {*} source
 * @param {*} delay
 * @param {*} options
 *
 * @example
 *
 * ```js
 * // Usage: Search input
 * const [search, setSearch] = createSignal('');
 * const debouncedSearch = createDebounced(search, 300);
 *
 * createEffect(() => {
 *   // Only runs after user stops typing for 300ms
 *   fetchResults(debouncedSearch());
 * });
 * ```
 */
function createDebounced(source, delay, options = {}) {
  const [debounced, setDebounced] = createSignal(source());
  const leading = options.leading ?? false;
  const trailing = options.trailing ?? true;

  let timeoutId;
  let lastCallTime = 0;

  createEffect(() => {
    const value = source();
    const now = Date.now();

    const shouldCallLeading = leading && now - lastCallTime > delay;

    if (shouldCallLeading) {
      setDebounced(value);
      lastCallTime = now;
    }

    if (trailing) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setDebounced(value);
        lastCallTime = Date.now();
      }, delay);
    }
  });

  onCleanup(() => clearTimeout(timeoutId));

  return debounced;
}

/**
 *
 * @param {*} source
 * @param {*} delay
 *
 * @example
 * ```js
 * // Usage: Scroll position
 * const [scrollY, setScrollY] = createSignal(0);
 * const throttledScrollY = createThrottled(scrollY, 100);
 *
 * window.addEventListener('scroll', () => {
 *   setScrollY(window.scrollY);
 * });
 *
 * createEffect(() => {
 *   // Updates max once per 100ms
 *   updateScrollIndicator(throttledScrollY());
 * });```
 */
function createThrottled(source, delay) {
  const [throttled, setThrottled] = createSignal(source());
  let lastRun = 0;
  let timeoutId;

  createEffect(() => {
    const value = source();
    const now = Date.now();

    if (now - lastRun >= delay) {
      // Run immediately
      setThrottled(value);
      lastRun = now;
    } else {
      // Schedule for later
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setThrottled(value);
        lastRun = Date.now();
      }, delay - (now - lastRun));
    }
  });

  onCleanup(() => clearTimeout(timeoutId));

  return throttled;
}
