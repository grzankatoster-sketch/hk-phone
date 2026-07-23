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
  try {
    const res = await fetch(`${url}/rest/v1/meal_plans?on_conflict=tenant_id,reservation_id,room`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(reservations),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log?.warn?.(`[hk-auto] Meals sync HTTP ${res.status}: ${text.slice(0, 200)}`);
      return { ok: false, reason: `http-${res.status}`, uploaded: 0 };
    }
    log?.info?.(`[hk-auto] Meals sync: zapisano ${reservations.length} pozycji (${reservations.map((r) => r.room).join(", ")}).`);
    return { ok: true, uploaded: reservations.length };
  } catch (e) {
    log?.warn?.(`[hk-auto] Meals sync BLAD: ${e.message}`);
    return { ok: false, reason: "exception", uploaded: 0, error: e.message };
  }
}

module.exports = { upsertMealsToSupabase };
