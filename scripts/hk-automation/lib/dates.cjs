function pad(n) {
  return String(n).padStart(2, "0");
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localNoon(dateKey) {
  return new Date(`${dateKey}T12:00:00`);
}

function addDays(dateKey, days) {
  const d = localNoon(dateKey);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

function todayKey() {
  return toDateKey(new Date());
}

function diffDays(fromKey, toKey) {
  const a = localNoon(fromKey);
  const b = localNoon(toKey);
  return Math.round((b - a) / 86400000);
}

function compareDateKeys(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function parseDateToken(token, fallbackYear = new Date().getFullYear()) {
  const s = String(token || "").trim();
  let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = s.match(/^(\d{1,2})[-./](\d{1,2})$/);
  if (m) return `${fallbackYear}-${pad(m[2])}-${pad(m[1])}`;
  return null;
}

function enumerateDateKeys(startKey, daysAhead) {
  const out = [];
  for (let i = 0; i <= daysAhead; i += 1) out.push(addDays(startKey, i));
  return out;
}

function enumerateDateRange(startKey, endKey, maxDays = 45) {
  if (!startKey || !endKey) return [];
  const out = [];
  let current = startKey;
  for (let i = 0; i < maxDays && compareDateKeys(current, endKey) <= 0; i += 1) {
    out.push(current);
    current = addDays(current, 1);
  }
  return out;
}

module.exports = { addDays, compareDateKeys, diffDays, enumerateDateKeys, enumerateDateRange, parseDateToken, todayKey, toDateKey };
