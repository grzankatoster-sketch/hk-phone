// DETERMINISTYCZNA ekstrakcja pokoi grup z "Listy przyjazdów" (KWHotel).
//
// Dlaczego nie LLM: numer pokoju to dana STRUKTURALNA, a model językowy
// "wygładza" listy do ciągłych zakresów. Incydent 2026-07-28, grupa 3550
// (KOMPAS POLAND): LLM dopisał pokoje 226/306/308/311/313 (nie ma ich
// w raporcie) i zgubił 208-215/301/302 — na 30.07 dałoby to 5 pokoi ze
// śniadaniem dla nikogo i 10 realnych pokoi bez śniadania. Regex/pozycje
// tego nie robią: albo numer w PDF jest, albo go nie ma.
//
// Układ sekcji "Rezerwacje grupowe" (stały w KWHotel, potwierdzony na
// raportach z 28 i 29.07.2026) — każda rezerwacja zajmuje DWIE linie:
//   linia 1: x~52 NUMER POKOJU | x~145 nazwa grupy/gościa | x~293 data od
//   linia 2: x~52 typ pokoju   | x~145 telefon            | x~293 data do
// Numer grupy "Gr. NNNN" stoi w osobnej kolumnie (x~540) w komórce SCALONEJ
// przez wszystkie wiersze grupy, więc renderuje się mniej więcej w pionowym
// środku bloku — dlatego grupujemy wiersze po NAZWIE (wszystkie pokoje jednej
// grupy mają tę samą nazwę), a numer dopasowujemy po zakresie Y bloku.

const GROUP_SECTION_RE = /Rezerwacje\s+grupowe/i;
const GROUP_NO_RE = /^Gr\.\s*(\d+)$/i;

// Kolumna pokoju bywa "322", "118A", ale też "106 n" (numer + marker KWHotel)
// — bierzemy sam numer z opcjonalną literą aneksu, marker po spacji odcinamy.
const ROOM_CELL_RE = /^(\d{2,4}[A-Za-z]?)(?:\s+\S+)?$/;

const ROOM_COL_X = 52;
const NAME_COL_X = 145;
const GROUP_COL_X = 540;
const COL_TOLERANCE = 12;
const ROW_TOLERANCE = 4;

function nearCol(x, col, tol = COL_TOLERANCE) {
  return Math.abs(x - col) <= tol;
}

// Zwraca [{ group_no, group_name, rooms: [] }] wyłącznie na podstawie pozycji.
// items: wynik extractPdfPositions (x, y, s, page).
function extractGroupRoomsFromPositions(items) {
  const result = { groups: [], warnings: [] };
  if (!Array.isArray(items) || !items.length) {
    result.warnings.push("Lista przyjazdów: brak pozycji tekstu w PDF.");
    return result;
  }

  const header = items.find((i) => GROUP_SECTION_RE.test(i.s));
  if (!header) return result; // raport bez sekcji grupowej — nie błąd

  // Sekcja grupowa ciągnie się od nagłówka w dół tej strony i przez kolejne
  // strony w całości (kontynuacja tabeli nie powtarza nagłówka sekcji).
  const inSection = (i) =>
    i.page > header.page || (i.page === header.page && i.y < header.y);

  const roomCells = items
    .filter((i) => inSection(i) && nearCol(i.x, ROOM_COL_X) && ROOM_CELL_RE.test(i.s))
    .map((i) => ({ ...i, room: i.s.match(ROOM_CELL_RE)[1].toUpperCase() }));

  if (!roomCells.length) {
    result.warnings.push("Lista przyjazdów: sekcja grupowa bez rozpoznanych numerów pokoi.");
    return result;
  }

  // Nazwa grupy leży w tej samej linii co numer pokoju (kolumna x~145).
  const nameFor = (cell) => {
    const hit = items.find(
      (i) => i.page === cell.page && Math.abs(i.y - cell.y) <= ROW_TOLERANCE && nearCol(i.x, NAME_COL_X, 25)
    );
    return hit ? hit.s.trim() : null;
  };

  const byName = new Map();
  for (const cell of roomCells) {
    const name = nameFor(cell);
    if (!name) continue;
    const key = `${cell.page}|${name}`;
    if (!byName.has(key)) byName.set(key, { name, page: cell.page, cells: [] });
    byName.get(key).cells.push(cell);
  }

  const groupNoTokens = items
    .filter((i) => inSection(i) && nearCol(i.x, GROUP_COL_X, 25) && GROUP_NO_RE.test(i.s))
    .map((i) => ({ ...i, no: i.s.match(GROUP_NO_RE)[1] }));

  // Przypisanie "Gr. NNNN" do bloku: komórka jest scalona przez wiersze grupy,
  // więc dla grupy WIELOpokojowej etykieta wypada wewnątrz zakresu Y bloku, ale
  // dla grupy JEDNOpokojowej ląduje w drugiej linii wiersza, czyli tuż POD nim.
  // Dlatego liczy się najmniejsza odległość do zakresu bloku, nie zawieranie się.
  const blocks = [...byName.values()].map((block) => ({
    ...block,
    yTop: Math.max(...block.cells.map((c) => c.y)),
    yBottom: Math.min(...block.cells.map((c) => c.y)),
  }));
  const distanceToBlock = (token, block) => {
    if (token.page !== block.page) return Infinity;
    if (token.y <= block.yTop && token.y >= block.yBottom) return 0;
    return token.y > block.yTop ? token.y - block.yTop : block.yBottom - token.y;
  };
  const tokenForBlock = new Map();
  for (const token of groupNoTokens) {
    let best = null, bestD = Infinity;
    for (const block of blocks) {
      const d = distanceToBlock(token, block);
      if (d < bestD) { bestD = d; best = block; }
    }
    if (best && bestD <= 40 && !tokenForBlock.has(best)) tokenForBlock.set(best, token);
  }

  // Scal bloki tej samej grupy rozbite na kilka stron (ta sama nazwa).
  const merged = new Map();
  for (const block of blocks) {
    const token = tokenForBlock.get(block);
    const key = token ? token.no : `name:${block.name}`;
    if (!merged.has(key)) {
      // rooms_source="positional" = lista pochodzi z pozycji w PDF, nie z LLM.
      // Przy scalaniu snapshotow taka lista ZAWSZE bije wersje od modelu
      // (patrz preferGroupWithRooms) — inaczej stare, zahalucynowane zrzuty
      // na dysku moglyby wygrac sama dlugoscia listy.
      merged.set(key, { group_no: token ? token.no : null, group_name: block.name, rooms: [], rooms_source: "positional" });
    }
    merged.get(key).rooms.push(...block.cells.map((c) => c.room));
  }

  // Blok grupy przełamany podziałem stron: część wierszy ląduje na stronie bez
  // scalonej komórki "Gr. NNNN" (realny przypadek 29.07.2026 — pokój 201 grupy
  // 3550 sam na kolejnej stronie). Jeśli nazwa jednoznacznie wskazuje grupę,
  // która numer MA, dolep te pokoje do niej zamiast gubić je jako bezimienne.
  for (const [key, orphan] of [...merged]) {
    if (!key.startsWith("name:")) continue;
    const named = [...merged.values()].filter((g) => g.group_no && g.group_name === orphan.group_name);
    if (named.length === 1) {
      named[0].rooms.push(...orphan.rooms);
      merged.delete(key);
    }
  }

  for (const g of merged.values()) {
    g.rooms = [...new Set(g.rooms)];
    if (!g.group_no) {
      result.warnings.push(`Grupa "${g.group_name}": nie znaleziono numeru "Gr. NNNN" w kolumnie — pokoje wyciągnięte, ale bez numeru do dopasowania.`);
    }
    result.groups.push(g);
  }

  // Suma kontrolna z samego raportu: "Liczba pokoi: N" pod sekcją grupową.
  // Rozjazd = parser coś zgubił/dobrał i NIE wolno tej listy cicho użyć.
  const declared = [...String(items.map((i) => i.s).join(" ")).matchAll(/Liczba\s+pokoi\s*:?\s*(\d+)/gi)].map((m) => Number(m[1]));
  const total = result.groups.reduce((s, g) => s + g.rooms.length, 0);
  if (declared.length && !declared.includes(total)) {
    result.warnings.push(`Suma kontrolna: wyciągnięto ${total} pokoi grupowych, a raport deklaruje ${declared.join("/")} — sprawdź, zanim użyjesz.`);
  }
  result.roomTotal = total;

  return result;
}

// Odtwarza pokoje grup z OSTATNICH zarchiwizowanych list przyjazdów (PDF).
//
// Powód istnienia: zrzuty gości na dysku (guests-*.json) zawierają listy pokoi
// wyciągnięte przez LLM — a te bywają zahalucynowane. Taki zrzut reinfekował
// bazę przy KAŻDYM kolejnym cyklu (28.07.2026: uzgodniona baza wróciła do
// błędnych 38 pokoi grupy 3550 po najbliższym uruchomieniu). PDF-y są jedynym
// źródłem, które się nie psuje, więc czytamy je ponownie zamiast ufać zrzutom.
// Koszt: samo parsowanie lokalnych plików, zero wywołań LLM i zero sieci.
async function loadGroupRoomsFromRecentPdfs(mailDir, { limit = 12, extractPositions, log } = {}) {
  const fs = require("fs");
  const path = require("path");
  let files;
  try {
    files = fs.readdirSync(mailDir).filter((f) => /przyjazd/i.test(f) && f.endsWith(".pdf")).sort().slice(-limit);
  } catch {
    return [];
  }
  const byNo = new Map();
  for (const name of files) {
    try {
      const items = await extractPositions(path.join(mailDir, name));
      const res = extractGroupRoomsFromPositions(items);
      for (const g of res.groups) {
        if (g.group_no && g.rooms.length) byNo.set(String(g.group_no), g);
      }
    } catch (e) {
      log?.(`  -> nie udalo sie odczytac pokoi grup z ${name}: ${e.message}`);
    }
  }
  return [...byNo.values()];
}

module.exports = { extractGroupRoomsFromPositions, loadGroupRoomsFromRecentPdfs };
