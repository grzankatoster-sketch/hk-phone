// Web Push dla telefonów HK (PWA). Wymaga sw.js + manifest w tym samym katalogu.
// VAPID public key — WKLEJ po wygenerowaniu:  npx web-push generate-vapid-keys
// (klucz publiczny NIE jest tajny — trafia do przeglądarek; prywatny → secret Supabase).
const VAPID_PUBLIC_KEY = "BHUrIZx-afbwrPgMmFxwXMBu4pd4TQWFMYyM33Wm2HfEd2mh5OaHxbIN6_wwiaH_4CDoywtdBaoURCBluum49gQ";

// ─── Dodaj do ekranu początkowego (A2HS) ─────────────────────────────────────
// Android: przechwytujemy natywny prompt instalacji, by odpalić go na tap.
// iOS: brak API — pokazujemy instrukcję (Apple nie pozwala odpalić dialogu z kodu).
let __deferredInstall = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); __deferredInstall = e; });
window.addEventListener("appinstalled", () => { const o = document.getElementById("a2hs"); if (o) o.remove(); });

function __isStandalone() {
  return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
}
function __isIos() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function registerSW() {
  if (!("serviceWorker" in navigator)) return null;
  try { return await navigator.serviceWorker.register("sw.js"); }
  catch (e) { console.warn("[push] rejestracja SW nieudana", e); return null; }
}

// Wywoływane na GEST użytkownika (tap przycisku) — wymóg iOS.
async function enablePush({ sb, tenant, worker, role }) {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    alert("Ten telefon nie wspiera powiadomień w przeglądarce.\nNa iPhone: Udostępnij → Dodaj do ekranu początkowego, otwórz z ikony i spróbuj ponownie.");
    return false;
  }
  if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.startsWith("REPLACE")) {
    alert("Powiadomienia nie są jeszcze skonfigurowane (brak klucza VAPID).");
    return false;
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") { alert("Powiadomienia zablokowane — włącz je w ustawieniach przeglądarki."); return false; }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  const j = sub.toJSON();
  const { error } = await sb.from("push_subscriptions").upsert({
    tenant_id: tenant,
    role: role || "hk",
    worker: worker || null,
    endpoint: sub.endpoint,
    p256dh: j.keys.p256dh,
    auth: j.keys.auth,
  }, { onConflict: "endpoint" });
  if (error) { alert("Nie udało się zapisać powiadomień: " + error.message); return false; }
  return true;
}

// Pokazuje pływający przycisk „Włącz powiadomienia", dopóki zgody nie ma.
function mountPushButton(opts) {
  registerSW();
  if (!("Notification" in window)) return;
  if (__isIos() && !__isStandalone()) return; // iOS: najpierw „Dodaj do ekranu" (osobny panel)
  if (Notification.permission === "granted") return;
  const btn = document.createElement("button");
  btn.textContent = "🔔 Włącz powiadomienia";
  btn.style.cssText =
    "position:fixed;bottom:14px;left:50%;transform:translateX(-50%);z-index:998;" +
    "background:#6366f1;color:#fff;border:none;border-radius:999px;padding:11px 18px;" +
    "font-size:14px;font-weight:800;box-shadow:0 6px 24px rgba(0,0,0,.5);font-family:inherit;cursor:pointer";
  btn.onclick = async () => {
    btn.disabled = true;
    const ok = await enablePush(opts);
    if (ok) btn.remove(); else btn.disabled = false;
  };
  document.body.appendChild(btn);
}

// Auto-panel po zeskanowaniu QR: zachęta do dodania do ekranu początkowego.
// Pokazuje się, dopóki aplikacja nie jest uruchomiona „z ikony" (standalone).
function mountInstallPrompt() {
  registerSW();
  if (__isStandalone()) return;                 // już dodane → nic nie pokazuj
  if (document.getElementById("a2hs")) return;  // już widoczne

  const ios = __isIos();
  const steps = ios
    ? `<div style="font-size:14.5px;line-height:1.6;color:#e6edf3">
         Aby dostawać <b>powiadomienia na ekran blokady</b>:
         <ol style="margin:10px 0 0 18px;padding:0">
           <li>Otwórz tę stronę w <b>Safari</b> (nie Chrome ani Edge — na iPhone tylko Safari to potrafi)</li>
           <li>Tapnij ikonę <b>Udostępnij</b> (kwadracik ze strzałką — na dole ekranu lub przy pasku adresu)</li>
           <li>Przewiń listę i wybierz <b>„Dodaj do ekranu początkowego"</b></li>
           <li>Otwórz aplikację z <b>nowej ikony</b> i włącz powiadomienia</li>
         </ol>
         <div style="font-size:12px;color:#8a93a3;margin-top:8px">Nie widzisz „Dodaj do ekranu początkowego"? To znak, że nie jesteś w Safari.</div>
       </div>`
    : `<div style="font-size:14.5px;line-height:1.6;color:#e6edf3">
         Dodaj aplikację do telefonu, aby dostawać <b>powiadomienia o zadaniach</b> — także na ekran blokady.
       </div>`;

  const wrap = document.createElement("div");
  wrap.id = "a2hs";
  wrap.style.cssText = "position:fixed;inset:0;z-index:1001;background:rgba(0,0,0,.7);display:flex;align-items:flex-end;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
  wrap.innerHTML = `
    <div style="background:#161b22;border:1px solid #30363d;border-top-left-radius:18px;border-top-right-radius:18px;padding:20px 18px;padding-bottom:calc(20px + env(safe-area-inset-bottom));width:100%;max-width:520px;box-shadow:0 -10px 40px rgba(0,0,0,.5)">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <img src="icon.svg" width="34" height="34" style="border-radius:8px"/>
        <div style="font-size:16px;font-weight:800;color:#fff;flex:1">Dodaj do ekranu początkowego</div>
        <button id="a2hs-x" style="background:none;border:none;color:#8b949e;font-size:24px;line-height:1;cursor:pointer;padding:0 4px">×</button>
      </div>
      ${steps}
      <div style="display:flex;gap:8px;margin-top:16px">
        ${ios ? "" : `<button id="a2hs-go" style="flex:1;background:#6366f1;color:#fff;border:none;border-radius:10px;padding:12px;font-size:14px;font-weight:800;cursor:pointer">Dodaj teraz</button>`}
        <button id="a2hs-later" style="${ios ? "flex:1;" : ""}background:#21262d;color:#8b949e;border:1px solid #30363d;border-radius:10px;padding:12px;font-size:14px;font-weight:700;cursor:pointer">Później</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  const close = () => wrap.remove();
  wrap.querySelector("#a2hs-x").onclick = close;
  wrap.querySelector("#a2hs-later").onclick = close;
  const go = wrap.querySelector("#a2hs-go");
  if (go) go.onclick = async () => {
    if (__deferredInstall) {
      __deferredInstall.prompt();
      await __deferredInstall.userChoice.catch(() => {});
      __deferredInstall = null;
      close();
    } else {
      go.textContent = "Menu przeglądarki ⋮ → „Zainstaluj / Dodaj do ekranu głównego”";
    }
  };
}
