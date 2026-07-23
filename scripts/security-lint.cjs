const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SKIP_DIRS = new Set([".git", ".claude", "node_modules", "dist", "release", "open-design"]);
const FILE_RE = /\.(js|jsx|cjs|mjs|ts|tsx|json|css|html|md)$/i;

const rules = [
  {
    name: "no-dangerously-set-inner-html",
    re: /dangerouslySetInnerHTML/,
    message: "Use safe React rendering instead of dangerouslySetInnerHTML.",
    skipExts: [".md", ".txt"],
  },
  {
    name: "no-hardcoded-admin-password",
    re: /ADMIN_PASSWORD\s*(?:=\s*["'][^"']+["']|\|\|\s*["'][^"']+["'])/,
    message: "Admin passwords must not be hardcoded (including || fallback).",
  },
  {
    name: "no-hardcoded-hk-secret",
    re: /HK_SECRET\s*\|\|\s*["'][^"']+["']/,
    message: "HK_SECRET must be required from environment/user config.",
  },
  {
    name: "electron-web-security",
    re: /webSecurity\s*:\s*false/,
    message: "Electron webSecurity must stay enabled.",
  },
  {
    name: "no-hardcoded-supabase-url",
    re: /supabase\.co/,
    message: "Supabase URL must not appear in source code — use env vars.",
    skipExts: [".md", ".txt"],
    skipRel: ["public/hk-phone/"],
  },
  {
    name: "no-hardcoded-jwt-key",
    re: /["'`]eyJ[A-Za-z0-9_-]{20,}/,
    message: "Hardcoded JWT/anon key detected — move to env vars.",
    skipExts: [".md", ".txt"],
    skipRel: ["public/hk-phone/"],
  },
  {
    name: "no-hardcoded-supabase-key",
    re: /["'`]sb_(?:publishable|secret)_[A-Za-z0-9_-]{10,}/,
    message: "Hardcoded Supabase key detected — move to env vars.",
    skipExts: [".md", ".txt"],
    skipRel: ["public/hk-phone/"],
  },
  {
    name: "no-raw-storage-key",
    re: /["'`]reception-/,
    message: "Use STORAGE_KEYS from src/lib/storage.js instead of a raw \"reception-*\" literal.",
    onlyRel: ["src/"],
    skipRel: ["src/lib/storage.js"],
  },
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (FILE_RE.test(entry.name)) out.push(full);
  }
  return out;
}

const failures = [];
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  if (rel === "scripts/security-lint.cjs") continue;
  const ext = path.extname(file).toLowerCase();
  const text = fs.readFileSync(file, "utf8");
  for (const rule of rules) {
    if (rule.skipExts && rule.skipExts.includes(ext)) continue;
    if (rule.onlyRel && !rule.onlyRel.some(p => rel.startsWith(p))) continue;
    if (rule.skipRel && rule.skipRel.some(p => rel.startsWith(p))) continue;
    const match = rule.re.exec(text);
    if (match) {
      const line = text.slice(0, match.index).split(/\r?\n/).length;
      failures.push(`${rel}:${line} [${rule.name}] ${rule.message}`);
    }
  }
}

if (failures.length) {
  console.error("Security lint failed:");
  failures.forEach(f => console.error(`- ${f}`));
  process.exit(1);
}

console.log("Security lint passed.");
