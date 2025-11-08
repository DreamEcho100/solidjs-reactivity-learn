import { createSignal, createMemo } from "./siganl-0.js";

(async () => {
  console.log("=== EXACT TEST SEQUENCE ===\n");

  const [todos, setTodos] = createSignal([]);
  const [filter, setFilter] = createSignal("all");

  let activeComputations = 0;
  let filteredComputations = 0;

  const filteredTodos = createMemo(() => {
    filteredComputations++;
    const list = todos();
    const f = filter();
    const result =
      f === "active"
        ? list.filter((t) => !t.completed)
        : f === "completed"
        ? list.filter((t) => t.completed)
        : list;
    console.log(
      `  [filteredTodos #${filteredComputations}] filter=${f}, result.length=${result.length}`
    );
    return result;
  });

  const activeCount = createMemo(() => {
    activeComputations++;
    const count = todos().filter((t) => !t.completed).length;
    console.log(`  [activeCount #${activeComputations}] = ${count}`);
    return count;
  });

  const completedCount = createMemo(
    () => todos().filter((t) => t.completed).length
  );

  await new Promise((resolve) => setTimeout(resolve, 10));

  // Step 1: Add todos
  console.log("\nStep 1: setTodos([3 items])");
  setTodos([
    { id: 1, text: "Learn Signals", completed: false },
    { id: 2, text: "Build App", completed: false },
    { id: 3, text: "Deploy", completed: false },
  ]);
  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(
    `Result: filteredTodos().length=${
      filteredTodos().length
    }, activeCount()=${activeCount()}, completedCount()=${completedCount()}`
  );

  // Step 2: Complete todo #1
  console.log("\nStep 2: Complete todo #1");
  setTodos((prev) =>
    prev.map((t) => (t.id === 1 ? { ...t, completed: true } : t))
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(
    `Result: activeCount()=${activeCount()}, completedCount()=${completedCount()}`
  );

  // Step 3: Filter to active
  console.log('\nStep 3: setFilter("active")');
  setFilter("active");
  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(`Result: filteredTodos().length=${filteredTodos().length}`);

  // Step 4: Filter to completed
  console.log('\nStep 4: setFilter("completed")');
  setFilter("completed");
  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(
    `Result: filteredTodos().length=${filteredTodos().length}, text=${
      filteredTodos()[0]?.text
    }`
  );

  // Step 5: Delete todo #2
  console.log("\nStep 5: Delete todo #2");
  console.log(
    `Before: ${todos()
      .map((t) => `${t.id}:${t.text}(${t.completed ? "✓" : "○"})`)
      .join(", ")}`
  );
  setTodos((prev) => prev.filter((t) => t.id !== 2));
  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(
    `After: ${todos()
      .map((t) => `${t.id}:${t.text}(${t.completed ? "✓" : "○"})`)
      .join(", ")}`
  );
  console.log(`Result: activeCount()=${activeCount()} (expected 1)`);

  // Step 6: Filter to all
  console.log('\nStep 6: setFilter("all")');
  setFilter("all");
  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(
    `Result: filteredTodos().length=${
      filteredTodos().length
    }, activeCount()=${activeCount()}`
  );

  console.log(
    "\n" +
      (activeCount() === 1
        ? "✅ TEST PASSES"
        : `❌ TEST FAILS: activeCount=${activeCount()}, expected 1`)
  );
})();
