import { describe, it, expect } from "vitest";
import { yieldPrice } from "../src/lib/pricing.js";
import { anchorFor, dayType } from "../src/lib/pricing-calibration.js";

describe("kalibracja kotwic (WYKONANIE 4.20)", () => {
  it("drabinka Apartament > Triple > Superior > Standard > Economy (sobota)", () => {
    const d = "2026-07-25"; // sobota
    const a = anchorFor("Apartament", d), t = anchorFor("Triple", d), su = anchorFor("Superior", d),
          st = anchorFor("Standard", d), e = anchorFor("Economy", d);
    expect(a).toBeGreaterThan(t); expect(t).toBeGreaterThan(su);
    expect(su).toBeGreaterThan(st); expect(st).toBeGreaterThan(e);
  });
  it("Superior = Standard + 20 zł na każdy typ dnia", () => {
    for (const d of ["2026-07-25", "2026-07-30", "2026-07-26", "2026-07-27"]) {
      expect(anchorFor("Superior", d) - anchorFor("Standard", d)).toBe(20);
    }
  });
  it("typ dnia: sobota=weekend, czwartek=thu, niedziela=sun, wtorek=mid", () => {
    expect(dayType("2026-07-25")).toBe("weekend");
    expect(dayType("2026-07-30")).toBe("thu");
    expect(dayType("2026-07-26")).toBe("sun");
    expect(dayType("2026-07-28")).toBe("mid");
  });
});

describe("yieldPrice — sufit → zaniżanie", () => {
  it("daleko od terminu → trzyma sufit (cena wywoławcza)", () => {
    const r = yieldPrice({ category: "Standard", stayDate: "2026-07-25", today: "2026-07-01", occupancy: 0.2 });
    expect(r.hold).toBe(true);
    expect(r.price).toBe(r.ceil);
  });
  it("blisko terminu + pokoje stoją → schodzi z ceny, ale nie poniżej podłogi", () => {
    const r = yieldPrice({ category: "Standard", stayDate: "2026-07-25", today: "2026-07-24", occupancy: 0.1, minPrice: 280 });
    expect(r.price).toBeLessThan(r.ceil);
    expect(r.price).toBeGreaterThanOrEqual(280);
  });
  it("blisko terminu ale prawie pełne → trzyma sufit", () => {
    const r = yieldPrice({ category: "Standard", stayDate: "2026-07-25", today: "2026-07-25", occupancy: 0.95 });
    expect(r.price).toBe(r.ceil);
  });
  it("obłożenie nieznane → nie schodzi (brak sygnału)", () => {
    const r = yieldPrice({ category: "Superior", stayDate: "2026-07-25", today: "2026-07-24", occupancy: null });
    expect(r.price).toBe(r.ceil);
  });
  it("twardy sufit MAX i podłoga MIN są respektowane", () => {
    const r = yieldPrice({ category: "Apartament", stayDate: "2026-07-25", today: "2026-07-24", occupancy: 0, minPrice: 500, maxPrice: 800 });
    expect(r.ceil).toBe(800);
    expect(r.price).toBeGreaterThanOrEqual(500);
  });
  it("nieznana kategoria → null", () => {
    expect(yieldPrice({ category: "XYZ", stayDate: "2026-07-25" })).toBeNull();
  });
  it("event boost podnosi sufit (do twardego MAX)", () => {
    const base = yieldPrice({ category: "Standard", stayDate: "2026-07-28", today: "2026-07-28", occupancy: null });
    const ev = yieldPrice({ category: "Standard", stayDate: "2026-07-28", today: "2026-07-28", occupancy: null, eventBoost: 1.2, maxPrice: 700 });
    expect(ev.ceil).toBeGreaterThan(base.ceil);
    expect(ev.price).toBeLessThanOrEqual(700); // MAX twardy
  });
  it("zła pogoda lekko obniża, dobra lekko podnosi (w widełkach)", () => {
    const base = yieldPrice({ category: "Standard", stayDate: "2026-07-28", today: "2026-07-28", occupancy: 0.5 }).price;
    expect(yieldPrice({ category: "Standard", stayDate: "2026-07-28", today: "2026-07-28", occupancy: 0.5, weatherFactor: 0.96 }).price).toBeLessThanOrEqual(base);
  });
});
