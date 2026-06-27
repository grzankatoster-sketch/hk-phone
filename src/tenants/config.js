// Konfiguracja tenanta — czyta zmienne VITE_* z .env, fallback to Conrad Comfort defaults.
// Nowy hotel = nowy plik .env z własnymi wartościami, zero zmian w kodzie.
//
// Zmienne środowiskowe (wszystkie opcjonalne):
//   VITE_HOTEL_NAME          — np. "Grand Plaza Hotel"
//   VITE_HOTEL_SHORT         — np. "GP" (skrót 2-3 znaki)
//   VITE_MANAGERS            — lista kierowników rozdzielona przecinkiem, np. "Anna,Tomasz"
//   VITE_EMPLOYEES           — domyślni pracownicy, np. "Ewa,Piotr,Marta"
//   VITE_MAINTAINERS         — konserwatorzy, np. "Krzysztof,Zdzisław"
//   VITE_PARTER_JSON         — JSON array: '[{"id":"hol","label":"Hol"}]'
//   VITE_HK_FLOOR1_JSON      — JSON array pokoi 1. piętra
//   VITE_HK_FLOOR2_JSON      — JSON array pokoi 2. piętra
//   VITE_HK_FLOOR3_JSON      — JSON array pokoi 3. piętra
//   VITE_HK_APTS             — numery apartamentów rozdzielone przecinkiem
//   VITE_HK_SPECIAL_ROOMS    — pokoje specjalne rozdzielone przecinkiem
//   VITE_HK_SGL_TWIN_ONLY    — pokoje SGL/TWIN-only rozdzielone przecinkiem
//   VITE_HK_RETENTION_DAYS   — liczba dni przechowywania planów HK (domyślnie 31)

import { DEFAULTS } from "./defaults";

function parseList(envKey, fallback) {
  const v = import.meta.env[envKey];
  if (!v) return fallback;
  return v.split(",").map(s => s.trim()).filter(Boolean);
}

function parseJson(envKey, fallback) {
  const v = import.meta.env[envKey];
  if (!v) return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}

// Licencja SaaS: VITE_MODULES = whitelist włączonych modułów (np. "hk,parking,opinie").
// Brak zmiennej → wszystkie moduły z DEFAULTS.modules włączone (pełna licencja).
// Dzięki temu jeden hotel płaci za pełen zakres, inny za wybrane sekcje — bez zmian w kodzie.
function parseModules() {
  const all = DEFAULTS.modules;
  const v = import.meta.env.VITE_MODULES;
  if (!v) return { ...all };
  const on = new Set(v.split(",").map(s => s.trim()).filter(Boolean));
  const out = {};
  Object.keys(all).forEach(k => { out[k] = on.has(k); });
  return out;
}

const hk = {
  floor1:           parseJson("VITE_HK_FLOOR1_JSON",   DEFAULTS.hk.floor1),
  floor2:           parseJson("VITE_HK_FLOOR2_JSON",   DEFAULTS.hk.floor2),
  floor3:           parseJson("VITE_HK_FLOOR3_JSON",   DEFAULTS.hk.floor3),
  apts:             parseList("VITE_HK_APTS",           DEFAULTS.hk.apts),
  specialRooms:     parseList("VITE_HK_SPECIAL_ROOMS",  DEFAULTS.hk.specialRooms),
  roomsSglTwinOnly: parseList("VITE_HK_SGL_TWIN_ONLY",  DEFAULTS.hk.roomsSglTwinOnly),
  planRetentionDays: parseInt(import.meta.env.VITE_HK_RETENTION_DAYS || "") || DEFAULTS.hk.planRetentionDays,
};

export const tenantConfig = {
  hotelName:  import.meta.env.VITE_HOTEL_NAME  || DEFAULTS.hotelName,
  hotelShort: import.meta.env.VITE_HOTEL_SHORT || DEFAULTS.hotelShort,
  managers:    parseList("VITE_MANAGERS",   DEFAULTS.managers),
  employees:   parseList("VITE_EMPLOYEES",  DEFAULTS.employees),
  maintainers: parseList("VITE_MAINTAINERS", DEFAULTS.maintainers),
  parter:      parseJson("VITE_PARTER_JSON", DEFAULTS.parter),
  hk,
  modules:     parseModules(),
};
