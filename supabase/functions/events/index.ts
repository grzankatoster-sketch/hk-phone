// Edge Function `events` — proxy Ticketmaster Discovery API (WYKONANIE 4.21).
// Ukrywa TICKETMASTER_API_KEY (ustaw: supabase secrets set TICKETMASTER_API_KEY=...).
// Zwraca { byDate: { "YYYY-MM-DD": { boost, label, count } } } dla wydarzeń w Krakowie.
// Duże/liczne wydarzenia → wyższy boost (sufit ceny). Brak klucza → { byDate: {} } (cichy).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const KEY = Deno.env.get("TICKETMASTER_API_KEY");
  if (!KEY) return json({ byDate: {}, note: "no_api_key" });

  let from = "", to = "";
  try { ({ from = "", to = "" } = await req.json()); } catch { /* puste ciało */ }
  const today = new Date().toISOString().slice(0, 10);
  const start = (from || today) + "T00:00:00Z";
  const end = (to || today) + "T23:59:59Z";

  const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${KEY}` +
    `&city=Krak%C3%B3w&countryCode=PL&startDateTime=${start}&endDateTime=${end}&size=100&sort=date,asc`;

  let events: any[] = [];
  try {
    const r = await fetch(url);
    if (!r.ok) return json({ byDate: {}, note: "upstream_" + r.status });
    events = (await r.json())?._embedded?.events ?? [];
  } catch (e) {
    return json({ byDate: {}, note: "unreachable", detail: String(e) });
  }

  // Grupuj po dacie: liczba wydarzeń + największa nazwa; segment koncert/sport → mocniej.
  const byDate: Record<string, { boost: number; label: string; count: number }> = {};
  for (const ev of events) {
    const date = ev?.dates?.start?.localDate;
    if (!date) continue;
    const seg = ev?.classifications?.[0]?.segment?.name || "";
    const strong = /Music|Sports/i.test(seg);
    const cur = byDate[date] || { boost: 1, count: 0, label: ev?.name || "wydarzenie" };
    cur.count += 1;
    // baza 1.10, +0.03 za koncert/sport, +0.02 za kolejne wydarzenie, sufit 1.20
    cur.boost = Math.min(1.20, Math.max(cur.boost, 1.10 + (strong ? 0.03 : 0) + (cur.count - 1) * 0.02));
    if ((ev?.name || "").length > (cur.label || "").length) cur.label = ev.name;
    byDate[date] = cur;
  }
  return json({ byDate });
});
