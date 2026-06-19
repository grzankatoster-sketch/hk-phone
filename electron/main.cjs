// Copyright © 2026 Conrad Comfort. All rights reserved. UNLICENSED.
// ─── electron/main.cjs ───────────────────────────────────────────────────────
const { app, BrowserWindow, ipcMain, dialog, Menu, Notification } = require("electron");
const { autoUpdater } = require("electron-updater");
const path    = require("path");
const fs      = require("fs");
const QRCode  = require("qrcode");
const cp      = require("child_process");

// ─── .env (NIGDY nie pakowany do instalatora) ─────────────────────────────────
// Sekrety (np. haslo IMAP automatyzacji HK) NIE sa dolaczane do publicznego
// instalatora. W dev czytamy z katalogu projektu. Na maszynie ktora faktycznie
// uruchamia automatyzacje, administrator recznie kladzie plik .env obok exe
// (folder instalacji) — wtedy zostaje wczytany lokalnie, bez wycieku do builda.
try {
  const envCandidates = [
    path.join(__dirname, "..", ".env"),
    process.execPath ? path.join(path.dirname(process.execPath), ".env") : null,
  ].filter(Boolean);
  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      require("dotenv").config({ path: envPath });
      break;
    }
  }
} catch (_) { /* dotenv jest opcjonalny w dev bez .env */ }

const kwhotel      = require("./kwhotel.cjs");
const hkserver     = require("./hkserver.cjs");
const hkAutomation = require("./hkAutomation.cjs");
const { fetchBookingReviews } = require("./bookingReviews.cjs");

const APP_CREATOR = "grzankatoster-sketch";
const APP_COPYRIGHT = "Copyright © 2026 Conrad Comfort. Wszelkie prawa zastrzeżone.";

function sanitizePdfFilename(filename) {
  const base    = path.basename(String(filename || "raport.pdf"));
  const cleaned = base.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, " ").trim();
  return (cleaned || "raport.pdf").replace(/\.pdf$/i, "") + ".pdf";
}

const isDev = !app.isPackaged && process.env.ELECTRON_IS_DEV === "true";

if (isDev) app.commandLine.appendSwitch("disable-http-cache");

autoUpdater.autoDownload        = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.logger              = require("electron-log");
autoUpdater.logger.transports.file.level = "info";

let mainWindow = null;
let updateDownloadInProgress = false;
let updateDownloaded = false;

function sendUpdateEvent(channel, payload) {
  mainWindow?.webContents.send(channel, payload);
}

function toUpdateInfo(info = {}) {
  return {
    version: info.version || "",
    currentVersion: app.getVersion(),
    releaseNotes: info.releaseNotes || "",
    releaseDate: info.releaseDate || "",
  };
}

function ensureFirewallRule() {
  const ruleName = "Panel Recepcji HK Server";
  const port = "3737";
  try {
    const check = cp.execSync(`netsh advfirewall firewall show rule name="${ruleName}"`, { timeout: 3000 }).toString();
    if (check.includes(ruleName)) return;
  } catch (_) {}
  const cmd = `netsh advfirewall firewall add rule name="${ruleName}" dir=in action=allow protocol=TCP localport=${port} profile=any && echo OK - regula dodana && pause`;
  cp.exec(
    `powershell -Command "Start-Process cmd -Verb RunAs -ArgumentList '/c ${cmd}'"`,
    (err) => { if (err) autoUpdater.logger.warn("[Firewall]", err.message); },
  );
}

function createWindow() {
  const iconPath   = path.join(__dirname, "../public/icon.ico");
  const iconExists = fs.existsSync(iconPath);
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    title: "Panel Recepcji — Conrad Comfort",
    autoHideMenuBar: true,
    ...(iconExists ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);

  if (isDev) {
    mainWindow.webContents.session.clearCache().then(() => {
      mainWindow.loadURL("http://localhost:5173");
    });
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(app.getAppPath(), "dist", "index.html");
    mainWindow.loadFile(indexPath).catch(err => {
      autoUpdater.logger.error("loadFile failed:", err);
      dialog.showErrorBox("Błąd ładowania", `Nie można załadować:\n${indexPath}\n\n${err.message}`);
    });
  }

  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    autoUpdater.logger.error(`did-fail-load [${code}] ${desc} — ${url}`);
  });
  mainWindow.on("closed", () => { mainWindow = null; });
}

// ─── Auto-updater events ──────────────────────────────────────────────────────
autoUpdater.on("update-available", (info) => {
  updateDownloaded = false;
  sendUpdateEvent("update-available", toUpdateInfo(info));
});
autoUpdater.on("update-not-available", () => sendUpdateEvent("update-not-available"));
autoUpdater.on("download-progress", (progress) => sendUpdateEvent("update-progress", {
  percent: Math.round(progress.percent || 0),
  transferred: Math.round((progress.transferred || 0) / 1024),
  total: Math.round((progress.total || 0) / 1024),
  speed: Math.round((progress.bytesPerSecond || 0) / 1024),
}));
autoUpdater.on("update-downloaded", (info) => {
  updateDownloadInProgress = false;
  updateDownloaded = true;
  sendUpdateEvent("update-downloaded", toUpdateInfo(info));
});
autoUpdater.on("error", (err) => {
  updateDownloadInProgress = false;
  sendUpdateEvent("update-error", err.message);
});

// ─── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.handle("check-for-updates", async () => {
  if (isDev) return { isDev: true };
  try { await autoUpdater.checkForUpdates(); return { checking: true }; }
  catch (e) { return { error: e.message }; }
});
ipcMain.handle("download-update", async () => {
  if (isDev) return { isDev: true };
  if (updateDownloaded) return { downloaded: true };
  if (updateDownloadInProgress) return { downloading: true };
  updateDownloadInProgress = true;
  try {
    await autoUpdater.downloadUpdate();
    return { downloaded: true };
  } catch (e) {
    updateDownloadInProgress = false;
    return { error: e.message };
  }
});
ipcMain.handle("install-update", () => {
  if (!updateDownloaded) return { error: "Aktualizacja nie została jeszcze pobrana." };
  autoUpdater.quitAndInstall(true, true);
  return { installing: true };
});
ipcMain.handle("get-app-version",  () => app.getVersion());
ipcMain.handle("get-app-info",  () => ({
  name: app.getName(),
  version: app.getVersion(),
  creator: APP_CREATOR,
  copyright: APP_COPYRIGHT,
}));
const BOOKING_CACHE_PATH = path.join(app.getPath("userData"), ".hk-booking-cache.json");
ipcMain.handle("booking-reviews-sync", async () => {
  try {
    const result = await fetchBookingReviews();
    if (result?.ok && Array.isArray(result.reviews) && result.reviews.length > 0) {
      try {
        fs.writeFileSync(BOOKING_CACHE_PATH, JSON.stringify({ savedAt: new Date().toISOString(), reviews: result.reviews }, null, 2), "utf8");
      } catch (writeErr) {
        autoUpdater.logger.warn("[booking-reviews-sync] cache write failed:", writeErr.message);
      }
    }
    return result;
  } catch (e) {
    autoUpdater.logger.error("[booking-reviews-sync]", e.message);
    let cachedReviews = [];
    try {
      if (fs.existsSync(BOOKING_CACHE_PATH)) {
        const cached = JSON.parse(fs.readFileSync(BOOKING_CACHE_PATH, "utf8"));
        if (Array.isArray(cached?.reviews)) cachedReviews = cached.reviews;
      }
    } catch {}
    return { ok: false, reviews: cachedReviews, error: e.message, fromCache: cachedReviews.length > 0 };
  }
});

// KWHotel API
ipcMain.handle("kwhotel-test",       async (_, { username, password }) => kwhotel.testConnection(username, password));
ipcMain.handle("kwhotel-login",      async (_, { username, password }) => kwhotel.login(username, password));
ipcMain.handle("kwhotel-arrivals",   async (_, { date }) => kwhotel.getArrivals(date));
ipcMain.handle("kwhotel-departures", async (_, { date }) => kwhotel.getDepartures(date));
ipcMain.handle("kwhotel-rooms",      async (_, { date }) => kwhotel.getRoomStatus(date));

// HK Live Server
ipcMain.handle("hk-fix-firewall", () => {
  ensureFirewallRule();
  return { ok: true };
});
ipcMain.handle("hk-get-url", () => hkserver.getBaseURL());
ipcMain.handle("hk-get-ip", () => hkserver.getLocalIP());
ipcMain.handle("hk-get-all-ips", () => hkserver.getAllIPs());
ipcMain.handle("hk-set-assignments", (_, assignments, date, roomTypes, pmAssignments, pmRoomTypes) => {
  hkserver.setAssignments(assignments, date, roomTypes, pmAssignments, pmRoomTypes);
  return { ok: true };
});
ipcMain.handle("hk-vacate-room", (_, room) => {
  hkserver.vacateRoom(room);
  return { ok: true };
});
ipcMain.handle("hk-get-state", () => hkserver.getState());
ipcMain.handle("hk-reset-day", (_, date) => { hkserver.resetDay(date); return { ok: true }; });

// ─── Zapis PDF ────────────────────────────────────────────────────────────────
const PDF_DIRS = {
  "raporty dzienne":   "C:\\zmiany i raporty\\raporty dzienne",
  "raporty dobowe":    "C:\\zmiany i raporty\\raporty dobowe",
  "korekty i raporty": "C:\\zmiany i raporty\\korekty i raporty",
  "hk":                "C:\\zmiany i raporty\\hk",
};
ipcMain.handle("save-pdf", async (_, { filename, dataBase64, folder }) => {
  try {
    const dir = PDF_DIRS[folder] || PDF_DIRS["raporty dzienne"];
    fs.mkdirSync(dir, { recursive: true });
    if (!/^[A-Za-z0-9+/=]+$/.test(String(dataBase64 || ""))) throw new Error("Nieprawidłowy payload PDF");
    const buf = Buffer.from(dataBase64, "base64");
    if (buf.length < 4 || buf.slice(0, 4).toString("latin1") !== "%PDF") throw new Error("Nieprawidłowy plik PDF");
    fs.writeFileSync(path.join(dir, sanitizePdfFilename(filename)), buf);
    return { ok: true };
  } catch (e) {
    autoUpdater.logger.error("[save-pdf]", e.message);
    return { ok: false, error: e.message };
  }
});

// ─── QR kody (Supabase Storage) ───────────────────────────────────────────────
// Automatyczne plany HK z KWHotel
const HK_AUTOMATION_DIR = process.env.HK_AUTOMATION_DIR || "C:\\zmiany i raporty\\hk-automation";
const isDateKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
ipcMain.handle("hk-automation-get-plan", async (_, dateKey) => {
  try {
    if (!isDateKey(dateKey)) return { ok: false, error: "Nieprawidlowa data." };
    const filePath = path.join(HK_AUTOMATION_DIR, "plans", `hk-plan-${dateKey}.json`);
    if (!fs.existsSync(filePath)) return { ok: true, plan: null };
    const plan = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!plan || plan.meta?.source !== "kwhotel-mail" || !plan.data || typeof plan.data !== "object") {
      return { ok: false, error: "Nieprawidlowy format planu HK." };
    }
    return { ok: true, plan };
  } catch (e) {
    autoUpdater.logger.error("[hk-automation-get-plan]", e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("hk-automation-get-source", async (_, dateKey) => {
  try {
    if (!isDateKey(dateKey)) return { ok: false, error: "Nieprawidlowa data." };
    const filePath = path.join(HK_AUTOMATION_DIR, "sources", `kwhotel-source-${dateKey}.json`);
    if (!fs.existsSync(filePath)) return { ok: true, source: null };
    const source = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!source || source.source !== "kwhotel-mail-source" || typeof source !== "object") {
      return { ok: false, error: "Nieprawidlowy format zrodla HK." };
    }
    return { ok: true, source };
  } catch (e) {
    autoUpdater.logger.error("[hk-automation-get-source]", e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("hk-get-qr", async (_, name, overrideIp, baseUrl, pm) => {
  return hkserver.getQR(name, overrideIp, baseUrl, pm);
});

// HK Automation (wbudowany serwis IMAP → plany)
ipcMain.handle("hk-automation-status",  () => hkAutomation.getStatus());
ipcMain.handle("hk-automation-run-now", () => hkAutomation.runNow());
// Jednorazowy zapis hasla IMAP (szyfrowany w userData, przezywa auto-update).
// Po zapisie od razu odpalamy cykl, zeby menedzer widzial efekt bez czekania.
ipcMain.handle("hk-automation-set-password", async (_, password) => {
  const res = hkAutomation.setStoredPassword(password);
  if (res.ok && password) hkAutomation.runNow().catch(() => {});
  return res;
});

ipcMain.handle("hk-get-konserwator-qr", async (_, name, faults) => {
  const safeName = String(name || "").slice(0, 60);
  hkserver.setKonserwatorFaults(safeName, faults);
  // QR prowadzi na wdrożoną stronę konserwacji (Supabase/GitHub Pages), nie na
  // lokalny serwer LAN — dzięki temu działa z każdego telefonu, nie tylko z sieci hotelu.
  const KONS_BASE = process.env.VITE_KONSERWACJA_URL || "https://grzankatoster-sketch.github.io/hk-phone/konserwacja.html";
  const url = `${KONS_BASE}?k=${encodeURIComponent(safeName)}`;
  try {
    const dataURL = await QRCode.toDataURL(url, { width: 280, margin: 2, color: { dark: "#000000", light: "#ffffff" } });
    return { dataURL, url };
  } catch (e) {
    return { dataURL: null, url, error: e.message };
  }
});

// ─── Powiadomienia natywne Windows (agent AI / prośby HK) ─────────────────────
// AppUserModelId jest wymagany, by Windows pokazywał natywne toasty z poprawną
// nazwą/ikoną (zwłaszcza w buildzie). Ustawiamy stałe ID producenta.
const APP_USER_MODEL_ID = "com.conradcomfort.panelrecepcji";

ipcMain.handle("notify", (_e, payload = {}) => {
  try {
    if (!Notification.isSupported()) return false;
    const n = new Notification({
      title: String(payload.title || "Panel Recepcji"),
      body:  String(payload.body || ""),
      silent: false,
    });
    n.on("click", () => {
      if (!mainWindow) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      try { mainWindow.flashFrame(false); } catch (_) {}
      mainWindow.webContents.send("agent-navigate", payload.nav || "hk-monitor");
    });
    n.show();
    // Miganie paska zadań, gdy okno nie jest aktywne.
    if (mainWindow && !mainWindow.isFocused()) {
      try { mainWindow.flashFrame(true); } catch (_) {}
    }
    return true;
  } catch (err) {
    autoUpdater.logger?.warn?.("[notify]", err.message);
    return false;
  }
});

ipcMain.handle("focus-window", () => {
  if (!mainWindow) return false;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  try { mainWindow.flashFrame(false); } catch (_) {}
  return true;
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  try { app.setAppUserModelId(APP_USER_MODEL_ID); } catch (_) {}
  if (app.isPackaged) {
    autoUpdater.logger.info(`[START] ${app.getName()} v${app.getVersion()} | ${APP_COPYRIGHT}`);
  }
  createWindow();
  hkserver.start();
  ensureFirewallRule();
  hkserver.setOnStateChange((state) => {
    mainWindow?.webContents.send("hk-state-changed", state);
  });
  hkAutomation.start();
  if (!isDev) setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
