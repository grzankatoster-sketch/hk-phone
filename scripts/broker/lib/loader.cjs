'use strict';
const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = path.join(__dirname, '..', 'knowledge');
const TOP_N = 8;
const MIN_PREFIX = 4; // minimum shared prefix length to count as stem-match

const STOP_WORDS = new Set([
  'co', 'to', 'jest', 'sa', 'jakie', 'jaki', 'jaka', 'jak', 'ile',
  'czy', 'i', 'w', 'na', 'do', 'z', 'sie', 'ze', 'nie', 'a', 'o',
  'przez', 'po', 'przy', 'dla', 'od', 'za', 'ten', 'ta', 'tego',
  'tej', 'tym', 'te', 'mi', 'mu', 'je', 'go', 'jej', 'jego',
  'ich', 'im', 'on', 'ona', 'ono', 'oni', 'one', 'byc', 'bedzie',
  'moze', 'mozna', 'oraz', 'the', 'is', 'of', 'and', 'in', 'for',
  'with', 'as', 'at', 'by', 'an', 'be', 'was', 'are', 'has',
  'ktory', 'ktora', 'ktore', 'tych', 'przy', 'tego', 'jezeli',
  'jaka', 'jakim', 'jakiej', 'jest', 'przy', 'poniewaz', 'natomiast'
]);

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ');
}

function tokenize(text) {
  return normalize(text)
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

// How many characters a and b share from the start
function prefixLen(a, b) {
  let i = 0;
  const max = Math.min(a.length, b.length);
  while (i < max && a[i] === b[i]) i++;
  return i;
}

function scoreFile(searchText, queryTokens) {
  const fileTokens = tokenize(searchText);

  // Build frequency map
  const freq = new Map();
  for (const t of fileTokens) freq.set(t, (freq.get(t) || 0) + 1);

  let score = 0;
  for (const qToken of queryTokens) {
    if (freq.has(qToken)) {
      // Exact match — highest score, boosted by frequency
      score += 3 + Math.log1p(freq.get(qToken));
    } else {
      // Stem match — find best prefix overlap among all file tokens
      let bestPrefix = 0;
      for (const [fToken] of freq) {
        const pl = prefixLen(qToken, fToken);
        if (pl > bestPrefix) bestPrefix = pl;
      }
      if (bestPrefix >= MIN_PREFIX) {
        // Reward proportional to how much of the shorter word matched
        const shorter = Math.min(qToken.length, bestPrefix + 2);
        score += 1 * (bestPrefix / shorter);
      }
    }
  }
  return score;
}

function parseFrontmatter(raw) {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!fmMatch) return { tags: [], body: raw.trim() };

  const fm = fmMatch[1];
  const topicMatch = fm.match(/^topic:\s*(.+)/m);
  const addedMatch = fm.match(/^added:\s*(.+)/m);
  const tagsMatch = fm.match(/^tags:\s*(.+)/m);

  const tags = tagsMatch
    ? tagsMatch[1].split(',').map(t => t.trim()).filter(Boolean)
    : [];

  return {
    topic: topicMatch ? topicMatch[1].trim() : '',
    added: addedMatch ? addedMatch[1].trim() : '',
    tags,
    body: raw.slice(fmMatch[0].length).trim()
  };
}

function loadAll() {
  if (!fs.existsSync(KNOWLEDGE_DIR)) return [];

  return fs.readdirSync(KNOWLEDGE_DIR)
    .filter(f => f.endsWith('.md') && f !== '.gitkeep')
    .map(filename => {
      const raw = fs.readFileSync(path.join(KNOWLEDGE_DIR, filename), 'utf8');
      const parsed = parseFrontmatter(raw);
      return {
        filename,
        topic: parsed.topic || filename.replace('.md', ''),
        added: parsed.added,
        tags: parsed.tags,
        content: parsed.body
      };
    });
}

function getRelevant(query) {
  const all = loadAll();
  if (all.length === 0) return [];
  if (all.length <= TOP_N) return all;

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return all.slice(0, TOP_N);

  const scored = all.map(entry => {
    // Tags score 3x — they're the user's own synonym/acronym index
    const tagText = entry.tags.join(' ') + ' ' + entry.tags.join(' ') + ' ' + entry.tags.join(' ');
    const searchText = entry.topic + ' ' + tagText + ' ' + entry.content;
    return { ...entry, score: scoreFile(searchText, queryTokens) };
  });
  scored.sort((a, b) => b.score - a.score);

  if (scored[0].score === 0) return all.slice(0, TOP_N);
  return scored.slice(0, TOP_N);
}

module.exports = { loadAll, getRelevant, KNOWLEDGE_DIR };
