'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const readline = require('readline');
const Anthropic = require('@anthropic-ai/sdk');
const { getRelevant, loadAll } = require('./lib/loader.cjs');
const { buildSystemPrompt } = require('./lib/prompt.cjs');

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('\n[BLAD] Brak ANTHROPIC_API_KEY');
    console.error('Ustaw zmienną środowiskową lub dodaj do pliku .env w katalogu projektu:\n');
    console.error('  ANTHROPIC_API_KEY=sk-ant-...\n');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const all = loadAll();

  console.log('\n=== BROKER — Tryb treningowy ===');
  console.log(`Baza wiedzy: ${all.length} temat${all.length === 1 ? '' : 'ów'}`);
  if (all.length === 0) {
    console.log('\nBaza jest pusta. Dodaj wiedzę: npm run broker:add\n');
    return;
  }
  console.log('Wpisz pytanie lub "exit" aby zakończyć.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(resolve => rl.question(q, resolve));

  while (true) {
    const question = (await ask('Pytanie: ')).trim();

    if (!question) continue;
    if (question.toLowerCase() === 'exit' || question.toLowerCase() === 'quit') {
      console.log('\nDo zobaczenia!\n');
      rl.close();
      break;
    }

    const relevant = getRelevant(question);
    const systemPrompt = buildSystemPrompt(relevant);

    process.stdout.write('\nOdpowiedź: ');

    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: question }]
    });

    for await (const chunk of stream) {
      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta.type === 'text_delta'
      ) {
        process.stdout.write(chunk.delta.text);
      }
    }

    console.log('\n');
    if (relevant.length > 0) {
      console.log(`[Źródła: ${relevant.map(e => e.topic).join(' | ')}]\n`);
    }
  }
}

main().catch(err => { console.error('\nBłąd:', err.message); process.exit(1); });
