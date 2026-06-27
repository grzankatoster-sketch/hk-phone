// hkState.js — klient wspólnego, synchronizowanego na żywo stanu dnia HK.
// Jedno źródło prawdy (tabela hk_state) dla recepcji, koordynatora i kierownika HK.
// Patrz migracja 0032_hk_state.sql. Patch jest płytko mergowany po stronie bazy,
// więc {rooms:…} z recepcji i {roster:…} z paneli nie kasują się nawzajem.
import { supabase } from "./supabase";
import { TENANT_ID } from "./constants";

// Stabilny identyfikator urządzenia (sesja przeglądarki/Electron) — służy do
// IGNOROWANIA WŁASNEGO echa realtime (po zapisie dostajemy własny event z powrotem).
const DEVICE_KEY = "hk-state-device-id";
export function hkStateDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() || `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return `dev-${Math.random().toString(16).slice(2)}`;
  }
}

// Wyślij płytki patch dokumentu dnia, np. { rooms:{…} } lub { roster:[…] }.
// `by` = 'reception' | 'coordinator' | 'hk_manager'. Zwraca nowy wiersz (z rev) lub null.
export async function pushHkState(date, patch, by) {
  if (!supabase || !date || !patch || typeof patch !== "object") return null;
  const { data, error } = await supabase.rpc("hk_state_merge", {
    p_date: date,
    p_patch: patch,
    p_by: by || null,
    p_device: hkStateDeviceId(),
    p_tenant: TENANT_ID,
  });
  if (error) { console.error("[hk_state] merge:", error.message); return null; }
  return data || null;
}

// Pobierz bieżący stan dnia (lub null).
export async function fetchHkState(date) {
  if (!supabase || !date) return null;
  const { data } = await supabase
    .from("hk_state")
    .select("data,rev,updated_by,updated_device,updated_at")
    .eq("tenant_id", TENANT_ID)
    .eq("date", date)
    .maybeSingle();
  return data || null;
}

// Subskrybuj zmiany stanu dnia. onChange(row) wołane przy każdym evencie realtime,
// gdzie row = nowy wiersz { data, rev, updated_by, updated_device, updated_at }.
// Zwraca funkcję odsubskrybowania.
export function subscribeHkState(date, onChange) {
  if (!supabase || !date) return () => {};
  const ch = supabase
    .channel(`hk-state-${date}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "hk_state", filter: `date=eq.${date}` },
      (payload) => { if (payload?.new) onChange(payload.new); }
    )
    .subscribe();
  return () => { try { supabase.removeChannel(ch); } catch { /* noop */ } };
}
