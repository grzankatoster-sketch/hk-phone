// Rejestr modułów licencjonowalnych (SaaS) + brama włączania per tenant.
//
// Sekcje aplikacji są osobnymi plikami w src/modules/. Żeby „manewrować na
// licencji", o tym CZY dany moduł jest dostępny decyduje tenantConfig.modules
// (sterowany zmienną VITE_MODULES w .env — patrz src/tenants/config.js).
//
// Rdzeń przekazania zmiany (core:true) jest zawsze włączony i nie podlega
// licencji — bez niego panel recepcji nie ma sensu.
//
// scope: "worker"  — zakładka w pasku recepcji (WorkerSidebar)
//        "admin"   — zakładka panelu administratora recepcji (AdminSidebarRail)
//        "manager" — funkcja panelu kierownika
//
// WYKONANIE 2.4: rejestr obejmuje teraz WSZYSTKIE funkcje aplikacji (rdzeń core:true
// + licencjonowalne), żeby S1 (tiery START/STANDARD/PRO/PREMIUM) miały czym sterować.
// Funkcje admina dodane jako core:true = zachowanie bez zmian (zawsze dostępne);
// ewentualna reklasyfikacja na licencjonowalne to decyzja produktowa (5.1), nie ta pozycja.

import { tenantConfig } from "../tenants/config";

export const MODULE_REGISTRY = Object.freeze([
  // Rdzeń pracownika — zawsze włączony
  { key: "zmiana",      label: "Przegląd zmiany",  scope: "worker",  core: true },
  { key: "przekazanie", label: "Przekaż zmianę",   scope: "worker",  core: true },
  { key: "informacje",  label: "Informacje",       scope: "worker",  core: true },
  { key: "usterki",     label: "Usterki",          scope: "worker",  core: true },
  { key: "klucze",      label: "Klucze / karty",   scope: "worker",  core: true }, // 4.7; tier→5.1
  { key: "depozyty",    label: "Depozyty",         scope: "worker",  core: true }, // 4.8; tier→5.1
  { key: "historia",    label: "Historia",         scope: "worker",  core: true },
  // Rdzeń administratora recepcji — zawsze włączony (dziś bez flagi)
  { key: "kasa",        label: "Kasa",             scope: "admin",   core: true },
  { key: "ewidencja",   label: "Ewidencja",        scope: "admin",   core: true },
  { key: "pracownicy",  label: "Pracownicy",       scope: "admin",   core: true },
  { key: "grafik",      label: "Grafik",           scope: "admin",   core: true },
  { key: "statystyki",  label: "Statystyki",       scope: "admin",   core: true },
  { key: "korekty",     label: "Korekty",          scope: "admin",   core: true },
  { key: "wiadomosci",  label: "Wiadomości",       scope: "admin",   core: true },
  { key: "alerty",      label: "Alerty",           scope: "admin",   core: true },
  { key: "przypomnienia",label:"Przypomnienia",    scope: "admin",   core: true },
  { key: "wiki",        label: "Wiki",             scope: "admin",   core: true },
  { key: "ustawienia",  label: "Ustawienia",       scope: "admin",   core: true },
  { key: "ceny",        label: "Ceny",             scope: "admin",   core: true }, // 4.20; tier PREMIUM→5.1
  // Moduły licencjonowalne
  { key: "hk",          label: "Housekeeping",     scope: "worker" },
  { key: "parking",     label: "Parking",          scope: "worker" },
  { key: "goscie",      label: "Stali goście",     scope: "worker" },
  { key: "vouchery",    label: "Vouchery",         scope: "worker" },
  { key: "opinie",      label: "Opinie gości",     scope: "worker" },
  { key: "zadania",     label: "Zadania",          scope: "manager" },
]);
// Uwaga: panel kierownika to OSOBNA web-aplikacja (public/hk-phone/panel.html),
// jej licencja jest sterowana po stronie wdrożenia — nie figuruje w tym rejestrze.

const REGISTRY_BY_KEY = Object.freeze(
  Object.fromEntries(MODULE_REGISTRY.map(m => [m.key, m]))
);

// Cache licencji z DB (WYKONANIE 2.2). null = niezaładowane → fallback do buildu
// (tenantConfig.modules). Obiekt { feature_key: bool } = załadowane z tenant_features.
// Fallback jest kluczowy: gdy migracja 0049 nie jest jeszcze wdrożona albo fetch
// padnie, aplikacja działa jak dotąd (nie blokujemy wszystkiego).
let featureCache = null;

// Ładuje licencję modułów tenanta z Supabase (tenant_features). Bezpieczne:
// przy błędzie/braku wierszy zostaje fallback (featureCache = null).
export async function loadTenantFeatures(supabase, tenantId) {
  if (!supabase || !tenantId) return;
  try {
    const { data, error } = await supabase
      .from("tenant_features")
      .select("feature_key,enabled")
      .eq("tenant_id", tenantId);
    if (error || !Array.isArray(data) || data.length === 0) return; // brak konfiguracji → fallback
    const map = {};
    for (const r of data) map[r.feature_key] = r.enabled !== false;
    featureCache = map;
  } catch { /* zostaw fallback */ }
}

// Czy moduł jest dostępny w bieżącej licencji tenanta.
// WYKONANIE 2.3: deny-by-default — nieznany/niezarejestrowany klucz jest WYŁĄCZONY.
// WYKONANIE 2.2: gdy licencja załadowana z DB (featureCache) — to ona decyduje
// (deny-by-default dla licencjonowalnych spoza listy). Rdzeń (core:true) zawsze
// włączony. Bez DB → fallback do tenantConfig.modules (VITE_MODULES z buildu).
export function isModuleEnabled(key) {
  const m = REGISTRY_BY_KEY[key];
  if (!m) return false;
  if (m.core) return true;
  if (featureCache) return featureCache[key] === true;
  return tenantConfig.modules?.[key] !== false;
}

// Lista włączonych kluczy w danym zakresie (np. do budowania nawigacji).
export function enabledModules(scope) {
  return MODULE_REGISTRY
    .filter(m => (!scope || m.scope === scope) && isModuleEnabled(m.key))
    .map(m => m.key);
}
