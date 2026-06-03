import { normalizeToShift } from "./excel";

export const fmt = (date = new Date()) => date.toLocaleString("pl-PL");

export const fmtA = (date = new Date()) =>
  date.toLocaleString("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export const todayKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const monthKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

// Auto-detect shift from login hour.
// poranna 7-17, popoludniowa 14-23, nocna 19-7, wieczorowa 21-7
export function autoDetectShift(now = new Date()) {
  const h = now.getHours();
  if (h >= 5 && h < 13) return "poranna";
  if (h >= 13 && h < 17) return "popoludniowa";
  if (h >= 17 && h < 20) return "nocna";
  return "wieczorowa";
}

// Parse "YYYY-MM-DD" in local time.
export const parseDayKey = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const normalizeScheduleEmployeeName = (name) =>
  String(name || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    // Unicode NFD nie rozk\u0142ada polskiego "\u0142"/"\u0141" \u2014 mapujemy r\u0119cznie, by
    // dopasowanie nazwisk (np. "Pawe\u0142" \u2194 "pawel") dzia\u0142a\u0142o jak dla \u0105/\u0107/\u0119/\u2026
    .replace(/\u0142/g, "l");

// Returns the raw schedule entry for a worker on a given day.
// Name lookup ignores case and Polish diacritics.
export function getScheduleDayEntry(schedule, empName, date = new Date()) {
  if (!schedule || !empName) return null;
  const daySchedule = schedule[todayKey(date)];
  if (!daySchedule || typeof daySchedule !== "object") return null;

  if (Object.prototype.hasOwnProperty.call(daySchedule, empName)) {
    const raw = daySchedule[empName];
    return { employeeKey: empName, raw, shift: normalizeToShift(raw) };
  }

  const normalizedTarget = normalizeScheduleEmployeeName(empName);
  let matchedKey = Object.keys(daySchedule).find(
    (key) => normalizeScheduleEmployeeName(key) === normalizedTarget,
  );

  // Fallback: dopasuj po PIERWSZYM imieniu, gdy w grafiku jest "Imię Nazwisko",
  // a logowanie to samo "Imię" (lub odwrotnie). Inaczej godziny z grafiku nie są
  // czytane i wpada sztywna etykieta zmiany (np. 14:00–23:00 zamiast 14–22).
  if (!matchedKey) {
    const targetFirst = normalizedTarget.split(" ")[0];
    if (targetFirst) {
      const firstMatches = Object.keys(daySchedule).filter(
        (key) => normalizeScheduleEmployeeName(key).split(" ")[0] === targetFirst,
      );
      // tylko gdy jednoznaczne (jedna osoba o tym imieniu w grafiku) — bez kolizji
      if (firstMatches.length === 1) matchedKey = firstMatches[0];
    }
  }
  if (!matchedKey) return null;

  const raw = daySchedule[matchedKey];
  return { employeeKey: matchedKey, raw, shift: normalizeToShift(raw) };
}

// Returns the canonical shift key assigned to a worker for a given day.
export function shiftFromSchedule(schedule, empName, date = new Date()) {
  return getScheduleDayEntry(schedule, empName, date)?.shift || null;
}

// Default start minute (from midnight) per shift, used only when the manager
// did not enter explicit hours in the schedule.
const SHIFT_START_MIN = Object.freeze({
  poranna: 7 * 60,
  popoludniowa: 14 * 60,
  wieczorowa: 21 * 60,
  dzienna: 7 * 60,
  nocna: 19 * 60,
});

// Extracts the start time (minutes from midnight) from a raw schedule entry,
// reading explicit hours first (object {start} or "15-22" / "15:30-22" string).
function parseStartMinutes(raw) {
  let startStr = null;
  if (raw && typeof raw === "object") {
    startStr = raw.start ?? raw.startTime ?? raw.start_time ?? raw.from ?? raw.from_time ?? null;
  } else if (typeof raw === "string") {
    const m = raw.match(/(\d{1,2})(?:[:.,](\d{2}))?\s*[-–—]/);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + (m[2] ? parseInt(m[2], 10) : 0);
  }
  if (startStr === null || startStr === undefined || startStr === "") return null;
  const sm = String(startStr).match(/(\d{1,2})(?:[:.,](\d{2}))?/);
  if (!sm) return null;
  return parseInt(sm[1], 10) * 60 + (sm[2] ? parseInt(sm[2], 10) : 0);
}

// Returns the scheduled shift start for a worker on a given day, as minutes from
// midnight. Prefers the manager's explicit hours, falls back to the shift's
// default start. Returns null when the worker is not scheduled that day.
export function shiftStartMinutes(schedule, empName, date = new Date()) {
  const entry = getScheduleDayEntry(schedule, empName, date);
  if (!entry) return null;
  const fromRaw = parseStartMinutes(entry.raw);
  if (fromRaw !== null) return fromRaw;
  return entry.shift ? (SHIFT_START_MIN[entry.shift] ?? null) : null;
}
