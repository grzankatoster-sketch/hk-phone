const assert = require("assert");
const { parsePosilkiGrid } = require("./lib/parser-posilki.cjs");
const { sanitizeRoomType, cleanRoomToken, roomAppearsInSource, toParsedShape, BUSINESS_MARKERS_RE } = require("./lib/parser-guests-llm.cjs");
const { splitEvenly, expandGroupMealReservations } = require("./lib/meals-group-expand.cjs");
const { preferGroupWithRooms } = require("./lib/guest-snapshots.cjs");
const { extractGroupRoomsFromPositions } = require("./lib/parser-arrivals-groups.cjs");

// ─── Regresja: grupa HELLO HOLIDAYS SRL (26–28.07.2026) ──────────────────────
// Realny przypadek z 2026-07-26: pole "Liczba os." przy numerze rezerwacji
// grupowej pokazywało 43, ale rzeczywisty manifest (śniadania wydane 27.07 i
// 28.07) to 42 — dokładnie zgodne z rozpisem pokoi grupy (7 sgl+8 dbl+8 twin+1
// trpl = 42). Persons MUSI wygrać ze śniadań, nie z pola przy rezerwacji.
const posilkiItems = [
  // nagłówek dat (header row) — 3 daty, ta sama y
  { page: 0, x: 100, y: 1000, s: "26.07.2026" },
  { page: 0, x: 300, y: 1000, s: "27.07.2026" },
  { page: 0, x: 500, y: 1000, s: "28.07.2026" },
  // nagłówki kodów posiłków (tylko S — wystarczy do testu)
  { page: 0, x: 100, y: 980, s: "S" },
  { page: 0, x: 300, y: 980, s: "S" },
  { page: 0, x: 500, y: 980, s: "S" },
  // wiersz danych: anchor = numer rezerwacji grupowej
  { page: 0, x: 50, y: 900, s: "4963G" },
  { page: 0, x: 70, y: 900, s: "43" }, // "Liczba os." z rezerwacji — BŁĘDNA
  { page: 0, x: 85, y: 900, s: "-1" }, // sentinel "brak pokoju" = grupa
  { page: 0, x: 100, y: 900, s: "0" }, // S dzień 1 (przyjazd, jeszcze bez śniadania)
  { page: 0, x: 300, y: 900, s: "42" }, // S dzień 2 — realny manifest
  { page: 0, x: 500, y: 900, s: "42" }, // S dzień 3 — realny manifest
];

const posilkiResult = parsePosilkiGrid(posilkiItems, { tenantId: "t1" });
assert.strictEqual(posilkiResult.reservations.length, 1);
assert.strictEqual(posilkiResult.reservations[0].persons, 42, "persons grupy musi pochodzic ze sniadan (42), nie z pola rezerwacji (43)");
assert.strictEqual(posilkiResult.reservations[0].is_group, true);
console.log("OK: parsePosilkiGrid — persons grupy ze śniadań, nie z rezerwacji");

// ─── Regresja: pokój z literą (118A/118B) nie może być mylony z grupą (2026-07-27) ──
// Realny przypadek: filtr "nr pok." łapał tylko czyste cyfry, więc pokoje
// aneksowe (118A/118B) w ogóle nie miały wykrytego numeru → brak pokoju =
// sentinel grupy → pojedynczy gość biznesowy (Dudziński Paweł, Papież Piotr)
// mylnie trafiał na listę jako "grupa 1-osobowa bez pokoju".
const roomLetterItems = [
  { page: 0, x: 100, y: 1000, s: "26.07.2026" },
  { page: 0, x: 300, y: 1000, s: "27.07.2026" },
  { page: 0, x: 500, y: 1000, s: "28.07.2026" },
  { page: 0, x: 100, y: 980, s: "S" },
  { page: 0, x: 300, y: 980, s: "S" },
  { page: 0, x: 500, y: 980, s: "S" },
  { page: 0, x: 50, y: 900, s: "107791" },
  { page: 0, x: 70, y: 900, s: "1" },       // Liczba os.
  { page: 0, x: 85, y: 900, s: "118B" },    // nr pok. z literą (aneks)
  { page: 0, x: 100, y: 900, s: "0" },
  { page: 0, x: 300, y: 900, s: "1" },
  { page: 0, x: 500, y: 900, s: "0" },
  { page: 0, x: 400, y: 905, s: "27.07.2026-" },
  { page: 0, x: 400, y: 895, s: "28.07.2026" },
];
const roomLetterResult = parsePosilkiGrid(roomLetterItems, { tenantId: "t1" });
assert.strictEqual(roomLetterResult.reservations.length, 1);
assert.strictEqual(roomLetterResult.reservations[0].room, "118B", "pokój z literą musi być rozpoznany, nie zgubiony");
assert.strictEqual(roomLetterResult.reservations[0].is_group, false, "pojedynczy gość z pokojem 118B nie może być mylony z grupą");
assert.strictEqual(roomLetterResult.reservations[0].persons, 1);
console.log("OK: parsePosilkiGrid — pokój z literą (118B) rozpoznany poprawnie, nie mylony z grupą");

// ─── Regresja 2026-07-28: wiersze ze STRONY-KONTYNUACJI byly cicho gubione ──
// Raport posilkow ma 2 strony, ale druga NIE powtarza naglowka (brak dat
// naglowkowych i kodow S/O/OK/K). Prog "dane zaczynaja sie ponizej naglowka"
// byl liczony raz, z pierwszej strony, a wspolrzedne Y resetuja sie per strona
// — wiersze z gornej czesci strony 2 (wyzsze Y niz prog) wypadaly BEZ
// ostrzezenia. Realnie zgubione: 8 sniadan grupy 5083G (bąk konrad), pokoj 318
// (4 os.), pokoj 212 (1 os.) i grupa 3550G.
const contItems = [
  // strona 0: pelny naglowek + jeden wiersz danych ponizej naglowka
  { page: 0, x: 100, y: 505, s: "28.07.2026" },
  { page: 0, x: 300, y: 505, s: "29.07.2026" },
  { page: 0, x: 500, y: 505, s: "30.07.2026" },
  { page: 0, x: 100, y: 472, s: "S" },
  { page: 0, x: 300, y: 472, s: "S" },
  { page: 0, x: 500, y: 472, s: "S" },
  { page: 0, x: 50, y: 430, s: "107827" },
  { page: 0, x: 70, y: 430, s: "2" },
  { page: 0, x: 85, y: 430, s: "103" },
  { page: 0, x: 100, y: 430, s: "0" },
  { page: 0, x: 300, y: 430, s: "2" },
  { page: 0, x: 500, y: 430, s: "0" },
  { page: 0, x: 400, y: 433, s: "28.07.2026-" },
  { page: 0, x: 400, y: 427, s: "29.07.2026" },
  // strona 1: BRAK naglowka, wiersz wysoko (y=511 > prog 467 ze strony 0)
  { page: 1, x: 50, y: 511, s: "5083G" },
  { page: 1, x: 70, y: 511, s: "8" },
  { page: 1, x: 85, y: 511, s: "-1" },
  { page: 1, x: 100, y: 511, s: "0" },
  { page: 1, x: 300, y: 511, s: "8" },
  { page: 1, x: 500, y: 511, s: "0" },
  { page: 1, x: 400, y: 514, s: "28.07.2026-" },
  { page: 1, x: 400, y: 508, s: "29.07.2026" },
];
const contResult = parsePosilkiGrid(contItems, { tenantId: "t1" });
const contGroup = contResult.reservations.find((r) => r.reservation_id === "5083G");
assert.ok(contGroup, "wiersz ze strony-kontynuacji (bez naglowka) NIE moze byc zgubiony");
assert.strictEqual(contGroup.persons, 8, "liczba osob ze strony 2 musi byc odczytana z kolumn strony 1");
assert.strictEqual(contGroup.is_group, true);
assert.ok(contResult.reservations.some((r) => r.room === "103"), "wiersz ze strony 1 nadal parsowany (bez regresji)");
console.log("OK: parsePosilkiGrid — wiersze ze strony-kontynuacji nie sa gubione");

// ─── sanitizeRoomType: zbiorczy skład grupy != typ konkretnego pokoju ────────
assert.strictEqual(
  sanitizeRoomType("7 sgl BB + 8 dbl BB + 8 twin BB + 1 trpl BB"),
  null,
  "sklad calej grupy nie moze zostac typem jednego pokoju"
);
assert.strictEqual(sanitizeRoomType("dbl + twn"), "dbl + twn", "opis konkretnego pokoju (apartament) ma przejsc bez zmian");
assert.strictEqual(sanitizeRoomType("TWIN bez śniadania"), "TWIN bez śniadania");
assert.strictEqual(sanitizeRoomType(""), null);
assert.strictEqual(sanitizeRoomType(null), null);
// Regresja 2026-07-26: pokój z dwoma typami łóżek po 1 sztuce (rodzinny/apartament)
// to NIE jest zbiorczy skład grupy — wcześniej fałszywie zerowane.
assert.strictEqual(sanitizeRoomType("1 dbl + 1 twin"), "1 dbl + 1 twin", "pokoj z 2 typami lozek po 1 szt. to nie skład grupy");
assert.strictEqual(sanitizeRoomType("1 sgl 1 dbl apartament"), "1 sgl 1 dbl apartament");
// Ale grupa z liczbą pokoi >1 danego typu nadal ma zostać odrzucona, nawet przy 2 pozycjach.
assert.strictEqual(sanitizeRoomType("2 dbl + 3 twin"), null, "liczba pokoi >1 danego typu = sklad grupy, nawet przy 2 pozycjach");
console.log("OK: sanitizeRoomType — zbiorczy skład grupy odrzucony, typ pojedynczego pokoju zachowany");

// ─── BUSINESS_MARKERS_RE: siatka bezpieczenstwa niezalezna od LLM ────────────
assert.ok(BUSINESS_MARKERS_RE.test("E-mail - rez firmowa"));
assert.ok(BUSINESS_MARKERS_RE.test("HISEAS International GMBH"));
assert.ok(BUSINESS_MARKERS_RE.test("INTER-TOUR SRL"));
assert.ok(!BUSINESS_MARKERS_RE.test("Booking.com"));
assert.ok(!BUSINESS_MARKERS_RE.test("Anna Lopandina"));
console.log("OK: BUSINESS_MARKERS_RE — rozpoznaje firmy/grupy, nie łapie zwykłych gości");

// ─── toParsedShape: indywidualna rezerwacja biznesowa + grupa → PG na kazdy pokoj
const extracted = {
  individual: [
    { room: "306", guest_name: "Jensen Karolin", arrival: "2026-07-26", departure: "2026-07-27", source: "Booking.com", is_business: false },
  ],
  groups: [
    {
      group_no: "4963",
      group_name: "HELLO HOLIDAYS SRL",
      rooms: ["301", "302", "119"],
      arrival: "2026-07-26",
      departure: "2026-07-28",
      source: "E-mail - rez firmowa",
      is_business: true,
    },
  ],
  warnings: [],
};
const shaped = toParsedShape(extracted);
assert.strictEqual(shaped.reservations.length, 4, "1 indywidualna + 3 pokoje grupy");
const individualRes = shaped.reservations.find((r) => r.room === "306");
assert.strictEqual(individualRes.notesStatus, undefined, "gosc indywidualny (nie-biznesowy) nie ma wymuszonego PG");
const groupRes = shaped.reservations.filter((r) => ["301", "302", "119"].includes(r.room));
assert.strictEqual(groupRes.length, 3);
groupRes.forEach((r) => assert.strictEqual(r.notesStatus, "PG", `pokoj grupy ${r.room} musi miec wymuszone PG (sprzatanie codzienne)`));
console.log("OK: toParsedShape — grupa biznesowa dostaje PG na kazdy pokoj, indywidualny gosc nie");

// ─── splitEvenly: suma zawsze rowna calkowitej liczbie osob ──────────────────
assert.deepStrictEqual(splitEvenly(42, 24), [
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1,
], "42 os. na 24 pokoje: 18 pokoi po 2, 6 po 1 (suma=42)");
assert.strictEqual(splitEvenly(42, 24).reduce((a, b) => a + b, 0), 42);
assert.deepStrictEqual(splitEvenly(5, 5), [1, 1, 1, 1, 1]);
assert.deepStrictEqual(splitEvenly(0, 3), [0, 0, 0]);
assert.deepStrictEqual(splitEvenly(5, 0), []);
console.log("OK: splitEvenly — rozklad osob na pokoje, suma zawsze zgodna");

// ─── expandGroupMealReservations: kafel GRUPA -> pojedyncze pokoje ───────────
const mealsWithGroup = [
  { tenant_id: "t1", reservation_id: "306", room: "306", guest_name: "Jensen Karolin", arrival: "2026-07-26", departure: "2026-07-27", persons: 1, category: "BB", is_group: false, source: "pdf_mail" },
  { tenant_id: "t1", reservation_id: "4963G", room: "4963G", guest_name: null, arrival: "2026-07-26", departure: "2026-07-28", persons: 42, category: "HB", is_group: true, source: "pdf_mail" },
];
const guestGroupsForExpand = [
  { group_no: "4963", group_name: "HELLO HOLIDAYS SRL", rooms: ["301", "302", "119"], arrival: "2026-07-26", departure: "2026-07-28" },
];
const expandedResult = expandGroupMealReservations(mealsWithGroup, guestGroupsForExpand);
assert.strictEqual(expandedResult.reservations.length, 4, "1 niegrupowa + 3 pokoje rozbitej grupy");
assert.strictEqual(expandedResult.staleAggregateRows.length, 1);
assert.deepStrictEqual(expandedResult.staleAggregateRows[0], { tenant_id: "t1", reservation_id: "4963G", room: "4963G" });
const expandedRooms = expandedResult.reservations.filter((r) => ["301", "302", "119"].includes(r.room));
assert.strictEqual(expandedRooms.length, 3);
expandedRooms.forEach((r) => {
  assert.strictEqual(r.is_group, false, "rozbity pokoj nie jest juz zbiorczym kaflem");
  assert.strictEqual(r.guest_name, "HELLO HOLIDAYS SRL");
});
assert.strictEqual(expandedRooms.reduce((sum, r) => sum + r.persons, 0), 42, "suma osob po rozbiciu = manifest ze sniadan");

// Brak dopasowanej grupy (Lista przyjazdow nie przyszla w tej paczce) -> kafel GRUPA zostaje bez zmian.
const noMatchResult = expandGroupMealReservations(mealsWithGroup, []);
assert.strictEqual(noMatchResult.reservations.length, 2);
assert.strictEqual(noMatchResult.staleAggregateRows.length, 0);
assert.ok(noMatchResult.reservations.some((r) => r.is_group === true && r.room === "4963G"), "bez listy pokoi grupa zostaje zbiorczym kaflem (bez regresji)");
console.log("OK: expandGroupMealReservations — GRUPA rozbita na pokoje gdy znana lista, bez regresji gdy brak dopasowania");

// ─── Regresja 2026-07-28: "APARTAMENT" zamiast numeru pokoju (grupa 5083G) ──
// LLM wpisal w pole pokoju opisowe slowo z uwag zamiast numeru z KWHotel.
// Taki token trafial wprost do meal_plans.room i tworzyl widmowy kafel
// "APARTAM..." obok/zamiast prawdziwego pokoju 106.
assert.strictEqual(cleanRoomToken("APARTAMENT"), null, "opisowe slowo nie moze przejsc jako numer pokoju");
assert.strictEqual(cleanRoomToken("Apartament nr 106"), null, "wolny tekst nie jest numerem pokoju");
assert.strictEqual(cleanRoomToken("106"), "106");
assert.strictEqual(cleanRoomToken("118a"), "118A", "aneks z litera pozostaje poprawnym pokojem");
assert.strictEqual(cleanRoomToken(null), null);
console.log("OK: cleanRoomToken — opisowe slowa odrzucone, realne numery (w tym aneksy) zachowane");

// ─── preferGroupWithRooms: gorszy odczyt nie kasuje dobrej listy pokoi ───────
// Sedno incydentu: dzisiejsza ekstrakcja bez pokoi nadpisywala wczorajsza z
// pelna lista, bo scalanie bylo bezwarunkowo "nowszy wygrywa".
const goodGroup = { group_no: "5083", group_name: "bąk konrad", rooms: ["106"] };
const degradedGroup = { group_no: "5083", group_name: "bąk konrad", rooms: [] };
assert.deepStrictEqual(
  preferGroupWithRooms(goodGroup, degradedGroup),
  goodGroup,
  "nowszy odczyt BEZ pokoi nie moze skasowac starszego Z pokojami"
);
assert.deepStrictEqual(
  preferGroupWithRooms(degradedGroup, goodGroup),
  goodGroup,
  "nowszy odczyt Z pokojami wygrywa ze starszym bez"
);
const newerSameCount = { group_no: "5083", group_name: "bąk konrad", rooms: ["107"] };
assert.deepStrictEqual(
  preferGroupWithRooms(goodGroup, newerSameCount),
  newerSameCount,
  "przy tej samej liczbie pokoi decyduje nowszy (realna zmiana pokoju)"
);
assert.deepStrictEqual(preferGroupWithRooms(undefined, goodGroup), goodGroup, "brak wpisu -> przyjmij nowy");
console.log("OK: preferGroupWithRooms — gorsza ekstrakcja nie kasuje poprawnej listy pokoi");

// ─── Regresja 2026-07-28: GROUNDING — LLM zmysla numery pokoi ───────────────
// Realny przypadek: grupa 3550 (KOMPAS POLAND). LLM "wygladzil" liste do
// ciaglych zakresow — dopisal 226/306/308/311/313, ktorych NIE MA w raporcie.
// Skutek na 30.07 bylby: 5 pokoi ze sniadaniem dla nikogo. Pokoj, ktorego nie
// ma doslownie w tekscie zrodlowym, musi zostac odrzucony.
const zrodlo = "Rezerwacje grupowe Gr. 3550 KOMPAS POLAND 303 Double 305 Double 307 Double 315 Double";
assert.strictEqual(roomAppearsInSource("303", zrodlo), true, "pokoj obecny w raporcie ma przejsc");
assert.strictEqual(roomAppearsInSource("315", zrodlo), true);
assert.strictEqual(roomAppearsInSource("306", zrodlo), false, "pokoj 306 NIE wystepuje w raporcie — halucynacja");
assert.strictEqual(roomAppearsInSource("308", zrodlo), false);
assert.strictEqual(roomAppearsInSource("313", zrodlo), false);
// Nie moze dac falszywego trafienia na fragmencie dluzszej liczby
assert.strictEqual(roomAppearsInSource("30", "pokoj 303"), false, "\"30\" nie moze trafic w \"303\"");
assert.strictEqual(roomAppearsInSource("118A", "pokoj 118A zajety"), true, "aneks z litera dziala");
console.log("OK: roomAppearsInSource — zmyslone pokoje odrzucone, realne zachowane");

// ─── Parser POZYCYJNY pokoi grup (zastepuje LLM dla numerow pokoi) ──────────
// Uklad sekcji "Rezerwacje grupowe": pokoj x~52, nazwa x~145, "Gr. NNNN" x~540
// w komorce scalonej (renderowanej w srodku bloku). Test odwzorowuje realny
// raport z 28.07.2026 — grupa 5097 (Mäkelä Sara) w pokojach 322 i 323.
const grpItems = [
  { page: 1, x: 31, y: 537, s: "Rezerwacje grupowe" },
  { page: 1, x: 52, y: 503, s: "322" },
  { page: 1, x: 145, y: 503, s: "Mäkelä Sara" },
  { page: 1, x: 52, y: 489, s: "Double" },
  { page: 1, x: 145, y: 489, s: "+358 44 9788158" },
  { page: 1, x: 540, y: 489, s: "Gr. 5097" },
  { page: 1, x: 52, y: 464, s: "323" },
  { page: 1, x: 145, y: 464, s: "Mäkelä Sara" },
  { page: 1, x: 52, y: 450, s: "Double" },
  // druga grupa, pokoj z markerem KWHotel "106 n" -> ma dac czyste "106"
  { page: 1, x: 52, y: 426, s: "106 n" },
  { page: 1, x: 145, y: 426, s: "bąk konrad" },
  { page: 1, x: 540, y: 420, s: "Gr. 5083" },
  { page: 1, x: 52, y: 412, s: "Apartament" },
  { page: 1, x: 145, y: 412, s: "606838050" },
];
const grpResult = extractGroupRoomsFromPositions(grpItems);
const g5097 = grpResult.groups.find((g) => g.group_no === "5097");
assert.ok(g5097, "grupa 5097 musi zostac rozpoznana po numerze z kolumny Gr.");
assert.deepStrictEqual(g5097.rooms.sort(), ["322", "323"], "oba pokoje grupy z kolumny x~52");
const g5083 = grpResult.groups.find((g) => g.group_no === "5083");
assert.deepStrictEqual(g5083.rooms, ["106"], "\"106 n\" musi dac czysty numer 106, bez markera");
// Typ pokoju ("Double"/"Apartament") NIE moze zostac wziety za numer pokoju
const wszystkie = grpResult.groups.flatMap((g) => g.rooms);
assert.ok(!wszystkie.some((r) => /DOUBLE|APARTAMENT/i.test(r)), "typ pokoju nie jest numerem pokoju");
console.log("OK: extractGroupRoomsFromPositions — pokoje grup czytane z pozycji, bez LLM");

console.log("HK automation guests/LLM parser tests OK");

// ─── preferGroupWithRooms: zrodlo pozycyjne bije LLM niezaleznie od dlugosci ──
// Realny remis 28.07.2026: LLM dal 27 pokoi dla grupy 3550 (5 zmyslonych),
// parser pozycyjny tez 27 (wszystkie prawdziwe). Dlugosc nie rozstrzyga.
const zLlm = { group_no: "3550", rooms: ["201", "226", "306", "308", "311"] };
const zPozycji = { group_no: "3550", rooms: ["201", "202", "208"], rooms_source: "positional" };
assert.deepStrictEqual(preferGroupWithRooms(zLlm, zPozycji), zPozycji, "pozycyjna lista wygrywa z LLM");
assert.deepStrictEqual(preferGroupWithRooms(zPozycji, zLlm), zPozycji, "pozycyjna wygrywa takze gdy LLM jest nowszy i dluzszy");
console.log("OK: preferGroupWithRooms — zrodlo pozycyjne nadrzedne wobec LLM");
