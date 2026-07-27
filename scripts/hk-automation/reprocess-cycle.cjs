// Ponownie przetwarza JUZ POBRANE lokalnie pliki PDF z konkretnego cyklu
// (bez laczenia z poczta) - uzywane do odzyskania cyklu, ktory padl na
// zdeduplikowanym teraz bledzie "ON CONFLICT... cannot affect row a second
// time" (2026-07-27, przed fixem w meals-sync.cjs).
const fs = require("fs");
const path = require("path");
const { loadConfig } = require("./lib/config.cjs");
const { processPdfFiles } = require("./service.cjs");

async function main() {
  const config = loadConfig();
  const dir = path.join(config.outputDir, "mail-pdf");
  const uidPattern = process.argv[2]; // np. "5405|5406|5407|5408|5409|5410|5411|5412"
  if (!uidPattern) throw new Error("Podaj wzorzec UID jako argument, np. '540[5-9]|541[0-2]'");
  const re = new RegExp(uidPattern);
  const files = fs.readdirSync(dir)
    .filter((f) => re.test(f) && f.toLowerCase().endsWith(".pdf"))
    .map((f) => path.join(dir, f));
  console.log(`Plikow do ponownego przetworzenia: ${files.length}`);
  files.forEach((f) => console.log(`  ${f}`));
  await processPdfFiles(files, config);
  console.log("Gotowe.");
}
main().catch((e) => { console.error("BLAD:", e.stack || e.message); process.exitCode = 1; });
