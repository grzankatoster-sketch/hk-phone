// Rejestr ustawień per hotel (WYKONANIE 2.19). Płaska lista — jeden wiersz opisuje
// jedno ustawienie: klucz, typ, etykieta, grupa (nagłówek w formularzu) i domyślna
// wartość. Generyczny formularz w UstawieniaPanel renderuje TĘ listę, a lib/settings.js
// czyta/zapisuje wartości (localStorage + tenant_settings w Supabase).
//
// Dodanie nowego prostego przełącznika = DOPISANIE WIERSZA TUTAJ. Bez nowego JSX.
// Domyślne wartości pochodzą z dotychczasowych hardkodów (jedno źródło, bez driftu).
import { DEFAULT_STALA_KASOWA, DEFAULT_ADHOC_THRESHOLDS } from "./constants";
import { EMPTY_LABEL } from "./format";

// type: "number" | "string" | "boolean"
export const SETTINGS_REGISTRY = Object.freeze([
  { key: "stalaKasowa",  type: "number",  group: "Kasa",          label: "Startowa stała kasowa (zł)",              default: DEFAULT_STALA_KASOWA },
  { key: "adhocWeekday", type: "number",  group: "Housekeeping",  label: "Próg zadań ad-hoc — dni robocze",         default: DEFAULT_ADHOC_THRESHOLDS.weekday },
  { key: "adhocWeekend", type: "number",  group: "Housekeeping",  label: "Próg zadań ad-hoc — weekend",             default: DEFAULT_ADHOC_THRESHOLDS.weekend },
  { key: "emptyLabel",   type: "string",  group: "Wygląd",        label: "Symbol pustej wartości (np. —)",          default: EMPTY_LABEL },
]);

export const SETTINGS_BY_KEY = Object.freeze(
  Object.fromEntries(SETTINGS_REGISTRY.map((s) => [s.key, s]))
);

// Kolejność grup w formularzu (te nieznane trafią na koniec).
export const SETTINGS_GROUP_ORDER = Object.freeze(["Kasa", "Housekeeping", "Wygląd"]);
