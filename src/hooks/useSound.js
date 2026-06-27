import { useState, useEffect, useCallback } from "react";
import { STORAGE_KEYS } from "../lib/storage";

// Powiadomienia dźwiękowe — przełącznik (persystowany w localStorage) + krótki
// beep przez WebAudio. Wyizolowane z App.jsx (Faza 0).
// UWAGA: playBeep jest obecnie nieużywany w App (martwy kod zachowany na
// przyszłość — do podpięcia przy alertach albo do usunięcia świadomą decyzją).
export function useSound() {
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem(STORAGE_KEYS.soundEnabled) !== "false");
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.soundEnabled, soundEnabled); }, [soundEnabled]);

  const playBeep = useCallback((freq = 660, dur = 0.3) => {
    if (!soundEnabled) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq; osc.type = "sine";
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.start(); osc.stop(ctx.currentTime + dur);
      setTimeout(() => ctx.close(), dur * 1000 + 200);
    } catch {}
  }, [soundEnabled]);

  return { soundEnabled, setSoundEnabled, playBeep };
}
