// Test: Nested effects cleanup
import { createSignal, createEffect, onCleanup } from "./siganl-0.js";

(async () => {
  console.log("=== Test: Nested Effect Cleanup ===\n");

  let outerRuns = 0;
  let innerRuns = 0;
  let outerCleanups = 0;
  let innerCleanups = 0;

  const [trigger, setTrigger] = createSignal(0);

  createEffect(() => {
    const t = trigger();
    outerRuns++;
    console.log(`[Outer Effect] Run #${outerRuns}, trigger=${t}`);

    onCleanup(() => {
      outerCleanups++;
      console.log(`  [Outer Cleanup] #${outerCleanups}`);
    });

    // Create inner effect
    createEffect(() => {
      innerRuns++;
      console.log(`  [Inner Effect] Run #${innerRuns}`);

      onCleanup(() => {
        innerCleanups++;
        console.log(`    [Inner Cleanup] #${innerCleanups}`);
      });
    });
  });

  await new Promise((resolve) => setTimeout(resolve, 50));

  console.log("\n--- After initial run ---");
  console.log(`Outer runs: ${outerRuns}, Outer cleanups: ${outerCleanups}`);
  console.log(`Inner runs: ${innerRuns}, Inner cleanups: ${innerCleanups}`);
  console.log(`Expected: outer=1, inner=1, both cleanups=0`);

  console.log("\n--- Triggering re-run ---");
  setTrigger(1);

  await new Promise((resolve) => setTimeout(resolve, 50));

  console.log("\n--- After re-run ---");
  console.log(`Outer runs: ${outerRuns}, Outer cleanups: ${outerCleanups}`);
  console.log(`Inner runs: ${innerRuns}, Inner cleanups: ${innerCleanups}`);
  console.log(`Expected: outer=2, inner=2, both cleanups=1`);
  console.log(`\nReasoning:`);
  console.log(`  - Outer effect re-runs`);
  console.log(`  - Outer cleanup should run (before re-execution)`);
  console.log(`  - OLD inner effect should be DISPOSED (cleanup runs)`);
  console.log(`  - NEW inner effect created and runs`);

  if (outerCleanups === 1 && innerCleanups === 1) {
    console.log("\n✅ TEST PASSED: Nested effects cleanup properly!");
  } else {
    console.log("\n❌ TEST FAILED: Inner effect cleanup not running!");
    console.log(
      `   Problem: Old inner effects not disposed before outer re-runs`
    );
  }
})();
