// Offline sync buffer — kolejkuje operacje Supabase gdy brak sieci,
// flushuje automatycznie po powrocie online.
// Użycie: enqueue({ table, method, data }) → flushAll() wywoływane auto przez listener.

import { STORAGE_KEYS } from "./storage";

const QUEUE_KEY = STORAGE_KEYS.syncQueue;

function loadQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; }
}

function saveQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
}

// Po tylu nieudanych próbach flush porzucamy operację (op „trujący" — np. odrzut RLS,
// nie przejściowy offline) — żeby kolejka nie rosła w nieskończoność.
const MAX_ATTEMPTS = 5;

// dedupeKey (opcjonalnie): operacje snapshotowe (np. panel_mirror per kind) zastępują
// poprzednią zakolejkowaną tego samego rodzaju — kolejka pozostaje ograniczona, a i tak
// liczy się tylko ostatni stan (upsert idempotentny).
export function enqueue(op, dedupeKey) {
  let q = loadQueue();
  if (dedupeKey) q = q.filter((o) => o._dedupe !== dedupeKey);
  q.push({ ...op, _dedupe: dedupeKey || undefined, attempts: 0, queuedAt: new Date().toISOString() });
  saveQueue(q);
}

export function queueSize() {
  return loadQueue().length;
}

export async function flushAll(supabase) {
  const q = loadQueue();
  if (!q.length) return { flushed: 0, errors: 0 };
  const remaining = [];
  let flushed = 0;
  let errors = 0;
  for (const op of q) {
    try {
      if (op.method === "upsert") {
        const { error } = await supabase.from(op.table).upsert(op.data, op.options || {});
        if (error) throw error;
      } else if (op.method === "insert") {
        const { error } = await supabase.from(op.table).insert(op.data);
        if (error) throw error;
      } else if (op.method === "update") {
        const { error } = await supabase.from(op.table).update(op.data).match(op.match || {});
        if (error) throw error;
      } else if (op.method === "delete") {
        const { error } = await supabase.from(op.table).delete().match(op.match || {});
        if (error) throw error;
      }
      flushed++;
    } catch {
      errors++;
      const attempts = (op.attempts || 0) + 1;
      if (attempts < MAX_ATTEMPTS) remaining.push({ ...op, attempts });
      // po MAX_ATTEMPTS porzucamy op (trujący) — nie wraca do kolejki
    }
  }
  saveQueue(remaining);
  return { flushed, errors };
}

export function initSyncQueueListener(supabase) {
  window.addEventListener("online", () => flushAll(supabase));
  if (navigator.onLine) flushAll(supabase);
}
