// Bot WhatsApp — wysyłka linku do grafiku (WYKONANIE 4.24).
// Jeden wspólny serwis MULTI-TENANT: jedna sesja WhatsApp (numer dedykowany
// „bot", NIE prywatny numer pracownika) obsługuje wszystkie hotele. Czyta
// kolejkę `whatsapp_send_queue` (wypełnianą przez panel.html przy generowaniu
// grafiku) i numery z `employee_contacts` (odszyfrowywane WYŁĄCZNIE po stronie
// bazy, przez RPC `decrypt_employee_phones` ograniczone do klucza service_role
// — ten skrypt nigdy nie zna ani nie przechowuje klucza szyfrującego).
//
// Użycie:
//   node scripts/whatsapp-bot/bot.mjs
// Pierwsze uruchomienie pokaże kod QR w terminalu — zeskanuj go telefonem
// z zainstalowanym WhatsAppem na numerze „bota" (WhatsApp → Ustawienia →
// Urządzenia powiązane → Połącz urządzenie). Sesja zapisuje się w
// scripts/whatsapp-bot/.auth/ (gitignored — to jest aktywne logowanie,
// nie może trafić do repo).
//
// Wymaga w .env (repo root): VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY
// (ten sam klucz co inne skrypty administracyjne — scripts/sync-hk-plans-to-supabase.mjs).
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
const POLL_MS = 30_000;   // co ile sprawdzać nowe pozycje w kolejce
const SEND_DELAY_MS = 4_000; // throttling — odstęp między wiadomościami (ryzyko spamu przy wielu hotelach naraz)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fmtExpiry(iso) {
  if (!iso) return "bez limitu";
  const d = new Date(iso);
  const pad = (n) => (n < 10 ? "0" + n : "" + n);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Numer wpisany dowolnie (+48 600 000 000, 600-000-000, itp.) → JID WhatsApp.
// Zakłada polski numer (9 cyfr) bez kierunkowego = dokłada 48. Numer z kierunkowym
// zostaje bez zmian (wpisujący podaje pełny format międzynarodowy).
function toJid(rawPhone) {
  const digits = String(rawPhone).replace(/\D/g, "");
  const withCountry = digits.length === 9 ? "48" + digits : digits;
  return withCountry + "@s.whatsapp.net";
}

async function processQueueOnce(sock) {
  const { data: pending, error } = await sb
    .from("whatsapp_send_queue")
    .select("id,tenant_id,person,token,expires_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) { console.error("Odczyt kolejki nie powiódł się:", error.message); return; }
  if (!pending || !pending.length) return;

  // Grupuj po tenancie, żeby nie odpytywać nazwy hotelu/kontaktów osobno per wiadomość.
  const byTenant = new Map();
  for (const row of pending) {
    if (!byTenant.has(row.tenant_id)) byTenant.set(row.tenant_id, []);
    byTenant.get(row.tenant_id).push(row);
  }

  for (const [tenantId, rows] of byTenant) {
    const { data: tenant } = await sb.from("tenants").select("name").eq("id", tenantId).maybeSingle();
    const hotelName = tenant?.name || "Twój hotel";
    const { data: contacts, error: cErr } = await sb.rpc("decrypt_employee_phones", { p_tenant_id: tenantId });
    if (cErr) { console.error("Deszyfrowanie kontaktów nie powiodło się:", cErr.message); continue; }
    const phoneByName = new Map((contacts || []).map((c) => [c.name, c.phone]));

    for (const row of rows) {
      const phone = phoneByName.get(row.person);
      if (!phone) {
        await sb.from("whatsapp_send_queue").update({ status: "skipped", error: "Brak numeru w kontaktach" }).eq("id", row.id);
        continue;
      }
      const url = `${PHONE_BASE_URL}/grafik.html?t=${row.token}`;
      const text = `Dzień dobry! Grafik — ${hotelName}.\nLink: ${url}\nAktywny do: ${fmtExpiry(row.expires_at)}.`;
      try {
        await sock.sendMessage(toJid(phone), { text });
        await sb.from("whatsapp_send_queue").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", row.id);
        console.log(`Wysłano do ${row.person} (${hotelName}).`);
      } catch (e) {
        await sb.from("whatsapp_send_queue").update({ status: "failed", error: String(e?.message || e) }).eq("id", row.id);
        console.error(`Błąd wysyłki do ${row.person}:`, e?.message || e);
      }
      await sleep(SEND_DELAY_MS); // throttling — patrz nagłówek pliku
    }
  }
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const sock = makeWASocket({ auth: state, printQRInTerminal: false });

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log("\nZeskanuj ten kod w WhatsApp → Ustawienia → Urządzenia powiązane → Połącz urządzenie:\n");
      console.log(await qrcode.toString(qr, { type: "terminal", small: true }));
    }
    if (connection === "close") {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log("Połączenie zamknięte.", shouldReconnect ? "Łączę ponownie…" : "Wylogowano — usuń scripts/whatsapp-bot/.auth/ i uruchom ponownie, żeby zeskanować nowy QR.");
      if (shouldReconnect) start();
    } else if (connection === "open") {
      console.log("Połączono z WhatsApp. Bot działa — sprawdzam kolejkę co", POLL_MS / 1000, "s.");
    }
  });

  setInterval(() => { processQueueOnce(sock).catch((e) => console.error("Cykl kolejki nie powiódł się:", e?.message || e)); }, POLL_MS);
}

start().catch((e) => { console.error("Nie udało się uruchomić bota:", e); process.exit(1); });
