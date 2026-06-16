'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { loadAll } = require('./lib/loader.cjs');
const { buildWatchPrompt } = require('./lib/prompt.cjs');
const { fetchAllNews, DEFAULT_FEEDS } = require('./lib/news.cjs');
const { getQuotes, formatQuotes } = require('./lib/market.cjs');

const WATCHLIST_FILE = path.join(__dirname, 'watchlist.json');
const LOGS_DIR = path.join(__dirname, 'logs');
const INTERVAL_MS = 30 * 60 * 1000;
const ONCE = process.argv.includes('--once');

const DEFAULT_WATCHLIST = {
  symbols: ['PKN.WA', 'CDR.WA', 'KGHM.WA', 'OIL', 'GC=F', 'EURUSD=X', 'BTC-USD'],
  feeds: DEFAULT_FEEDS,
};

function loadWatchlist() {
  if (!fs.existsSync(WATCHLIST_FILE)) {
    fs.writeFileSync(WATCHLIST_FILE, JSON.stringify(DEFAULT_WATCHLIST, null, 2), 'utf8');
    console.log(`Stworzono domyślną listę obserwacyjną: watchlist.json\n`);
  }
  try {
    return JSON.parse(fs.readFileSync(WATCHLIST_FILE, 'utf8'));
  } catch {
    console.warn('Błąd odczytu watchlist.json, używam domyślnej listy.');
    return DEFAULT_WATCHLIST;
  }
}

async function runTick(client, knowledgeBase, watchlist) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Pobieram dane rynkowe i wiadomości...`);

  const [news, quotes] = await Promise.all([
    fetchAllNews(watchlist.feeds),
    getQuotes(watchlist.symbols),
  ]);

  console.log(`  Wiadomości: ${news.length} | Ceny: ${quotes.length} instrumentów\n`);

  const pricesText = quotes.length > 0 ? formatQuotes(quotes) : '(brak danych cenowych)';
  const newsText = news.slice(0, 25).map((n, i) =>
    `${i + 1}. [${n.source}] ${n.title}${n.description ? '\n   ' + n.description : ''}`
  ).join('\n');

  const systemPrompt = buildWatchPrompt(knowledgeBase);
  const userMessage =
    `AKTUALNE CENY (${new Date().toLocaleString('pl-PL')}):\n${pricesText}\n\n` +
    `OSTATNIE WIADOMOŚCI:\n${newsText}\n\n` +
    `DYSPOZYCJA: Przeanalizuj powyższe dane. Które wiadomości mogą wpłynąć na ceny instrumentów ` +
    `z listy obserwacyjnej lub powiązanych aktywów? Użyj bazy wiedzy do opisu mechanizmów ` +
    `przyczynowo-skutkowych. Oceń krótko- i długoterminowy wpływ.`;

  console.log('--- ANALIZA ---');

  const stream = await client.messages.stream({
    model: 'claude-opus-4-7',
    max_tokens: 1500,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMessage }],
  });

  let fullText = '';
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      process.stdout.write(chunk.delta.text);
      fullText += chunk.delta.text;
    }
  }
  console.log('\n--- KONIEC ANALIZY ---\n');

  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
  const slug = timestamp.slice(0, 16).replace('T', '_').replace(':', '-');
  const logFile = path.join(LOGS_DIR, `watch-${slug}.json`);
  fs.writeFileSync(logFile, JSON.stringify({ timestamp, quotes, news: news.slice(0, 25), analysis: fullText }, null, 2), 'utf8');
  console.log(`Log: ${logFile}\n`);
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('\n[BLAD] Brak ANTHROPIC_API_KEY\n');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const knowledgeBase = loadAll();
  const watchlist = loadWatchlist();

  console.log('\n=== BROKER — Monitor rynkowy ===');
  console.log(`Baza wiedzy: ${knowledgeBase.length} temat${knowledgeBase.length === 1 ? '' : 'ów'}`);
  console.log(`Symbole: ${watchlist.symbols.join(', ')}`);
  console.log(`Źródła RSS: ${watchlist.feeds.length}`);
  if (ONCE) {
    console.log('Tryb: jednorazowy (--once)\n');
  } else {
    console.log(`Interwał: co ${INTERVAL_MS / 60000} minut | Ctrl+C aby zatrzymać\n`);
  }

  if (knowledgeBase.length === 0) {
    console.log('Baza jest pusta. Dodaj wiedzę: npm run broker:add\n');
    return;
  }

  await runTick(client, knowledgeBase, watchlist);

  if (ONCE) return;

  const interval = setInterval(() => {
    runTick(client, knowledgeBase, watchlist).catch(err => {
      console.error('[watch] Błąd cyklu:', err.message);
    });
  }, INTERVAL_MS);

  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log('\nMonitor zatrzymany.\n');
    process.exit(0);
  });
}

main().catch(err => { console.error('\nBłąd:', err.message); process.exit(1); });
