# NEXT_SESSION.md — Conrad Comfort Reception Panel

Dokument do wczytania na początku kolejnej sesji. Lista poprawek frontendu (cleanup), zadań backend i mapa plików projektu.

---

## CONTEXT

Aplikacja Electron+React (Vite) dla recepcji hotelu Conrad Comfort. Stack: React 18, Vite, Electron, jsPDF, framer-motion, lucide-react, qrcode, lottie-react, @formkit/auto-animate, xlsx. Brand: plum `#5a1d4a` + gold `#c99950`. UI w pełni przebudowany (Rail layout, Hotel Boutique paleta, DM Serif Display nagłówki). Bugi A1/A2/A3 naprawione. Login pełnoekranowy z auto-detekcją zmiany. Wszystkie 9 widoków modułów wdrożone wg wybranych wariantów (1A, 2B, 3A, 4B, 5B, 6B, 7A, 8B, 9B). Dane w localStorage, Supabase czeka na koniec.

---

## CZĘŚĆ A — Frontend cleanup (martwy kod / niepotrzebne UI)

### A1. Usunąć martwy kod login w workerView
[src/App.jsx](src/App.jsx) ~linie **6850-7010** (`workerTab==="zmiana"` + `!started` + panel "Rozpoczęcie zmiany"):
- `loginStep==="name"` i `loginStep==="password"` w panelu **NIGDY** nie są renderowane (pełnoekranowy login je zastępuje przy `loginStep!=="ready"`)
- Zostawić tylko branch `loginStep==="ready"` (krok 3 z auto-shift)
- Usunąć ~150 linii martwego JSX

### A2. Usunąć `AdminTopNav` komponent
[src/App.jsx](src/App.jsx) ~linie **1318-1395**:
- Komponent zdefiniowany ale **nieużywany** (zastąpiony `AdminSidebarRail`)
- Bezpiecznie usunąć całą funkcję

### A3. Usunąć `adminSidebarGroups`
[src/App.jsx](src/App.jsx) ~linie **6072-6107**:
- Tablica grup zdefiniowana ale **nieużywana** (po przejściu na `AdminSidebarRail` jego grupy są w nim hardcoded)
- Bezpiecznie usunąć

### A4. Stary mechanizm logowania kierownika — uproszczenie
[src/App.jsx](src/App.jsx):
- `handleAdminLogin`, `handleManagerSelect`, `adminDialogOpen`, `adminLoginStep`, `adminPassword`, `ManagerSelectModal`
- Po B19 (login z hasłem inline na pełnoekranowym ekranie) **stary flow** jest niepotrzebny
- Zostawić tylko `handleAdminLogout` (wciąż używane w toggle barze i AdminSidebarRail)
- Usunąć ManagerSelectModal komponent, modal `adminDialogOpen` i wszystkie `setAdminDialogOpen` calls

### A5. „Zmień ▾" w karcie zmiany → usunąć po wdrożeniu grafiku Excel
[src/App.jsx](src/App.jsx) panel pełnoekranowego loginu (krok ready) — `<details>` z opcją zmiany shifta:
- Po wdrożeniu grafiku Excel (B18) zmiana jest **narzucana** z grafiku, ręczna zmiana = wyjątek
- Zostawić ale przenieść za feature flag (gdy grafik załadowany → pole readonly z mini-info „Z grafiku")
- Można pokazywać tylko przy braku grafiku w bazie

### A6. Pulsujące tło `.cc-bg-pulse` → usunąć
[src/style.css](src/style.css) i [src/App.jsx](src/App.jsx):
- Klasa `.cc-bg-pulse` + `.cc-bg-pulse-subtle` — używane TYLKO w panelu „Rozpoczęcie zmiany" w workerView który nie jest renderowany
- Po usunięciu martwego kodu (A1) → usuń też CSS

### A7. Sprzątnij wariacje `ssc-rose / sky / amber / violet` — wszystkie używają tych samych stylów teraz
[src/style.css](src/style.css):
- Po przebudowie wszystkie 4 warianty SSC mają ten sam wygląd, różnią się tylko `border-left-color`
- Można uprościć do `.ssc.ssc--accent-plum` / `.ssc.ssc--accent-gold` (BEM)
- Albo zostawić aliasy wstecznie kompatybilnie

### A8. Po zakończeniu zmiany — animacja sukcesu
[src/App.jsx](src/App.jsx) `finishShift`:
- Aktualnie tylko toast „Zmiana zakończona — raport PDF zapisany"
- Dodać Lottie checkmark plum (krótki, 1.5s) + auto-redirect do ekranu logowania po 3s
- (Plan B14 → bez confetti, ale subtelne fade)

### A9. Modal pre-shift — pomijaj gdy wszystkie kategorie puste
[src/App.jsx](src/App.jsx) `handleStartShift`:
- Aktualnie sprawdza `allAck` w localStorage; jeśli kategoria jest pusta, ACK i tak wymaga checkbox'a
- Dodać warunek: jeśli `alerts.length===0 && reminders.length===0 && newWiki.length===0` → pomiń modal całkowicie i wywołaj `actualStartShift()` bezpośrednio

### A10. Top toggle bar dla kierownika — przemyśl czy nie zintegrować z Rail'em
[src/App.jsx](src/App.jsx) `cc-mgr-toggle-bar`:
- Aktualnie pasek pełnej szerokości u góry — zajmuje miejsce
- Alternatywa: przeniesienie do Rail bottom (ikona z dwoma stanami), pasek tylko jeśli >50% pop-out
- Decyzja: zostawić bo daje natychmiastowy wybór, albo zminiaturyzować

### A11. Stałe HK_WORKERS — zsynchronizować z localStorage
[src/App.jsx](src/App.jsx) linia 2697:
- `const HK_WORKERS` = stała 9 osób, ale w UI używamy `hkWorkers` (state z localStorage)
- Stała używana tylko jako default seed
- Można wziąć tylko default i resztę zostawić dynamiczne (już tak jest, ale upewnij się że nigdzie nie ma starego importu)

### A12. Hardcoded RailwayURL fallbacki w electron/hkserver.cjs
[electron/hkserver.cjs](electron/hkserver.cjs) sekcja `getQR`:
- Sprawdzić czy są jeszcze fallbacki na old IP / Railway, usunąć

### A13. Niepotrzebne klasy CSS
[src/style.css](src/style.css):
- `.dark-shell` vs `.app-dark` — używać tylko jednego (`.app-dark` na body wystarcza)
- `.light-shell`, `.dark-main` — nadmiar
- Konsolidacja w jeden globalny `.app-dark`

### A14. Tłumacz „brak danych" / „—" / „nie wprowadzono" — ujednolicić
W całej aplikacji są różne formy: `—`, `-`, `Brak danych`, `Nie wpisano`, `Brak`, `Wpisz na koniec`
- Globalna stała `EMPTY_LABEL = "—"` lub helper `displayValue(v, fallback)`

---

## CZĘŚĆ B — Backend TODO (na koniec)

### B1. Setup Supabase
**Pliki nowe:**
- `src/supabase.js` — klient (createClient + env vars)
- `src/lib/syncQueue.js` — offline buffer (localStorage queue → flush on online)
- `.env.local` — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

**SQL do uruchomienia w Supabase SQL Editor:** patrz plan `linear-meandering-coral.md` Część D2 (pełny schemat: hk_assignments, hk_activity_logs, linen_daily, hk_adhoc_tasks, hk_workers, faults, messages, manager_alerts, standing_reminders, vouchers, booking_reviews, shift_reports, daily_reports, payment_corrections, managers, schedule, caretaker_tokens, push_subscriptions, app_settings, default_tasks, rooms).

**Storage buckets:** `fault-photos`, `reports`, `logo`.

**RLS:** start permisywny (`allow all for anon` per tabela), zaostrzyć po testach.

### B2. Migracja HK na Supabase Realtime
**Pliki:** [src/App.jsx](src/App.jsx) `HKPanel`, `HKLivePanel`
- Zastąpić `loadJson("hk-data-${date}")` / `saveJson(...)` wywołaniami `supabase.from('hk_assignments').select/upsert`
- Subskrypcja Realtime na zmiany — auto-update między urządzeniami
- Pościel → tabela `linen_daily`
- Aktywność HK → tabela `hk_activity_logs`
- Pracownicy HK → tabela `hk_workers`

### B3. CRUD pilne informacje / stałe przypomnienia (admin)
**Pliki nowe:**
- `src/modules/ManagerAlertsAdmin.jsx` — nowa zakładka admin (sidebar Komunikacja → Pilne informacje, dziś placeholder „Wkrótce")
- `src/modules/StandingRemindersAdmin.jsx` — nowa zakładka admin (Komunikacja → Stałe przypomnienia)

**Co robi:**
- Lista + form (+, edit, delete, pin, set expires_at, target_shift)
- Realtime subskrypcja → modal pre-shift dostaje aktualne dane

### B4. Voucher + Booking opinie + ChatGPT
**Pliki nowe:**
- `src/modules/Vouchers.jsx` — zakładka pracownika i managera (typy: pobyt/casback/posiłek)
- `src/modules/BookingReviews.jsx` — lista opinii + import (kierownik wkleja JSON z Booking Extranet, brak publicznego API)
- `src/modules/ReplyComposer.jsx` — chat z Claude API do generowania odpowiedzi na opinie
- `supabase/functions/chatgpt-reply/index.ts` — proxy Edge Function do Anthropic API z kluczem z `app_settings`

**Tabele:** `vouchers`, `booking_reviews`.

### B5. Czat zespołu + wymiana pokoi
**Pliki nowe:**
- `src/modules/TeamChat.jsx` — wewnętrzny czat (kanały: team_general, team_hk, reception_hk, reception_konserwator)
- `src/modules/SwapProposal.jsx` — specjalny typ wiadomości z przyciskami Akceptuję/Odrzucam (przepisuje `person` w hk_assignments)

**Tabela:** `messages` (rozszerzenie istniejącej, dodać kolumny `channel`, `type`, `payload`).

**Realtime:** `supabase.channel('messages')` subskrypcja per kanał.

### B6. Push notifications (Globaltip-style)
**Pliki nowe:**
- `public/sw.js` — Service Worker (push event + notificationclick)
- `src/lib/push.js` — request permission + subscribe + zapis subskrypcji
- `src/components/PushPermissionBanner.jsx` — niennachalny banner "Włącz powiadomienia"
- `supabase/functions/push-notify/index.ts` — Edge Function używająca `web-push` + VAPID keys (z `supabase secrets`)

**Triggery (Postgres webhook → pg_net → Edge Function):**
- INSERT `faults` → konserwator
- UPDATE `faults.status` → recepcja + zgłaszający
- INSERT `hk_adhoc_tasks` (broadcast_mode) → wszyscy poranni HK lub PM
- INSERT `messages` → odbiorca
- INSERT `manager_alerts` → wszyscy aktywni
- 20 min przed końcem zmiany (cron) → ten pracownik

**Electron native:**
- [electron/main.cjs](electron/main.cjs) — `Menu.setApplicationMenu(null)` już zrobione
- Dodać IPC `notify(...)` używający `new Notification({title, body, icon})`
- [electron/preload.cjs](electron/preload.cjs) — eksport `notify`
- Renderer subskrybuje Supabase Realtime → IPC → native notification

**iOS Safari:** wymaga PWA na home screen, dodać banner instrukcji.

### B7. Grafik Excel + auto-detekcja zmiany
**Pliki nowe:**
- `src/modules/ScheduleAdmin.jsx` — admin → upload pliku xlsx → preview + zapis do `schedule`
- `src/lib/excel.js` — parser używający `xlsx` (już zainstalowany)

**Tabela:** `schedule(date, employee, shift_key, start_time, end_time)`.

**Integracja:**
- Przy logowaniu pracownika query `schedule` z `date=today, employee=ten`
- Jeśli wpis istnieje → auto-set `selectedShift` z bazy zamiast `autoDetectShift()`
- Jeśli brak → fallback do `autoDetectShift()` (jak teraz)
- W panelu "Twoja zmiana" pokazać źródło (np. „Z grafiku" / „Auto z godziny")

**Powiadomienia kontekstowe:** 20 min przed `end_time` z grafiku → push „Twoja zmiana kończy się o XX:XX"

### B8. Mailowanie raportów
**Pliki nowe:**
- `supabase/functions/send-report-email/index.ts` — Resend SDK (`npm install resend` w funkcji)
- W app.jsx dodać przycisk „Zapisz i wyślij" obok „Zapisz" przy każdym PDF
- Konfiguracja w `app_settings` (klucz `email_recipients`, `email_provider`)

**Flow:**
1. Generuj PDF lokalnie (jak teraz)
2. Upload do Storage `reports`
3. `supabase.functions.invoke('send-report-email', {...})` z PDF base64 i listą odbiorców
4. Toast „Mail wysłany do X osób"

**Fallback:** `mailto:` link otwierający Thunderbird (gdy SMTP unavailable).

### B9. Konserwator PWA mobile
**Pliki nowe:**
- `public/konserwator/index.html` — osobny entry point dla Vite (multi-entry config)
- `src/modules/FaultsMobile.jsx` — istnieje już logika w `FaultsPanel`, wydzielić mobile-first wariant
- [vite.config.js](vite.config.js) — dodać `rollupOptions.input.konserwator`

**Auth:** JWT w URL param `/konserwator?t=...` → zapis w localStorage telefonu → bez logowania.

**Manager generuje QR:** w `app_settings` lub osobnej tabeli `caretaker_tokens` + przycisk „Wygeneruj QR" w admin Konfiguracja.

### B10. Edytowalność (koniec hardcoded)
**Tabela:** `app_settings(key, value, encrypted)`.

**Sekcja KONFIGURACJA w admin sidebar** — nowa zakładka z formularzami:
- Lista pracowników HK (`hk_workers` table)
- Lista kierowników (`managers` table — z bcrypt password_hash)
- Hasła kierowników (zmiana — Edge Function bcrypt)
- Default tasks per shift (`default_tasks` table)
- Lista pokoi (`rooms` table — z `is_apartment`, `is_trpl`)
- Parter spaces (PARTER_SPACES jako jsonb w app_settings)
- Progi czasowe ad-hoc (10:00 / 12:00)
- SMTP/email konfiguracja (encrypted)
- ChatGPT API key (encrypted)
- Booking creds (encrypted)

### B11. HK ad-hoc tasks → mobile (telefony pokojówek)
[electron/hkserver.cjs](electron/hkserver.cjs):
- Dodać endpoint SSE dla ad-hoc tasks per worker
- Albo migracja całego flow na Supabase Realtime → telefony otwierają stronę z token + subskrypcja

---

## CZĘŚĆ C — Pliki w projekcie (mapa)

### Główne aplikacja
- `c:\Users\grzan\Desktop\projekt\src\App.jsx` — **MEGA plik 7800+ linii**, wszystko w środku. Następna sesja: rozważ podział na moduły (`src/modules/*`)
- `c:\Users\grzan\Desktop\projekt\src\style.css` — globalne style + tokeny Conrad Comfort
- `c:\Users\grzan\Desktop\projekt\src\main.jsx` — entry point React
- `c:\Users\grzan\Desktop\projekt\src\ErrorBoundary.jsx`
- `c:\Users\grzan\Desktop\projekt\src\UpdateBanner.jsx` — banner aktualizacji
- `c:\Users\grzan\Desktop\projekt\src\ui\Logo.jsx` — komponent Logo SVG (variant: full/icon/dotsOnly, tone: dark/light/white)

### Electron
- `c:\Users\grzan\Desktop\projekt\electron\main.cjs` — main process (BrowserWindow, IPC, autoUpdater, savePdf IPC)
- `c:\Users\grzan\Desktop\projekt\electron\preload.cjs` — IPC bridge (contextBridge)
- `c:\Users\grzan\Desktop\projekt\electron\hkserver.cjs` — lokalny HTTP serwer dla pokojówek (SSE, QR codes)
- `c:\Users\grzan\Desktop\projekt\electron\remoteserver.cjs` — proxy do Railway (zdalny serwer HK gdy LAN niedostępny)
- `c:\Users\grzan\Desktop\projekt\electron\kwhotel.cjs` — integracja z KWHotel API
- `c:\Users\grzan\Desktop\projekt\electron\ngrok.cjs` — ngrok tunnel (deprecated?)

### Konfiguracja
- `c:\Users\grzan\Desktop\projekt\package.json` — dependencies
- `c:\Users\grzan\Desktop\projekt\vite.config.js`
- `c:\Users\grzan\Desktop\projekt\index.html` — Vite entry HTML
- `c:\Users\grzan\Desktop\projekt\.env.local` — **DO UTWORZENIA** (Supabase keys)

### Public assets
- `c:\Users\grzan\Desktop\projekt\public\` — będą tu: `sw.js`, `lottie/*.json`, `konserwator/index.html`, `logo/*.svg`

### Plan
- `c:\Users\grzan\Desktop\projekt\NEXT_SESSION.md` — ten plik
- `C:\Users\grzan\.claude\plans\linear-meandering-coral.md` — pełny plan (część B-G nie wdrożona, część A i wybrane warianty wdrożone)

### Storage keys w localStorage (do migracji na Supabase później)
```
reception-final-tasks
reception-final-extra
reception-final-carry
reception-final-admin-session
reception-final-admin-log
reception-final-employee-log
reception-final-reports
reception-final-wiki
reception-emp-reports
reception-admin-user
reception-admin-audit
reception-dated-reminders
reception-handover-notes
reception-worker-dark
reception-admin-dark
reception-sound-enabled
reception-payment-corrections
reception-global-notifications
reception-handover-log
reception-incident-log
reception-reports-full
reception-messages
reception-hk-notes
reception-hk-day-logs
reception-manager-alerts
reception-standing-reminders
reception-wiki-last-seen
reception-faults
reception-hk-adhoc-tasks
reception-hk-adhoc-thresholds
hk-data-YYYY-MM-DD
hk-workers-list
hk-qr-cache
reception-stala-kasowa
reception-kw-total
reception-safe
reception-autosave-note
reception-handover-seen
reception-last-view
reception-post-deposit-kw
reception-kasa-log
reception-stala-kasowa-log
ack-{employee}-{dayKey}-{shift}-{category}
```

---

## CZĘŚĆ D — Metaprompt do nowej sesji

```
Kontynuuję projekt Conrad Comfort Reception Panel (Electron+React+Vite).
Przeczytaj `c:\Users\grzan\Desktop\projekt\NEXT_SESSION.md` aby zobaczyć
pełny stan + listę zadań.

PRIORYTETY:
1. Najpierw cleanup frontendu (Część A — usunąć martwy kod, zwłaszcza A1, A2, A3, A4)
2. Potem backend według kolejności (Część B):
   B1 (Supabase setup) → B2 (HK migration) → B3 (CRUD admin alerts) →
   B7 (Grafik Excel) → B8 (mailowanie) → B6 (push) → B4/B5 (voucher/czat) →
   B9 (konserwator PWA) → B10 (edytowalność) → B11 (HK ad-hoc mobile)

PALETA: plum #5a1d4a, gold #c99950, kremowy #faf8f5, ciepły węgiel #1a0e15.
Typografia: 'DM Serif Display' nagłówki, Inter reszta.

TECHNICAL:
- Główny plik: src/App.jsx (7800+ linii — rozważ podział)
- Stack: React 18, Vite 5, Electron 31
- Już zainstalowane: @supabase/supabase-js, lottie-react, @formkit/auto-animate, xlsx
- Jeszcze brak: web-push (do Edge Function), resend, bcrypt
- localStorage keys do migracji — patrz lista w NEXT_SESSION.md

WORKFLOW:
- Po każdym zadaniu: build (`npx vite build`), commit niepotrzebny chyba że
  user poprosi
- Komunikuj postęp krótko po każdym module
- Jak coś niejasne — pytaj zanim zaczniesz dużą zmianę

USER FEEDBACK Z POPRZEDNIEJ SESJI:
- Chce widzieć efekt frontendowy zanim wejdzie backend (już 99% zrobione)
- Wolne pace ostatnio frustruje, woli iść szybciej
- Lubi że za każdym razem mówię „sprawdź co się zmieniło" — kontynuuj ten zwyczaj
- Polskie cudzysłowy "..." łamią parser JSX — używaj '...' albo &quot;
```

---

## CZĘŚĆ E — Status sprintów

| # | Etap | Status |
|---|------|--------|
| 0 | Bugi A1/A2/A3 | ✅ |
| 1 | Paleta Conrad Comfort + Logo | ✅ |
| 2 | Rail sidebar (worker + admin) | ✅ |
| 3 | Pełnoekranowy login + auto-shift | ✅ |
| 4 | Modal pre-shift (3 kategorie) | ✅ (seed only, bez CRUD) |
| 5 | Moduł Usterki (4 mapy) | ✅ (frontend, bez Supabase + bez konserwator PWA) |
| 6 | Zadania ad-hoc HK (priorytet czasowy) | ✅ (frontend, bez Supabase + bez mobile) |
| 7 | HK wyjazdy nocne | ✅ |
| 8 | Restyle wszystkich widoków (9 modułów) | ✅ |
| 9 | Modale (Wiki, Message, Finish, Search, Audit, Employee, Payment) | ✅ |
| 10 | UpdateBanner przeniesiony do Ustawień | ✅ |
| 11 | Frontend cleanup (martwy kod) | ⬜ |
| 12 | Setup Supabase + schema | ⬜ |
| 13 | Migracja HK na Supabase Realtime | ⬜ |
| 14 | CRUD admin alerts/reminders | ⬜ |
| 15 | Voucher + Booking + ChatGPT | ⬜ |
| 16 | Czat + swap | ⬜ |
| 17 | Push notifications (web + Electron) | ⬜ |
| 18 | Grafik Excel | ⬜ |
| 19 | Mailowanie raportów | ⬜ |
| 20 | Konserwator PWA | ⬜ |
| 21 | Edytowalność (koniec hardcoded) | ⬜ |

---

Powodzenia w kolejnej sesji! 🍀
