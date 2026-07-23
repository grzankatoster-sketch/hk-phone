import { describe, it, expect } from "vitest";
import { suggestPrice, occupancyFactor, DOW_FACTORS } from "../src/lib/pricing.js";

describe("occupancyFactor (WYKONANIE 4.20)", () => {
  it("wysokie obłożenie → wyższy mnożnik", () => {
    expect(occupancyFactor(0.95)).toBe(1.25);
    expect(occupancyFactor(0.8)).toBe(1.15);
  });
  it("niskie obłożenie → mnożnik < 1", () => {
    expect(occupancyFactor(0.2)).toBe(0.9);
  });
  it("clamp 0..1 i śmieci → bezpiecznie", () => {
    expect(occupancyFactor(2)).toBe(1.25);
    expect(occupancyFactor(-1)).toBe(0.9);
    expect(occupancyFactor("x")).toBe(0.9);
  });
});

describe("suggestPrice", () => {
  // 2026-07-24 = piątek, 2026-07-21 = wtorek (weryfikacja dnia tygodnia)
  it("weekend (piątek) droższy niż środek tygodnia (wtorek) przy tej samej bazie", () => {
    const fri = suggestPrice({ basePrice: 400, stayDate: "2026-07-24" }).suggested;
    const tue = suggestPrice({ basePrice: 400, stayDate: "2026-07-21" }).suggested;
    expect(fri).toBeGreaterThan(tue);
    expect(fri).toBe(Math.round(400 * DOW_FACTORS[5]));
  });

  it("wysokie obłożenie podnosi cenę względem niskiego", () => {
    const hi = suggestPrice({ basePrice: 400, stayDate: "2026-07-21", occupancy: 0.95 }).suggested;
    const lo = suggestPrice({ basePrice: 400, stayDate: "2026-07-21", occupancy: 0.2 }).suggested;
    expect(hi).toBeGreaterThan(lo);
  });

  it("widełki min/max są twarde", () => {
    const capped = suggestPrice({ basePrice: 400, stayDate: "2026-07-24", occupancy: 0.95, maxPrice: 420 });
    expect(capped.suggested).toBe(420);
    expect(capped.clamped).toBe("max");
    const floored = suggestPrice({ basePrice: 200, stayDate: "2026-07-21", occupancy: 0.1, minPrice: 250 });
    expect(floored.suggested).toBe(250);
    expect(floored.clamped).toBe("min");
  });

  it("zwraca czytelne uzasadnienie i czynniki", () => {
    const r = suggestPrice({ basePrice: 400, stayDate: "2026-07-24", occupancy: 0.8 });
    expect(r.reason).toContain("Cena bazowa 400");
    expect(r.factors.some(f => f.key === "occ")).toBe(true);
  });

  it("śmieciowa baza → 0, bez NaN", () => {
    expect(suggestPrice({ basePrice: "abc", stayDate: "2026-07-24" }).suggested).toBe(0);
  });
});
