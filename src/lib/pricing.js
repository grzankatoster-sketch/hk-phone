// Silnik sugestii cen — wariant BEZ konkurencji (WYKONANIE 4.20).
// suggested = cena_bazowa × sezonowość(dzień tygodnia) × czynnik_obłożenia,
// z twardymi widełkami min/max. Czysta, deterministyczna funkcja (testowalna) —
// NIGDY nie zmienia cen sama; kierownik zatwierdza/edytuje/odrzuca propozycję.
// Sygnały zewnętrzne (wydarzenia 4.21, pogoda 4.22, konkurencja 4.23) dokładają
// się później jako dodatkowe czynniki do tego samego wyniku.

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
export function suggestPrice({ basePrice, stayDate, occupancy = null, eventBoost = null, weatherFactor = null, minPrice = null, maxPrice = null } = {}) {
  const base = Math.max(0, Number(basePrice) || 0);
  const d = stayDate ? new Date(stayDate + "T12:00:00") : new Date();
  const dow = d.getDay();
  const dowF = DOW_FACTORS[dow] ?? 1;
  const occF = occupancy == null ? 1 : occupancyFactor(occupancy);
  const evF = eventBoost == null ? 1 : Math.max(1, Number(eventBoost) || 1);   // impreza tylko podbija
  const wF = weatherFactor == null ? 1 : (Number(weatherFactor) || 1);          // pogoda w obie strony, mała

  let suggested = Math.round(base * dowF * occF * evF * wF);
  let clamped = null;
  if (minPrice != null && suggested < Number(minPrice)) { suggested = Math.round(Number(minPrice)); clamped = "min"; }
  if (maxPrice != null && suggested > Number(maxPrice)) { suggested = Math.round(Number(maxPrice)); clamped = "max"; }

  const factors = [
    { key: "base", label: "Cena bazowa", value: base },
    { key: "dow", label: DOW_LABELS[dow], factor: dowF },
  ];
  if (occupancy != null) factors.push({ key: "occ", label: `obłożenie ${Math.round(occupancy * 100)}%`, factor: occF });
  if (eventBoost != null && evF !== 1) factors.push({ key: "event", label: "impreza w mieście", factor: evF });
  if (weatherFactor != null && wF !== 1) factors.push({ key: "weather", label: "pogoda", factor: wF });
  if (clamped) factors.push({ key: "clamp", label: `widełki (${clamped})`, value: suggested });

  const reason = factors
    .map((f) => (f.factor != null ? `${f.label} ×${f.factor}` : `${f.label} ${f.value}`))
    .join(" · ");

  return { suggested, base, dow, factors, reason, clamped };
}
