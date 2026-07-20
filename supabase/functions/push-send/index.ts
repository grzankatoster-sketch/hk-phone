// Supabase Edge Function: `push-send`
// Wysyła Web Push (VAPID) na telefony HK / konserwacji. Wyzwalana przez
// Database Webhook na INSERT do `hk_tasks` / `faults` / (opcjonalnie) `hk_plan`.
//
// Deploy:
//   npx web-push generate-vapid-keys           # raz — daje PUBLIC i PRIVATE
//   supabase secrets set VAPID_PUBLIC_KEY=...   # ten sam PUBLIC co w push.js
//   supabase secrets set VAPID_PRIVATE_KEY=...  # PRIVATE — tajny, tylko tutaj
//   supabase secrets set VAPID_SUBJECT=mailto:recepcja@twojhotel.pl
//   supabase functions deploy push-send --no-verify-jwt
//
// Uwaga: --no-verify-jwt, bo wywołuje ją webhook bazy (nie zalogowany użytkownik).
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:recepcja@example.com";
const TENANT_ID     = Deno.env.get("TENANT_ID") || "00000000-0000-0000-0000-000000000001";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

const sbHeaders = { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` };

// Imię do porównań: bez wielkości liter i tylko pierwszy człon, żeby
// "Anna Kowalska" (plan z maila) pasowało do "Anna" (QR ?w=) i odwrotnie.
const firstName = (n?: string | null) => (n || "").trim().toLowerCase().split(/\s+/)[0];

async function getSubs(role: string, worker?: string | null) {
  // Zawsze pobieramy całą rolę i — gdy podano osobę — filtrujemy po imieniu w JS.
  // (Dokładne worker=eq. nie radziło sobie z różnym zapisem imienia → spam do wszystkich.)
  const url = `${SUPABASE_URL}/rest/v1/push_subscriptions?role=eq.${role}&tenant_id=eq.${TENANT_ID}&select=*`;
  const r = await fetch(url, { headers: sbHeaders });
  const all = r.ok ? await r.json() : [];
  if (!worker) return all;
  const want = firstName(worker);
  return all.filter((s: any) => firstName(s.worker) === want);
}

// Gdy wiersz pokoju nie niesie przypisanej osoby (worker=null), dociągamy ją
// z planu dnia: hk_plan.assignments / pm_assignments to mapy { imię: [pokoje] }.
async function findWorkerForRoom(date?: string | null, room?: string | null) {
  if (!date || !room) return null;
  const url = `${SUPABASE_URL}/rest/v1/hk_plan?date=eq.${date}&select=assignments,pm_assignments`;
  const r = await fetch(url, { headers: sbHeaders });
  const rows = r.ok ? await r.json() : [];
  const plan = rows?.[0];
  if (!plan) return null;
  for (const map of [plan.assignments, plan.pm_assignments]) {
    for (const [w, rooms] of Object.entries(map || {})) {
      if (Array.isArray(rooms) && rooms.map(String).includes(String(room))) return w;
    }
  }
  return null;
}

async function deleteSub(endpoint: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
    method: "DELETE", headers: sbHeaders,
  }).catch(() => {});
}

// ─── Web Push do jednej roli / osoby (wspólny wysyłacz) ───────────────────────
async function sendPush(
  { role, worker, title, message, url, tag }:
  { role: string; worker?: string | null; title: string; message: string; url: string; tag?: string },
) {
  const subs = await getSubs(role, worker);
  const payload = JSON.stringify({ title, body: message, url, tag: tag || "manual" });
  let sent = 0, gone = 0;
  await Promise.all(subs.map(async (s: any) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      sent++;
    } catch (e: any) {
      const code = e?.statusCode;
      if (code === 404 || code === 410) { await deleteSub(s.endpoint); gone++; }
    }
  }));
  return { matched: subs.length, sent, gone };
}

// ─── REST helpery dla losowej kontroli pokoi ─────────────────────────────────
async function sbGet(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders });
  return r.ok ? await r.json() : [];
}
async function sbInsert(table: string, row: Record<string, unknown>) {
  return fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...sbHeaders, "content-type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(row),
  }).catch(() => null);
}

// Lista osób pracujących danego dnia: najpierw obsada (hk_roster), a gdy pusta —
// klucze przypisań z planu (hk_plan.assignments / pm_assignments).
async function rosterNames(date: string): Promise<string[]> {
  const rows = await sbGet(`hk_roster?tenant_id=eq.${TENANT_ID}&date=eq.${date}&select=roster`);
  const list = (rows?.[0]?.roster) || [];
  const names = list
    .map((p: any) => (p && p.name) || (typeof p === "string" ? p : null))
    .filter(Boolean) as string[];
  if (names.length) return names;
  const plan = await sbGet(`hk_plan?date=eq.${date}&select=assignments,pm_assignments`);
  const p = plan?.[0] || {};
  return [...new Set([...Object.keys(p.assignments || {}), ...Object.keys(p.pm_assignments || {})])];
}

// Prawdopodobieństwo, że ukończony pokój w trybie losowym uruchomi kontrolę —
// żeby kontrole rozkładały się w ciągu dnia, a nie szły zawsze na 4 pierwsze.
const QC_PROBABILITY = 0.5;

// Po ukończeniu pokoju (status → 'czyste') wylosuj osobę do kontroli i powiadom.
// Zwraca Response gdy kontrola powstała, albo null gdy nie (idziemy w skip).
async function maybeQualityCheck(rec: any): Promise<Response | null> {
  const date = rec?.date, room = rec?.room, cleaner = rec?.worker || null;
  if (!date || !room) return null;

  const cfg = (await sbGet(`hk_qc_settings?tenant_id=eq.${TENANT_ID}&select=*`))?.[0];
  if (!cfg || cfg.enabled === false) return null;
  const limit = cfg.daily_limit ?? 4;
  const items = Array.isArray(cfg.items) ? cfg.items : [];

  const today = await sbGet(`hk_quality_checks?tenant_id=eq.${TENANT_ID}&date=eq.${date}&select=target_worker`);
  if ((today || []).length >= limit) return null;
  const usedToday = new Set((today || []).map((c: any) => firstName(c.target_worker)));

  let target: string | null = null;
  if (cfg.mode === "person") {
    if (!cfg.chosen_person || usedToday.has(firstName(cfg.chosen_person))) return null; // już dziś dostała
    target = cfg.chosen_person;
  } else {
    if (Math.random() > QC_PROBABILITY) return null;
    const pool = (await rosterNames(date))
      .filter((n) => firstName(n) !== firstName(cleaner) && !usedToday.has(firstName(n)));
    if (!pool.length) return null;
    target = pool[Math.floor(Math.random() * pool.length)];
  }

  await sbInsert("hk_quality_checks", {
    tenant_id: TENANT_ID, date, room: String(room), cleaned_by: cleaner,
    target_worker: target, status: "pending",
    items: items.map((q: string) => ({ q, checked: false })),
  });

  const res = await sendPush({
    role: "hk", worker: target,
    title: "Kontrola pokoju",
    message: `Sprawdź pokój ${room}${cleaner ? " po " + firstName(cleaner) : ""} — przeklikaj checklistę`,
    url: "./index.html", tag: "qc-" + room,
  });
  console.log("[push-send] qc", JSON.stringify({ room, target, ...res }));
  return new Response(JSON.stringify({ qc: { target, room, ...res } }), {
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  if (!VAPID_PRIVATE) return new Response(JSON.stringify({ error: "vapid_missing" }), { status: 500 });

  let body: any;
  try { body = await req.json(); } catch { return new Response("bad_json", { status: 400 }); }

  // Webhook bazy: { type, table, record, old_record }. Obsługujemy też ręczne wywołanie.
  const table = body?.table ?? body?.payload?.table ?? "";
  const rec   = body?.record ?? body?.payload ?? {};
  const old   = body?.old_record ?? {};

  // Pokój DOPIERO co ukończony (status → 'czyste') → ewentualna losowa kontrola.
  if (table === "hk_rooms" && rec?.status === "czyste" && old?.status !== "czyste") {
    const qc = await maybeQualityCheck(rec);
    if (qc) return qc;
    return new Response(JSON.stringify({ skip: true, qc: "none" }), { headers: { "content-type": "application/json" } });
  }

  let role = "hk", title = "Powiadomienie", message = "", url = "./index.html";
  let worker: string | null = null; // gdy ustawione → powiadom tylko tę osobę
  if (table === "hk_tasks") {
    role = "hk"; title = "Nowe zadanie";
    message = rec.text || "Recepcja dodała zadanie"; url = "./index.html";
    // target: "all"/"morning"/"pm"/"duty_pm" → grupa (powiadamiamy wszystkich HK,
    // bo edge nie zna planu); inna wartość = imię konkretnej osoby → tylko ona.
    const grp = ["all", "morning", "pm", "duty_pm", ""].includes(rec.target ?? "");
    worker = grp ? null : (rec.target || null);
  } else if (table === "hk_rooms") {
    // Powiadom tylko gdy pokój DOPIERO co został zwolniony (vacated false→true),
    // a nie przy każdej zmianie statusu (start/koniec sprzątania itp.).
    if (!(rec.vacated === true && old?.vacated !== true)) {
      return new Response(JSON.stringify({ skip: true }), { headers: { "content-type": "application/json" } });
    }
    role = "hk"; title = "Pokój zwolniony";
    message = `Pokój ${rec.room} jest wolny — można sprzątać`;
    url = "./index.html";
    // worker z wiersza, a gdy pusty — dociągnij z planu dnia (kto ma ten pokój).
    worker = rec.worker || await findWorkerForRoom(rec.date, rec.room);
  } else if (table === "faults") {
    role = "konserwacja"; url = "./konserwacja.html";
    const evt = body?.type ?? body?.payload?.type ?? "";
    const loc = rec.room || rec.space_id || "";
    const descr = rec.description || "";
    if (evt === "UPDATE") {
      // Eskalacja SLA: escalated_at DOPIERO co ustawione (usterka po terminie). Powiadom
      // całą konserwację (po terminie = ważne, ma dotrzeć). Inne update'y (status itp.) pomijamy.
      if (rec.escalated_at && !old?.escalated_at) {
        title = "⏰ Usterka po terminie";
        message = `${loc} — ${descr}`.trim().replace(/^—\s*/, "") || "Usterka przekroczyła termin naprawy";
        body.tag = "sla-" + (rec.id || loc);   // tag per usterka — nie nadpisuje innych powiadomień
      } else {
        return new Response(JSON.stringify({ skip: true }), { headers: { "content-type": "application/json" } });
      }
    } else {
      // INSERT — nowa usterka (dotychczasowe zachowanie: cała konserwacja).
      title = "Nowa usterka";
      message = `${loc} — ${descr}`.trim().replace(/^—\s*/, "");
    }
  } else if (table === "hk_plan") {
    role = "hk"; title = "Zmiana przypisania";
    message = "Recepcja zaktualizowała plan sprzątania"; url = "./index.html";
  } else if (table === "hk_reminders") {
    // Nowe przypomnienie kierownika HK → powiadom całą ekipę (każdy musi przeklikać w apce).
    if (rec?.active === false) {
      return new Response(JSON.stringify({ skip: true }), { headers: { "content-type": "application/json" } });
    }
    role = "hk"; title = "Nowe przypomnienie";
    message = rec?.body || "Kierownik HK dodał przypomnienie"; url = "./index.html";
  } else if (body?.title) {
    // Ręczne wywołanie: { title, body, role, url, worker }
    // worker (opcjonalnie) → powiadom tylko tę osobę (dopasowanie po imieniu w getSubs);
    // brak worker → cała rola (np. wszyscy HK). Używane przez recepcję dla „!" (pilne / pytanie o status).
    role = body.role || "hk"; title = body.title; message = body.body || ""; url = body.url || url;
    worker = body.worker || null;
  } else {
    return new Response(JSON.stringify({ skip: true }), { headers: { "content-type": "application/json" } });
  }

  // Gdy worker ustawiony → tylko ta osoba (dopasowanie po imieniu w getSubs).
  // BEZ fallbacku do wszystkich: to on powodował, że pokój/zadanie jednej osoby
  // buczało u całej ekipy. Brak dopasowania = nie spamujemy pozostałych.
  // tag grupuje powiadomienia: ten sam tag → telefon ZASTĘPUJE poprzednie (renotify).
  // Ręczne wywołania (pilne/pytanie o status) podają własny unikalny tag, by się nie nadpisywały.
  const { matched, sent, gone } = await sendPush({
    role, worker, title, message, url, tag: body?.tag || table || "manual",
  });
  console.log("[push-send]", JSON.stringify({ table, role, worker, target: rec?.target ?? null, matched }));

  return new Response(JSON.stringify({ role, sent, gone }), { headers: { "content-type": "application/json" } });
});
