// Lekki mirror danych „tylko-localStorage" do Supabase (tabela panel_mirror),
// żeby panel menedżerski mógł je czytać online. Snapshot per `kind` (jsonb).
// Fire-and-forget: nigdy nie blokuje UI ani nie rzuca błędem do aplikacji.
import { supabase } from "./supabase";
import { TENANT_ID } from "./constants";
import { enqueue } from "./syncQueue";

// Rodzaje zarządzane przez MERGE po stronie bazy (nie snapshotem) — np. grafik idzie
// wyłącznie przez schedule_merge (migracja 0034). Snapshot pełnej kolumny `data` skasowałby
// cudze komórki, jeśli lokalny stan klienta jest pusty. Blokujemy to twardo, żeby żaden
// (także starszy) build nie nadpisał wspólnego grafiku pustką.
const MERGE_MANAGED = new Set(["schedule"]);

// Nieudany push (offline / Supabase down) trafia do bufora offline (syncQueue),
// który po powrocie online odtworzy upsert. Dedupe per kind — snapshot, więc liczy
// się tylko ostatni stan. Patrz WYKONANIE 1.5.
function bufferMirror(kind, row) {
  try {
    enqueue(
      { table: "panel_mirror", method: "upsert", data: row, options: { onConflict: "tenant_id,kind" } },
      `panel_mirror:${kind}`
    );
  } catch { /* bufor nigdy nie wywraca aplikacji */ }
}

export function pushMirror(kind, data) {
  try {
    if (!supabase) return;
    if (MERGE_MANAGED.has(kind)) {
      console.warn(`[cloudSync] pushMirror("${kind}") zablokowany — ten rodzaj jest zarządzany przez merge (schedule_merge).`);
      return;
    }
    const row = { tenant_id: TENANT_ID, kind, data: data ?? {}, updated_at: new Date().toISOString() };
    supabase
      .from("panel_mirror")
      .upsert(row, { onConflict: "tenant_id,kind" })
      .then(
        ({ error } = {}) => { if (error) bufferMirror(kind, row); },
        () => bufferMirror(kind, row) // offline / Supabase niedostępne → do bufora
      );
  } catch { /* nigdy nie wywracaj aplikacji przez sync */ }
}
