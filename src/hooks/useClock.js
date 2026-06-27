import { useState, useEffect } from "react";

// Zegar na żywo: bieżąca godzina (HH:MM:SS) odświeżana co sekundę + czas
// trwania bieżącej zmiany. Wyizolowane z App.jsx (Faza 0). Zależności:
// shiftStartTime (Date|null) — gdy null, shiftElapsed pozostaje pusty;
// getNow (opcjonalne) — źródło „teraz" (zegar testowy DEV); domyślnie new Date().
export function useClock(shiftStartTime, getNow) {
  const [liveTime, setLiveTime] = useState("");
  const [shiftElapsed, setShiftElapsed] = useState("");
  useEffect(() => {
    const update = () => {
      const now = typeof getNow === "function" ? getNow() : new Date();
      setLiveTime(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`);
      if (shiftStartTime) { const d = Math.floor((now - shiftStartTime) / 60000); setShiftElapsed(`${Math.floor(d / 60)}h ${d % 60}min`); }
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [shiftStartTime, getNow]);
  return { liveTime, shiftElapsed };
}
