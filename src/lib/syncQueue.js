// Offline sync buffer — kolejkuje operacje Supabase gdy brak sieci,
// flushuje automatycznie po powrocie online.
// Użycie: enqueue({ table, method, data }) → flushAll() wywoływane auto przez listener.

const QUEUE_KEY = "reception-sync-queue";

function loadQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; }
}

function saveQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
}

export function enqueue(op) {
  const q = loadQueue();
  q.push({ ...op, queuedAt: new Date().toISOString() });
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
      remaining.push(op);
    }
  }
  saveQueue(remaining);
  return { flushed, errors };
}

export function initSyncQueueListener(supabase) {
  window.addEventListener("online", () => flushAll(supabase));
  if (navigator.onLine) flushAll(supabase);
}
