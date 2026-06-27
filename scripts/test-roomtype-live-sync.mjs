// Test NA ŻYWO: zmiana typu pokoju z recepcji → telefon HK (Kasia) od razu?
// Scenariusz: pokój 323 przydzielony Kasi jako "DBL". Recepcja zmienia na "TWIN".
// Pytanie: czy telefon Kasi dostanie zmianę natychmiast (realtime), czy dopiero
// po pollingu (12 s)?
//
// Co dokładnie testujemy — DOKŁADNIE ten sam mechanizm co public/hk-phone/index.html:
//   .on("postgres_changes",{event:"UPDATE",table:"hk_plan",filter:`date=eq.${TODAY}`},
//        ({new:row})=> roomTypes = row.room_types)
// Recepcja zapisuje do hk_plan.room_types (App.jsx → syncPayload → upsert).
//
// Używamy daty TESTOWEJ w przyszłości (2099), żeby NIE ruszać realnego planu na dziś.
// Sekretów nie wypisuje. Sprząta po sobie (DELETE wiersza testowego).
// Run: node scripts/test-roomtype-live-sync.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY;
if (!URL || !KEY) { console.error("Brak VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY w .env"); process.exit(2); }

const sb = createClient(URL, KEY, { realtime: { params: { eventsPerSecond: 10 } } });
const TEST_DATE = "2099-06-26";          // data testowa — nie dotyka realnego dnia
const ROOM = "323", WORKER = "Kasia";
let pass = 0; const fails = [];
const ok = (n, c) => { if (c) { pass++; console.log("  ✓ " + n); } else { fails.push(n); console.log("  ✗ " + n); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function cleanup() { try { await sb.from("hk_plan").delete().eq("date", TEST_DATE); } catch {} }

(async () => {
  console.log(`\n── Scenariusz: ${ROOM} → ${WORKER}, DBL ⇒ TWIN z recepcji ──`);
  await cleanup(); // świeży start

  // 1) Stan początkowy: recepcja rozpisała 323 dla Kasi jako DBL.
  const ins = await sb.from("hk_plan").upsert({
    date: TEST_DATE,
    assignments: { [WORKER]: [ROOM] },
    room_types: { [ROOM]: "DBL" },
    updated_at: new Date().toISOString(),
  }, { onConflict: "date" }).select("date,room_types").single();
  if (ins.error) {
    console.log("  ✗ INSERT planu testowego: " + ins.error.message);
    console.log("    → anon nie ma prawa zapisu do hk_plan? Test przerwany.");
    process.exit(1);
  }
  ok("stan początkowy zapisany: 323 = DBL", ins.data.room_types?.[ROOM] === "DBL");

  // 2) Telefon Kasi: subskrypcja realtime na hk_plan (jak index.html).
  let received = null, receivedAt = 0;
  const subStart = Date.now();
  const ch = sb.channel(`test-hkplan-${TEST_DATE}`)
    .on("postgres_changes",
      { event: "UPDATE", schema: "public", table: "hk_plan", filter: `date=eq.${TEST_DATE}` },
      ({ new: row }) => { received = row; receivedAt = Date.now(); });

  const subscribed = await new Promise(res => {
    ch.subscribe(st => { if (st === "SUBSCRIBED") res(true); if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") res(false); });
    setTimeout(() => res(false), 8000);
  });
  ok("telefon Kasi: kanał realtime hk_plan SUBSCRIBED", subscribed);
  await sleep(400); // chwila na ustabilizowanie kanału

  // 3) Recepcja zmienia typ 323: DBL → TWIN (App.jsx zapisuje całe room_types).
  const changeAt = Date.now();
  const upd = await sb.from("hk_plan")
    .update({ room_types: { [ROOM]: "TWIN" }, updated_at: new Date().toISOString() })
    .eq("date", TEST_DATE).select("room_types").single();
  ok("recepcja zapisała zmianę: 323 = TWIN (hk_plan)", !upd.error && upd.data?.room_types?.[ROOM] === "TWIN");

  // 4) Czy telefon Kasi dostał event realtime — i jak szybko?
  const deadline = Date.now() + 6000;
  while (!received && Date.now() < deadline) await sleep(100);

  if (received) {
    const latency = receivedAt - changeAt;
    ok(`telefon Kasi DOSTAŁ event realtime (po ${latency} ms)`, true);
    ok("event niesie nowy typ: 323 = TWIN", received.room_types?.[ROOM] === "TWIN");
    console.log(`\n  → Kasia zobaczy „TWIN" od razu, ~${latency} ms po zmianie (bez czekania na polling 12 s).`);
  } else {
    fails.push("realtime nie dostarczył eventu w 6 s");
    console.log("  ✗ telefon Kasi NIE dostał eventu realtime w 6 s");
    // Fallback: czy polling (12 s) by to złapał? Sprawdzamy zwykłym SELECT-em.
    const sel = await sb.from("hk_plan").select("room_types").eq("date", TEST_DATE).single();
    ok("fallback polling (SELECT) widzi 323 = TWIN", sel.data?.room_types?.[ROOM] === "TWIN");
    console.log("  → realtime nieaktywny dla hk_plan? Zmiana dotrze przez polling do 12 s.");
  }

  try { await sb.removeChannel(ch); } catch {}
  await cleanup();
  console.log("  ✓ sprzątnięto wiersz testowy");

  console.log(`\n── Wynik: ${pass} OK, ${fails.length} FAIL ──`);
  process.exit(fails.length ? 1 : 0);
})();
