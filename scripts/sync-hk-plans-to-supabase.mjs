// Jednorazowy sync planów HK z dysku (C:\zmiany i raporty\hk-automation\plans)
// do Supabase hk_plan dla nadchodzących N dni.
// Użycie: node scripts/sync-hk-plans-to-supabase.mjs [dni=7]

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env") });

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_KEY;
if (!SB_URL || !SB_KEY) {
  console.error("Brak VITE_SUPABASE_URL / klucza Supabase w .env (SUPABASE_SERVICE_KEY lub VITE_SUPABASE_KEY).");
  process.exit(1);
}
const PLANS_DIR = process.env.HK_AUTOMATION_DIR
  ? join(process.env.HK_AUTOMATION_DIR, "plans")
  : "C:\\zmiany i raporty\\hk-automation\\plans";

const DAYS = Number(process.argv[2]) || 7;

const HK_ROOMS = [
  "101","102","103","104","105","106","107","108","109","110","111","112",
  "201","202","203","204","205","206","207","208","209","210","211","212","213","214","215","216","217","218",
  "301","302","303","304","305","306","307","308","309","310","311","312","313","314","315","316","317","318",
];

const pad = (n) => (n < 10 ? "0" + n : "" + n);
const isoDate = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());

function loadPlan(date) {
  const filePath = join(PLANS_DIR, `hk-plan-${date}.json`);
  if (!existsSync(filePath)) return null;
  try {
    const plan = JSON.parse(readFileSync(filePath, "utf8"));
    if (plan?.data && typeof plan.data === "object") return plan.data;
  } catch {}
  return null;
}

function buildPayload(date, data) {
  if (!data || !date || Object.keys(data).length === 0) return null;
  const rt = {};
  HK_ROOMS.forEach((no) => { rt[no] = "STD"; });
  const asgn = {}; const pmAsgn = {}; const pmRt = {};
  Object.entries(data).forEach(([no, rd]) => {
    if (rd.status === "W" || rd.status === "WP" || rd.status === "PG" || rd.status === "PGZ" || rd.br || rd.zs) {
      pmRt[no] = rd.status === "W" ? "W"
              : rd.status === "WP" ? "WP"
              : rd.status === "PG" ? "PG"
              : rd.status === "PGZ" ? "PGZ"
              : rd.br ? "BR" : "ZS";
    }
    if (!rd.person) return;
    if (rd.status === "W" || rd.status === "WP") {
      if (!asgn[rd.person]) asgn[rd.person] = [];
      asgn[rd.person].push(no);
    } else if (rd.status === "PG" || rd.status === "PGZ" || rd.br || rd.zs) {
      if (!pmAsgn[rd.person]) pmAsgn[rd.person] = [];
      pmAsgn[rd.person].push(no);
    }
  });
  if (!Object.keys(asgn).length && !Object.keys(pmAsgn).length && !Object.keys(pmRt).length) return null;
  return {
    date,
    assignments: asgn,
    pm_assignments: pmAsgn,
    room_types: rt,
    pm_room_types: pmRt,
    updated_at: new Date().toISOString(),
  };
}

async function upsert(payload) {
  const res = await fetch(`${SB_URL}/rest/v1/hk_plan?on_conflict=date`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
}

async function main() {
  const start = new Date(); start.setHours(12, 0, 0, 0);
  let ok = 0, skip = 0, fail = 0;
  for (let i = 0; i < DAYS; i++) {
    const date = isoDate(new Date(start.getTime() + i * 86400000));
    const data = loadPlan(date);
    if (!data) { console.log(`${date}: brak planu na dysku — pomijam`); skip++; continue; }
    const payload = buildPayload(date, data);
    if (!payload) { console.log(`${date}: plan pusty — pomijam`); skip++; continue; }
    const wCount = Object.values(payload.pm_room_types).filter((v) => v === "W").length;
    const wpCount = Object.values(payload.pm_room_types).filter((v) => v === "WP").length;
    const pgCount = Object.values(payload.pm_room_types).filter((v) => v === "PG").length;
    const pgzCount = Object.values(payload.pm_room_types).filter((v) => v === "PGZ").length;
    try {
      await upsert(payload);
      console.log(`${date}: OK — W:${wCount} WP:${wpCount} PG:${pgCount} PGZ:${pgzCount}`);
      ok++;
    } catch (e) {
      console.error(`${date}: FAIL —`, e.message);
      fail++;
    }
  }
  console.log(`\nGotowe: ${ok} OK, ${skip} pominięto, ${fail} błąd`);
}

main().catch((e) => { console.error(e); process.exit(1); });
