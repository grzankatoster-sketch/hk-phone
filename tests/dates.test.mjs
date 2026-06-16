import { describe, it, expect } from "vitest";
import {
  autoDetectShift,
  todayKey,
  parseDayKey,
  shiftEndDate,
  getScheduleDayEntry,
  shiftStartMinutes,
} from "../src/lib/dates.js";

const at = (h) => new Date(2026, 0, 15, h, 0, 0);

describe("autoDetectShift", () => {
  it("mapuje godziny na zmiany wg progów", () => {
    expect(autoDetectShift(at(8))).toBe("poranna");
    expect(autoDetectShift(at(14))).toBe("popoludniowa");
    expect(autoDetectShift(at(18))).toBe("nocna");
    expect(autoDetectShift(at(22))).toBe("wieczorowa");
    expect(autoDetectShift(at(3))).toBe("wieczorowa"); // przed świtem
  });
});

describe("todayKey / parseDayKey", () => {
  it("todayKey formatuje YYYY-MM-DD z zerami wiodącymi", () => {
    expect(todayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(todayKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
  it("parseDayKey odwraca todayKey w czasie lokalnym (bez przesunięcia UTC)", () => {
    const d = parseDayKey("2026-03-09");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2); // marzec
    expect(d.getDate()).toBe(9);
    expect(todayKey(d)).toBe("2026-03-09");
  });
});

describe("shiftEndDate", () => {
  it("zmiana przez północ (nocna) przewija koniec na dzień następny", () => {
    const start = new Date(2026, 0, 15, 19, 0, 0); // 19:00
    const end = shiftEndDate("nocna", start);
    expect(end.getDate()).toBe(16);
    expect(end.getHours()).toBe(7);
  });
  it("zmiana dzienna kończy się tego samego dnia", () => {
    const start = new Date(2026, 0, 15, 7, 0, 0);
    const end = shiftEndDate("poranna", start);
    expect(end.getDate()).toBe(15);
    expect(end.getHours()).toBe(17);
  });
  it("brak danych → null", () => {
    expect(shiftEndDate("nocna", null)).toBeNull();
    expect(shiftEndDate("nieistniejaca", new Date())).toBeNull();
    expect(shiftEndDate("nocna", "niepoprawna-data")).toBeNull();
  });
});

describe("getScheduleDayEntry — dopasowanie imienia", () => {
  const date = new Date(2026, 0, 15);
  const key = todayKey(date);

  it("dopasowuje dokładne imię", () => {
    const sched = { [key]: { "Paweł": "15-22" } };
    expect(getScheduleDayEntry(sched, "Paweł", date)?.employeeKey).toBe("Paweł");
  });

  it("ignoruje wielkość liter i polskie znaki (Paweł ↔ pawel)", () => {
    const sched = { [key]: { "Paweł": "15-22" } };
    expect(getScheduleDayEntry(sched, "pawel", date)?.employeeKey).toBe("Paweł");
  });

  it("fallback po pierwszym imieniu gdy jednoznaczne (Imię vs Imię Nazwisko)", () => {
    const sched = { [key]: { "Anna Kowalska": "7-15" } };
    expect(getScheduleDayEntry(sched, "Anna", date)?.employeeKey).toBe("Anna Kowalska");
  });

  it("brak fallbacku przy kolizji imion", () => {
    const sched = { [key]: { "Anna Kowalska": "7-15", "Anna Nowak": "15-22" } };
    expect(getScheduleDayEntry(sched, "Anna", date)).toBeNull();
  });

  it("brak wpisu na dany dzień → null", () => {
    expect(getScheduleDayEntry({}, "Anna", date)).toBeNull();
    expect(getScheduleDayEntry(null, "Anna", date)).toBeNull();
  });
});

describe("shiftStartMinutes — godzina rozpoczęcia z grafiku", () => {
  const date = new Date(2026, 0, 15);
  const key = todayKey(date);

  it("czyta jawne godziny ze stringa '15-22' → 900 min", () => {
    const sched = { [key]: { "Ala": "15-22" } };
    expect(shiftStartMinutes(sched, "Ala", date)).toBe(15 * 60);
  });

  it("czyta godziny z minutami '15:30-22' → 930 min", () => {
    const sched = { [key]: { "Ala": "15:30-22" } };
    expect(shiftStartMinutes(sched, "Ala", date)).toBe(15 * 60 + 30);
  });

  it("czyta start z obiektu {start}", () => {
    const sched = { [key]: { "Ala": { start: "08:15", shift: "poranna" } } };
    expect(shiftStartMinutes(sched, "Ala", date)).toBe(8 * 60 + 15);
  });

  it("brak wpisu → null", () => {
    expect(shiftStartMinutes({}, "Ala", date)).toBeNull();
  });
});
