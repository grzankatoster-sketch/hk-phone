import { describe, it, expect } from "vitest";
import { avgCleaningMinutes } from "../src/lib/hk.js";

const isApt = (no) => ["106", "206"].includes(no);

describe("avgCleaningMinutes", () => {
  it("liczy średnią w minutach z started_at/done_at", () => {
    const rows = [
      { room: "101", started_at: "2026-07-01T10:00:00Z", done_at: "2026-07-01T10:20:00Z" }, // 20min
      { room: "102", started_at: "2026-07-01T10:00:00Z", done_at: "2026-07-01T10:30:00Z" }, // 30min
    ];
    const out = avgCleaningMinutes(rows, isApt);
    expect(out.overallAvg).toBe(25);
    expect(out.overallCount).toBe(2);
    expect(out.regAvg).toBe(25);
    expect(out.regCount).toBe(2);
    expect(out.aptAvg).toBeNull();
  });

  it("rozdziela apartamenty od zwykłych pokoi", () => {
    const rows = [
      { room: "106", started_at: "2026-07-01T10:00:00Z", done_at: "2026-07-01T10:45:00Z" }, // apt 45min
      { room: "101", started_at: "2026-07-01T10:00:00Z", done_at: "2026-07-01T10:15:00Z" }, // reg 15min
    ];
    const out = avgCleaningMinutes(rows, isApt);
    expect(out.aptAvg).toBe(45);
    expect(out.regAvg).toBe(15);
    expect(out.overallAvg).toBe(30);
  });

  it("odrzuca wpisy bez started_at/done_at", () => {
    const rows = [{ room: "101", started_at: null, done_at: "2026-07-01T10:15:00Z" }];
    expect(avgCleaningMinutes(rows, isApt)).toMatchObject({ overallAvg: null, overallCount: 0 });
  });

  it("odrzuca ujemny czas (zła kolejność/zegar)", () => {
    const rows = [{ room: "101", started_at: "2026-07-01T10:30:00Z", done_at: "2026-07-01T10:00:00Z" }];
    expect(avgCleaningMinutes(rows, isApt).overallCount).toBe(0);
  });

  it("odrzuca czas dłuższy niż 8h (zapomniane oznaczenie start)", () => {
    const rows = [{ room: "101", started_at: "2026-07-01T08:00:00Z", done_at: "2026-07-01T20:00:01Z" }];
    expect(avgCleaningMinutes(rows, isApt).overallCount).toBe(0);
  });

  it("pusty/niezdefiniowany wkład → same null/0", () => {
    expect(avgCleaningMinutes(undefined, isApt)).toMatchObject({ overallAvg: null, overallCount: 0 });
    expect(avgCleaningMinutes([], isApt)).toMatchObject({ overallAvg: null, overallCount: 0 });
  });
});
