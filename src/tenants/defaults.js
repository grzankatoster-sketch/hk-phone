// Conrad Comfort — domyślna konfiguracja tenanta.
// Inne hotele nadpisują te wartości przez zmienne środowiskowe VITE_* w pliku .env.

export const DEFAULTS = {
  hotelName:  "Conrad Comfort",
  hotelShort: "CC",

  // Kierownicy recepcji uprawnieni do panelu admin
  managers: ["Paweł", "Weronika"],

  // Domyślna lista pracowników (seed przy pierwszym uruchomieniu)
  employees: ["Weronika", "Agata", "Oliwier", "Natalia", "Rebecca"],

  // Pracownicy działu konserwacji / technicznego
  maintainers: ["Grzegorz", "Kamil"],

  // ── Moduły licencjonowalne (SaaS) ──────────────────────────────────────────
  // Każda flaga = osobna sekcja, którą można włączyć/wyłączyć per tenant.
  // Domyślnie WSZYSTKIE true (Conrad = pełna licencja). Inny hotel ogranicza
  // zakres przez VITE_MODULES w .env (whitelist włączonych). Rdzeń przekazania
  // zmiany (zmiana/przekazanie/informacje/usterki/historia) jest zawsze włączony
  // i NIE figuruje tutaj — patrz src/lib/modules.js (core:true).
  modules: {
    hk:       true,  // Housekeeping
    parking:  true,  // Parking
    goscie:   true,  // Stali goście
    vouchery: true,  // Vouchery
    opinie:   true,  // Opinie gości
    zadania:  true,  // Zadania zmian (panel kierownika)
  },

  // Pomieszczenia parteru (dla modułu Usterki)
  parter: [
    { id: "recepcja",       label: "Recepcja" },
    { id: "restauracja",    label: "Restauracja" },
    { id: "mala_sala_konf", label: "Mala sala konferencyjna" },
  ],

  hk: {
    // Pokoje na poszczególnych piętrach — format: { no: "101", type: "DBL" }
    // type: DBL | SGL | TWIN | TRPL | APT   apt: true = apartament
    floor1: [
      {no:"101",type:"DBL"},{no:"102",type:"SGL"},{no:"103",type:"DBL"},
      {no:"104",type:"SGL"},{no:"105",type:"TRPL"},{no:"106",type:"APT",apt:true},
      {no:"107",type:"TRPL"},{no:"108",type:"TWIN"},{no:"109",type:"TWIN"},
      {no:"110",type:"SGL"},{no:"111",type:"TWIN"},{no:"112",type:"TWIN"},
      {no:"114",type:"DBL"},{no:"115",type:"DBL"},{no:"116",type:"DBL"},
      {no:"117",type:"TRPL"},{no:"118A",type:"SGL"},{no:"118B",type:"SGL"},
      {no:"119",type:"TRPL"},{no:"120",type:"TWIN"},{no:"121",type:"TWIN"},
      {no:"122",type:"DBL"},{no:"123",type:"DBL"},
    ],
    floor2: [
      {no:"201",type:"TWIN"},{no:"202",type:"TWIN"},{no:"203",type:"TWIN"},
      {no:"204",type:"SGL"},{no:"205",type:"SGL"},{no:"206",type:"APT",apt:true},
      {no:"207",type:"SGL"},{no:"208",type:"TWIN"},{no:"209",type:"TWIN"},
      {no:"210",type:"TWIN"},{no:"211",type:"TWIN"},{no:"212",type:"DBL"},
      {no:"214",type:"TWIN"},{no:"215",type:"TWIN"},{no:"216",type:"TWIN"},
      {no:"217",type:"SGL"},{no:"218",type:"APT",apt:true},{no:"219",type:"DBL"},
      {no:"220",type:"TWIN"},{no:"221",type:"TWIN"},{no:"222",type:"DBL"},{no:"223",type:"TWIN"},
    ],
    floor3: [
      {no:"301",type:"DBL"},{no:"302",type:"DBL"},{no:"303",type:"DBL"},
      {no:"304",type:"TWIN"},{no:"305",type:"DBL"},{no:"306",type:"APT",apt:true},
      {no:"307",type:"DBL"},{no:"308",type:"TWIN"},{no:"309",type:"SGL"},
      {no:"310",type:"SGL"},{no:"311",type:"TWIN"},{no:"312",type:"SGL"},
      {no:"314",type:"SGL"},{no:"315",type:"SGL"},{no:"316",type:"SGL"},
      {no:"317",type:"DBL"},{no:"318",type:"APT",apt:true},{no:"319",type:"DBL"},
      {no:"320",type:"DBL"},{no:"321",type:"DBL"},{no:"322",type:"SGL"},{no:"323",type:"TWIN"},
    ],

    // Numery pokoi będących apartamentami
    apts: ["106","206","218","306","318"],

    // Waga apartamentu przy przydziale HK (ile "zwykłych" pokoi = 1 apartament)
    aptWeight: 3,

    // Pokoje wymagające specjalnego traktowania w HK (np. dodatkowe łóżko)
    specialRooms: ["105","107","117","119"],

    // Pokoje dostępne tylko jako SGL lub TWIN (ograniczenie konfiguracji)
    roomsSglTwinOnly: ["118A","118B"],

    // Ile dni wstecz przechowywać plany HK w localStorage
    planRetentionDays: 31,
  },
};
