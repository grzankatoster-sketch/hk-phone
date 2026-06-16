// Synchronizacja planow HK do Supabase prosto z pipeline'u automatyzacji.
// Wpisuje WYLACZNIE pole pm_room_types + room_types + updated_at — pola
// assignments/pm_assignments naleza do App.jsx (przypisania pracownikow) i nie
// sa nadpisywane dzieki polityce PostgREST `resolution=merge-duplicates`,
// ktora aktualizuje tylko kolumny obecne w body.

const { HK_ALL, ROOM_TYPE_BY_NO } = require("./rooms.cjs");

// Apartamenty: typ NIE jest stały (np. "DBL", "2xDBL", "D+T+SOFA") — recepcja
// wybiera go ręcznie per dzień w panelu HK. Nie wolno go nadpisywać twardym "APT".
const APT_ROOMS = new Set((HK_ALL || []).filter((r) => r.apt).map((r) => r.no));

function buildPmRoomTypes(data) {
  const out = {};
  if (!data || typeof data !== "object") return out;
  for (const [room, info] of Object.entries(data)) {
    if (!info || typeof info !== "object") continue;
    const s = info.status;
    if (s === "W" || s === "WP" || s === "PG" || s === "PGZ") {
      out[room] = s;
    } else if (info.br) out[room] = "BR";
    else if (info.zs) out[room] = "ZS";
  }
  return out;
}

function buildRoomTypes(existing) {
  const rt = {};
  for (const r of HK_ALL || []) rt[r.no] = r.type;
  // Fallback gdy HK_ALL nie jest re-eksportowany
  if (!Object.keys(rt).length && ROOM_TYPE_BY_NO) {
    for (const [no, t] of Object.entries(ROOM_TYPE_BY_NO)) rt[no] = t;
  }
  // Zachowaj typ apartamentu wpisany przez recepcję (jeśli istnieje) — automatyzacja
  // z maila nie zna realnego ukladu apartamentu, wiec nie nadpisuje wpisanej wartosci.
  if (existing && typeof existing === "object") {
    for (const no of APT_ROOMS) {
      if (existing[no]) rt[no] = existing[no];
    }
  }
  return rt;
}

// Pobiera aktualne room_types z hk_plan dla wskazanych dat, by zachowac recznie
// wpisane typy apartamentow podczas upsertu z automatyzacji.
async function fetchExistingRoomTypes(url, key, dates) {
  const out = {};
  if (!dates.length) return out;
  try {
    const q = `${url}/rest/v1/hk_plan?date=in.(${dates.join(",")})&select=date,room_types`;
    const res = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (res.ok) {
      const rows = await res.json();
      for (const row of Array.isArray(rows) ? rows : []) out[row.date] = row.room_types || {};
    }
  } catch {
    /* brak sieci — zwroc puste, buildRoomTypes uzyje twardych typow */
  }
  return out;
}

async function upsertPlansToSupabase(plansByDate, meta, log) {
  const url = process.env.VITE_SUPABASE_URL || "";
  const key = process.env.VITE_SUPABASE_ANON_KEY || "";
  if (!url || !key) {
    log?.info?.("[hk-auto] Supabase sync pominiety: brak VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY w env.");
    return { ok: false, reason: "no-config", uploaded: 0 };
  }
  if (typeof fetch !== "function") {
    log?.warn?.("[hk-auto] Supabase sync pominiety: brak globalnego fetch (wymaga Node 18+).");
    return { ok: false, reason: "no-fetch", uploaded: 0 };
  }

  const updated_at = meta?.generatedAt || new Date().toISOString();

  // Najpierw policz daty z planami, potem pobierz istniejace room_types, by
  // zachowac recznie wpisane typy apartamentow zamiast je nadpisac twardym "APT".
  const candidateDates = Object.entries(plansByDate || {})
    .filter(([, data]) => data && typeof data === "object" && Object.keys(buildPmRoomTypes(data)).length)
    .map(([date]) => date);
  const existingByDate = await fetchExistingRoomTypes(url, key, candidateDates);

  const rows = [];
  for (const [date, data] of Object.entries(plansByDate || {})) {
    if (!data || typeof data !== "object") continue;
    const pm_room_types = buildPmRoomTypes(data);
    if (!Object.keys(pm_room_types).length) continue;
    const room_types = buildRoomTypes(existingByDate[date]);
    rows.push({ date, pm_room_types, room_types, updated_at });
  }
  if (!rows.length) {
    log?.info?.("[hk-auto] Supabase sync: brak danych do uploadu.");
    return { ok: true, uploaded: 0 };
  }

  try {
    const res = await fetch(`${url}/rest/v1/hk_plan?on_conflict=date`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log?.warn?.(`[hk-auto] Supabase sync HTTP ${res.status}: ${text.slice(0, 200)}`);
      return { ok: false, reason: `http-${res.status}`, uploaded: 0 };
    }
    log?.info?.(`[hk-auto] Supabase sync: zapisano ${rows.length} dni (${rows.map(r => r.date).join(", ")}).`);
    return { ok: true, uploaded: rows.length };
  } catch (e) {
    log?.warn?.(`[hk-auto] Supabase sync BLAD: ${e.message}`);
    return { ok: false, reason: "exception", uploaded: 0, error: e.message };
  }
}

module.exports = { upsertPlansToSupabase, buildPmRoomTypes, buildRoomTypes };
