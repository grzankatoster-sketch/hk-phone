import { describe, it, expect } from "vitest";
import { stripDiacritics, normalizeNameKey } from "../src/lib/names.js";

describe("stripDiacritics — kanoniczny normalizator tekstu (WYKONANIE 1.6)", () => {
  it("usuwa polskie diakrytyki i sprowadza do lowercase", () => {
    expect(stripDiacritics("Zażółć gęślą jaźń")).toBe("zazolc gesla jazn");
  });

  it("mapuje ł oraz Ł na l (NFD tego nie robi)", () => {
    expect(stripDiacritics("Łódź")).toBe("lodz");
    expect(stripDiacritics("Paweł")).toBe("pawel");
    expect(stripDiacritics("PAWEŁ")).toBe("pawel");
  });

  it("obsługuje null/undefined/puste bez wyjątku", () => {
    expect(stripDiacritics(null)).toBe("");
    expect(stripDiacritics(undefined)).toBe("");
    expect(stripDiacritics("")).toBe("");
  });

  it("jest równoważny starym kopiom (lowercase → NFD → marks → ł→l)", () => {
    const legacy = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
    for (const s of ["Łódź", "Paweł", "Zażółć", "Anna Kowalska", "", "Ćma Świerszcz"]) {
      expect(stripDiacritics(s)).toBe(legacy(s));
    }
  });

  it("normalizeNameKey CELOWO nie mapuje ł (osobna semantyka klucza nazwiska)", () => {
    expect(normalizeNameKey("Paweł")).toBe("paweł");
  });
});
