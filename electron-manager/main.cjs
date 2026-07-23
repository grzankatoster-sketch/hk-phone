// ─── electron-manager/main.cjs ───────────────────────────────────────────────
// „GuestSage Kierownik" — cienki natywny shell Electron owijający istniejący panel
// menedżerski (public/hk-phone/panel.html, web-app na Supabase). NIE re-bundluje
// Reacta recepcji; ładuje wdrożony panel przez loadURL i pozwala kierownikowi
// zalogować się bez przeglądarki i bez dostępu do komputera recepcji. WYKONANIE 2.16.
//
// Tenant/branding rozwiązywane w runtime przez sam panel po zalogowaniu (fabryka
// wersji — 2.7); tu jest tylko okno. Adres panelu konfigurowalny (VITE_PANEL_URL).
const { app, BrowserWindow, shell } = require("electron");

const PANEL_URL =
  process.env.VITE_PANEL_URL ||
  "https://grzankatoster-sketch.github.io/hk-phone/panel.html";

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "GuestSage Kierownik",
    backgroundColor: "#faf8f5",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.removeMenu();
  mainWindow.loadURL(PANEL_URL).catch(() => {
    mainWindow.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          "<body style='font-family:sans-serif;padding:40px;color:#5a1d4a'>" +
            "<h2>Brak połączenia z panelem</h2>" +
            "<p>Sprawdź internet i uruchom aplikację ponownie.</p></body>"
        )
    );
  });

  // Linki zewnętrzne (np. do dokumentów) otwieraj w przeglądarce, nie w oknie appki.
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
