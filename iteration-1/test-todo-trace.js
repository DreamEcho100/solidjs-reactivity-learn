import { createSignal, createMemo } from "./siganl-0.js";

(async () => {
  console.log("=== REPRODUCING TODO BUG ===\n");

  const [todos, setTodos] = createSignal([]);
  const [filter, setFilter] = createSignal("all");

  const filteredTodos = createMemo(() => {
    const list = todos();
    const f = filter();

    if (f === "active") return list.filter((t) => !t.completed);
    if (f === "completed") return list.filter((t) => t.completed);
    return list;
  });

  const activeCount = createMemo(
    () => todos().filter((t) => !t.completed).length
  );

  // Start
  setTodos([
    { id: 1, text: "Learn Signals", completed: false },
    { id: 2, text: "Build App", completed: false },
    { id: 3, text: "Deploy", completed: false },
  ]);
  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log("1. Initial: 3 todos, all active");
  console.log(`   activeCount = ${activeCount()}`);

  // Complete #1
  setTodos((prev) =>
    prev.map((t) => (t.id === 1 ? { ...t, completed: true } : t))
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log("\n2. Completed todo #1");
  console.log(`   activeCount = ${activeCount()} (should be 2)`);

  // Filter to completed
  setFilter("completed");
  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log("\n3. Filter to completed");
  console.log(`   filteredTodos.length = ${filteredTodos().length}`);
  console.log(
    `   Showing: ${filteredTodos()
      .map((t) => t.text)
      .join(", ")}`
  );

  // Delete todo #2
  console.log("\n4. Delete todo #2 (Build App)");
  console.log(
    "   Before delete, all todos:",
    todos()
      .map((t) => `${t.id}:${t.text}(${t.completed ? "✓" : "○"})`)
      .join(", ")
  );
  setTodos((prev) => prev.filter((t) => t.id !== 2));
  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(
    "   After delete, all todos:",
    todos()
      .map((t) => `${t.id}:${t.text}(${t.completed ? "✓" : "○"})`)
      .join(", ")
  );
  console.log(
    `   activeCount = ${activeCount()} (should be 1, got ${activeCount()})`
  );

  // Filter back to all
  setFilter("all");
  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log("\n5. Filter to all");
  console.log(
    `   filteredTodos.length = ${filteredTodos().length} (should be 2)`
  );
  console.log(
    `   activeCount = ${activeCount()} (should be 1, got ${activeCount()})`
  );

  console.log(
    "\n" +
      (activeCount() === 1
        ? "✅ TEST PASSES"
        : `❌ TEST FAILS: Expected 1, got ${activeCount()}`)
  );
})();
