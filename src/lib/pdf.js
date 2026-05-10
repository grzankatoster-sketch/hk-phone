// jsPDF building blocks extracted from App.jsx — Etap A refaktor (mini-step 4).
// Word-like helpers, no tables, no borders. All accept jsPDF doc instance.
// download*PDF report functions stay in App.jsx (depend on getFullName + report state).

import { pl } from "./format";

export function mkPDF_header(doc, pw, title, dateStr) {
  // Ciemny naglowek z logo
  doc.setFillColor(22, 28, 45); doc.rect(0, 0, pw, 26, "F");
  doc.setFillColor(148, 108, 34); doc.rect(0, 24, pw, 2, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(148, 108, 34);
  doc.text("CONRAD COMFORT", 14, 9);
  doc.setFontSize(13); doc.setTextColor(228, 222, 212);
  doc.text(pl(title), 14, 19);
  if (dateStr) { doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(90, 84, 78); doc.text(pl(dateStr), pw - 14, 19, { align: "right" }); }
}

export function mkPDF_section(doc, pw, ml, cw, y, title) {
  // Naglowek sekcji - tylko tekst + linia, bez wypelnienia
  y += 2;
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(120, 96, 40);
  doc.text(pl(title.toUpperCase()), ml, y);
  doc.setDrawColor(190, 168, 110); doc.setLineWidth(0.4); doc.line(ml, y + 2, ml + cw, y + 2);
  return y + 9;
}

export function mkPDF_kv(doc, ml, y, label, value, chk) {
  if (chk) chk(8);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(80, 72, 58);
  doc.text(pl(label) + ":", ml, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(14, 12, 10);
  doc.text(pl(String(value || "-")), ml + 54, y);
  return y + 8;
}

export function mkPDF_paragraph(doc, ml, cw, y, text, size = 10, chk) {
  doc.setFont("helvetica", "normal"); doc.setFontSize(size); doc.setTextColor(14, 12, 10);
  const lines = doc.splitTextToSize(pl(String(text || "")), cw);
  lines.forEach((l, i) => { if (chk) chk(7); doc.text(l, ml, y + i * 6.5); });
  return y + lines.length * 6.5 + 3;
}

export function mkPDF_item(doc, ml, cw, y, status, text, chk) {
  // Punktor z prefiksem statusu - bez specjalnych symboli
  if (chk) chk(10);
  const pfx = status === "[OK]" ? "[OK] " : status === "[X]" ? "[X]  " : "  -  ";
  const clr = status === "[OK]" ? [38, 95, 60] : status === "[X]" ? [148, 42, 58] : [70, 68, 64];
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(clr[0], clr[1], clr[2]);
  doc.text(pfx, ml, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(14, 12, 10);
  const lines = doc.splitTextToSize(pl(String(text || "")), cw - 18);
  lines.forEach((l, i) => doc.text(l, ml + 18, y + i * 6));
  return y + Math.max(lines.length * 6, 7) + 2;
}

export function mkPDF_footer(doc, ph, pw, ml, mr, label) {
  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(190, 180, 158); doc.setLineWidth(0.3); doc.line(ml, ph - 10, pw - mr, ph - 10);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(155, 148, 135);
    doc.text("Conrad Comfort - " + pl(label), ml, ph - 5);
    doc.text("Strona " + p + " / " + total, pw - mr, ph - 5, { align: "right" });
  }
}

// Zapis PDF: przegladarka -> pobieranie, Electron -> C:\zmiany i raporty\raporty dzienne
export function savePDF(doc, filename, folder) {
  if (window.electronAPI?.savePdf) {
    const b64 = doc.output("datauristring").split(",")[1];
    window.electronAPI.savePdf(filename, b64, folder || "raporty dzienne").catch(() => {});
  } else {
    doc.save(filename);
  }
}
