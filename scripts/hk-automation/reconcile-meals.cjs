// Uzgodnienie meal_plans ze ZRODLEM PRAWDY (PDF-y), po incydencie 2026-07-28
// (halucynacje pokoi grup + zgubiona strona 2 raportu posilkow).
//
// Buduje poprawny stan od zera: pokoje grup z parsera POZYCYJNEGO listy
// przyjazdow, posilki z Raportu Posilkow, po czym:
//   - dopisuje/aktualizuje wiersze, ktore powinny istniec,
//   - KASUJE wiersze grup, ktorych w raporcie nie ma (zmyslone przez LLM) —
//     sam upsert by ich nie usunal, bo tylko dodaje i nadpisuje.
// Domyslnie DRY RUN; zapis dopiero z flaga --apply.
const fs = require("fs");
const path = require("path");
const { extractPdfPositions } = require("./lib/pdf.cjs");
const { parsePosilkiGrid } = require("./lib/parser-posilki.cjs");
const { extractGroupRoomsFromPositions } = require("./lib/parser-arrivals-groups.cjs");
const { expandGroupMealReservations } = require("./lib/meals-group-expand.cjs");
const { upsertMealsToSupabase } = require("./lib/meals-sync.cjs");
const { loadConfig } = require("./lib/config.cjs");

const APPLY = process.argv.includes("--apply");
const TENANT = "00000000-0000-0000-0000-000000000001";

const newestBy = (dir, re, n) =>
  fs.readdirSync(dir).filter((f) => re.test(f)).sort().slice(-n).map((f) => path.join(dir, f));

async function main() {
  const config = loadConfig();
  const mailDir = path.join(config.outputDir, "mail-pdf");
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  // 1. Pokoje grup — deterministycznie, z kilku ostatnich list przyjazdow
  //    (rozne dni = rozne grupy; nowsza lista nadpisuje starsza dla tej samej).
  const groupsByNo = new Map();
  for (const pdf of newestBy(mailDir, /przyjazd/i, 12)) {
    const res = extractGroupRoomsFromPositions(await extractPdfPositions(pdf));
    for (const g of res.groups) {
      if (g.group_no && g.rooms.length) groupsByNo.set(String(g.group_no), g);
    }
  }
  console.log("Grupy z parsera pozycyjnego:");
  for (const g of groupsByNo.values()) console.log(`  Gr.${g.group_no} ${g.group_name} -> ${g.rooms.length} pok: ${g.rooms.join(",")}`);

  // 2. Posilki z najnowszego raportu
  const mealsPdf = newestBy(mailDir, /posi[łl]k/i, 1)[0];
  console.log(`\nRaport posilkow: ${path.basename(mealsPdf)}`);
  const parsed = parsePosilkiGrid(await extractPdfPositions(mealsPdf), { tenantId: TENANT });
  const expansion = expandGroupMealReservations(parsed.reservations, [...groupsByNo.values()]);
  const correct = expansion.reservations;

  // 3. Porownanie ze stanem w bazie — dla rezerwacji objetych tym raportem
  const resIds = [...new Set(correct.map((r) => r.reservation_id))];
  const q = `${url}/rest/v1/meal_plans?select=id,reservation_id,room,persons&reservation_id=in.(${resIds.map(encodeURIComponent).join(",")})`;
  const inDb = await (await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}` } })).json();

  // ZAKRES KASOWANIA — celowo waski, dwa bezpieczniki:
  //  1) tylko grupy, dla ktorych MAMY pewna liste pozycyjna (reszty nie ruszamy,
  //     bo brak listy != wiersz jest bledny),
  //  2) tylko pobyty jeszcze trwajace/przyszle (departure >= dzis) — sniadania
  //     z przeszlosci sa juz wydane, przepisywanie historii nic nie naprawia,
  //     a moze zniszczyc slad tego, co realnie sie wydarzylo.
  const dzis = new Date().toISOString().slice(0, 10);
  const pewneGrupy = new Set([...groupsByNo.keys()].map((no) => `${no}G`));
  const aktualne = new Set(correct.filter((r) => r.departure >= dzis).map((r) => r.reservation_id));
  const correctKeys = new Set(correct.map((r) => `${r.reservation_id}|${r.room}`));
  const doKasacji = inDb.filter(
    (r) => !correctKeys.has(`${r.reservation_id}|${r.room}`)
      && pewneGrupy.has(r.reservation_id)
      && aktualne.has(r.reservation_id)
  );
  const pominiete = inDb.filter((r) => !correctKeys.has(`${r.reservation_id}|${r.room}`) && !doKasacji.includes(r));
  if (pominiete.length) console.log(`\n(pominieto ${pominiete.length} wierszy spoza zakresu: historyczne albo grupy bez pewnej listy)`);
  const wBazie = new Set(inDb.map((r) => `${r.reservation_id}|${r.room}`));
  const doDodania = correct.filter((r) => !wBazie.has(`${r.reservation_id}|${r.room}`));

  // Nie wskrzeszaj ZBIORCZEGO wiersza grupy, ktora ma juz rozbicie na pokoje
  // w bazie — to odtworzyloby duplikat kafla naprawiony wczesniej tego dnia
  // (grupa widoczna raz jako "GRUPA", raz jako pojedyncze pokoje).
  const maRozbicie = new Set(inDb.filter((r) => r.room !== r.reservation_id).map((r) => r.reservation_id));
  const doZapisu = correct.filter((r) => !(r.is_group && maRozbicie.has(r.reservation_id)));
  const wskrzeszone = correct.length - doZapisu.length;
  if (wskrzeszone) console.log(`(pominieto ${wskrzeszone} zbiorczych wierszy grup, ktore maja juz rozbicie na pokoje)`);

  console.log(`\nDO DODANIA (${doDodania.filter((r) => doZapisu.includes(r)).length}):`);
  doDodania.filter((r) => doZapisu.includes(r)).forEach((r) => console.log(`  + ${r.reservation_id} pok.${r.room} ${r.persons} os.`));
  console.log(`\nDO SKASOWANIA — nie ma ich w raporcie (${doKasacji.length}):`);
  doKasacji.forEach((r) => console.log(`  - ${r.reservation_id} pok.${r.room} ${r.persons} os.`));

  if (!APPLY) {
    console.log("\n[DRY RUN] Nic nie zapisano. Uruchom z --apply, zeby wykonac.");
    return;
  }

  const up = await upsertMealsToSupabase(doZapisu, { info: console.log, warn: console.warn });
  if (!up.ok) {
    console.error("Upsert nieudany — NIE kasuje niczego (zeby nie zgubic danych).");
    return;
  }
  for (const row of doKasacji) {
    const res = await fetch(`${url}/rest/v1/meal_plans?id=eq.${row.id}`, {
      method: "DELETE", headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) console.warn(`  Kasowanie ${row.reservation_id}/${row.room} HTTP ${res.status}`);
  }
  console.log(`\nGotowe: zapisano ${correct.length}, skasowano ${doKasacji.length}.`);
}

main().catch((e) => { console.error("BLAD:", e.stack || e.message); process.exitCode = 1; });
