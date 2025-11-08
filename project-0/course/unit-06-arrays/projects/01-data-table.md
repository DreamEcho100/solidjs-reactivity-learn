# Project: Advanced Data Table with Virtual Scrolling

## Overview

Build a production-ready data table component with sorting, filtering, column resizing, virtual scrolling, and export capabilities. This project synthesizes everything you've learned about array reactivity and list optimization.

## Learning Objectives

- ✅ Apply mapArray and indexArray appropriately
- ✅ Implement virtual scrolling for large datasets
- ✅ Optimize list performance
- ✅ Handle complex state management
- ✅ Build reusable, production-quality components

## Requirements

### Core Features

1. **Virtual Scrolling**
   - Handle 100,000+ rows smoothly
   - Maintain 60 FPS while scrolling
   - Support variable row heights
   - Efficient memory usage

2. **Sorting**
   - Click column headers to sort
   - Support ascending/descending
   - Multi-column sorting (with Shift+click)
   - Custom sort functions per column

3. **Filtering**
   - Global search across all columns
   - Per-column filters
   - Multiple filter types (text, number, date, select)
   - Debounced filter input

4. **Column Management**
   - Resizable columns
   - Reorderable columns (drag-and-drop)
   - Show/hide columns
   - Column width persistence

5. **Selection**
   - Single row selection
   - Multi-row selection (Shift+click, Ctrl+click)
   - Select all/none
   - Selection state persistence across filtering/sorting

6. **Export**
   - Export visible data to CSV
   - Export selected rows
   - Export all data (with confirmation for large sets)

### Bonus Features

7. **Pagination Option**
   - Toggle between virtual scrolling and pagination
   - Configurable page sizes
   - Page navigation

8. **Inline Editing**
   - Edit cells inline
   - Validation
   - Undo/redo

9. **Row Details**
   - Expandable rows
   - Nested data display

10. **Theming**
    - Light/dark mode
    - Custom color schemes
    - CSS variables for customization

## Starter Code

### Types

```typescript
// types.ts
export interface Column<T = any> {
  id: string;
  header: string;
  accessor: keyof T | ((row: T) => any);
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  sortable?: boolean;
  filterable?: boolean;
  filterType?: 'text' | 'number' | 'date' | 'select';
  filterOptions?: any[];
  render?: (value: any, row: T) => JSX.Element;
  sortFn?: (a: T, b: T) => number;
}

export interface DataTableProps<T = any> {
  data: T[];
  columns: Column<T>[];
  height?: number;
  rowHeight?: number | ((row: T) => number);
  virtualized?: boolean;
  selectable?: boolean;
  onSelectionChange?: (selected: T[]) => void;
  onRowClick?: (row: T, index: number) => void;
  keyExtractor?: (row: T) => string | number;
}

export interface SortState {
  columnId: string;
  direction: 'asc' | 'desc';
}

export interface FilterState {
  [columnId: string]: any;
}
```

### Component Structure

```typescript
// DataTable.tsx
import { createSignal, createMemo, For, Show } from 'solid-js';
import { createStore } from 'solid-js/store';

export function DataTable<T>(props: DataTableProps<T>) {
  // State
  const [sortState, setSortState] = createStore<SortState[]>([]);
  const [filterState, setFilterState] = createStore<FilterState>({});
  const [selectedRows, setSelectedRows] = createSignal<Set<string | number>>(
    new Set()
  );
  const [columnWidths, setColumnWidths] = createStore<Record<string, number>>(
    {}
  );
  
  // Processed data pipeline
  const filteredData = createMemo(() => {
    let result = props.data;
    
    // Apply filters
    for (const [columnId, filterValue] of Object.entries(filterState)) {
      if (!filterValue) continue;
      
      const column = props.columns.find(c => c.id === columnId);
      if (!column) continue;
      
      result = result.filter(row => {
        const value = typeof column.accessor === 'function'
          ? column.accessor(row)
          : row[column.accessor];
          
        return matchesFilter(value, filterValue, column.filterType);
      });
    }
    
    return result;
  });
  
  const sortedData = createMemo(() => {
    if (sortState.length === 0) return filteredData();
    
    return [...filteredData()].sort((a, b) => {
      for (const sort of sortState) {
        const column = props.columns.find(c => c.id === sort.columnId);
        if (!column) continue;
        
        const comparison = column.sortFn
          ? column.sortFn(a, b)
          : defaultSort(
              getColumnValue(a, column),
              getColumnValue(b, column)
            );
            
        if (comparison !== 0) {
          return sort.direction === 'asc' ? comparison : -comparison;
        }
      }
      return 0;
    });
  });
  
  // Render
  return (
    <div class="data-table">
      <TableHeader
        columns={props.columns}
        sortState={sortState}
        filterState={filterState}
        onSort={(columnId, multi) => handleSort(columnId, multi)}
        onFilter={(columnId, value) => 
          setFilterState(columnId, value)
        }
        columnWidths={columnWidths}
        onColumnResize={(columnId, width) =>
          setColumnWidths(columnId, width)
        }
      />
      
      <Show
        when={props.virtualized}
        fallback={
          <SimpleTableBody
            data={sortedData()}
            columns={props.columns}
            selectedRows={selectedRows()}
            onRowSelect={handleRowSelect}
          />
        }
      >
        <VirtualTableBody
          data={sortedData()}
          columns={props.columns}
          height={props.height ?? 600}
          rowHeight={props.rowHeight ?? 40}
          selectedRows={selectedRows()}
          onRowSelect={handleRowSelect}
        />
      </Show>
      
      <TableFooter
        totalRows={props.data.length}
        filteredRows={filteredData().length}
        selectedCount={selectedRows().size}
        onExport={() => exportData(sortedData())}
        onClearSelection={() => setSelectedRows(new Set())}
      />
    </div>
  );
}
```

## Implementation Tasks

### Task 1: Virtual Scrolling Engine

Implement a robust virtual scrolling system:

```typescript
// VirtualTableBody.tsx
function VirtualTableBody<T>(props: {
  data: T[];
  columns: Column<T>[];
  height: number;
  rowHeight: number | ((row: T) => number);
  selectedRows: Set<string | number>;
  onRowSelect: (rowKey: string | number, multi: boolean) => void;
}) {
  const [scrollTop, setScrollTop] = createSignal(0);
  
  // Calculate visible range
  const visibleRange = createMemo(() => {
    // TODO: Implement visible range calculation
    // Handle both fixed and variable heights
    // Add overscan
  });
  
  // Slice visible rows
  const visibleRows = createMemo(() => {
    // TODO: Return only visible rows
  });
  
  // Calculate total height and offset
  const totalHeight = createMemo(() => {
    // TODO: Calculate total scrollable height
  });
  
  const offsetY = createMemo(() => {
    // TODO: Calculate offset for positioning
  });
  
  return (
    <div
      class="table-body"
      style={{ height: `${props.height}px`, overflow: 'auto' }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: `${totalHeight()}px`, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: `${offsetY()}px`,
            left: 0,
            right: 0
          }}
        >
          {/* TODO: Render visible rows */}
        </div>
      </div>
    </div>
  );
}
```

**Hints**:
- Use binary search for variable heights
- Cache height measurements
- Implement overscan (render extra rows above/below)
- Optimize scroll event handling (debounce/throttle)

### Task 2: Column Resizing

```typescript
// ResizableColumn.tsx
function ResizableColumn(props: {
  width: number;
  minWidth?: number;
  maxWidth?: number;
  onResize: (width: number) => void;
  children: JSX.Element;
}) {
  let startX = 0;
  let startWidth = 0;
  
  const handleMouseDown = (e: MouseEvent) => {
    // TODO: Implement resize drag start
  };
  
  const handleMouseMove = (e: MouseEvent) => {
    // TODO: Implement resize drag
  };
  
  const handleMouseUp = () => {
    // TODO: Cleanup resize
  };
  
  return (
    <div
      class="resizable-column"
      style={{ width: `${props.width}px` }}
    >
      {props.children}
      <div
        class="resize-handle"
        onMouseDown={handleMouseDown}
      />
    </div>
  );
}
```

**Hints**:
- Use `createEffect` to setup/cleanup mouse listeners
- Constrain width to min/max
- Show visual feedback during resize
- Persist widths to localStorage

### Task 3: Multi-Column Sorting

```typescript
// Sorting logic
function handleSort(columnId: string, multi: boolean) {
  setSortState(prev => {
    if (!multi) {
      // Single column sort
      const existing = prev.find(s => s.columnId === columnId);
      if (existing) {
        // Toggle direction or remove
        return existing.direction === 'asc'
          ? [{ columnId, direction: 'desc' }]
          : [];
      }
      return [{ columnId, direction: 'asc' }];
    } else {
      // Multi-column sort (Shift+Click)
      const index = prev.findIndex(s => s.columnId === columnId);
      if (index >= 0) {
        // Toggle existing
        const newState = [...prev];
        if (newState[index].direction === 'asc') {
          newState[index] = { ...newState[index], direction: 'desc' };
        } else {
          newState.splice(index, 1);
        }
        return newState;
      } else {
        // Add new sort
        return [...prev, { columnId, direction: 'asc' }];
      }
    }
  });
}
```

### Task 4: Advanced Selection

```typescript
function handleRowSelect(
  rowKey: string | number,
  multi: boolean,
  range: boolean
) {
  if (range && lastSelectedIndex() !== -1) {
    // Shift+Click - select range
    const currentIndex = visibleRows().findIndex(
      r => getRowKey(r) === rowKey
    );
    const start = Math.min(lastSelectedIndex(), currentIndex);
    const end = Math.max(lastSelectedIndex(), currentIndex);
    
    const keysToSelect = visibleRows()
      .slice(start, end + 1)
      .map(getRowKey);
      
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      keysToSelect.forEach(k => newSet.add(k));
      return newSet;
    });
  } else if (multi) {
    // Ctrl+Click - toggle single
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(rowKey)) {
        newSet.delete(rowKey);
      } else {
        newSet.add(rowKey);
      }
      return newSet;
    });
  } else {
    // Single select
    setSelectedRows(new Set([rowKey]));
  }
  
  setLastSelectedIndex(currentIndex);
}
```

### Task 5: Export to CSV

```typescript
function exportData(data: any[], columns: Column[]) {
  // Build CSV
  const headers = columns.map(c => c.header).join(',');
  const rows = data.map(row =>
    columns
      .map(col => {
        const value = typeof col.accessor === 'function'
          ? col.accessor(row)
          : row[col.accessor];
        return escapeCsvValue(value);
      })
      .join(',')
  );
  
  const csv = [headers, ...rows].join('\n');
  
  // Download
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `export-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeCsvValue(value: any): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
```

## Testing Requirements

### Unit Tests

```typescript
describe('DataTable', () => {
  it('renders all rows in simple mode', () => {
    // Test
  });
  
  it('renders only visible rows in virtual mode', () => {
    // Test
  });
  
  it('sorts data correctly', () => {
    // Test single and multi-column sort
  });
  
  it('filters data correctly', () => {
    // Test different filter types
  });
  
  it('handles selection', () => {
    // Test single, multi, and range selection
  });
  
  it('exports correct CSV', () => {
    // Test export functionality
  });
});
```

### Performance Tests

```typescript
describe('DataTable Performance', () => {
  it('renders 100K rows in <100ms', () => {
    const data = generateRows(100000);
    const start = performance.now();
    render(() => <DataTable data={data} virtualized />);
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(100);
  });
  
  it('maintains 60 FPS while scrolling', () => {
    // Use performance.measure
  });
  
  it('uses <100MB for 100K rows', () => {
    // Check memory usage
  });
});
```

## Evaluation Criteria

### Functionality (40%)
- [ ] All core features implemented
- [ ] Features work correctly
- [ ] Edge cases handled
- [ ] No bugs in normal usage

### Performance (30%)
- [ ] Smooth scrolling (60 FPS)
- [ ] Fast initial render (<100ms for 10K rows)
- [ ] Efficient memory usage
- [ ] No memory leaks

### Code Quality (20%)
- [ ] Clean, readable code
- [ ] Proper TypeScript typing
- [ ] Good component structure
- [ ] Reusable components

### User Experience (10%)
- [ ] Intuitive interface
- [ ] Responsive to interactions
- [ ] Good visual feedback
- [ ] Accessible (keyboard nav, ARIA)

## Bonus Points

- [ ] Keyboard shortcuts
- [ ] Accessibility features
- [ ] Mobile responsive
- [ ] Inline editing
- [ ] Expandable rows
- [ ] Column groups
- [ ] Frozen columns
- [ ] Custom cell renderers
- [ ] Themes
- [ ] Save/load table state

## Deliverables

1. **Source Code**
   - All components
   - Tests
   - Documentation

2. **Demo**
   - Live demo with sample data
   - All features showcased
   - Performance metrics displayed

3. **Documentation**
   - API documentation
   - Usage examples
   - Performance tips
   - Architecture decisions

4. **Performance Report**
   - Benchmark results
   - Memory profiling
   - Comparison with alternatives

## Resources

- Solid.js array.ts source
- [TanStack Table](https://tanstack.com/table) (inspiration)
- [AG Grid](https://www.ag-grid.com/) (reference)
- [React Virtual](https://github.com/TanStack/virtual)

---

**Time Estimate**: 20-30 hours

**Difficulty**: ⭐⭐⭐⭐⭐

Good luck! This project will demonstrate mastery of array reactivity and list optimization in Solid.js! 🚀
