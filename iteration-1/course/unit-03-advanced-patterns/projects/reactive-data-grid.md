# Unit 3 Project: Build a Reactive Data Grid

## Project Overview

Build a high-performance data grid that demonstrates advanced reactive patterns. This project will test your understanding of selectors, deferred computations, conditional reactivity, and performance optimization.

## Learning Objectives

- Apply `createSelector` for efficient row selection
- Use deferred/debounced computations for filtering
- Implement conditional reactivity for dynamic features
- Optimize large dataset rendering
- Measure and improve performance

## Project Requirements

### Core Features

1. **Data Display**
   - Show data in a table format
   - Support 1000+ rows efficiently
   - Column headers with labels

2. **Row Selection**
   - Click to select/deselect rows
   - Multi-select with Ctrl/Cmd
   - Select all/none functionality
   - Efficient updates (only selected rows re-render)

3. **Sorting**
   - Click column headers to sort
   - Toggle ascending/descending
   - Multiple column sorting (optional)

4. **Filtering**
   - Text search across all columns
   - Debounced for performance
   - Column-specific filters

5. **Pagination**
   - Configurable page size
   - Page navigation
   - Show current page / total pages

6. **Virtual Scrolling** (Bonus)
   - Only render visible rows
   - Smooth scrolling
   - Dynamic row heights

## Starter Code

```typescript
// types.ts
export interface DataRow {
  id: string;
  name: string;
  email: string;
  age: number;
  city: string;
  country: string;
}

export interface GridConfig {
  pageSize: number;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
}

// data-grid.ts
import { createSignal, createMemo, createEffect, createSelector, batch } from "solid-js";
import type { DataRow, GridConfig } from "./types";

export function createDataGrid(initialData: DataRow[], initialConfig: GridConfig) {
  // State
  const [data] = createSignal(initialData);
  const [config, setConfig] = createSignal(initialConfig);
  const [searchQuery, setSearchQuery] = createSignal("");
  const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = createSignal(0);
  
  // TODO: Implement grid logic
  
  return {
    // Accessors
    data,
    config,
    searchQuery,
    selectedIds,
    currentPage,
    
    // Derived state
    filteredData: () => [],  // TODO
    sortedData: () => [],    // TODO
    paginatedData: () => [], // TODO
    totalPages: () => 0,     // TODO
    isSelected: (id: string) => false,  // TODO: Use createSelector
    
    // Actions
    setSearchQuery,
    setConfig,
    setCurrentPage,
    selectRow: (id: string) => {},       // TODO
    deselectRow: (id: string) => {},     // TODO
    toggleRow: (id: string) => {},       // TODO
    selectAll: () => {},                 // TODO
    deselectAll: () => {},               // TODO
    sort: (column: string) => {},        // TODO
  };
}
```

## Implementation Guide

### Step 1: Basic Data Grid (60 min)

```typescript
// 1. Implement filtering with debounce
const debouncedSearch = createDebouncedMemo(() => searchQuery(), 300);

const filteredData = createMemo(() => {
  const query = debouncedSearch().toLowerCase();
  if (!query) return data();
  
  return data().filter(row => 
    Object.values(row).some(value => 
      String(value).toLowerCase().includes(query)
    )
  );
});

// 2. Implement sorting
const sortedData = createMemo(() => {
  const cfg = config();
  const rows = filteredData();
  
  if (!cfg.sortBy) return rows;
  
  return [...rows].sort((a, b) => {
    const aVal = a[cfg.sortBy as keyof DataRow];
    const bVal = b[cfg.sortBy as keyof DataRow];
    
    const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return cfg.sortDirection === "desc" ? -comparison : comparison;
  });
});

// 3. Implement pagination
const paginatedData = createMemo(() => {
  const page = currentPage();
  const pageSize = config().pageSize;
  const sorted = sortedData();
  
  const start = page * pageSize;
  const end = start + pageSize;
  
  return sorted.slice(start, end);
});

const totalPages = createMemo(() => 
  Math.ceil(sortedData().length / config().pageSize)
);
```

### Step 2: Efficient Selection with createSelector (45 min)

```typescript
// Use createSelector for O(2) instead of O(n) updates
const isSelected = createSelector(
  () => selectedIds(),
  (ids, id: string) => ids.has(id)
);

function toggleRow(id: string) {
  setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  });
}

function selectAll() {
  setSelectedIds(new Set(paginatedData().map(row => row.id)));
}

function deselectAll() {
  setSelectedIds(new Set());
}

// Batch multi-select operations
function toggleMultiple(ids: string[]) {
  batch(() => {
    ids.forEach(id => toggleRow(id));
  });
}
```

### Step 3: Sorting with State Management (30 min)

```typescript
function sort(column: string) {
  setConfig(prev => {
    // Toggle direction if same column
    if (prev.sortBy === column) {
      return {
        ...prev,
        sortDirection: prev.sortDirection === "asc" ? "desc" : "asc"
      };
    }
    
    // New column, default to ascending
    return {
      ...prev,
      sortBy: column,
      sortDirection: "asc"
    };
  });
  
  // Reset to first page after sorting
  setCurrentPage(0);
}
```

### Step 4: Performance Monitoring (30 min)

```typescript
// Add performance tracking
function createPerformanceMonitor() {
  const [metrics, setMetrics] = createSignal({
    filterTime: 0,
    sortTime: 0,
    paginateTime: 0,
    renderTime: 0
  });
  
  function measure<T>(name: keyof typeof metrics, fn: () => T): T {
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    
    setMetrics(prev => ({
      ...prev,
      [name]: end - start
    }));
    
    return result;
  }
  
  return { metrics, measure };
}

const monitor = createPerformanceMonitor();

// Use in memos
const filteredData = createMemo(() => 
  monitor.measure("filterTime", () => {
    // ... filtering logic
  })
);

// Display metrics
createEffect(() => {
  console.log("Performance:", monitor.metrics());
});
```

### Step 5: Virtual Scrolling (Bonus - 90 min)

```typescript
function createVirtualGrid(
  data: Accessor<DataRow[]>,
  rowHeight: number,
  visibleHeight: number
) {
  const [scrollTop, setScrollTop] = createSignal(0);
  
  const visibleRange = createMemo(() => {
    const scroll = scrollTop();
    const start = Math.floor(scroll / rowHeight);
    const count = Math.ceil(visibleHeight / rowHeight);
    const end = start + count;
    
    return { start, end, count };
  });
  
  const visibleRows = createMemo(() => {
    const range = visibleRange();
    const rows = data();
    return rows.slice(range.start, range.end);
  });
  
  const totalHeight = createMemo(() => data().length * rowHeight);
  
  const offsetY = createMemo(() => visibleRange().start * rowHeight);
  
  return {
    visibleRows,
    totalHeight,
    offsetY,
    onScroll: (e: Event) => {
      setScrollTop((e.target as HTMLElement).scrollTop);
    }
  };
}
```

## Testing Requirements

### Unit Tests

```typescript
import { test, expect } from "vitest";
import { createDataGrid } from "./data-grid";

test("filtering works correctly", () => {
  const grid = createDataGrid(testData, { pageSize: 10 });
  
  grid.setSearchQuery("john");
  
  expect(grid.filteredData()).toHaveLength(5);
  expect(grid.filteredData().every(row => 
    row.name.toLowerCase().includes("john")
  )).toBe(true);
});

test("selection with createSelector is efficient", () => {
  const grid = createDataGrid(largeDataset, { pageSize: 50 });
  
  let renderCount = 0;
  createEffect(() => {
    grid.isSelected("id-1");
    renderCount++;
  });
  
  const initialCount = renderCount;
  
  // Select different row
  grid.selectRow("id-2");
  
  // Should only run once for id-1 (deselection check)
  expect(renderCount - initialCount).toBe(1);
});

test("sorting maintains selection", () => {
  const grid = createDataGrid(testData, { pageSize: 10 });
  
  grid.selectRow("id-1");
  grid.sort("name");
  
  expect(grid.selectedIds().has("id-1")).toBe(true);
});

test("pagination resets on filter change", () => {
  const grid = createDataGrid(testData, { pageSize: 10 });
  
  grid.setCurrentPage(2);
  expect(grid.currentPage()).toBe(2);
  
  grid.setSearchQuery("test");
  expect(grid.currentPage()).toBe(0);  // Should reset
});
```

### Performance Benchmarks

```typescript
import { bench } from "vitest";

bench("filter 1000 rows", () => {
  const grid = createDataGrid(generate1000Rows(), { pageSize: 50 });
  grid.setSearchQuery("test");
  grid.filteredData();
});

bench("sort 1000 rows", () => {
  const grid = createDataGrid(generate1000Rows(), { pageSize: 50 });
  grid.sort("name");
  grid.sortedData();
});

bench("select 100 rows", () => {
  const grid = createDataGrid(generate1000Rows(), { pageSize: 50 });
  for (let i = 0; i < 100; i++) {
    grid.selectRow(`id-${i}`);
  }
});
```

**Performance Targets:**
- Filter 1000 rows: < 5ms
- Sort 1000 rows: < 10ms
- Select 100 rows: < 20ms
- Total render: < 50ms

## UI Requirements (Optional)

If you want to build a UI:

```typescript
// Simple table rendering
function DataGridTable() {
  const grid = createDataGrid(data, { pageSize: 20 });
  
  return (
    <div class="data-grid">
      {/* Search */}
      <input 
        value={grid.searchQuery()}
        onInput={(e) => grid.setSearchQuery(e.target.value)}
        placeholder="Search..."
      />
      
      {/* Stats */}
      <div class="stats">
        Showing {grid.paginatedData().length} of {grid.filteredData().length} rows
        ({grid.selectedIds().size} selected)
      </div>
      
      {/* Table */}
      <table>
        <thead>
          <tr>
            <th>
              <input 
                type="checkbox"
                checked={grid.selectedIds().size === grid.paginatedData().length}
                onChange={grid.selectAll}
              />
            </th>
            <th onClick={() => grid.sort("name")}>Name</th>
            <th onClick={() => grid.sort("email")}>Email</th>
            <th onClick={() => grid.sort("age")}>Age</th>
          </tr>
        </thead>
        <tbody>
          <For each={grid.paginatedData()}>
            {row => (
              <tr class={grid.isSelected(row.id) ? "selected" : ""}>
                <td>
                  <input 
                    type="checkbox"
                    checked={grid.isSelected(row.id)}
                    onChange={() => grid.toggleRow(row.id)}
                  />
                </td>
                <td>{row.name}</td>
                <td>{row.email}</td>
                <td>{row.age}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      
      {/* Pagination */}
      <div class="pagination">
        <button 
          disabled={grid.currentPage() === 0}
          onClick={() => grid.setCurrentPage(p => p - 1)}
        >
          Previous
        </button>
        
        <span>
          Page {grid.currentPage() + 1} of {grid.totalPages()}
        </span>
        
        <button 
          disabled={grid.currentPage() === grid.totalPages() - 1}
          onClick={() => grid.setCurrentPage(p => p + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

## Evaluation Criteria

### Functionality (40%)
- [ ] All core features implemented
- [ ] Correct behavior with edge cases
- [ ] Proper error handling

### Performance (30%)
- [ ] Efficient row selection (uses createSelector)
- [ ] Debounced search
- [ ] Meets performance targets
- [ ] Batched updates where appropriate

### Code Quality (20%)
- [ ] Clean, readable code
- [ ] Proper TypeScript types
- [ ] Good separation of concerns
- [ ] Comments for complex logic

### Testing (10%)
- [ ] Unit tests for core logic
- [ ] Performance benchmarks
- [ ] Edge case coverage

## Bonus Challenges

1. **Column Visibility**: Toggle columns on/off
2. **Column Resize**: Draggable column widths
3. **Row Reordering**: Drag-and-drop rows
4. **Export**: Export to CSV/JSON
5. **Inline Editing**: Edit cells directly
6. **Keyboard Navigation**: Arrow keys, Enter, Escape
7. **Accessibility**: ARIA labels, screen reader support

## Submission

Submit your project with:
- Source code
- README with setup instructions
- Performance benchmark results
- Screenshots/demo (if UI included)
- Reflection on challenges and learnings

## Resources

- [createSelector docs](https://docs.solidjs.com/references/api-reference/reactive-utilities/createSelector)
- [Performance guide](https://docs.solidjs.com/guides/how-to-guides/performance/optimize-javascript)
- [Virtual scrolling](https://github.com/solidjs/solid-virtual)

Good luck building your reactive data grid!
