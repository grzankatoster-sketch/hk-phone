// Aktualizuje strony hk-phone na GitHub Pages (repo hk-phone): index.html + wyjazdy.html
// Użycie: node scripts/deploy-hk-phone.mjs [filename]
//   - bez argumentu: deploy wszystkich plików z public/hk-phone/
//   - z argumentem (np. "wyjazdy.html"): deploy tylko tego pliku
// Wymaga GITHUB_TOKEN w .env (Settings → Developer settings → Personal access tokens → Classic, zakres: repo)

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env") });

const OWNER = process.env.HK_PHONE_REPO_OWNER || "grzankatoster-sketch";
const REPO  = process.env.HK_PHONE_REPO || "hk-phone";
const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error("Brak GITHUB_TOKEN w .env");
  console.error("Dodaj: GITHUB_TOKEN=ghp_... (github.com → Settings → Developer settings → Tokens → Classic, zakres repo)");
  process.exit(1);
}

const ALL_FILES = ["index.html", "wyjazdy.html", "konserwacja.html", "panel.html", "grafik.html"];
const onlyOne = process.argv[2];
const FILES = onlyOne ? [onlyOne] : ALL_FILES;

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
};

async function deployFile(name) {
  const filePath = join(__dirname, "../public/hk-phone/", name);
  const content  = readFileSync(filePath, "utf8");
  const encoded  = Buffer.from(content).toString("base64");

  const apiUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${name}`;
  const existing = await fetch(apiUrl, { headers }).then(r => r.ok ? r.json() : null);
  const sha = existing?.sha;

  const res = await fetch(apiUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `update ${name}`,
      content: encoded,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    console.error(`Błąd GitHub API (${name}):`, err.message);
    process.exit(1);
  }
  console.log(`OK — ${name} zaktualizowane.`);
}

for (const f of FILES) {
  await deployFile(f);
}

console.log("");
console.log(`Worker:  https://${OWNER}.github.io/${REPO}/?w=Imie`);
console.log(`Manager: https://${OWNER}.github.io/${REPO}/wyjazdy.html`);
console.log(`Panel:   https://${OWNER}.github.io/${REPO}/panel.html`);
