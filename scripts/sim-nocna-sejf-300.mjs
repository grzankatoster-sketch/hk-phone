// Symulacja end-to-end: NOCNA zmiana, KW = 300 zł → strażnik sejfu → wpłata
// → logowanie PORANNEJ zmiany → sprawdzenie zgodności kasy.
//
// Wiernie odwzorowuje:
//   - attemptLeaveShift (strażnik wyjścia)          App.jsx:1886-1893
//   - handleSafeDeposit (rejestracja wpłaty, inline) App.jsx:1909-1940
//   - inicjalizacja stała/KW przy logowaniu          App.jsx:999-1000
//
// Run: node scripts/sim-nocna-sejf-300.mjs

const fmt = n => `${Number(n).toFixed(2)} zł`;
const line = () => console.log("─".repeat(60));

// ── mock localStorage (to co przeżywa między zmianami) ──────────────────
const LS = new Map();
const STALA_KASOWA_KEY = "reception-stala-kasowa";
const KW_TOTAL_KEY = "reception-kw-total";
const SAFE_KEY = "reception-safe-amount";

// ── STAN POCZĄTKOWY (przed nocną) ───────────────────────────────────────
// Stała kasowa domyślnie 500 zł, KW dnia zaczyna od 0.
LS.set(STALA_KASOWA_KEY, "500");
LS.set(KW_TOTAL_KEY, "0");

console.log("\n=== START: logowanie na NOCNĄ zmianę ===");
// mount: useState czyta z localStorage (App.jsx:999-1000)
let stalaKasowa = (() => { const v = LS.get(STALA_KASOWA_KEY); return v && !isNaN(parseFloat(v)) ? parseFloat(v) : 500; })();
let kwTotal = (() => { const v = LS.get(KW_TOTAL_KEY); return v && !isNaN(parseFloat(v)) ? parseFloat(v) : 0; })();
const selectedShift = "nocna";
console.log(`Stała kasowa w kasie:  ${fmt(stalaKasowa)}`);
console.log(`KW przeniesione:       ${fmt(kwTotal)}`);
console.log(`Zmiana:                ${selectedShift}`);

// W trakcie nocy recepcja przyjęła gotówkę. Wydruk KW z drukarki = 300 zł.
const safeDepositKW = "300";
const safeDepositManual = false;   // domyślnie: do sejfu trafia przyrost KW
const safeDepositAmount = "";       // (używane tylko gdy manual)
const postDepositKW = "0";          // brak płatności po wpłacie do sejfu

// ── STRAŻNIK WYJŚCIA (App.jsx:1886-1893) ────────────────────────────────
line();
const requiresSafeDeposit = selectedShift === "nocna" || selectedShift === "wieczorowa";
const safeDepositRegistered = false;
const started = true;
const minElapsed = 45; // przepracowane > 10 min
let safeGuardOpen = false;
if (started && requiresSafeDeposit && !safeDepositRegistered && minElapsed >= 10) {
  safeGuardOpen = true;
}
console.log(`Pracownik klika „zakończ zmianę" po ${minElapsed} min...`);
console.log(safeGuardOpen
  ? '🔔 OKNO STRAŻNIKA SEJFU WYSKOCZYŁO — nocna nie wyjdzie bez wpłaty.'
  : '❌ Okno NIE wyskoczyło (błąd!).');

// ── handleSafeDeposit (App.jsx:1909-1940) ───────────────────────────────
line();
console.log(`W oknie wpłaty wpisuję KW z wydruku: ${fmt(parseFloat(safeDepositKW))}`);
const kwNew = parseFloat(safeDepositKW) || 0;
const kwPrev = kwTotal;
const kwIncrement = Math.max(0, kwNew - kwPrev);
const deposit = safeDepositManual ? (parseFloat(safeDepositAmount) || 0) : kwIncrement;
const totalBeforeDeposit = stalaKasowa + kwIncrement;
const newStala = totalBeforeDeposit - deposit;

LS.set(STALA_KASOWA_KEY, String(newStala));
LS.set(SAFE_KEY, String(newStala));
const postKW = parseFloat(postDepositKW) || 0;
LS.set(KW_TOTAL_KEY, String(postKW));

console.log(`Przyrost KW (do sejfu):     ${fmt(kwIncrement)}`);
console.log(`Stan kasy przed wpłatą:     ${fmt(totalBeforeDeposit)}  (stała ${fmt(stalaKasowa)} + KW ${fmt(kwIncrement)})`);
console.log(`💰 WPŁATA DO SEJFU:          ${fmt(deposit)}`);
console.log(`Nowa stała kasowa w kasie:  ${fmt(newStala)}`);
console.log(`KW po wpłacie (przenoszone): ${fmt(postKW)}`);
console.log("✅ Wpłata zarejestrowana, zmiana nocna zakończona.");

// ── LOGOWANIE PORANNEJ ZMIANY (świeży mount, czyta localStorage) ────────
line();
console.log("\n=== Logowanie na PORANNĄ zmianę (nowa sesja) ===");
const stalaPoranna = (() => { const v = LS.get(STALA_KASOWA_KEY); return v && !isNaN(parseFloat(v)) ? parseFloat(v) : 500; })();
const kwPoranna = (() => { const v = LS.get(KW_TOTAL_KEY); return v && !isNaN(parseFloat(v)) ? parseFloat(v) : 0; })();
const sejf = parseFloat(LS.get(SAFE_KEY));
console.log(`Poranna widzi stałą kasową: ${fmt(stalaPoranna)}`);
console.log(`Poranna widzi KW:           ${fmt(kwPoranna)}`);

// ── SPRAWDZENIE ZGODNOŚCI ───────────────────────────────────────────────
line();
console.log("\n=== KONTROLA ZGODNOŚCI ===");
const gotowkaNocyPrzedWplata = totalBeforeDeposit;             // ile fizycznie było w kasie na koniec nocy
const rozliczenie = stalaPoranna + deposit;                    // kasa rano + to co poszło do sejfu
console.log(`Gotówka w kasie na koniec nocy:        ${fmt(gotowkaNocyPrzedWplata)}`);
console.log(`Kasa rano (${fmt(stalaPoranna)}) + sejf (${fmt(deposit)}): ${fmt(rozliczenie)}`);

const zgodneRozliczenie = Math.abs(rozliczenie - gotowkaNocyPrzedWplata) < 0.005;
const zgodnaStala = Math.abs(stalaPoranna - 500) < 0.005;       // wróciła do stałej
const kwWyzerowane = Math.abs(kwPoranna - 0) < 0.005;

console.log(zgodneRozliczenie ? "✅ Rozliczenie kasa+sejf = stan nocy: ZGODNE"
                              : "❌ Rozliczenie NIEZGODNE");
console.log(zgodnaStala ? "✅ Stała kasowa wróciła do 500 zł"
                        : `❌ Stała kasowa NIE wróciła do 500 (jest ${fmt(stalaPoranna)})`);
console.log(kwWyzerowane ? "✅ KW wyzerowane na nowy dzień"
                         : `❌ KW nie wyzerowane (${fmt(kwPoranna)})`);

line();
const ok = safeGuardOpen && zgodneRozliczenie && zgodnaStala && kwWyzerowane;
console.log(ok ? "\n🟢 WYNIK: Symulacja zgodna — kwota się zgadza.\n"
              : "\n🔴 WYNIK: Wykryto rozbieżność!\n");
process.exit(ok ? 0 : 1);
