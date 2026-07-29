// Jednorazowy backfill (WYKONANIE 0.3): wgrywa dane z lokalnych plikow *.local.json
// (nie w repo, patrz .gitignore) do tabel parking_records / stali_goscie.
// Uruchomic PO wgraniu migracji 0068 (supabase db push), przed usunieciem
// zaszytych seedow z ParkingPanel.jsx / StaliGosciePanel.jsx z produkcyjnego builda.
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_ANON_KEY || "";
const tenantId = process.env.VITE_TENANT_ID || "";

async function upsert(table, rows) {
  if (!rows.length) return;
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
  }
  console.log(`${table}: zapisano ${rows.length} wierszy.`);
}

async function main() {
  if (!url || !key || !tenantId) {
    console.error("BLAD: brak VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_TENANT_ID w env (.env).");
    process.exitCode = 1;
    return;
  }

  const parkingPath = path.resolve(__dirname, "parking-seed.local.json");
  const staliPath = path.resolve(__dirname, "stali-goscie-seed.local.json");
  if (!fs.existsSync(parkingPath) || !fs.existsSync(staliPath)) {
    console.error("BLAD: brak plikow *.local.json obok tego skryptu (nie sa w repo, patrz .gitignore).");
    process.exitCode = 1;
    return;
  }

  const parking = JSON.parse(fs.readFileSync(parkingPath, "utf8")).map((r) => ({
    id: r.id, tenant_id: tenantId, plate: r.plate, name: r.name, phone: r.phone,
    type: r.type, status: r.status, paid_to: r.paidTo || null, paid_on: r.paidOn || null,
    doc_nr: r.docNr || null, note: r.note || null, price: r.price || null, active: r.active !== false,
  }));
  const staliGoscie = JSON.parse(fs.readFileSync(staliPath, "utf8")).map((g) => ({
    id: g.id, tenant_id: tenantId, name: g.name, room: g.room || null, company: g.company || null,
    notes: g.notes || null, price_season: g.priceSeason || null, price_off_season: g.priceOffSeason || null,
    meal: g.meal || null, category: g.category || "private", has_fv: !!g.hasFV,
  }));

  await upsert("parking_records", parking);
  await upsert("stali_goscie", staliGoscie);
  console.log("Gotowe. Po weryfikacji w Supabase Studio mozna usunac *.local.json.");
}

main().catch((e) => { console.error("BLAD:", e.stack || e.message); process.exitCode = 1; });
