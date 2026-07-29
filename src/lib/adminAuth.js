import { STORAGE_KEYS } from "./storage";
import { TENANT_ID } from "./constants";
import { supabase } from "./supabase";

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function hasAdminPassword() {
  return !!localStorage.getItem(STORAGE_KEYS.adminPasswordHash);
}

// Haslo bootstrap (brama do ustawienia WLASNEGO hasla kierownika) nie jest juz
// zaszyte w bundlu (WYKONANIE 0.2) — porownanie robi RPC po stronie Supabase,
// zwraca tylko true/false, hash nigdy nie trafia do klienta.
export async function verifyBootstrapPassword(input) {
  const clean = String(input || "").trim();
  if (!clean || !supabase || !TENANT_ID) return false;
  const { data, error } = await supabase.rpc("verify_admin_bootstrap", {
    p_tenant_id: TENANT_ID, p_candidate: clean,
  });
  return !error && data === true;
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
