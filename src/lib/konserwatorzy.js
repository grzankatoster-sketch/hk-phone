// Dynamiczna lista konserwatorów (edytowalna przez kierownika) z fallbackiem na
// stałą KONSERWATOR_WORKERS z konfiguracji tenanta.
import { loadJson, saveJson } from "./storage";
import { KONSERWATOR_WORKERS } from "./constants";

const KEY = "reception-konserwatorzy";

export const getKonserwatorzy = () => {
  const custom = loadJson(KEY, null);
  return Array.isArray(custom) && custom.length ? custom : [...KONSERWATOR_WORKERS];
};

export const setKonserwatorzy = (list) =>
  saveJson(KEY, [...new Set(list.map((s) => String(s).trim()).filter(Boolean))]);

// Stały podział specjalności (nie edytowalny w UI):
//   Elektryka  → Kamil
//   Hydraulika → Grzegorz
//   pozostałe kategorie → obaj (brak konkretnego przypisania)
// Używane przez AI-triaging, by przypisać awarię do właściwej osoby. Obaj konserwatorzy
// widzą wszystkie usterki — przypisanie wskazuje tylko, kto jest odpowiedzialny.
export const KONSERWATOR_SPECS = Object.freeze({
  Kamil: "Elektryka",
  Grzegorz: "Hydraulika",
});

export const getKonserwatorSpecs = () => ({ ...KONSERWATOR_SPECS });

// Mapa kategoria → konserwator (odwrotność), dla AI-triagingu.
// Kategorie spoza mapy zostają bez przypisania (obaj).
export const getCategoryToKonserwator = () => {
  const out = {};
  for (const [name, cat] of Object.entries(KONSERWATOR_SPECS)) {
    if (cat && !out[cat]) out[cat] = name;
  }
  return out; // { Elektryka: "Kamil", Hydraulika: "Grzegorz" }
};
