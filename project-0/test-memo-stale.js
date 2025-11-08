import { createSignal, createMemo } from "./siganl-0.js";

(async () => {
  console.log("=== MEMO NOT RECOMPUTING BUG ===\n");

  const [todos, setTodos] = createSignal([
    { id: 1, completed: true },
    { id: 2, completed: false },
  ]);

  let computations = 0;
  const activeCount = createMemo(() => {
    computations++;
    const count = todos().filter((t) => !t.completed).length;
    console.log(`  [activeCount] Computation #${computations}: ${count}`);
    return count;
  });

  // Initial read
  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(
    `1. Initial: activeCount() = ${activeCount()}, computations=${computations}\n`
  );

  // Change todos
  console.log("2. Deleting a todo...");
  setTodos([{ id: 1, completed: true }]);
  await new Promise((resolve) => setTimeout(resolve, 10));

  console.log("3. Reading activeCount...");
  const result = activeCount();
  console.log(`   activeCount() = ${result}, computations=${computations}`);
  console.log(`   Expected: 0, Got: ${result}`);
  console.log(
    `   ${result === 0 ? "✅ CORRECT" : "❌ BUG: Memo returned stale value"}`
  );
})();
