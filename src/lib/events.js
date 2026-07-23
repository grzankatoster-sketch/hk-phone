// Sygnał „wydarzenia w mieście" dla silnika cen (WYKONANIE 4.21). Duży koncert/mecz/targi
// → więcej gości szukających pokoju na wieczór → podbij sufit. Dwa źródła:
//  1) RĘCZNE (kierownik) — trwałe w localStorage; łapie to, czego Ticketmaster nie ma.
//  2) AUTO — Ticketmaster Discovery API przez Edge Function `events` (ukrywa klucz).
// Ręczne wygrywa nad auto. Zwracany kształt: { "YYYY-MM-DD": { boost>=1, label } }.
import { supabase } from "./supabase";
import { TENANT_ID } from "./constants";
import { loadJson, saveJson, STORAGE_KEYS } from "./storage";

export function loadManualEvents() { return loadJson(STORAGE_KEYS.pricingEvents, {}); }

export function setManualEvent(date, boost, label = "") {
  const all = loadManualEvents();
  const b = Number(boost) || 0;
  if (b <= 1) delete all[date]; else all[date] = { boost: Math.min(1.4, b), label };
  saveJson(STORAGE_KEYS.pricingEvents, all);
  return all;
}

export async function fetchTicketmasterEvents({ from, to } = {}) {
  if (!supabase) return {};
  try {
    const { data } = await supabase.functions.invoke("events", { body: { tenant_id: TENANT_ID, from, to } });
    return (data && data.byDate) || {};
  } catch { return {}; }
}

export const mergeEvents = (auto, manual) => ({ ...(auto || {}), ...(manual || {}) });
