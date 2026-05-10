// Pure data constants extracted from App.jsx — Etap A refaktor (mini-step 2).
// No functions, no React, no localStorage. Safe to import anywhere.

// ── Progi czasowe dla zadan ad-hoc HK (konfigurowalne) ─────────────────
export const DEFAULT_ADHOC_THRESHOLDS = Object.freeze({ weekday: 10, weekend: 12 });

// ─── Mapa budynku — parter + 3 pietra (C1) ───────────────────────────────────
// Parter: konfigurowalna lista obszarow (pomieszczen wspolnych)
export const PARTER_SPACES = Object.freeze([
  { id: "recepcja",     label: "Recepcja" },
  { id: "lobby",        label: "Lobby" },
  { id: "restauracja",  label: "Restauracja" },
  { id: "basen",        label: "Basen" },
  { id: "sauna",        label: "Sauna" },
  { id: "spa",          label: "SPA" },
  { id: "toalety",      label: "Toalety" },
  { id: "szatnia",      label: "Szatnia" },
  { id: "winda",        label: "Winda" },
  { id: "korytarz",     label: "Korytarz" },
  { id: "parking",      label: "Parking" },
  { id: "techniczne",   label: "Pom. techniczne" },
]);

export const FAULT_FLOORS = Object.freeze([
  { key: "parter",  label: "Parter",       spaces: PARTER_SPACES },
  { key: "pietro1", label: "1. piętro",    rooms:  null /* HK_FLOOR1 lazy */ },
  { key: "pietro2", label: "2. piętro",    rooms:  null /* HK_FLOOR2 lazy */ },
  { key: "pietro3", label: "3. piętro",    rooms:  null /* HK_FLOOR3 lazy */ },
]);

// Admin / shift identity
export const ADMIN_PASSWORD = "LaBodega";
export const ADMIN_MANAGERS = Object.freeze(["Pawel", "Weronika"]);
export const SHIFT_OPTIONS = Object.freeze(["poranna", "popoludniowa", "wieczorowa", "dzienna", "nocna"]);

export const SHIFT_LABELS = Object.freeze({ poranna:"Zmiana poranna 7:00-15:00","popoludniowa":"Zmiana popoludniowa 15:00-22:00",wieczorowa:"Zmiana wieczorowa 22:00-7:00",dzienna:"Zmiana dzienna 7:00-19:00",nocna:"Zmiana nocna 19:00-7:00" });
export const SHIFT_LABELS_PL = Object.freeze({ poranna:"Zmiana poranna 7:00–15:00","popoludniowa":"Zmiana popołudniowa 15:00–22:00",wieczorowa:"Zmiana wieczorowa 22:00–7:00",dzienna:"Zmiana dzienna 7:00–19:00",nocna:"Zmiana nocna 19:00–7:00" });
export const SHIFT_SHORT_LABELS = Object.freeze({ poranna:"Poranna 7–15","popoludniowa":"Popołudniowa 15–22",wieczorowa:"Wieczorowa 22–7",dzienna:"Dzienna 7–19",nocna:"Nocna 19–7" });

// Default seeds
export const defaultEmployees = Object.freeze(["Weronika","Agata","Oliwier","Natalia","Rebecca"]);
export const defaultTasks = {
  poranna:[{id:"p1",text:"Sprawdź listę przyjazdów i wyjazdów na dzień bieżący",scheduledTime:"08:00"},{id:"p2",text:"Zweryfikuj status pokoi z housekeepingiem",scheduledTime:""},{id:"p3",text:"Sprawdź skrzynkę mailową recepcji",scheduledTime:"09:00"},{id:"p4",text:"Uzupełnij raport poranny i ważne informacje dla kolejnej zmiany",scheduledTime:"14:30"}],
  "popoludniowa":[{id:"pp1",text:"Przygotuj recepcję na zwiększony ruch check-in",scheduledTime:"15:30"},{id:"pp2",text:"Zweryfikuj płatności i depozyty gości przyjeżdżających",scheduledTime:""},{id:"pp3",text:"Sprawdź rezerwacje na kolejny dzień",scheduledTime:"20:00"},{id:"pp4",text:"Przekaż ważne informacje kolejnej zmianie",scheduledTime:"21:45"}],
  wieczorowa:[{id:"w1",text:"Sprawdź nierozwiązane zgłoszenia gości",scheduledTime:"22:30"},{id:"w2",text:"Zweryfikuj płatności i zamknięcia spraw",scheduledTime:""},{id:"w3",text:"Uzupełnij bieżące notatki recepcyjne",scheduledTime:"23:30"},{id:"w4",text:"Przygotuj recepcję do spokojniejszego trybu",scheduledTime:"06:30"}],
  dzienna:[{id:"d1",text:"Kontroluj płynność pracy recepcji w ciągu dnia",scheduledTime:""},{id:"d2",text:"Nadzoruj zgłoszenia gości i współpracę z housekeepingiem",scheduledTime:""},{id:"d3",text:"Weryfikuj rezerwacje, płatności i dokumenty",scheduledTime:"12:00"},{id:"d4",text:"Przygotuj komplet informacji dla kolejnej zmiany",scheduledTime:"18:30"}],
  nocna:[{id:"n1",text:"Wykonaj obchód nocny i sprawdź bezpieczeństwo",scheduledTime:"23:30"},{id:"n2",text:"Zweryfikuj raport dobowy i zamknięcie dnia",scheduledTime:"01:00"},{id:"n3",text:"Sprawdź listę wczesnych śniadań / early departures",scheduledTime:"05:30"},{id:"n4",text:"Przygotuj przekazanie dla zmiany porannej",scheduledTime:"06:30"}],
};
export const defaultWikiEntries = [
  {id:"wiki1",topic:"Schematy zamków",content:"Tutaj kierownik może wpisać schematy zamków, instrukcje i ważne uwagi dla zespołu.",updatedAt:new Date().toLocaleString("pl-PL")},
  {id:"wiki2",topic:"Standard obsługi gościa",content:"Tutaj kierownik może wpisać standard obsługi, sposób rozmowy z gościem i procedury recepcji.",updatedAt:new Date().toLocaleString("pl-PL")},
];
export const emptyCarryOver = Object.freeze({poranna:[],"popoludniowa":[],wieczorowa:[],dzienna:[],nocna:[]});

// ─── HK MODULE ────────────────────────────────────────────────────────────────
export const HK_FLOOR1 = Object.freeze([
  {no:"101",type:"DBL"},{no:"102",type:"SGL"},{no:"103",type:"DBL"},
  {no:"104",type:"SGL"},{no:"105",type:"TRPL"},{no:"106",type:"APT",apt:true},
  {no:"107",type:"TRPL"},{no:"108",type:"TWIN"},{no:"109",type:"TWIN"},
  {no:"110",type:"SGL"},{no:"111",type:"TWIN"},{no:"112",type:"TWIN"},
  {no:"114",type:"DBL"},{no:"115",type:"DBL"},{no:"116",type:"DBL"},
  {no:"117",type:"TRPL"},{no:"118A",type:"SGL"},{no:"118B",type:"SGL"},
  {no:"119",type:"TRPL"},{no:"120",type:"TWIN"},{no:"121",type:"TWIN"},
  {no:"122",type:"DBL"},{no:"123",type:"DBL"},
]);
export const HK_FLOOR2 = Object.freeze([
  {no:"201",type:"TWIN"},{no:"202",type:"TWIN"},{no:"203",type:"TWIN"},
  {no:"204",type:"SGL"},{no:"205",type:"SGL"},{no:"206",type:"APT",apt:true},
  {no:"207",type:"SGL"},{no:"208",type:"TWIN"},{no:"209",type:"TWIN"},
  {no:"210",type:"TWIN"},{no:"211",type:"TWIN"},{no:"212",type:"DBL"},
  {no:"214",type:"TWIN"},{no:"215",type:"TWIN"},{no:"216",type:"TWIN"},
  {no:"217",type:"SGL"},{no:"218",type:"APT",apt:true},{no:"219",type:"DBL"},
  {no:"220",type:"TWIN"},{no:"221",type:"TWIN"},{no:"222",type:"DBL"},{no:"223",type:"TWIN"},
]);
export const HK_FLOOR3 = Object.freeze([
  {no:"301",type:"DBL"},{no:"302",type:"DBL"},{no:"303",type:"DBL"},
  {no:"304",type:"TWIN"},{no:"305",type:"DBL"},{no:"306",type:"APT",apt:true},
  {no:"307",type:"DBL"},{no:"308",type:"TWIN"},{no:"309",type:"SGL"},
  {no:"310",type:"SGL"},{no:"311",type:"TWIN"},{no:"312",type:"SGL"},
  {no:"314",type:"SGL"},{no:"315",type:"SGL"},{no:"316",type:"SGL"},
  {no:"317",type:"DBL"},{no:"318",type:"APT",apt:true},{no:"319",type:"DBL"},
  {no:"320",type:"DBL"},{no:"321",type:"DBL"},{no:"322",type:"SGL"},{no:"323",type:"TWIN"},
]);
export const HK_ALL = Object.freeze([...HK_FLOOR1,...HK_FLOOR2,...HK_FLOOR3]);
export const HK_APTS = Object.freeze(["106","206","218","306","318"]);

export const HK_SPECIAL_ROOMS = Object.freeze(["105","107","117","119"]);
export const HK_ROOMS_SGL_TWIN_ONLY = Object.freeze(["118A","118B"]);
export const HK_STATUS_COLORS = Object.freeze({W:{bg:"#E6F1FB",color:"#185FA5",border:"#85B7EB"},PG:{bg:"#EAF3DE",color:"#3B6D11",border:"#97C459"},PGZ:{bg:"#FAEEDA",color:"#854F0B",border:"#EF9F27"},BR:{bg:"#FFF0F0",color:"#B91C1C",border:"#FCA5A5"},ZS:{bg:"#FDF4FF",color:"#7E22CE",border:"#D8B4FE"},WP:{bg:"#E6F1FB",color:"#185FA5",border:"#85B7EB"}});

export const HK_LIVE_COLORS = Object.freeze(["#6366f1","#f59e0b","#34d399","#f87171","#60a5fa","#a78bfa","#fb923c","#4ade80"]);
// Stała lista pracowników HK — każda ma swój QR raz wygenerowany
export const HK_WORKERS = Object.freeze(["Tetiana","Kasia","Larisa","Inna","Artur","Gabrysia","Olena","Yurii","Zuza"]);
