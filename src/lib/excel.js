// Excel import/export for reception schedule. Uses xlsx (already in package.json).
// Schedule data shape: { [dateKey: "YYYY-MM-DD"]: { [employeeName]: shiftKey | null } }

import * as XLSX from "xlsx";

export const SHIFT_CODE = Object.freeze({
  poranna: "P",
  popoludniowa: "PP",
  wieczorowa: "W",
  dzienna: "D",
  nocna: "N",
});

export const CODE_TO_SHIFT = Object.freeze({
  p: "poranna",
  pp: "popoludniowa",
  w: "wieczorowa",
  d: "dzienna",
  n: "nocna",
});

function normalizeHourText(value) {
  if (value === null || value === undefined || value === "") return "";
  return String(value).trim();
}

function shiftFromObject(raw) {
  if (!raw || typeof raw !== "object") return null;
  const direct =
    raw.shift ??
    raw.shiftKey ??
    raw.shift_key ??
    raw.value ??
    raw.code ??
    raw.label ??
    raw.name ??
    null;
  const directShift = direct && normalizeToShift(direct);
  if (directShift) return directShift;

  const start =
    raw.start ??
    raw.startTime ??
    raw.start_time ??
    raw.from ??
    raw.from_time ??
    null;
  const end =
    raw.end ??
    raw.endTime ??
    raw.end_time ??
    raw.to ??
    raw.to_time ??
    null;
  if (start || end) {
    return parseHoursToShift(`${normalizeHourText(start)}-${normalizeHourText(end)}`);
  }
  return null;
}

function displayRawScheduleValue(raw) {
  if (!raw || typeof raw !== "object") return raw || "";
  const start = raw.start ?? raw.startTime ?? raw.start_time ?? raw.from ?? raw.from_time;
  const end = raw.end ?? raw.endTime ?? raw.end_time ?? raw.to ?? raw.to_time;
  if (start || end) return [start, end].filter(Boolean).join("-");
  const direct = raw.shift ?? raw.shiftKey ?? raw.shift_key ?? raw.value ?? raw.code ?? raw.label ?? raw.name;
  return direct ? String(direct) : "";
}

// Converts any stored value (shift key, shift code, object, or hours like "7-15") to a canonical shift key or null.
export function normalizeToShift(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return shiftFromObject(raw);
  const s = String(raw).trim();
  const sl = s.toLowerCase();
  if (SHIFT_CODE[sl]) return sl;
  if (CODE_TO_SHIFT[sl]) return CODE_TO_SHIFT[sl];
  const namedShift = Object.keys(SHIFT_CODE).find((key) => sl.includes(key));
  if (namedShift) return namedShift;
  return parseHoursToShift(s);
}

const DAY_PL = ["Pon", "Wt", "Sr", "Cz", "Pt", "Sb", "Nd"];

export function weekMonday(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}

export function weekDays(monday) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function exportScheduleXlsx(monday, schedule, employees) {
  const days = weekDays(monday);
  const headers = ["Pracownik", ...days.map((d, i) => `${DAY_PL[i]} ${dateKey(d)}`)];

  const rows = employees.map(emp => [
    emp,
    ...days.map(d => {
      const raw = schedule[dateKey(d)]?.[emp];
      if (!raw) return "";
      const shiftKey = normalizeToShift(raw);
      return shiftKey ? (SHIFT_CODE[shiftKey] || shiftKey) : displayRawScheduleValue(raw);
    }),
  ]);

  const legend = [
    "Kody: P=poranna 7-15 | PP=popoludniowa 15-22 | W=wieczorowa 22-7 | D=dzienna 7-19 | N=nocna 19-7",
    ...Array(7).fill(""),
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows, [], legend]);
  ws["!cols"] = [{ wch: 18 }, ...Array(7).fill({ wch: 16 })];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Grafik");
  XLSX.writeFile(wb, `grafik_${dateKey(monday)}.xlsx`);
}

export function parseHoursToShift(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/(\d{1,2})(?:[:.,]\d{2})?\s*[-\u2013\u2014]\s*(\d{1,2})(?:[:.,]\d{2})?/);
  if (!m) return null;
  const startH = parseInt(m[1], 10);
  const endH   = parseInt(m[2], 10);
  if (startH === 7 || startH === 8) return endH >= 18 ? "dzienna" : "poranna";
  if (startH === 14 || startH === 15 || startH === 16) return "popoludniowa";
  if (startH === 21 || startH === 22 || startH === 23 || startH === 0 || startH === 1) return "wieczorowa";
  if (startH === 19 || startH === 20) return "nocna";
  return null;
}

// Surowa siatka arkusza (wiersze) — dla AI-odczytu, gdy format jest niestandardowy.
export function readScheduleGrid(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }));
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error("Blad odczytu pliku"));
    reader.readAsArrayBuffer(file);
  });
}

export function importScheduleXlsx(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (rows.length < 2) { reject(new Error("Pusty plik")); return; }

        const headers = rows[0];
        const dateCols = headers.slice(1).map(h => {
          const m = String(h).match(/(\d{4}-\d{2}-\d{2})/);
          return m ? m[1] : null;
        });

        const result = {};
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const emp = String(row[0] || "").trim();
          if (!emp || emp.length > 40) continue;
          for (let j = 0; j < dateCols.length; j++) {
            const dk = dateCols[j];
            if (!dk) continue;
            const code = String(row[j + 1] || "").trim().toLowerCase();
            if (!code) continue;
            const shift = CODE_TO_SHIFT[code]
              || Object.keys(SHIFT_CODE).find(k => k.startsWith(code))
              || parseHoursToShift(row[j + 1])
              || null;
            if (shift) {
              if (!result[dk]) result[dk] = {};
              result[dk][emp] = shift;
            }
          }
        }
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Blad odczytu pliku"));
    reader.readAsArrayBuffer(file);
  });
}
