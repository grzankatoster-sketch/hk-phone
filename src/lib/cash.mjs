export function parseCashAmount(value) {
  const number = typeof value === "number" ? value : parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) ? number : 0;
}

// Zaokrąglenie do grosza — gotówka zawsze 2 miejsca, bez artefaktów
// zmiennoprzecinkowych (np. 180.57 - 120.42 = 60.150000000000006 → 60.15).
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

export function calculateShiftCash({ stalaKasowa, kwTotal, kwTotalInput }) {
  const stala = parseCashAmount(stalaKasowa);
  const previousKw = parseCashAmount(kwTotal);
  const enteredKw = parseCashAmount(kwTotalInput);
  const kwIncrement = round2(Math.max(0, enteredKw - previousKw));
  const endingCash = round2(stala + kwIncrement);

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
  const endingCash = round2(shiftCash.endingCash - deposit);

  return {
    ...shiftCash,
    deposit,
    postDeposit,
    totalBeforeDeposit: shiftCash.endingCash,
    endingCash,
    nextKwTotal: postDeposit,
  };
}
