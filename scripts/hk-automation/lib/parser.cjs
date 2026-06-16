const { ROOM_NUMBERS, ROOM_SET } = require("./rooms.cjs");
const { addDays, parseDateToken } = require("./dates.cjs");

const DATE_TOKEN_RE = /\b(?:\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[-./]\d{1,2}[-./]\d{2,4}|\d{1,2}[-./]\d{1,2})\b/g;
const COMPACT_DATE_RE = "(\\d{1,2}[-.]\\d{1,2}[-.]\\d{4}|\\d{4}[-.]\\d{1,2}[-.]\\d{1,2})";
const SECTION_PATTERNS = [
  { section: "arrival", re: /\b(przyjazd|przyjazdy|check[- ]?in|zameld)/i },
  { section: "departure", re: /\b(wyjazd|wyjazdy|check[- ]?out|wymeld)/i },
  { section: "stay", re: /\b(pobyt|pobyty|zaj[eę]te|go[sś]cie|rezerwac)/i },
];

function normalizeText(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractDateTokens(line, fallbackYear) {
  const tokens = line.match(DATE_TOKEN_RE) || [];
  return tokens.map((token) => parseDateToken(token, fallbackYear)).filter(Boolean);
}

function findRooms(line) {
  const found = [];
  for (const roomNo of ROOM_NUMBERS) {
    const escaped = roomNo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^0-9A-Za-z])${escaped}([^0-9A-Za-z]|$)`, "i");
    if (re.test(line)) found.push(roomNo);
  }
  return found;
}

function detectSection(line, currentSection) {
  for (const item of SECTION_PATTERNS) {
    if (item.re.test(line)) return item.section;
  }
  return currentSection;
}

function parseCompactKwhotelRows(line, fallbackYear) {
  const rows = [];
  for (const roomNo of ROOM_NUMBERS) {
    const escaped = roomNo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`${COMPACT_DATE_RE}\\s*${escaped}\\s*${COMPACT_DATE_RE}(?:\\s*(\\d{1,2})(?!\\d))?`, "gi");
    let match;
    while ((match = re.exec(line))) {
      const cleaningDate = parseDateToken(match[1], fallbackYear);
      const arrivalDate = parseDateToken(match[2], fallbackYear);
      const stayLengthDays = match[3] ? Number(match[3]) : null;
      rows.push({ room: roomNo, cleaningDate, arrivalDate, stayLengthDays, rawLine: line });
    }
  }
  return rows;
}

// Wyciąga override statusu z uwag rezerwacji. Konwencja: recepcja wpisuje
// w KWHotel w uwagach "pg"/"PG" (np. dla rezerwacji grupowych, gdzie każdy dzień
// pobytu ma być PG zamiast naprzemiennego PG/PGZ z parytetu).
function extractNotesStatus(rawLine) {
  if (!rawLine) return null;
  if (/\bPG\b/i.test(rawLine)) return "PG";
  return null;
}

function pushReservation(result, reservation) {
  if (!reservation.room || !reservation.arrivalDate || !reservation.departureDate) return;
  if (!reservation.notesStatus) {
    const detected = extractNotesStatus(reservation.rawLine);
    if (detected) reservation.notesStatus = detected;
  }
  result.reservations.push(reservation);
}

function pushEvent(result, dateKey, room, type, rawLine) {
  if (!dateKey || !room || !type) return;
  if (!result.eventsByDate[dateKey]) result.eventsByDate[dateKey] = {};
  if (!result.eventsByDate[dateKey][room]) result.eventsByDate[dateKey][room] = { arrival: false, departure: false, stay: false, rawLines: [] };
  result.eventsByDate[dateKey][room][type] = true;
  result.eventsByDate[dateKey][room].rawLines.push(rawLine);
}

function parseKwhotelText(text, options = {}) {
  const normalized = normalizeText(text);
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const fallbackYear = options.fallbackYear || new Date().getFullYear();
  const result = {
    reservations: [],
    eventsByDate: {},
    warnings: [],
    stats: { lines: lines.length, matchedLines: 0 },
  };

  let section = "";
  let currentDate = null;

  for (const line of lines) {
    const dates = extractDateTokens(line, fallbackYear);
    if (dates.length) currentDate = dates[0];
    section = detectSection(line, section);

    const compactRows = parseCompactKwhotelRows(line, fallbackYear);
    if (compactRows.length) {
      result.stats.matchedLines += 1;
      for (const row of compactRows) {
        if (row.arrivalDate && row.stayLengthDays > 0) {
          const departureDate = addDays(row.arrivalDate, row.stayLengthDays);

          if (row.arrivalDate >= row.cleaningDate) {
            // DATE1=cleaningDate <= DATE2=arrivalDate:
            // Stary gość wyjeżdża na cleaningDate, nowy przyjeżdża na arrivalDate.
            // Jeśli te same daty → WP (departure + arrival tego samego dnia).
            pushEvent(result, row.cleaningDate, row.room, "departure", row.rawLine);
            pushEvent(result, row.arrivalDate, row.room, "arrival", row.rawLine);
            pushReservation(result, {
              room: row.room,
              arrivalDate: row.arrivalDate,
              departureDate,
              rawLine: row.rawLine,
            });
            pushEvent(result, departureDate, row.room, "departure", row.rawLine);
          } else {
            // DATE2=arrivalDate < DATE1=cleaningDate:
            // Gość zameldowany w przeszłości, cleaningDate to dzień sprzątania (PG/PGZ).
            // NIE wstawiaj departure na cleaningDate — to byłoby błędne W.
            pushReservation(result, {
              room: row.room,
              arrivalDate: row.arrivalDate,
              departureDate,
              rawLine: row.rawLine,
            });
            pushEvent(result, row.arrivalDate, row.room, "arrival", row.rawLine);
            pushEvent(result, departureDate, row.room, "departure", row.rawLine);
            // cleaningDate == departureDate → departure już wstawiony powyżej ✓
            // cleaningDate < departureDate  → stayover, computeStatuses obliczy PG/PGZ ✓
          }
        } else {
          // Brak informacji o długości pobytu — zachowanie fallback
          pushEvent(result, row.cleaningDate, row.room, "departure", row.rawLine);
          pushEvent(result, row.arrivalDate, row.room, "arrival", row.rawLine);
        }
      }
      continue;
    }

    const rooms = findRooms(line);
    if (!rooms.length) continue;

    result.stats.matchedLines += 1;
    const rowDates = dates.length ? dates : (currentDate ? [currentDate] : []);

    for (const room of rooms) {
      if (rowDates.length >= 2) {
        const arrivalDate = rowDates[0];
        const departureDate = rowDates[rowDates.length - 1];
        pushReservation(result, { room, arrivalDate, departureDate, rawLine: line });
        pushEvent(result, arrivalDate, room, "arrival", line);
        pushEvent(result, departureDate, room, "departure", line);
        continue;
      }

      const eventDate = rowDates[0] || currentDate;
      if (!eventDate) {
        result.warnings.push(`Brak daty dla pokoju ${room}: ${line}`);
        continue;
      }

      if (section === "arrival") pushEvent(result, eventDate, room, "arrival", line);
      else if (section === "departure") pushEvent(result, eventDate, room, "departure", line);
      else if (section === "stay") pushEvent(result, eventDate, room, "stay", line);
      else result.warnings.push(`Nierozpoznana sekcja dla pokoju ${room}: ${line}`);
    }
  }

  return result;
}

// ─── Parser "Wykaz sprzątania" (HousekeepingRegister) ────────────────────────
// Format KWHotel: kolumny Symbol | Piętro | Przyjazd | LO | Wyjazd | LO | Dni pobytu | Od | LO | Status
// Dni pobytu = N/M  (N = nocy spędzone, M = łączna liczba nocy)
// Od          = data zameldowania aktualnego gościa
// X w Przyjazd → nowy gość przyjeżdża dziś
// X w Wyjazd   → gość wyjeżdża dziś
// Stayover     → brak X, status "Zajęty", departure = Od + M
//
// PDF extractor sklepia kolumny bez spacji, np.:
//   "1011X1X10/211.05.20261 Zajęty"  (WP: 2×X)
//   "1171X32/209.05.20263 Zajęty"    (W: 1×X, N=M)
//   "118A11/210.05.20262 Zajęty"     (stayover: brak X)
// Format wiersza: {Symbol}{Piętro}[X{LO}]?[X{LO}]?{N}/{M}{dd.mm.yyyy}...
// Kotwica daty wymusza poprawne wycofanie greedy dla N i M.

const WYKAZ_HEADER_RE = /Wykaz\s+sprz[aą]tania/i;
const WYKAZ_DATE_RE   = /dzie[nń]:\s*(\d{2}\.\d{2}\.\d{4})/i;
const SKIP_LINE_RE    = /^(Symbol|Pi[eę]tro|Przyjazd|Wyjazd|Dni|Podsumowanie|Wydrukowano|Data\s|Liczba)/i;

// Jeden regex dopasowuje cały wiersz danych:
//  gr1=pokój  gr2=piętro  gr3=X+LO(Przyjazd)?  gr4=X+LO(Wyjazd)?  gr5=N  gr6=M  gr7=data Od
// Po numerze pokoju KWHotel czasem wstawia opcjonalny atrybut (np. "n" dla 106),
// dlatego tolerujemy spacje/litery między pokojem a piętrem.
const WYKAZ_ROW_RE = /^(\d{3}[AB]?)\s*[A-Za-z]*\s*(\d)(X\d{1,2})?(X\d{1,2})?(\d{1,2})\/(\d{1,2})(\d{2}\.\d{2}\.\d{4})/i;

function parseHousekeepingRegisterText(text, options = {}) {
  const normalized = normalizeText(text);
  const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);
  const fallbackYear = options.fallbackYear || new Date().getFullYear();

  // Wyciągnij datę raportu z nagłówka
  let reportDate = options.reportDate || options.startDate || null;
  for (const line of lines) {
    const m = line.match(WYKAZ_DATE_RE);
    if (m) { reportDate = parseDateToken(m[1], fallbackYear); break; }
  }
  if (!reportDate) reportDate = options.startDate || null;

  const result = {
    reservations: [],
    eventsByDate: {},
    warnings:     [],
    stats:        { lines: lines.length, matchedLines: 0 },
    reportDate,
  };

  for (const line of lines) {
    if (SKIP_LINE_RE.test(line)) continue;

    // Dopasuj wiersz danych pokoju jednym regex-em
    const rowMatch = line.match(WYKAZ_ROW_RE);
    if (!rowMatch) continue;
    const room = rowMatch[1].toUpperCase();
    if (!ROOM_SET.has(room)) continue;

    // Liczba grup X (Przyjazd i/lub Wyjazd) — każda zaczyna się od "X"
    const xCount = [rowMatch[3], rowMatch[4]].filter(Boolean).length;
    const currentNight = parseInt(rowMatch[5], 10);   // N = nocy spędzone
    const totalNights  = parseInt(rowMatch[6], 10);   // M = łączna liczba nocy
    const arrivalDate  = parseDateToken(rowMatch[7], fallbackYear); // data Od

    if (!arrivalDate) { result.warnings.push(`Brak daty Od dla ${room}: ${line}`); continue; }
    const departureDate = totalNights > 0 ? addDays(arrivalDate, totalNights) : null;

    result.stats.matchedLines++;

    if (xCount >= 2) {
      // WP: stary gość wyjeżdża DZIŚ, nowy przyjeżdża DZIŚ
      // Użyj odrębnego rawLine dla eventów na reportDate — inaczej collectExplicitEvents
      // odfiltruje je jako duplikaty rawLine rezerwacji.
      const wpLine = `[WP] ${line}`;
      if (reportDate) {
        pushEvent(result, reportDate, room, "departure", wpLine);
        pushEvent(result, reportDate, room, "arrival",   wpLine);
      }
      if (arrivalDate && departureDate) {
        pushReservation(result, { room, arrivalDate, departureDate, rawLine: line });
        if (departureDate !== reportDate) pushEvent(result, departureDate, room, "departure", line);
      }
    } else if (xCount === 1 && currentNight === 0) {
      // P: nowy gość przyjeżdża DZIŚ, poprzedni wyjechał wcześniej
      const pLine = `[P] ${line}`;
      if (reportDate) pushEvent(result, reportDate, room, "arrival", pLine);
      if (departureDate) {
        pushReservation(result, { room, arrivalDate: reportDate || arrivalDate, departureDate, rawLine: line });
        pushEvent(result, departureDate, room, "departure", line);
      }
    } else if (xCount === 1) {
      // W: wyjazd DZIŚ (N > 0, zwykle N = M), arrivalDate = przyjazd gościa
      const wLine = `[W] ${line}`;
      if (reportDate) pushEvent(result, reportDate, room, "departure", wLine);
      if (arrivalDate && departureDate && arrivalDate < departureDate) {
        pushReservation(result, { room, arrivalDate, departureDate, rawLine: line });
        pushEvent(result, arrivalDate, room, "arrival", line);
      }
    } else {
      // Stayover: brak X → PG / PGZ obliczone przez computeStatuses
      if (departureDate) {
        pushReservation(result, { room, arrivalDate, departureDate, rawLine: line });
        pushEvent(result, arrivalDate,   room, "arrival",   line);
        pushEvent(result, departureDate, room, "departure", line);
      } else {
        result.warnings.push(`Brak totalNights dla ${room}: ${line}`);
      }
    }
  }

  return result;
}

// ─── Parser raportu TYGODNIOWEGO ("Wykaz sprzątania tygodniowy") ──────────────
// To NIE jest lista wierszy — to SIATKA: wiersze = pokoje, 7 kolumn = 7 dni.
// Każda komórka: "W" (wyjazd), "P(n os)" (przyjazd), "(n os)" (pobyt),
// "W, P(...)" (wyjazd+przyjazd = WP), "brudny" (tylko znacznik brudu — ignorujemy).
// Płaski tekst gubi puste komórki, więc wejściem są POZYCJE (x,y) z extractPdfPositions.
// Kolumnę dnia wyznaczamy z x (nagłówek dat), pokój z anchoru x<60, przypisanie po y.
const WEEKLY_HEADER_RE = /Stan obiektu na tydzie/i;
const WEEKLY_DATE_RE   = /^\d{2}\.\d{2}\.\d{4}$/;
const WEEKLY_ROOM_RE   = /^(\d{3}[AB]?)(?:\s+n)?$/;

function classifyWeeklyCell(text) {
  return {
    hasW: /(^|[\s,(])W([\s,]|$)/.test(text), // "W" / "W, P(...)" — wyjazd
    hasP: /\bP\(/.test(text),                // "P(n os)" — przyjazd
    hasStay: /\(\d+\s*os\)/.test(text),      // "(n os)" — pobyt (bez W/P)
  };
}

function parseWeeklyGrid(items, options = {}) {
  const fallbackYear = options.fallbackYear || new Date().getFullYear();
  const result = { reservations: [], eventsByDate: {}, warnings: [], stats: { lines: 0, matchedLines: 0 }, reportDate: null };
  if (!Array.isArray(items) || !items.length) {
    result.warnings.push("Raport tygodniowy: brak pozycji tekstu w PDF.");
    return result;
  }

  // 1) Nagłówek dat (strona 0): wiersz z 7 pełnymi datami → centra kolumn + daty ISO.
  const byY = {};
  items.filter((i) => i.page === 0 && WEEKLY_DATE_RE.test(i.s)).forEach((i) => { (byY[i.y] = byY[i.y] || []).push(i); });
  let headerRow = null;
  Object.values(byY).forEach((row) => { if (row.length >= 7 && (!headerRow || row.length > headerRow.length)) headerRow = row; });
  if (!headerRow) { result.warnings.push("Raport tygodniowy: nie znaleziono wiersza z 7 datami."); return result; }
  const cols   = headerRow.slice().sort((a, b) => a.x - b.x).slice(0, 7);
  const COL_X  = cols.map((c) => c.x);
  const DATES  = cols.map((c) => parseDateToken(c.s, fallbackYear)).filter(Boolean);
  if (DATES.length < 7) { result.warnings.push("Raport tygodniowy: nie udało się odczytać 7 dat."); return result; }
  result.reportDate = DATES[0];
  const threshold = COL_X[0] - 6; // odetnij kolumnę pokoju (x~31) i tygodniowego licznika (x~98)
  const colOf = (x) => {
    if (x < threshold) return -1;
    let best = 0, bestD = Infinity;
    COL_X.forEach((cx, i) => { const d = Math.abs(x - cx); if (d < bestD) { bestD = d; best = i; } });
    return best;
  };

  // 2) Buduj siatkę pokój × dzień ze wszystkich stron (nagłówek dat powtarza się per strona).
  const grid = {};
  const pages = {};
  items.forEach((i) => { (pages[i.page] = pages[i.page] || []).push(i); });
  Object.values(pages).forEach((pageItems) => {
    const anchors = pageItems.filter((i) => i.x < 60 && WEEKLY_ROOM_RE.test(i.s));
    if (!anchors.length) return;
    const cutoff = Math.max(...anchors.map((a) => a.y)) + 18; // pomiń nagłówek dat + podsumowanie nad pokojami
    pageItems.forEach((it) => {
      if (it.y > cutoff) return;
      const col = colOf(it.x);
      if (col < 0) return;
      let room = null, bestD = Infinity; // przypisz komórkę do najbliższego pokoju po Y
      anchors.forEach((a) => { const d = Math.abs(it.y - a.y); if (d < bestD) { bestD = d; room = a.s.match(WEEKLY_ROOM_RE)[1]; } });
      if (!room || bestD > 20) return;
      (grid[room] = grid[room] || [[], [], [], [], [], [], []])[col].push(it.s);
    });
  });
  result.stats.lines = Object.keys(grid).length;

  // 3) Per pokój: zdarzenia W/WP/P + odtworzenie rezerwacji (P → W) dla parytetu PG/PGZ.
  for (const room of Object.keys(grid)) {
    const cells = grid[room].map((arr) => arr.join(" "));
    let openArrival = null, matched = false;
    cells.forEach((joined, col) => {
      const { hasW, hasP } = classifyWeeklyCell(joined);
      const date = DATES[col];
      if (hasW) { // wyjazd najpierw (przy WP stary gość wyjeżdża przed nowym)
        pushEvent(result, date, room, "departure", `[TYG] ${room} ${date}: ${joined}`);
        if (openArrival) { pushReservation(result, { room, arrivalDate: openArrival, departureDate: date, rawLine: `[TYG] ${room} ${openArrival}` }); openArrival = null; }
        matched = true;
      }
      if (hasP) {
        pushEvent(result, date, room, "arrival", `[TYG] ${room} ${date}: ${joined}`);
        openArrival = date;
        matched = true;
      }
    });
    // Gość nadal w pokoju na koniec tygodnia → rezerwacja trwa za horyzont (dni pobytu liczone parytetem).
    if (openArrival) pushReservation(result, { room, arrivalDate: openArrival, departureDate: addDays(DATES[DATES.length - 1], 1), rawLine: `[TYG] ${room} ${openArrival}` });
    if (matched) result.stats.matchedLines += 1;
  }

  return result;
}

// ─── Auto-detekcja formatu i wybór parsera ────────────────────────────────────
function parseAnyKwhotelReport(text, options = {}) {
  if (WYKAZ_HEADER_RE.test(text)) {
    return parseHousekeepingRegisterText(text, options);
  }
  return parseKwhotelText(text, options);
}

function isWeeklyReport(text, filename) {
  return WEEKLY_HEADER_RE.test(text || "") || /tygodniow/i.test(filename || "");
}

module.exports = { parseKwhotelText, parseHousekeepingRegisterText, parseAnyKwhotelReport, parseWeeklyGrid, isWeeklyReport };
