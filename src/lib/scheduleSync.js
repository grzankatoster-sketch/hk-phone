// scheduleSync.js — klient dwukierunkowej, synchronizowanej na żywo edycji grafiku.
// Recepcja (App.jsx) i panel menedżerski (panel.html) edytują ten sam dokument
// w panel_mirror (kind='schedule'); merge po stronie bazy (schedule_merge,
// migracja 0034) nie kasuje cudzych komórek. Wzór 1:1 z lib/hkState.js.
import { supabase } from "./supabase";
import { TENANT_ID } from "./constants";
import { hkStateDeviceId } from "./hkState";

// Wyślij scalany patch komórek grafiku: { "YYYY-MM-DD": { "Imię": {start,end,shift}|null } }.
// Zwraca nowy wiersz (z rev) lub null. Fire-and-forget bezpieczne (łapie błędy).
export async function pushSchedule(cells) {
  if (!supabase || !cells || typeof cells !== "object") return null;
  const { data, error } = await supabase.rpc("schedule_merge", {
    p_cells: cells,
    p_device: hkStateDeviceId(),
    p_tenant: TENANT_ID,
  });
  if (error) { console.error("[schedule] merge:", error.message); return null; }
  return data || null;
}

// Pobierz bieżący dokument grafiku (lub null) — { data, rev, updated_device, updated_at }.
export async function fetchSchedule() {
  if (!supabase) return null;
  const { data } = await supabase
    .from("panel_mirror")
    .select("data,rev,updated_device,updated_at")
    .eq("tenant_id", TENANT_ID)
    .eq("kind", "schedule")
    .maybeSingle();
  return data || null;
}

// Subskrybuj zmiany grafiku. onChange(row) wołane przy evencie realtime, gdzie
// row = nowy wiersz panel_mirror. Filtruje po kind='schedule'. Zwraca odsubskrybowanie.
export function subscribeSchedule(onChange) {
  if (!supabase) return () => {};
  const ch = supabase
    .channel("panel-mirror-schedule")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "panel_mirror", filter: `tenant_id=eq.${TENANT_ID}` },
      (payload) => { if (payload?.new && payload.new.kind === "schedule") onChange(payload.new); }
    )
    .subscribe();
  return () => { try { supabase.removeChannel(ch); } catch { /* noop */ } };
}
