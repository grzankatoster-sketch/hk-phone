// ─── electron-superadmin/main.cjs ────────────────────────────────────────────
// „GuestSage Operator" — cienki natywny shell Electron owijający kokpit właściciela
// SaaS (public/hk-phone/superadmin.html). Ten sam wzorzec co electron-manager/main.cjs
// (GuestSage Kierownik): NIE re-bundluje niczego, ładuje wdrożoną stronę przez loadURL.
// Prywatne narzędzie właściciela — bez auto-update, bez publikacji releases.
const { app, BrowserWindow, shell } = require("electron");

const SUPERADMIN_URL =
  process.env.SUPERADMIN_URL ||
  "https://grzankatoster-sketch.github.io/hk-phone/superadmin.html";

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 800,
    minWidth: 640,
    minHeight: 560,
    title: "GuestSage Operator",
    backgroundColor: "#12141a",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.removeMenu();
  mainWindow.loadURL(SUPERADMIN_URL).catch(() => {
    mainWindow.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          "<body style='font-family:sans-serif;padding:40px;color:#e8eaf0;background:#12141a'>" +
            "<h2>Brak połączenia z panelem</h2>" +
            "<p>Sprawdź internet i uruchom aplikację ponownie.</p></body>"
        )
    );
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
