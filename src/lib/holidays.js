// Polski kalendarz świąt + długich weekendów dla silnika cen (WYKONANIE 4.20).
// Powód: sam dzień tygodnia nie łapie skoków cen w święta — dane KWHotel pokazują
// ADR ~370–405 zł w majówkę/Wielkanoc/Nowy Rok przy podobnym obłożeniu co zwykłe
// ~200 zł. holidayFactor(date) zwraca mnożnik ≥1 + etykietę (do uzasadnienia AI/UI).
// Święta ruchome liczone z Wielkanocy (algorytm Gaussa) — działa dla każdego roku.

function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day, 12));
}
const addDays = (date, n) => new Date(date.getTime() + n * 86400000);
const key = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

// Mnożniki: skok w sam dzień świąteczny/weekend świąteczny większy, dzień-most (bridge) też.
const F_HOLIDAY = 1.22;   // dzień ustawowo wolny w sezonie popytu (majówka, Wielkanoc, Nowy Rok…)
const F_BRIDGE  = 1.18;   // dzień „mostkowy" długiego weekendu (pon/pt między świętem a weekendem)
const F_EVE     = 1.10;   // wigilia dużego święta (wzmożony przyjazd)

const cache = new Map();

function buildYear(year) {
  const map = new Map(); // dateKey -> { factor, label }
  const set = (d, factor, label) => {
    const k = key(d);
    const cur = map.get(k);
    if (!cur || factor > cur.factor) map.set(k, { factor, label });
  };

  // Święta stałe (popytowe — pomijamy te w martwym sezonie jak 1/11, 11/11 traktujemy neutralnie-lekko)
  const fixed = [
    [0, 1, "Nowy Rok"], [0, 6, "Trzech Króli"],
    [4, 1, "Majówka (1 maja)"], [4, 3, "Święto Konstytucji 3 Maja"],
    [7, 15, "Wniebowzięcie / długi weekend sierpniowy"],
    [10, 1, "Wszystkich Świętych"], [10, 11, "Święto Niepodległości"],
    [11, 24, "Wigilia"], [11, 25, "Boże Narodzenie"], [11, 26, "Drugi dzień świąt"], [11, 31, "Sylwester"],
  ];
  for (const [m, day, label] of fixed) set(new Date(Date.UTC(year, m, day, 12)), F_HOLIDAY, label);

  // Święta ruchome
  const easter = easterSunday(year);
  set(easter, F_HOLIDAY, "Niedziela Wielkanocna");
  set(addDays(easter, 1), F_HOLIDAY, "Poniedziałek Wielkanocny");
  set(addDays(easter, -2), F_EVE, "Wielki Piątek");
  set(addDays(easter, 49), F_HOLIDAY, "Zielone Świątki");
  set(addDays(easter, 60), F_HOLIDAY, "Boże Ciało");

  // Długie weekendy: święto w czwartek → piątek most; święto we wtorek → poniedziałek most.
  for (const [k, v] of [...map.entries()]) {
    const d = new Date(k + "T12:00:00Z");
    const dow = d.getUTCDay(); // 0=nd..6=sb
    if (dow === 4) set(addDays(d, 1), F_BRIDGE, "Długi weekend (piątek)");      // czw → pt
    if (dow === 2) set(addDays(d, -1), F_BRIDGE, "Długi weekend (poniedziałek)"); // wt → pn
  }
  return map;
}

// dateStr: "YYYY-MM-DD". Zwraca { factor: ≥1, label: string|null }.
export function holidayFactor(dateStr) {
  if (!dateStr) return { factor: 1, label: null };
  const year = Number(String(dateStr).slice(0, 4));
  if (!Number.isFinite(year)) return { factor: 1, label: null };
  if (!cache.has(year)) cache.set(year, buildYear(year));
  return cache.get(year).get(String(dateStr).slice(0, 10)) || { factor: 1, label: null };
}
