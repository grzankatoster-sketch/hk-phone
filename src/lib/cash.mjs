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

// Kwoty wpłaty do sejfu wg trybu zamknięcia zmiany (match/zero/reported) — czysta
// wersja logiki z handleSafeDeposit w App.jsx (WYKONANIE 2.12, strefa zamrożona).
// UWAGA: świadomie zachowuje DOKŁADNĄ semantykę oryginału — parsowanie parseFloat(x)||0
// (NIE parseCashAmount: "260,50" → 260, nie 260.5) i BEZ round2 — żeby wynik był
// bit-w-bit identyczny z dotychczasowym kodem inline. Nie zmieniać bez pełnych testów.
export function computeSafeDeposit({ mode = "match", safeDepositKW, kwTotal, safeCounted, stalaKasowa, postDepositKW }) {
  const num = (v) => parseFloat(v) || 0;
  const kwNew = num(safeDepositKW);
  const kwPrev = num(kwTotal);
  const stala = num(stalaKasowa);
  const counted = num(safeCounted);
  const kwIncrement = Math.max(0, kwNew - kwPrev);
  const totalBeforeDeposit = stala + kwIncrement;
  let deposit, newStala;
  if (mode === "zero") { deposit = 0; newStala = stala; }
  else if (mode === "reported") { deposit = counted; newStala = stala + kwIncrement - counted; }
  else { deposit = kwIncrement; newStala = stala; }
  return { kwIncrement, counted, totalBeforeDeposit, deposit, newStala, postKW: num(postDepositKW) };
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
    // Czerwona flaga: wpłacono więcej niż było w kasie → kasa schodzi poniżej zera.
    overDeposit: deposit > shiftCash.endingCash,
  };
}
