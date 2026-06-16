# PRACE — lista zadań do wykonania

Wygenerowano: 2026-05-05 | Zaktualizowano: 2026-05-07
Sesja 1, 2, 3, 4 ukończone. Poniżej tylko to co zostało.

---

## PLAN WYKONANIA — CO ZOSTAŁO

### Sesja 5 — Supabase wiring (wymaga `supabase db push`)
1. `B2: HK migration` — zamienić localStorage hk-data na Supabase Realtime (hk_tasks, hk_logs, linen_daily)
2. ~~`B3: admin alerts/reminders`~~ — DONE ✓ (AlertsAdminPanel + StandingRemindersPanel wired)
3. ~~`FaultsPanel Supabase`~~ — DONE ✓
4. ~~`VouchersPanel Supabase`~~ — DONE ✓
5. `supabase db push` — wymaga Supabase CLI (poza kodem, tabele gotowe w 0001+0002)

### Sesja 6+ — duże rzeczy (wg NEXT_SESSION.md B1→B11)
- B9: Konserwator PWA (pełna wersja po B2)
- B6: Push notifications
- B5: Czat + swap
- B8: Mailowanie raportów
- B10: Edytowalność (koniec hardcoded)

---

## FAZA 1 — weryfikacja (1 zadanie otwarte)

#### PDF-FLOW-1 — renderer obsługuje pusty wynik?
- [x] 1.4 Otworzyć handler `hkAutomationGetPlan` w [electron/main.cjs](electron/main.cjs) — handler zwraca `{ ok, error }` ✓
- [x] 1.5 Toast dla `ok: false` dodany — wyświetla raz na błąd (de-duplikacja przez lastAutoError ref)

---

## FAZA 3 — Kolory i UX (wymaga ekranu)

#### HK_STATUS_COLORS — opacity w trybie dziennym
- [x] 3.5 Kolory w `src/lib/constants.js` (inline styles), nie style.css
- [x] 3.6 Dark mode opacities: `.08`/`.10`/`.12` → `.18`/`.18`/`.20` w `HK_STATUS_COLORS`
- [x] 3.7 Light mode: PG/BR/WP bg `.15` → `.18`, ujednolicono też bordery na `.40`/`.45`
- [ ] 3.8 Zweryfikować wizualnie — wymaga uruchomienia aplikacji

---

## FAZA 4 — Supabase schema (wymaga B1)

#### SUPA-1 — migracje
- [x] 4.1 Katalog `supabase/migrations/` stworzony
- [x] 4.2 `supabase/migrations/0001_init.sql` — tabele: `hk_workers`, `hk_rooms`, `hk_tasks`, `hk_logs`, `hk_plan`
- [x] 4.3 `tenant_id uuid NOT NULL` w każdej tabeli
- [x] 4.4 RLS: ENABLE ROW LEVEL SECURITY + policy `anon_read_*` dla każdej tabeli
- [ ] 4.5 `supabase db push` — wymaga konfiguracji Supabase CLI (poza kodem)

---

## HIGH — krytyczne

- [x] **HKPanel auto-import nadpisuje ręczne zmiany** — NAPRAWIONE
  Dodano flagę `manualOverride`, warunek `if(current.manualOverride)return;` w auto-import,
  oraz przyciski statusu (W/WP/P/PG/PGZ) w assign modal z opcją Odblokuj.

- [x] **HK automation — `dryRun: true`** — JUŻ BYŁO NAPRAWIONE
  `scripts/hk-automation/config.local.json` ma `"dryRun": false` ✓

---

## MED — ważne

- [x] **SUPA-1 — brak supabase/migrations/** — NAPRAWIONE
  Stworzono `supabase/migrations/0001_init.sql` z CREATE TABLE + RLS dla 5 tabel.

- [x] **SUPA-1 — bookingReviews bez zapisu do pliku cache** — NAPRAWIONE
  Handler `booking-reviews-sync` zapisuje do `userData/.hk-booking-cache.json`.
  Przy błędzie sieciowym — zwraca dane z cache + flaga `fromCache: true`.

---

## LOW — do ogarnięcia

- [x] **SUPA-1 — public/hk-phone/index.html ma hardcoded Supabase URL i KEY** — NAPRAWIONE
  Dodano `/config.json` endpoint w hkserver (czyta z `process.env.VITE_SUPABASE_URL/KEY`).
  hk-phone/index.html fetchuje `/config.json` na starcie — hardcoded URL/KEY usunięte.

- [x] **Vite chunk 2364 kB** — NAPRAWIONE
  `vite.config.js` z `manualChunks`: vendor-xlsx, vendor-jspdf, vendor-framer, vendor-supabase.

- [x] **COPYRIGHT Level 2 — runtime check isPackaged w main.cjs** — NAPRAWIONE
  Dodano `autoUpdater.logger.info(...)` w `app.whenReady()` gdy `app.isPackaged`.

- [ ] **COPYRIGHT Level 3 — obfuscacja kodu Electron (opcjonalne)**
  Kod JS w `.asar` czytelny po rozpakowaniu. Rozważyć `javascript-obfuscator` dla `electron/*.cjs`.

- [x] **ADMIN_MANAGERS — przenieść do storage** — NAPRAWIONE
  `getCustomManagers()`/`setCustomManagers()` w storage.js.
  App.jsx używa `customManagers` (useMemo z fallbackiem na `ADMIN_MANAGERS`) we wszystkich 6 miejscach.

---

## ✅ WYKONANE SESJA 4 (ciąg dalszy — 2026-05-07)

- **B3 AlertsAdminPanel** — Supabase wiring: fetch on mount, insert/delete/update przez Supabase, Realtime subscription, localStorage jako cache
- **B3 StandingRemindersPanel** — identyczny wzorzec: Supabase CRUD + Realtime + cache
- **App.jsx Supabase sync** — useEffect przy starcie synchronizuje manager_alerts i standing_reminders z Supabase do localStorage (pre-shift modal automatycznie dostaje aktualne dane)
- **FaultsPanel** — Supabase wiring: fetch + Realtime + insert/update/delete z graceful fallback na localStorage
- **VouchersPanel** — Supabase wiring: identyczny wzorzec
- **supabase.js** — zmieniany z throw na nullable (`supabase = null` gdy brak env vars); eksportuje `supabaseReady`
- **constants.js** — dodano `TENANT_ID` (UUID 000...0001, można nadpisać przez `VITE_TENANT_ID` env var)
- **0002_app_tables.sql** — poprawiono schematy: faults (floor, space_id, assigned_to, reported_at), vouchers (code, recipient_type, status, used_at)

---

## ✅ WYKONANE SESJA 4 (2026-05-07)

- **A13 CSS consolidation** — usunięto `.dark-shell`, `.light-shell`, `.dark-main` (38+ reguł) ze style.css; `body.app-dark` jest teraz jedynym mechanizmem dark mode; uproszczono `appShellClass` i `main className` w App.jsx
- **A5 "Zmień ▾" feature flag** — gdy `loginShiftSource==="schedule"` → badge "Z grafiku" + "zmień ręcznie ▾" zamiast "Zmień ▾"; po ręcznej zmianie resetuje source → "clock"
- **supabase/migrations/0002_app_tables.sql** — 17 tabel: rooms, managers, app_settings, default_tasks, manager_alerts, standing_reminders, faults, messages, vouchers, booking_reviews, schedule, shift_reports, daily_reports, payment_corrections, hk_adhoc_tasks, caretaker_tokens, push_subscriptions + RLS

---

## ✅ WYKONANE SESJA 3 (2026-05-06)

- **PDF-FLOW-1 (1.5)** — toast dla `ok:false` w auto-imporcie HKPanel (de-duplikacja przez ref)
- **HKPanel manualOverride** — flaga ochrony ręcznych statusów; przyciski W/WP/P/PG/PGZ w assign modal
- **HK_STATUS_COLORS** — opacity dark `.08`/`.12` → `.18`/`.20`; light mode PG/BR/WP `.15` → `.18`
- **bookingReviews cache** — zapis do `userData/.hk-booking-cache.json`; fallback z cache przy błędzie
- **supabase/migrations/0001_init.sql** — 5 tabel: hk_workers/rooms/tasks/logs/plan + RLS
- **COPYRIGHT Level 2** — log startu z wersją w `app.whenReady()` gdy `isPackaged`
- **ADMIN_MANAGERS** — `getCustomManagers()` / `setCustomManagers()` w storage.js + przepięcie w App.jsx (6 miejsc)
- **hk-phone /config.json** — hkserver serwuje config z env vars; hardcoded klucze usunięte z index.html
- **Vite chunk splitting** — manualChunks: vendor-xlsx/jspdf/framer/supabase
- **A9 pre-shift modal** — auto-ACK pustych kategorii; modal pomijany gdy nic do ack

---

## ✅ WYKONANE (poprzednie sesje)

- main.cjs unreachable code (QR Supabase Storage) — usunięto
- `@formkit/auto-animate` — odinstalowano
- `src/lib/adhoc.js` (computeBroadcastMode) — usunięto (martwy plik)
- CLEANUP-A1/A2/A3/A4 — już nie istniał (App.jsx 3243 linii)
- `fmtMoney` duplikat — usunięto z App.jsx, import z format.js
- FAZA 2 security: ADMIN_PASSWORD fallback → throw; supabase.js env vars + guard; security-lint rozszerzony o supabase.co + eyJ
- BUG-1: HKLivePanel — Promise.all wyciąga `{ error }` + toast; upserty mają `await` + obsługę błędów
- COLOR-1: `textColorFor()` w HKLivePanel — dynamiczny kolor tekstu awatarów wg luminancji
- **QR-KONSERWATOR-1A** — hkserver endpoint `/konserwator/:name`, IPC handler, preload, FaultsPanel
