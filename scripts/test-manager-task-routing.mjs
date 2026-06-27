// Test kontraktowy NA ŻYWO dla zadań z panelu (manager_alerts.kind/target_date).
// Round-trip: insert (kind='task', target_date w 2099 → niewidoczne na recepcji dziś)
//   → select → walidacja kolumn/wartości → mark done → DELETE (sprzątanie).
// Read-only fallback gdy brak uprawnień do insert. Sekretów nie wypisuje.
// Run: node scripts/test-manager-task-routing.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Wczytaj VITE_* z .env bez wypisywania wartości.
const env = {};
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY;
const TENANT = env.VITE_TENANT_ID || "00000000-0000-0000-0000-000000000001";
if (!URL || !KEY) { console.error("Brak VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY w .env"); process.exit(2); }

const sb = createClient(URL, KEY);
let pass = 0; const fails = [];
const ok = (n, c) => { (c ? (pass++, console.log("  ✓ " + n)) : fails.push("  ✗ " + n)); if (!c) console.log("  ✗ " + n); };

// Predykaty 1:1 z aplikacją recepcji (App.jsx/InboxPanel/PreShiftModal).
const today = new Date().toISOString().slice(0, 10);
const showAsAlert = (a, shift) =>
  (!a.expires_at || new Date(a.expires_at).getTime() > Date.now()) &&
  (!a.target_shift || a.target_shift === shift) &&
  (!a.target_date || a.target_date === today) &&
  (a.kind !== "task" || a.priority === "high") && !a.done;
const showAsZadanie = (a, shift) =>
  a.kind === "task" && !a.done &&
  (!a.target_shift || a.target_shift === shift) &&
  (!a.target_date || a.target_date === today);

console.log("\n── 1) Logika routingu (czysta) ─────────────────────────");
const taskNormal = { kind: "task", priority: "normal", target_shift: "popoludniowa", target_date: today, done: false };
const taskHigh   = { kind: "task", priority: "high",   target_shift: "popoludniowa", target_date: today, done: false };
const taskFuture = { kind: "task", priority: "normal", target_shift: "popoludniowa", target_date: "2099-01-01", done: false };
const taskDone   = { kind: "task", priority: "high",   target_shift: "popoludniowa", target_date: today, done: true };
const alertPlain = { kind: "alert", priority: "normal", target_shift: null, target_date: null, done: false };
ok("zwykłe zadanie → Zadania, NIE Pilne", showAsZadanie(taskNormal, "popoludniowa") && !showAsAlert(taskNormal, "popoludniowa"));
ok("pilne zadanie → Zadania ORAZ Pilne", showAsZadanie(taskHigh, "popoludniowa") && showAsAlert(taskHigh, "popoludniowa"));
ok("zadanie na inną datę → nie pokazuje się dziś", !showAsZadanie(taskFuture, "popoludniowa") && !showAsAlert(taskFuture, "popoludniowa"));
ok("zadanie done → znika z obu", !showAsZadanie(taskDone, "popoludniowa") && !showAsAlert(taskDone, "popoludniowa"));
ok("zwykły alert → Pilne, NIE Zadania", showAsAlert(alertPlain, "popoludniowa") && !showAsZadanie(alertPlain, "popoludniowa"));
ok("zadanie na inną zmianę → nie dla tej zmiany", !showAsZadanie(taskNormal, "nocna"));

console.log("\n── 2) Round-trip na żywej bazie (kolumny kind/target_date) ──");
const marker = "TEST-ROUTING-" + Date.now();
let insertedId = null;
try {
  const ins = await sb.from("manager_alerts").insert({
    tenant_id: TENANT, title: marker, body: "Dla osób: Test\nautotest", priority: "high",
    created_by: "autotest", target_shift: "popoludniowa", target_date: "2099-01-01", kind: "task",
  }).select("id,kind,target_date,target_shift,priority,done").single();
  if (ins.error) throw ins.error;
  insertedId = ins.data.id;
  ok("INSERT z kind+target_date przeszedł (migracje zastosowane)", true);
  ok("zwrócone kind === 'task'", ins.data.kind === "task");
  ok("zwrócone target_date === '2099-01-01'", String(ins.data.target_date).slice(0, 10) === "2099-01-01");
  ok("zwrócone target_shift === 'popoludniowa'", ins.data.target_shift === "popoludniowa");

  const sel = await sb.from("manager_alerts").select("id,kind,target_date,done").eq("id", insertedId).single();
  ok("SELECT po id zwraca wiersz", !sel.error && sel.data && sel.data.id === insertedId);

  const upd = await sb.from("manager_alerts").update({ done: true, done_at: new Date().toISOString(), done_by: "autotest" }).eq("id", insertedId);
  ok("UPDATE done=true (sync odhaczenia z recepcji)", !upd.error);
} catch (e) {
  fails.push("  ✗ round-trip: " + (e.message || e));
  console.log("  ✗ round-trip: " + (e.message || e));
  if (/column .* does not exist|kind|target_date/i.test(e.message || "")) console.log("    → migracja 0035/0036 prawdopodobnie NIE zastosowana.");
} finally {
  if (insertedId) {
    const del = await sb.from("manager_alerts").delete().eq("id", insertedId);
    console.log(del.error ? "  ! sprzątanie nieudane (usuń ręcznie: " + marker + ")" : "  ✓ sprzątnięto wiersz testowy");
  }
}

console.log(`\n── Wynik: ${pass} OK, ${fails.length} FAIL ──`);
if (fails.length) { fails.forEach(f => console.log(f)); process.exit(1); }
console.log("Wszystko przeszło ✅");
