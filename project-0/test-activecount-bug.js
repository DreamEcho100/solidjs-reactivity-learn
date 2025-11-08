import { createSignal, createMemo } from "./siganl-0.js";

(async () => {
  console.log("=== ACTIVECOUNT CACHING BUG ===\n");

  const [todos, setTodos] = createSignal([
    { id: 1, text: "A", completed: true },
    { id: 2, text: "B", completed: false },
    { id: 3, text: "C", completed: false },
  ]);

  let computations = 0;
  const activeCount = createMemo(() => {
    computations++;
    const count = todos().filter((t) => !t.completed).length;
    console.log(`  [activeCount] Computation #${computations}: ${count}`);
    return count;
  });

  await new Promise((resolve) => setTimeout(resolve, 10));

  console.log("1. Initial state:");
  console.log(
    `   todos: ${todos()
      .map((t) => `${t.text}(${t.completed ? "✓" : "○"})`)
      .join(", ")}`
  );
  console.log(`   activeCount() = ${activeCount()}`);
  console.log(`   Computations: ${computations}\n`);

  console.log("2. Delete todo B (active):");
  setTodos((prev) => prev.filter((t) => t.id !== 2));
  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(
    `   todos: ${todos()
      .map((t) => `${t.text}(${t.completed ? "✓" : "○"})`)
      .join(", ")}`
  );
  console.log(`   activeCount() = ${activeCount()} (should be 1)`);
  console.log(`   Computations: ${computations}\n`);

  console.log("3. Manual count:");
  const manual = todos().filter((t) => !t.completed).length;
  console.log(`   todos().filter(t => !t.completed).length = ${manual}`);
  console.log(`   activeCount() returns: ${activeCount()}`);
  console.log(`   Match: ${manual === activeCount() ? "✅" : "❌"}`);
})();
