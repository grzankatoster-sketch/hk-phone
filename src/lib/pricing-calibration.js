// Kalibracja cen wyuczona z historii KWHotel + korekty kierownika (WYKONANIE 4.20).
// Model hotelu: START od ceny MAKSYMALNEJ (wywoławczej) per kategoria×typ dnia, potem
// ZANIŻANIE bliżej terminu, gdy pokoje stoją (yield last-minute). Kotwice = sufit.
// Drabinka: Apartament > Triple > Superior > Standard > Economy; Superior = Standard + 20 zł.
// Zamrożone z realnych danych 2026 + oceny kierownika (23.07.2026) — do dostrojenia na żywo.

export const CATEGORIES = ["Apartament", "Triple", "Superior", "Standard", "Economy"];

// Sufit (cena wywoławcza) wg typu dnia: weekend=Pt/Sb, thu=czwartek, sun=niedziela, mid=Pn–Śr.
const ANCHORS = {
  Apartament: { weekend: 900, thu: 760, sun: 700, mid: 680 },
  Triple:     { weekend: 720, thu: 620, sun: 580, mid: 550 },
  Superior:   { weekend: 520, thu: 470, sun: 440, mid: 420 },
  Standard:   { weekend: 500, thu: 450, sun: 420, mid: 400 },
  Economy:    { weekend: 490, thu: 440, sun: 410, mid: 390 },
};

// Domyślne widełki + typowy lead-time (dni przed przyjazdem, kiedy gość rezerwuje).
// Kierownik może nadpisać w panelu. Hotel jest silnie last-minute → avgLeadDays niski.
export const DEFAULT_CONFIG = {
  Apartament: { min: 450, max: 900, avgLeadDays: 1 },
  Triple:     { min: 400, max: 720, avgLeadDays: 1 },
  Superior:   { min: 300, max: 520, avgLeadDays: 1 },
  Standard:   { min: 280, max: 500, avgLeadDays: 1 },
  Economy:    { min: 270, max: 490, avgLeadDays: 1 },
};

export function dayType(dateStr) {
  const dow = new Date(dateStr + "T12:00:00").getDay(); // 0=nd..6=sb
  if (dow === 5 || dow === 6) return "weekend";
  if (dow === 4) return "thu";
  if (dow === 0) return "sun";
  return "mid";
}

// Sufit (cena wywoławcza) dla kategorii i daty. Nieznana kategoria → null.
export function anchorFor(category, dateStr) {
  const a = ANCHORS[category];
  if (!a || !dateStr) return null;
  return a[dayType(dateStr)] ?? null;
}
