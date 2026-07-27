// Karta gościa per pokój — tożsamość (docelowo auto z raportu KWHotel) +
// preferencje operacyjne wpisywane ręcznie przez recepcję (WYKONANIE: HK guest card).
import { STORAGE_KEYS, loadJson, saveJson } from "./storage";

const PURGE_DAYS_AFTER_CHECKOUT = 2;

export const emptyRoomGuest = () => ({
  guestName: "",
  checkOutDate: "",
  dailyCleaning: false,
  meal: "none", // none | breakfast | hb
  wakeUp: { enabled: false, time: "" },
  laterRequests: [], // { id, text, date, done }
  updatedAt: "",
});

const isExpired = (record, today) => {
  if (!record?.checkOutDate) return false;
  const out = new Date(`${record.checkOutDate}T00:00:00`);
  if (Number.isNaN(out.getTime())) return false;
  const cutoff = new Date(out);
  cutoff.setDate(cutoff.getDate() + PURGE_DAYS_AFTER_CHECKOUT);
  return today >= cutoff;
};

// Odczyt + higiena RODO na wejściu: karty starsze niż checkOutDate+2 dni
// są kasowane automatycznie, nie czekają na ręczne sprzątanie danych.
export function loadRoomGuests() {
  const all = loadJson(STORAGE_KEYS.roomGuests, {});
  const today = new Date();
  let changed = false;
  const next = {};
  Object.entries(all).forEach(([room, record]) => {
    if (isExpired(record, today)) { changed = true; return; }
    next[room] = record;
  });
  if (changed) saveJson(STORAGE_KEYS.roomGuests, next);
  return next;
}

export function getRoomGuest(room) {
  return loadRoomGuests()[room] || null;
}

const sameGuest = (a, b) => a && b && a.trim().toLowerCase() === b.trim().toLowerCase();

// Scalanie: jeśli nazwisko w pokoju się zmieniło (poprzedni gość wyjechał, nowy
// wjechał), preferencje poprzedniego gościa NIE przechodzą na nowego — świeży start.
// Ten sam wzorzec rekoncyliacji, co przy zniknięciu pokoju z planu HK.
export function saveRoomGuest(room, patch) {
  const all = loadRoomGuests();
  const prev = all[room] || null;
  const guestChanged = !!(prev?.guestName && patch.guestName && !sameGuest(prev.guestName, patch.guestName));
  const base = guestChanged ? emptyRoomGuest() : { ...emptyRoomGuest(), ...(prev || {}) };
  const record = { ...base, ...patch, updatedAt: new Date().toISOString() };
  const next = { ...all, [room]: record };
  saveJson(STORAGE_KEYS.roomGuests, next);
  return record;
}

export function removeRoomGuest(room) {
  const all = loadRoomGuests();
  if (!(room in all)) return;
  const next = { ...all };
  delete next[room];
  saveJson(STORAGE_KEYS.roomGuests, next);
}
