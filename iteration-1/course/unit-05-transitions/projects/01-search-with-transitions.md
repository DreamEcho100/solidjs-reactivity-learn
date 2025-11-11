# Project 1: Search with Transitions

## Overview

Build a search interface that demonstrates instant user input feedback combined with deferred, non-blocking search results using transitions.

## Objectives

- ✅ Instant input updates
- ✅ Debounced search with transitions
- ✅ Loading indicators
- ✅ Race condition handling
- ✅ Error recovery

## Requirements

### Functional Requirements

1. **Search Input**
   - Updates immediately on keystroke
   - No lag or delay
   - Visual feedback on focus

2. **Search Results**
   - Fetched in transition
   - Old results visible while loading
   - Smooth updates without flicker

3. **Loading State**
   - Show pending indicator
   - Dim old results while loading
   - Debounce to prevent flicker

4. **Error Handling**
   - Show error message on failure
   - Provide retry mechanism
   - Maintain last valid results

5. **Performance**
   - Debounce API calls (300ms)
   - Cancel outdated requests
   - Handle rapid typing

## Starter Code

```javascript
import { createSignal, For, Show } from 'solid-js';
import { useTransition } from './transition';

function SearchApp() {
  const [query, setQuery] = createSignal('');
  const [results, setResults] = createSignal([]);
  const [error, setError] = createSignal(null);
  const [isPending, start] = useTransition();
  
  // TODO: Implement search logic
  function handleSearch(value) {
    // Update input immediately
    // Debounce search
    // Use transition for results
  }
  
  // TODO: Implement API call
  async function searchAPI(query, signal) {
    // Make API call with abort signal
    // Handle errors
  }
  
  return (
    <div class="search-app">
      {/* TODO: Implement UI */}
    </div>
  );
}
```

## Implementation Steps

### Step 1: Basic Input

```javascript
const [query, setQuery] = createSignal('');

function handleInput(e) {
  setQuery(e.target.value);
}

return (
  <input
    type="text"
    value={query()}
    onInput={handleInput}
    placeholder="Search..."
  />
);
```

### Step 2: Debounced Search

```javascript
let debounceTimeout;

function handleSearch(value) {
  setQuery(value);
  
  clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(() => {
    performSearch(value);
  }, 300);
}

onCleanup(() => clearTimeout(debounceTimeout));
```

### Step 3: Transition Integration

```javascript
const [isPending, start] = useTransition();

function performSearch(value) {
  if (!value.trim()) {
    setResults([]);
    return;
  }
  
  start(async () => {
    try {
      const data = await searchAPI(value);
      setResults(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  });
}
```

### Step 4: Request Cancellation

```javascript
let abortController = null;

async function searchAPI(query, signal) {
  const response = await fetch(
    `/api/search?q=${encodeURIComponent(query)}`,
    { signal }
  );
  
  if (!response.ok) {
    throw new Error('Search failed');
  }
  
  return response.json();
}

function performSearch(value) {
  // Cancel previous
  if (abortController) {
    abortController.abort();
  }
  
  abortController = new AbortController();
  
  start(async () => {
    try {
      const data = await searchAPI(value, abortController.signal);
      setResults(data);
      setError(null);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
      }
    }
  });
}
```

### Step 5: Complete UI

```javascript
return (
  <div class="search-app">
    <div class="search-header">
      <input
        type="text"
        class="search-input"
        value={query()}
        onInput={e => handleSearch(e.target.value)}
        placeholder="Search..."
      />
      
      {isPending() && (
        <span class="spinner">⏳</span>
      )}
    </div>
    
    <Show when={error()}>
      <div class="error">
        {error()}
        <button onClick={() => performSearch(query())}>
          Retry
        </button>
      </div>
    </Show>
    
    <div 
      class="results"
      classList={{ dimmed: isPending() }}
    >
      <div class="count">
        {results().length} results
      </div>
      
      <For each={results()}>
        {result => (
          <div class="result-item">
            <h3>{result.title}</h3>
            <p>{result.description}</p>
          </div>
        )}
      </For>
    </div>
  </div>
);
```

## Styling

```css
.search-app {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.search-header {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 20px;
}

.search-input {
  flex: 1;
  padding: 12px;
  font-size: 16px;
  border: 2px solid #ddd;
  border-radius: 8px;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: #4CAF50;
}

.spinner {
  font-size: 24px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.error {
  background: #ffebee;
  color: #c62828;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.error button {
  background: #c62828;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
}

.results {
  transition: opacity 0.2s;
}

.results.dimmed {
  opacity: 0.6;
  pointer-events: none;
}

.count {
  color: #666;
  margin-bottom: 16px;
  font-size: 14px;
}

.result-item {
  padding: 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-bottom: 12px;
  transition: transform 0.2s;
}

.result-item:hover {
  transform: translateX(4px);
  border-color: #4CAF50;
}

.result-item h3 {
  margin: 0 0 8px 0;
  color: #333;
}

.result-item p {
  margin: 0;
  color: #666;
  font-size: 14px;
}
```

## Mock API for Testing

```javascript
// Mock API that simulates network delay and search
async function mockSearchAPI(query, signal) {
  // Simulate network delay
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, 500);
    
    signal?.addEventListener('abort', () => {
      clearTimeout(timeout);
      reject(new Error('Aborted'));
    });
  });
  
  // Mock data
  const allResults = [
    { id: 1, title: 'Introduction to Signals', description: 'Learn the basics of reactive signals' },
    { id: 2, title: 'Advanced Patterns', description: 'Master advanced signal patterns' },
    { id: 3, title: 'Transitions Guide', description: 'Understanding concurrent rendering' },
    { id: 4, title: 'Performance Tips', description: 'Optimize your reactive code' },
    { id: 5, title: 'Signal Debugging', description: 'Debug reactive systems effectively' },
    { id: 6, title: 'Context API', description: 'Learn context patterns' },
    { id: 7, title: 'Resource Management', description: 'Handle async data' },
    { id: 8, title: 'Testing Strategies', description: 'Test reactive components' },
  ];
  
  // Filter results
  return allResults.filter(result =>
    result.title.toLowerCase().includes(query.toLowerCase()) ||
    result.description.toLowerCase().includes(query.toLowerCase())
  );
}
```

## Enhancement Ideas

1. **Highlighting**: Highlight matched text in results
2. **History**: Show recent searches
3. **Suggestions**: Auto-complete suggestions
4. **Pagination**: Load more results
5. **Filters**: Add category filters
6. **Sorting**: Sort results by relevance
7. **Keyboard Navigation**: Arrow keys to navigate results
8. **Empty State**: Show message when no results

## Testing Checklist

- [ ] Input updates instantly
- [ ] Search is debounced (300ms)
- [ ] Old results visible while loading
- [ ] Loading indicator shows during search
- [ ] Outdated requests are cancelled
- [ ] Errors are handled gracefully
- [ ] Retry button works
- [ ] Rapid typing doesn't cause issues
- [ ] Empty query clears results

## Success Criteria

- Input never feels laggy
- Search results update smoothly
- No race conditions
- Errors are user-friendly
- Performance is excellent (60fps)

## Deliverables

1. Working search component
2. Styled UI
3. Error handling
4. Tests (optional)
5. README with usage

## Learning Outcomes

After completing this project, you'll understand:
- How to keep UI responsive with transitions
- Debouncing techniques
- Race condition prevention
- Request cancellation with AbortController
- Error recovery patterns
- Loading state management

## Next Steps

After completing this project:
1. Add unit tests
2. Integrate with real API
3. Add advanced features (filters, sorting)
4. Optimize for mobile
5. Add accessibility features (ARIA labels, keyboard nav)
