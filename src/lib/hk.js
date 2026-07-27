import { HK_APTS, HK_APT_WEIGHT } from "./constants";

export const hkW = (no) => HK_APTS.includes(no) ? HK_APT_WEIGHT : 1;
export const hkFmtDate = (s) => s ? s.split("-").reverse().join(".") : "";
export const hkDayOfWeek = (s) => { try { return new Date(s).getDay(); } catch { return 0; } };

// Agreguje historyczny czas sprzątania z hk_rooms (started_at/done_at) — prosta
// heurystyka (średnia w minutach), NIE model ML. rows: [{room, started_at, done_at}].
// Odrzuca śmieci: czas <=0 (zegar/kolejność) lub >8h (zapomniane oznaczenie "start",
// pokój wisiał "w trakcie" cały dzień) — inaczej pojedynczy taki wpis zniekształca średnią.
export function avgCleaningMinutes(rows, isApt = (no) => HK_APTS.includes(no)) {
  const all = [], apt = [], reg = [];
  for (const r of rows || []) {
    if (!r?.started_at || !r?.done_at) continue;
    const min = (new Date(r.done_at) - new Date(r.started_at)) / 60000;
    if (!Number.isFinite(min) || min <= 0 || min > 8 * 60) continue;
    all.push(min);
    (isApt(r.room) ? apt : reg).push(min);
  }
  const avg = (arr) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null;
  return {
    overallAvg: avg(all), overallCount: all.length,
    aptAvg: avg(apt), aptCount: apt.length,
    regAvg: avg(reg), regCount: reg.length,
  };
}
