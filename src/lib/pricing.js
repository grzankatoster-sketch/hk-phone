// Silnik sugestii cen — wariant BEZ konkurencji (WYKONANIE 4.20).
// suggested = cena_bazowa × sezonowość(dzień tygodnia) × obłożenie × święto × impreza × pogoda,
// z twardymi widełkami min/max. Czysta, deterministyczna funkcja (testowalna) — stanowi
// BARIERKĘ dla warstwy AI (lib/llm.generatePriceSuggestion), która rozumuje w tych granicach.
// NIGDY nie zmienia cen sama; kierownik zatwierdza/edytuje/odrzuca propozycję.
import { holidayFactor } from "./holidays.js";
import { anchorFor } from "./pricing-calibration.js";

// Mnożnik dnia tygodnia (0=niedziela … 6=sobota). Weekend drożej, środek tygodnia taniej.
export const DOW_FACTORS = Object.freeze({ 0: 0.95, 1: 0.92, 2: 0.92, 3: 0.95, 4: 1.05, 5: 1.15, 6: 1.12 });
const DOW_LABELS = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];

// Czynnik obłożenia: im wyższe historyczne/prognozowane obłożenie, tym wyższa cena.
export function occupancyFactor(occ) {
  const o = Math.max(0, Math.min(1, Number(occ) || 0));
  if (o >= 0.9) return 1.25;
  if (o >= 0.75) return 1.15;
  if (o >= 0.5) return 1.0;
  if (o >= 0.3) return 0.95;
  return 0.9;
}

// stayDate: "YYYY-MM-DD". occupancy: 0..1 lub null (pomiń). eventBoost: mnożnik ≥1 od
// imprezy w mieście (Ticketmaster 4.21, np. 1.15 za duży koncert) lub null. weatherFactor:
// mnożnik ~0.97..1.02 od pogody (4.22, mała waga — słaby predyktor) lub null. min/maxPrice: widełki.
// holidayBoost: nadpisuje auto-kalendarz świąt (null = policz z daty). applyHoliday=false wyłącza.
export function suggestPrice({ basePrice, stayDate, occupancy = null, eventBoost = null, weatherFactor = null, holidayBoost = null, applyHoliday = true, minPrice = null, maxPrice = null } = {}) {
  const base = Math.max(0, Number(basePrice) || 0);
  const d = stayDate ? new Date(stayDate + "T12:00:00") : new Date();
  const dow = d.getDay();
  const dowF = DOW_FACTORS[dow] ?? 1;
  const occF = occupancy == null ? 1 : occupancyFactor(occupancy);
  const evF = eventBoost == null ? 1 : Math.max(1, Number(eventBoost) || 1);   // impreza tylko podbija
  const wF = weatherFactor == null ? 1 : (Number(weatherFactor) || 1);          // pogoda w obie strony, mała
  const hol = holidayBoost != null ? { factor: Math.max(1, Number(holidayBoost) || 1), label: "święto" }
            : (applyHoliday ? holidayFactor(stayDate) : { factor: 1, label: null });
  const holF = hol.factor;

  let suggested = Math.round(base * dowF * occF * evF * wF * holF);
  let clamped = null;
  if (minPrice != null && suggested < Number(minPrice)) { suggested = Math.round(Number(minPrice)); clamped = "min"; }
  if (maxPrice != null && suggested > Number(maxPrice)) { suggested = Math.round(Number(maxPrice)); clamped = "max"; }

  const factors = [
    { key: "base", label: "Cena bazowa", value: base },
    { key: "dow", label: DOW_LABELS[dow], factor: dowF },
  ];
  if (occupancy != null) factors.push({ key: "occ", label: `obłożenie ${Math.round(occupancy * 100)}%`, factor: occF });
  if (holF !== 1) factors.push({ key: "holiday", label: hol.label || "święto / długi weekend", factor: holF });
  if (eventBoost != null && evF !== 1) factors.push({ key: "event", label: "impreza w mieście", factor: evF });
  if (weatherFactor != null && wF !== 1) factors.push({ key: "weather", label: "pogoda", factor: wF });
  if (clamped) factors.push({ key: "clamp", label: `widełki (${clamped})`, value: suggested });

  const reason = factors
    .map((f) => (f.factor != null ? `${f.label} ×${f.factor}` : `${f.label} ${f.value}`))
    .join(" · ");

  return { suggested, base, dow, factors, reason, clamped };
}

// Model hotelu (yield last-minute): START od SUFITU (cena wywoławcza = kotwica × święto),
// ZANIŻANIE bliżej terminu, gdy pokoje stoją; podłoga = minPrice. Wysokie obłożenie / daleko
// od terminu → trzymaj sufit. occupancy = zajętość danej daty (0..1) lub null (nieznana → trzymaj).
// today/stayDate: "YYYY-MM-DD". avgLeadDays: typowy wyprzedzenie rezerwacji (hotel last-minute → 1).
export function yieldPrice({ category = null, stayDate, today = null, occupancy = null, minPrice = null, maxPrice = null, avgLeadDays = 1, anchor = null, maxDiscount = 0.30 } = {}) {
  const rawAnchor = anchor != null ? Number(anchor) : anchorFor(category, stayDate);
  if (!rawAnchor || !stayDate) return null;
  const holF = holidayFactor(stayDate).factor;
  const ceilRaw = Math.round(rawAnchor * holF);
  const ceil = maxPrice != null ? Math.min(Number(maxPrice), ceilRaw) : ceilRaw;   // sufit (twarde MAX)
  const floor = minPrice != null ? Math.min(Number(minPrice), ceil) : Math.round(ceil * 0.7); // podłoga (twarde MIN)

  const t = today ? new Date(today + "T12:00:00") : new Date();
  const s = new Date(stayDate + "T12:00:00");
  const daysOut = Math.round((s - t) / 86400000);

  const window = Math.max(3, (Number(avgLeadDays) || 1) + 2);   // od kiedy zaczynamy schodzić
  let discount = 0;
  if (occupancy != null && daysOut >= 0 && daysOut <= window && Number(occupancy) < 0.85) {
    const emptiness = 1 - Math.max(0, Math.min(1, Number(occupancy)));       // ile stoi wolne
    const urgency = Math.max(0, Math.min(1, (window - daysOut) / window));    // im bliżej, tym mocniej
    discount = emptiness * urgency * maxDiscount;                             // maks. −30%
  }
  let price = Math.round(ceil * (1 - discount));
  price = Math.max(floor, Math.min(ceil, price));
  return { price, ceil, floor, anchor: rawAnchor, daysOut, discount: Math.round(discount * 100) / 100, holidayFactor: holF, hold: discount < 0.005 };
}
