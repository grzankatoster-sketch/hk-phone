'use strict';
const { loadAll } = require('./lib/loader.cjs');

const all = loadAll();

if (all.length === 0) {
  console.log('\nBaza wiedzy jest pusta. Dodaj wiedzę: npm run broker:add\n');
  process.exit(0);
}

const total = all.reduce((sum, e) => sum + e.content.split(/\s+/).length, 0);
console.log(`\n=== BROKER — Baza wiedzy (${all.length} temat${all.length === 1 ? '' : 'ów'}, ~${total} słów) ===\n`);

all
  .sort((a, b) => a.topic.localeCompare(b.topic, 'pl'))
  .forEach((entry, i) => {
    const words = entry.content.split(/\s+/).length;
    const addedStr = entry.added ? `  [${entry.added}]` : '';
    console.log(`  ${String(i + 1).padStart(3)}. ${entry.topic}${addedStr}  ~${words} słów`);
  });

console.log('');
