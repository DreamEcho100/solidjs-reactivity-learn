# Unit 13: Further and Beyond - Exercises

## Exercise 1: Reactive Streaming with Backpressure

Implement a reactive stream processing system with backpressure handling:

```typescript
interface Stream<T> {
  subscribe(observer: Observer<T>): Subscription;
  map<U>(fn: (value: T) => U): Stream<U>;
  filter(predicate: (value: T) => boolean): Stream<T>;
  buffer(size: number): Stream<T[]>;
  throttle(ms: number): Stream<T>;
}

interface Observer<T> {
  next(value: T): void;
  error(err: Error): void;
  complete(): void;
  requestMore?(count: number): void; // Backpressure
}

// Your implementation
function createStream<T>(
  producer: (emit: (value: T) => void) => () => void
): Stream<T> {
  // Implement stream with backpressure
}

// Test with high-frequency data
const stream = createStream<number>(emit => {
  let count = 0;
  const interval = setInterval(() => emit(count++), 1);
  return () => clearInterval(interval);
});

stream
  .buffer(100)
  .throttle(1000)
  .subscribe({
    next: values => console.log('Batch:', values),
    requestMore: (n) => console.log('Ready for', n, 'more')
  });
```

**Success Criteria:**
- Handles high-frequency data without memory leaks
- Backpressure prevents overwhelming consumers
- Clean stream composition API
- Proper cleanup on unsubscribe

---

## Exercise 2: Reactive Distributed State Sync

Build a system to synchronize reactive state across browser tabs/windows:

```typescript
interface SyncedStore<T> {
  get(): T;
  set(value: T | ((prev: T) => T)): void;
  subscribe(fn: (value: T) => void): () => void;
}

function createSyncedStore<T>(
  key: string,
  initialValue: T,
  strategy: 'last-write-wins' | 'merge'
): SyncedStore<T> {
  // Use BroadcastChannel or SharedWorker
  // Implement conflict resolution
  // Handle tab closure
}

// Test across tabs
const store = createSyncedStore('app-state', { count: 0 }, 'last-write-wins');

store.subscribe(state => {
  console.log('State updated:', state);
});

// In Tab 1
store.set({ count: 5 });

// In Tab 2 - should see update
store.subscribe(state => {
  console.log('Synced:', state.count); // 5
});
```

**Success Criteria:**
- Real-time sync across tabs
- Conflict resolution working
- No race conditions
- Handles offline/online scenarios

---

## Exercise 3: Reactive GPU Computing

Integrate WebGL/WebGPU with reactive state for GPU-accelerated computations:

```typescript
interface GPUComputation<T> {
  input: Setter<T>;
  output: Accessor<T>;
  dispose(): void;
}

function createGPUComputation<T>(
  shader: string,
  initialInput: T
): GPUComputation<T> {
  // Compile shader
  // Create buffers
  // Connect to reactive system
  // Run computation on GPU
}

// Example: Image processing
const imageProcessor = createGPUComputation<ImageData>(
  `
    // GLSL shader
    uniform sampler2D inputTexture;
    varying vec2 vUv;
    
    void main() {
      vec4 color = texture2D(inputTexture, vUv);
      gl_FragColor = vec4(1.0 - color.rgb, color.a); // Invert
    }
  `,
  imageData
);

// Reactive pipeline
const [sourceImage, setSourceImage] = createSignal<ImageData>(/*...*/);

createEffect(() => {
  imageProcessor.input(sourceImage());
});

createEffect(() => {
  const processed = imageProcessor.output();
  renderToCanvas(processed);
});
```

**Success Criteria:**
- GPU shader compilation
- Efficient data transfer
- Reactive integration
- 60fps rendering

---

## Exercise 4: Reactive CRDT Implementation

Implement Conflict-free Replicated Data Types with reactivity:

```typescript
// G-Counter (Grow-only Counter)
interface GCounter {
  increment(): void;
  value(): number;
  merge(other: GCounter): void;
  state(): Map<string, number>;
}

function createGCounter(replicaId: string): GCounter {
  const [state, setState] = createSignal(new Map<string, number>());
  
  return {
    increment() {
      setState(s => {
        const newState = new Map(s);
        newState.set(replicaId, (s.get(replicaId) || 0) + 1);
        return newState;
      });
    },
    
    value: createMemo(() => {
      let sum = 0;
      for (const count of state().values()) {
        sum += count;
      }
      return sum;
    }),
    
    merge(other: GCounter) {
      // Implement merge
    },
    
    state
  };
}

// PN-Counter (Positive-Negative Counter)
interface PNCounter {
  increment(): void;
  decrement(): void;
  value(): number;
  merge(other: PNCounter): void;
}

// Your implementation
function createPNCounter(replicaId: string): PNCounter {
  // Use two G-Counters
}

// LWW-Register (Last-Write-Wins Register)
function createLWWRegister<T>(replicaId: string): {
  set(value: T): void;
  get(): T | undefined;
  merge(other: any): void;
} {
  // Implement with timestamps
}
```

**Success Criteria:**
- Proper CRDT semantics
- Eventual consistency
- Commutative merge operations
- Reactive value updates

---

## Exercise 5: Reactive Compiler Plugin

Build a compile-time optimizer for reactive code:

```typescript
// Babel/SWC plugin that transforms:

// Input
function Counter() {
  const [count, setCount] = createSignal(0);
  const doubled = createMemo(() => count() * 2);
  
  return <div>{doubled()}</div>;
}

// Output (optimized)
function Counter() {
  const [count, setCount] = createSignal(0);
  // Inlined memo - no function call overhead
  const doubled = () => count() * 2;
  
  return () => {
    const _el$ = document.createElement("div");
    createEffect(() => _el$.textContent = doubled());
    return _el$;
  };
}

// Your plugin implementation
export function solidReactivePlugin(): Plugin {
  return {
    visitor: {
      CallExpression(path) {
        // Detect createMemo, createEffect, etc.
        // Apply optimizations
        // Inline where beneficial
        // Remove unused computations
      }
    }
  };
}
```

**Success Criteria:**
- Correctly transforms reactive code
- Maintains semantics
- Measurable performance improvement
- Handles edge cases

---

## Exercise 6: Reactive Machine Learning

Integrate ML models with reactive state:

```typescript
interface ReactiveModel<Input, Output> {
  predict(input: Input): Accessor<Output>;
  train(data: TrainingData<Input, Output>): Promise<void>;
  accuracy(): Accessor<number>;
}

function createReactiveModel<Input, Output>(
  config: ModelConfig
): ReactiveModel<Input, Output> {
  // Load TensorFlow.js or ONNX model
  // Create reactive predictions
  // Update on model changes
}

// Example: Real-time image classification
const model = createReactiveModel({
  type: 'image-classification',
  modelUrl: '/models/mobilenet.json'
});

const [image, setImage] = createSignal<ImageData>(/*...*/);
const prediction = model.predict(image);

createEffect(() => {
  console.log('Prediction:', prediction());
});

// Live camera feed
const videoStream = createMediaStream({ video: true });

createEffect(() => {
  const frame = videoStream.currentFrame();
  setImage(frame);
});
```

**Success Criteria:**
- Real-time predictions
- Efficient model updates
- Reactive training metrics
- Good performance (>30fps for video)

---

## Exercise 7: Reactive Web Audio

Build a reactive audio synthesis system:

```typescript
interface AudioNode {
  connect(dest: AudioNode): void;
  frequency: Accessor<number>;
  gain: Accessor<number>;
}

function createOscillator(
  type: 'sine' | 'square' | 'sawtooth' | 'triangle'
): AudioNode {
  const audioContext = new AudioContext();
  const oscillator = audioContext.createOscillator();
  oscillator.type = type;
  
  const [frequency, setFrequency] = createSignal(440);
  const [gain, setGain] = createSignal(1);
  
  createEffect(() => {
    oscillator.frequency.value = frequency();
  });
  
  // Implement audio graph with reactivity
}

// Build synthesizer
const osc1 = createOscillator('sine');
const osc2 = createOscillator('square');
const filter = createFilter('lowpass');
const output = createGain();

osc1.connect(filter);
osc2.connect(filter);
filter.connect(output);
output.connect(audioContext.destination);

// Reactive controls
const [cutoff, setCutoff] = createSignal(1000);

createEffect(() => {
  filter.frequency.set(cutoff());
});
```

**Success Criteria:**
- Real-time audio processing
- No audio glitches
- Reactive parameter updates
- Modular audio graph

---

## Exercise 8: Reactive Game Engine

Build an entity-component-system game engine with reactivity:

```typescript
interface Entity {
  id: string;
  components: Map<string, Component>;
  addComponent(comp: Component): void;
  removeComponent(type: string): void;
  update(dt: number): void;
}

interface Component {
  type: string;
  update?(dt: number): void;
}

interface System {
  componentsRequired: Set<string>;
  update(entities: Entity[], dt: number): void;
}

class ReactiveECS {
  private entities = new Map<string, Entity>();
  private systems: System[] = [];
  
  // Reactive queries
  query(componentTypes: string[]): Accessor<Entity[]> {
    return createMemo(() => {
      const result: Entity[] = [];
      for (const entity of this.entities.values()) {
        if (componentTypes.every(type => entity.components.has(type))) {
          result.push(entity);
        }
      }
      return result;
    });
  }
  
  update(dt: number) {
    for (const system of this.systems) {
      const entities = Array.from(this.entities.values()).filter(e =>
        Array.from(system.componentsRequired).every(type => 
          e.components.has(type)
        )
      );
      system.update(entities, dt);
    }
  }
}

// Usage
const ecs = new ReactiveECS();

// Movement system
const movables = ecs.query(['position', 'velocity']);

createEffect(() => {
  // Automatically updates when entities added/removed
  console.log('Movable entities:', movables().length);
});
```

**Success Criteria:**
- Reactive entity queries
- 60fps game loop
- Efficient component updates
- Collision detection
- Particle systems

---

## Bonus Challenges

1. **Reactive Quantum Computing**: Integrate Qiskit or similar with reactive state
2. **Reactive Blockchain**: Real-time blockchain state with reactivity
3. **Reactive AR/VR**: WebXR integration with reactive 3D scenes
4. **Reactive P2P**: Decentralized reactive state with WebRTC

---

## Evaluation

Each exercise demonstrates mastery of:
- Advanced reactive patterns
- Performance optimization
- Integration with external systems
- Real-world applicability
- Code quality and testing

Complete at least 4 exercises to pass this unit. 🚀
