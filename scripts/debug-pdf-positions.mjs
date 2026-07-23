// Diagnostyka jednorazowa: wypisuje surowe pozycje (x,y,tekst) wokół jednego
// wiersza rezerwacji, żeby zobaczyć realny układ kolumn w PDF (kalibracja parsera).
import { readFileSync } from "fs";
import pdfParse from "pdf-parse";

const pdfPath = process.argv[2];
const anchorText = process.argv[3] || "107401";

async function extractPositions(pdfPath) {
  const items = [];
  function pagerender(pageData) {
    return pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false }).then((tc) => {
      tc.items.forEach((it) => {
        const s = String(it.str || "").trim();
        if (!s) return;
        items.push({ page: pageData.pageIndex, x: Math.round(it.transform[4]), y: Math.round(it.transform[5]), s });
      });
      return "";
    });
  }
  await pdfParse(readFileSync(pdfPath), { pagerender });
  return items;
}

const items = await extractPositions(pdfPath);
const anchor = items.find((i) => i.s === anchorText);
if (!anchor) {
  console.log(`Nie znaleziono "${anchorText}". Pierwsze 20 pozycji:`);
  items.slice(0, 20).forEach((i) => console.log(`  page=${i.page} x=${i.x} y=${i.y}  "${i.s}"`));
  process.exit(0);
}
console.log(`Kotwica "${anchorText}": page=${anchor.page} x=${anchor.x} y=${anchor.y}`);
console.log(`\nWszystkie fragmenty w promieniu Y=10 od kotwicy (posortowane wg X):`);
items
  .filter((i) => i.page === anchor.page && Math.abs(i.y - anchor.y) <= 10)
  .sort((a, b) => a.x - b.x)
  .forEach((i) => console.log(`  x=${String(i.x).padStart(4)} y=${i.y}  "${i.s}"`));
