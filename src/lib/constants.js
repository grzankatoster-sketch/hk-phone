// Copyright © 2026 Conrad Comfort. All rights reserved. UNLICENSED.
// Stałe aplikacji. Dane specyficzne dla hotelu są w src/tenants/config.js.

import { tenantConfig } from "../tenants/config";

// ─── Tenant ──────────────────────────────────────────────────────────────────
export const TENANT_ID = import.meta.env.VITE_TENANT_ID || "00000000-0000-0000-0000-000000000001";
export const ADMIN_PASSWORD = import.meta.env?.VITE_ADMIN_PASSWORD || (() => { throw new Error("VITE_ADMIN_PASSWORD is not set"); })();

// Startowa stała kasowa (kasetka) w PLN — wartość domyślna, nadpisywana przez
// kierownika w UI. Docelowo migruje do tenant_settings (WYKONANIE 2.19).
export const DEFAULT_STALA_KASOWA = 500;

// ─── Dane hotelowe — re-export z tenantConfig dla backward compat ─────────────
// Nazwa hotelu do UI/PDF (WYKONANIE 2.5) — jedno źródło zamiast „Conrad Comfort"
// zaszytego w ~10 miejscach. Inny tenant = inna VITE_HOTEL_NAME, zero zmian w kodzie.
export const HOTEL_NAME            = tenantConfig.hotelName;
export const ADMIN_MANAGERS        = Object.freeze(tenantConfig.managers);
export const defaultEmployees      = Object.freeze(tenantConfig.employees);
export const KONSERWATOR_WORKERS   = Object.freeze(tenantConfig.maintainers);
export const PARTER_SPACES         = Object.freeze(tenantConfig.parter);

export const HK_FLOOR1             = Object.freeze(tenantConfig.hk.floor1);
export const HK_FLOOR2             = Object.freeze(tenantConfig.hk.floor2);
export const HK_FLOOR3             = Object.freeze(tenantConfig.hk.floor3);
export const HK_ALL                = Object.freeze([...tenantConfig.hk.floor1, ...tenantConfig.hk.floor2, ...tenantConfig.hk.floor3]);
export const HK_APTS               = Object.freeze(tenantConfig.hk.apts);
export const HK_SPECIAL_ROOMS      = Object.freeze(tenantConfig.hk.specialRooms);
export const HK_ROOMS_SGL_TWIN_ONLY = Object.freeze(tenantConfig.hk.roomsSglTwinOnly);

export const FAULT_FLOORS = Object.freeze([
  { key: "parter",  label: "Parter",    spaces: PARTER_SPACES },
  { key: "pietro1", label: "1. piętro", rooms: null },
  { key: "pietro2", label: "2. piętro", rooms: null },
  { key: "pietro3", label: "3. piętro", rooms: null },
]);

// ─── Zmiana ───────────────────────────────────────────────────────────────────
export const SHIFT_OPTIONS     = Object.freeze(["poranna","popoludniowa","wieczorowa","dzienna","nocna"]);
export const SHIFT_LABELS      = Object.freeze({poranna:"Zmiana poranna 7:00-17:00","popoludniowa":"Zmiana popoludniowa 14:00-23:00",wieczorowa:"Zmiana wieczorowa 21:00-7:00",dzienna:"Zmiana dzienna 7:00-19:00",nocna:"Zmiana nocna 19:00-7:00"});
export const SHIFT_LABELS_PL   = Object.freeze({poranna:"Zmiana poranna 7:00–17:00","popoludniowa":"Zmiana popołudniowa 14:00–23:00",wieczorowa:"Zmiana wieczorowa 21:00–7:00",dzienna:"Zmiana dzienna 7:00–19:00",nocna:"Zmiana nocna 19:00–7:00"});
export const SHIFT_SHORT_LABELS= Object.freeze({poranna:"Poranna 7–17","popoludniowa":"Popołudniowa 14–23",wieczorowa:"Wieczorowa 21–7",dzienna:"Dzienna 7–19",nocna:"Nocna 19–7"});
// Sama nazwa zmiany bez sztywnych godzin — godziny doklejamy z grafiku kierownika.
export const SHIFT_NAME_PL     = Object.freeze({poranna:"Zmiana poranna","popoludniowa":"Zmiana popołudniowa",wieczorowa:"Zmiana wieczorowa",dzienna:"Zmiana dzienna",nocna:"Zmiana nocna"});
// Następna zmiana w cyklu — domyślny cel przy przekazywaniu zadań. Trzyma się
// schematu: 3-zmianowy poranna→popołudniowa→wieczorowa, 2-zmianowy dzienna↔nocna.
export const NEXT_SHIFT        = Object.freeze({poranna:"popoludniowa","popoludniowa":"wieczorowa",wieczorowa:"poranna",dzienna:"nocna",nocna:"dzienna"});

// ─── Zadania domyślne ─────────────────────────────────────────────────────────
export const defaultTasks = {
  poranna:[{id:"p1",text:"Sprawdź listę przyjazdów i wyjazdów na dzień bieżący",scheduledTime:"08:00"},{id:"p2",text:"Zweryfikuj status pokoi z housekeepingiem",scheduledTime:""},{id:"p3",text:"Sprawdź skrzynkę mailową recepcji",scheduledTime:"09:00"},{id:"p4",text:"Uzupełnij raport poranny i ważne informacje dla kolejnej zmiany",scheduledTime:"14:30"}],
  "popoludniowa":[{id:"pp1",text:"Przygotuj recepcję na zwiększony ruch check-in",scheduledTime:"15:30"},{id:"pp2",text:"Zweryfikuj płatności i depozyty gości przyjeżdżających",scheduledTime:""},{id:"pp3",text:"Sprawdź rezerwacje na kolejny dzień",scheduledTime:"20:00"},{id:"pp4",text:"Przekaż ważne informacje kolejnej zmianie",scheduledTime:"21:45"}],
  wieczorowa:[{id:"w1",text:"Sprawdź nierozwiązane zgłoszenia gości",scheduledTime:"22:30"},{id:"w2",text:"Zweryfikuj płatności i zamknięcia spraw",scheduledTime:""},{id:"w3",text:"Uzupełnij bieżące notatki recepcyjne",scheduledTime:"23:30"},{id:"w4",text:"Przygotuj recepcję do spokojniejszego trybu",scheduledTime:"06:30"}],
  dzienna:[{id:"d1",text:"Kontroluj płynność pracy recepcji w ciągu dnia",scheduledTime:""},{id:"d2",text:"Nadzoruj zgłoszenia gości i współpracę z housekeepingiem",scheduledTime:""},{id:"d3",text:"Weryfikuj rezerwacje, płatności i dokumenty",scheduledTime:"12:00"},{id:"d4",text:"Przygotuj komplet informacji dla kolejnej zmiany",scheduledTime:"18:30"}],
  nocna:[{id:"n1",text:"Wykonaj obchód nocny i sprawdź bezpieczeństwo",scheduledTime:"23:30"},{id:"n2",text:"Zweryfikuj raport dobowy i zamknięcie dnia",scheduledTime:"01:00"},{id:"n3",text:"Sprawdź listę wczesnych śniadań / early departures",scheduledTime:"05:30"},{id:"n4",text:"Przygotuj przekazanie dla zmiany porannej",scheduledTime:"06:30"}],
};
export function getDefaultWikiEntries() {
  const ts = new Date().toLocaleString("pl-PL");
  return [
    {id:"wiki1",topic:"Schematy zamków",content:"Tutaj kierownik może wpisać schematy zamków, instrukcje i ważne uwagi dla zespołu.",updatedAt:ts},
    {id:"wiki2",topic:"Standard obsługi gościa",content:"Tutaj kierownik może wpisać standard obsługi, sposób rozmowy z gościem i procedury recepcji.",updatedAt:ts},
  ];
}
export const emptyCarryOver = Object.freeze({poranna:[],"popoludniowa":[],wieczorowa:[],dzienna:[],nocna:[]});

// ─── HK — kolory statusów (app-wide, nie zależą od hotelu) ───────────────────
export const HK_STATUS_COLORS = Object.freeze({W:{bg:"rgba(91,168,232,.20)",color:"#5BA8E8",border:"rgba(91,168,232,.40)"},P:{bg:"rgba(43,212,160,.20)",color:"#2BD4A0",border:"rgba(43,212,160,.40)"},PG:{bg:"rgba(43,212,160,.18)",color:"#22c896",border:"rgba(43,212,160,.35)"},PGZ:{bg:"rgba(232,148,58,.20)",color:"#E8943A",border:"rgba(232,148,58,.40)"},BR:{bg:"rgba(255,84,113,.20)",color:"#FF5471",border:"rgba(255,84,113,.40)"},ZS:{bg:"rgba(167,139,250,.20)",color:"#A78BFA",border:"rgba(167,139,250,.40)"},WP:{bg:"rgba(91,168,232,.18)",color:"#5BA8E8",border:"rgba(91,168,232,.35)"}});
export const HK_STATUS_COLORS_LIGHT = Object.freeze({W:{bg:"rgba(91,168,232,.20)",color:"#1a6fb5",border:"rgba(91,168,232,.45)"},P:{bg:"rgba(43,212,160,.20)",color:"#0d7a58",border:"rgba(43,212,160,.45)"},PG:{bg:"rgba(43,212,160,.18)",color:"#0d7a58",border:"rgba(43,212,160,.40)"},PGZ:{bg:"rgba(232,148,58,.20)",color:"#9a5700",border:"rgba(232,148,58,.45)"},BR:{bg:"rgba(255,84,113,.18)",color:"#b91c3c",border:"rgba(255,84,113,.45)"},ZS:{bg:"rgba(167,139,250,.20)",color:"#5b21b6",border:"rgba(167,139,250,.45)"},WP:{bg:"rgba(91,168,232,.18)",color:"#1a6fb5",border:"rgba(91,168,232,.40)"}});
export const HK_LIVE_COLORS = Object.freeze(["#B065A0","#f59e0b","#34d399","#f87171","#60a5fa","#a78bfa","#fb923c","#C8A269"]);

// ─── Usterki ──────────────────────────────────────────────────────────────────
export const FAULT_CATEGORIES = Object.freeze(["Elektryka","Hydraulika","Meble/wyposażenie","Sprzątanie","Klimatyzacja","Inne"]);

// ─── Progi czasowe HK ────────────────────────────────────────────────────────
export const DEFAULT_ADHOC_THRESHOLDS = Object.freeze({ weekday: 10, weekend: 12 });

// ─── Vouchery ─────────────────────────────────────────────────────────────────
export const VOUCHER_TYPES       = Object.freeze(["voucher","cashback"]);
export const VOUCHER_TYPE_LABELS = Object.freeze({voucher:"Voucher",cashback:"Cashback"});

// ─── Etykiety zakładek (nagłówek aktywnej sekcji) ─────────────────────────────
export const WORKER_TAB_LABELS = Object.freeze({
  zmiana: "Przegląd zmiany",
  zadania: "Zadania",
  przekazanie: "Przekaż zmianę",
  hk: "Housekeeping",
  informacje: "Informacje",
  usterki: "Usterki",
  parking: "Parking",
  goscie: "Stali goście",
  vouchery: "Vouchery",
  opinie: "Opinie gości",
  klucze: "Klucze / karty",
  depozyty: "Depozyty",
});
export const ADMIN_TAB_LABELS = Object.freeze({
  ewidencja: "Ewidencja", zadania: "Zadania", pracownicy: "Pracownicy",
  grafik: "Grafik", statystyki: "Statystyki", ustawienia: "Ustawienia",
  korekty: "Korekty", usterki: "Usterki",
  wiadomosci: "Wiadomości", alerty: "Alerty",
  przypomnienia: "Przypomnienia", historia: "Historia", wiki: "Wiki",
  kasa: "Kasa",
});
