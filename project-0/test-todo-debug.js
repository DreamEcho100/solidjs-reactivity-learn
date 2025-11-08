import { createSignal, createMemo } from "./siganl-0.js";

(async () => {
  console.log("=== TODO LIST TEST DEBUG ===\n");

  const [todos, setTodos] = createSignal([]);
  const [filter, setFilter] = createSignal("all");

  const filteredTodos = createMemo(() => {
    console.log(`  [filteredTodos] Computing...`);
    const list = todos();
    const f = filter();

    if (f === "active") return list.filter((t) => !t.completed);
    if (f === "completed") return list.filter((t) => t.completed);
    return list;
  });

  const activeCount = createMemo(() => {
    const list = todos();
    const result = list.filter((t) => !t.completed).length;
    console.log(
      `  [activeCount] Computing... todos:`,
      list.map((t) => `id:${t.id}`),
      `result:`,
      result
    );
    return result;
  });

  await new Promise((resolve) => setTimeout(resolve, 10));

  console.log("\n1. Add todos:");
  setTodos([
    { id: 1, text: "Learn Signals", completed: false },
    { id: 2, text: "Build App", completed: false },
    { id: 3, text: "Deploy", completed: false },
  ]);

  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(
    `   filteredTodos().length = ${filteredTodos()?.length} (expected: 3)`
  );
  console.log(`   activeCount() = ${activeCount()} (expected: 3)`);

  console.log("\n2. Complete todo #1:");
  setTodos((prev) =>
    prev.map((t) => (t.id === 1 ? { ...t, completed: true } : t))
  );

  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(`   activeCount() = ${activeCount()} (expected: 2)`);

  console.log("\n3. Filter to active:");
  setFilter("active");

  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(
    `   filteredTodos().length = ${filteredTodos()?.length} (expected: 2)`
  );

  console.log("\n4. Filter to completed:");
  setFilter("completed");

  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(
    `   filteredTodos().length = ${filteredTodos()?.length} (expected: 1)`
  );
  console.log(
    `   filteredTodos()[0]?.text = "${
      filteredTodos()?.[0]?.text
    }" (expected: "Learn Signals")`
  );

  console.log("\n5. Delete todo #2:");
  setTodos((prev) => prev.filter((t) => t.id !== 2));

  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(
    `   After delete, todos = [${todos()
      .map((t) => `{id:${t.id}, completed:${t.completed}}`)
      .join(", ")}]`
  );
  console.log(`   activeCount() = ${activeCount()} (expected: 1)`);

  console.log("\n6. Filter back to all:");
  setFilter("all");

  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(
    `   filteredTodos().length = ${filteredTodos()?.length} (expected: 2)`
  );
  console.log(`   activeCount() = ${activeCount()} (expected: 1)`);
})();
