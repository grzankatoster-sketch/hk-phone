// Format / sanitize helpers extracted from App.jsx — Etap A refaktor (mini-step 3).
// pl()  — sanitize PL chars + quotes for jsPDF (Latin-1 only).
// plR() — only normalize dashes + Polish quotes (keeps PL diacritics).
// normTask() — normalize task entries (string or object).
// buildShiftFn() / buildEmpFn() — PDF filename builders.

export const pl = (s) => {
  if (s == null) return "";
  let t = String(s);
  // Polskie litery - unicode escapes (bezpieczne przy kompilacji)
  const M = [["ą", "a"], ["Ą", "A"], ["ć", "c"], ["Ć", "C"],
            ["ę", "e"], ["Ę", "E"], ["ł", "l"], ["Ł", "L"],
            ["ń", "n"], ["Ń", "N"], ["ó", "o"], ["Ó", "O"],
            ["ś", "s"], ["Ś", "S"], ["ź", "z"], ["Ź", "Z"],
            ["ż", "z"], ["Ż", "Z"], ["–", "-"], ["—", "-"],
            ["„", '"'], ["“", '"'], ["”", '"'], ["­", ""],
            [" ", " "], ["’", "'"], ["‘", "'"],
            ["✓", "[OK]"], ["✗", "[X]"], ["•", "-"],
            ["⏳", "..."], ["⚠", "!"]];
  for (const [k, v] of M) t = t.split(k).join(v);
  // Bezpiecznik: zamien wszystko powyzej U+00FF na ?
  let out = "";
  for (let i = 0; i < t.length; i++) { out += t.charCodeAt(i) <= 0xFF ? t[i] : "?"; }
  return out;
};

export const plR = (s) => String(s ?? "").replace(/[—–]/g, "-").replace(/[„“”]/g, '"');

export const normTask = (task, fb) =>
  typeof task === "string"
    ? { id: fb || crypto.randomUUID(), text: task, scheduledTime: "", urgent: false, weekdaysOnly: false }
    : { id: task?.id || fb || crypto.randomUUID(), text: task?.text || "", scheduledTime: task?.scheduledTime || "", urgent: task?.urgent || false, weekdaysOnly: task?.weekdaysOnly || false };

export const buildShiftFn = (shift, date = new Date()) => {
  const d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return `raport_${shift}_${d}.pdf`;
};

export const buildEmpFn = (author, date = new Date()) => {
  const d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return `raport_pracownika_${author.replace(/\s+/g, "_")}_${d}.pdf`;
};
