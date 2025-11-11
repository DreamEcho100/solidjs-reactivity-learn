# Unit 12: Advanced Patterns - Exercises

## Exercise 1: Reactive Form with Validation

Build a complete reactive form system with:
- Field-level validation
- Form-level validation
- Async validation
- Error messages
- Dirty/touched states
- Submit handling

```typescript
interface FieldConfig<T> {
  initialValue: T;
  validators?: Validator<T>[];
  asyncValidators?: AsyncValidator<T>[];
}

// Your implementation here
function createForm<T extends Record<string, any>>(
  config: { [K in keyof T]: FieldConfig<T[K]> }
) {
  // Implement form system
}

// Test it
const form = createForm({
  email: {
    initialValue: "",
    validators: [required, email],
    asyncValidators: [checkEmailAvailable]
  },
  password: {
    initialValue: "",
    validators: [required, minLength(8)]
  }
});
```

**Success Criteria:**
- All validations run reactively
- Async validations debounced
- No unnecessary re-validations
- Clean error messages
- Proper TypeScript types

---

## Exercise 2: Reactive Undo/Redo System

Implement time-travel debugging with:
- Unlimited undo/redo
- History navigation
- State snapshots
- Branching timelines

```typescript
function createHistory<T>(initialValue: T) {
  // Implement history system
  return {
    current: Accessor<T>,
    set: Setter<T>,
    undo: () => void,
    redo: () => void,
    canUndo: Accessor<boolean>,
    canRedo: Accessor<boolean>,
    history: Accessor<T[]>,
    jump: (index: number) => void
  };
}

// Test with complex state
const history = createHistory({ count: 0, name: "" });
history.set({ count: 1, name: "a" });
history.set({ count: 2, name: "b" });
history.undo(); // back to count: 1
history.redo(); // forward to count: 2
```

**Success Criteria:**
- History properly tracked
- Efficient memory usage
- No memory leaks
- Branching support

---

## Exercise 3: Reactive Query Builder

Create a fluent API for building queries:

```typescript
const users = createQuery()
  .from('users')
  .where('age', '>', 18)
  .where('active', '=', true)
  .orderBy('name', 'asc')
  .limit(10)
  .select('id', 'name', 'email');

// Should react to parameter changes
const [minAge, setMinAge] = createSignal(18);

const adults = createQuery()
  .from('users')
  .where('age', '>=', minAge)
  .select('*');

setMinAge(21); // Query automatically updates
```

**Success Criteria:**
- Fluent, chainable API
- Reactive parameters
- Type-safe
- Efficient re-querying

---

## Exercise 4: Reactive State Machine

Implement a finite state machine with reactivity:

```typescript
type TrafficLightStates = 'red' | 'yellow' | 'green';

const traffic = createStateMachine<TrafficLightStates>({
  initial: 'red',
  states: {
    red: {
      on: { TIMER: 'green' }
    },
    yellow: {
      on: { TIMER: 'red' }
    },
    green: {
      on: { TIMER: 'yellow' }
    }
  }
});

traffic.current(); // 'red'
traffic.send('TIMER'); // transitions to 'green'
traffic.can('TIMER'); // true/false
```

**Success Criteria:**
- Valid transitions only
- State history
- Guards and actions
- Reactive state changes

---

## Exercise 5: Reactive Middleware System

Build a middleware pipeline:

```typescript
const store = createStore({ count: 0 })
  .use(logger)
  .use(persistence)
  .use(devtools);

store.set('count', 5);
// Logs: "Setting count to 5"
// Saves to localStorage
// Updates devtools
```

**Success Criteria:**
- Composable middleware
- Async middleware support
- Error handling
- Clean API

---

## Exercise 6: Reactive Data Grid

Build a reactive data grid with:
- Virtual scrolling
- Sorting
- Filtering
- Column resizing
- Row selection

```typescript
const grid = createDataGrid({
  data: createSignal(largeDataset),
  columns: [
    { key: 'id', label: 'ID', sortable: true },
    { key: 'name', label: 'Name', filterable: true },
    { key: 'age', label: 'Age', sortable: true }
  ],
  virtualScroll: true
});
```

**Success Criteria:**
- Handles 100k+ rows
- 60fps scrolling
- Efficient re-renders
- Accessible

---

## Exercise 7: Reactive Animation System

Create an animation library:

```typescript
const box = { x: 0, y: 0 };

animate(box)
  .to({ x: 100, y: 100 }, { duration: 1000, easing: 'easeInOut' })
  .then(() => animate(box).to({ x: 0, y: 0 }));

// React to position changes
createEffect(() => {
  console.log(`Position: ${box.x}, ${box.y}`);
});
```

**Success Criteria:**
- Smooth 60fps animations
- Composable animations
- Reactive values
- Performance optimized

---

## Exercise 8: Reactive GraphQL Client

Build a GraphQL client with reactive caching:

```typescript
const { data, loading, error, refetch } = createQuery({
  query: gql`
    query GetUser($id: ID!) {
      user(id: $id) {
        id
        name
        email
      }
    }
  `,
  variables: { id: userId }
});

// Automatically refetches when userId changes
setUserId(2);
```

**Success Criteria:**
- Smart caching
- Reactive queries
- Optimistic updates
- Subscription support

---

## Bonus Challenges

1. **Reactive Physics Engine**: Collision detection with signals
2. **Reactive Audio Visualizer**: Real-time audio analysis
3. **Reactive Code Editor**: Syntax highlighting with reactivity
4. **Reactive Game of Life**: Conway's Game of Life with signals

---

## Evaluation Rubric

For each exercise, you should demonstrate:

- [ ] **Correctness**: Solution works as specified
- [ ] **Performance**: Efficient reactive updates
- [ ] **Type Safety**: Proper TypeScript types
- [ ] **Code Quality**: Clean, readable code
- [ ] **Testing**: Comprehensive test coverage
- [ ] **Documentation**: Clear usage examples
- [ ] **Edge Cases**: Handles errors and edge cases

---

## Resources

- Review Unit 1-11 for foundational concepts
- Solid.js source code for implementation patterns
- Real-world applications for inspiration
- Performance profiling tools

Good luck! 🚀
