# When to Use mapArray vs indexArray

## Quick Decision Guide

```
                    START
                      |
                      v
        Does item have internal state?
                    /   \
                  YES    NO
                  /        \
                 v          v
  Items reorder    mapArray   <-- Simple, efficient
  frequently?               for primitives
      /   \
    YES    NO
    /        \
   v          v
indexArray  mapArray
```

## Detailed Comparison

### mapArray (For Component)

**Reconciles by**: Position/Index  
**Best for**: Content changes, simple data, primitives  
**Behavior**: Reuses DOM nodes, updates content

#### Use Cases ✅

1. **Primitives and Simple Data**
```typescript
// ✅ Perfect - just displaying values
<For each={numbers()}>
  {num => <div>{num * 2}</div>}
</For>

// ✅ Good - simple objects, no state
<For each={users()}>
  {user => <div>{user.name} - {user.email}</div>}
</For>
```

2. **Filtered/Sorted Lists**
```typescript
// ✅ Great - content changes frequently
<For each={todos().filter(t => !t.done)}>
  {todo => <TodoItem todo={todo} />}
</For>

// ✅ Good - sorted views
<For each={items().sort((a, b) => a.price - b.price)}>
  {item => <ProductCard item={item} />}
</For>
```

3. **Append/Prepend Heavy**
```typescript
// ✅ Optimal - only creates new items at end
<For each={logMessages()}>
  {msg => <div class="log">{msg.text}</div>}
</For>
```

4. **Static Display**
```typescript
// ✅ Fine - display only, no interaction
<For each={tags()}>
  {tag => <span class="tag">{tag}</span>}
</For>
```

#### Avoid When ❌

1. **Components with Internal State**
```typescript
// ❌ Bad - expanded state lost on reorder
<For each={items()}>
  {item => {
    const [expanded, setExpanded] = createSignal(false);
    return () => (
      <div>
        <button onClick={() => setExpanded(!expanded())}>
          Toggle
        </button>
        {expanded() && <Details item={item} />}
      </div>
    );
  }}
</For>
```

2. **Frequent Reordering**
```typescript
// ❌ Inefficient - recreates on every drag
<For each={sortableItems()}>
  {item => <DraggableItem item={item} />}
</For>
```

3. **Expensive Component Setup**
```typescript
// ❌ Bad - setup runs on reorder
<For each={videos()}>
  {video => {
    const player = createVideoPlayer(video);  // Expensive!
    onCleanup(() => player.dispose());
    return () => <div ref={player.element} />;
  }}
</For>
```

### indexArray (Index Component)

**Reconciles by**: Value/Reference  
**Best for**: Component identity, expensive setup, reordering  
**Behavior**: Keeps components, moves DOM

#### Use Cases ✅

1. **Stateful Components**
```typescript
// ✅ Perfect - state persists across reorder
<Index each={items()}>
  {(item) => {
    const [selected, setSelected] = createSignal(false);
    return () => (
      <div 
        class={selected() ? 'selected' : ''}
        onClick={() => setSelected(!selected())}
      >
        {item().name}
      </div>
    );
  }}
</Index>
```

2. **Expensive Setup/Teardown**
```typescript
// ✅ Optimal - setup once per item
<Index each={complexItems()}>
  {(item) => {
    const connection = createWebSocket(item().id);
    const chart = createChart(item().data);
    
    onCleanup(() => {
      connection.close();
      chart.destroy();
    });
    
    return () => <ChartView chart={chart} />;
  }}
</Index>
```

3. **Drag-and-Drop/Sortable**
```typescript
// ✅ Great - components move, don't recreate
<Index each={sortableItems()}>
  {(item, index) => (
    <Draggable
      item={item()}
      onDragEnd={(newIndex) => reorder(index, newIndex)}
    />
  )}
</Index>
```

4. **Form Inputs**
```typescript
// ✅ Perfect - inputs keep focus and state
<Index each={formFields()}>
  {(field) => (
    <input
      type="text"
      value={field().value}
      onInput={(e) => updateField(field().id, e.target.value)}
    />
  )}
</Index>
```

5. **Animations/Transitions**
```typescript
// ✅ Good - elements animate position changes
<Index each={animatedItems()}>
  {(item) => (
    <AnimatedCard
      style={{
        transition: 'transform 0.3s',
        transform: `translateY(${item().y}px)`
      }}
    >
      {item().content}
    </AnimatedCard>
  )}
</Index>
```

#### Avoid When ❌

1. **Simple Primitives**
```typescript
// ❌ Overkill - mapArray is simpler
<Index each={[1, 2, 3, 4, 5]}>
  {(num) => <div>{num()}</div>}
</Index>

// ✅ Better
<For each={[1, 2, 3, 4, 5]}>
  {num => <div>{num}</div>}
</For>
```

2. **Content Changes More Than Order**
```typescript
// ❌ Unnecessary overhead
<Index each={searchResults()}>
  {(result) => <div>{result().title}</div>}
</Index>

// ✅ More efficient
<For each={searchResults()}>
  {result => <div>{result.title}</div>}
</For>
```

## Performance Characteristics

### mapArray Performance

| Operation | Performance | Why |
|-----------|-------------|-----|
| **Append** | ⚡ Excellent | Only creates new items |
| **Prepend** | 🐢 Poor | Updates all items |
| **Reorder** | 🐢 Poor | Updates all content |
| **Filter** | ⚡ Good | Reuses positions |
| **Sort** | 🐢 Poor | Updates all content |
| **Update one** | ⚡ Excellent | Only that item |

### indexArray Performance

| Operation | Performance | Why |
|-----------|-------------|-----|
| **Append** | ⚡ Excellent | Only creates new items |
| **Prepend** | 🐢 Poor | Updates all signals |
| **Reorder** | ⚡ Good | Just updates signals |
| **Filter** | 🐢 Medium | Updates signals |
| **Sort** | ⚡ Good | Updates signals |
| **Update one** | ⚡ Excellent | Updates one signal |

## Memory Considerations

### mapArray Memory

```typescript
// Base memory
items: T[]              // Your data
mapped: U[]             // Mapped results
disposers: Function[]   // Cleanup functions

// If using index signals
indexes: Setter[]       // One signal per item
```

**Total**: ~3-4 arrays + optional index signals

### indexArray Memory

```typescript
// Base memory
items: T[]              // Your data
mapped: U[]             // Mapped results
disposers: Function[]   // Cleanup functions
signals: Setter[]       // Always one signal per item
```

**Total**: ~4 arrays (always has signals)

**Verdict**: Roughly equal, indexArray slightly more

## Common Patterns

### Pattern 1: Display List

```typescript
// ✅ Use mapArray
<For each={products()}>
  {product => (
    <div class="product">
      <img src={product.image} alt={product.name} />
      <h3>{product.name}</h3>
      <p>${product.price}</p>
      <button onClick={() => addToCart(product)}>
        Add to Cart
      </button>
    </div>
  )}
</For>
```

**Why**: No internal state, just display and simple actions

### Pattern 2: Todo List with Selection

```typescript
// ✅ Use indexArray
<Index each={todos()}>
  {(todo) => {
    const [selected, setSelected] = createSignal(false);
    
    return () => (
      <div
        class={selected() ? 'selected' : ''}
        onClick={() => setSelected(!selected())}
      >
        <input
          type="checkbox"
          checked={todo().done}
          onChange={() => toggleTodo(todo().id)}
        />
        {todo().text}
      </div>
    );
  }}
</Index>
```

**Why**: Has internal state (selected) that should persist

### Pattern 3: Filtered View

```typescript
// ✅ Use mapArray
const visibleTodos = createMemo(() =>
  todos().filter(t => filter() === 'all' || 
                      (filter() === 'active' && !t.done) ||
                      (filter() === 'done' && t.done))
);

<For each={visibleTodos()}>
  {todo => <TodoItem todo={todo} />}
</For>
```

**Why**: Content changes frequently, no persistent state needed

### Pattern 4: Editable Form Fields

```typescript
// ✅ Use indexArray
<Index each={formFields()}>
  {(field, index) => (
    <input
      type="text"
      value={field().value}
      onInput={(e) => updateField(index, e.target.value)}
      placeholder={field().placeholder}
    />
  )}
</Index>
```

**Why**: Inputs should maintain focus across reorders

### Pattern 5: Virtual Scrolling

```typescript
// ✅ Use mapArray (usually)
const visibleItems = createMemo(() => {
  const start = Math.floor(scrollTop() / itemHeight);
  const end = start + Math.ceil(height / itemHeight);
  return items().slice(start, end);
});

<For each={visibleItems()}>
  {item => <div style={{ height: `${itemHeight}px` }}>{item}</div>}
</For>
```

**Why**: Items constantly enter/leave viewport, position-based is efficient

## Edge Cases

### Both Work, Different Tradeoffs

**Case**: Large sortable list

```typescript
// Option A: mapArray
// - Reorder: Updates all content (slow)
// - Filter: Very fast
<For each={sortedItems()}>
  {item => <ItemView item={item} />}
</For>

// Option B: indexArray  
// - Reorder: Just updates signals (fast)
// - Filter: Updates signals (medium)
<Index each={sortedItems()}>
  {(item) => () => <ItemView item={item()} />}
</Index>
```

**Decision**: If sorting happens more often than filtering, use indexArray

### Hybrid Approach

Sometimes you need both:

```typescript
// Main list: indexArray (preserve state)
<Index each={items()}>
  {(item) => {
    const [expanded, setExpanded] = createSignal(false);
    
    // Nested list: mapArray (simple display)
    return () => (
      <div>
        <h3 onClick={() => setExpanded(!expanded())}>
          {item().title}
        </h3>
        {expanded() && (
          <For each={item().children}>
            {child => <div>{child}</div>}
          </For>
        )}
      </div>
    );
  }}
</Index>
```

## Decision Tree

```
Q1: Do items have internal component state?
    YES → indexArray
    NO  → Q2

Q2: Are items reordered frequently?
    YES → indexArray
    NO  → Q3

Q3: Is component setup expensive (websockets, charts, etc)?
    YES → indexArray
    NO  → Q4

Q4: Are items just for display?
    YES → mapArray
    NO  → Q5

Q5: Do components need to maintain focus/selection?
    YES → indexArray
    NO  → mapArray (default)
```

## Summary Table

| Criteria | mapArray | indexArray |
|----------|----------|------------|
| **Primitives** | ✅ Perfect | ❌ Overkill |
| **Display only** | ✅ Great | ⚠️ OK but wasteful |
| **Filtering** | ✅ Excellent | ⚠️ OK |
| **Sorting** | ❌ Poor | ✅ Good |
| **Reordering** | ❌ Poor | ✅ Excellent |
| **Internal state** | ❌ Lost | ✅ Preserved |
| **Expensive setup** | ❌ Reruns | ✅ Once |
| **Form inputs** | ❌ Loses focus | ✅ Keeps focus |
| **Memory** | ⚡ Slightly less | ⚡ Slightly more |

## Rule of Thumb

**When in doubt, start with `mapArray`** - it's simpler and often sufficient.

**Upgrade to `indexArray`** when you notice:
- State being lost on reorders
- Expensive setup running too often
- Need to preserve focus/selection
- Drag-and-drop feeling janky

---

## Quiz Yourself

Given each scenario, which would you use?

1. A list of blog post titles
2. A drag-and-drop kanban board
3. A chat message list (append only)
4. A filterable product catalog
5. A video player playlist
6. A table with expandable rows
7. A list of tags (clickable, no state)
8. A form with dynamic field list

<details>
<summary>Answers</summary>

1. **mapArray** - Display only
2. **indexArray** - Frequent reordering
3. **mapArray** - Append only, simple
4. **mapArray** - Filtering common
5. **indexArray** - Expensive setup (video players)
6. **indexArray** - Internal state (expanded)
7. **mapArray** - No state, simple
8. **indexArray** - Form inputs, focus preservation
</details>
