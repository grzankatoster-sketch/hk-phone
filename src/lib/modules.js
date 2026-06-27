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
//        "manager" — funkcja panelu kierownika

import { tenantConfig } from "../tenants/config";

export const MODULE_REGISTRY = Object.freeze([
  // Rdzeń — zawsze włączony
  { key: "zmiana",      label: "Przegląd zmiany",  scope: "worker",  core: true },
  { key: "przekazanie", label: "Przekaż zmianę",   scope: "worker",  core: true },
  { key: "informacje",  label: "Informacje",       scope: "worker",  core: true },
  { key: "usterki",     label: "Usterki",          scope: "worker",  core: true },
  { key: "historia",    label: "Historia",         scope: "worker",  core: true },
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

// Czy moduł jest dostępny w bieżącej licencji tenanta.
// Nieznany klucz → nie blokujemy (bezpieczny domyślny stan).
export function isModuleEnabled(key) {
  const m = REGISTRY_BY_KEY[key];
  if (!m) return true;
  if (m.core) return true;
  return tenantConfig.modules?.[key] !== false;
}

// Lista włączonych kluczy w danym zakresie (np. do budowania nawigacji).
export function enabledModules(scope) {
  return MODULE_REGISTRY
    .filter(m => (!scope || m.scope === scope) && isModuleEnabled(m.key))
    .map(m => m.key);
}
