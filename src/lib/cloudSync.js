// Lekki mirror danych „tylko-localStorage" do Supabase (tabela panel_mirror),
// żeby panel menedżerski mógł je czytać online. Snapshot per `kind` (jsonb).
// Fire-and-forget: nigdy nie blokuje UI ani nie rzuca błędem do aplikacji.
import { supabase } from "./supabase";
import { TENANT_ID } from "./constants";

// Rodzaje zarządzane przez MERGE po stronie bazy (nie snapshotem) — np. grafik idzie
// wyłącznie przez schedule_merge (migracja 0034). Snapshot pełnej kolumny `data` skasowałby
// cudze komórki, jeśli lokalny stan klienta jest pusty. Blokujemy to twardo, żeby żaden
// (także starszy) build nie nadpisał wspólnego grafiku pustką.
const MERGE_MANAGED = new Set(["schedule"]);

export function pushMirror(kind, data) {
  try {
    if (!supabase) return;
    if (MERGE_MANAGED.has(kind)) {
      console.warn(`[cloudSync] pushMirror("${kind}") zablokowany — ten rodzaj jest zarządzany przez merge (schedule_merge).`);
      return;
    }
    supabase
      .from("panel_mirror")
      .upsert(
        { tenant_id: TENANT_ID, kind, data: data ?? {}, updated_at: new Date().toISOString() },
        { onConflict: "tenant_id,kind" }
      )
      .then(() => {}, () => {}); // ignoruj wynik/błędy (offline itp.)
  } catch { /* nigdy nie wywracaj aplikacji przez sync */ }
}
