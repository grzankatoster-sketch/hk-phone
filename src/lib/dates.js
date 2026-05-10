// Date / shift helpers extracted from App.jsx — Etap A refaktor (mini-step 3).

export const fmt = (date = new Date()) => date.toLocaleString("pl-PL");

export const fmtA = (date = new Date()) =>
  date.toLocaleString("pl-PL", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

export const todayKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const monthKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

// Auto-wykrywanie zmiany na podstawie godziny komputera
export function autoDetectShift(now = new Date()) {
  const h = now.getHours();
  if (h >= 7 && h < 15) return "poranna";
  if (h >= 15 && h < 22) return "popoludniowa";
  return "wieczorowa"; // 22-7
}
