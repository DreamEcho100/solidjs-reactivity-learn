# Project 2: Offline-First Todo App

## Overview

Build a fully offline-capable todo application with automatic sync, conflict resolution, and optimistic updates using resources and persistent caching.

## Learning Objectives

- Implement offline-first architecture
- Handle network connectivity changes
- Resolve sync conflicts
- Use persistent storage (IndexedDB/localStorage)
- Build resilient user experiences

## Requirements

### Core Features

1. **Offline Functionality**
   - Work completely offline
   - Queue operations when offline
   - Auto-sync when online
   - Visual offline indicator

2. **Data Persistence**
   - Store data in IndexedDB
   - Sync with server when available
   - Handle browser storage limits
   - Clear old data

3. **Conflict Resolution**
   - Detect conflicts (local vs server changes)
   - Resolution strategies (last-write-wins, manual)
   - Merge conflicts intelligently
   - Notify user of conflicts

4. **Sync Management**
   - Background sync
   - Retry failed operations
   - Sync queue visualization
   - Bandwidth-aware syncing

## Features

### Todo Operations

```typescript
// All work offline with automatic queueing
const todos = useTodos();

// Add todo (optimistic, syncs when online)
await todos.add({
  text: 'Buy milk',
  completed: false
});

// Update todo
await todos.update(todoId, {
  completed: true
});

// Delete todo
await todos.delete(todoId);

// All operations work offline!
```

### Sync Status

```typescript
const syncStatus = useSyncStatus();

<div class="sync-indicator">
  <Show when={syncStatus.isOnline()}>
    <Show when={syncStatus.isSyncing()}>
      Syncing... ({syncStatus.pendingCount()} pending)
    </Show>
    <Show when={!syncStatus.isSyncing()}>
      ✓ Synced
    </Show>
  </Show>
  <Show when={!syncStatus.isOnline()}>
    ⚠ Offline - Changes will sync when online
  </Show>
</div>
```

## Architecture

```
src/
├── storage/
│   ├── indexedDB.ts        # IndexedDB wrapper
│   ├── localStorage.ts     # LocalStorage fallback
│   └── cache.ts            # Cache manager
├── sync/
│   ├── queue.ts            # Operation queue
│   ├── manager.ts          # Sync manager
│   ├── conflict.ts         # Conflict resolution
│   └── reconciler.ts       # Data reconciliation
├── hooks/
│   ├── useTodos.ts         # Todo operations
│   ├── useSyncStatus.ts    # Sync status
│   └── useOnlineStatus.ts  # Network status
└── components/
    ├── TodoList.tsx        # Todo list UI
    ├── SyncIndicator.tsx   # Sync status UI
    └── ConflictResolver.tsx # Conflict resolution UI
```

## Implementation Guide

### Step 1: IndexedDB Storage

```typescript
class TodoStorage {
  private db: IDBDatabase;
  
  async open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('TodoDB', 1);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create todos store
        if (!db.objectStoreNames.contains('todos')) {
          const store = db.createObjectStore('todos', { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }
        
        // Create sync queue store
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
        }
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  async getAll(): Promise<Todo[]> {
    const tx = this.db.transaction('todos', 'readonly');
    const store = tx.objectStore('todos');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  async save(todo: Todo): Promise<void> {
    const tx = this.db.transaction('todos', 'readwrite');
    const store = tx.objectStore('todos');
    
    return new Promise((resolve, reject) => {
      const request = store.put(todo);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async delete(id: string): Promise<void> {
    const tx = this.db.transaction('todos', 'readwrite');
    const store = tx.objectStore('todos');
    
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
```

### Step 2: Sync Queue

```typescript
interface QueuedOperation {
  id?: number;
  type: 'create' | 'update' | 'delete';
  todoId: string;
  data?: Partial<Todo>;
  timestamp: number;
  retries: number;
}

class SyncQueue {
  private db: IDBDatabase;
  
  async enqueue(operation: Omit<QueuedOperation, 'id'>): Promise<void> {
    const tx = this.db.transaction('syncQueue', 'readwrite');
    const store = tx.objectStore('syncQueue');
    
    return new Promise((resolve, reject) => {
      const request = store.add(operation);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async getAll(): Promise<QueuedOperation[]> {
    const tx = this.db.transaction('syncQueue', 'readonly');
    const store = tx.objectStore('syncQueue');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  async remove(id: number): Promise<void> {
    const tx = this.db.transaction('syncQueue', 'readwrite');
    const store = tx.objectStore('syncQueue');
    
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async clear(): Promise<void> {
    const tx = this.db.transaction('syncQueue', 'readwrite');
    const store = tx.objectStore('syncQueue');
    
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
```

### Step 3: Sync Manager

```typescript
class SyncManager {
  private storage: TodoStorage;
  private queue: SyncQueue;
  private isSyncing = false;
  
  async sync(): Promise<void> {
    if (this.isSyncing || !navigator.onLine) {
      return;
    }
    
    this.isSyncing = true;
    
    try {
      // Get pending operations
      const operations = await this.queue.getAll();
      
      // Execute operations in order
      for (const op of operations) {
        try {
          await this.executeOperation(op);
          await this.queue.remove(op.id!);
        } catch (error) {
          console.error('Sync failed for operation:', op, error);
          
          // Retry logic
          if (op.retries < 3) {
            // Update retry count
            // Keep in queue
          } else {
            // Give up after 3 retries
            await this.queue.remove(op.id!);
          }
        }
      }
      
      // Fetch latest from server
      await this.fetchUpdates();
    } finally {
      this.isSyncing = false;
    }
  }
  
  private async executeOperation(op: QueuedOperation): Promise<void> {
    switch (op.type) {
      case 'create':
        await fetch('/api/todos', {
          method: 'POST',
          body: JSON.stringify(op.data)
        });
        break;
      
      case 'update':
        await fetch(`/api/todos/${op.todoId}`, {
          method: 'PATCH',
          body: JSON.stringify(op.data)
        });
        break;
      
      case 'delete':
        await fetch(`/api/todos/${op.todoId}`, {
          method: 'DELETE'
        });
        break;
    }
  }
  
  private async fetchUpdates(): Promise<void> {
    // Get last sync timestamp
    const lastSync = localStorage.getItem('lastSync');
    
    // Fetch updates since last sync
    const response = await fetch(
      `/api/todos?since=${lastSync || 0}`
    );
    const updates = await response.json();
    
    // Merge updates with local data
    for (const todo of updates) {
      await this.mergeWithLocal(todo);
    }
    
    // Update last sync timestamp
    localStorage.setItem('lastSync', Date.now().toString());
  }
  
  private async mergeWithLocal(serverTodo: Todo): Promise<void> {
    const localTodo = await this.storage.get(serverTodo.id);
    
    if (!localTodo) {
      // New from server
      await this.storage.save(serverTodo);
      return;
    }
    
    // Check for conflicts
    if (localTodo.updatedAt > serverTodo.updatedAt) {
      // Local is newer - conflict!
      await this.handleConflict(localTodo, serverTodo);
    } else {
      // Server is newer
      await this.storage.save(serverTodo);
    }
  }
  
  private async handleConflict(
    local: Todo,
    server: Todo
  ): Promise<void> {
    // Strategy 1: Last-write-wins (server wins)
    await this.storage.save(server);
    
    // Strategy 2: Manual resolution
    // Show UI for user to choose
    
    // Strategy 3: Merge
    // Intelligently merge changes
  }
}
```

### Step 4: useTodos Hook

```typescript
function useTodos() {
  const storage = new TodoStorage();
  const queue = new SyncQueue();
  const syncManager = new SyncManager(storage, queue);
  
  const [todos] = createResource(
    () => storage.getAll(),
    {
      initialValue: []
    }
  );
  
  const add = async (data: Omit<Todo, 'id' | 'createdAt' | 'updatedAt'>) => {
    const todo: Todo = {
      ...data,
      id: `temp-${Date.now()}`,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    // Save locally immediately
    await storage.save(todo);
    
    // Queue for sync
    await queue.enqueue({
      type: 'create',
      todoId: todo.id,
      data: todo,
      timestamp: Date.now(),
      retries: 0
    });
    
    // Trigger sync if online
    if (navigator.onLine) {
      syncManager.sync();
    }
    
    // Refresh UI
    todos.refetch();
  };
  
  const update = async (id: string, data: Partial<Todo>) => {
    const todo = todos()?.find(t => t.id === id);
    if (!todo) return;
    
    const updated = {
      ...todo,
      ...data,
      updatedAt: Date.now()
    };
    
    await storage.save(updated);
    
    await queue.enqueue({
      type: 'update',
      todoId: id,
      data,
      timestamp: Date.now(),
      retries: 0
    });
    
    if (navigator.onLine) {
      syncManager.sync();
    }
    
    todos.refetch();
  };
  
  const remove = async (id: string) => {
    await storage.delete(id);
    
    await queue.enqueue({
      type: 'delete',
      todoId: id,
      timestamp: Date.now(),
      retries: 0
    });
    
    if (navigator.onLine) {
      syncManager.sync();
    }
    
    todos.refetch();
  };
  
  return {
    todos,
    add,
    update,
    remove
  };
}
```

### Step 5: Online Status

```typescript
function useOnlineStatus() {
  const [isOnline, setIsOnline] = createSignal(navigator.onLine);
  
  createEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    onCleanup(() => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    });
  });
  
  return isOnline;
}
```

## UI Components

### TodoList

```typescript
function TodoList() {
  const { todos, add, update, remove } = useTodos();
  const isOnline = useOnlineStatus();
  
  return (
    <div>
      <div class="header">
        <h1>Todos</h1>
        <StatusIndicator online={isOnline()} />
      </div>
      
      <AddTodo onAdd={add} />
      
      <Suspense fallback={<Loading />}>
        <For each={todos()}>
          {todo => (
            <TodoItem
              todo={todo}
              onToggle={() => update(todo.id, { 
                completed: !todo.completed 
              })}
              onDelete={() => remove(todo.id)}
            />
          )}
        </For>
      </Suspense>
    </div>
  );
}
```

## Testing

```typescript
describe('Offline Todos', () => {
  it('should work offline', async () => {
    // Simulate offline
    Object.defineProperty(navigator, 'onLine', { value: false });
    
    const { add, todos } = useTodos();
    
    await add({ text: 'Offline todo', completed: false });
    
    expect(todos().length).toBe(1);
    expect(todos()[0].text).toBe('Offline todo');
  });
  
  it('should sync when online', async () => {
    const mockFetch = vi.fn(() => Promise.resolve({ ok: true }));
    global.fetch = mockFetch;
    
    // Go online
    Object.defineProperty(navigator, 'onLine', { value: true });
    window.dispatchEvent(new Event('online'));
    
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
```

## Bonus Features

1. **Background Sync API**
2. **Service Worker Integration**
3. **Conflict Resolution UI**
4. **Sync Progress Indicator**
5. **Bandwidth Detection**
6. **Delta Sync (only changed fields)**

## Deliverables

1. ✅ Working offline todo app
2. ✅ Automatic sync when online
3. ✅ Conflict resolution
4. ✅ Persistent storage
5. ✅ Test suite
6. ✅ Documentation

## Resources

- IndexedDB API
- Service Workers
- Background Sync API
- Lesson 4: Advanced Async Patterns
