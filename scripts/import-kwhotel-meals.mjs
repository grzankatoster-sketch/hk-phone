// import-kwhotel-meals.mjs — import eksportu KWHotel "Posiłki i usługi w
// rezerwacji" (CSV, UTF-16, tab-separated) do tabeli meal_plans (migracja 0061).
//
// RĘCZNY import na razie (mail automation jeszcze nie podpięta pod ten raport,
// w przeciwieństwie do wyjazdów/planu HK) — eksportuj plik z KWHotel i uruchom:
//   node scripts/import-kwhotel-meals.mjs jedzenie.csv
//
// Grupuje wiersze po ID rezerwacji: śniadanie (rano) + kolacja/HB (wieczorem)
// dla tej samej rezerwacji → jeden rekord per POKÓJ (nie per gość — user:
// "zawsze podaja numer pokoju"), kategoria BB (tylko śniadanie) lub HB
// (śniadanie + kolacja). Rezerwacje grupowe (kilka pokoi w jednym wierszu,
// np. "109, 110,") są rozbijane na osobne rekordy per pokój.

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env") });

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const TENANT_ID = process.env.VITE_TENANT_ID || "00000000-0000-0000-0000-000000000001";

function readDecoded(file) {
  const buf = readFileSync(file);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.toString("utf16le").slice(1);
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.toString("utf8").slice(1);
  return buf.toString("utf8");
}

// Parser TSV z polami w cudzysłowach zawierającymi PRAWDZIWE znaki nowej linii
// (kolumna "Uwagi" bywa wielolinijkowa) — zwykły split("\n") by rozjechał wiersze.
function parseDelimited(text, delim = "\t") {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const cell = (row, i) => (i >= 0 && i < row.length ? String(row[i] || "").replace(/^"|"$/g, "").trim() : "");
const ddmmyyyyToIso = (s) => {
  const m = String(s || "").trim().match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
function isDinnerService(usluga, godzina) {
  if (/HB|kolacj|dinner/i.test(usluga)) return true;
  const h = String(godzina || "").match(/^(\d{2}):/);
  return h ? Number(h[1]) >= 12 : false;
}

function parseFile(inFile) {
  const text = readDecoded(inFile);
  const rows = parseDelimited(text);
  // Wiersz 0 = tytuł raportu ("Posiłki i usługi w rezerwacji"), wiersz 1 = nagłówki kolumn.
  const header = rows[1] || [];
  const idx = (name) => header.findIndex((h) => String(h).replace(/^"|"$/g, "").trim() === name);
  const col = {
    arrival: idx("Data przyjazdu"), departure: idx("Data wyjazdu"), resId: idx("ID rezerwacji"),
    guest: idx("Imie i nazwisko"), room: idx("Pokój"), persons: idx("Osób w rezerwacji"),
    time: idx("Godzina usługi"), service: idx("Usługa"),
  };
  if (col.resId < 0 || col.room < 0) {
    throw new Error("Nie rozpoznano nagłówków kolumn — sprawdź format eksportu (spodziewane: ID rezerwacji, Pokój, Data przyjazdu/wyjazdu, Usługa, Godzina usługi).");
  }

  const byReservation = new Map();
  for (const row of rows.slice(2)) {
    const resId = cell(row, col.resId);
    if (!resId) continue;
    const entry = byReservation.get(resId) || {
      rooms: cell(row, col.room),
      guest: cell(row, col.guest),
      arrival: ddmmyyyyToIso(cell(row, col.arrival)),
      departure: ddmmyyyyToIso(cell(row, col.departure)),
      persons: parseInt(cell(row, col.persons), 10) || 1,
      hasDinner: false,
    };
    if (isDinnerService(cell(row, col.service), cell(row, col.time))) entry.hasDinner = true;
    byReservation.set(resId, entry);
  }

  const records = [];
  for (const [resId, r] of byReservation) {
    if (!r.arrival || !r.departure) continue;
    const rooms = r.rooms.split(",").map((s) => s.trim()).filter(Boolean);
    if (!rooms.length) continue;
    const category = r.hasDinner ? "HB" : "BB";
    for (const room of rooms) {
      records.push({
        tenant_id: TENANT_ID, reservation_id: resId, room, guest_name: r.guest || null,
        arrival: r.arrival, departure: r.departure, category,
        persons: rooms.length > 1 ? 1 : r.persons, source: "csv_import",
      });
    }
  }
  return { records, reservations: byReservation.size };
}

async function upload(records) {
  const res = await fetch(`${SB_URL}/rest/v1/meal_plans?on_conflict=tenant_id,reservation_id,room`, {
    method: "POST",
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(records),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
}

async function main() {
  const inFile = process.argv[2];
  if (!inFile) {
    console.error("Użycie: node scripts/import-kwhotel-meals.mjs eksport.csv");
    process.exit(1);
  }
  if (!SB_URL || !SB_KEY) {
    console.error("Brak VITE_SUPABASE_URL / klucza Supabase w .env (SUPABASE_SERVICE_KEY lub VITE_SUPABASE_ANON_KEY).");
    process.exit(1);
  }
  const { records, reservations } = parseFile(inFile);
  console.log(`Sparsowano ${reservations} rezerwacji → ${records.length} pozycji (pokój×rezerwacja).`);
  if (!records.length) { console.log("Brak danych do wysłania."); return; }
  const bb = records.filter((r) => r.category === "BB").length;
  const hb = records.filter((r) => r.category === "HB").length;
  console.log(`BB: ${bb}, HB: ${hb}.`);
  await upload(records);
  console.log(`Wysłano do meal_plans (upsert po tenant_id+reservation_id+room).`);
}

export { parseFile };

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());
if (isMain) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
