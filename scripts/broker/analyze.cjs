'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { loadAll } = require('./lib/loader.cjs');
const { buildAnalystPrompt } = require('./lib/prompt.cjs');

async function readFileContent(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }
  return fs.readFileSync(filePath, 'utf8');
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('\n[BLAD] Brak ANTHROPIC_API_KEY\n');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const all = loadAll();

  console.log('\n=== BROKER — Analiza dokumentu ===');
  console.log(`Baza wiedzy: ${all.length} temat${all.length === 1 ? '' : 'ów'} (rama analityczna)\n`);

  if (all.length === 0) {
    console.log('Baza jest pusta. Dodaj wiedzę: npm run broker:add\n');
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(resolve => rl.question(q, resolve));

  let docContent = '';
  const fileArg = process.argv[2];

  if (fileArg) {
    if (!fs.existsSync(fileArg)) {
      console.error(`Plik nie istnieje: ${fileArg}`);
      rl.close();
      process.exit(1);
    }
    try {
      docContent = await readFileContent(fileArg);
      console.log(`Wczytano: ${fileArg} (${docContent.length} znaków)\n`);
    } catch (e) {
      console.error('Błąd odczytu:', e.message);
      rl.close();
      process.exit(1);
    }
  } else {
    console.log('Wklej dokument do analizy (zakończ PUSTĄ LINIĄ):\n');
    const lines = [];
    await new Promise(resolve => {
      rl.on('line', line => {
        if (line === '') { rl.removeAllListeners('line'); resolve(); }
        else lines.push(line);
      });
    });
    docContent = lines.join('\n');
    if (!docContent.trim()) {
      console.log('Anulowano — brak dokumentu.\n');
      rl.close();
      return;
    }
    console.log(`\nWczytano ${docContent.length} znaków.\n`);
  }

  const systemPrompt = buildAnalystPrompt(all);
  console.log('Wpisz pytanie/dyspozycję analityczną lub "exit".\n');

  while (true) {
    const question = (await ask('Analiza: ')).trim();
    if (!question) continue;
    if (question.toLowerCase() === 'exit' || question.toLowerCase() === 'quit') {
      console.log('\nZakończono.\n');
      rl.close();
      break;
    }

    const userMessage = `DOKUMENT DO ANALIZY:\n---\n${docContent}\n---\n\nDYSPOZYCJA ANALITYCZNA: ${question}`;

    process.stdout.write('\nWynik analizy:\n');

    const stream = await client.messages.stream({
      model: 'claude-opus-4-7',
      max_tokens: 2048,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMessage }],
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        process.stdout.write(chunk.delta.text);
      }
    }

    console.log('\n');
  }
}

main().catch(err => { console.error('\nBłąd:', err.message); process.exit(1); });
