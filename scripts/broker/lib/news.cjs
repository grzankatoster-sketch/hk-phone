'use strict';
const https = require('https');
const http = require('http');

const DEFAULT_FEEDS = [
  { name: 'Reuters Top News', url: 'https://feeds.reuters.com/reuters/topNews' },
  { name: 'Reuters Business', url: 'https://feeds.reuters.com/reuters/businessNews' },
  { name: 'Bankier.pl', url: 'https://www.bankier.pl/rss/wiadomosci.xml' },
  { name: 'money.pl', url: 'https://www.money.pl/rss/wiadomosci.xml' },
];

function fetchUrl(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (broker-news-module/1.0)' }, timeout: 10000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, redirects + 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function stripHtml(str) {
  return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseRSS(xml) {
  const items = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const title = stripHtml((block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1] || '');
    const desc = stripHtml((block.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i) || [])[1] || '');
    const link = ((block.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || '').trim();
    const pubDate = ((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1] || '').trim();
    if (title) items.push({ title, description: desc.slice(0, 300), link, pubDate });
  }
  return items;
}

async function fetchFeed(feed) {
  try {
    const xml = await fetchUrl(feed.url);
    return parseRSS(xml).map(i => ({ ...i, source: feed.name }));
  } catch {
    return [];
  }
}

async function fetchAllNews(feeds = DEFAULT_FEEDS, maxPerFeed = 15) {
  const results = await Promise.all(feeds.map(f => fetchFeed(f)));
  return results.flat().slice(0, maxPerFeed * feeds.length);
}

module.exports = { fetchAllNews, DEFAULT_FEEDS };
