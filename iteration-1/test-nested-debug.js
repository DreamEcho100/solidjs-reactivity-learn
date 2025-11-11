// Debug test: Nested effects cleanup with logging
import { createSignal, createEffect, onCleanup } from "./siganl-0.js";

(async () => {
  console.log("=== Debug: Nested Effect Cleanup ===\n");

  let outerRuns = 0;
  let innerRuns = 0;
  let outerCleanups = 0;
  let innerCleanups = 0;

  const [trigger, setTrigger] = createSignal(0);

  const outerEffect = createEffect(() => {
    const t = trigger();
    outerRuns++;
    console.log(`[Outer Effect] Run #${outerRuns}, trigger=${t}`);

    onCleanup(() => {
      outerCleanups++;
      console.log(`  [Outer Cleanup] #${outerCleanups}`);
    });

    // Create inner effect
    const innerEffect = createEffect(() => {
      innerRuns++;
      console.log(`  [Inner Effect] Run #${innerRuns}`);

      onCleanup(() => {
        innerCleanups++;
        console.log(`    [Inner Cleanup] #${innerCleanups}`);
      });
    });

    console.log(
      `  [DEBUG] Inner effect created, cleanup registered:`,
      innerEffect
    );
  });

  await new Promise((resolve) => setTimeout(resolve, 50));

  console.log("\n--- After initial run ---");
  console.log(`Outer runs: ${outerRuns}, Outer cleanups: ${outerCleanups}`);
  console.log(`Inner runs: ${innerRuns}, Inner cleanups: ${innerCleanups}`);

  console.log("\n--- Triggering re-run ---");
  setTrigger(1);

  await new Promise((resolve) => setTimeout(resolve, 50));

  console.log("\n--- After re-run ---");
  console.log(`Outer runs: ${outerRuns}, Outer cleanups: ${outerCleanups}`);
  console.log(`Inner runs: ${innerRuns}, Inner cleanups: ${innerCleanups}`);

  if (outerCleanups === 1 && innerCleanups === 1) {
    console.log("\n✅ TEST PASSED!");
  } else {
    console.log("\n❌ TEST FAILED!");
  }
})();
