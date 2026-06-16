import { describe, it, expect } from "vitest";
import { calculateSafeDeposit, calculateShiftCash, parseCashAmount } from "../src/lib/cash.mjs";

const money = value => Math.round(value * 100) / 100;

describe("parseCashAmount", () => {
  it("parsuje przecinek dziesiętny jak w PL", () => {
    expect(parseCashAmount("123,45")).toBe(123.45);
  });
  it("pusty string → 0", () => {
    expect(parseCashAmount("")).toBe(0);
  });
  it("liczba przechodzi bez zmian", () => {
    expect(parseCashAmount(42)).toBe(42);
  });
  it("śmieci/null/undefined → 0 (nigdy NaN)", () => {
    expect(parseCashAmount(null)).toBe(0);
    expect(parseCashAmount(undefined)).toBe(0);
    expect(parseCashAmount("abc")).toBe(0);
  });
});

describe("calculateShiftCash", () => {
  it("pierwsze KW na zmianie — przyrost = wpisana wartość", () => {
    const r = calculateShiftCash({ stalaKasowa: 500, kwTotal: 0, kwTotalInput: 120 });
    expect(r.kwIncrement).toBe(120);
    expect(r.endingCash).toBe(620);
    expect(r.nextKwTotal).toBe(120);
  });

  it("kolejna zmiana — przyrost to różnica względem poprzedniego KW", () => {
    const r = calculateShiftCash({ stalaKasowa: 620, kwTotal: 120, kwTotalInput: 180 });
    expect(r.kwIncrement).toBe(60);
    expect(r.endingCash).toBe(680);
    expect(r.nextKwTotal).toBe(180);
  });

  it("wpisane KW niższe niż poprzednie — przyrost nie schodzi poniżej 0", () => {
    const r = calculateShiftCash({ stalaKasowa: 620, kwTotal: 180, kwTotalInput: 150 });
    expect(r.kwIncrement).toBe(0);
    expect(r.endingCash).toBe(620);
    expect(r.nextKwTotal).toBe(150);
  });
});

describe("calculateSafeDeposit", () => {
  it("wpłata do sejfu pomniejsza gotówkę, KW resetuje się do post-deposit", () => {
    const r = calculateSafeDeposit({
      stalaKasowa: 680,
      kwTotal: 180,
      safeDepositKW: 260,
      safeDepositAmount: 220,
      postDepositKW: 35,
    });
    expect(r.kwIncrement).toBe(80);
    expect(r.totalBeforeDeposit).toBe(760);
    expect(r.endingCash).toBe(540);
    expect(r.nextKwTotal).toBe(35);
  });
});

describe("sekwencja zmian (regresja całego dnia)", () => {
  it("zachowuje spójność endingCash i nextKwTotal przez 4 kroki", () => {
    const sequence = [
      calculateShiftCash({ stalaKasowa: 500, kwTotal: 0, kwTotalInput: 100 }),
      calculateShiftCash({ stalaKasowa: 600, kwTotal: 100, kwTotalInput: 180 }),
      calculateSafeDeposit({ stalaKasowa: 680, kwTotal: 180, safeDepositKW: 250, safeDepositAmount: 200, postDepositKW: 20 }),
      calculateShiftCash({ stalaKasowa: 550, kwTotal: 20, kwTotalInput: 90 }),
    ];
    expect(sequence.map(r => money(r.endingCash))).toEqual([600, 680, 550, 620]);
    expect(sequence.map(r => money(r.nextKwTotal))).toEqual([100, 180, 20, 90]);
  });
});
