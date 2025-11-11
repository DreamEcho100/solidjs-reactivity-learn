import { createSignal, createMemo } from "./siganl-0.js";

console.log("=== DEBUGGING MEMO STATE ===\n");

// Patch updateComputation to log state
const originalMemo = createMemo;

// Intercept to see internal state
const [count, setCount] = createSignal(1);

console.log("Creating memo...\n");

const doubled = createMemo(() => {
  console.log("  [MEMO FN] Executing...");
  const result = count() * 2;
  console.log(`  [MEMO FN] Result: ${result}`);
  return result;
});

console.log("\nChecking observers after memo creation:");
console.log(`  Signal observers: ${count._state.observers.length}`);

console.log("\nReading doubled()...");
const val = doubled();
console.log(`  Value: ${val}`);
console.log(`  Signal observers after read: ${count._state.observers.length}`);

console.log("\nChanging signal...");
setCount(5);

console.log(`\nReading doubled() again...`);
const val2 = doubled();
console.log(`  Value: ${val2} (expected 10)`);
console.log(`  Signal observers: ${count._state.observers.length}`);
