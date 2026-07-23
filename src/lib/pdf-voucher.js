// UWAGA (WYKONANIE 1.8): voucher/cashback to dekoracyjna karta A5 landscape
// (tło, pasek akcentu, znak wodny, kod) — CELOWO NIE używa wspólnego
// mkPDF_header/mkPDF_footer z pdf.js (te są dla raportów portrait). Raporty
// (pdf-daily, pdf-reports, pdf-hk) już współdzielą nagłówek/stopkę przez pdf.js.
import jsPDF from "jspdf";

const TYPE_RGB = {
  voucher:  [90,  29, 74],   // plum
  cashback: [185, 122, 31],  // amber
};
const TYPE_LABEL = { voucher: "VOUCHER", cashback: "CASHBACK" };
const UNIT_LABEL = { voucher: "PLN", cashback: "PLN" };

export function downloadVoucherPDF(voucher) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a5" });
  const pw = doc.internal.pageSize.getWidth();   // ~210
  const ph = doc.internal.pageSize.getHeight();  // ~148

  const [r, g, b] = TYPE_RGB[voucher.type] || [90, 29, 74];

  // Background
  doc.setFillColor(250, 248, 245);
  doc.rect(0, 0, pw, ph, "F");

  // Left accent bar
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, 8, ph, "F");

  // Top stripe
  doc.setFillColor(r, g, b);
  doc.rect(8, 0, pw - 8, 12, "F");

  // "VOUCHER" watermark
  doc.setFont("helvetica", "bold");
  doc.setFontSize(68);
  doc.setTextColor(r, g, b);
  doc.setGState && doc.setGState(new doc.GState({ opacity: 0.04 }));
  doc.text("VOUCHER", pw / 2, ph / 2 + 18, { align: "center" });
  doc.setGState && doc.setGState(new doc.GState({ opacity: 1 }));

  // Hotel name
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(240, 228, 236);
  doc.text("CONRAD COMFORT", 16, 8);

  // Type badge (top right)
  doc.setFontSize(7);
  doc.setTextColor(240, 228, 236);
  doc.text(TYPE_LABEL[voucher.type] || "VOUCHER", pw - 14, 8, { align: "right" });

  // Code
  doc.setFont("courier", "bold");
  doc.setFontSize(28);
  doc.setTextColor(r, g, b);
  doc.text(voucher.code, pw / 2, 50, { align: "center" });

  // Value
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(42, 26, 36);
  const valueLine = `${voucher.value} ${UNIT_LABEL[voucher.type] || voucher.value_unit}`;
  doc.text(valueLine, pw / 2, 64, { align: "center" });

  // Recipient
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90, 67, 80);
  doc.text(`Odbiorca: ${voucher.recipient_name}`, pw / 2, 75, { align: "center" });

  // Expiry
  if (voucher.expires_at) {
    doc.setFontSize(9);
    doc.setTextColor(142, 124, 135);
    const exp = new Date(voucher.expires_at).toLocaleDateString("pl-PL");
    doc.text(`Wazny do: ${exp}`, pw / 2, 84, { align: "center" });
  }

  // Note
  if (voucher.note) {
    doc.setFontSize(8);
    doc.setTextColor(142, 124, 135);
    doc.text(voucher.note, pw / 2, 93, { align: "center", maxWidth: pw - 40 });
  }

  // Issued by + date
  doc.setFontSize(7.5);
  doc.setTextColor(142, 124, 135);
  const issuedDate = new Date(voucher.issued_at).toLocaleDateString("pl-PL");
  doc.text(`Wystawil: ${voucher.issued_by} · ${issuedDate}`, 16, ph - 8);

  // Bottom right accent
  doc.setFillColor(r, g, b);
  doc.rect(pw - 8, 0, 8, ph, "F");

  doc.save(`voucher-${voucher.code}.pdf`);
}
