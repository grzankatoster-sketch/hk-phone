// ─── electron/preload.cjs ────────────────────────────────────────────────────
const { contextBridge, ipcRenderer } = require("electron");

function on(channel, cb) {
  const listener = (_, data) => cb(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

function onEmpty(channel, cb) {
  const listener = () => cb();
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("electronAPI", {
  // Aktualizacje
  checkForUpdates:      ()  => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate:       ()  => ipcRenderer.invoke("download-update"),
  installUpdate:        ()  => ipcRenderer.invoke("install-update"),
  getAppVersion:        ()  => ipcRenderer.invoke("get-app-version"),
  getAppInfo:           ()  => ipcRenderer.invoke("get-app-info"),
  syncBookingReviews:   ()  => ipcRenderer.invoke("booking-reviews-sync"),

  onUpdateAvailable:    (cb) => on("update-available", cb),
  onUpdateNotAvailable: (cb) => onEmpty("update-not-available", cb),
  onUpdateProgress:     (cb) => on("update-progress", cb),
  onUpdateDownloaded:   (cb) => on("update-downloaded", cb),
  onUpdateError:        (cb) => on("update-error", cb),
  removeUpdateListeners: () => {
    ipcRenderer.removeAllListeners("update-available");
    ipcRenderer.removeAllListeners("update-not-available");
    ipcRenderer.removeAllListeners("update-progress");
    ipcRenderer.removeAllListeners("update-downloaded");
    ipcRenderer.removeAllListeners("update-error");
  },

  // Zapis PDF
  savePdf: (filename, dataBase64, folder) => ipcRenderer.invoke("save-pdf", { filename, dataBase64, folder }),

  // QR kody (generowane przez Electron, wskazują na Supabase Storage)
  hkAutomationGetPlan: (dateKey) => ipcRenderer.invoke("hk-automation-get-plan", dateKey),
  hkAutomationGetSource: (dateKey) => ipcRenderer.invoke("hk-automation-get-source", dateKey),
  hkAutomationStatus: () => ipcRenderer.invoke("hk-automation-status"),
  hkAutomationRunNow: () => ipcRenderer.invoke("hk-automation-run-now"),
  hkAutomationSetPassword: (password) => ipcRenderer.invoke("hk-automation-set-password", password),
  hkGetQr: (name, ip, baseUrl, pm) => ipcRenderer.invoke("hk-get-qr", name, ip, baseUrl, pm),
  hkGetKonserwatorQr: (name, faults) => ipcRenderer.invoke("hk-get-konserwator-qr", name, faults),
  hkFixFirewall: () => ipcRenderer.invoke("hk-fix-firewall"),
  hkGetUrl: () => ipcRenderer.invoke("hk-get-url"),
  hkGetIp: () => ipcRenderer.invoke("hk-get-ip"),
  hkGetAllIps: () => ipcRenderer.invoke("hk-get-all-ips"),
  hkSetAssignments: (assignments, date, roomTypes, pmAssignments, pmRoomTypes) =>
    ipcRenderer.invoke("hk-set-assignments", assignments, date, roomTypes, pmAssignments, pmRoomTypes),
  hkVacateRoom: (room) => ipcRenderer.invoke("hk-vacate-room", room),
  hkGetState: () => ipcRenderer.invoke("hk-get-state"),
  hkResetDay: (date) => ipcRenderer.invoke("hk-reset-day", date),
  onHkStateChanged: (cb) => on("hk-state-changed", cb),
  removeHkListeners: () => ipcRenderer.removeAllListeners("hk-state-changed"),
  kwhotelTest: (creds) => ipcRenderer.invoke("kwhotel-test", creds),
  kwhotelLogin: (creds) => ipcRenderer.invoke("kwhotel-login", creds),
  kwhotelArrivals: ({ date }) => ipcRenderer.invoke("kwhotel-arrivals", { date }),
  kwhotelDepartures: ({ date }) => ipcRenderer.invoke("kwhotel-departures", { date }),
  kwhotelRooms: ({ date }) => ipcRenderer.invoke("kwhotel-rooms", { date }),

  // Agent AI — natywne powiadomienia Windows + nawigacja po kliknięciu
  notify: (payload) => ipcRenderer.invoke("notify", payload),
  focusWindow: () => ipcRenderer.invoke("focus-window"),
  onAgentNavigate: (cb) => on("agent-navigate", cb),
  removeAgentNavigate: () => ipcRenderer.removeAllListeners("agent-navigate"),
});
