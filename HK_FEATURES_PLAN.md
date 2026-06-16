# Plan: Housekeeping — usterki, agent AI, UX telefonu, bug liczby pokoi

Status: **PLAN** (bez implementacji). Decyzje użytkownika wbudowane.

## Architektura (stan obecny)
- **Telefony HK**: `public/hk-phone/index.html` (flat HTML), deploy GitHub Pages + Supabase Storage (`deploy-hk-phone.mjs`, `upload-hk-phone.mjs`).
- **Backend**: Supabase (DB + Storage + RLS). Tabele: `hk_rooms`, `hk_logs`, `hk_tasks`, `hk_plan`, `hk_workers`. Migracje w `supabase/migrations/`.
- **Recepcja (desktop)**: `src/modules/HK/HKLivePanel.jsx`, `HKPanel.jsx`. Przypisania z `hk_plan.assignments` (lub `hkData`), live przez realtime.
- **Maile**: `scripts/hk-automation/` parsuje maile → raporty pokoi → sync do Supabase. UWAGA: `assignments` NIE pochodzą z maila (komentarz w `supabase-sync.cjs`), są z aplikacji recepcji.
- **Usterki dziś**: `FaultFormModal.jsx` / `FaultDetailsModal.jsx` + `STORAGE_KEYS.faults` (localStorage, tylko recepcja).

## Decyzje użytkownika
1. Agent AI = **silnik regułowy** (deterministyczny, bez LLM).
2. Konserwacja widzi usterki = **osobna strona telefonu** (link).
3. Usterki = **zapis na stałe w chmurze (Supabase), bez usuwania**; status naprawy edytowalny.
4. Usterki = **jeden ujednolicony system** na Supabase (recepcja + HK razem).

---

## FAZA 0 — Backend Supabase (fundament) `[migracja SQL]`
Nowa migracja `supabase/migrations/0004_faults.sql`:
- Tabela `faults`:
  `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`,
  `source text` (`hk`|`reception`), `room text`, `worker text`, `description text`,
  `photos text[]` (ścieżki w Storage), `status text default 'otwarta'`
  (`otwarta`|`w_toku`|`naprawiona`), `resolved_by text`, `resolved_at timestamptz`,
  `meta jsonb`.
- **RLS (niezmienność)**: `anon` → INSERT ✓, SELECT ✓, UPDATE **tylko** kolumn
  `status/resolved_by/resolved_at` (trigger blokujący zmianę `description/photos/room`),
  DELETE ✗ (brak polityki = zablokowane). Opis i zdjęcia trwałe.
- **Storage bucket** `hk-faults` (public read), polityka: insert ✓, delete ✗.
- Walidacja: `select`/`insert` z anon key; próba `delete` musi się odbić.

## FAZA 1 — Usterki na telefonie HK `[public/hk-phone/index.html]`
Cel: na dole każdego pokoju opcja „Usterka".
- W `renderReportPanel(room)` (po sekcji raportu) dodać blok **Usterka**:
  - `<textarea>` „co się stało",
  - `<input type="file" accept="image/*" capture="environment" multiple>` — aparat
    lub galeria (na mobile daje wybór),
  - podgląd miniatur, przycisk „Zgłoś usterkę".
- Funkcja `reportFault(room)`:
  1. upload każdego zdjęcia do Storage `hk-faults/${date}/${uid}.jpg`,
  2. `sb.from('faults').insert({source:'hk', room, worker:WORKER, description, photos})`,
  3. wpis do `hk_logs` (action `usterka`), toast.
- Bez możliwości edycji/usunięcia po stronie telefonu.
- Ryzyka: rozmiar zdjęć (kompresja w canvas przed uploadem ~1600px/JPEG 0.7).

## FAZA 2 — Wpisywanie liczb zamiast +/− `[public/hk-phone/index.html]`
- `renderReportPanel`: zamienić stepery `−/＋` na
  `<input type="number" inputmode="numeric" min="0">` dla pozycji `LINEN` oraz
  dla wierszy „Dodatkowe pozycje" (count). `oninput` → zapis do `getReport`/`getExtra`.
- Usunąć `changeCount` (lub zostawić jako no-op kompat).
- Zachować przycisk „+ Dodaj pozycję" i „✓ Gotowe".
- Walidacja: liczby zapisują się do `report` przy `doneRoom`.

## FAZA 3 — Usunięcie wymiany pokoi przez pracowników `[public/hk-phone/index.html]`
- Usunąć: `transferRooms`, `requestRooms`, `acceptRequest`, `rejectRequest`,
  `parsePendingExchanges`, zakładkę/UI „Zespół" z przyciskami handoffu,
  `.transfer-btn`/`.request-btn`, badge `myPending`.
- Telefon tylko **odzwierciedla** przypisania z `hk_plan` (read-only co do składu).
- Ryzyko: `hk_logs` typu exchange — zostawić historyczne, nie generować nowych.

## FAZA 4 — Strona konserwacji `[public/hk-phone/konserwacja.html` (nowy)]`
- Osobny flat HTML (wzorzec `index.html`): lista `faults` z Supabase (realtime),
  filtr status, miniatury zdjęć (klik → pełny ekran), data/pokój/zgłaszający.
- Akcje: zmiana statusu `otwarta → w_toku → naprawiona` (UPDATE statusu, dozwolone).
- Brak usuwania. Dodać do `deploy-hk-phone.mjs` `ALL_FILES` + `upload-hk-phone.mjs`.
- Link: `…github.io/hk-phone/konserwacja.html`.

## FAZA 5 — Ujednolicenie usterek w recepcji `[src/components/modals/Fault*, HKPanel/faults panel]`
- `FaultFormModal`/`FaultDetailsModal` + panel usterek: czytać/pisać `faults` na
  Supabase zamiast `STORAGE_KEYS.faults`.
- Migracja jednorazowa istniejących lokalnych usterek → Supabase (skrypt + przy starcie).
- Panel usterek recepcji pokazuje **wspólną** listę (recepcja + HK) ze zdjęciami,
  statusem, źródłem. Status edytowalny, brak usuwania (zgodnie z wymogiem).
- Fallback gdy `supabaseReady===false` (Electron offline): kolejka `syncQueue.js`.
- Ryzyko: największa zmiana — etap po etapie, zachować kompatybilność kształtu.

## FAZA 6 — Agent AI rekomendacji zamian (regułowy) `[src/modules/HK/HKLivePanel.jsx + nowy src/lib/hkAgent.js]`
- `src/lib/hkAgent.js` — czysta funkcja `suggestReassignments({assignments, roomStates, now, shiftStart})`:
  - sygnały: pokoje pozostałe na pracownika (`W`), tempo (done/elapsed),
    kto skończył (0 `W`), kto zalega (dużo `W` + niskie tempo),
  - reguła: gdy ktoś wolny i ktoś przeciążony → zaproponuj przeniesienie N pokoi
    (priorytet: pokoje jeszcze nietknięte, najbliżej geograficznie wg numeru),
  - zwraca listę sugestii `{from, to, rooms[], reason}`.
- HKLivePanel: panel „Sugestie agenta" z `[Zastosuj] [Odrzuć]`. Zastosuj → update
  `hk_plan.assignments` + `hk_rooms.worker` (jak istniejące `transferRooms`, ale
  **po stronie recepcji**). Odrzuć → ukryj.
- **Testowalne**: `hkAgent.js` to czysta funkcja → pełne pokrycie w symulacji L1.
- Ryzyko: reguły muszą unikać „migotania" sugestii (debounce/min. próg różnicy).

## FAZA 7 — Bug: liczba pokoi z maila nie pokazuje się `[diagnoza najpierw]`
- Reprodukcja: ustalić DOKŁADNIE — który ekran i która liczba (suma pokoi z maila
  vs przypisane). Kandydaci:
  - automatyzacja syncuje raporty, ale `hk_plan.assignments` puste (recepcja nie
    wygenerowała) → `HKLivePanel` liczy 0,
  - liczba „z maila" (total do sprzątania) nie jest nigdzie wyświetlana jako KPI,
  - rozjazd `date` (TODAY w telefonie vs data planu).
- Plan: prześledzić `mail.cjs`→`parser.cjs`→`rooms.cjs`→Supabase→`HKLivePanel`,
  dodać KPI „Pokoje z maila: N" jeśli brakuje. **Wymaga 1 zrzutu ekranu / opisu
  od użytkownika gdzie ma być ta liczba.**

---

## Kolejność wykonania (rekomendowana)
0 (backend) → 7 (diagnoza buga, szybka wartość) → 2 (inputy, łatwe) →
1 (usterki telefon) → 4 (strona konserwacji) → 5 (ujednolicenie recepcji) →
3 (usunięcie handoffu) → 6 (agent AI).

## Walidacja
- L1 sim: `hkAgent.js` (faza 6), kompresja/escape (faza 1).
- L2 sim: cykl usterki insert→select→status (mock Supabase), niemożność delete.
- Ręcznie: telefon na realnym mobile (aparat/galeria), realtime recepcja↔telefon.
- Build `vite build` + deploy skrypty (hk-phone, supabase migrate).

## Ryzyka globalne
- Sekrety: `SUPABASE_SERVICE_KEY`/`GITHUB_TOKEN` tylko w `.env`, nigdy w kodzie.
- RLS musi realnie blokować DELETE (test negatywny).
- Rozmiar/koszt Storage zdjęć — kompresja obowiązkowa.
- Offline Electron — kolejka `syncQueue.js` dla faz 5/6.

## Otwarte pytania
1. Bug pokoi z maila: na którym ekranie i jaka liczba? (potrzebny zrzut/opis)
2. Ile zdjęć max na usterkę? (proponuję 5)
3. Czy strona konserwacji ma wymagać prostego kodu/PIN, czy otwarty link?
