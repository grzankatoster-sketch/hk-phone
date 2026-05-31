import { createClient } from "@supabase/supabase-js";

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = (SB_URL && SB_KEY) ? createClient(SB_URL, SB_KEY) : null;

export const supabaseReady = Boolean(SB_URL && SB_KEY);

export const phoneUrl = (name) =>
  `https://grzankatoster-sketch.github.io/hk-phone/?w=${encodeURIComponent(name)}`;
