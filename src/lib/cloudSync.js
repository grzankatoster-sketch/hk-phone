// Lekki mirror danych „tylko-localStorage" do Supabase (tabela panel_mirror),
// żeby panel menedżerski mógł je czytać online. Snapshot per `kind` (jsonb).
// Fire-and-forget: nigdy nie blokuje UI ani nie rzuca błędem do aplikacji.
import { supabase } from "./supabase";
import { TENANT_ID } from "./constants";

export function pushMirror(kind, data) {
  try {
    if (!supabase) return;
    supabase
      .from("panel_mirror")
      .upsert(
        { tenant_id: TENANT_ID, kind, data: data ?? {}, updated_at: new Date().toISOString() },
        { onConflict: "tenant_id,kind" }
      )
      .then(() => {}, () => {}); // ignoruj wynik/błędy (offline itp.)
  } catch { /* nigdy nie wywracaj aplikacji przez sync */ }
}
