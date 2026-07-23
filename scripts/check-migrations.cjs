// Bramka CI: numery migracji Supabase muszą być unikalne (WYKONANIE 1.2).
// Duplikat prefiksu (np. dwa pliki 0013_*) powoduje niedeterministyczną
// kolejność przy `supabase db push` na świeżą bazę — blokujemy to na wejściu.
const fs = require("fs");
const path = require("path");

const DIR = path.resolve(__dirname, "..", "supabase", "migrations");

if (!fs.existsSync(DIR)) {
  console.log("Brak katalogu supabase/migrations — pomijam sprawdzenie.");
  process.exit(0);
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql"));
const byPrefix = new Map();
for (const f of files) {
  const m = /^(\d+)_/.exec(f);
  if (!m) {
    console.error(`Migracja bez numerycznego prefiksu: ${f}`);
    process.exit(1);
  }
  const prefix = m[1];
  if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
  byPrefix.get(prefix).push(f);
}

const dups = [...byPrefix.entries()].filter(([, arr]) => arr.length > 1);
if (dups.length) {
  console.error("Zdublowane numery migracji:");
  for (const [prefix, arr] of dups) console.error(`- ${prefix}: ${arr.join(", ")}`);
  process.exit(1);
}

console.log(`Migracje OK — ${files.length} plików, numery unikalne.`);
