# Unit 2 Project: Build a Reactive Todo Application

## Project Overview

Build a fully functional todo application using only the core reactive primitives you've learned in Unit 2. This project will demonstrate your understanding of signals, effects, memos, and lifecycle management.

## Learning Objectives

By completing this project, you will:
- Create and manage multiple signals for application state
- Use memos to derive computed state efficiently
- Implement effects for side effects (persistence, logging)
- Handle cleanup properly with `onCleanup`
- Apply batching for performance
- Use untracking strategically

## Project Requirements

### Core Features

1. **Add Todos**
   - Input field for new todo text
   - Add button (or Enter key)
   - Auto-clear input after adding

2. **Display Todos**
   - List all todos
   - Show completion status
   - Display creation timestamp

3. **Toggle Completion**
   - Click to mark complete/incomplete
   - Visual distinction for completed todos

4. **Delete Todos**
   - Remove individual todos
   - Confirm before deleting

5. **Filter Todos**
   - Show all, active, or completed
   - Update counts automatically

6. **Persistence**
   - Save to localStorage automatically
   - Load on startup
   - Debounce saves for performance

7. **Statistics**
   - Total todo count
   - Active count
   - Completed count
   - Completion percentage

## Starter Code

```typescript
// types.ts
export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
}

export type FilterMode = "all" | "active" | "completed";

// main.ts
import { createSignal, createMemo, createEffect, batch, onCleanup } from "solid-js";
import type { Todo, FilterMode } from "./types";

// TODO: Implement the reactive todo application

// 1. State Management
const [todos, setTodos] = createSignal<Todo[]>([]);
const [filter, setFilter] = createSignal<FilterMode>("all");
const [input, setInput] = createSignal("");

// 2. Derived State (Memos)
const filteredTodos = createMemo(() => {
  // TODO: Filter todos based on current filter mode
});

const stats = createMemo(() => {
  // TODO: Calculate statistics
  return {
    total: 0,
    active: 0,
    completed: 0,
    percentage: 0
  };
});

// 3. Actions
function addTodo() {
  // TODO: Add a new todo
}

function toggleTodo(id: string) {
  // TODO: Toggle todo completion status
}

function deleteTodo(id: string) {
  // TODO: Delete a todo
}

function clearCompleted() {
  // TODO: Remove all completed todos
}

// 4. Persistence
createEffect(() => {
  // TODO: Save todos to localStorage
  // Hint: Use debouncing for performance
});

// 5. Load initial data
function loadTodos() {
  // TODO: Load from localStorage on startup
}

// 6. Logging (for development)
if (import.meta.env.DEV) {
  createEffect(() => {
    console.log("Todos updated:", todos());
    console.log("Stats:", stats());
  });
}
```

## Implementation Guide

### Step 1: Basic Signal Management (30 min)

Implement the core signal structure:

```typescript
const [todos, setTodos] = createSignal<Todo[]>([
  {
    id: "1",
    text: "Learn SolidJS reactivity",
    completed: false,
    createdAt: Date.now()
  }
]);

const [input, setInput] = createSignal("");
const [filter, setFilter] = createSignal<FilterMode>("all");
```

**Test:** Can you read and update these signals?

### Step 2: Implement Actions (45 min)

```typescript
function addTodo() {
  const text = input().trim();
  if (!text) return;
  
  const newTodo: Todo = {
    id: crypto.randomUUID(),
    text,
    completed: false,
    createdAt: Date.now()
  };
  
  batch(() => {
    setTodos(prev => [...prev, newTodo]);
    setInput(""); // Clear input
  });
}

function toggleTodo(id: string) {
  setTodos(todos =>
    todos.map(todo =>
      todo.id === id
        ? { ...todo, completed: !todo.completed }
        : todo
    )
  );
}

function deleteTodo(id: string) {
  setTodos(todos => todos.filter(t => t.id !== id));
}

function clearCompleted() {
  setTodos(todos => todos.filter(t => !t.completed));
}
```

**Test:** Do the actions modify state correctly?

### Step 3: Derived State with Memos (30 min)

```typescript
const filteredTodos = createMemo(() => {
  const mode = filter();
  const todoList = todos();
  
  switch (mode) {
    case "active":
      return todoList.filter(t => !t.completed);
    case "completed":
      return todoList.filter(t => t.completed);
    default:
      return todoList;
  }
});

const stats = createMemo(() => {
  const todoList = todos();
  const total = todoList.length;
  const completed = todoList.filter(t => t.completed).length;
  const active = total - completed;
  const percentage = total === 0 ? 0 : (completed / total) * 100;
  
  return { total, active, completed, percentage };
});
```

**Test:** Do the memos update when dependencies change?

### Step 4: LocalStorage Persistence (45 min)

```typescript
const STORAGE_KEY = "solid-todos";

// Load on startup
function loadTodos() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      setTodos(parsed);
    }
  } catch (error) {
    console.error("Failed to load todos:", error);
  }
}

// Save with debouncing
function createDebouncedEffect(fn: () => void, delay: number) {
  let timeoutId: number;
  
  createEffect(() => {
    clearTimeout(timeoutId);
    
    // Run the effect to track dependencies
    fn();
    
    // Debounce the actual save
    timeoutId = setTimeout(() => {
      // Re-run to get latest values
      const result = fn();
      // Save here
    }, delay);
    
    onCleanup(() => clearTimeout(timeoutId));
  });
}

createDebouncedEffect(() => {
  const todoList = todos();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todoList));
    console.log("Saved", todoList.length, "todos");
  } catch (error) {
    console.error("Failed to save todos:", error);
  }
}, 500); // 500ms debounce

// Initialize
loadTodos();
```

**Test:** Do todos persist across page refreshes?

### Step 5: UI Integration (Optional - if using DOM)

```typescript
// Simple DOM rendering (or use your preferred UI library)

function render() {
  const app = document.getElementById("app")!;
  
  createEffect(() => {
    const filtered = filteredTodos();
    const currentStats = stats();
    
    app.innerHTML = `
      <div class="todo-app">
        <h1>Reactive Todos</h1>
        
        <div class="stats">
          <p>Total: ${currentStats.total}</p>
          <p>Active: ${currentStats.active}</p>
          <p>Completed: ${currentStats.completed}</p>
          <p>Progress: ${currentStats.percentage.toFixed(0)}%</p>
        </div>
        
        <div class="input">
          <input 
            id="todo-input" 
            value="${input()}" 
            placeholder="What needs to be done?"
          />
          <button id="add-btn">Add</button>
        </div>
        
        <div class="filters">
          <button class="${filter() === 'all' ? 'active' : ''}" data-filter="all">
            All
          </button>
          <button class="${filter() === 'active' ? 'active' : ''}" data-filter="active">
            Active
          </button>
          <button class="${filter() === 'completed' ? 'active' : ''}" data-filter="completed">
            Completed
          </button>
        </div>
        
        <ul class="todo-list">
          ${filtered.map(todo => `
            <li class="${todo.completed ? 'completed' : ''}">
              <input 
                type="checkbox" 
                ${todo.completed ? 'checked' : ''}
                data-toggle="${todo.id}"
              />
              <span>${todo.text}</span>
              <button data-delete="${todo.id}">Delete</button>
            </li>
          `).join('')}
        </ul>
        
        ${currentStats.completed > 0 ? `
          <button id="clear-completed">Clear Completed</button>
        ` : ''}
      </div>
    `;
    
    // Add event listeners
    setupEventListeners();
  });
}

function setupEventListeners() {
  // Input
  document.getElementById("todo-input")?.addEventListener("input", (e) => {
    setInput((e.target as HTMLInputElement).value);
  });
  
  // Add button
  document.getElementById("add-btn")?.addEventListener("click", addTodo);
  
  // Enter key
  document.getElementById("todo-input")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") addTodo();
  });
  
  // Filters
  document.querySelectorAll("[data-filter]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const mode = (e.target as HTMLElement).dataset.filter as FilterMode;
      setFilter(mode);
    });
  });
  
  // Toggle
  document.querySelectorAll("[data-toggle]").forEach(cb => {
    cb.addEventListener("change", (e) => {
      const id = (e.target as HTMLElement).dataset.toggle!;
      toggleTodo(id);
    });
  });
  
  // Delete
  document.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = (e.target as HTMLElement).dataset.delete!;
      if (confirm("Delete this todo?")) {
        deleteTodo(id);
      }
    });
  });
  
  // Clear completed
  document.getElementById("clear-completed")?.addEventListener("click", () => {
    if (confirm("Clear all completed todos?")) {
      clearCompleted();
    }
  });
}

render();
```

## Testing Checklist

- [ ] Can add new todos
- [ ] Can toggle todo completion
- [ ] Can delete todos
- [ ] Can filter todos (all/active/completed)
- [ ] Stats update automatically
- [ ] Todos persist in localStorage
- [ ] Input clears after adding
- [ ] Can clear all completed todos
- [ ] Debouncing works (check console logs)
- [ ] No memory leaks (effects clean up properly)

## Performance Challenges

### Challenge 1: Optimize Large Lists

Add 1000 todos and ensure the app remains responsive:

```typescript
function addManyTodos(count: number) {
  batch(() => {
    const newTodos = Array.from({ length: count }, (_, i) => ({
      id: crypto.randomUUID(),
      text: `Todo ${i + 1}`,
      completed: Math.random() > 0.5,
      createdAt: Date.now()
    }));
    
    setTodos(prev => [...prev, ...newTodos]);
  });
}

// Test
addManyTodos(1000);
```

**Goal:** App should still be responsive when filtering and toggling.

### Challenge 2: Minimize Effect Runs

Track how many times effects run:

```typescript
let saveCount = 0;
let renderCount = 0;

createEffect(() => {
  todos();
  saveCount++;
  console.log("Save effect ran:", saveCount);
});

createEffect(() => {
  filteredTodos();
  renderCount++;
  console.log("Render effect ran:", renderCount);
});
```

**Goal:** Minimize unnecessary effect runs.

### Challenge 3: Batch Related Updates

Ensure that related state changes are batched:

```typescript
function addMultipleTodos(texts: string[]) {
  batch(() => {
    texts.forEach(text => {
      // Each add should not trigger effects individually
      addTodo(text);
    });
  });
}
```

## Bonus Features

1. **Undo/Redo**
   - Track history of todo states
   - Implement undo/redo actions

2. **Due Dates**
   - Add due dates to todos
   - Filter by due date
   - Highlight overdue todos

3. **Tags/Categories**
   - Add tags to todos
   - Filter by tags
   - Color-code by category

4. **Search**
   - Search todos by text
   - Highlight matching text

5. **Bulk Operations**
   - Select multiple todos
   - Bulk complete/delete

6. **Export/Import**
   - Export todos as JSON
   - Import todos from file

## Evaluation Criteria

### Correctness (40%)
- [ ] All features work as specified
- [ ] No bugs or errors in console
- [ ] Edge cases handled (empty state, etc.)

### Reactivity (30%)
- [ ] Proper use of signals, effects, and memos
- [ ] Dependencies tracked correctly
- [ ] No unnecessary re-computations

### Performance (20%)
- [ ] Batching used appropriately
- [ ] Debouncing implemented for persistence
- [ ] Handles large datasets well

### Code Quality (10%)
- [ ] Clean, readable code
- [ ] Proper TypeScript types
- [ ] Good naming conventions
- [ ] Comments where needed

## Submission

1. Create a repository with your code
2. Include a README with:
   - Setup instructions
   - Features implemented
   - Performance optimizations applied
   - Any challenges faced
3. Deploy to GitHub Pages, Vercel, or similar (optional)

## Example Solution Structure

```
project/
├── src/
│   ├── types.ts           # Type definitions
│   ├── store.ts           # Reactive state
│   ├── actions.ts         # State mutations
│   ├── persistence.ts     # LocalStorage logic
│   ├── components/        # UI components (if using framework)
│   └── main.ts            # Entry point
├── index.html
├── package.json
└── README.md
```

## Resources

- [SolidJS Documentation](https://docs.solidjs.com)
- [Unit 2 Lessons](/course/unit-02-core-primitives/lessons/)
- [Unit 2 Exercises](/course/unit-02-core-primitives/exercises/)

Good luck! This project will solidify your understanding of Solid's core reactive primitives.
