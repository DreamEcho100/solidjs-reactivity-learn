# Lesson 4: Advanced Component Patterns

## Introduction

This lesson covers advanced patterns for building scalable, composable, and reusable components in Solid.js. These patterns leverage Solid's reactivity model to create flexible component APIs.

## Render Props Pattern

### Basic Render Prop

The render prop pattern passes a function as a child that returns JSX based on provided data.

```javascript
function MouseTracker(props) {
  const [position, setPosition] = createSignal({ x: 0, y: 0 });
  
  const handleMouseMove = (e) => {
    setPosition({ x: e.clientX, y: e.clientY });
  };
  
  return (
    <div onMouseMove={handleMouseMove} style={{ height: '100vh' }}>
      {props.children(position())}
    </div>
  );
}

// Usage
<MouseTracker>
  {(pos) => (
    <div>
      Mouse position: {pos.x}, {pos.y}
    </div>
  )}
</MouseTracker>
```

### Named Render Props

Instead of using children, use named props for multiple render functions:

```javascript
function DataTable(props) {
  const [data] = createResource(() => props.fetchData());
  const [loading, setLoading] = createSignal(true);
  
  return (
    <div class="table-container">
      <Show 
        when={!loading()} 
        fallback={props.renderLoading?.() || <div>Loading...</div>}
      >
        <table>
          <thead>{props.renderHeader?.()}</thead>
          <tbody>
            <For each={data()}>
              {(row, index) => (
                <tr>{props.renderRow(row, index())}</tr>
              )}
            </For>
          </tbody>
          <Show when={props.renderFooter}>
            <tfoot>{props.renderFooter()}</tfoot>
          </Show>
        </table>
      </Show>
    </div>
  );
}

// Usage
<DataTable
  fetchData={fetchUsers}
  renderHeader={() => (
    <tr>
      <th>Name</th>
      <th>Email</th>
    </tr>
  )}
  renderRow={(user) => (
    <>
      <td>{user.name}</td>
      <td>{user.email}</td>
    </>
  )}
  renderLoading={() => <Spinner />}
/>
```

### Render Props with State

```javascript
function Toggle(props) {
  const [on, setOn] = createSignal(props.initialOn || false);
  
  const api = {
    on: on(),
    toggle: () => setOn(!on()),
    setOn,
  };
  
  return props.children(api);
}

// Usage
<Toggle initialOn={false}>
  {({ on, toggle }) => (
    <div>
      <button onClick={toggle}>
        {on ? 'ON' : 'OFF'}
      </button>
      <Show when={on}>
        <p>The toggle is on!</p>
      </Show>
    </div>
  )}
</Toggle>
```

## Higher-Order Components (HOCs)

### Basic HOC

HOCs wrap components to add functionality:

```javascript
function withLogging(Component) {
  return function LoggedComponent(props) {
    onMount(() => {
      console.log('Component mounted:', Component.name);
    });
    
    onCleanup(() => {
      console.log('Component unmounted:', Component.name);
    });
    
    return <Component {...props} />;
  };
}

// Usage
const LoggedButton = withLogging(Button);
<LoggedButton>Click me</LoggedButton>
```

### HOC with Enhanced Props

```javascript
function withAuth(Component) {
  return function AuthenticatedComponent(props) {
    const auth = useAuth();
    
    return (
      <Show 
        when={auth.user()} 
        fallback={<Navigate href="/login" />}
      >
        <Component {...props} user={auth.user()} />
      </Show>
    );
  };
}

// Usage
const ProtectedProfile = withAuth(ProfilePage);
<ProtectedProfile />
```

### Composing Multiple HOCs

```javascript
function withLayout(Component) {
  return function LayoutComponent(props) {
    return (
      <div class="layout">
        <Header />
        <Component {...props} />
        <Footer />
      </div>
    );
  };
}

function withErrorBoundary(Component) {
  return function SafeComponent(props) {
    return (
      <ErrorBoundary fallback={(err) => <div>Error: {err.message}</div>}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}

// Compose HOCs
const EnhancedPage = withErrorBoundary(withAuth(withLayout(HomePage)));

// Better: Use composition helper
function compose(...fns) {
  return (x) => fns.reduceRight((acc, fn) => fn(acc), x);
}

const enhance = compose(
  withErrorBoundary,
  withAuth,
  withLayout
);

const EnhancedPage = enhance(HomePage);
```

## Compound Components

### Shared State via Context

```javascript
const AccordionContext = createContext();

function Accordion(props) {
  const [openItem, setOpenItem] = createSignal(props.defaultOpen);
  
  const api = {
    openItem,
    toggle: (id) => setOpenItem(current => current === id ? null : id)
  };
  
  return (
    <AccordionContext.Provider value={api}>
      <div class="accordion">{props.children}</div>
    </AccordionContext.Provider>
  );
}

function AccordionItem(props) {
  const { openItem, toggle } = useContext(AccordionContext);
  const isOpen = () => openItem() === props.id;
  
  return (
    <div class="accordion-item">
      <button 
        class="accordion-header"
        onClick={() => toggle(props.id)}
      >
        {props.header}
      </button>
      <Show when={isOpen()}>
        <div class="accordion-content">
          {props.children}
        </div>
      </Show>
    </div>
  );
}

// Export as compound component
Accordion.Item = AccordionItem;

// Usage
<Accordion defaultOpen="section1">
  <Accordion.Item id="section1" header="Section 1">
    <p>Content for section 1</p>
  </Accordion.Item>
  <Accordion.Item id="section2" header="Section 2">
    <p>Content for section 2</p>
  </Accordion.Item>
</Accordion>
```

### Flexible Compound Components

```javascript
const MenuContext = createContext();

function Menu(props) {
  const [open, setOpen] = createSignal(false);
  const [selected, setSelected] = createSignal(props.defaultValue);
  
  return (
    <MenuContext.Provider value={{ open, setOpen, selected, setSelected }}>
      <div class="menu">{props.children}</div>
    </MenuContext.Provider>
  );
}

function MenuButton(props) {
  const { open, setOpen } = useContext(MenuContext);
  
  return (
    <button
      class="menu-button"
      onClick={() => setOpen(!open())}
      {...props}
    >
      {props.children}
    </button>
  );
}

function MenuList(props) {
  const { open } = useContext(MenuContext);
  
  return (
    <Show when={open()}>
      <ul class="menu-list" {...props}>
        {props.children}
      </ul>
    </Show>
  );
}

function MenuItem(props) {
  const { setSelected, setOpen } = useContext(MenuContext);
  
  const handleClick = () => {
    setSelected(props.value);
    setOpen(false);
    props.onClick?.(props.value);
  };
  
  return (
    <li class="menu-item" onClick={handleClick}>
      {props.children}
    </li>
  );
}

Menu.Button = MenuButton;
Menu.List = MenuList;
Menu.Item = MenuItem;

// Usage - very flexible!
<Menu defaultValue="home">
  <Menu.Button>Navigate</Menu.Button>
  <Menu.List>
    <Menu.Item value="home">Home</Menu.Item>
    <Menu.Item value="about">About</Menu.Item>
    <Menu.Item value="contact">Contact</Menu.Item>
  </Menu.List>
</Menu>
```

## Slot Pattern

### Named Slots

```javascript
function Card(props) {
  const c = children(() => props.children);
  
  return (
    <div class="card">
      <Show when={props.header}>
        <div class="card-header">{props.header}</div>
      </Show>
      
      <div class="card-body">{c()}</div>
      
      <Show when={props.footer}>
        <div class="card-footer">{props.footer}</div>
      </Show>
    </div>
  );
}

// Usage
<Card 
  header={<h2>Card Title</h2>}
  footer={<button>Action</button>}
>
  <p>Card content goes here</p>
</Card>
```

### Advanced Slot Pattern

```javascript
function Layout(props) {
  // Extract slots from children
  const slots = {
    header: null,
    sidebar: null,
    main: null,
    footer: null
  };
  
  const c = children(() => props.children);
  
  createEffect(() => {
    const kids = c.toArray();
    kids.forEach(child => {
      if (child.type === Slot) {
        slots[child.props.name] = child.props.children;
      }
    });
  });
  
  return (
    <div class="layout">
      <header>{slots.header}</header>
      <div class="layout-body">
        <aside>{slots.sidebar}</aside>
        <main>{slots.main}</main>
      </div>
      <footer>{slots.footer}</footer>
    </div>
  );
}

function Slot(props) {
  // This is just a marker component
  return props.children;
}

// Usage
<Layout>
  <Slot name="header">
    <h1>My App</h1>
  </Slot>
  <Slot name="sidebar">
    <Nav />
  </Slot>
  <Slot name="main">
    <Content />
  </Slot>
  <Slot name="footer">
    <p>© 2024</p>
  </Slot>
</Layout>
```

## Dynamic Components

### Dynamic Component Loading

```javascript
import { Dynamic } from 'solid-js/web';

function DynamicForm(props) {
  const components = {
    text: TextInput,
    number: NumberInput,
    select: SelectInput,
    checkbox: CheckboxInput
  };
  
  return (
    <form>
      <For each={props.fields}>
        {(field) => (
          <Dynamic 
            component={components[field.type]}
            {...field.props}
          />
        )}
      </For>
    </form>
  );
}

// Usage
<DynamicForm fields={[
  { type: 'text', props: { name: 'username', label: 'Username' } },
  { type: 'number', props: { name: 'age', label: 'Age' } },
  { type: 'select', props: { name: 'country', label: 'Country', options: [...] } }
]} />
```

### Lazy Loading Components

```javascript
import { lazy } from 'solid-js';

const HeavyComponent = lazy(() => import('./HeavyComponent'));

function App() {
  const [show, setShow] = createSignal(false);
  
  return (
    <div>
      <button onClick={() => setShow(true)}>
        Load Heavy Component
      </button>
      
      <Show when={show()}>
        <Suspense fallback={<div>Loading...</div>}>
          <HeavyComponent />
        </Suspense>
      </Show>
    </div>
  );
}
```

### Route-Based Code Splitting

```javascript
import { lazy } from 'solid-js';
import { Route, Routes } from '@solidjs/router';

const Home = lazy(() => import('./pages/Home'));
const About = lazy(() => import('./pages/About'));
const Profile = lazy(() => import('./pages/Profile'));

function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" component={Home} />
        <Route path="/about" component={About} />
        <Route path="/profile" component={Profile} />
      </Routes>
    </Suspense>
  );
}
```

## Provider Pattern

### Custom Provider Component

```javascript
const ThemeContext = createContext();

export function ThemeProvider(props) {
  const [theme, setTheme] = createSignal(
    localStorage.getItem('theme') || 'light'
  );
  
  // Persist theme changes
  createEffect(() => {
    localStorage.setItem('theme', theme());
    document.documentElement.setAttribute('data-theme', theme());
  });
  
  const toggleTheme = () => {
    setTheme(current => current === 'light' ? 'dark' : 'light');
  };
  
  const themeAPI = {
    theme,
    setTheme,
    toggleTheme,
    isDark: () => theme() === 'dark',
    isLight: () => theme() === 'light'
  };
  
  return (
    <ThemeContext.Provider value={themeAPI}>
      {props.children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

// Usage
function App() {
  return (
    <ThemeProvider>
      <MyApp />
    </ThemeProvider>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button onClick={toggleTheme}>
      Current theme: {theme()}
    </button>
  );
}
```

### Composing Providers

```javascript
function AppProviders(props) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <I18nProvider>
          <RouterProvider>
            {props.children}
          </RouterProvider>
        </I18nProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

// Usage
function App() {
  return (
    <AppProviders>
      <AppContent />
    </AppProviders>
  );
}
```

## Controlled vs Uncontrolled Pattern

### Fully Controlled Component

```javascript
function ControlledInput(props) {
  return (
    <input
      value={props.value}
      onInput={(e) => props.onInput(e.currentTarget.value)}
    />
  );
}

// Usage - parent controls state
function Parent() {
  const [value, setValue] = createSignal('');
  
  return <ControlledInput value={value()} onInput={setValue} />;
}
```

### Uncontrolled Component

```javascript
function UncontrolledInput(props) {
  const [value, setValue] = createSignal(props.defaultValue || '');
  
  return (
    <input
      value={value()}
      onInput={(e) => {
        const newValue = e.currentTarget.value;
        setValue(newValue);
        props.onInput?.(newValue);
      }}
    />
  );
}

// Usage - component manages own state
<UncontrolledInput 
  defaultValue="hello"
  onInput={(v) => console.log(v)}
/>
```

### Hybrid Controlled/Uncontrolled

```javascript
function FlexibleInput(props) {
  const isControlled = () => props.value !== undefined;
  const [internalValue, setInternalValue] = createSignal(props.defaultValue || '');
  
  const value = () => isControlled() ? props.value : internalValue();
  
  const handleInput = (e) => {
    const newValue = e.currentTarget.value;
    
    if (!isControlled()) {
      setInternalValue(newValue);
    }
    
    props.onInput?.(newValue);
  };
  
  return <input value={value()} onInput={handleInput} />;
}

// Can be used either way
<FlexibleInput defaultValue="uncontrolled" />
// or
const [value, setValue] = createSignal('');
<FlexibleInput value={value()} onInput={setValue} />
```

## Composition Patterns

### Component Composition

```javascript
function Button(props) {
  return (
    <button class="btn" {...props}>
      {props.children}
    </button>
  );
}

function IconButton(props) {
  return (
    <Button {...props}>
      <Icon name={props.icon} />
      {props.children}
    </Button>
  );
}

function LoadingButton(props) {
  return (
    <Button {...props} disabled={props.loading || props.disabled}>
      <Show when={props.loading} fallback={props.children}>
        <Spinner /> Loading...
      </Show>
    </Button>
  );
}

// Usage
<IconButton icon="save" onClick={save}>
  Save
</IconButton>

<LoadingButton loading={saving()} onClick={save}>
  Save
</LoadingButton>
```

### Container/Presentational Pattern

```javascript
// Presentational component - just UI
function UserListView(props) {
  return (
    <ul>
      <For each={props.users}>
        {(user) => (
          <li onClick={() => props.onSelect(user)}>
            {user.name}
          </li>
        )}
      </For>
    </ul>
  );
}

// Container component - handles logic
function UserListContainer(props) {
  const [users] = createResource(fetchUsers);
  const [selected, setSelected] = createSignal();
  
  const handleSelect = (user) => {
    setSelected(user);
    props.onUserSelect?.(user);
  };
  
  return (
    <Show when={users()} fallback={<div>Loading...</div>}>
      <UserListView 
        users={users()}
        onSelect={handleSelect}
      />
    </Show>
  );
}
```

## Performance Patterns

### Memoizing Expensive Computations

```javascript
function ExpensiveList(props) {
  const sortedAndFilteredItems = createMemo(() => {
    console.log('Computing sorted and filtered items');
    return props.items
      .filter(item => item.active)
      .sort((a, b) => a.name.localeCompare(b.name));
  });
  
  return (
    <For each={sortedAndFilteredItems()}>
      {(item) => <div>{item.name}</div>}
    </For>
  );
}
```

### Avoiding Unnecessary Rerenders

```javascript
function OptimizedComponent(props) {
  // ❌ Creates new object every time
  const style = { color: props.color, fontSize: '16px' };
  
  // ✅ Memoize stable reference
  const style = createMemo(() => ({
    color: props.color,
    fontSize: '16px'
  }));
  
  return <div style={style()}>Content</div>;
}
```

### Splitting Components

```javascript
// ❌ Large component - entire thing updates
function LargeComponent(props) {
  const [count, setCount] = createSignal(0);
  const [text, setText] = createSignal('');
  
  return (
    <div>
      <ExpensiveChart data={props.data} />
      <Counter count={count()} setCount={setCount} />
      <Input value={text()} setValue={setText} />
    </div>
  );
}

// ✅ Split into smaller components
function LargeComponent(props) {
  return (
    <div>
      <ExpensiveChart data={props.data} />
      <CounterSection />
      <InputSection />
    </div>
  );
}

function CounterSection() {
  const [count, setCount] = createSignal(0);
  return <Counter count={count()} setCount={setCount} />;
}

function InputSection() {
  const [text, setText] = createSignal('');
  return <Input value={text()} setValue={setText} />;
}
```

## Summary

- **Render Props**: Pass functions to customize rendering
- **HOCs**: Wrap components to add functionality
- **Compound Components**: Share state via context
- **Slots**: Named areas for content injection
- **Dynamic Components**: Load components based on conditions
- **Providers**: Manage and distribute global state
- **Controlled/Uncontrolled**: Different state management strategies
- **Composition**: Build complex UIs from simple pieces

## Best Practices

1. **Keep components focused** - Single responsibility
2. **Use composition over inheritance** - Combine simple components
3. **Provide good defaults** - Make components easy to use
4. **Type your props** - Better DX with TypeScript
5. **Document your API** - Especially for compound components
6. **Test thoroughly** - Unit and integration tests

## Next Steps

Practice these patterns by completing the exercises and building the unit project: a component library with context-based theming.

## Further Reading

- [Solid.js Component Guides](https://docs.solidjs.com/concepts/components)
- [React Patterns (for comparison)](https://reactpatterns.com/)
- [Component Composition Best Practices](https://www.solidjs.com/guides/composition)
