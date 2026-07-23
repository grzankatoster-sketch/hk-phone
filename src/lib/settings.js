// Magazyn ustawień tenanta (WYKONANIE 2.19). localStorage jako cache/offline-bufor,
// Supabase (tenant_settings) jako źródło współdzielone między stanowiskami. Wartości
// nieustawione → default z SETTINGS_REGISTRY. Wzorzec jak modules.js/2.2 (fallback-safe).
import { supabase } from "./supabase";
import { TENANT_ID } from "./constants";
import { SETTINGS_BY_KEY } from "./settingsRegistry";
import { STORAGE_KEYS, loadJson, saveJson } from "./storage";

let cache = loadJson(STORAGE_KEYS.tenantSettings, {}); // { key: value }

export function getSetting(key) {
  if (cache && Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];
  return SETTINGS_BY_KEY[key]?.default;
}

export function getAllSettings() {
  const out = {};
  for (const k of Object.keys(SETTINGS_BY_KEY)) out[k] = getSetting(k);
  return out;
}

export function setSetting(key, value) {
  cache = { ...cache, [key]: value };
  saveJson(STORAGE_KEYS.tenantSettings, cache);
  // Zapis do Supabase — fire-and-forget (nie blokuje UI; offline zostaje w localStorage).
  if (supabase) {
    supabase
      .from("tenant_settings")
      .upsert(
        { tenant_id: TENANT_ID, key, value, updated_at: new Date().toISOString() },
        { onConflict: "tenant_id,key" }
      )
      .then(() => {}, () => {});
  }
}

// Ładuje ustawienia z DB do cache (na starcie aplikacji). Bezpieczne: przy braku
// tabeli/błędzie zostaje localStorage/defaults (nie wywraca aplikacji).
export async function loadTenantSettings() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from("tenant_settings")
      .select("key,value")
      .eq("tenant_id", TENANT_ID);
    if (error || !Array.isArray(data)) return;
    const fromDb = {};
    for (const r of data) fromDb[r.key] = r.value;
    cache = { ...cache, ...fromDb }; // DB = źródło prawdy gdy dostępne
    saveJson(STORAGE_KEYS.tenantSettings, cache);
  } catch { /* zostaw localStorage/defaults */ }
}
