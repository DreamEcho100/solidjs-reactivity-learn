import { createSignal, createMemo } from "./siganl-0.js";

console.log("=== MEMO DEBUG TEST ===\n");

const [count, setCount] = createSignal(1);
let computations = 0;

const doubled = createMemo(() => {
  computations++;
  console.log(`  [MEMO] Computing... count=${count()}`);
  return count() * 2;
});

console.log(`1. Initial computation count: ${computations}`);
console.log(`   doubled() = ${doubled()}`);
console.log(`   Computations: ${computations}\n`);

console.log(`2. Read doubled() again (should use cache):`);
console.log(`   doubled() = ${doubled()}`);
console.log(`   Computations: ${computations}\n`);

console.log(`3. Change signal: setCount(5)`);
setCount(5);
console.log(`   Memo state: ${doubled._computation ? "UNKNOWN" : "UNKNOWN"}`);
console.log(
  `   Computations: ${computations} (should still be ${computations})\n`
);

console.log(`4. Read doubled() (should trigger lazy recomputation):`);
const result = doubled();
console.log(`   doubled() = ${result}`);
console.log(`   Computations: ${computations} (should be ${computations})`);
console.log(`   Expected: 10, Got: ${result}`);

if (result === 10) {
  console.log("\n✅ MEMO LAZY EVALUATION WORKS!");
} else {
  console.log(`\n❌ MEMO LAZY EVALUATION BROKEN! Expected 10, got ${result}`);
}
