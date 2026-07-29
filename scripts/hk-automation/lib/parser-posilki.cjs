// Parser raportu "Raport Posiłków" (KWHotel, ReportThreeDayMeals) — przychodzi
// mailem automatycznie (jak raport wyjazdów), zawsze na 3 dni do przodu (bug w
// samym KWHotel, nie do naprawienia z zewnątrz — patrz komentarz w
// scripts/kwhotel-raporty/pg-posilki-zakres.frx).
//
// To NIE jest lista wierszy — to tabela KRZYŻOWA: wiersz = rezerwacja, kolumny =
// 3 dni × 8 kodów posiłków (S/S2/O/O2/OK/OK2/K/K2 — Śniadanie/połówka,
// Obiad/połówka, Obiadokolacja/połówka, Kolacja/połówka). Płaski tekst gubi
// kolejność kolumn (ten sam problem co raport tygodniowy) — wejściem są POZYCJE
// (x,y) z extractPdfPositions, wzorem parseWeeklyGrid w parser.cjs.
//
// Kategoria BB/HB: HB jeśli w KTÓRYMKOLWIEK z 3 dni jest OK>0 lub K>0, inaczej BB.
// Rezerwacje grupowe (nr rez. kończy się na "G") NIE MAJĄ numeru pokoju w tym
// raporcie (kolumna pusta albo sentinel "-1") — jeden zbiorczy wiersz na całą
// grupę. Wcześniej były całkowicie pomijane, co zaniżało łączną liczbę śniadań
// o połowę lub więcej (grupy bywają większością gości). Teraz zapisywane jako
// osobna pozycja oznaczona is_group=true, z SYNTETYCZNYM arrival/departure
// wyliczonym tak, żeby dokładnie odtworzyć które z 3 dni raportu mają
// zaznaczone S (śniadanie) / K,OK (kolacja) — patrz groupDateRange().

const POSILKI_HEADER_RE = /Raport Posi[łl]k[óo]w/i;

const MEAL_CODES = ["S", "S/2", "O", "O/2", "OK", "OK/2", "K", "K/2"];
const DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const RESID_RE = /^\d{4,7}G?$/;

const ddmmyyyyToIso = (s) => {
  const m = s.match(DATE_RE);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

function isPosilkiReport(text, filename) {
  return POSILKI_HEADER_RE.test(text || "") || /posilk|posiłk/i.test(filename || "");
}

// Odtwarza (arrival, departure) z samych flag S/K/OK per dzień raportu (DATES,
// zawsze 3 kolejne dni kalendarzowe), tak by app-owy filtr
// (śniadanie: arrival<dzień<=departure, kolacja: arrival<=dzień<departure)
// dał dokładnie te dni co w raporcie — bez fałszywych dodatkowych dni.
function groupDateRange(perDay, DATES) {
  const breakfastIdx = perDay.map((d, i) => (d.S > 0 ? i : -1)).filter((i) => i >= 0);
  const dinnerIdx = perDay.map((d, i) => (d.K > 0 || d.OK > 0 ? i : -1)).filter((i) => i >= 0);
  let arrivalIdx = Infinity;
  if (breakfastIdx.length) arrivalIdx = Math.min(arrivalIdx, Math.min(...breakfastIdx) - 1);
  if (dinnerIdx.length) arrivalIdx = Math.min(arrivalIdx, Math.min(...dinnerIdx));
  let departureIdx = -Infinity;
  if (breakfastIdx.length) departureIdx = Math.max(departureIdx, Math.max(...breakfastIdx));
  if (dinnerIdx.length) departureIdx = Math.max(departureIdx, Math.max(...dinnerIdx) + 1);
  const base = new Date(DATES[0] + "T00:00:00");
  const offset = (iso, days) => {
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  return { arrival: offset(base.toISOString().slice(0, 10), arrivalIdx), departure: offset(base.toISOString().slice(0, 10), departureIdx) };
}

function parsePosilkiGrid(items, options = {}) {
  const tenantId = options.tenantId || "00000000-0000-0000-0000-000000000001";
  const result = { reservations: [], warnings: [], dates: [] };
  if (!Array.isArray(items) || !items.length) {
    result.warnings.push("Raport posiłków: brak pozycji tekstu w PDF.");
    return result;
  }

  // Nagłówek (daty + kody posiłków) powtarza się NA KAŻDEJ STRONIE, a współrzędne
  // Y resetują się per strona. Próg "poniżej nagłówka zaczynają się dane" musi
  // więc być liczony OSOBNO dla każdej strony. Wcześniej był JEDEN globalny próg
  // z najbogatszego nagłówka (zwykle strona 1) i wiersze z górnej części strony 2
  // (wyższe Y niż ten próg) wypadały CICHO z parsowania — incydent 2026-07-28:
  // zgubione 8 śniadań grupy 5083G (bąk konrad) + rezerwacje 107741/108093/3550G,
  // bez żadnego ostrzeżenia. Grupowanie po samym Y mieszało też wiersze o tym
  // samym Y z różnych stron, dlatego kluczem jest teraz "strona|Y".
  const headerRowsByPage = new Map();
  const rowsByPageY = new Map();
  items.filter((i) => DATE_RE.test(i.s)).forEach((i) => {
    const key = `${i.page}|${i.y}`;
    if (!rowsByPageY.has(key)) rowsByPageY.set(key, []);
    rowsByPageY.get(key).push(i);
  });
  for (const row of rowsByPageY.values()) {
    const page = row[0].page;
    const best = headerRowsByPage.get(page);
    if (!best || row.length > best.length) headerRowsByPage.set(page, row);
  }
  let headerRow = null;
  for (const row of headerRowsByPage.values()) {
    if (!headerRow || row.length > headerRow.length) headerRow = row;
  }
  if (!headerRow || !headerRow.length) {
    result.warnings.push("Raport posiłków: nie znaleziono nagłówka z datami (DD.MM.YYYY).");
    return result;
  }
  const dateCols = headerRow.slice().sort((a, b) => a.x - b.x);
  const DATES = dateCols.map((c) => ddmmyyyyToIso(c.s));
  result.dates = DATES;

  const dayOfIn = (cols) => (x) => {
    let best = 0, bestD = Infinity;
    cols.forEach((c, idx) => { const d = Math.abs(x - c.x); if (d < bestD) { bestD = d; best = idx; } });
    return best;
  };

  // Układ kolumn per strona. Jeśli nagłówek na danej stronie jest niepełny
  // (mniej dat niż na najbogatszej), mapowanie x→dzień bierzemy z globalnego,
  // żeby nie pomylić kolumn dni.
  const pageLayouts = new Map();
  for (const [page, row] of headerRowsByPage) {
    const cols = row.slice().sort((a, b) => a.x - b.x);
    const headerY = row[0].y;
    const codes = items.filter((i) => i.page === page && MEAL_CODES.includes(i.s) && Math.abs(i.y - headerY) < 60);
    if (!codes.length) continue;
    const mapCols = cols.length === dateCols.length ? cols : dateCols;
    const colMap = codes.map((i) => ({ day: dayOfIn(mapCols)(i.x), code: i.s, x: i.x }));
    pageLayouts.set(page, {
      colMap,
      dataY: Math.min(headerY, ...codes.map((c) => c.y)) - 5,
      firstMealColX: Math.min(...colMap.map((c) => c.x)),
    });
  }
  if (!pageLayouts.size) result.warnings.push("Raport posiłków: nie znaleziono nagłówków kodów posiłków (S/O/OK/K).");

  // Strona-KONTYNUACJA nie powtarza nagłówka (brak dat nagłówkowych i kodów
  // posiłków) — wtedy CAŁA strona to wiersze danych i próg odcięcia z innej
  // strony NIE obowiązuje (dataY=Infinity). Układ kolumn (x) jest ten sam co na
  // stronie z nagłówkiem, więc mapowanie x→dzień bierzemy stamtąd.
  const headed = pageLayouts.values().next().value || { colMap: [], dataY: -Infinity, firstMealColX: Infinity };
  const continuationLayout = { ...headed, dataY: Infinity };
  const layoutFor = (page) => pageLayouts.get(page) || continuationLayout;

  const anchors = items.filter((i) => RESID_RE.test(i.s) && i.y < layoutFor(i.page).dataY);
  if (!anchors.length) result.warnings.push("Raport posiłków: nie znaleziono żadnego numeru rezerwacji.");
  const HALF_DATE_RE = /^(\d{2}\.\d{2}\.\d{4})-?$/;

  const seenRows = new Set();
  anchors.forEach((a) => {
    const rowKey = `${a.page}:${a.y}`;
    if (seenRows.has(rowKey)) return;
    seenRows.add(rowKey);
    const { colMap, firstMealColX } = layoutFor(a.page);
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

    // Liczba os. i nr pok. — dwie wartości na tej samej linii, między numerem
    // rezerwacji a pierwszą kolumną kodów posiłków. "Liczba os." jest ZAWSZE
    // czystą cyfrą, ale "nr pok." bywa aneksowy z literą (np. "118A"/"118B"/
    // "106n") — BUG znaleziony 2026-07-27: filtr akceptował tylko czyste
    // cyfry, więc taki pokój w ogóle nie trafiał do `room`, co automatycznie
    // kwalifikowało rezerwację jako "grupę" (patrz `!room` w warunku isGroup
    // niżej) i myliło pojedynczych gości biznesowych (Dudziński Paweł/118B,
    // Papież Piotr/118A) z prawdziwymi grupami.
    const zoneItems = rowItems
      .filter((i) => i.x > a.x && i.x < firstMealColX - 10)
      .sort((x, y2) => x.x - y2.x);
    const personsTok = zoneItems.find((i) => /^-?\d+$/.test(i.s));
    let persons = personsTok ? parseInt(personsTok.s, 10) : 1;
    const roomTok = zoneItems.find((i) => i !== personsTok && /^-?\d+[A-Za-z]{0,2}$/.test(i.s));
    const room = roomTok ? roomTok.s : null;

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
    if (!hasBreakfast && !hasDinner) return;

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
      // Pole "Liczba os." obok numeru rezerwacji grupowej bywa błędne (zawyżone
      // względem realnej frekwencji — zaobserwowane 43 vs 42 dla identycznej grupy
      // policzonej ze śniadań). Liczba śniadań (S) jest realnym manifestem gości,
      // więc dla grup ZAWSZE nadpisuje "Liczba os." z rezerwacji.
      const breakfastCounts = perDay.map((d) => d.S).filter((n) => n > 0);
      if (breakfastCounts.length) persons = Math.max(...breakfastCounts);
      result.warnings.push(`Rezerwacja grupowa bez pojedynczego pokoju: ${a.s} (${name || "?"}, ${persons} os. ze śniadań) — dodana jako pozycja zbiorcza.`);
    }
    if (!finalArrival || !finalDeparture) {
      result.warnings.push(`Pominięto rezerwację bez daty przyjazdu/wyjazdu: ${a.s} (${name || "?"})`);
      return;
    }

    result.reservations.push({
      tenant_id: tenantId,
      reservation_id: a.s,
      room: finalRoom,
      guest_name: name || null,
      arrival: finalArrival,
      departure: finalDeparture,
      persons,
      category: hasDinner ? "HB" : "BB",
      is_group: isGroup,
      source: "pdf_mail",
    });
  });

  return result;
}

module.exports = { isPosilkiReport, parsePosilkiGrid };
