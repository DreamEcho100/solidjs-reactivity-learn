import { createSignal, createMemo } from "./siganl-0.js";

const nextTick = () => new Promise((resolve) => queueMicrotask(resolve));

async function testMemoWithMultipleReads() {
  console.log("=== MEMO WITH MULTIPLE READS TEST ===\n");

  const [todos, setTodos] = createSignal([]);
  const [filter, setFilter] = createSignal("all");

  const filteredTodos = createMemo(() => {
    const list = todos();
    const f = filter();
    console.log(
      `  [filteredTodos] Computing... filter="${f}", todos.length=${list.length}`
    );

    if (f === "active") return list.filter((t) => !t.completed);
    if (f === "completed") return list.filter((t) => t.completed);
    return list;
  });

  const activeCount = createMemo(() => {
    const list = todos();
    const result = list.filter((t) => !t.completed).length;
    console.log(
      `  [activeCount] Computing... todos.length=${list.length}, activeCount=${result}`
    );
    return result;
  });

  console.log("1. Add todos:");
  setTodos([
    { id: 1, text: "A", completed: false },
    { id: 2, text: "B", completed: false },
    { id: 3, text: "C", completed: false },
  ]);
  await nextTick();
  console.log(`   activeCount() = ${activeCount()} (expected: 3)`);
  console.log(
    `   filteredTodos().length = ${filteredTodos().length} (expected: 3)`
  );

  console.log("\n2. Complete todo #1:");
  setTodos((prev) =>
    prev.map((t) => (t.id === 1 ? { ...t, completed: true } : t))
  );
  await nextTick();
  console.log(`   activeCount() = ${activeCount()} (expected: 2)`);

  console.log("\n3. Filter to 'completed':");
  setFilter("completed");
  await nextTick();
  console.log(
    `   filteredTodos().length = ${filteredTodos().length} (expected: 1)`
  );

  console.log("\n4. Delete todo #2:");
  setTodos((prev) => prev.filter((t) => t.id !== 2));
  await nextTick();
  console.log(`   todos().length = ${todos().length} (expected: 2)`);
  console.log(`   After delete, NOT reading memos yet`);

  console.log("\n5. Filter to 'all':");
  setFilter("all");
  await nextTick();
  console.log(`   After filter change, NOT reading memos yet`);

  console.log("\n6. Read filteredTodos:");
  console.log(
    `   filteredTodos().length = ${filteredTodos().length} (expected: 2)`
  );

  console.log("\n7. Read activeCount (BUG EXPECTED HERE):");
  console.log(
    `   activeCount() = ${activeCount()} (expected: 1, bug shows: 2)`
  );
}

testMemoWithMultipleReads();
