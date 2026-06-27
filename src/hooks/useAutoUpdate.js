import { useState, useEffect, useCallback } from "react";

// Auto-updater Electrona (electron-updater) — nasłuch zdarzeń IPC + ręczne
// sprawdzanie aktualizacji. Wyizolowane z App.jsx (Faza 0: rozbicie god-componentu).
// Jedyna zależność zewnętrzna: showToast (stabilny useCallback w App).
export function useAutoUpdate(showToast) {
  const [updateInfo, setUpdateInfo] = useState(null);        // {version,releaseDate}
  const [updateState, setUpdateState] = useState("idle");    // idle|available|downloading|downloaded|error
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateError, setUpdateError] = useState("");
  const [updateNoticeDismissed, setUpdateNoticeDismissed] = useState(false); // ukrycie globalnego dymka "Później"

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    api.onUpdateAvailable(info => { setUpdateInfo(info); setUpdateState("available"); setUpdateNoticeDismissed(false); });
    api.onUpdateNotAvailable(() => { setUpdateState("idle"); showToast("Masz najnowszą wersję aplikacji.", "success", 4000); });
    api.onUpdateProgress(p => { setUpdateState("downloading"); setUpdateProgress(p.percent || 0); });
    api.onUpdateDownloaded(() => { setUpdateState("downloaded"); setUpdateNoticeDismissed(false); showToast("Aktualizacja pobrana — kliknij 'Zainstaluj'.", "success", 8000); });
    api.onUpdateError(msg => { setUpdateState("error"); setUpdateError(msg); });
    return () => api.removeUpdateListeners?.();
  }, [showToast]);

  const checkForUpdates = useCallback(async () => {
    if (!window.electronAPI?.checkForUpdates) { showToast("Aktualizacje działają tylko w zainstalowanej wersji.", "info"); return; }
    setUpdateState("idle"); setUpdateError("");
    const r = await window.electronAPI.checkForUpdates();
    if (r?.isDev) showToast("Tryb dev — aktualizacje dostępne tylko w instalatorze.", "info");
    else if (r?.error) showToast("Błąd sprawdzania: " + r.error, "error");
    else showToast("Sprawdzam aktualizacje…", "info", 3000);
  }, [showToast]);

  return { updateInfo, updateState, updateProgress, updateError, updateNoticeDismissed, setUpdateNoticeDismissed, checkForUpdates };
}
