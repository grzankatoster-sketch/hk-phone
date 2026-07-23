// import-kwhotel-meals-pdf.mjs — import "Raport Posiłków" (PDF, ReportThreeDayMeals
// z KWHotel) do tabeli meal_plans. Ten raport PRZYCHODZI SAM mailem 2x dziennie
// (~6:00 i ~16:00) — w przeciwieństwie do CSV "Posiłki i usługi w rezerwacji"
// (import-kwhotel-meals.mjs), który trzeba eksportować ręcznie. Zawsze pokrywa
// tylko 3 dni do przodu (bug w samym KWHotel — patrz komentarz w kodzie
// scripts/kwhotel-raporty/pg-posilki-zakres.frx, nie da się tego naprawić
// z zewnątrz), więc to WYSTARCZA dokładnie pod dzisiejszy zakres kalendarza appki
// (posilki-kalendarz.html pokazuje też tylko 3 dni).
//
// Format PDF: tabela krzyżowa — wiersz = rezerwacja (Nazwa, nr rez., od-do,
// Liczba os., nr pok.), kolumny = 3 dni × 8 kodów posiłków (S/S2/O/O2/OK/OK2/K/K2:
// Śniadanie/połówka, Obiad/połówka, Obiadokolacja/połówka, Kolacja/połówka).
// PDF nie ma prawdziwych "kolumn" — parsujemy po WSPÓŁRZĘDNYCH (x,y) każdego
// fragmentu tekstu, wzorem już istniejącego parseWeeklyGrid w
// scripts/hk-automation/lib/parser.cjs (ten sam problem: płaski tekst gubi
// puste komórki i kolejność kolumn).
//
// Kategoria BB/HB: HB jeśli w KTÓRYMKOLWIEK z 3 dni jest OK>0 lub K>0, inaczej BB.
// Rezerwacje grupowe (nr rez. kończy się na "G") NIE MAJĄ numeru pokoju w tym
// raporcie (kolumna pusta albo sentinel "-1") — jeden zbiorczy wiersz na całą
// grupę zamiast per-pokój. Zapisywane jako osobna pozycja is_group=true (room =
// numer rezerwacji, np. "5045G"), z syntetycznym arrival/departure wyliczonym
// z flag S/K/OK per dzień (groupDateRange) — bez tego grupy (bywają większością
// gości, patrz incydent 23.07: pominięcie grup zaniżało łączną liczbę śniadań
// o połowę) całkiem znikały z liczb.
//
// Użycie:
//   node scripts/import-kwhotel-meals-pdf.mjs "Raport Posiłków.pdf"        (podgląd, nic nie wysyła)
//   node scripts/import-kwhotel-meals-pdf.mjs "Raport Posiłków.pdf" --commit  (wysyła do Supabase)
//
// UWAGA: parser oparty o pozycje tekstu w PDF jest z natury delikatny (różne
// wersje/ustawienia FastReport mogą inaczej rozmieszczać tekst) — stąd tryb
// podglądu domyślny. Sprawdź wypisane rezerwacje PRZED użyciem --commit.

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import pdfParse from "pdf-parse";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env") });

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const TENANT_ID = process.env.VITE_TENANT_ID || "00000000-0000-0000-0000-000000000001";

// Wzorem scripts/hk-automation/lib/pdf.cjs extractPdfPositions — pozycje (x,y) każdego
// fragmentu tekstu, potrzebne bo płaski tekst z tabeli krzyżowej gubi kolejność kolumn.
async function extractPositions(pdfPath) {
  const items = [];
  function pagerender(pageData) {
    return pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false }).then((tc) => {
      tc.items.forEach((it) => {
        const s = String(it.str || "").trim();
        if (!s) return;
        items.push({ page: pageData.pageIndex, x: Math.round(it.transform[4]), y: Math.round(it.transform[5]), s });
      });
      return "";
    });
  }
  await pdfParse(readFileSync(pdfPath), { pagerender });
  return items;
}

const MEAL_CODES = ["S", "S/2", "O", "O/2", "OK", "OK/2", "K", "K/2"];
const DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const RESID_RE = /^\d{4,7}G?$/;

const ddmmyyyyToIso = (s) => {
  const m = s.match(DATE_RE);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

// Rezerwacje grupowe nie mają numeru pokoju w tym raporcie — odtwarzamy
// syntetyczny (arrival, departure) z samych flag S/K/OK per dzień, tak żeby
// app-owy filtr dał dokładnie te dni co w raporcie. Patrz ten sam kod w
// scripts/hk-automation/lib/parser-posilki.cjs (utrzymywane w synchronizacji).
function groupDateRange(perDay, DATES) {
  const breakfastIdx = perDay.map((d, i) => (d.S > 0 ? i : -1)).filter((i) => i >= 0);
  const dinnerIdx = perDay.map((d, i) => (d.K > 0 || d.OK > 0 ? i : -1)).filter((i) => i >= 0);
  let arrivalIdx = Infinity;
  if (breakfastIdx.length) arrivalIdx = Math.min(arrivalIdx, Math.min(...breakfastIdx) - 1);
  if (dinnerIdx.length) arrivalIdx = Math.min(arrivalIdx, Math.min(...dinnerIdx));
  let departureIdx = -Infinity;
  if (breakfastIdx.length) departureIdx = Math.max(departureIdx, Math.max(...breakfastIdx));
  if (dinnerIdx.length) departureIdx = Math.max(departureIdx, Math.max(...dinnerIdx) + 1);
  const offset = (iso, days) => {
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  return { arrival: offset(DATES[0], arrivalIdx), departure: offset(DATES[0], departureIdx) };
}

function parsePositions(items) {
  const warnings = [];

  // 1) Nagłówek dat — wiersz z największą liczbą fragmentów pasujących do DD.MM.YYYY.
  const byY = {};
  items.filter((i) => DATE_RE.test(i.s)).forEach((i) => { (byY[i.y] = byY[i.y] || []).push(i); });
  let headerRow = null;
  Object.values(byY).forEach((row) => { if (!headerRow || row.length > headerRow.length) headerRow = row; });
  if (!headerRow || !headerRow.length) throw new Error("Nie znaleziono nagłówka z datami (DD.MM.YYYY) w PDF.");
  const dateCols = headerRow.slice().sort((a, b) => a.x - b.x);
  const DATES = dateCols.map((c) => ddmmyyyyToIso(c.s));
  const headerY = headerRow[0].y;

  // 2) Nagłówek kodów posiłków — leży kilka linii NIŻEJ (współrzędna y mniejsza w PDF-space
  //    zwykle rośnie w górę strony; sprawdzamy obie strony dla bezpieczeństwa).
  const codeItems = items.filter((i) => MEAL_CODES.includes(i.s) && Math.abs(i.y - headerY) < 60);
  if (!codeItems.length) warnings.push("Nie znaleziono nagłówków kodów posiłków (S/O/OK/K) — sprawdź układ PDF.");
  const dayOf = (x) => {
    let best = 0, bestD = Infinity;
    dateCols.forEach((c, idx) => { const d = Math.abs(x - c.x); if (d < bestD) { bestD = d; best = idx; } });
    return best;
  };
  const colMap = codeItems.map((i) => ({ day: dayOf(i.x), code: i.s, x: i.x }));

  // 3) Wiersze rezerwacji — zakotwiczone o nr rezerwacji (cyfry, opcjonalnie z "G" na końcu).
  const dataY = Math.min(headerY, ...codeItems.map((c) => c.y)) - 5;
  const anchors = items.filter((i) => RESID_RE.test(i.s) && i.y < dataY);
  if (!anchors.length) warnings.push("Nie znaleziono żadnego numeru rezerwacji — sprawdź czy PDF ma dane (nie tylko nagłówek).");

  const firstMealColX = colMap.length ? Math.min(...colMap.map((c) => c.x)) : Infinity;
  const HALF_DATE_RE = /^(\d{2}\.\d{2}\.\d{4})-?$/;

  const reservations = [];
  const seenRows = new Set();
  anchors.forEach((a) => {
    const rowKey = `${a.page}:${a.y}`;
    if (seenRows.has(rowKey)) return; // ta sama rezerwacja może się powtórzyć jeśli tekst zawinął
    seenRows.add(rowKey);
    // Odległość do najbliższej INNEJ rezerwacji na TEJ SAMEJ stronie — żeby okno
    // wyszukiwania (data zawinięta na 2 linie) nigdy nie wjechało w sąsiedni wiersz.
    const otherAnchorsSamePage = anchors.filter((o) => o.page === a.page && o !== a);
    const nearestOtherDist = otherAnchorsSamePage.length
      ? Math.min(...otherAnchorsSamePage.map((o) => Math.abs(o.y - a.y)))
      : 999;
    const rowWindow = Math.max(3, Math.min(10, Math.floor(nearestOtherDist / 2) - 1));

    // Wiersz danych (imię, nr pok., kody posiłków) leży na JEDNEJ linii Y — tolerancja wąska,
    // zawsze ograniczona do tej samej strony PDF (współrzędne Y resetują się per strona).
    const rowItems = items.filter((i) => i.page === a.page && Math.abs(i.y - a.y) <= 3);
    const sorted = rowItems.slice().sort((x, y2) => x.x - y2.x);
    const nameParts = sorted.filter((i) => i.x < a.x - 5 && !HALF_DATE_RE.test(i.s) && i.s !== a.s);
    const name = nameParts.map((i) => i.s).join(" ").trim();

    // Zakres "od-do" bywa zawinięty na DWIE linie w tej samej komórce (np. "22.07.2026-"
    // nad "25.07.2026") — szukamy dat w oknie Y dociętym do połowy odległości do
    // najbliższego sąsiedniego wiersza, żeby nie złapać cudzego zakresu dat.
    const dateFrags = items
      .filter((i) => i.page === a.page && Math.abs(i.y - a.y) <= rowWindow && HALF_DATE_RE.test(i.s))
      .map((i) => ddmmyyyyToIso(i.s.replace(/-$/, "")))
      .filter(Boolean)
      .sort();
    const arrival = dateFrags[0] || null;
    const departure = dateFrags[dateFrags.length - 1] || null;

    // Liczba os. i nr pok. — dwie liczby całkowite na tej samej linii, między
    // numerem rezerwacji a pierwszą kolumną kodów posiłków.
    const numsBeforeMeals = rowItems
      .filter((i) => i.x > a.x && /^-?\d+$/.test(i.s) && i.x < firstMealColX - 10)
      .sort((x, y2) => x.x - y2.x);
    const persons = numsBeforeMeals[0] ? parseInt(numsBeforeMeals[0].s, 10) : 1;
    const room = numsBeforeMeals[1] ? numsBeforeMeals[1].s : null;

    const perDay = DATES.map(() => ({ S: 0, K: 0, OK: 0 }));
    colMap.forEach((cm) => {
      const match = rowItems.find((i) => /^\d+$/.test(i.s) && Math.abs(i.x - cm.x) < 6);
      if (!match) return;
      const n = parseInt(match.s, 10) || 0;
      if (cm.code === "S") perDay[cm.day].S += n;
      if (cm.code === "K") perDay[cm.day].K += n;
      if (cm.code === "OK") perDay[cm.day].OK += n;
    });
    const hasDinner = perDay.some((d) => d.OK > 0 || d.K > 0);
    const hasBreakfast = perDay.some((d) => d.S > 0);
    if (!hasBreakfast && !hasDinner) return; // brak posiłków w tym oknie — pomiń wiersz

    const isGroup = a.s.endsWith("G") || room === "-1" || !room;
    let finalRoom = room;
    let finalArrival = arrival;
    let finalDeparture = departure;
    if (isGroup) {
      finalRoom = a.s;
      if (!arrival || !departure) {
        const range = groupDateRange(perDay, DATES);
        finalArrival = range.arrival;
        finalDeparture = range.departure;
      }
      warnings.push(`Rezerwacja grupowa bez pojedynczego pokoju: ${a.s} (${name || "?"}, ${persons} os.) — dodana jako pozycja zbiorcza.`);
    }
    if (!finalArrival || !finalDeparture) {
      warnings.push(`Pominięto rezerwację bez daty przyjazdu/wyjazdu: ${a.s} (${name || "?"})`);
      return;
    }

    reservations.push({
      tenant_id: TENANT_ID,
      reservation_id: a.s,
      room: finalRoom,
      guest_name: name || null,
      arrival: finalArrival,
      departure: finalDeparture,
      persons,
      category: hasDinner ? "HB" : "BB",
      is_group: isGroup,
      source: "pdf_import",
    });
  });

  return { reservations, warnings, dates: DATES };
}

async function upload(records) {
  const res = await fetch(`${SB_URL}/rest/v1/meal_plans?on_conflict=tenant_id,reservation_id,room`, {
    method: "POST",
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(records),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
}

async function main() {
  const pdfPath = process.argv[2];
  const commit = process.argv.includes("--commit");
  if (!pdfPath) {
    console.error("Użycie: node scripts/import-kwhotel-meals-pdf.mjs \"Raport Posiłków.pdf\" [--commit]");
    process.exit(1);
  }
  const items = await extractPositions(pdfPath);
  const { reservations, warnings, dates } = parsePositions(items);

  console.log(`Zakres dat w raporcie: ${dates.filter(Boolean).join(", ")}`);
  console.log(`Znaleziono ${reservations.length} rezerwacji z posiłkami:`);
  reservations.forEach((r) => {
    console.log(`  ${r.room}${r.is_group?" [GRUPA]":""}  ${r.category}  ${r.persons} os.  ${r.arrival}–${r.departure}  ${r.guest_name || ""}`);
  });
  if (warnings.length) {
    console.log(`\nOstrzeżenia (${warnings.length}):`);
    warnings.forEach((w) => console.log("  - " + w));
  }

  if (!commit) {
    console.log("\nTryb podglądu — NIC nie wysłano do Supabase. Jeśli lista wygląda poprawnie, uruchom ponownie z --commit.");
    return;
  }
  if (!SB_URL || !SB_KEY) {
    console.error("Brak VITE_SUPABASE_URL / klucza Supabase w .env — nie mogę wysłać.");
    process.exit(1);
  }
  if (!reservations.length) { console.log("Brak danych do wysłania."); return; }
  await upload(reservations);
  console.log(`\nWysłano ${reservations.length} pozycji do meal_plans.`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
