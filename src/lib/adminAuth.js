import { STORAGE_KEYS } from "./storage";
import { ADMIN_PASSWORD } from "./constants";

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function hasAdminPassword() {
  return !!localStorage.getItem(STORAGE_KEYS.adminPasswordHash);
}

export function verifyBootstrapPassword(input) {
  const clean = String(input || "").trim();
  return clean.length > 0 && clean === ADMIN_PASSWORD;
}

export async function createManagerPassword(newPassword) {
  const clean = String(newPassword || "").trim();
  if (!clean) return { ok: false, reason: "empty" };
  if (clean.length < 8) return { ok: false, reason: "too_short" };
  const hash = await sha256Hex(clean);
  localStorage.setItem(STORAGE_KEYS.adminPasswordHash, hash);
  return { ok: true };
}

export async function verifyOrCreateAdminPassword(password) {
  const clean = String(password || "").trim();
  if (!clean) return { ok: false, reason: "empty" };
  const savedHash = localStorage.getItem(STORAGE_KEYS.adminPasswordHash) || "";
  const inputHash = await sha256Hex(clean);
  if (!savedHash) {
    if (clean.length < 8) return { ok: false, reason: "too_short" };
    localStorage.setItem(STORAGE_KEYS.adminPasswordHash, inputHash);
    return { ok: true, created: true };
  }
  return inputHash === savedHash ? { ok: true, created: false } : { ok: false, reason: "invalid" };
}
