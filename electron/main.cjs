// ─── electron/main.cjs ───────────────────────────────────────────────────────
// Główny proces Electrona — obsługuje okno aplikacji + auto-aktualizacje
// ─────────────────────────────────────────────────────────────────────────────

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs   = require("fs");
const cp   = require("child_process");
const kwhotel      = require("./kwhotel.cjs");
const hkserver     = require("./hkserver.cjs");
const remoteServer = require("./remoteserver.cjs");

// ─── Reguła zapory dla serwera HK ────────────────────────────────────────────
function ensureFirewallRule() {
  const ruleName = "Panel Recepcji HK Server";
  const port = "3737";
  try {
    const check = cp.execSync(`netsh advfirewall firewall show rule name="${ruleName}"`, { timeout: 3000 }).toString();
    if (check.includes(ruleName)) return;
  } catch (_) {}
  // Otwórz widoczne okno cmd jako Administrator — użytkownik musi zatwierdzić UAC
  const cmd = `netsh advfirewall firewall add rule name="${ruleName}" dir=in action=allow protocol=TCP localport=${port} profile=any && echo OK - regula dodana && pause`;
  cp.exec(
    `powershell -Command "Start-Process cmd -Verb RunAs -ArgumentList '/c ${cmd}'"`,
    (err) => { if (err) console.warn("[Firewall] Błąd:", err.message); }
  );
}

const isDev = !app.isPackaged && process.env.ELECTRON_IS_DEV === 'true';

// ─── Konfiguracja auto-updater ────────────────────────────────────────────────
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.logger = require("electron-log");
autoUpdater.logger.transports.file.level = "info";

let mainWindow = null;

// ─── Tworzenie okna ───────────────────────────────────────────────────────────
function createWindow() {
  // Ścieżka do ikony — opcjonalna (nie crashuje bez niej)
  const iconPath = path.join(__dirname, "../public/icon.ico");
  const iconExists = fs.existsSync(iconPath);

  // Ukryj natywne menu (File / Edit / View)
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Panel Recepcji — Conrad Comfort",
    autoHideMenuBar: true,
    ...(iconExists ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // file:// + Vite ES modules (crossorigin) wymaga wyłączenia webSecurity
      webSecurity: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);

  // Załaduj aplikację
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    // app.getAppPath() jest bardziej niezawodny niż __dirname w spakowanej aplikacji
    const indexPath = path.join(app.getAppPath(), "dist", "index.html");
    mainWindow.loadFile(indexPath).catch(err => {
      autoUpdater.logger.error("loadFile failed:", err);
      dialog.showErrorBox("Błąd ładowania", `Nie można załadować pliku:\n${indexPath}\n\n${err.message}`);
    });
  }

  // Diagnostyka błędów ładowania — widoczna w logu
  mainWindow.webContents.on("did-fail-load", (_evt, code, desc, url) => {
    autoUpdater.logger.error(`did-fail-load [${code}] ${desc} — ${url}`);
  });

  mainWindow.on("closed", () => { mainWindow = null; });
}

// ─── Eventy auto-updater ──────────────────────────────────────────────────────

autoUpdater.on("update-available", (info) => {
  mainWindow?.webContents.send("update-available", {
    version: info.version,
    releaseNotes: info.releaseNotes || "",
    releaseDate: info.releaseDate || "",
  });
});

autoUpdater.on("update-not-available", () => {
  mainWindow?.webContents.send("update-not-available");
});

autoUpdater.on("download-progress", (progress) => {
  mainWindow?.webContents.send("update-progress", {
    percent: Math.round(progress.percent),
    transferred: Math.round(progress.transferred / 1024),
    total: Math.round(progress.total / 1024),
    speed: Math.round(progress.bytesPerSecond / 1024),
  });
});

autoUpdater.on("update-downloaded", () => {
  mainWindow?.webContents.send("update-downloaded");
});

autoUpdater.on("error", (err) => {
  mainWindow?.webContents.send("update-error", err.message);
});

// ─── IPC — komunikacja React ↔ Electron ──────────────────────────────────────

ipcMain.handle("check-for-updates", async () => {
  if (isDev) return { isDev: true };
  try {
    await autoUpdater.checkForUpdates();
    return { checking: true };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle("download-update", () => {
  autoUpdater.downloadUpdate();
});

ipcMain.handle("install-update", () => {
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});

// ─── KWHotel API ──────────────────────────────────────────────────────────────
ipcMain.handle("kwhotel-test",       async (_, { username, password }) => kwhotel.testConnection(username, password));
ipcMain.handle("kwhotel-login",      async (_, { username, password }) => kwhotel.login(username, password));
ipcMain.handle("kwhotel-arrivals",   async (_, { date }) => kwhotel.getArrivals(date));
ipcMain.handle("kwhotel-departures", async (_, { date }) => kwhotel.getDepartures(date));
ipcMain.handle("kwhotel-rooms",      async (_, { date }) => kwhotel.getRoomStatus(date));

// ─── Zapis PDF do dysku ────────────────────────────────────────────────────────
const PDF_DIRS = {
  "raporty dzienne":  "C:\\zmiany i raporty\\raporty dzienne",
  "raporty dobowe":   "C:\\zmiany i raporty\\raporty dobowe",
  "korekty i raporty":"C:\\zmiany i raporty\\korekty i raporty",
  "hk":               "C:\\zmiany i raporty\\hk",
};
ipcMain.handle("save-pdf", async (_, { filename, dataBase64, folder }) => {
  try {
    const dir = PDF_DIRS[folder] || PDF_DIRS["raporty dzienne"];
    fs.mkdirSync(dir, { recursive: true });
    const buf = Buffer.from(dataBase64, "base64");
    fs.writeFileSync(path.join(dir, filename), buf);
    return { ok: true };
  } catch (e) {
    autoUpdater.logger.error("[save-pdf]", e.message);
    return { ok: false, error: e.message };
  }
});

// ─── Remote Server IPC ───────────────────────────────────────────────────────
ipcMain.handle("remote-get-url",    ()          => remoteServer.getUrl());
ipcMain.handle("remote-set-url",    (_, url)    => { remoteServer.setUrl(url); return { ok: true }; });
ipcMain.handle("remote-test",       ()          => remoteServer.testConnection());

// ─── HKServer IPC ─────────────────────────────────────────────────────────────
ipcMain.handle("hk-fix-firewall", () => {
  ensureFirewallRule();
  return { ok: true };
});
ipcMain.handle("hk-get-url",          ()          => hkserver.getBaseURL());
ipcMain.handle("hk-get-ip",           ()          => hkserver.getLocalIP());
ipcMain.handle("hk-get-all-ips",      ()          => hkserver.getAllIPs());
ipcMain.handle("hk-get-qr",           (_, name, overrideIp, baseUrl, pm) => hkserver.getQR(name, overrideIp, baseUrl, pm));
ipcMain.handle("hk-set-assignments",  (_, a, d, t, pm, pmt) => { hkserver.setAssignments(a, d, t, pm, pmt); remoteServer.pushState(hkserver.getState()).catch(()=>{}); return { ok: true }; });
ipcMain.handle("hk-vacate-room",      (_, room)   => { hkserver.vacateRoom(room); remoteServer.pushVacate(room).catch(()=>{}); return { ok: true }; });
ipcMain.handle("hk-get-state",        ()          => hkserver.getState());
ipcMain.handle("hk-reset-day",        (_, date)   => { hkserver.resetDay(date); return { ok: true }; });

// ─── Start aplikacji ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  hkserver.start();
  ensureFirewallRule();
  // Powiadamiaj React o zmianach stanu HK (pokojówka kliknęła "gotowe" itp.)
  hkserver.setOnStateChange((state) => {
    mainWindow?.webContents.send("hk-state-changed", state);
    remoteServer.pushState(state).catch(() => {});
  });

  // Pobieraj stan z Railway co 5s — aktualizuj gdy pracownicy zmieniają status
  remoteServer.startPolling((remoteState) => {
    hkserver.mergeRemoteRooms(remoteState);
  });

  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 5000);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
