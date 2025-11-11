# Project 1: Reactive Spreadsheet Engine

## Overview

Build a fully functional spreadsheet application powered by fine-grained reactivity. This project demonstrates how reactive programming excels at handling complex dependency graphs and automatic recalculation.

## Learning Objectives

- Master complex reactive dependency graphs
- Handle circular reference detection
- Implement formula parsing and evaluation
- Build efficient grid rendering
- Manage large-scale reactive state

## Features to Implement

### Core Functionality

1. **Cell System**
   - Basic cell values (numbers, strings)
   - Formula cells (=A1+B2)
   - Cell references
   - Range references (SUM(A1:A10))

2. **Formula Engine**
   - Parser for Excel-like formulas
   - Built-in functions (SUM, AVERAGE, IF, etc.)
   - Reactive recalculation
   - Error handling

3. **Dependency Tracking**
   - Automatic dependency graph
   - Circular reference detection
   - Efficient update propagation
   - Minimal recalculation

4. **UI Components**
   - Grid view with virtual scrolling
   - Formula bar
   - Cell selection
   - Keyboard navigation

## Architecture

### Cell Store

```typescript
interface Cell {
  id: string;
  row: number;
  col: number;
  value: string | number | null;
  formula: string | null;
  computed: Accessor<any>;
  error: Accessor<Error | null>;
  dependencies: Set<string>;
  dependents: Set<string>;
}

class SpreadsheetStore {
  private cells = new Map<string, Cell>();
  private [row, col]: [number, number] = [26, 100]; // 26 cols, 100 rows
  
  getCell(row: number, col: number): Cell;
  setCell(row: number, col: number, value: string): void;
  getFormula(row: number, col: number): string | null;
  computeCell(cell: Cell): Accessor<any>;
  detectCircular(cellId: string, visited: Set<string>): boolean;
}
```

### Formula Parser

```typescript
interface ASTNode {
  type: 'number' | 'string' | 'reference' | 'range' | 'function' | 'binary' | 'unary';
  value?: any;
  operator?: string;
  left?: ASTNode;
  right?: ASTNode;
  args?: ASTNode[];
}

class FormulaParser {
  parse(formula: string): ASTNode;
  tokenize(formula: string): Token[];
}

class FormulaEvaluator {
  constructor(private store: SpreadsheetStore) {}
  
  evaluate(ast: ASTNode): Accessor<any> {
    switch (ast.type) {
      case 'number':
        return () => ast.value;
      
      case 'reference':
        const [row, col] = this.parseReference(ast.value);
        return this.store.getCell(row, col).computed;
      
      case 'range':
        return this.evaluateRange(ast);
      
      case 'function':
        return this.evaluateFunction(ast);
      
      case 'binary':
        return this.evaluateBinary(ast);
    }
  }
  
  evaluateFunction(ast: ASTNode): Accessor<any> {
    const name = ast.value.toUpperCase();
    const args = ast.args!.map(arg => this.evaluate(arg));
    
    return createMemo(() => {
      const values = args.map(a => a());
      return FUNCTIONS[name](values);
    });
  }
}
```

### Built-in Functions

```typescript
const FUNCTIONS = {
  SUM: (values: number[]) => values.reduce((a, b) => a + b, 0),
  
  AVERAGE: (values: number[]) => {
    const sum = FUNCTIONS.SUM(values);
    return sum / values.length;
  },
  
  IF: (condition: boolean, ifTrue: any, ifFalse: any) => 
    condition ? ifTrue : ifFalse,
  
  MAX: (values: number[]) => Math.max(...values),
  
  MIN: (values: number[]) => Math.min(...values),
  
  COUNT: (values: any[]) => values.filter(v => v != null).length,
  
  COUNTIF: (values: any[], condition: (v: any) => boolean) =>
    values.filter(condition).length,
};
```

### Grid Component

```typescript
function SpreadsheetGrid(props: {
  rows: number;
  cols: number;
  store: SpreadsheetStore;
}) {
  const [selectedCell, setSelectedCell] = createSignal<[number, number] | null>(null);
  const [viewport, setViewport] = createSignal({ startRow: 0, endRow: 20 });
  
  // Virtual scrolling
  const visibleCells = createMemo(() => {
    const { startRow, endRow } = viewport();
    const cells = [];
    
    for (let row = startRow; row < endRow; row++) {
      for (let col = 0; col < props.cols; col++) {
        cells.push(props.store.getCell(row, col));
      }
    }
    
    return cells;
  });
  
  return (
    <div class="spreadsheet-grid" onScroll={handleScroll}>
      <For each={visibleCells()}>
        {cell => (
          <Cell
            cell={cell}
            selected={selectedCell()?.[0] === cell.row && selectedCell()?.[1] === cell.col}
            onSelect={() => setSelectedCell([cell.row, cell.col])}
          />
        )}
      </For>
    </div>
  );
}

function Cell(props: {
  cell: Cell;
  selected: boolean;
  onSelect: () => void;
}) {
  const [editing, setEditing] = createSignal(false);
  
  return (
    <div
      class="cell"
      classList={{ selected: props.selected, editing: editing() }}
      onClick={props.onSelect}
      onDblClick={() => setEditing(true)}
    >
      <Show
        when={editing()}
        fallback={
          <div class="cell-display">
            {props.cell.computed()}
          </div>
        }
      >
        <input
          value={props.cell.formula || props.cell.value || ''}
          onBlur={(e) => {
            props.cell.setFormula(e.currentTarget.value);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
        />
      </Show>
    </div>
  );
}
```

### Circular Reference Detection

```typescript
function detectCircularReference(
  cellId: string,
  dependencies: Map<string, Set<string>>,
  visited: Set<string> = new Set(),
  stack: Set<string> = new Set()
): string[] | null {
  if (stack.has(cellId)) {
    // Found cycle
    return Array.from(stack);
  }
  
  if (visited.has(cellId)) {
    return null;
  }
  
  visited.add(cellId);
  stack.add(cellId);
  
  const deps = dependencies.get(cellId);
  if (deps) {
    for (const dep of deps) {
      const cycle = detectCircularReference(dep, dependencies, visited, stack);
      if (cycle) return cycle;
    }
  }
  
  stack.delete(cellId);
  return null;
}
```

## Implementation Steps

### Phase 1: Basic Grid (Week 1)
- [ ] Create cell storage
- [ ] Build grid UI
- [ ] Implement cell selection
- [ ] Add keyboard navigation

### Phase 2: Formula Engine (Week 2)
- [ ] Implement formula parser
- [ ] Build expression evaluator
- [ ] Add basic functions
- [ ] Handle references

### Phase 3: Reactivity (Week 3)
- [ ] Connect formulas to reactive system
- [ ] Implement dependency tracking
- [ ] Add circular reference detection
- [ ] Optimize recalculation

### Phase 4: Advanced Features (Week 4)
- [ ] Virtual scrolling
- [ ] Range selection
- [ ] Copy/paste
- [ ] Undo/redo
- [ ] Export to CSV

## Testing Strategy

### Unit Tests

```typescript
describe('Formula Parser', () => {
  test('parses simple formula', () => {
    const ast = parser.parse('=A1+B2');
    expect(ast.type).toBe('binary');
    expect(ast.operator).toBe('+');
  });
  
  test('parses function', () => {
    const ast = parser.parse('=SUM(A1:A10)');
    expect(ast.type).toBe('function');
    expect(ast.value).toBe('SUM');
  });
});

describe('Circular Reference', () => {
  test('detects simple cycle', () => {
    const store = new SpreadsheetStore();
    store.setCell(0, 0, '=B1');
    store.setCell(1, 0, '=A1');
    
    expect(store.getCell(0, 0).error()).toMatch(/circular/i);
  });
});
```

### Integration Tests

```typescript
describe('Spreadsheet Integration', () => {
  test('calculates dependent cells', () => {
    const store = new SpreadsheetStore();
    
    store.setCell(0, 0, '10');
    store.setCell(1, 0, '20');
    store.setCell(2, 0, '=A1+B1');
    
    expect(store.getCell(2, 0).computed()).toBe(30);
    
    store.setCell(0, 0, '15');
    expect(store.getCell(2, 0).computed()).toBe(35);
  });
});
```

## Performance Targets

- [ ] Handle 10,000+ cells
- [ ] 60fps scrolling
- [ ] < 16ms update time for formula changes
- [ ] < 100ms for complex recalculations

## Advanced Challenges

1. **Chart Integration**: Visualize cell data reactively
2. **Collaborative Editing**: Multi-user with CRDT
3. **Plugins**: Extensible function library
4. **Import/Export**: Excel file format support
5. **Custom Formatting**: Number, date, currency formats

## Success Criteria

- [ ] All core features working
- [ ] No circular reference crashes
- [ ] Efficient updates (only affected cells recalculate)
- [ ] Clean, maintainable code
- [ ] Comprehensive test coverage
- [ ] Good UX (responsive, keyboard shortcuts)

## Resources

- Excel formula reference
- CSV parsing libraries
- Virtual scrolling techniques
- Graph algorithms for cycle detection

## Bonus Features

- Named ranges
- Multiple sheets
- Conditional formatting
- Data validation
- Pivot tables (ambitious!)

---

Good luck building your reactive spreadsheet! This project will solidify your understanding of complex reactive dependency management. 📊
