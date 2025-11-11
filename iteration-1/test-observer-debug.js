import { createSignal, createMemo } from "./siganl-0.js";

console.log("=== CHECKING OBSERVER REGISTRATION ===\n");

const [count, setCount] = createSignal(1);

console.log("1. Before creating memo:");
console.log(`   Signal observers: ${count._state.observers.length}`);

const doubled = createMemo(() => {
  console.log(`   [MEMO] Reading count()...`);
  const value = count();
  console.log(`   [MEMO] count() = ${value}`);
  return value * 2;
});

console.log("\n2. After creating memo:");
console.log(`   Signal observers: ${count._state.observers.length}`);
console.log(`   doubled() = ${doubled()}`);

console.log("\n3. Signal observers after reading memo:");
console.log(`   Signal observers: ${count._state.observers.length}`);

if (count._state.observers.length > 0) {
  console.log("\n✅ Memo is registered as observer!");
  console.log(`   Observer details:`, count._state.observers[0]);
} else {
  console.log("\n❌ Memo is NOT registered as observer!");
}
