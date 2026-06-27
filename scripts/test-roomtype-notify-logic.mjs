// Test logiki POWIADOMIENIA o zmianie typu pokoju na telefonie HK (index.html).
// Replikuje 1:1 decyzję z handlera realtime hk_plan: kiedy odpalić toast +
// podświetlenie karty, a kiedy NIE. Oraz czyszczenie znacznika po otwarciu pokoju.
// Run: node scripts/test-roomtype-notify-logic.mjs
let pass = 0; const fails = [];
const ok = (n, c) => { if (c) { pass++; console.log("  ✓ " + n); } else { fails.push(n); console.log("  ✗ " + n); } };

// ── Replika logiki z public/hk-phone/index.html ──────────────────────────────
// Wykrycie zmiany typu na MOICH pokojach (myRooms+myPmRooms): notify gdy
// stary i nowy typ istnieją i się różnią. Zwraca zmiany + zbiór do podświetlenia.
function detectTypeChanges(roomTypes, rowRoomTypes, myRooms, myPmRooms) {
  const nextTypes = rowRoomTypes || roomTypes;
  const mine = [...myRooms, ...myPmRooms];
  const toasts = []; const highlighted = new Set();
  for (const no of mine) {
    const was = roomTypes[no], now = nextTypes[no];
    if (was && now && was !== now) {
      highlighted.add(no);
      toasts.push(`Pokój ${no}: typ ${was} → ${now}`);
    }
  }
  return { toasts, highlighted, nextTypes };
}

console.log("\n── Decyzja: kiedy alarmować Kasię o zmianie typu ──");

// 1) Scenariusz użytkownika: 323 mój, DBL → TWIN.
let r = detectTypeChanges({ "323": "DBL" }, { "323": "TWIN" }, ["323"], []);
ok("323 (mój) DBL→TWIN → toast leci", r.toasts.length === 1 && /323.*DBL → TWIN/.test(r.toasts[0]));
ok("323 → karta podświetlona", r.highlighted.has("323"));

// 2) Brak realnej zmiany (DBL→DBL) → cisza (bez fałszywego alarmu).
r = detectTypeChanges({ "323": "DBL" }, { "323": "DBL" }, ["323"], []);
ok("323 DBL→DBL → brak toasta", r.toasts.length === 0 && r.highlighted.size === 0);

// 3) Zmiana na CUDZYM pokoju (401 nie mój) → cisza.
r = detectTypeChanges({ "401": "DBL" }, { "401": "TWIN" }, ["323"], []);
ok("401 (nie mój) DBL→TWIN → brak toasta", r.toasts.length === 0);

// 4) Pokój PM (popołudniowy) też liczony.
r = detectTypeChanges({ "210": "TWIN" }, { "210": "DBL" }, [], ["210"]);
ok("210 (mój PM) TWIN→DBL → toast leci", r.toasts.length === 1 && r.highlighted.has("210"));

// 5) Pierwsze pojawienie się typu (był brak → jest) → NIE alarmuje (to nie zmiana).
r = detectTypeChanges({}, { "323": "DBL" }, ["323"], []);
ok("brak→DBL (pierwszy odczyt) → brak fałszywego toasta", r.toasts.length === 0);

// 6) Brak room_types w evencie → zachowujemy stare, brak alarmu.
r = detectTypeChanges({ "323": "DBL" }, null, ["323"], []);
ok("event bez room_types → brak alarmu, typy nietknięte", r.toasts.length === 0 && r.nextTypes["323"] === "DBL");

// 7) Czyszczenie po otwarciu pokoju (toggleRoom usuwa znacznik).
const changed = new Set(["323", "210"]);
const toggleRoom = (no) => changed.delete(no);
toggleRoom("323");
ok("po otwarciu 323 → znacznik znika, 210 zostaje", !changed.has("323") && changed.has("210"));

console.log(`\n── Wynik: ${pass} OK, ${fails.length} FAIL ──`);
process.exit(fails.length ? 1 : 0);
