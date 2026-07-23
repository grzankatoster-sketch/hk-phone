#!/usr/bin/env node
/**
 * parse-kwhotel-rates.cjs — kalibracja silnika cen z eksportu KWHotel (WYKONANIE 4.20).
 *
 * Wejście: "Revenue Report" z KWHotel (UTF-16, tab-separated, przecinek dziesiętny).
 *   Wiersze pokoi: Symbol | Opis | Grupa | cena/dzień… | Suma | Zajęcie | RevPar | ADR
 *   Wiersze zbiorcze (dół): "Zajęcie" i "ADR" per dzień → sygnał obłożenie↔cena.
 * Wyjście: kwhotel-calibration.json — bazowe ceny per typ pokoju (mediana dni sprzedanych)
 *   + seria dobowa { data: {occupancy, adr} } do kalibracji same-day i warstwy AI.
 *
 * Użycie:  node scripts/parse-kwhotel-rates.cjs ceny.csv [wyjscie.json]
 */
const fs = require("fs");
const path = require("path");

const KNOWN_TYPES = ["Apartament", "Superior", "Standard", "Economy", "Triple"];

function readDecoded(file) {
  const buf = fs.readFileSync(file);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.toString("utf16le").slice(1);
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.toString("utf8").slice(1);
  return buf.toString("utf8");
}
const cell = (s) => String(s == null ? "" : s).replace(/^"|"$/g, "").trim();
function num(s) {
  const t = cell(s).replace(/\s+/g, "").replace(",", ".");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}
const ddmmyyyy = (s) => { const m = cell(s).match(/^(\d{2})\.(\d{2})\.(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
function median(arr) {
  const a = arr.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}

function main() {
  const inFile = process.argv[2];
  if (!inFile) { console.error("Użycie: node scripts/parse-kwhotel-rates.cjs ceny.csv [out.json]"); process.exit(1); }
  const outFile = process.argv[3] || path.join(process.cwd(), "kwhotel-calibration.json");
  const rows = readDecoded(inFile).split(/\r?\n/).map((line) => line.split("\t"));

  let dateCols = null;                 // [{ key, idx }] — aktualizowany na każdym wierszu-nagłówku
  const pricesByType = {};             // typ -> [ceny > 0]
  const byDate = {};                   // dateKey -> { occupancy, adr }

  for (const row of rows) {
    const dc = [];
    row.forEach((c, idx) => { const k = ddmmyyyy(c); if (k) dc.push({ key: k, idx }); });
    if (dc.length > 5) { dateCols = dc; continue; }         // to wiersz nagłówka z datami
    if (!dateCols) continue;

    const type = cell(row[2]);
    if (KNOWN_TYPES.includes(type)) {                        // wiersz pokoju
      (pricesByType[type] ||= []);
      for (const { idx } of dateCols) { const p = num(row[idx]); if (p != null && p > 0) pricesByType[type].push(p); }
      continue;
    }
    const label = cell(row[0]).toLowerCase();                // wiersze zbiorcze (dół)
    if (label.startsWith("zaj")) for (const { key, idx } of dateCols) { const v = num(row[idx]); if (v != null) (byDate[key] ||= {}).occupancy = Math.round(v) / 100; }
    if (label === "adr")        for (const { key, idx } of dateCols) { const v = num(row[idx]); if (v != null) (byDate[key] ||= {}).adr = Math.round(v); }
  }

  const roomTypes = {};
  for (const [type, arr] of Object.entries(pricesByType)) {
    roomTypes[type] = { base: median(arr), samples: arr.length, min: Math.min(...arr), max: Math.max(...arr) };
  }

  const out = { generatedAt: new Date().toISOString(), source: path.basename(inFile), roomTypes, byDate };
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), "utf8");

  console.log("Kalibracja KWHotel — bazowe ceny per typ pokoju (mediana dni sprzedanych):");
  for (const [t, r] of Object.entries(roomTypes)) console.log(`  ${t.padEnd(12)} baza ${String(r.base).padStart(4)} zł  (${r.samples} prób, ${r.min}–${r.max})`);
  const dates = Object.keys(byDate).length;
  console.log(`Seria dobowa: ${dates} dni (obłożenie + ADR).  →  ${outFile}`);
}
main();
