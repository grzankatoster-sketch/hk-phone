import { createClient } from "@supabase/supabase-js";

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = (SB_URL && SB_KEY) ? createClient(SB_URL, SB_KEY) : null;

export const supabaseReady = Boolean(SB_URL && SB_KEY);

// Baza URL wdrożonych stron telefonów (GitHub Pages dziś, docelowo app.guestsage.pl — 3.2).
// JEDYNE miejsce z domyślnym adresem; inny tenant/domena → VITE_PHONE_BASE_URL (WYKONANIE 2.8).
export const PHONE_BASE_URL =
  import.meta.env.VITE_PHONE_BASE_URL || "https://grzankatoster-sketch.github.io/hk-phone";

export const phoneUrl = (name) =>
  `${PHONE_BASE_URL}/?w=${encodeURIComponent(name)}`;
