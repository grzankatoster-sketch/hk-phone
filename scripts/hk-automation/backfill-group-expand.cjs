// Jednorazowy backfill: rozbija JUZ zaimportowane zbiorcze wiersze grup (meal_plans,
// is_group=true) na pojedyncze pokoje, dla grup ktorych liste pokoi mamy w zapisanym
// snapshocie gosci (guests-*.json). Automatyczny pipeline (service.cjs) robi to samo,
// ale TYLKO gdy w tym samym cyklu przyjdzie swiezy "Raport Posilkow" - nie retroaktywnie
// dla wierszy juz zapisanych wczesniej. To uzupelnia braki bez czekania na kolejny mail.
const { loadConfig } = require("./lib/config.cjs");
const { loadPersistedGroups } = require("./lib/guest-snapshots.cjs");
const { expandGroupMealReservations } = require("./lib/meals-group-expand.cjs");
const { upsertMealsToSupabase, deleteStaleMealRows } = require("./lib/meals-sync.cjs");
const { todayKey } = require("./lib/dates.cjs");

async function main() {
  const config = loadConfig();
  const tenantId = process.env.VITE_TENANT_ID || "";
  const url = process.env.VITE_SUPABASE_URL || "";
  const key = process.env.VITE_SUPABASE_ANON_KEY || "";
  if (!tenantId || !url || !key) {
    console.error("BLAD: brak VITE_TENANT_ID / VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY w env (.env).");
    process.exitCode = 1;
    return;
  }

  const res = await fetch(`${url}/rest/v1/meal_plans?tenant_id=eq.${tenantId}&is_group=eq.true&select=*`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const aggregateRows = await res.json();
  console.log(`Zbiorczych wierszy grup w bazie: ${aggregateRows.length}`);

  const persistedGroups = loadPersistedGroups(config.outputDir, { todayIso: todayKey() });
  console.log(`Grup z listy przyjazdow (snapshot) dostepnych do dopasowania: ${persistedGroups.length}`);

  // Usun "id" (PK z oryginalnego zbiorczego wiersza) PRZED rozbiciem - inaczej
  // wszystkie rozbite pokoje danej grupy dziedzicza TEN SAM id i insert pada
  // na kolizji klucza glownego (meal_plans_pkey). Prawdziwy pipeline nigdy na
  // to nie trafia, bo swiezo sparsowane rezerwacje z PDF nie maja pola id.
  const aggregateRowsNoId = aggregateRows.map(({ id, created_at, updated_at, ...rest }) => rest);
  const expansion = expandGroupMealReservations(aggregateRowsNoId, persistedGroups);
  const toWrite = expansion.reservations.filter((r) => !r.is_group);
  const stillGrouped = expansion.reservations.filter((r) => r.is_group);

  console.log(`Do rozbicia (dopasowane): ${expansion.expandedGroups.length} grup ->`);
  expansion.expandedGroups.forEach((g) => console.log(`  - ${g.group_name || g.reservation_id}: ${g.rooms} pokoi, ${g.persons} os.`));
  console.log(`Bez dopasowania (zostaja zbiorcze, bez zmian): ${stillGrouped.length}`);

  if (!toWrite.length) {
    console.log("Brak dopasowan - nic do zapisania.");
    return;
  }

  const result = await upsertMealsToSupabase(toWrite, {
    info: (m) => console.log(m),
    warn: (m) => console.warn(m),
  });
  if (!result.ok) {
    console.error("Zapis nie powiodl sie - POMIJAM kasowanie starych zbiorczych wierszy (zeby nie zgubic danych).");
    return;
  }
  await deleteStaleMealRows(expansion.staleAggregateRows, {
    info: (m) => console.log(m),
    warn: (m) => console.warn(m),
  });
  console.log("Gotowe.");
}

main().catch((e) => { console.error("BLAD:", e.stack || e.message); process.exitCode = 1; });
