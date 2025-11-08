import { createSignal, createMemo } from "./siganl-0.js";

console.log("=== TESTING WITH DEBUG SIGNAL ===\n");

const [count, setCount] = createSignal(1, { name: "debug-count" });

console.log("Creating memo...\n");

const doubled = createMemo(() => {
  const result = count() * 2;
  return result;
});

console.log("\nSignal observers:", count._state.observers.length);
console.log("Expected: 1, Got:", count._state.observers.length);

if (count._state.observers.length > 0) {
  console.log("\n✅ Memo registered!");
} else {
  console.log("\n❌ Memo NOT registered!");
}
