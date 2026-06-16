'use strict';
const https = require('https');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (broker-market-module/1.0)',
        'Accept': 'application/json',
      },
      timeout: 10000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJson(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(new Error('JSON parse error')); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function getQuotes(symbols) {
  if (!symbols || !symbols.length) return [];
  const joined = symbols.map(s => encodeURIComponent(s)).join(',');
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${joined}&lang=en-US&region=US`;
  try {
    const data = await fetchJson(url);
    const result = data?.quoteResponse?.result || [];
    return result.map(q => ({
      symbol: q.symbol,
      name: q.shortName || q.longName || q.symbol,
      price: q.regularMarketPrice ?? null,
      change: q.regularMarketChange ?? null,
      changePct: q.regularMarketChangePercent ?? null,
      currency: q.currency || '',
      market: q.fullExchangeName || '',
      time: q.regularMarketTime ? new Date(q.regularMarketTime * 1000).toISOString() : null,
    }));
  } catch {
    return [];
  }
}

function formatQuotes(quotes) {
  return quotes.map(q => {
    const sign = (q.change ?? 0) >= 0 ? '+' : '';
    const pct = q.changePct != null ? ` (${sign}${q.changePct.toFixed(2)}%)` : '';
    const price = q.price != null ? `${q.price} ${q.currency}` : 'N/A';
    return `${q.symbol}: ${price}${pct}  — ${q.name}`;
  }).join('\n');
}

module.exports = { getQuotes, formatQuotes };
