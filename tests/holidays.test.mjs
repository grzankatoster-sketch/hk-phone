import { describe, it, expect } from "vitest";
import { holidayFactor } from "../src/lib/holidays.js";
import { suggestPrice } from "../src/lib/pricing.js";

describe("holidayFactor (WYKONANIE 4.20 — święta/długie weekendy)", () => {
  it("Nowy Rok i majówka mają mnożnik > 1", () => {
    expect(holidayFactor("2026-01-01").factor).toBeGreaterThan(1);
    expect(holidayFactor("2026-05-01").factor).toBeGreaterThan(1);
    expect(holidayFactor("2026-05-03").factor).toBeGreaterThan(1);
  });
  it("Wielkanoc ruchoma policzona z Gaussa (2026-04-05 niedziela, 04-06 poniedziałek)", () => {
    expect(holidayFactor("2026-04-05").label).toContain("Wielkanoc");
    expect(holidayFactor("2026-04-06").factor).toBeGreaterThan(1);
  });
  it("Boże Ciało 2026 = 4 czerwca (Wielkanoc+60)", () => {
    expect(holidayFactor("2026-06-04").label).toContain("Boże Ciało");
  });
  it("zwykły wtorek poza świętem → 1, bez etykiety", () => {
    const h = holidayFactor("2026-07-21");
    expect(h.factor).toBe(1);
    expect(h.label).toBeNull();
  });
  it("silnik automatycznie podbija cenę w święto (majówka vs zwykły piątek)", () => {
    const maj = suggestPrice({ basePrice: 300, stayDate: "2026-05-01" }).suggested; // 1 maja
    const zwykly = suggestPrice({ basePrice: 300, stayDate: "2026-05-08" }).suggested; // zwykły piątek
    expect(maj).toBeGreaterThan(zwykly);
    expect(suggestPrice({ basePrice: 300, stayDate: "2026-05-01" }).factors.some(f => f.key === "holiday")).toBe(true);
  });
  it("applyHoliday:false wyłącza kalendarz świąt", () => {
    const withHol = suggestPrice({ basePrice: 300, stayDate: "2026-01-01" }).suggested;
    const without = suggestPrice({ basePrice: 300, stayDate: "2026-01-01", applyHoliday: false }).suggested;
    expect(withHol).toBeGreaterThan(without);
  });
});
