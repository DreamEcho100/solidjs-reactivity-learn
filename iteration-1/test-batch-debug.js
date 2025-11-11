import { createSignal, createEffect, batch } from "./siganl-0.js";

(async function test() {
  console.log("=== BATCHING TEST ANALYSIS ===\n");

  const [count, setCount] = createSignal(0);
  let effectRuns = 0;

  createEffect(() => {
    count();
    effectRuns++;
    console.log(`Effect run #${effectRuns}, count = ${count()}`);
  });

  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(`\nAfter initial: effectRuns = ${effectRuns} (expected: 1)\n`);

  // Test 1: Two separate updates WITHOUT batch
  console.log("Test 1: Two separate setCount() calls");
  setCount(1);
  console.log(`  After setCount(1): effectRuns = ${effectRuns}`);
  setCount(2);
  console.log(`  After setCount(2): effectRuns = ${effectRuns}`);

  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(`  After tick: effectRuns = ${effectRuns} (test expects: 3)\n`);

  // Test 2: Three updates WITH batch
  console.log("Test 2: Three setCount() calls in batch()");
  batch(() => {
    setCount(10);
    console.log(`  After setCount(10) in batch: effectRuns = ${effectRuns}`);
    setCount(20);
    console.log(`  After setCount(20) in batch: effectRuns = ${effectRuns}`);
    setCount(30);
    console.log(`  After setCount(30) in batch: effectRuns = ${effectRuns}`);
  });
  console.log(`  After batch() ends: effectRuns = ${effectRuns}`);

  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(`  After tick: effectRuns = ${effectRuns} (test expects: 4)`);
  console.log(`  Final count = ${count()}`);

  console.log("\n=== ANALYSIS ===");
  console.log(
    "The system already batches updates automatically via microtask!"
  );
  console.log(
    "Two separate setCount() calls both queue microtasks, but they merge."
  );
  console.log('So "without batch" and "with batch" behave identically.');
})();
