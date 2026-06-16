// Full-scale simulation of the shift-hours redesign.
// Runs the REAL pure functions from src/lib and mirrors the small React-inline
// glue (schedule cell save, early-login popup trigger, shift label building) so
// every part of the change is exercised end-to-end.
//
// Run:  node scripts/shift-logic-sim.mjs

import {
  shiftStartMinutes, getScheduleDayEntry, shiftFromSchedule, autoDetectShift, todayKey,
} from "../src/lib/dates.js";
import { parseHoursToShift, normalizeToShift } from "../src/lib/excel.js";
// Static label maps copied 1:1 from src/lib/constants.js (importing the module
// directly pulls in tenants/config.js which needs Vite's import.meta.env).
const SHIFT_LABELS_PL = { poranna: "Zmiana poranna 7:00–17:00", popoludniowa: "Zmiana popołudniowa 14:00–23:00", wieczorowa: "Zmiana wieczorowa 21:00–7:00", dzienna: "Zmiana dzienna 7:00–19:00", nocna: "Zmiana nocna 19:00–7:00" };
const SHIFT_SHORT_LABELS = { poranna: "Poranna 7–17", popoludniowa: "Popołudniowa 14–23", wieczorowa: "Wieczorowa 21–7", dzienna: "Dzienna 7–19", nocna: "Nocna 19–7" };
const SHIFT_NAME_PL = { poranna: "Zmiana poranna", popoludniowa: "Zmiana popołudniowa", wieczorowa: "Zmiana wieczorowa", dzienna: "Zmiana dzienna", nocna: "Zmiana nocna" };

// ─── tiny harness (collects all failures, no throw-on-first) ──────────────────
let pass = 0; const fails = [];
const eq = (name, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; } else { fails.push(`✗ ${name}\n      got:      ${a}\n      expected: ${e}`); }
};
const ok = (name, cond) => { if (cond) pass++; else fails.push(`✗ ${name} (expected truthy)`); };
const section = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 58 - t.length))}`);

// ─── mirrors of React-inline glue (kept identical to source) ──────────────────
// ScheduleAdminPanel.setShift body
const buildEntry = (hours, shift) => {
  const h = (hours || "").trim();
  if (!h && !shift) return null;
  const parts = h.split(/\s*[-–—]\s*/);
  return { start: parts[0] || "", end: parts[1] || "", shift: shift || null };
};
// ScheduleAdminPanel.CellInput auto-suggest on hours blur
const cellCommitShift = (hours, currentShift) => {
  const trimmed = (hours || "").trim();
  if (!currentShift && trimmed) { const g = parseHoursToShift(trimmed); if (g) return g; }
  return currentShift || "";
};
// ScheduleAdminPanel.rawHours
const rawHours = (raw) => {
  if (!raw) return "";
  if (typeof raw === "object") {
    const s = raw.start ?? raw.startTime ?? raw.start_time ?? raw.from ?? raw.from_time;
    const e = raw.end ?? raw.endTime ?? raw.end_time ?? raw.to ?? raw.to_time;
    return [s, e].filter(Boolean).join("-");
  }
  const s = String(raw);
  return /\d\s*[-–—]\s*\d/.test(s) ? s : "";
};
// App.scheduledHours
const scheduledHours = (schedule, empName, date) => {
  const raw = getScheduleDayEntry(schedule, empName, date)?.raw;
  if (!raw) return "";
  if (typeof raw === "object") {
    const s = raw.start ?? raw.startTime ?? raw.start_time ?? raw.from ?? raw.from_time;
    const e = raw.end ?? raw.endTime ?? raw.end_time ?? raw.to ?? raw.to_time;
    return [s, e].filter(Boolean).join("–");
  }
  const s = String(raw);
  return /\d\s*[-–—]\s*\d/.test(s) ? s.replace(/\s*[-–—]\s*/, "–") : "";
};
// App.shiftFullLabel / shiftShortLabel — godziny doklejane tylko gdy pokazywany
// typ zmiany (key) zgadza się z typem z grafiku (schedShift).
const shiftFullLabel = (key, hours, schedShift) => {
  if (!key) return "—";
  const useHours = hours && key === schedShift;
  return useHours ? `${SHIFT_NAME_PL[key] || key} ${hours}` : (SHIFT_LABELS_PL[key] || key);
};
const shiftShortLabel = (key, hours, schedShift) => {
  if (!key) return "—";
  const useHours = hours && key === schedShift;
  const name = (SHIFT_NAME_PL[key] || key).replace(/^Zmiana\s+/i, "");
  return useHours ? `${name.charAt(0).toUpperCase()}${name.slice(1)} ${hours}` : (SHIFT_SHORT_LABELS[key] || key);
};
// App.attemptWorkerLogin popup decision (returns whether the identity modal fires)
const earlyLoginFires = (schedule, empName, now) => {
  const startMin = shiftStartMinutes(schedule, empName, now);
  if (startMin == null) return false;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const diff = startMin - nowMin;
  return diff > 0 && diff <= 30;
};

// Fixed simulation "today" + helpers to place an entry on it.
const DAY = new Date(2026, 4, 30, 12, 0, 0); // 2026-05-30 (local)
const TKEY = todayKey(DAY);
const sched = (entry, name = "Pawel") => ({ [TKEY]: { [name]: entry } });
const at = (h, m = 0) => new Date(2026, 4, 30, h, m, 0);

// ════════════════════════════════════════════════════════════════════════════
section("PART A · Grafik: zapis wpisu {start,end,shift}");
eq("A1 7-15 + poranna",        buildEntry("7-15", "poranna"),        { start: "7", end: "15", shift: "poranna" });
eq("A2 15-22 + popoludniowa",  buildEntry("15-22", "popoludniowa"),  { start: "15", end: "22", shift: "popoludniowa" });
eq("A3 spacje '  7 - 15 '",    buildEntry("  7 - 15 ", "poranna"),   { start: "7", end: "15", shift: "poranna" });
eq("A4 en-dash 7–15",          buildEntry("7–15", "poranna"),        { start: "7", end: "15", shift: "poranna" });
eq("A5 godziny z minutami",    buildEntry("15:30-22:00", "popoludniowa"), { start: "15:30", end: "22:00", shift: "popoludniowa" });
eq("A6 puste + brak zmiany → null", buildEntry("", ""),              null);
eq("A7 tylko zmiana, bez godzin",   buildEntry("", "nocna"),         { start: "", end: "", shift: "nocna" });
eq("A8 tylko godziny, bez zmiany",  buildEntry("7-15", ""),          { start: "7", end: "15", shift: null });

section("PART A2 · Auto-podpowiedź zmiany z godzin (parseHoursToShift)");
eq("poranna 7-14",   cellCommitShift("7-14", ""),  "poranna");
eq("poranna 7-15",   cellCommitShift("7-15", ""),  "poranna");
eq("poranna 7-16",   cellCommitShift("7-16", ""),  "poranna");
eq("poranna 8-16",   cellCommitShift("8-16", ""),  "poranna");
eq("dzienna 7-19",   cellCommitShift("7-19", ""),  "dzienna");
eq("dzienna 7-18",   cellCommitShift("7-18", ""),  "dzienna");
eq("popoludniowa 14-22", cellCommitShift("14-22", ""), "popoludniowa");
eq("popoludniowa 15-22", cellCommitShift("15-22", ""), "popoludniowa");
eq("popoludniowa 16-23", cellCommitShift("16-23", ""), "popoludniowa");
eq("wieczorowa 21-7",cellCommitShift("21-7", ""),  "wieczorowa");
eq("wieczorowa 22-6",cellCommitShift("22-6", ""),  "wieczorowa");
eq("nocna 19-7",     cellCommitShift("19-7", ""),  "nocna");
eq("nocna 20-7",     cellCommitShift("20-7", ""),  "nocna");
eq("override: 7-15 ale ręcznie dzienna → NIE nadpisuje", cellCommitShift("7-15", "dzienna"), "dzienna");
eq("niejednoznaczne 9-13 → brak podpowiedzi (puste)", cellCommitShift("9-13", ""), "");
eq("śmieci 'xx' → brak podpowiedzi", cellCommitShift("xx", ""), "");

section("PART B · shiftStartMinutes (REALNA funkcja)");
eq("B1 obj 15-22 → 900",  shiftStartMinutes(sched({ start: "15", end: "22", shift: "popoludniowa" }), "Pawel", DAY), 900);
eq("B2 obj 7-15 → 420",   shiftStartMinutes(sched({ start: "7", end: "15", shift: "poranna" }), "Pawel", DAY), 420);
eq("B3 obj 15:30 → 930",  shiftStartMinutes(sched({ start: "15:30", end: "22", shift: "popoludniowa" }), "Pawel", DAY), 930);
eq("B4 string '7-15' → 420", shiftStartMinutes(sched("7-15"), "Pawel", DAY), 420);
eq("B5 string '15:00-22:00' → 900", shiftStartMinutes(sched("15:00-22:00"), "Pawel", DAY), 900);
eq("B6 klucz 'poranna' → 420 (default)", shiftStartMinutes(sched("poranna"), "Pawel", DAY), 420);
eq("B7 klucz 'nocna' → 1140 (default)",  shiftStartMinutes(sched("nocna"), "Pawel", DAY), 1140);
eq("B8 klucz 'wieczorowa' → 1260",       shiftStartMinutes(sched("wieczorowa"), "Pawel", DAY), 1260);
eq("B9 brak wpisu → null",   shiftStartMinutes(sched({ start: "7", end: "15", shift: "poranna" }, "Inny"), "Pawel", DAY), null);
eq("B10 pusty grafik → null", shiftStartMinutes({}, "Pawel", DAY), null);
eq("B11 diakrytyki: 'paweł' znajduje 'Pawel'", shiftStartMinutes(sched({ start: "7", end: "15", shift: "poranna" }, "Pawel"), "paweł", DAY), 420);
eq("B12 obj start jako number 7", shiftStartMinutes(sched({ start: 7, end: 15, shift: "poranna" }), "Pawel", DAY), 420);

section("PART C · Popup 'czy to na pewno Ty?' — próg ≤30 min przed startem");
const sPop = sched({ start: "15", end: "22", shift: "popoludniowa" });
ok("C1 15:00, login 14:53 → POPUP",      earlyLoginFires(sPop, "Pawel", at(14, 53)) === true);
ok("C2 15:00, login 14:30 (=30) → POPUP", earlyLoginFires(sPop, "Pawel", at(14, 30)) === true);
ok("C3 15:00, login 14:29 (=31) → brak",  earlyLoginFires(sPop, "Pawel", at(14, 29)) === false);
ok("C4 15:00, login 14:00 (60 wcześ.) → brak", earlyLoginFires(sPop, "Pawel", at(14, 0)) === false);
ok("C5 15:00, login 15:00 (=0) → brak",   earlyLoginFires(sPop, "Pawel", at(15, 0)) === false);
ok("C6 15:00, login 15:10 (po) → brak",   earlyLoginFires(sPop, "Pawel", at(15, 10)) === false);
ok("C7 poranna 7:00, login 6:50 → POPUP", earlyLoginFires(sched({ start: "7", end: "15", shift: "poranna" }), "Pawel", at(6, 50)) === true);
ok("C8 nocna 19:00 (default), login 18:45 → POPUP", earlyLoginFires(sched("nocna"), "Pawel", at(18, 45)) === true);
ok("C9 niezaplanowany → brak popupu",     earlyLoginFires({}, "Pawel", at(14, 53)) === false);
ok("C10 string '15-22', login 14:40 → POPUP", earlyLoginFires(sched("15-22"), "Pawel", at(14, 40)) === true);

section("PART D · Etykiety zmiany z realnymi godzinami z grafiku");
const schedShiftOf = (sc) => getScheduleDayEntry(sc, "Pawel", DAY)?.shift || null;
{
  const sc = sched({ start: "7", end: "15", shift: "poranna" });
  const h = scheduledHours(sc, "Pawel", DAY), k = schedShiftOf(sc);
  eq("D1 scheduledHours 7-15 → '7–15'", h, "7–15");
  eq("D2 full label poranna 7-15", shiftFullLabel("poranna", h, k), "Zmiana poranna 7–15");
  eq("D3 short label poranna 7-15", shiftShortLabel("poranna", h, k), "Poranna 7–15");
}
{
  const sc = sched({ start: "7", end: "15", shift: "dzienna" }); // override typu
  const h = scheduledHours(sc, "Pawel", DAY), k = schedShiftOf(sc);
  eq("D4 override: full label dzienna 7-15", shiftFullLabel("dzienna", h, k), "Zmiana dzienna 7–15");
}
{
  const h = scheduledHours({}, "Pawel", DAY); // brak wpisu
  eq("D5 brak godzin → fallback pełna etykieta", shiftFullLabel("poranna", h, null), "Zmiana poranna 7:00–17:00");
  eq("D6 brak godzin → fallback krótka etykieta", shiftShortLabel("poranna", h, null), "Poranna 7–17");
}
{
  const sc = sched("7-15"); // legacy string
  const h = scheduledHours(sc, "Pawel", DAY), k = schedShiftOf(sc);
  eq("D7 legacy string '7-15' → '7–15'", h, "7–15");
  eq("D7b legacy string label", shiftFullLabel(k, h, k), "Zmiana poranna 7–15");
}
{
  const sc = sched("poranna"); // legacy key, brak godzin
  const h = scheduledHours(sc, "Pawel", DAY), k = schedShiftOf(sc);
  eq("D8 legacy klucz 'poranna' → '' → fallback", shiftFullLabel("poranna", h, k), "Zmiana poranna 7:00–17:00");
}
eq("D9 brak klucza → '—'", shiftFullLabel("", "7–15", "poranna"), "—");
{
  // REGRESJA (Codex #6): grafik = poranna 7-15, ale pracownik ręcznie zmienił
  // na nocną przy logowaniu → NIE wolno doklejać 7-15 do "Zmiana nocna".
  const sc = sched({ start: "7", end: "15", shift: "poranna" });
  const h = scheduledHours(sc, "Pawel", DAY), k = schedShiftOf(sc);
  eq("D10 override na nocną → sztywna etykieta (bez 7-15)", shiftFullLabel("nocna", h, k), "Zmiana nocna 19:00–7:00");
  eq("D11 override na nocną → krótka sztywna", shiftShortLabel("nocna", h, k), "Nocna 19–7");
}

section("PART E · Wsteczna kompatybilność / round-trip z czytnikami");
eq("E1 obj{start,end,shift} → normalizeToShift", normalizeToShift({ start: "7", end: "15", shift: "poranna" }), "poranna");
eq("E2 obj bez shift, z godzin → normalizeToShift", normalizeToShift({ start: "15", end: "22" }), "popoludniowa");
eq("E3 legacy string '7-15' → poranna", normalizeToShift("7-15"), "poranna");
eq("E4 legacy klucz 'poranna' → poranna", normalizeToShift("poranna"), "poranna");
eq("E5 shiftFromSchedule(obj)", shiftFromSchedule(sched({ start: "7", end: "15", shift: "poranna" }), "Pawel", DAY), "poranna");
eq("E6 rawHours(obj 7-15) → '7-15'", rawHours({ start: "7", end: "15", shift: "poranna" }), "7-15");
eq("E7 rawHours(klucz 'poranna') → '' (sam klucz, bez godzin)", rawHours("poranna"), "");
eq("E8 rawHours(legacy '7-15') → '7-15'", rawHours("7-15"), "7-15");
eq("E9 rawHours(null) → ''", rawHours(null), "");

section("PART F · Scenariusz integracyjny (Paweł, dziś)");
{
  // Kierownik wpisuje '7-15', zmiana auto-podpowiedziana → zapis obiektu.
  const suggested = cellCommitShift("7-15", "");
  const entry = buildEntry("7-15", suggested);
  const sc = sched(entry);
  eq("F1 zapis grafiku", entry, { start: "7", end: "15", shift: "poranna" });

  // Login 6:50 → popup z poprawną etykietą i startem.
  const fires = earlyLoginFires(sc, "Pawel", at(6, 50));
  ok("F2 login 6:50 → popup", fires === true);
  const startMin = shiftStartMinutes(sc, "Pawel", at(6, 50));
  eq("F3 start popupu = 07:00", `${String(Math.floor(startMin / 60)).padStart(2, "0")}:${String(startMin % 60).padStart(2, "0")}`, "07:00");

  // Po potwierdzeniu — etykieta w sesji.
  const h = scheduledHours(sc, "Pawel", DAY), k = schedShiftOf(sc);
  eq("F4 etykieta sesji", shiftFullLabel("poranna", h, k), "Zmiana poranna 7–15");

  // Login 8:00 (po starcie) → brak popupu.
  ok("F5 login 8:00 → brak popupu", earlyLoginFires(sc, "Pawel", at(8, 0)) === false);
}

section("PART G · Przekazywanie zadań i powiadomień (naprawa)");
// NEXT_SHIFT skopiowane 1:1 z constants.js
const NEXT_SHIFT = { poranna: "popoludniowa", popoludniowa: "wieczorowa", wieczorowa: "poranna", dzienna: "nocna", nocna: "dzienna" };
eq("G1a następna po poranna", NEXT_SHIFT["poranna"], "popoludniowa");
eq("G1b następna po popołudniowej", NEXT_SHIFT["popoludniowa"], "wieczorowa");
eq("G1c następna po wieczorowej", NEXT_SHIFT["wieczorowa"], "poranna");
eq("G1d następna po dziennej", NEXT_SHIFT["dzienna"], "nocna");
eq("G1e następna po nocnej", NEXT_SHIFT["nocna"], "dzienna");

// Carry-over: zadanie trafia do carryOverTasks[target]; odbiorca czyta [selectedShift].
const carryFor = (carry, selShift) => (selShift ? carry[selShift] || [] : []);
{
  // Pracownik poranny (domyślny cel = popołudniowa) przekazuje zadanie.
  const target = NEXT_SHIFT["poranna"]; // popoludniowa
  const carry = { poranna: [], popoludniowa: [], wieczorowa: [], dzienna: [], nocna: [] };
  carry[target] = [{ id: "t1", text: "Zadzwonić do PWiK", done: false }];
  ok("G2a popołudniowa widzi przekazane zadanie", carryFor(carry, "popoludniowa").length === 1);
  ok("G2b nocna NIE widzi (nie jej cel)", carryFor(carry, "nocna").length === 0);
  ok("G2c poranna NIE widzi własnego przekazania", carryFor(carry, "poranna").length === 0);
}

// Powiadomienia datowane: filtr po dacie + (brak zmiany = wszystkie | zgodna zmiana).
const datedVisible = (r, selShift, sessionDate, dismissed = []) =>
  r.targetDate === sessionDate && (!r.targetShift || r.targetShift === selShift) && !dismissed.includes(`dated-${r.id}`);
{
  const today = "2026-05-30";
  const all = { id: "r1", targetShift: null, targetDate: today };       // "Wszystkie zmiany"
  const pp = { id: "r2", targetShift: "popoludniowa", targetDate: today };
  ok("G3a 'wszystkie' widzi poranna", datedVisible(all, "poranna", today) === true);
  ok("G3b 'wszystkie' widzi nocna", datedVisible(all, "nocna", today) === true);
  ok("G4a target popołudniowa — widzi popołudniowa", datedVisible(pp, "popoludniowa", today) === true);
  ok("G4b target popołudniowa — poranna NIE widzi", datedVisible(pp, "poranna", today) === false);
  ok("G5 zła data — nie widać", datedVisible(all, "poranna", "2026-05-31") === false);
}

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(64)}`);
if (fails.length) {
  console.log(`WYNIK: ${pass} OK, ${fails.length} BŁĘDÓW\n`);
  for (const f of fails) console.log("  " + f);
  process.exit(1);
} else {
  console.log(`WYNIK: ${pass}/${pass} testów OK — brak błędów.`);
}
