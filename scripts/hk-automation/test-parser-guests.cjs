const assert = require("assert");
const { parsePosilkiGrid } = require("./lib/parser-posilki.cjs");
const { sanitizeRoomType, toParsedShape, BUSINESS_MARKERS_RE } = require("./lib/parser-guests-llm.cjs");
const { splitEvenly, expandGroupMealReservations } = require("./lib/meals-group-expand.cjs");

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

console.log("HK automation guests/LLM parser tests OK");
