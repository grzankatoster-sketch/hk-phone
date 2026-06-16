'use strict';
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { KNOWLEDGE_DIR } = require('./lib/loader.cjs');

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(resolve => rl.question(q, resolve));

  console.log('\n=== BROKER — Dodaj wiedzę do bazy ===\n');

  const topic = (await ask('Temat (np. "Akcje zwykłe"): ')).trim();
  if (!topic) {
    console.log('Anulowano — temat nie może być pusty.');
    rl.close();
    return;
  }

  const tagsRaw = (await ask('Tagi/synonimy (opcjonalne, oddziel przecinkami — np. YTM, rentowność, yield): ')).trim();
  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  console.log('Wpisz treść (zakończ PUSTĄ LINIĄ i Enter):\n');

  const lines = [];
  await new Promise(resolve => {
    rl.on('line', line => {
      if (line === '') {
        rl.removeAllListeners('line');
        resolve();
      } else {
        lines.push(line);
      }
    });
  });

  rl.close();

  if (lines.length === 0) {
    console.log('Anulowano — treść nie może być pusta.');
    return;
  }

  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
  }

  const slug = slugify(topic);
  const filename = `${slug}.md`;
  const filepath = path.join(KNOWLEDGE_DIR, filename);
  const today = new Date().toISOString().slice(0, 10);
  const content = lines.join('\n');

  if (fs.existsSync(filepath)) {
    fs.appendFileSync(filepath, '\n\n' + content, 'utf8');
    console.log(`\n✓ Zaktualizowano: knowledge/${filename}`);
  } else {
    const tagsLine = tags.length > 0 ? `\ntags: ${tags.join(', ')}` : '';
    const frontmatter = `---\ntopic: ${topic}\nadded: ${today}${tagsLine}\n---\n`;
    fs.writeFileSync(filepath, frontmatter + content, 'utf8');
    console.log(`\n✓ Zapisano nowy temat: knowledge/${filename}`);
    if (tags.length > 0) console.log(`   Tagi: ${tags.join(', ')}`);
  }

  const all = fs.readdirSync(KNOWLEDGE_DIR).filter(f => f.endsWith('.md'));
  console.log(`   Baza wiedzy zawiera teraz: ${all.length} temat${all.length === 1 ? '' : 'ów'}\n`);
}

main().catch(err => { console.error('Błąd:', err.message); process.exit(1); });
