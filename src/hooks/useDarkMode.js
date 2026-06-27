import { useState, useEffect } from "react";
import { STORAGE_KEYS } from "../lib/storage";

// Tryb ciemny/jasny — osobny dla widoku pracownika i panelu kierownika.
// Aktywny motyw: w widoku kierownika adminDark, inaczej workerDark.
// Synchronizuje klasy body.app-dark / html.theme-dark|theme-light oraz
// localStorage["cc.theme"] (czytane przy starcie). Wyizolowane z App.jsx (Faza 0).
export function useDarkMode(isManagerView) {
  const [workerDark, setWorkerDark] = useState(() => localStorage.getItem(STORAGE_KEYS.workerDark) !== "false");
  const [adminDark, setAdminDark] = useState(() => localStorage.getItem(STORAGE_KEYS.adminDark) !== "false");
  const dark = isManagerView ? adminDark : workerDark;

  useEffect(() => { localStorage.setItem(STORAGE_KEYS.workerDark, workerDark); }, [workerDark]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.adminDark, adminDark); }, [adminDark]);
  useEffect(() => {
    document.body.classList.toggle("app-dark", dark);
    document.documentElement.classList.toggle("theme-dark", dark);
    document.documentElement.classList.toggle("theme-light", !dark);
    try { localStorage.setItem("cc.theme", dark ? "dark" : "light"); } catch {}
  }, [dark]);

  return { workerDark, setWorkerDark, adminDark, setAdminDark, dark };
}
