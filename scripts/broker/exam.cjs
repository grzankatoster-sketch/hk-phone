'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { getRelevant, loadAll } = require('./lib/loader.cjs');
const { buildSystemPrompt } = require('./lib/prompt.cjs');

const LOGS_DIR = path.join(__dirname, 'logs');

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('\n[BLAD] Brak ANTHROPIC_API_KEY');
    console.error('Ustaw zmienną środowiskową lub dodaj do pliku .env w katalogu projektu:\n');
    console.error('  ANTHROPIC_API_KEY=sk-ant-...\n');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const all = loadAll();

  const timestamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  const logFile = path.join(LOGS_DIR, `exam-${timestamp}.json`);

  const session = {
    started: new Date().toISOString(),
    topicsCount: all.length,
    qa: []
  };

  console.log('\n=== BROKER — Tryb egzaminacyjny ===');
  console.log(`Baza wiedzy: ${all.length} temat${all.length === 1 ? '' : 'ów'}`);
  console.log('TRYB EGZAMINACYJNY — odpowiedzi TYLKO z bazy wiedzy. Brak źródeł.');
  if (all.length === 0) {
    console.log('\nBaza jest pusta. Dodaj wiedzę: npm run broker:add\n');
    return;
  }
  console.log('Wpisz pytanie lub "exit" aby zakończyć i zobaczyć wyniki.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(resolve => rl.question(q, resolve));

  let answered = 0;
  let refused = 0;

  while (true) {
    const question = (await ask('Pytanie: ')).trim();

    if (!question) continue;
    if (question.toLowerCase() === 'exit' || question.toLowerCase() === 'quit') {
      rl.close();
      break;
    }

    const relevant = all; // egzamin: cała baza, nie tylko TOP-5
    const systemPrompt = buildSystemPrompt(relevant);

    process.stdout.write('\nOdpowiedź: ');

    let fullAnswer = '';

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
        fullAnswer += chunk.delta.text;
      }
    }

    console.log('\n');

    const isRefused = /^\s*nie\s*wiem\s*\.?\s*$/i.test(fullAnswer.trim());
    if (isRefused) refused++;
    else answered++;

    session.qa.push({ question, answer: fullAnswer.trim(), refused: isRefused });
  }

  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }

  const total = answered + refused;
  session.ended = new Date().toISOString();
  session.summary = { total, answered, refused };
  fs.writeFileSync(logFile, JSON.stringify(session, null, 2), 'utf8');

  console.log('=== WYNIKI SESJI ===');
  console.log(`Pytań ogółem:         ${total}`);
  console.log(`Odpowiedzi z bazy:    ${answered}  (${total ? Math.round(answered / total * 100) : 0}%)`);
  console.log(`"Nie wiem":           ${refused}  (${total ? Math.round(refused / total * 100) : 0}%)`);
  console.log(`Log zapisano:         ${logFile}\n`);
}

main().catch(err => { console.error('\nBłąd:', err.message); process.exit(1); });
