// Wysyła rozpoznane rezerwacje z "Raportu Posiłków" (PDF, mail) do tabeli
// meal_plans w Supabase. Wzorem upsertPlansToSupabase w supabase-sync.cjs —
// ten sam mechanizm (REST + on_conflict merge-duplicates), inna tabela.

async function upsertMealsToSupabase(reservations, log) {
  const url = process.env.VITE_SUPABASE_URL || "";
  const key = process.env.VITE_SUPABASE_ANON_KEY || "";
  if (!url || !key) {
    log?.info?.("[hk-auto] Meals sync pominiety: brak VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY w env.");
    return { ok: false, reason: "no-config", uploaded: 0 };
  }
  if (!Array.isArray(reservations) || !reservations.length) {
    log?.info?.("[hk-auto] Meals sync: brak rezerwacji do uploadu.");
    return { ok: true, uploaded: 0 };
  }
  // Ten sam pokoj tej samej rezerwacji moze trafic tu DWA razy w jednym
  // wsadzie - np. ta sama grupa wystepuje w dwoch zachodzacych na siebie
  // oknami dat "Raportach Posilkow" i rozbija sie za kazdym razem osobno.
  // Postgres ON CONFLICT DO UPDATE nie pozwala dwa razy trafic w ten sam
  // wiersz w JEDNYM poleceniu (HTTP 500, "cannot affect row a second time")
  // i pada CALY wsad - deduplikacja po kluczu konfliktu ratuje resztę.
  const seen = new Map();
  for (const r of reservations) {
    const key = `${r.tenant_id}|${r.reservation_id}|${r.room}`;
    seen.set(key, r); // ostatni wygrywa
  }
  const deduped = [...seen.values()];
  if (deduped.length !== reservations.length) {
    log?.info?.(`[hk-auto] Meals sync: zdeduplikowano ${reservations.length - deduped.length} powielonych wierszy (ten sam pokoj/rezerwacja).`);
  }
  try {
    const res = await fetch(`${url}/rest/v1/meal_plans?on_conflict=tenant_id,reservation_id,room`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(deduped),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log?.warn?.(`[hk-auto] Meals sync HTTP ${res.status}: ${text.slice(0, 200)}`);
      return { ok: false, reason: `http-${res.status}`, uploaded: 0 };
    }
    log?.info?.(`[hk-auto] Meals sync: zapisano ${deduped.length} pozycji (${deduped.map((r) => r.room).join(", ")}).`);
    return { ok: true, uploaded: deduped.length };
  } catch (e) {
    log?.warn?.(`[hk-auto] Meals sync BLAD: ${e.message}`);
    return { ok: false, reason: "exception", uploaded: 0, error: e.message };
  }
}

// Kasuje stare zbiorcze wiersze grupy (room="4963G" itp.) po tym, jak rozbicie
// na pokoje (meals-group-expand.cjs) zastąpiło je pozycjami per pokój — inaczej
// upsert (merge-duplicates) tylko DOPISAŁBY nowe wiersze obok starego blob-a,
// podwajając policzone śniadania w podsumowaniu.
async function deleteStaleMealRows(rows, log) {
  const url = process.env.VITE_SUPABASE_URL || "";
  const key = process.env.VITE_SUPABASE_ANON_KEY || "";
  if (!url || !key) return { ok: false, reason: "no-config", deleted: 0 };
  if (!Array.isArray(rows) || !rows.length) return { ok: true, deleted: 0 };

  let deleted = 0;
  for (const row of rows) {
    if (!row?.reservation_id || !row?.room) continue;
    try {
      const q = `${url}/rest/v1/meal_plans?tenant_id=eq.${encodeURIComponent(row.tenant_id || "00000000-0000-0000-0000-000000000001")}&reservation_id=eq.${encodeURIComponent(row.reservation_id)}&room=eq.${encodeURIComponent(row.room)}`;
      const res = await fetch(q, { method: "DELETE", headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (res.ok) deleted += 1;
      else log?.warn?.(`[hk-auto] Kasowanie starego wiersza grupy HTTP ${res.status}: ${row.reservation_id}/${row.room}`);
    } catch (e) {
      log?.warn?.(`[hk-auto] Kasowanie starego wiersza grupy BLAD: ${e.message}`);
    }
  }
  if (deleted) log?.info?.(`[hk-auto] Skasowano ${deleted} starych zbiorczych wierszy grup (rozbite na pokoje).`);
  return { ok: true, deleted };
}

module.exports = { upsertMealsToSupabase, deleteStaleMealRows };
