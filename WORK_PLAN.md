# WORK_PLAN.md — Conrad Comfort Reception Panel

> Lista pozostałych zadań. **Każda sesja = osobny start Claude Code**, samowystarczalna, bez konieczności znania innych sesji. Token-efficient.

## Jak używać tego pliku

1. Wybierz **jedną sesję** poniżej.
2. Zacznij konwersację z Claude Code w folderze `c:\Users\grzan\Desktop\projekt`.
3. Otwórz tę sekcję — wklej **całą sekcję sesji** jako pierwszą wiadomość. To wystarczy.
4. Po sukcesie odhacz `[ ]` → `[x]` w tym pliku.
5. Jeśli sesja ma `prerequisites:` — najpierw odhacz tamte.

**Każda sesja kontaktuje:** cel · prerequisites · pliki do czytania · co zrobić · walidacja · estimated tokens.

---

## STAN POCZĄTKOWY

Aplikacja Electron+React+Vite. Monolityczny `src/App.jsx` (~7900 linii) + `src/style.css` (~1730 linii). Wydzielone już: `src/lib/{storage,constants,dates,format,pdf}.js`. Brak Git/testów. Build: `npx vite build`.

Stack: React 18, Vite 5, Electron 31, framer-motion, jspdf, lucide-react, qrcode, xlsx (zainstalowany ale nieużywany).

Zasada PL: w JSX używać `'...'` lub `&quot;`, NIE polskich cudzysłowów `"…"`.

---

# Sesje — CLEANUP (frontend)

## Sesja C1 — Cleanup A4: stary admin login flow
- **Cel:** Usunąć martwy/zduplikowany kod adminLoginStep + handleAdminLogin po wprowadzeniu pełnoekranowego login (B19).
- **Prerequisites:** brak.
- **Pliki do czytania:** tylko `src/App.jsx` w okolicy: grep `handleAdminLogin|handleManagerSelect|adminDialogOpen|adminLoginStep|ManagerSelectModal`.
- **Co zrobić:**
  1. Grep wszystkich użyć powyższych identyfikatorów.
  2. Zidentyfikować, co jest jeszcze używane (`handleAdminLogout` na pewno zostaje).
  3. UWAGA: `ManagerSelectModal` jest aktywnie używany w `<AnimatePresence>` na końcu pliku. Sprawdź dokładnie czy nowy login w pełnoekranowym faktycznie zastąpił tę ścieżkę.
  4. Jeśli ManagerSelectModal niepotrzebny → usuń komponent + `setAdminDialogOpen` calls + `adminDialogOpen` state + `adminLoginStep` state.
  5. Jeśli wciąż używany → tylko cleanup nieużywanych części (np. tylko `adminLoginStep` jeśli nieczytane).
- **Walidacja:** `npx vite build`. Smoke test 4 ścieżek: worker login, admin login (pełnoekranowy z hasłem), admin → switch panel pracownik, admin logout.
- **Estymacja:** średnie ryzyko, ~30 min, ~50k tokens. Codex review przed merge.

## Sesja C2 — Cleanup A10: manager toggle bar mini
- **Cel:** Zmniejszyć `cc-mgr-toggle-bar` z fullwidth na mini wersję w prawym dolnym rogu Rail.
- **Prerequisites:** brak.
- **Pliki do czytania:** `src/App.jsx` (grep `cc-mgr-toggle-bar`), `src/style.css` (grep `.cc-mgr-toggle`).
- **Co zrobić:**
  1. Read aktualny `cc-mgr-toggle-bar` JSX (~7795+) i CSS (~890+).
  2. Dodać CSS class `cc-mgr-toggle-bar--mini` z `position:fixed; bottom:12px; right:12px; padding:6-8px; box-shadow`.
  3. Zachować pełną wersję jako default; tryb mini przełączany przez localStorage flag `reception-mgr-toggle-mini` LUB media query `(max-width: 1024px)`.
- **Walidacja:** `npx vite build`. Manualnie sprawdź worker view + admin view × dark/light × wide/narrow.
- **Estymacja:** ~20 min, ~30k tokens.

## Sesja C3 — Cleanup A13: konsolidacja klas dark-shell
- **Cel:** Skonsolidować `.dark-shell`/`.light-shell`/`.dark-main` → jedna `.app-dark` na `<body>`.
- **Prerequisites:** brak (ale OSTROŻNIE — 73 wystąpienia).
- **Pliki do czytania:** `src/style.css` (grep `dark-shell|light-shell|dark-main|app-dark`), `src/App.jsx` (3 użycia: `shellClass=`, `appShellClass=`, `<main className=`).
- **Co zrobić:**
  1. Grep wszystkie 73 wystąpienia.
  2. **PLAN OSOBNY krok najpierw:** zaplanuj na piśmie kolejność migracji. Np.:
     - Krok A: dodaj `useEffect` który dodaje/usuwa `app-dark` na `document.body` zgodnie z `workerDark || (showAdminPanel && adminDark)`.
     - Krok B: dla każdego selektora `.dark-shell .X` w CSS dodaj alias `.app-dark .X { ... }` (zachowaj oba przez 1 release).
     - Krok C: zmień App.jsx żeby przestawał dodawać `dark-shell`/`light-shell`/`dark-main` className.
     - Krok D: po smoke teście usuń stare selektory.
  3. Wykonaj kroki A+B (additive, nie usuwa nic). Testuj. Potem C+D.
- **Walidacja:** `npx vite build`. Manualnie: dark mode toggle worker + admin × wszystkie zakładki.
- **Estymacja:** wysokie ryzyko regresji, ~2h, ~80k tokens. Codex review konieczny przed C+D.

## Sesja C4 — Cleanup A14: EMPTY_LABEL helper
- **Cel:** Ujednolicić "—"/"-"/"Brak danych"/"Brak"/"Wpisz na koniec" → jeden `displayValue(v, fallback)` helper.
- **Prerequisites:** brak.
- **Pliki do czytania:** `src/lib/format.js` (rozszerzyć), `src/App.jsx` (grep `Brak danych|Nie wpisano|Wpisz na koniec`).
- **Co zrobić:**
  1. Dodaj do `src/lib/format.js`: `export const EMPTY_LABEL = "—"; export const displayValue = (v, fallback = EMPTY_LABEL) => (v === null || v === undefined || v === "") ? fallback : v;`.
  2. **NIE rób mass replace** — App.jsx ma >60 miejsc, każde ma kontekst. Zamiast tego: na 2 najbardziej widocznych panelach (np. Worker Dashboard + Admin Ewidencja) zamień ręcznie 5-10 użyć jako proof of concept.
  3. Pełne migracja jako osobne sesje (C4a, C4b, ...).
- **Walidacja:** `npx vite build`. Visual diff w jednym dark/light pasie.
- **Estymacja:** ~30 min dla POC, ~25k tokens.

---

# Sesje — REFAKTOR (Etap A finalizacja + B)

## Sesja R-A5 — Wydziel HK helpers do `src/lib/hk.js`
- **Cel:** Wynieść `hkW`, `hkFmtDate`, `hkDayOfWeek` (i podobne) z App.jsx do `src/lib/hk.js`.
- **Prerequisites:** brak.
- **Pliki do czytania:** `src/App.jsx` (grep `^const hkW=|^const hkFmtDate=|^const hkDayOfWeek=` — okolice linii 1542+).
- **Co zrobić:**
  1. Read 1540-1555.
  2. Stwórz `src/lib/hk.js` z named exports tych helpers.
  3. Dodaj `import { hkW, hkFmtDate, hkDayOfWeek } from './lib/hk';` w App.jsx po pozostałych libowych importach.
  4. Usuń definicje z App.jsx.
- **Walidacja:** `npx vite build`. Otwórz HK panel — funkcje muszą działać.
- **Estymacja:** ~15 min, ~20k tokens.

## Sesja R-A6 — Wydziel HK PDF helpers do `src/lib/pdf-hk.js`
- **Cel:** Wynieść `downloadHKMain/RoomList/Status/CleaningList/Excel` z App.jsx (~1455-2050) do `src/lib/pdf-hk.js`.
- **Prerequisites:** R-A5 może być pomocna ale nie wymagana.
- **Pliki do czytania:** `src/App.jsx` (grep `^function downloadHK` — 5 funkcji).
- **Co zrobić:**
  1. Read kompletne body tych 5 funkcji (uwaga: ~600 linii łącznie).
  2. Sprawdź zależności od getFullName, EMPLOYEE_FULL_NAMES, hkW, fmtMoney etc.
  3. Stwórz `src/lib/pdf-hk.js` z importami z `./pdf`, `./format`, `./constants`, `./hk`.
  4. Funkcje wymagające `getFullName` → dodaj parametr `getFullName` do sygnatury LUB najpierw wydziel `EMPLOYEE_FULL_NAMES` + `getFullName` do `src/lib/employees.js`.
  5. Edit App.jsx: dodaj imports, usuń definicje, podmień call sites jeśli signature się zmieniła.
- **Walidacja:** `npx vite build`. Manualnie: HK panel → eksport każdego z 5 PDF (dane testowe wystarczą).
- **Estymacja:** średnie ryzyko, ~1h, ~70k tokens. Codex review wymagany.

## Sesja R-B1 — Wydziel modal `ConfirmModal` do `src/components/modals/ConfirmModal.jsx`
- **Cel:** Pierwszy modal na nowym wzorcu — proof of concept dla całego etapu B.
- **Prerequisites:** brak.
- **Pliki do czytania:** `src/App.jsx` (grep `function ConfirmModal` — okolice 505+).
- **Co zrobić:**
  1. Read kompletny ConfirmModal (~15 linii).
  2. Stwórz `src/components/modals/ConfirmModal.jsx` z `import { motion } from 'framer-motion';`.
  3. Edit App.jsx: dodaj import, usuń definicję, zachowaj wszystkie call sites (`<ConfirmModal ...>`).
- **Walidacja:** `npx vite build`. Manualnie wywołać ConfirmModal (np. usuń zadanie → confirm).
- **Estymacja:** ~15 min, ~20k tokens. Wzór dla R-B2..R-B10.

## Sesja R-B2 — Wydziel `PreShiftModal`
- **Cel:** Drugi modal jak R-B1.
- **Prerequisites:** R-B1 (wzór + folder już istnieje).
- **Pliki do czytania:** `src/App.jsx` (grep `function PreShiftModal`).
- **Co zrobić:** analogicznie do R-B1. PreShiftModal używa `loadJson`/`STORAGE_KEYS`/`SHIFT_LABELS_PL` — importuj.
- **Walidacja:** `npx vite build`. Pre-shift modal otwiera się przy login z aktywnymi alertami.
- **Estymacja:** ~25 min, ~30k tokens.

## Sesja R-B3 — Wydziel `MessageModal`, `GlobalSearchModal`, `EmployeeReportModal`
- **Cel:** Trzy modale na raz (każdy podobny wzór).
- **Prerequisites:** R-B1.
- **Pliki do czytania:** `src/App.jsx` (3 grep'y).
- **Co zrobić:** trzy osobne pliki w `src/components/modals/`.
- **Walidacja:** `npx vite build` + smoke test każdego modala.
- **Estymacja:** ~45 min, ~60k tokens. Albo rozbij na R-B3a, R-B3b, R-B3c jeśli ryzyko za duże.

## Sesja R-B4 — Wydziel `CorrectionApprovalModal` + `AuditLogModal`
- **Cel:** Dwa modale admina.
- **Prerequisites:** R-B1.
- **Pliki do czytania:** `src/App.jsx` (2 grep'y).
- **Walidacja:** `npx vite build` + admin → korekta → approval flow + audit log open.
- **Estymacja:** ~30 min, ~40k tokens.

## Sesja R-B5 — Wydziel modal `Faults` (FaultFormModal + FaultDetailsModal + FloorMap)
- **Cel:** Trzy elementy faults UI.
- **Prerequisites:** R-B1.
- **Pliki do czytania:** `src/App.jsx` (3 grep'y).
- **UWAGA:** `FloorMap` używa `FAULT_FLOORS` (pre-existing drift trap z Codex finding) i może być coupled z HK_FLOOR1/2/3 lazy.
- **Walidacja:** `npx vite build` + zgłoś usterkę → FloorMap render → status update.
- **Estymacja:** ~30 min, ~40k tokens.

## Sesja R-B6 — Wydziel `AdhocTaskFormModal`
- **Cel:** Modal HK ad-hoc.
- **Prerequisites:** R-B1.
- **Walidacja:** `npx vite build` + HK panel → dodaj ad-hoc task.
- **Estymacja:** ~15 min, ~20k tokens.

## Sesja R-B7 — Wydziel `WorkerSidebar` + `AdminSidebarRail`
- **Cel:** Dwa sidebary do `src/components/Rail/`.
- **Prerequisites:** R-B1 (wzór folder).
- **Pliki do czytania:** `src/App.jsx` (linie ~1107+ WorkerSidebar, ~1230+ AdminSidebarRail).
- **UWAGA:** Sidebars mają wiele propów — zachowaj sygnatury.
- **Walidacja:** `npx vite build` + render obu (worker + admin).
- **Estymacja:** ~45 min, ~50k tokens.

## Sesja R-B8 — Wydziel `InboxPanel` + `WikiList`
- **Cel:** Dwa pomocnicze widgety.
- **Prerequisites:** R-B1.
- **Walidacja:** `npx vite build` + worker → Informacje + Wiki drawer.
- **Estymacja:** ~25 min, ~30k tokens.

---

# Sesje — REFAKTOR (Etap C — moduły z lokalnym state)

> **UWAGA:** Etap C ma najwyższe ryzyko. Wykonaj R-A5/A6 + R-B1..R-B8 zanim zaczniesz.

## Sesja R-C1 — Wydziel `src/modules/HK/` (HKPanel + HKLivePanel + AdhocTasksPanel)
- **Cel:** Cały HK module poza App.jsx.
- **Prerequisites:** R-A5, R-A6, R-B6, R-B8.
- **Pliki do czytania:** `src/App.jsx` (grep `function HKPanel|function HKLivePanel|function AdhocTasksPanel|function KWHotelPanel|function KWHotelAdminPanel`).
- **UWAGA:** ~1500 linii łącznie. Rozważ rozbicie na R-C1a (HKPanel), R-C1b (HKLivePanel), R-C1c (Adhoc + KWHotel).
- **Walidacja:** `npx vite build` + HK panel pełen test (admin + worker view + ad-hoc + Excel export).
- **Estymacja:** wysokie ryzyko, ~3h, ~120k tokens. **Codex review wymagany.**

## Sesja R-C2 — Wydziel `src/modules/Faults/`
- **Cel:** FaultsPanel + powiązane.
- **Prerequisites:** R-B5.
- **Walidacja:** `npx vite build` + zgłoszenie + status update + filter.
- **Estymacja:** ~1h, ~50k tokens.

## Sesja R-C3 — Wydziel `src/modules/Login/`
- **Cel:** Pełnoekranowy login screen.
- **Prerequisites:** R-A5, R-B7.
- **UWAGA:** Najczulsza ścieżka — login. Codex review konieczny.
- **Walidacja:** `npx vite build` + 4 ścieżki login (worker auto, worker manual, admin auto, admin manual).
- **Estymacja:** wysokie ryzyko, ~1h, ~50k tokens.

## Sesja R-C4 — Wydziel `src/modules/Parking/` + `src/modules/StaliGoscie/`
- **Cel:** Dwa proste moduły.
- **Prerequisites:** R-B1.
- **Walidacja:** `npx vite build` + render obu w admin.
- **Estymacja:** ~45 min, ~40k tokens.

## Sesja R-C5 — Wydziel `src/modules/Admin/` (panele admina poza HK/Faults/Parking/Goscie)
- **Cel:** AdminMessagesPanel + ManualDailyReportPanel + RailwaySettings + ScheduleAdmin (jeśli istnieje) etc.
- **Prerequisites:** R-B1..R-B8.
- **Walidacja:** `npx vite build` + każda zakładka admina.
- **Estymacja:** ~1.5h, ~80k tokens.

## Sesja R-C6 — Wydziel `src/modules/ShiftFinish/`
- **Cel:** Shift Finish Modal (~7691+, kompleksowy 2-step).
- **Prerequisites:** R-B1, R-A6.
- **Walidacja:** `npx vite build` + zakończenie zmiany 3 typów (poranna/wieczorowa/nocna z deposit).
- **Estymacja:** średnie ryzyko, ~45 min, ~50k tokens.

---

# Sesje — CODEX BUG FIXES (z poprzednich review)

## Sesja F1 — Fix `chk` page-break w `src/lib/pdf.js` (HIGH)
- **Cel:** Naprawić bug page-break: `mkPDF_kv/_paragraph/_item` używają stale `y` po wywołaniu `chk()`.
- **Prerequisites:** brak.
- **Pliki do czytania:** `src/lib/pdf.js` (cały plik, ~70 linii).
- **Co zrobić:**
  1. Refactor `chk` callback signature: zamiast mutować outer `y`, niech `chk(n)` zwraca nowe `y` jeśli zaszedł page break.
  2. Każda funkcja mkPDF_* musi: `if (chk) { const newY = chk(8); if (newY != null) y = newY; }`.
  3. Albo prościej: caller passuje `getY` + `setY` zamiast nieprzezroczystego `chk`.
  4. Wybierz najmniej inwazyjne — sprawdź wszystkie 5 call sites w download*PDF (App.jsx).
- **Walidacja:** `npx vite build` + wygeneruj PDF z dużą zawartością → page break musi działać czysto.
- **Estymacja:** ~45 min, ~40k tokens. **Codex review wymagany.**

## Sesja F2 — Fix `value || "-"` falsy w `src/lib/pdf.js` (MED)
- **Cel:** `mkPDF_kv` i `mkPDF_paragraph` zamieniają `0`, `false`, `""` na `"-"`/`""`.
- **Pliki:** `src/lib/pdf.js`.
- **Co zrobić:** Zmień `value || "-"` na `value ?? "-"` (nullish coalescing). Sprawdź 3 lokacje.
- **Walidacja:** `npx vite build`. Test: stała kasowa = 0 → PDF musi pokazać "0,00 zł" nie "-".
- **Estymacja:** ~10 min, ~15k tokens.

## Sesja F3 — Fix `loadJson` shape validation (MED)
- **Cel:** `loadJson` zwraca `null` jeśli storage zawiera "null", co rozwala caller assumes object.
- **Pliki:** `src/lib/storage.js`.
- **Co zrobić:** `if (r === null) return fallback;` po `JSON.parse`. ALBO opcjonalny 3-ci arg `validator(value) => boolean`.
- **Walidacja:** `npx vite build`. Test: `localStorage.setItem("reception-final-tasks", "null")` → app musi załadować się bez crash.
- **Estymacja:** ~15 min, ~20k tokens.

## Sesja F4 — Fix `new Date(YYYY-MM-DD)` UTC quirk (MED)
- **Cel:** Daty `new Date("2026-04-26")` są UTC midnight, czyli mogą offsetować dzień w niektórych strefach.
- **Pliki:** `src/App.jsx` (3 call sites na ~5178, ~5904, ~6502 z Codex), pomocniczo `src/lib/dates.js`.
- **Co zrobić:** Dodaj helper `parseDayKey(s)` w `src/lib/dates.js` który robi `new Date(y, m-1, d)` (lokalna strefa). Zamień 3 call sites.
- **Walidacja:** `npx vite build`. Test: zmiana daty raportu wstecz → label zgadza się z oczekiwanym dniem.
- **Estymacja:** ~25 min, ~25k tokens.

## Sesja F5 — Fix `defaultWikiEntries.updatedAt` lazy (LOW)
- **Cel:** `updatedAt` jest evaluated raz przy import → pokazuje import-time, nie aktualny czas seed'u.
- **Pliki:** `src/lib/constants.js`, `src/App.jsx`.
- **Co zrobić:** Zmień `defaultWikiEntries` na **funkcję factory** `getDefaultWikiEntries()` która zwraca świeże entries z `new Date().toLocaleString(...)` przy każdym wywołaniu. Albo: w App.jsx przy seedowaniu wywołaj `entries.map(e => ({...e, updatedAt: fmt()}))`.
- **Walidacja:** `npx vite build`. Reset localStorage → refresh → `updatedAt` w wiki musi pokazywać moment refresh, nie import.
- **Estymacja:** ~15 min, ~15k tokens.

## Sesja F6 — Fix `FAULT_FLOORS` drift trap (LOW)
- **Cel:** `FAULT_FLOORS` exported ale nieużywany — UI rebuilds floors locally w App.jsx ~3935.
- **Pliki:** `src/lib/constants.js`, `src/App.jsx`.
- **Co zrobić:** ALBO usuń export `FAULT_FLOORS` z constants.js + import z App.jsx (jeśli faktycznie nieużywane), ALBO zmodyfikuj App.jsx ~3935 żeby używał `FAULT_FLOORS` z constants i nie rebuildował lokalnie.
- **Walidacja:** `npx vite build` + zgłoszenie usterki na każdym piętrze.
- **Estymacja:** ~20 min, ~20k tokens.

---

# Sesje — REFINE (poprawki UX/UI istniejących widoków)

## Sesja UX1 — Worker "Wiki" — search box + TOC + badge "nowe"
- **Cel:** Wikipedia tab — szybsze wyszukiwanie + nawigacja.
- **Prerequisites:** brak.
- **Pliki do czytania:** `src/App.jsx` (grep `function WikiList|workerTab==="wiki"`).
- **Co zrobić:**
  1. Add search input filter na top.
  2. Mini TOC (lista topics) po prawej stronie sticky.
  3. Badge "nowe" na entry z `updatedAt > wikiLastSeen`.
- **Walidacja:** `npx vite build` + wiki render z >5 entries.
- **Estymacja:** ~45 min, ~50k tokens.

## Sesja UX2 — Worker "Wiadomości" — grouping + empty state ilustracja
- **Cel:** Inbox UX poprawa.
- **Pliki do czytania:** `src/App.jsx` (grep `function InboxPanel`).
- **Co zrobić:**
  1. Group messages per `created_by` (kierownik) z header per group.
  2. Pin/expires_at badge.
  3. Empty state SVG ilustracja albo gradient placeholder zamiast "Brak wiadomości".
- **Walidacja:** `npx vite build` + render z 0/1/5 wiadomościami.
- **Estymacja:** ~30 min, ~40k tokens.

## Sesja UX3 — Worker "Usterki" — mini-kanban view
- **Cel:** Faults list → 3 kolumny (Nowa/W trakcie/Zamknięta) zamiast linear list.
- **Prerequisites:** brak (ale R-C2 łatwiej).
- **Pliki do czytania:** `src/App.jsx` (grep `function FaultsPanel`).
- **Co zrobić:**
  1. Group faults per `status`.
  2. CSS grid 3 kolumny z `.cc-kanban-col` (już istnieje w style.css ~551).
  3. Każda card draggable opcjonalnie (bonus).
- **Walidacja:** `npx vite build` + faults z różnymi statusami.
- **Estymacja:** średnie ryzyko, ~1h, ~60k tokens.

## Sesja UX4 — AdhocTasksPanel — timeline z progiem czasowym
- **Cel:** Pokaż wizualnie progi 10:00/12:00 i bieżący czas → broadcast mode.
- **Pliki do czytania:** `src/App.jsx` (grep `function AdhocTasksPanel|computeBroadcastMode`).
- **Co zrobić:** Add SVG/div timeline 6:00-22:00 z markerami progów + dot bieżącej godziny + label "Tryb: all_morning / pm_only".
- **Walidacja:** `npx vite build` + render przed i po progu.
- **Estymacja:** ~45 min, ~50k tokens.

## Sesja UX5 — Shift Finish Modal — stepper + Lottie checkmark
- **Cel:** A8 z NEXT_SESSION + REFINE list.
- **Prerequisites:** **wymaga `npm install lottie-react`** (poproś usera o zgodę).
- **Pliki do czytania:** `src/App.jsx` (grep `finishModal|finishDialogOpen|finishShift`).
- **Co zrobić:**
  1. `npm install lottie-react` (dopytaj zanim odpalisz!).
  2. Pobierz/stwórz `public/lottie/check-plum.json` (~30KB, plum #5a1d4a).
  3. Add stepper 1/2 visual w nagłówku modala.
  4. Po `finishShift` → 1.5s Lottie + auto-redirect 3s do loginu.
- **Walidacja:** `npx vite build` + zakończ zmianę pełnym flow.
- **Estymacja:** ~1h, ~60k tokens. **Wymaga decyzji użytkownika o npm install.**

## Sesja UX6 — Worker "Zmiana" — auto-animate na liście tasków
- **Cel:** Animacja add/remove/sort dla `<ul>` tasków.
- **Prerequisites:** **wymaga `npm install @formkit/auto-animate`**.
- **Pliki do czytania:** `src/App.jsx` (zadania w "Zmiana" tab).
- **Co zrobić:**
  1. `npm install @formkit/auto-animate` (zgoda usera!).
  2. `import { useAutoAnimate } from '@formkit/auto-animate/react';`.
  3. `const [parent] = useAutoAnimate();` na każdej `<ul>` z taskami.
- **Walidacja:** `npx vite build` + dodaj/usuń task → animacja.
- **Estymacja:** ~20 min, ~25k tokens.

---

# Sesje — REDESIGN (większe zmiany)

## Sesja D1 — R4 wariant B: HK timeline (swimlanes per pracownik)
- **Cel:** HKPanel admin view → widok kalendarzowy 08-16 z agentami jako swimlanes.
- **Prerequisites:** R-C1 lepiej zrobione (HK module wydzielony).
- **Pliki do czytania:** `src/App.jsx` lub `src/modules/HK/HKPanel.jsx`.
- **Co zrobić:**
  1. Plan: SVG/CSS grid `.cc-hk-timeline` z 9 kolumn godzin.
  2. Każda pokojówka = 1 row.
  3. Pokój przypisany = blok z czasem czyszczenia (apt ×3).
  4. Ad-hoc burst = ⚡ marker.
- **Walidacja:** `npx vite build` + HK render z 5+ przypisaniami.
- **Estymacja:** wysokie ryzyko (nowy widok), ~3h, ~100k tokens. **Najpierw plan + ASCII mockup w chat → user zatwierdza → implementacja.**

## Sesja D2 — R4 wariant C: HK mobile dla pokojówki
- **Cel:** Osobny entry point `/hk-mobile?token=...` z compact list dla telefonu.
- **Prerequisites:** D1 może (ale niezależne), B11 backend (Supabase auth) idealnie.
- **Pliki:** nowy `public/hk-mobile/index.html`, nowy `src/modules/HKMobile/`.
- **UWAGA:** Wymaga zmiany `vite.config.js` (multi-entry), nowy auth flow.
- **Estymacja:** wysokie ryzyko, ~4h, ~120k tokens. **Wymaga osobnego planowania w Plan Mode.**

---

# Sesje — BACKEND (wymagają decyzji + setup'u Supabase)

## Sesja B1 — Supabase setup + multi-tenant fundament
- **Cel:** Stworzyć projekt Supabase, schema multi-tenant, klient.
- **Prerequisites:** **decyzja produktowa o Supabase** + utworzenie projektu w Supabase Dashboard.
- **Pliki:** nowe `src/lib/supabase/{client,realtime,syncQueue}.js`, `.env.local`, `supabase/migrations/0001_init.sql`.
- **Co zrobić:**
  1. `npm install @supabase/supabase-js` (zgoda!).
  2. Schema z `tenant_id` we wszystkich tabelach.
  3. RLS permisywne dla anon + plan zaostrzenia.
  4. Auth: magic link albo email/password — DECYZJA.
- **Estymacja:** wysokie ryzyko + zewnętrzna usługa, ~3h, ~80k tokens. **Plan Mode + Codex review schema obowiązkowo.**

## Sesja B2 — HK migration na Supabase Realtime
- **Prerequisites:** B1 + R-C1.
- **Estymacja:** ~3h, ~100k tokens.

## Sesja B3 — CRUD admin alerts/reminders
- **Prerequisites:** B1.
- **Estymacja:** ~2h, ~60k tokens.

## Sesja B4 — Vouchers + BookingReviews + ChatGPT/Claude reply
- **Prerequisites:** B1 + decyzja o AI provider.
- **Pliki:** nowe `src/modules/Vouchers/`, `src/modules/BookingReviews/`, `supabase/functions/ai-reply/index.ts`.
- **Estymacja:** ~5h, ~150k tokens.

## Sesja B5 — TeamChat + SwapProposal
- **Prerequisites:** B1.
- **Estymacja:** ~4h, ~120k tokens.

## Sesja B6 — Push notifications (web + Electron)
- **Prerequisites:** B1.
- **Pliki:** nowy `public/sw.js`, `src/lib/push.js`, `supabase/functions/push-notify/index.ts`, edycja `electron/main.cjs` + `electron/preload.cjs`.
- **Estymacja:** ~4h, ~120k tokens.

## Sesja B7 — Grafik Excel + auto-shift
- **Prerequisites:** B1.
- **Pliki:** nowe `src/modules/ScheduleAdmin/`, `src/lib/excel.js` (uses `xlsx` already installed).
- **Estymacja:** ~2h, ~60k tokens.

## Sesja B8 — Mailowanie raportów (Resend Edge Function)
- **Prerequisites:** B1.
- **Estymacja:** ~2h, ~60k tokens.

## Sesja B9 — Konserwator PWA mobile
- **Prerequisites:** B1, D2 idealnie.
- **Estymacja:** ~5h, ~150k tokens. **Plan Mode obowiązkowy.**

## Sesja B10 — Edytowalność (koniec hardcoded)
- **Prerequisites:** B1.
- **Cel:** HK_WORKERS, PARTER_SPACES, ADMIN_PASSWORD itp. → `app_settings` per tenant.
- **Estymacja:** ~3h, ~100k tokens.

## Sesja B11 — HK ad-hoc → mobile
- **Prerequisites:** B2, B6, B9.
- **Estymacja:** ~3h, ~100k tokens.

---

# Sesje — DESIGN SYSTEM (Figma)

> Tylko jeśli użytkownik zdecyduje się na pracę w Figmie.

## Sesja DS1 — Stwórz plik Figma + Foundations
- **Cel:** Manualnie stworzyć plik z 4 collections Variables (Core / Conrad Theme / Typography / Layout) zgodnie z planem PLAN-MODE w `~/.claude/plans/plan-mode-conrad-parallel-turtle.md` sekcja 4.
- **Pliki:** brak edycji kodu — tylko Figma.
- **Estymacja:** ~3h ręcznie w Figmie. Po skończeniu → udostępnij Claude Code link do frame'a, użyję `mcp__figma-global__get_design_context`.

## Sesja DS2 — Login wariant A/B/C frame'y w Figmie
- **Prerequisites:** DS1.
- **Estymacja:** ~3h.

## Sesja DS3 — Reception Dashboard A/B/C
- **Prerequisites:** DS1.
- **Estymacja:** ~6h.

## Sesja DS4 — Admin Overview A/B/C + Cmd+K palette
- **Prerequisites:** DS1.
- **Estymacja:** ~8h.

## Sesja DS5 — HK timeline B + mobile C
- **Prerequisites:** DS1.
- **Estymacja:** ~5h.

## Sesja DS6 — Modals + greenfield (Vouchers/Chat/Schedule/Konserwator/Onboarding)
- **Prerequisites:** DS1.
- **Estymacja:** ~10h.

---

# CHECKLIST WYKONANIA

## Cleanup
- [ ] C1 — Admin login flow A4
- [ ] C2 — Manager toggle bar mini A10
- [ ] C3 — dark-shell konsolidacja A13
- [ ] C4 — EMPTY_LABEL helper A14

## Refaktor Etap A (finalizacja)
- [ ] R-A5 — HK helpers
- [ ] R-A6 — HK PDF helpers

## Refaktor Etap B (modale + sidebary)
- [ ] R-B1 — ConfirmModal
- [ ] R-B2 — PreShiftModal
- [ ] R-B3 — Message + Search + Employee Report modals
- [ ] R-B4 — Correction + Audit modals
- [ ] R-B5 — Faults modals + FloorMap
- [ ] R-B6 — AdhocTaskFormModal
- [ ] R-B7 — WorkerSidebar + AdminSidebarRail
- [ ] R-B8 — InboxPanel + WikiList

## Refaktor Etap C (moduły)
- [ ] R-C1 — HK module
- [ ] R-C2 — Faults module
- [ ] R-C3 — Login module
- [ ] R-C4 — Parking + StaliGoscie
- [ ] R-C5 — Admin module
- [ ] R-C6 — ShiftFinish module

## Codex bug fixes
- [ ] F1 — pdf chk page-break (HIGH)
- [ ] F2 — pdf falsy normalization
- [ ] F3 — loadJson null shape
- [ ] F4 — Date UTC quirk
- [ ] F5 — defaultWiki updatedAt lazy
- [ ] F6 — FAULT_FLOORS drift trap

## REFINE
- [ ] UX1 — Wiki search + TOC
- [ ] UX2 — Wiadomości grouping
- [ ] UX3 — Usterki kanban
- [ ] UX4 — Adhoc timeline
- [ ] UX5 — Shift Finish stepper + Lottie (npm install)
- [ ] UX6 — Auto-animate tasks (npm install)

## REDESIGN
- [ ] D1 — HK timeline B
- [ ] D2 — HK mobile C

## Backend (sequential, post Supabase setup)
- [ ] B1 — Supabase + multi-tenant fundament
- [ ] B2 — HK Realtime
- [ ] B3 — Admin alerts CRUD
- [ ] B4 — Vouchers + BookingReviews + AI
- [ ] B5 — TeamChat
- [ ] B6 — Push notifications
- [ ] B7 — Schedule Excel
- [ ] B8 — Email raportów
- [ ] B9 — Konserwator PWA
- [ ] B10 — Edytowalność (hardcoded → app_settings)
- [ ] B11 — HK ad-hoc mobile

## Design System (Figma)
- [ ] DS1 — Figma setup + Foundations
- [ ] DS2 — Login frames
- [ ] DS3 — Dashboard frames
- [ ] DS4 — Admin frames
- [ ] DS5 — HK frames
- [ ] DS6 — Modals + greenfield frames

---

# OPENER TEMPLATE (do wklejenia na start każdej sesji)

```
Folder projektu: c:\Users\grzan\Desktop\projekt
Stack: React 18, Vite 5, Electron 31, jspdf, framer-motion, lucide-react.
Wydzielone: src/lib/{storage,constants,dates,format,pdf}.js (Object.freeze gdzie się da, named exports).
NIE używaj polskich cudzysłowów "…" w JSX (parser fail) — używaj '...' albo &quot;.

Wykonaj sesję [TUTAJ wklej całą sekcję sesji z WORK_PLAN.md].

Po skończeniu: `npx vite build` musi przejść. Krótki raport: pliki zmienione, build status, ryzyka.
```
