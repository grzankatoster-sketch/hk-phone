const fs = require("fs");

async function extractPdfText(pdfPath) {
  let pdfParse;
  try {
    pdfParse = require("pdf-parse");
  } catch (error) {
    throw new Error("Brak zaleznosci pdf-parse. Uruchom: npm install");
  }
  const buffer = fs.readFileSync(pdfPath);
  const result = await pdfParse(buffer);
  return result.text || "";
}

// Wyciąga tekst z pozycjami (x,y,strona) — potrzebne do raportu tygodniowego,
// który jest SIATKĄ (pokoje × dni). Płaski tekst gubi kolumny (puste komórki nie
// zostawiają śladu), więc do mapowania komórki na właściwy dzień potrzebne są x/y.
async function extractPdfPositions(pdfPath) {
  let pdfParse;
  try {
    pdfParse = require("pdf-parse");
  } catch (error) {
    throw new Error("Brak zaleznosci pdf-parse. Uruchom: npm install");
  }
  const items = [];
  function pagerender(pageData) {
    return pageData
      .getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
      .then((tc) => {
        tc.items.forEach((it) => {
          const s = String(it.str || "").trim();
          if (!s) return;
          items.push({ page: pageData.pageIndex, x: Math.round(it.transform[4]), y: Math.round(it.transform[5]), s });
        });
        return "";
      });
  }
  await pdfParse(fs.readFileSync(pdfPath), { pagerender });
  return items;
}

module.exports = { extractPdfText, extractPdfPositions };
