// Przetwarza JUZ POBRANE lokalnie pliki "Lista przyjazdow/wyjazdow" (leza w
// mail-pdf/ z wczesniejszych cykli, ale zostaly przetworzone PRZED istnieniem
// ekstrakcji gosci/grup) - bez dotykania IMAP. Wyciaga grupy przez LLM i
// zapisuje swiezy snapshot, ktory backfill-group-expand.cjs moze potem dopasowac.
const fs = require("fs");
const path = require("path");
const { loadConfig, getGroqApiKey } = require("./lib/config.cjs");
const { extractPdfText } = require("./lib/pdf.cjs");
const { isArrivalsReport, isDeparturesReport, extractGuestsWithLlm } = require("./lib/parser-guests-llm.cjs");
const { writeGuestSnapshot } = require("./lib/guest-snapshots.cjs");

async function main() {
  const config = loadConfig();
  const groqApiKey = getGroqApiKey(config);
  if (!groqApiKey) throw new Error("Brak klucza Groq API.");

  const dir = path.join(config.outputDir, "mail-pdf");
  const files = fs.readdirSync(dir)
    .filter((f) => /przyjazd|wyjazd/i.test(f) && f.toLowerCase().endsWith(".pdf"))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtime }))
    .filter((x) => Date.now() - x.t.getTime() < 6 * 24 * 3600 * 1000) // ostatnie 6 dni
    .sort((a, b) => a.t - b.t)
    .map((x) => x.f);

  console.log(`Plikow do przetworzenia: ${files.length}`);
  let totalGroups = 0, totalIndividual = 0;

  for (const filename of files) {
    const filePath = path.join(dir, filename);
    const text = await extractPdfText(filePath);
    if (!(isArrivalsReport(text, filename) || isDeparturesReport(text, filename))) {
      console.log(`  ${filename}: nie jest to raport przyjazdow/wyjazdow, pomijam.`);
      continue;
    }
    const reportKind = isArrivalsReport(text, filename) ? "przyjazdy" : "wyjazdy";
    console.log(`  ${filename} -> ${reportKind}, wyciagam przez LLM...`);
    const extracted = await extractGuestsWithLlm(text, {
      apiKey: groqApiKey,
      model: config.llm.model,
      reportKind,
      log: { warn: (m) => console.warn("    " + m) },
    });
    console.log(`    -> ${extracted.individual.length} indywidualnych, ${extracted.groups.length} grup`);
    extracted.groups.forEach((g) => console.log(`       grupa ${g.group_no} ${g.group_name}: ${(g.rooms || []).length} pokoi`));
    totalGroups += extracted.groups.length;
    totalIndividual += extracted.individual.length;
    if (extracted.individual.length || extracted.groups.length) {
      const snap = writeGuestSnapshot(config.outputDir, {
        individual: extracted.individual,
        groups: extracted.groups,
        warnings: extracted.warnings,
        generatedAt: new Date().toISOString(),
      });
      if (snap) console.log(`    -> zapisano snapshot: ${snap}`);
    }
  }
  console.log(`\nRazem: ${totalIndividual} indywidualnych, ${totalGroups} grup (mogą się powtarzać między plikami).`);
}

main().catch((e) => { console.error("BLAD:", e.stack || e.message); process.exitCode = 1; });
