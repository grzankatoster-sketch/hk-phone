const MANUAL_NAME_ALIASES = Object.freeze({
  pawel: "Paweł",
});

export function normalizeNameKey(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function canonicalizePersonName(value) {
  const raw = String(value || "");
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  const alias = MANUAL_NAME_ALIASES[normalizeNameKey(trimmed)];
  if (alias) return alias;
  return trimmed.charAt(0).toLocaleUpperCase("pl-PL") + trimmed.slice(1);
}

export function canonicalizeNameInput(value) {
  const raw = String(value || "");
  const trimmed = raw.trim();
  const alias = MANUAL_NAME_ALIASES[normalizeNameKey(trimmed)];
  if (alias) return alias;
  return raw.charAt(0).toLocaleUpperCase("pl-PL") + raw.slice(1);
}

export function getCanonicalManagerName(value, managers) {
  const key = normalizeNameKey(value);
  return (managers || []).find(manager => normalizeNameKey(manager) === key) || "";
}

export function isManagerName(value, managers) {
  return !!getCanonicalManagerName(value, managers);
}
