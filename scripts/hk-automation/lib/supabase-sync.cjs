// Synchronizacja planow HK do Supabase prosto z pipeline'u automatyzacji.
// Wpisuje WYLACZNIE pole pm_room_types + room_types + updated_at — pola
// assignments/pm_assignments naleza do App.jsx (przypisania pracownikow) i nie
// sa nadpisywane dzieki polityce PostgREST `resolution=merge-duplicates`,
// ktora aktualizuje tylko kolumny obecne w body.

const { HK_ALL, ROOM_TYPE_BY_NO } = require("./rooms.cjs");

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

function buildRoomTypes() {
  const rt = {};
  for (const r of HK_ALL || []) rt[r.no] = r.type;
  // Fallback gdy HK_ALL nie jest re-eksportowany
  if (!Object.keys(rt).length && ROOM_TYPE_BY_NO) {
    for (const [no, t] of Object.entries(ROOM_TYPE_BY_NO)) rt[no] = t;
  }
  return rt;
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

  const room_types = buildRoomTypes();
  const updated_at = meta?.generatedAt || new Date().toISOString();
  const rows = [];
  for (const [date, data] of Object.entries(plansByDate || {})) {
    if (!data || typeof data !== "object") continue;
    const pm_room_types = buildPmRoomTypes(data);
    if (!Object.keys(pm_room_types).length) continue;
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
