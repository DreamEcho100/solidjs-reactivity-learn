import { createSignal, createMemo } from "./siganl-0.js";

(async () => {
  console.log("=== TRACKING OBSERVERS ===\n");

  const [todos, setTodos] = createSignal([
    { id: 1, completed: false },
    { id: 2, completed: false },
  ]);

  const activeCount = createMemo(() => {
    const count = todos().filter((t) => !t.completed).length;
    console.log(`  [activeCount] Computed: ${count}`);
    return count;
  });

  await new Promise((resolve) => setTimeout(resolve, 10));

  console.log("\n1. Read activeCount:");
  console.log(`   Result: ${activeCount()}`);
  console.log(`   Signal observers: ${todos._state.observers.length}`);

  console.log("\n2. Change todos:");
  setTodos([{ id: 1, completed: true }]);
  console.log(
    `   Signal observers before tick: ${todos._state.observers.length}`
  );

  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(
    `   Signal observers after tick: ${todos._state.observers.length}`
  );

  console.log("\n3. Read activeCount again:");
  const result = activeCount();
  console.log(`   Result: ${result}`);
  console.log(`   Signal observers: ${todos._state.observers.length}`);

  if (result === 0) {
    console.log("\n✅ Working correctly!");
  } else {
    console.log(`\n❌ BUG: Expected 0, got ${result}`);
    console.log("Memo is not recomputing after signal change!");
  }
})();
