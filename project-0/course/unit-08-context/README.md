# Unit 8: Context and Component Patterns

## Overview

Implement Solid.js's context system and learn component-level reactive patterns. Master props, children, and error boundaries.

## Learning Objectives

- ✅ Build createContext system
- ✅ Implement component reactivity
- ✅ Master error boundaries
- ✅ Handle props as signals
- ✅ Optimize component patterns

## Time Commitment

**1.5 weeks** | **10-14 hours**

## Lessons

### Lesson 1: Context System (3-4 hours)
- Symbol-based context identification
- Context providers and consumers
- Context inheritance
- Performance considerations
- Multiple contexts

```javascript
const Context = createContext<T>(defaultValue);

<Context.Provider value={value}>
  {children}
</Context.Provider>
```

### Lesson 2: Component Reactivity (3-4 hours)
- Props as signals vs. plain objects
- children() helper
- Reactive refs pattern
- Component lifecycle
- Cleanup in components

### Lesson 3: Error Boundaries (2-3 hours)
- catchError implementation
- onError (deprecated)
- Error propagation
- Recovery patterns
- Development vs production

### Lesson 4: Advanced Component Patterns (3-4 hours)
- Render props
- Higher-order components
- Component composition
- Slot patterns
- Dynamic components

## Exercises

1. **Implement createContext** (⭐⭐⭐⭐) - Full context system
2. **Component Library** (⭐⭐⭐⭐) - Reusable components
3. **Error Boundary** (⭐⭐⭐) - Handle errors gracefully
4. **Advanced Patterns** (⭐⭐⭐⭐) - Composition patterns

## Projects

- **UI Component Library** - Full component set
- **Theme System** - Context-based theming
- **Form Framework** - Composable form components

## Key Concepts

### Context Pattern
```javascript
const ThemeContext = createContext('light');

export function ThemeProvider(props) {
  const [theme, setTheme] = createSignal('light');
  
  return (
    <ThemeContext.Provider value={[theme, setTheme]}>
      {props.children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
```

### Props Reactivity
```javascript
// Props are not signals by default
function Component(props) {
  // ❌ Won't react to prop changes
  const value = props.value;
  
  // ✅ Will react to prop changes
  createEffect(() => {
    console.log(props.value);
  });
}
```

### Error Boundary
```javascript
function App() {
  return (
    <ErrorBoundary fallback={err => <div>Error: {err.message}</div>}>
      <MightThrow />
    </ErrorBoundary>
  );
}
```

### children() Helper
```javascript
function Parent(props) {
  const resolved = children(() => props.children);
  
  createEffect(() => {
    // resolved() returns actual DOM nodes
    console.log(resolved());
  });
  
  return <div>{resolved()}</div>;
}
```

**Files:**
- `lessons/lesson-01-context-system.md`
- `lessons/lesson-02-component-reactivity.md`
- `lessons/lesson-03-error-boundaries.md`
- `lessons/lesson-04-advanced-patterns.md`
- `exercises/01-context-implementation.md`
- `notes/component-best-practices.md`
- `notes/performance-tips.md`
