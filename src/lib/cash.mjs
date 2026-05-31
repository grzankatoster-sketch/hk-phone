export function parseCashAmount(value) {
  const number = typeof value === "number" ? value : parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) ? number : 0;
}

export function calculateShiftCash({ stalaKasowa, kwTotal, kwTotalInput }) {
  const stala = parseCashAmount(stalaKasowa);
  const previousKw = parseCashAmount(kwTotal);
  const enteredKw = parseCashAmount(kwTotalInput);
  const kwIncrement = Math.max(0, enteredKw - previousKw);
  const endingCash = stala + kwIncrement;

  return {
    stala,
    previousKw,
    enteredKw,
    kwIncrement,
    endingCash,
    nextKwTotal: enteredKw,
  };
}

export function calculateSafeDeposit({ stalaKasowa, kwTotal, safeDepositKW, safeDepositAmount, postDepositKW }) {
  const shiftCash = calculateShiftCash({
    stalaKasowa,
    kwTotal,
    kwTotalInput: safeDepositKW,
  });
  const deposit = parseCashAmount(safeDepositAmount);
  const postDeposit = parseCashAmount(postDepositKW);
  const endingCash = shiftCash.endingCash - deposit;

  return {
    ...shiftCash,
    deposit,
    postDeposit,
    totalBeforeDeposit: shiftCash.endingCash,
    endingCash,
    nextKwTotal: postDeposit,
  };
}
