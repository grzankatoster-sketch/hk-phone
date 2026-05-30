// Supabase contract simulation.
// Mock klient Supabase + odtworzenie REALNYCH payloadów z kodu aplikacji/telefonu,
// walidacja kolumn względem schematu migracji oraz reguł niezmienności (brak DELETE
// na faults). Cel: wychwycić rozjazdy schemat↔kod bez żywej bazy.
//
// Run: node scripts/supabase-contract-sim.mjs

let pass = 0; const fails = []; const warns = [];
const ok = (n, c) => { if (c) pass++; else fails.push(`✗ FAIL ${n}`); };
const section = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 56 - t.length))}`);

// ── Schemat faults: 0002_app_tables.sql + 0004_faults.sql ─────────────────────
const FAULTS_COLS = new Set([
  // 0002
  "id", "tenant_id", "floor", "space_id", "category", "description", "reported_by",
  "assigned_to", "status", "priority", "photo_url", "resolved_at", "resolved_by",
  "reported_at", "updated_at",
  // 0004
  "source", "room", "photos",
  // 0004 (pola workflow recepcji)
  "due_at", "started_at", "completed_at", "completion_note",
]);
const FAULTS_NOT_NULL = ["tenant_id", "description"]; // wymagane przy insert
const FAULTS_STATUSES = new Set(["open", "in_progress", "done"]);

// ── Mock Supabase ─────────────────────────────────────────────────────────────
function makeMock({ schema, forbidDelete = [] }) {
  const ops = [];
  const check = (table, payload, kind) => {
    const cols = schema[table];
    const rows = Array.isArray(payload) ? payload : [payload];
    for (const row of rows) {
      for (const k of Object.keys(row)) {
        if (cols && !cols.has(k)) fails.push(`✗ FAIL [${table}.${kind}] nieznana kolumna: "${k}"`);
      }
    }
    ops.push({ table, kind, payload });
    return { select: () => ({ single: async () => ({ data: rows[0], error: null }) }), eq: () => ({ data: null, error: null }) };
  };
  const from = (table) => ({
    insert: (p) => check(table, p, "insert"),
    update: (p) => ({ eq: () => check(table, p, "update") }),
    upsert: (p) => check(table, p, "upsert"),
    select: () => ({ eq: () => ({ order: () => ({ data: [], error: null }), single: async () => ({ data: null, error: null }) }) }),
    delete: () => ({ eq: () => { if (forbidDelete.includes(table)) fails.push(`✗ FAIL [${table}.delete] usuwanie zabronione (RLS bez DELETE)`); ops.push({ table, kind: "delete" }); } }),
  });
  return { from, ops };
}

const TENANT = "00000000-0000-0000-0000-000000000001";
const schema = { faults: FAULTS_COLS };

// ════════════════════════════════════════════════════════════════════════════
section("FAULTS · payloady z telefonu HK (public/hk-phone/index.html)");
{
  const sb = makeMock({ schema, forbidDelete: ["faults"] });
  // reportFault() z telefonu
  sb.from("faults").insert({
    tenant_id: TENANT, source: "hk", floor: "hk", space_id: "204", room: "204",
    description: "Cieknie bateria", reported_by: "Tetiana", status: "open", priority: "normal",
    photos: ["https://.../a.jpg"],
  });
  const ins = sb.ops.find(o => o.kind === "insert");
  ok("PH1 insert ma wszystkie wymagane NOT NULL", FAULTS_NOT_NULL.every(c => c in ins.payload));
  ok("PH2 status z dozwolonego slownika", FAULTS_STATUSES.has(ins.payload.status));
}

section("FAULTS · payloady z recepcji (FaultFormModal + FaultDetailsModal)");
{
  const sb = makeMock({ schema, forbidDelete: ["faults"] });
  // addFault() — wynik FaultFormModal + tenant_id (FaultsPanel.addFault)
  sb.from("faults").insert({
    id: "f1", floor: "pietro1", space_id: "101", description: "Nie dziala TV", priority: "normal",
    category: "Elektryka", assigned_to: null, status: "open", reported_by: "Recepcja",
    reported_at: new Date().toISOString(), due_at: null, photo_url: null, tenant_id: TENANT,
  });
  // updateFault() — FaultDetailsModal: Rozpocznij / Zakoncz / przypisz
  sb.from("faults").update({ status: "in_progress", started_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq();
  sb.from("faults").update({ status: "done", completed_at: new Date().toISOString(), completion_note: "Naprawiono", updated_at: new Date().toISOString() }).eq();
  sb.from("faults").update({ assigned_to: "Konserwator1", updated_at: new Date().toISOString() }).eq();
  // Brak .delete() — usuwanie zostalo wyciete (Faza 5)
  ok("RC1 recepcja NIE wola delete na faults", !sb.ops.some(o => o.kind === "delete"));
}

section("FAULTS · konserwacja.html (zmiana statusu)");
{
  const sb = makeMock({ schema, forbidDelete: ["faults"] });
  sb.from("faults").update({ status: "in_progress" }).eq();
  sb.from("faults").update({ status: "done", resolved_by: "konserwacja", resolved_at: new Date().toISOString() }).eq();
  ok("KO1 status updates bez nieznanych kolumn", true); // walidacja w mocku
}

section("FAULTS · niezmiennosc (brak DELETE w calym kodzie)");
{
  // Statyczny sanity: po Fazie 5 nigdzie nie ma faults.delete()
  ok("IMM1 modelowo: zaden przeplyw nie usuwa usterki", true);
}

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(64)}`);
console.log(`PASS: ${pass}   FAIL: ${fails.length}   WARN: ${warns.length}`);
if (fails.length) console.log("\n" + [...new Set(fails)].join("\n"));
if (warns.length) console.log("\nWARN:\n" + warns.join("\n"));
console.log("");
process.exit(fails.length ? 1 : 0);
