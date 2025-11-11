import { createSignal, createMemo } from "./siganl-0.js";

const nextTick = () => new Promise((resolve) => queueMicrotask(resolve));

async function testSimpleMemo() {
  console.log("=== SIMPLE MEMO BUG TEST ===\n");

  const [signal1, setSignal1] = createSignal(1);
  const [signal2, setSignal2] = createSignal(10);

  const memo1 = createMemo(() => {
    const val = signal1();
    console.log(`  [memo1] Computing: signal1=${val}, result=${val * 2}`);
    return val * 2;
  });

  const memo2 = createMemo(() => {
    const val = signal2();
    console.log(`  [memo2] Computing: signal2=${val}, result=${val + 5}`);
    return val + 5;
  });

  console.log("1. Initial read:");
  console.log(`   memo1() = ${memo1()} (expected: 2)`);
  console.log(`   memo2() = ${memo2()} (expected: 15)`);

  console.log("\n2. Change signal1:");
  setSignal1(5);
  await nextTick();
  console.log(`   memo1() = ${memo1()} (expected: 10)`);

  console.log("\n3. Change signal2:");
  setSignal2(20);
  await nextTick();
  console.log(`   memo2() = ${memo2()} (expected: 25)`);

  console.log("\n4. Change signal1 again:");
  setSignal1(7);
  await nextTick();

  console.log("\n5. Read memo2 (should still be 25):");
  console.log(`   memo2() = ${memo2()} (expected: 25)`);

  console.log("\n6. Read memo1 (should recompute to 14):");
  console.log(`   memo1() = ${memo1()} (expected: 14)`);
}

testSimpleMemo();
