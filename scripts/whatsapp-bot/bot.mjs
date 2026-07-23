// Bot WhatsApp — wysyłka linku do grafiku (WYKONANIE 4.24).
// KAŻDY hotel ma WŁASNY, dedykowany numer WhatsApp (decyzja usera: osobny numer
// per hotel, nie jeden wspólny bot) — ten serwis utrzymuje więc JEDNĄ sesję
// Baileys PER TENANT, każda z osobnym auth-folderem i osobnym skanem QR na
// dedykowanym telefonie tego hotelu. Numer przypisany do hotelu ustawia
// superadmin w panelu (zakładka „Hotele" → `tenants.whatsapp_number`, patrz
// migracja 0056) — to tylko etykieta do rozpoznania, KTÓRY telefon skanować;
// nie waliduje się, że zeskanowany numer faktycznie się z nią zgadza.
//
// Kolejkę wysyłek (`whatsapp_send_queue`) wypełnia panel.html przy generowaniu
// grafiku. Numery ODBIORCÓW (pracowników) są szyfrowane w `employee_contacts`
// i odszyfrowywane WYŁĄCZNIE po stronie bazy, przez RPC `decrypt_employee_phones`
// ograniczone do klucza service_role — ten skrypt nigdy nie zna ani nie
// przechowuje klucza szyfrującego.
//
// Użycie:
//   node scripts/whatsapp-bot/bot.mjs
// Dla każdego hotelu z ustawionym numerem (i bez zapisanej sesji) pokaże się
// osobny kod QR w terminalu, podpisany nazwą i numerem hotelu — zeskanuj go
// TYM telefonem, na którym zainstalowany jest WhatsApp na TEN numer (WhatsApp →
// Ustawienia → Urządzenia powiązane → Połącz urządzenie). Sesje zapisują się
// w scripts/whatsapp-bot/.auth/<tenant_id>/ (gitignored — aktywne logowania,
// nie mogą trafić do repo).
//
// Wymaga w .env (repo root): VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY.
// Klucz service_role bypassuje RLS — dlatego ten skrypt NIE może trafić
// do żadnego instalatora/paczki dystrybuowanej do hoteli, tylko uruchamiany
// ręcznie/jako usługa przez operatora SaaS.

import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import qrcode from "qrcode";
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../../.env") });

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SB_URL || !SB_KEY) {
  console.error("Brak VITE_SUPABASE_URL / SUPABASE_SERVICE_KEY w .env — bot nie może wystartować.");
  process.exit(1);
}
const sb = createClient(SB_URL, SB_KEY);

const PHONE_BASE_URL = process.env.PHONE_BASE_URL || process.env.VITE_PHONE_BASE_URL
  || "https://grzankatoster-sketch.github.io/hk-phone";
const AUTH_DIR = join(__dirname, ".auth");
const TENANT_RESCAN_MS = 5 * 60_000; // co ile sprawdzać, czy doszedł nowy hotel z numerem
const QUEUE_POLL_MS = 30_000;        // co ile sprawdzać nowe pozycje w kolejce
const SEND_DELAY_MS = 4_000;         // throttling — odstęp między wiadomościami tego samego hotelu

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fmtExpiry(iso) {
  if (!iso) return "bez limitu";
  const d = new Date(iso);
  const pad = (n) => (n < 10 ? "0" + n : "" + n);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Numer wpisany dowolnie (+48 600 000 000, 600-000-000, itp.) → JID WhatsApp.
function toJid(rawPhone) {
  const digits = String(rawPhone).replace(/\D/g, "");
  const withCountry = digits.length === 9 ? "48" + digits : digits;
  return withCountry + "@s.whatsapp.net";
}

// tenant_id -> { sock, ready:boolean, tenantName, tenantNumber }
const sessions = new Map();

async function ensureSession(tenant) {
  if (sessions.has(tenant.id)) return sessions.get(tenant.id);
  const entry = { sock: null, ready: false, tenantName: tenant.name, tenantNumber: tenant.whatsapp_number };
  sessions.set(tenant.id, entry);

  const { state, saveCreds } = await useMultiFileAuthState(join(AUTH_DIR, tenant.id));
  const sock = makeWASocket({ auth: state, printQRInTerminal: false });
  entry.sock = sock;

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log(`\n[${tenant.name} — ${tenant.whatsapp_number}] Zeskanuj TYM telefonem: WhatsApp → Ustawienia → Urządzenia powiązane → Połącz urządzenie:\n`);
      console.log(await qrcode.toString(qr, { type: "terminal", small: true }));
    }
    if (connection === "close") {
      entry.ready = false;
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`[${tenant.name}] Połączenie zamknięte.`, shouldReconnect
        ? "Łączę ponownie…"
        : `Wylogowano — usuń scripts/whatsapp-bot/.auth/${tenant.id}/ i uruchom bota ponownie, żeby zeskanować nowy QR.`);
      sessions.delete(tenant.id);
      if (shouldReconnect) ensureSession(tenant).catch((e) => console.error(`[${tenant.name}] reconnect nie powiódł się:`, e?.message || e));
    } else if (connection === "open") {
      entry.ready = true;
      console.log(`[${tenant.name} — ${tenant.whatsapp_number}] Połączono z WhatsApp.`);
    }
  });
  return entry;
}

// Doładowuje sesje dla hoteli, które mają ustawiony numer, a nie mają jeszcze sesji.
async function refreshTenantSessions() {
  const { data: tenants, error } = await sb.from("tenants").select("id,name,whatsapp_number").not("whatsapp_number", "is", null);
  if (error) { console.error("Odczyt listy hoteli nie powiódł się:", error.message); return; }
  for (const t of tenants || []) {
    if (!sessions.has(t.id)) {
      console.log(`Startuję sesję WhatsApp dla „${t.name}" (${t.whatsapp_number})…`);
      ensureSession(t).catch((e) => console.error(`[${t.name}] start sesji nie powiódł się:`, e?.message || e));
    }
  }
}

async function processQueueOnce() {
  const { data: pending, error } = await sb
    .from("whatsapp_send_queue")
    .select("id,tenant_id,person,token,expires_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) { console.error("Odczyt kolejki nie powiódł się:", error.message); return; }
  if (!pending || !pending.length) return;

  const byTenant = new Map();
  for (const row of pending) {
    if (!byTenant.has(row.tenant_id)) byTenant.set(row.tenant_id, []);
    byTenant.get(row.tenant_id).push(row);
  }

  for (const [tenantId, rows] of byTenant) {
    const session = sessions.get(tenantId);
    if (!session || !session.ready) {
      console.log(`Hotel ${tenantId}: bot jeszcze nie połączony (brak numeru/QR niezeskanowany) — ${rows.length} wiadomości czeka.`);
      continue; // zostają 'pending' do następnego cyklu
    }
    const { data: contacts, error: cErr } = await sb.rpc("decrypt_employee_phones", { p_tenant_id: tenantId });
    if (cErr) { console.error(`[${session.tenantName}] deszyfrowanie kontaktów nie powiodło się:`, cErr.message); continue; }
    const phoneByName = new Map((contacts || []).map((c) => [c.name, c.phone]));

    for (const row of rows) {
      const phone = phoneByName.get(row.person);
      if (!phone) {
        await sb.from("whatsapp_send_queue").update({ status: "skipped", error: "Brak numeru w kontaktach" }).eq("id", row.id);
        continue;
      }
      const url = `${PHONE_BASE_URL}/grafik.html?t=${row.token}`;
      const text = `Dzień dobry! Grafik — ${session.tenantName}.\nLink: ${url}\nAktywny do: ${fmtExpiry(row.expires_at)}.`;
      try {
        await session.sock.sendMessage(toJid(phone), { text });
        await sb.from("whatsapp_send_queue").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", row.id);
        console.log(`[${session.tenantName}] Wysłano do ${row.person}.`);
      } catch (e) {
        await sb.from("whatsapp_send_queue").update({ status: "failed", error: String(e?.message || e) }).eq("id", row.id);
        console.error(`[${session.tenantName}] Błąd wysyłki do ${row.person}:`, e?.message || e);
      }
      await sleep(SEND_DELAY_MS);
    }
  }
}

async function start() {
  await refreshTenantSessions();
  setInterval(() => { refreshTenantSessions().catch((e) => console.error("Odświeżenie listy hoteli nie powiodło się:", e?.message || e)); }, TENANT_RESCAN_MS);
  setInterval(() => { processQueueOnce().catch((e) => console.error("Cykl kolejki nie powiódł się:", e?.message || e)); }, QUEUE_POLL_MS);
  console.log(`Bot wystartował. Sprawdzam nowe hotele co ${TENANT_RESCAN_MS / 60_000} min, kolejkę co ${QUEUE_POLL_MS / 1000} s.`);
}

start().catch((e) => { console.error("Nie udało się uruchomić bota:", e); process.exit(1); });
