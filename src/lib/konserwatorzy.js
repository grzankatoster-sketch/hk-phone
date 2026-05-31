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
