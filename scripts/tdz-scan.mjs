// Skaner TDZ: znajduje tablice zależności hooków (useEffect/useMemo/useCallback),
// które odwołują się do const/let zadeklarowanego PÓŹNIEJ w tym samym pliku.
// To dokładnie klasa błędu "Cannot access 'X' before initialization".
//
// Run: node scripts/tdz-scan.mjs [plik1 plik2 ...]   (domyślnie skanuje src/**/*.jsx)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) { if (!/node_modules|dist|build/.test(p)) walk(p, out); }
    else if (/\.(jsx?|mjs)$/.test(e)) out.push(p);
  }
  return out;
}

// Zbierz mapę name -> najwcześniejsza linia deklaracji const/let (NIE function — hoisted).
function declMap(lines) {
  const map = new Map();
  const add = (name, i) => { if (name && !map.has(name)) map.set(name, i); };
  lines.forEach((line, i) => {
    // const [a,b,c] = ...   /  let [a] = ...
    let m = line.match(/\b(?:const|let)\s*\[([^\]]+)\]\s*=/);
    if (m) m[1].split(",").forEach(n => add(n.trim().replace(/[:=].*$/, "").trim(), i));
    // const {a,b} = ...
    m = line.match(/\b(?:const|let)\s*\{([^}]+)\}\s*=/);
    if (m) m[1].split(",").forEach(n => add(n.split(":").pop().trim(), i));
    // const name = ...  / let name = ...
    m = line.match(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/);
    if (m) add(m[1], i);
  });
  return map;
}

// Dep arrays: "[ ident, ident.member, ... ]" zaraz przed ")" — kształt typowy dla deps.
const DEP_RE = /,\s*\[\s*([A-Za-z_$][\w$.,\s]*?)\s*\]\s*\)/g;

// Nazwy będące PARAMETRAMI/propsami jakiejkolwiek funkcji w pliku — w innym
// zakresie niż outer const, więc nie powodują TDZ przy renderze rodzica.
function paramNames(src) {
  const set = new Set();
  // destrukturyzowane propsy: ({ a, b, c }) => / function X({ a, b })
  for (const m of src.matchAll(/\(\s*\{([^}]*)\}\s*\)\s*(?:=>|\{)/g))
    m[1].split(",").forEach(n => { const id = n.split(":")[0].trim().replace(/\.\.\./, ""); if (/^[A-Za-z_$][\w$]*$/.test(id)) set.add(id); });
  // pozycyjne: function X(a,b) / (a,b)=>
  for (const m of src.matchAll(/(?:function\s+[\w$]*\s*|=>\s*)?\(([^){}]*)\)\s*=>/g))
    m[1].split(",").forEach(n => { const id = n.trim().replace(/\.\.\./, "").split("=")[0].trim(); if (/^[A-Za-z_$][\w$]*$/.test(id)) set.add(id); });
  return set;
}

function scanFile(path) {
  const src = readFileSync(path, "utf8");
  const lines = src.split(/\r?\n/);
  const decls = declMap(lines);
  const params = paramNames(src);
  const findings = [];
  let m;
  // skanuj całość, mapując offset -> numer linii
  const lineStarts = [];
  { let off = 0; for (const l of lines) { lineStarts.push(off); off += l.length + 1; } }
  const lineOf = (idx) => { let lo = 0, hi = lineStarts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= idx) lo = mid; else hi = mid - 1; } return lo; };

  DEP_RE.lastIndex = 0;
  while ((m = DEP_RE.exec(src))) {
    const depLine = lineOf(m.index);
    const idents = m[1].split(",").map(s => s.trim().split(".")[0]).filter(Boolean);
    for (const id of idents) {
      if (!decls.has(id)) continue;
      if (params.has(id)) continue; // prop/param w innym zakresie — nie TDZ
      const declLine = decls.get(id);
      if (declLine > depLine) {
        findings.push({ id, depLine: depLine + 1, declLine: declLine + 1 });
      }
    }
  }
  return findings;
}

const targets = process.argv.slice(2);
const files = targets.length ? targets : walk("src");
let total = 0;
for (const f of files) {
  let findings;
  try { findings = scanFile(f); } catch (e) { console.error(`! ${f}: ${e.message}`); continue; }
  if (findings.length) {
    console.log(`\n${f}`);
    for (const x of findings) {
      total++;
      console.log(`  ⚠ TDZ: '${x.id}' użyte w deps @${x.depLine}, a zadeklarowane @${x.declLine}`);
    }
  }
}
console.log(`\n${"═".repeat(56)}\nTDZ-podejrzeń: ${total}`);
process.exit(total ? 1 : 0);
