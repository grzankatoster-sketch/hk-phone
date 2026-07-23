import { describe, it, expect, beforeEach } from "vitest";

// syncQueue.js używa globalnego localStorage — w env 'node' go nie ma, więc
// wstrzykujemy prosty in-memory mock PRZED importem modułu.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

const { enqueue, queueSize, flushAll } = await import("../src/lib/syncQueue.js");

// Mock klienta Supabase: sterowany `mode` ("ok" | "fail") na wywołanie upsert.
function mockSupabase(mode) {
  const calls = [];
  const result = () => (mode() === "fail" ? { error: new Error("offline") } : { error: null });
  return {
    calls,
    from: (table) => ({
      upsert: async (data, options) => { calls.push({ table, method: "upsert", data, options }); return result(); },
      insert: async (data) => { calls.push({ table, method: "insert", data }); return result(); },
    }),
  };
}

describe("syncQueue — bufor offline (WYKONANIE 1.5)", () => {
  beforeEach(() => store.clear());

  it("enqueue dodaje operację do kolejki", () => {
    enqueue({ table: "panel_mirror", method: "upsert", data: { a: 1 } });
    expect(queueSize()).toBe(1);
  });

  it("dedupeKey zastępuje poprzednią operację tego samego rodzaju (kolejka ograniczona)", () => {
    enqueue({ table: "panel_mirror", method: "upsert", data: { v: 1 } }, "panel_mirror:cash_state");
    enqueue({ table: "panel_mirror", method: "upsert", data: { v: 2 } }, "panel_mirror:cash_state");
    expect(queueSize()).toBe(1);
  });

  it("flushAll wysyła zakolejkowane operacje gdy sieć wraca i czyści kolejkę", async () => {
    enqueue({ table: "panel_mirror", method: "upsert", data: { v: 9 }, options: { onConflict: "tenant_id,kind" } });
    const sb = mockSupabase(() => "ok");
    const res = await flushAll(sb);
    expect(res.flushed).toBe(1);
    expect(res.errors).toBe(0);
    expect(queueSize()).toBe(0);
    expect(sb.calls[0]).toMatchObject({ table: "panel_mirror", method: "upsert", data: { v: 9 } });
  });

  it("nieudany flush zostawia operację w kolejce; kolejny udany ją wysyła", async () => {
    enqueue({ table: "panel_mirror", method: "upsert", data: { v: 1 } });
    const fail = await flushAll(mockSupabase(() => "fail"));
    expect(fail.errors).toBe(1);
    expect(queueSize()).toBe(1); // op wraca do kolejki
    const ok = await flushAll(mockSupabase(() => "ok"));
    expect(ok.flushed).toBe(1);
    expect(queueSize()).toBe(0);
  });

  it("operacja trująca jest porzucana po MAX_ATTEMPTS (kolejka nie rośnie w nieskończoność)", async () => {
    enqueue({ table: "panel_mirror", method: "upsert", data: { v: 1 } });
    const sb = mockSupabase(() => "fail");
    for (let i = 0; i < 5; i++) await flushAll(sb);
    expect(queueSize()).toBe(0); // porzucona po 5 nieudanych próbach
  });
});
