// ─── electron/preload.cjs ────────────────────────────────────────────────────
// Most między procesem głównym (Electron) a renderującym (React)
// React może wywoływać tylko te funkcje — nic więcej
// ─────────────────────────────────────────────────────────────────────────────

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Aktualizacje
  checkForUpdates:  ()  => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate:   ()  => ipcRenderer.invoke("download-update"),
  installUpdate:    ()  => ipcRenderer.invoke("install-update"),
  getAppVersion:    ()  => ipcRenderer.invoke("get-app-version"),

  // Nasłuchuj eventów z main.cjs
  onUpdateAvailable:    (cb) => ipcRenderer.on("update-available",     (_, data) => cb(data)),
  onUpdateNotAvailable: (cb) => ipcRenderer.on("update-not-available", ()        => cb()),
  onUpdateProgress:     (cb) => ipcRenderer.on("update-progress",      (_, data) => cb(data)),
  onUpdateDownloaded:   (cb) => ipcRenderer.on("update-downloaded",    ()        => cb()),
  onUpdateError:        (cb) => ipcRenderer.on("update-error",         (_, msg)  => cb(msg)),

  // Usuń nasłuchiwacze (ważne przy unmount komponentu)
  removeUpdateListeners: () => {
    ipcRenderer.removeAllListeners("update-available");
    ipcRenderer.removeAllListeners("update-not-available");
    ipcRenderer.removeAllListeners("update-progress");
    ipcRenderer.removeAllListeners("update-downloaded");
    ipcRenderer.removeAllListeners("update-error");
  },

  // Zapis PDF na dysk
  savePdf: (filename, dataBase64, folder) => ipcRenderer.invoke("save-pdf", { filename, dataBase64, folder }),

  // Remote Server
  remoteGetUrl:   ()         => ipcRenderer.invoke("remote-get-url"),
  remoteSetUrl:   (url)      => ipcRenderer.invoke("remote-set-url", url),
  remoteTest:     ()         => ipcRenderer.invoke("remote-test"),

  // HK Live Server
  hkFixFirewall:     ()          => ipcRenderer.invoke("hk-fix-firewall"),
  hkGetUrl:          ()          => ipcRenderer.invoke("hk-get-url"),
  hkGetIp:           ()          => ipcRenderer.invoke("hk-get-ip"),
  hkGetAllIps:       ()          => ipcRenderer.invoke("hk-get-all-ips"),
  hkGetQr:           (name, ip, baseUrl, pm) => ipcRenderer.invoke("hk-get-qr", name, ip, baseUrl, pm),
  hkSetAssignments:  (a, d, t, pm, pmt) => ipcRenderer.invoke("hk-set-assignments", a, d, t, pm, pmt),
  hkVacateRoom:      (room)      => ipcRenderer.invoke("hk-vacate-room",      room),
  hkGetState:        ()          => ipcRenderer.invoke("hk-get-state"),
  hkResetDay:        (date)      => ipcRenderer.invoke("hk-reset-day",        date),
  onHkStateChanged:  (cb)        => ipcRenderer.on("hk-state-changed", (_, s) => cb(s)),
  removeHkListeners: ()          => ipcRenderer.removeAllListeners("hk-state-changed"),

  // KWHotel API (wywołania przez główny proces — bez CORS)
  kwhotelTest:       (creds)        => ipcRenderer.invoke("kwhotel-test",       creds),
  kwhotelLogin:      (creds)        => ipcRenderer.invoke("kwhotel-login",      creds),
  kwhotelArrivals:   ({ date })     => ipcRenderer.invoke("kwhotel-arrivals",   { date }),
  kwhotelDepartures: ({ date })     => ipcRenderer.invoke("kwhotel-departures", { date }),
  kwhotelRooms:      ({ date })     => ipcRenderer.invoke("kwhotel-rooms",      { date }),
});
