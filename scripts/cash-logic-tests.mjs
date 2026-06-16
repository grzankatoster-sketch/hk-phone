import assert from "node:assert/strict";
import { calculateSafeDeposit, calculateShiftCash, parseCashAmount } from "../src/lib/cash.mjs";

const money = value => Math.round(value * 100) / 100;

assert.equal(parseCashAmount("123,45"), 123.45);
assert.equal(parseCashAmount(""), 0);

{
  const result = calculateShiftCash({ stalaKasowa: 500, kwTotal: 0, kwTotalInput: 120 });
  assert.equal(result.kwIncrement, 120);
  assert.equal(result.endingCash, 620);
  assert.equal(result.nextKwTotal, 120);
}

{
  const result = calculateShiftCash({ stalaKasowa: 620, kwTotal: 120, kwTotalInput: 180 });
  assert.equal(result.kwIncrement, 60);
  assert.equal(result.endingCash, 680);
  assert.equal(result.nextKwTotal, 180);
}

{
  const result = calculateShiftCash({ stalaKasowa: 620, kwTotal: 180, kwTotalInput: 150 });
  assert.equal(result.kwIncrement, 0);
  assert.equal(result.endingCash, 620);
  assert.equal(result.nextKwTotal, 150);
}

{
  const result = calculateSafeDeposit({
    stalaKasowa: 680,
    kwTotal: 180,
    safeDepositKW: 260,
    safeDepositAmount: 220,
    postDepositKW: 35,
  });
  assert.equal(result.kwIncrement, 80);
  assert.equal(result.totalBeforeDeposit, 760);
  assert.equal(result.endingCash, 540);
  assert.equal(result.nextKwTotal, 35);
}

{
  const sequence = [
    calculateShiftCash({ stalaKasowa: 500, kwTotal: 0, kwTotalInput: 100 }),
    calculateShiftCash({ stalaKasowa: 600, kwTotal: 100, kwTotalInput: 180 }),
    calculateSafeDeposit({ stalaKasowa: 680, kwTotal: 180, safeDepositKW: 250, safeDepositAmount: 200, postDepositKW: 20 }),
    calculateShiftCash({ stalaKasowa: 550, kwTotal: 20, kwTotalInput: 90 }),
  ];
  assert.deepEqual(sequence.map(row => money(row.endingCash)), [600, 680, 550, 620]);
  assert.deepEqual(sequence.map(row => money(row.nextKwTotal)), [100, 180, 20, 90]);
}

console.log("Cash logic tests passed.");
