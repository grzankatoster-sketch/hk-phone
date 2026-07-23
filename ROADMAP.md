# ROADMAP — Panel Recepcji Conrad Comfort / GuestSage

## Audyt R&D — 2026-07-19

Audyt READ-ONLY (dział R&D, pipeline MÓZG). Zakres: fazy 2–5 (zrozumienie, audyt,
testy, drogi rozwoju). Konwencja ICE: Impact · Confidence · Ease (1–5, Ease 5 = tanio),
`n = I·C·E` (max 125). Sekcja dopisana — nie modyfikuje istniejących planów
(WORK_PLAN.md, NEXT_SESSION.md, PRACE.md, SAAS_PLAN.md).

---

### 0. KRYTYCZNE (naprawić przed czymkolwiek innym)

1. **Hasło bootstrapowe admina wkompilowane w publiczny instalator.**
   `src/lib/constants.js:8` (`VITE_ADMIN_PASSWORD`) → Vite inline'uje wartość do
   `dist/assets/index-*.js`; instalator publikowany w publicznym repo GitHub
   (`package.json:81` `"private": false`). Wartość trywialna (3 znaki, <REDACTED>).
   Fix: hasło poza bundlem (Supabase Auth / hash po stronie serwera), rotacja.
2. **Token ngrok w kodzie.** `electron/ngrok.cjs:12` `FIXED_TOKEN = "<REDACTED>"`.
   Plik jest martwy (nikt go nie importuje, `@ngrok/ngrok` nie ma w dependencies),
   ale `build.files` pakuje `electron/**/*` → token jedzie w publicznym instalatorze.
   Fix: unieważnić token w ngrok, usunąć plik.
3. **PII zaszyte w źródłach i dystrybuowane publicznie.**
   - `src/modules/Parking/ParkingPanel.jsx:5–25` — realne imiona i nazwiska,
     nry telefonów, tablice rejestracyjne pracowników i klientów;
   - `src/modules/StaliGoscie/StaliGosciePanel.jsx:5–40` — goście, ceny umowne,
     dane do faktur (NIP-y firm), preferencje osobiste;
   - `src/modules/Reviews/reviewsSeed.js` — imiona gości z Booking.
   Trafia do bundla → publiczny instalator. Ryzyko RODO. Fix: seedy → import
   jednorazowy do localStorage/Supabase, pliki poza repo, wyczyścić historię builda.
4. **`npm run lint` (security-lint) NIE przechodzi** — 3 naruszenia:
   `scripts/sync-hk-plans-to-supabase.mjs:13`, `scripts/upload-hk-phone.mjs:10`
   (hardcoded URL Supabase), `src/modules/Admin/ZadaniaPanel.jsx:119`
   (`dangerouslySetInnerHTML`). Czerwony własny lint = brak bramki jakości.

---

### 1. Drogi rozwoju (ranking ICE)

| # | Droga | I | C | E | ICE | Pliki | Walidacja |
|---|-------|---|---|---|-----|-------|-----------|
| R1 | **SEC hotfix**: rotacja tokenu ngrok + usunięcie `electron/ngrok.cjs`; hasło admina poza bundle (min.: hash bootstrapowy w Supabase `app_settings`, nie VITE_) | 5 | 5 | 4 | **100** | electron/ngrok.cjs, src/lib/constants.js:8, src/lib/adminAuth.js | `npm run lint` + inspekcja `dist/assets/index-*.js` (brak hasła/tokenu) + nowy release |
| R2 | **Purge PII z seedów** → skrypt migracyjny do Supabase per tenant; puste defaulty w kodzie | 5 | 5 | 4 | **100** | ParkingPanel.jsx, StaliGosciePanel.jsx, reviewsSeed.js, nowa migracja | `rg -n "phone:\"[0-9]" src` = 0 trafień; aplikacja czyta dane z DB |
| R3 | **De-hardcode brandu (SaaS Tier 2.1)**: wszystkie „Conrad Comfort" przez `tenantConfig.hotelName` + theme tenanta (logo SVG, paleta plum/gold → tokeny) | 5 | 5 | 3 | **75** | App.jsx:923,3457,3512,3757; components/Rail/WorkerSidebar.jsx:58; Rail/AdminSidebarRail.jsx:76; WelcomeOverlayScreen.jsx:29; ui/Logo.jsx:28; index.html:6; electron/main.cjs:34,90; package.json (productName/appId przez fabrykę buildów); style.css (tokeny --cc-*) | `rg -n "Conrad" src electron index.html` = 0 poza tenants/defaults.js; build z innym `.env` daje inny brand |
| R4 | **Zielony lint + rozszerzenie reguł** (hardcoded URL/token/PII/porty) + hook CI | 4 | 5 | 5 | **100** | scripts/security-lint.cjs, sync-hk-plans-to-supabase.mjs, upload-hk-phone.mjs, ZadaniaPanel.jsx:114–119 | `npm run lint` exit 0 |
| R5 | **Konsolidacja kluczy localStorage** — wszystkie surowe stringi `"reception-*"` do `STORAGE_KEYS` (dziś ~20 kluczy poza mapą) + reguła lint | 3 | 5 | 4 | **60** | src/App.jsx (156,206,207,430,435,768–770,1072,1214–1215,1285,1360,1797–1805,1828–1832,1871,1898), TeamChat.jsx:8–9, KasaAdminPanel.jsx:14–15, HKPanel.jsx:32–40, konserwatorzy.js:6, errorLog.js:7, syncQueue.js:5 | `rg '"reception-' src --glob '!src/lib/storage.js'` = 0; `npm test` |
| R6 | **Rejestr tenantów + entitlements w DB** (SAAS_PLAN Tier 0.3/1.5): tabela `tenants` + `tenant_features`, `isModuleEnabled` czyta z DB zamiast VITE_MODULES | 5 | 4 | 2 | **40** | src/lib/modules.js, src/tenants/config.js, nowa migracja, supabase/functions | 2 tenantów demo z różnym zestawem modułów bez rebuildu |
| R7 | **Migracja danych core localStorage → Supabase** (SAAS_PLAN 1.1, WORK_PLAN B1/B2) z kolumną tenant_id + offline queue (syncQueue już jest) | 5 | 3 | 1 | **15** | src/lib/storage.js, syncQueue.js, App.jsx, migracje | wielostanowiskowy test: 2 instancje widzą te same dane |
| R8 | **Wydzielenie domeny kasy z App.jsx** — `handleSafeDeposit`/`finishShift`/strażnik sejfu do `src/lib/cash.mjs` + testy vitest (dziś logika sejfu bez testów jednostkowych, tylko sim) | 4 | 4 | 3 | **48** | src/App.jsx:1060–1830, src/lib/cash.mjs, tests/cash.test.mjs | `npm test`, `npm run test:cash`, `node scripts/sim-nocna-sejf-300.mjs` (lokalny) |
| R9 | **hkserver: strony HTML jako pliki statyczne** zamiast tysięcy linii sklejanych stringów JS (`electron/hkserver.cjs:867,965,1063`) + SSE zamiast poll 1s/4s/5s | 3 | 4 | 3 | **36** | electron/hkserver.cjs, nowe public/hk-lan/*.html | telefon w LAN: strony działają, brak regresji push |
| R10 | **Higiena repo**: usunąć z repo `open-design/` (156 MB obcy projekt), `scripts/broker/` (trening maklerski — inny projekt), `release/` (3.9 GB) do .gitignore, `tmp-conrad-images/`, `tmp-docx-conrad/`, `test_results.txt` (wynik testów MAKLERA), `.mcp.json.backup*`; przenieść `@anthropic-ai/sdk` z dependencies (używany tylko przez broker) | 3 | 5 | 5 | **75** | katalogi j.w., package.json:40 | `npm ci && npm run build` przechodzi; rozmiar repo spada o ~4 GB |
| R11 | **Polling → zdarzenia**: faults 3 s (`App.jsx:1207`), chat 15 s (`App.jsx:1226`), agent 12 s (`useHKAgent.js:298`), HKLive 15 s (`HKLivePanel.jsx:294`) → storage events (już częściowo są, `App.jsx:1224`) / Supabase Realtime | 3 | 4 | 3 | **36** | j.w. | brak utraty odświeżeń przy 2 kartach; CPU idle spada |
| R12 | **Naprawa kolizji numerów migracji** (0013 ×2, 0030 ×2, 0036 ×2 w `supabase/migrations/`) + skrypt CI sprawdzający unikalność | 3 | 5 | 5 | **75** | supabase/migrations/ | `ls supabase/migrations | cut -d_ -f1 | sort | uniq -d` puste |
| R13 | **PDF_DIRS i katalogi HK konfigurowalne** — `C:\zmiany i raporty\...` (`electron/main.cjs:248–251,270`, `hkAutomation.cjs:39`, `hk-automation/lib/config.cjs:23`) → ustawienie w UstawieniaPanel / userData | 3 | 5 | 4 | **60** | j.w., UstawieniaPanel.jsx | zapis PDF w niestandardowym katalogu działa |
| R14 | **Generalizacja konektora PMS** (SAAS_PLAN 2.2): interfejs `PmsConnector` (KWHotel = pierwsza implementacja; IMAP host/nadawca per tenant zamiast `panel34.kki.pl`/`raporty@conradcomfort.pl` w `hkAutomation.cjs:47–50`) + import CSV jako MVP dla innych hoteli | 4 | 3 | 2 | **24** | electron/kwhotel.cjs, hkAutomation.cjs, scripts/hk-automation/lib/parser.cjs | `npm run hk:auto:test` na próbkach 2 formatów |
| R15 | **panel.html (4588 linii) do pipeline'u Vite** — drugi entrypoint, wspólne moduły z src/ (normalizacja nazw, klient Supabase, kolory HK) zamiast trzeciej kopii logiki | 3 | 3 | 2 | **18** | public/hk-phone/panel.html, vite.config.js | build generuje panel.html; smoke test z PANEL_DEPLOY.md pkt 7 |

**Dalsze, niżej ocenione:** wspólny helper nagłówka/stopki dla 5 plików jsPDF
(pdf.js/pdf-daily/pdf-reports/pdf-hk/pdf-voucher) [ICE 2·4·4=32]; helper
`pushHandoverLog()` zamiast 5× `slice(0,300)` (App.jsx:1458,1473,1483,1489,1862)
[ICE 2·5·5=50 ale mały zysk]; jeden normalizator diakrytyków (names.js) zamiast 8 kopii
(App.jsx:3539, llm.js:29, GlobalSearchModal.jsx:99, ReviewsPanel.jsx:71, dates.js:57,
bookingReviews.cjs:28, panel.html:4017) [ICE 2·5·4=40]; usunięcie martwego klucza
`openaiKey` (storage.js:30); stała nazwana dla stałej kasowej 500 zł (App.jsx:770)
→ docelowo `app_settings` per tenant (WORK_PLAN B10); adminAuth: SHA-256 bez soli →
PBKDF2/argon2 lub auth serwerowy; rozdzielenie style.css (8354 linii) na warstwy
core/theme (warunek theming SaaS); aktualizacja NEXT_SESSION.md (opisuje App.jsx
~7000 linii i martwy kod A1–A4, który już nie istnieje — App.jsx ma 3997 linii);
poprawka komentarza `llm.js:1` („proxy Claude" → faktycznie Groq/Llama).

---

### 1b. Analiza relacji komponentów (2026-07-19, uzupełnienie)

Pełna mapa: desktop (localStorage = źródło prawdy) → Supabase `panel_mirror`
(5 snapshotów, LWW bez rev); dwukierunkowo z merge tylko `hk_state` i grafik
(RPC merge+rev — wzorzec docelowy); panel kierownika na GitHub Pages (anon key
+ konta `app_accounts`); hkserver :3737 w procesie Electron (LAN, bez auth);
automat IMAP→parser→dysk+`hk_plan` (podwójny magazyn). Szczegóły w audycie.

| # | Droga | I | C | E | ICE | Sedno |
|---|-------|---|---|---|-----|-------|
| R16 | Domknięcie RLS: anon tylko SELECT widoków; zapisy przez token urządzenia / authenticated (dziś `anon FOR ALL USING(true)` na hk_* — 0003:5–17 — i panel_mirror — 0019:19 — więc każdy z internetu może nadpisać stan HK, grafik i mirror kasy) | 5 | 4 | 3 | **60** | bezpieczeństwo łącza internet→DB |
| R17 | Świeżość danych u kierownika: renderować `updatedAt` mirrorów + heartbeat desktopu + banner „recepcja offline od X min" (dziś panel pokazuje starą kasetkę bez ostrzeżenia — panel.html:2810–2935) | 4 | 5 | 4 | **80** | zaufanie do danych |
| R18 | Jeden wzorzec konfliktów: wszystkie dwustronne kinds przez RPC merge+rev (jak `hk_state_merge`); Realtime zamiast pollingu 60 s dla decyzji o korektach (App.jsx:392–418) | 4 | 4 | 3 | **48** | koniec LWW-nadpisań |
| R19 | Likwidacja SPOF: automat IMAP → Supabase cron+Edge (plany HK powstają przy wyłączonym laptopie); hkserver tylko jako opcjonalny tryb LAN, z tokenem w QR zamiast imienia w URL (hkserver.cjs:1297–1299, x-secret deklarowany ale niesprawdzany :1205) | 4 | 4 | 2 | **32** | dostępność systemu |
| R20 | syncQueue: wpiąć w pushMirror/pushHkState (retry po `online`) ALBO usunąć — dziś martwy kod (0 wywołań enqueue), a WORK_PLAN B1 traktuje go jako istniejący fundament offline | 3 | 5 | 4 | **60** | fikcja offline-safety |

Dodatkowo (niżej): konsolidacja dwóch systemów web-push (VAPID hkservera vs
Edge push-send) do jednego; hk_plan jako jedyne źródło planów (dysk = cache).

---

### 2. Wyniki testów (2026-07-19)

| Komenda | Wynik |
|---|---|
| `npm test` (vitest) | **45/45 PASS** (cash 20, dates 15, hkAgent 10) |
| `npm run test:cash` | PASS („Cash logic tests passed") |
| `npm run test:logic` | **8/8 PASS** (roomtype notify) |
| `npm run lint` | **FAIL — 3 naruszenia** (patrz sekcja 0 pkt 4) |

Bez pokrycia testami: logika sejfu/kasy w App.jsx (tylko symulacje ręczne),
`electron/hkserver.cjs` (wymiany pokojów, push), parser KWHotel (test za flagą
`hk:auto:test`), `excel.js` (import grafiku), `adminAuth.js`, bramka `modules.js`,
cała aplikacja `public/hk-phone/panel.html`.

Proponowana stała komenda walidacji projektu:
`npm test && npm run test:cash && npm run test:logic && npm run lint`

---

### 3. Kandydaci na strefy zamrożone (dla PORTFOLIO)

- **Logika kasy/sejfu** (App.jsx:1060–1830 + lib/cash.mjs) — potwierdzona
  symulacjami (`sim-nocna-sejf-300`, `full-sim`); zmiany tylko z kompletem testów.
- **Parser raportów KWHotel** (`scripts/hk-automation/lib/parser.cjs`,
  `merge-reports.cjs`, `status-logic.cjs`) — dostrojony do realnych maili hotelu.
- **Skrypty live** (`test:live:*`, `hk:auto*`, `broker:*`, `deploy-*`, `upload-*`,
  `release`) — dotykają produkcyjnych usług; nie uruchamiać w audytach.
- **Migracje Supabase 0001–0037** — już wdrożone na żywej bazie; tylko dopisywanie.

---

## SaaS — 2026-07-19 (analiza R&D pod komercjalizację)

Konwencja ICE jak wyżej (Impact · Confidence · Ease 1–5, Ease 5 = tanio, n = I·C·E).
Bazuje na: SAAS_PLAN.md (decyzja Web SaaS z 2026-06-13), `src/lib/modules.js`,
`src/tenants/{config,defaults}.js`, `package.json` (electron-builder).

### S1. Tiery licencyjne (oparte o istniejący MODULE_REGISTRY)

Stan kodu: rdzeń zawsze włączony = zmiana, przekazanie, informacje, **usterki**,
historia (`src/lib/modules.js:17–21`); licencjonowalne = hk, parking, goscie,
vouchery, opinie, zadania (`src/tenants/defaults.js:23–30`, whitelist `VITE_MODULES`).
Poza rejestrem (dziś zawsze dostępne, do dodania jako core): kasa+sejf, raporty PDF,
pracownicy, wiadomości, wiki, ustawienia, ewidencja, statystyki, grafik.

| Tier | Cena orient. (PLN/msc/obiekt) | Zawartość |
|---|---|---|
| **START** | 149 | Rdzeń: przekazanie zmiany, zadania zmian, kasa + strażnik sejfu + operacje sejfowe (S5a), raporty PDF, usterki, historia, wiki, wiadomości, pracownicy; 1 stanowisko |
| **STANDARD** | 299 | START + grafik (Excel/AI), zadania kierownika, parking, stali goście, vouchery, ewidencja, multi-stanowisko (wymaga R7), sklepik (S5b) |
| **PRO** | 499 | STANDARD + Housekeeping komplet: plan HK, HK Live, telefony pokojówek (web), automat maili/PMS, panel kierownika (panel.html), push, lost&found, inspekcje jakości HK |
| **PREMIUM** | 749 | PRO + AI/LLM (12 zadań: briefing, triage, RAG wiki, grafik AI…), opinie Booking (uwaga: koszt Apify ~$0.002/opinia — wliczyć w cenę), statystyki/BI, panel właściciela, raport nocny e-mail |
| Add-ony | 29–99 | dodatkowe stanowisko 29; sklepik 49; opinie Booking 99; AI 99 — dokupywane do niższych tierów |

Zderzenie z SAAS_PLAN.md (propozycja Start/Pro/Premium, linie 84–89): SAAS_PLAN
umieszcza **Usterki** w tierze Pro, ale kod ma je w rdzeniu (`modules.js:20` core:true)
— rekomendacja: zostawić w rdzeniu (usterki są częścią przekazania zmiany), rozjazd
odnotować w SAAS_PLAN przy najbliższej edycji.

**Czego brakuje technicznie, by tiery dało się egzekwować:**
1. `VITE_MODULES` jest wpiekane w build i sprawdzane **tylko po stronie klienta**
   (`src/tenants/config.js:36–44`, `src/lib/modules.js:39–44`) — każdy może obejść.
2. Domyślna polityka permisywna: nieznany klucz ⇒ moduł włączony (`modules.js:41`)
   — dla licencjonowania musi być odwrotnie (deny-by-default).
3. Brak tabel `tenants` + `tenant_features` (SAAS_PLAN Tier 0.3/1.5 = R6 wyżej),
   brak kill-switcha (status tenanta sprawdzany przy starcie + karencja offline),
   brak egzekwowania po stronie serwera (RLS/Edge Function sprawdzająca feature).
4. Rejestr modułów nie obejmuje funkcji „zawsze dostępnych" (kasa, grafik,
   statystyki…) — trzeba je dodać do `MODULE_REGISTRY`, inaczej nie ma czym sterować
   w tierach START vs STANDARD.

### S2. Hardcode pod SaaS — konsolidacja + fabryka wersji

**Musi przestać być zaszyte** (zebrane z audytu głównego, pełne plik:linia wyżej):
brand „Conrad Comfort" w UI/Electron/index.html (R3); logo SVG (`src/ui/Logo.jsx`)
i paleta plum/gold (`src/style.css` tokeny `--cc-*`) → theme tenanta; skrzynka IMAP
`raporty@conradcomfort.pl` @ `panel34.kki.pl` (`electron/hkAutomation.cjs:47–50`);
URL Booking hotelu (`electron/bookingReviews.cjs:11`); URL-e GitHub Pages
`grzankatoster-sketch.github.io` (supabase.js:11, main.cjs:324, panel.html:3142,
deploy-hk-phone.mjs:15); `appId`/`productName`/`copyright`/repo releases
(`package.json:70–83,105–108`); ścieżki `C:\zmiany i raporty` (R13); port 3737;
stała kasowa 500 (`App.jsx:770`) i progi adhoc → `app_settings` per tenant
(WORK_PLAN B10); domyślny `TENANT_ID` (constants.js:7); hasło bootstrapowe (R1).

**Fabryka wersji — rekomendacja: konfiguracja w DB + JEDEN build (runtime), nie
build per tenant.** Zgodne z decyzją Web SaaS w SAAS_PLAN (2026-06-13):
- Web: jeden deploy `app.guestsage.pl`; tenant rozpoznawany po zalogowaniu
  (konto→tenant_id) — manifest tenanta (branding, moduły, config pokoi) czytany
  z tabel `tenants`/`tenant_features`/`app_settings`, theme przez CSS custom
  properties nadpisywane w runtime.
- Electron (opcjonalny kiosk): jeden **neutralny** build „GuestSage Panel"
  (neutralny appId/productName/ikona), przy pierwszym uruchomieniu klucz licencyjny
  → pobiera manifest tenanta, cache w `userData`; auto-update z jednego wspólnego
  repo releases. Zero rebuildu per hotel.
- Dlaczego nie build per tenant z `.env`: N buildów × N repo releases × N procesów
  podpisywania nie skaluje się przy cenach 149–749 zł/msc; obecny mechanizm VITE_
  zostaje wyłącznie jako fallback dev/single-tenant.
- Dowód działania fabryki (SAAS_PLAN Tier 2.0): 2 instancje demo (Conrad + hotel
  testowy) na tym samym deployu z różnym brandingiem i zestawem modułów.

### S3. Serwer / hosting docelowo

- **Linki dla kierownika per tenant:** dziś GitHub Pages prywatnego konta
  (panel.html, grafik.html?t=KOD). Docelowo domena produktu: rekomendacja na start
  **ścieżka** `app.guestsage.pl/t/{slug}/panel` (jeden deploy Vercel/Cloudflare
  Pages, darmowy tier, jeden cert), później opcjonalnie subdomeny
  `{slug}.guestsage.pl` (czystsze cookies/branding, wildcard cert) dla tierów
  wyższych. Tenant slug → tenant_id rozwiązywany w DB.
- **Maile raportowe per tenant:** dziś jedna skrzynka hotelu na IMAP. Dla N hoteli:
  (1) docelowo **webhook/konektor PMS zamiast maila** (R14 — mail to proteza
  formatu KWHotel); (2) przejściowo: centralna domena `raporty@guestsage.pl`
  z aliasami per tenant (`raporty+{slug}@`), jeden odbiornik (Edge Function
  harmonogramowana lub inbound-mail webhook np. Cloudflare Email Routing →
  Worker → Supabase Storage), routing po adresacie/nadawcy; poświadczenia IMAP
  hoteli, które chcą własnej skrzynki, szyfrowane per tenant w DB. Automat musi
  wyjść z laptopa recepcji (rekomendacja 4 z analizy relacji — SPOF).
- **Auto-update:** jeden publiczny kanał releases dla neutralnego builda; brand
  w runtime ⇒ kanał per tenant niepotrzebny. Wersjonowanie web = deploy ciągły.

### S4. Baza danych — rekomendacja

**Jeden projekt Supabase multi-tenant (tenant_id + RLS), region EU (Frankfurt).**
- Kosztowo: darmowy tier = 500 MB / 2 projekty; projekt per tenant to $10–25/msc
  fixed cost na hotel — zabija marżę przy 149 zł/msc; jeden projekt Pro ($25)
  obsłuży dziesiątki hoteli tej skali (dane tekstowe, nie media).
- Migracyjnie: schemat już ma `tenant_id` w tabelach (0001+), RPC merge przyjmują
  `p_tenant` — droga najmniejszego oporu; „projekt per tenant" wymagałby fabryki
  migracji i orkiestracji N baz.
- RODO: dane gości różnych hoteli w jednej bazie są legalne pod warunkami:
  DPA (umowa powierzenia) z każdym hotelem + zapis o podpowierzeniu (Supabase),
  izolacja przez **szczelne RLS per tenant** (dziś anon-ALL — patrz ryzyko 3
  analizy relacji; to warunek twardy), retencja/TTL (pg_cron już używany),
  prawo do usunięcia (procedura kasowania po tenant_id), region EU.
  Projekt dedykowany — dopiero jako opcja enterprise za dopłatą.

### S5. Nowe funkcje zlecone przez usera

**(a) Wpłaty/wypłaty do sejfu — [ICE 4·4·3 = 48] — tier START (rdzeń kasy).**
Strefa zamrożona (App.jsx:1060–1830, cash.mjs) ⇒ projekt jako ROZSZERZENIE:
- Model: log `safe_operations` (localStorage klucz w STORAGE_KEYS + docelowo
  tabela z tenant_id): `{id, date, shift, type: 'deposit'|'withdrawal', amount,
  reason, by, balanceAfter, createdAt}`. Istniejący przepływ `handleSafeDeposit`
  (wpłata końca nocnej/wieczorowej) NIETKNIĘTY — dalej pisze do
  `reception-kasa-log`; nowe operacje to osobny typ wpisu.
- Domena: nowe czyste funkcje w `src/lib/cash.mjs` obok istniejących
  (`applySafeOperation({safeAmount, type, amount})` → `{newBalance,
  overWithdrawal}`), wzorzec `calculateSafeDeposit` (cash.mjs:27–48) z flagą
  ujemnego salda; ZERO zmian w `calculateShiftCash`/`calculateSafeDeposit`.
- UI: przycisk „Operacja sejfowa" w KasaAdminPanel (kierownik; wypłata wymaga
  powodu) + podgląd salda i historii operacji; recepcja widzi saldo read-only.
- Strażnik sejfu: bez zmiany logiki wymagalności — czyta saldo przez nową funkcję.
- Raporty: sekcja „Operacje sejfowe" w raporcie dobowym PDF + mirror `cash_state`
  rozszerzony o saldo po operacjach (klucz istnieje: `reception-safe-amount`).
- Testy obowiązkowe PRZED merge: nowe przypadki w `tests/cash.test.mjs`
  (wpłata, wypłata, overWithdrawal, sekwencja operacji vs `handleSafeDeposit`)
  + przebieg `sim-nocna-sejf-300` bez regresji.

**(b) Sklepik recepcji — [ICE 4·3·3 = 36] — add-on (49 zł) lub w STANDARD.**
- Model: `shop_items` `{id, name, price, stock, minStock, active}`;
  `shop_sales` `{id, itemId, name, qty, unitPrice, total, payment:'cash'|'card',
  shift, by, createdAt}` (nazwa denormalizowana — cena/nazwa z chwili sprzedaży).
- UI: nowy moduł `sklepik` w `MODULE_REGISTRY` (scope worker) — grid produktów,
  sprzedaż w ≤3 kliknięcia, korekta/storno tylko kierownik; zarządzanie
  asortymentem w panelu admin.
- Kasa: utarg gotówkowy sklepiku NIE modyfikuje logiki KW (strefa zamrożona) —
  osobna linia „Utarg sklepik (gotówka/karta)" w raporcie zmiany i dobowym PDF;
  opcjonalna flaga per tenant „wliczaj gotówkę sklepiku do stanu kasetki"
  realizowana jako składnik prezentacji, nie zmiana `calculateShiftCash`.
- Magazyn minimum: dekrement przy sprzedaży, alert w InboxPanel przy
  `stock < minStock`, prosty przyjęcie dostawy (+qty, kto, kiedy).
- Testy: czysta domena `shopTotals()` w lib + vitest (sumy per metoda płatności,
  storno, stany).

### S6. Dodatkowe propozycje funkcji (ponad zlecone; ICE + tier)

| # | Funkcja | ICE | Tier | Zaczep w istniejącym kodzie |
|---|---------|-----|------|------------------------------|
| F1 | Dashboard przyjazdów/wyjazdów dnia (check-in/out lista, statusy) | 4·4·4=64 | STANDARD | `electron/kwhotel.cjs` ma już `getArrivals`/`getDepartures` — brak UI |
| F2 | Draft odpowiedzi na opinie Booking przez LLM (do wklejenia) | 4·4·4=64 | PREMIUM | ReviewsPanel + Edge `llm` (nowy task `reply`); planowane w NEXT_SESSION B4 |
| F3 | Lost & found w desktopie (rejestr znalezionych, wydania, PDF pokwitowania) | 3·5·4=60 | PRO | tabela `found_items` już używana przez telefony HK (`public/hk-phone/index.html`) |
| F4 | Budziki / wake-up calls (harmonogram per pokój, odhaczanie, alert zmiany nocnej) | 3·4·4=48 | START | wzorzec `datedReminders` + InboxPanel |
| F5 | Rejestr kluczy/kart pokojowych (wydania, zwroty, kaucje, zgubienia) | 3·4·4=48 | STANDARD | wzorzec ParkingPanel (CRUD + historia) |
| F6 | Depozyty gości (przedmioty w sejfie recepcji, pokwitowanie PDF, zwrot za podpisem) | 3·4·4=48 | STANDARD | SignatureCanvas już jest (`src/components/SignatureCanvas.jsx`), pdf-voucher jako wzór |
| F7 | Raport nocny automatyczny e-mailem do właściciela (obłożenie, kasa, incydenty) | 4·4·3=48 | PREMIUM | dane w `reports_full`/`shift_reports`; wysyłka = WORK_PLAN B8 (Resend) |
| F8 | Panel właściciela read-only (KPI: kasa, obłożenie, opinie, usterki, HK) | 4·4·3=48 | PREMIUM | panel.html ma już role — nowa rola `owner` + widok agregatów |
| F9 | Inspekcje jakości HK w desktopie (checklisty pokoi, oceny) | 3·4·4=48 | PRO | tabela `hk_quality_checks` już istnieje (panel.html:1715) — brak UI desktop |
| F10 | Upsell tracker: late checkout / early check-in / dostawka (dopłaty → raport) | 4·3·4=48 | STANDARD | osobna linia raportu jak sklepik (S5b), wspólny wzorzec „dopłat" |
| F11 | Kreator onboardingu tenanta (pokoje, piętra, pracownicy, moduły, branding) | 5·4·2=40 | platforma | = SAAS_PLAN 2.3; konsumuje manifest z S2 |
| F12 | Wielojęzyczny UI personelu (EN/UK — częste w HK w PL) | 3·4·3=36 | STANDARD | wymaga ekstrakcji stringów (naturalny produkt uboczny R3 de-hardcode) |
| F13 | Moduł śniadań (lista gości BB na jutro, odhaczanie na sali) | 4·3·3=36 | PRO | dane z KWHotel/importu; wzorzec listy dnia jak F1 |
| F14 | Integracja KSeF / faktury | 4·2·1=8 | później | duży compliance, odłożyć aż będzie >10 tenantów |

**Sekwencja SaaS (spójna z SAAS_PLAN „Rekomendowana sekwencja"):**
R1/R2 (SEC/PII — warunek sprzedaży czegokolwiek) → R6 (tenants+entitlements,
deny-by-default) → R7 (dane→Supabase) → S2 fabryka runtime + R3 de-brand →
S1 tiery + płatności (Paddle/Stripe) → S5a/S5b jako pierwsze nowe moduły →
S6 wg ICE (F1, F2, F3 najpierw).

---

## Nowe funkcje user — 2026-07-20

Konwencja ICE jak wyżej. Część A = diagnoza istniejącego problemu (READ-ONLY,
plik:linia). Część B = projekt nowego modułu (greenfield — potwierdzone rg-iem
zerowe istniejące ślady cennika/konkurencji/scrapingu cen w repo).

### A. Diagnoza: „automatyczne powiadamianie o opiniach często pokazuje stare dane”

**Ustalenie wstępne:** w kodzie NIE istnieje żadna funkcja powiadamiania o nowej
opinii (sprawdzone: brak `showToast`/`notify` powiązanego ze świeżo wykrytą
opinią — jedyne toasty w `ReviewsPanel.jsx:166,199,203,210` dotyczą stanu
synchronizacji, nie treści). To, co user opisuje jako „nie działało”, to
**objaw trzech nakładających się usterek istniejącego mechanizmu odświeżania**,
nie awaria jednej konkretnej funkcji notify:

1. **[PRZYCZYNA GŁÓWNA] „Automatyczny” sync żyje tylko, gdy zakładka Opinie jest
   otwarta — nie jest usługą w tle.** `src/App.jsx:12` — `ReviewsPanel` jest
   `lazy()`, montowany dopiero w JSX przy `src/App.jsx:3160`. Pierwsze wywołanie
   syncu i interwał 5 minut żyją w `useEffect` tego komponentu
   (`ReviewsPanel.jsx:217-228`, `BOOKING_SYNC_INTERVAL_MS` = `ReviewsPanel.jsx:11`).
   Recepcja nie wchodzi w zakładkę Opinie codziennie (nie jest to zakładka
   operacyjna jak Zadania) — więc realnie sync odpala się rzadko, tylko przy
   przypadkowych wizytach na zakładce, a widoczne dane to zawsze stan sprzed
   ostatniej wizyty, nie stan „teraz”. Nic w `electron/main.cjs` nie odpytuje
   Apify niezależnie od renderera — `booking-reviews-sync` (main.cjs:196-218)
   jest wyłącznie handlerem wywoływanym z renderera przez
   `electron/preload.cjs:23` → `ReviewsPanel.jsx:161,174`.
2. **Każdy fail syncu cicho cofa widok do lokalnego zapisu bez rozróżnienia
   „chwilowy błąd” vs „trwale zepsute”.** `ReviewsPanel.jsx:176-181` — gdy
   `incoming.length === 0`, wywołuje `applyLocalRefresh()`
   (`ReviewsPanel.jsx:153-157`), czyli czyta z powrotem `STORAGE_KEYS.reviews`
   z localStorage — dokładnie ten sam klucz, który `loadOrSeed()`
   (`ReviewsPanel.jsx:47-67`) zaseedował danymi ze statycznego pliku
   `reviewsSeed.js` (ostatni wpis `submitted_at:"2026-04-09"` —
   `src/modules/Reviews/reviewsSeed.js:7`, wygenerowany jednorazowo, nigdy nie
   odświeżany automatycznie). Komunikat po nieudanym syncu jest zawsze ten sam,
   uspokajający: „Pokazuję zapisane opinie — automatyczne odświeżanie co 5 min”
   (`ReviewsPanel.jsx:202,209`) — identyczny dla jednorazowego zacięcia sieci i
   dla trwale niedziałającej integracji (np. brakujący/wygasły `APIFY_TOKEN`),
   więc nikt nie zauważa, że synchronizacja jest zepsuta od tygodni.
3. **Ścieżka „brak tokenu” omija nawet plikowy cache na dysku.**
   `electron/bookingReviews.cjs:122-134` — gdy `APIFY_TOKEN` jest pusty,
   `fetchBookingReviews()` **zwraca** (nie rzuca) `{ok:false, reviews:[]}`.
   W `electron/main.cjs:196-218` blok `catch` — jedyne miejsce, które czyta
   `BOOKING_CACHE_PATH` jako fallback (main.cjs:209-215) — uruchamia się tylko,
   gdy `fetchBookingReviews()` **rzuci wyjątek** (co robi tylko
   `runApifyActor` przy błędzie HTTP, `bookingReviews.cjs:100-103`). Brak
   tokenu więc nie trafia w ścieżkę z cache'em na dysku (który sam main.cjs
   zapisuje przy sukcesie, main.cjs:199-203) — od razu wraca pusta tablica do
   renderera, który wtedy i tak spada do localStorage (punkt 2).

**Wniosek:** dane „często stare” = mechanizm w praktyce działa jak rzadki,
ręczny refresh z cichym fallbackiem do współdzielonego, potencjalnie
miesiącami nieaktualizowanego zapisu lokalnego — nie jak ciągła usługa w tle.
Nie jest to problem samego scrapera (Apify actor + sortowanie `f_recent_desc`
+ `cutoffDate` w `bookingReviews.cjs:86-107` są zaprojektowane poprawnie pod
wykrywanie nowości).

**Naprawa (rozszerzenie, nie przeróbka istniejącej domeny opinii):**

| # | Zmiana | Pliki |
|---|---|---|
| N1 | Przenieść pętlę syncu z `ReviewsPanel` (renderer) do `electron/main.cjs` jako `setInterval` niezależny od UI, uruchamiany od `app.whenReady()` — analogicznie do `hkAutomation.start()` (main.cjs:388) | nowy `electron/reviewsSync.cjs` (wzorzec `hkAutomation.cjs`), `main.cjs` |
| N2 | Trwały zapis „ostatnio widzianych ID” (nie tylko snapshotu) w `userData` obok `.hk-booking-cache.json`, żeby diff nowość/stare przetrwał restart appki | `electron/bookingReviews.cjs`, nowy plik `.hk-reviews-seen.json` |
| N3 | Licznik kolejnych porażek + eskalacja komunikatu po N nieudanych próbach z rzeczywistym powodem (`error` z `bookingReviews.cjs:132` zamiast generycznego tekstu) zamiast identycznego „pokazuję zapisane” za każdym razem | `ReviewsPanel.jsx:196-214`, nowy stan `syncFailStreak` |
| N4 | Ścieżka „brak tokenu”/inny `ok:false` też czyta plikowy cache w `main.cjs` (dziś tylko `catch`) | `electron/main.cjs:196-218` — przenieść odczyt cache poza `catch`, uruchamiać zawsze gdy `!result.ok` |

**Nowa funkcja: natychmiastowe powiadomienie o nowej opinii + gotowy draft AI:**

- Diff nowości liczony w main procesie po N1/N2: zbiór ID z poprzedniego cyklu
  vs nowy `fetchBookingReviews().reviews` — różnica = nowe opinie.
- Powiadomienie desktop: reużycie istniejącego wzorca —
  `ipcMain.handle("notify", …)` już zdefiniowany (`main.cjs:339-365`,
  natywny toast Windows + flash paska zadań) **oraz** wewnątrz-appowy toast
  przez istniejący `ToastContainer`/`showToast` (ten sam kanał co inne alerty
  aplikacji, np. `App.jsx` wzorzec `pushMirror`/`showToast` już użyty w
  `ReviewsPanel.jsx:166` itd.) — event IPC `review-new` wysyłany z main do
  renderera (wzorzec `sendUpdateEvent`, main.cjs:56-58).
- Draft odpowiedzi AI dołączony od razu: nowy task `reply` w Edge Function
  `llm` (dziś **nie istnieje** — `supabase/functions/llm/index.ts:25-40` ma
  12 tasków, brak `reply`; potwierdza to NEXT_SESSION.md:130, gdzie „proxy
  do Anthropic API” dla odpowiedzi na opinie było planowane, a faktycznie
  zaimplementowano tylko `reviews` = task analizy zbiorczej, nie odpowiedzi
  pojedynczej). Kontrakt: `generateReviewReply({score, positives, negatives,
  guest_name, language})` w `src/lib/llm.js` (obok `analyzeReviews`,
  `llm.js:126-138`) → nowy task w `MODELS` (`index.ts:37` już ma `reviews`,
  dodać `reply: "llama-3.3-70b-versatile"`). Toast/panel „Nowa opinia” pokazuje
  ocenę + draft w textarea do edycji i wklejenia na Booking (ręczna publikacja
  — Booking nie ma publicznego API do auto-postowania odpowiedzi).

**ICE:**

| Podfunkcja | I | C | E | ICE |
|---|---|---|---|---|
| reviews-fix (N1–N4: sync w tle + widoczność awarii) | 4 | 5 | 4 | **80** |
| reviews-notify (toast/native notify + event IPC) | 4 | 4 | 4 | **64** |
| reviews-notify + draft AI (task `reply` w Edge `llm`) | 4 | 4 | 3 | **48** |

Walidacja: wyłączyć `APIFY_TOKEN` na chwilę (symulacja awarii) → po N4
komunikat pokazuje realny powód i po N3 eskaluje po kilku porażkach; z
działającym tokenem — nowa opinia w danych testowych Apify skutkuje toastem +
natywnym powiadomieniem + gotowym draftem w ≤5 min bez otwierania zakładki.

---

### B. Projekt: silnik cen konkurencyjnych + revenue management

**Stan w kodzie: zero.** Sprawdzone rg-iem po `cennik|competitor|konkurenc|
rate|price` w src/electron/supabase — jedyne trafienia to niepowiązane słowa
(„generate”, „rate_limited” z LLM, `.cc-guest-price` CSS, ceny gości w
`StaliGosciePanel`). Jedyny istniejący fundament do wykorzystania: Apify jako
dostawca scrapingu (wzorzec `electron/bookingReviews.cjs`) i
`electron/kwhotel.cjs:246-283` (`getArrivals`/`getDepartures` — realne dane
obłożenia własnego hotelu z PMS, do sezonowości silnika rekomendacji).
Wszystko poniżej to projekt greenfield, nowy moduł `add-on: RevPricing`.

**Zastrzeżenie prawne (do przekazania userowi wprost, nie ukrywać w przypisie):**
scraping cen Booking.com narusza **Terms of Service Booking.com**
(zakaz automatycznego pobierania danych/screen-scrapingu bez zgody) — inaczej
niż scraping WŁASNYCH opinii hotelu (funkcja S6/F2 dotyczy danych o tym
hotelu), scraping cen KONKURENCJI to systematyczne monitorowanie cudzego
inwentarza na skalę wielu tenantów GuestSage jednocześnie, co zwiększa
wykrywalność (wzorce ruchu z jednej platformy SaaS) i ryzyko: (a) blokady IP/
konta Apify, (b) roszczenia cywilnego ze strony Booking (naruszenie ToS,
ew. „database right” w UE), (c) w skrajnym przypadku zarzutu z ustawy o
zwalczaniu nieuczciwej konkurencji. Rekomendacja: (1) traktować jako funkcję
opt-in z jawnym disclaimerem dla klienta końcowego, który ponosi ryzyko
akceptując warunki modułu; (2) technicznie ograniczać częstotliwość i liczbę
konkurentów per zapytanie (patrz harmonogram niżej), by nie wyglądać jak
zautomatyzowany crawler całej platformy; (3) rozważyć alternatywę: agregatory
cen z legalnym dostępem API (np. partnerskie API rate-shopperów typu
OTA Insight/RateGain — płatne, ale bez ryzyka ToS) jako opcja premium zamiast
własnego scrapera, do decyzji biznesowej przed wdrożeniem.

**Model danych (Supabase, tenant_id wszędzie — zgodnie z R6/R7):**

```
competitors
  id uuid pk, tenant_id uuid, name text, booking_url text,
  active boolean default true, created_at timestamptz

competitor_rates                          -- DANE CZASOWE: append-only, nie snapshot
  id uuid pk, tenant_id uuid, competitor_id uuid fk,
  observed_at timestamptz,                -- kiedy ZAOBSERWOWANO cenę
  stay_date date,                         -- na KTÓRY dzień pobytu (nie observed_at!)
  room_type text, price numeric, currency text default 'PLN',
  source text default 'apify-booking',
  -- unique(tenant_id, competitor_id, stay_date, room_type, observed_at::date)
  -- ⇒ trend = SELECT ... ORDER BY observed_at; 1 punkt/dzień/konkurenta/typ pokoju
  -- wystarcza do wykresu trendu, bez przechowywania każdego zapytania.

own_rates                                 -- ceny WŁASNE (ustawione i proponowane)
  id uuid pk, tenant_id uuid, stay_date date, room_type text,
  current_price numeric,                  -- cena aktualnie ustawiona w PMS (ręczny wpis / import)
  suggested_price numeric,                -- propozycja silnika
  suggested_reason jsonb,                 -- rozbicie uzasadnienia (patrz niżej)
  status text default 'pending',          -- pending | approved | edited | rejected
  approved_price numeric, approved_by text, approved_at timestamptz,
  generated_at timestamptz

pricing_strategy
  tenant_id uuid pk, mode text,           -- 'cheaper' | 'pricier' | 'match_pct'
  reference_competitor_id uuid null,      -- dla trybu 'X% względem WYBRANEGO'
  pct numeric default 0,                  -- +/-15 itd.
  min_price numeric, max_price numeric,   -- twarde widełki bezpieczeństwa

external_signals                          -- pogoda/wydarzenia, też czasowe
  id uuid pk, tenant_id uuid, signal_date date,
  kind text,                              -- 'weather' | 'event' | 'occupancy_own'
  payload jsonb,                          -- np. {temp, precip} albo {name,venue,expected_attendance}
  weight_hint numeric null,               -- opcjonalna waga sugerowana przez źródło
  fetched_at timestamptz
```

`competitor_rates` jako append-only log (nie UPDATE) jest kluczowe pod pytanie
usera o „trend, nie tylko snapshot” — wykres trendu to `GROUP BY stay_date
ORDER BY observed_at`, a retencja/kompakcja (np. zachowaj 1 obserwację/dzień
po 90 dniach) to osobne zadanie porządkowe (pg_cron), nie utrata danych na
starcie.

**Pozyskiwanie cen:**
- Apify actor do dostępności/cen Booking (osobny od `voyager/booking-reviews-
  scraper` używanego do opinii — potrzebny actor typu „hotel search/room
  availability”, do zweryfikowania na etapie doboru dostawcy, nie zakładać
  z góry że to ten sam autor).
- Harmonogram: **2×/dzień** (np. 06:00 i 18:00) per konkurent jako punkt
  startowy — wystarczające do wykrycia dziennych ruchów cen rewenue managerów
  konkurencji, a jednocześnie wyraźnie rzadsze niż realtime crawling (niższe
  ryzyko ToS z akapitu wyżej). Parametr `pollIntervalHours` per tenant,
  z twardym minimum (np. nie częściej niż co 6h) wymuszanym w kodzie, nie
  tylko w UI.
- Limit liczby konkurentów per tenant w warstwie produktowej (np. max 5 w
  PREMIUM) — jednocześnie ogranicza koszt Apify i ekspozycję na wykrycie.

**Silnik rekomendacji — reguły + wagi, wyjaśnialny (NIE ML/blackbox):**

```
suggested_price = own_base_price(stay_date, room_type)   -- z own_rates.current_price
                   × strategy_factor(pricing_strategy)     -- reguła bazowa konkurencji
                   × Π signal_modifiers(external_signals for stay_date)
```

- `strategy_factor`: `cheaper` → min(konkurenci) × 0.95 jako sufit;
  `pricier` → max(konkurenci) × 1.05 jako podłoga; `match_pct` →
  `reference_competitor.price × (1 + pct/100)`. Zawsze przycięte do
  `[min_price, max_price]` z `pricing_strategy` (twarde widełki — kierownik
  ustawia raz, silnik nigdy ich nie przekracza).
- `signal_modifiers`, każdy jako nazwany, addytywny procent (suma, nie
  mnożenie w ciemno — łatwiej wyjaśnić „+15%” niż iloczyn ukrytych mnożników):
  - **Dzień tygodnia / sezonowość z własnych danych** — bazowa waga z
    historii `own_rates`/obłożenia (KWHotel `getArrivals`/`getDepartures`,
    `kwhotel.cjs:246-283`, już dostępne): piątek/sobota domyślnie +10%,
    trend obłożenia z ostatnich N tygodni tego dnia tygodnia.
  - **Pogoda** — **Open-Meteo** (darmowe, bez klucza API, idealne na start):
    prognoza/historia dla Krakowa; deszcz/chłód → lekki modyfikator w dół dla
    ofert weekendowych „city break”, upały latem → neutralne/lekko w górę.
    Waga celowo mała (±2–3%) — pogoda to słaby predyktor popytu hotelowego,
    nie przeceniać w V1.
  - **Wydarzenia/koncerty** — źródła do oceny: (1) **Ticketmaster Discovery
    API** (darmowy tier, dobre pokrycie dużych eventów typu Tauron Arena),
    (2) lokalne kalendarze (Karnet Krakowski, strona miasta) — brak
    ustandaryzowanego API, wymagałoby własnego scrapera/RSS gdzie dostępne,
    (3) Google Events przez SerpApi/Google Search — płatne, potraktować jako
    fallback. Rekomendacja V1: Ticketmaster + ręczne dodawanie eventów przez
    kierownika (prosty formularz `external_signals kind='event'` ręcznie) —
    tańsze i pewniejsze niż scraping wielu niepewnych źródeł na start. Duży
    event w promieniu X km w dniu stay_date → modyfikator +10–25% zależnie od
    `expected_attendance`, próg konfigurowalny.
- Wynik dla kierownika: `suggested_reason` jako lista czynników z wkładem
  procentowym — np. `[{factor:"Sobota", pct:10}, {factor:"Koncert Tauron
  Arena (25k)", pct:15}, {factor:"Konkurent 'Hotel X' podniósł do 450 zł",
  pct:0, note:"uwzględnione w cenie bazowej strategii"}]` — dokładnie to,
  co user opisał jako oczekiwane uzasadnienie.

**UI (2 ekrany, nowy moduł `revpricing` w `MODULE_REGISTRY`):**
1. **„Ceny konkurencji”** — wybór obiektów (dodaj z URL Booking, max wg
   tieru), lista aktywnych konkurentów, wykres trendu (cena/dzień, seria per
   konkurent + własna) na bazie `competitor_rates`, filtrowany zakres dat.
2. **„Propozycje cen”** — tabela per dzień (najbliższe 30–60 dni): cena
   obecna | cena proponowana | delta % | uzasadnienie (rozwijane chipy z
   `suggested_reason`) | akcja **Zatwierdź / Edytuj / Odrzuć**. Zatwierdzenie
   zapisuje `approved_price`/`approved_by`/`approved_at` w `own_rates` —
   **żadna automatyczna zmiana cen w PMS**, to asystent decyzyjny, nie
   self-driving pricing (zgodnie z wymaganiem usera). Integracja z realnym
   PMS (zapis ceny do KWHotel) to osobny, późniejszy krok — dziś KWHotel
   klient (`kwhotel.cjs`) ma tylko odczyt (arrivals/departures/rooms), nie
   zapis cen.

**Tier:** osobny **add-on** w PREMIUM (nie w rdzeniu żadnego niższego tieru z
S1) — uzasadnienie: koszt Apify per obserwacja + koszt/ryzyko utrzymania
integracji z zewnętrznymi API (Ticketmaster, Open-Meteo) + charakter
decyzyjny (revenue management) pasuje do segmentu klientów już płacących za
AI/BI w PREMIUM, nie do START/STANDARD gdzie hotel dopiero się cyfryzuje.

**ICE (rozbite na etapy — reguły przed sygnałami zewnętrznymi, zgodnie z
zasadą „prosty wyjaśnialny model na start”):**

| Podfunkcja | I | C | E | ICE |
|---|---|---|---|---|
| competitor-scraping (model danych + Apify + harmonogram + ekran trendu) | 4 | 3 | 2 | **24** |
| pricing-engine-reguły (strategia cheaper/pricier/match_pct + sezonowość z KWHotel + ekran propozycji + zatwierdzanie) | 5 | 3 | 2 | **30** |
| pricing-engine-sygnały-zewnętrzne (pogoda Open-Meteo + wydarzenia Ticketmaster/ręczne) | 3 | 2 | 2 | **12** |

Sekwencja: competitor-scraping → pricing-engine-reguły (już użyteczne bez
sygnałów zewnętrznych — sama reguła względem konkurencji + sezonowość to
realna wartość) → sygnały zewnętrzne jako iteracja 2, dopiero gdy reguły
bazowe są sprawdzone przez kierownika w praktyce (unikamy budowania
skomplikowanego modelu wag na niesprawdzonym fundamencie).

---

## Aplikacja kierownika + konfiguracja + audyt UI — 2026-07-20

Uwaga o stanie repo: migracje Supabase doszły do `0045_sla_config_per_tenant.sql`
(dev zespół pracuje równolegle) — poza zamrożonym zakresem 0001–0037 z audytu
głównego; nowe migracje 0038–0045 nie były przedmiotem osobnego audytu, tylko
odczytane doraźnie tam gdzie potrzebne do tej sekcji (`0038_panel_login_audit.sql`).

### C. Osobna aplikacja desktopowa dla kierownika

**Stan dziś — dwa niespójne modele tożsamości:**
- Desktop recepcji: `src/lib/adminAuth.js` — jedno WSPÓLNE hasło bootstrapowe
  (`ADMIN_PASSWORD`/hash SHA-256 bez soli w localStorage, `adminAuth.js:19-26,
  28-39`), zero pojęcia „kto konkretnie" się zalogował — tylko binarne
  pracownik/kierownik na TYM urządzeniu.
- Panel kierownika (web): prawdziwe konta `app_accounts` przez Supabase Auth
  (`signInWithPassword`/`signUp`, `public/hk-phone/panel.html:893-1022`),
  role przez `current_app_role()`, a logowania są już audytowane —
  `admin_login_sessions()` (RPC, `supabase/migrations/0038_panel_login_audit.sql:9`,
  `grant … to authenticated` :46) — solidniejszy fundament niż desktop.
- `package.json:69-119` ma dziś JEDEN blok `build` (jeden `appId`/`productName`/
  jeden target nsis) — electron-builder obsługuje wiele configów, ale wymaga
  **osobnego pliku konfiguracyjnego per aplikacja** (np.
  `electron-builder.manager.json` + `electron-builder --config …`), nie da się
  tego wyrazić jako drugi obiekt w tym samym `package.json`.
- `electron/main.cjs:83-113` ładuje `dist/index.html` — cały bundle React
  recepcji (worker+admin w jednym). Nie ma dziś nic do „wynajęcia" wprost dla
  drugiej appki bez dociągnięcia całego bundla recepcji.

**Projekt (3 kroki, każdy osobno wdrażalny i testowalny):**

1. **C1 — Cienki natywny shell „GuestSage Kierownik".** Nowy katalog
   `electron-manager/` (main.cjs + preload.cjs, ~50-80 linii — nie kopia
   `electron/main.cjs`) który **nie re-bundluje Reacta recepcji**, tylko
   ładuje istniejący panel kierownika: `loadURL('https://app.guestsage.pl/
   t/{tenant}/panel')` docelowo (S3), a przejściowo — dopóki nie ma jeszcze
   domeny produktu — `loadFile` na lokalnej kopii `public/hk-phone/panel.html`
   pakowanej do tego installera. Osobny `appId` (`pl.guestsage.manager`),
   osobna ikona/`productName`, osobny plik `electron-builder.manager.json`,
   osobne skrypty `dist:manager`/`release:manager` w `package.json`. Fabryka
   wersji identyczna jak dla recepcji (S2/R3): **jeden neutralny build**,
   branding i tenant rozwiązywane w runtime po zalogowaniu — NIE build per
   hotel. To bezpośrednio odpowiada na potrzebę usera: kierownik instaluje
   jedną aplikację w swoim biurze, bez przeglądarki i bez dotykania komputera
   recepcji.
2. **C2 — Wspólne konto jako jedyny mechanizm logowania kierownika.**
   Zastąpić lokalne hasło-przełącznik w `adminAuth.js` logowaniem Supabase
   Auth przeciw `app_accounts` — **to samo konto**, które działa w apce
   Kierownika, staje się też sposobem podniesienia uprawnień NA RECEPCJI
   (przycisk „Zaloguj jako kierownik" na desktopie recepcji otwiera ten sam
   `signInWithPassword`, nie osobny lokalny hash). Sesja podniesionych
   uprawnień na recepcji logowana przez rozszerzenie
   `admin_login_sessions`/nowe pole `device_context` (`'manager_app'` vs
   `'reception_covering'`) — audyt widzi, że to zastępstwo, nie normalna praca
   z biura. Lokalne hasło bootstrapowe zostaje wyłącznie jako awaryjny
   fallback offline (Supabase padnie — patrz ryzyko z analizy relacji), nie
   jako główna ścieżka.
3. **C3 — Sesja i uprawnienia w obu aplikacjach czytane z jednego RPC.**
   `current_app_role()` (już używane w panel.html) staje się źródłem prawdy
   również dla desktopu recepcji po zalogowaniu kierownika — koniec
   dublowania logiki „czy to jest kierownik" w dwóch miejscach.

**Wpływ na MASTERPLAN.md 2.13–2.15 — UZUPEŁNIA, nie zastępuje:**
- **2.13** (jednolity model ról w bazie) — C2/C3 to jego **pierwsza realna
  implementacja**: dziś desktop i telefony nie mają tożsamości, C wprowadza ją
  dla desktopu przez to samo konto co panel. Telefony HK (tożsamość = gołe
  imię w URL, ryzyko z analizy relacji pkt 2) nadal wymagają osobnego
  rozwiązania — C ich nie dotyka.
- **2.14** (token urządzenia dla desktopu przy aktywacji licencji) — to
  osobny, komplementarny mechanizm: token urządzenia identyfikuje
  **maszynę/instalację** (do RLS per tenant niezależnie od tego, kto siedzi
  przy klawiaturze), konto z C2 identyfikuje **osobę**. Docelowo oba działają
  razem: token = „to urządzenie należy do tenanta X", konto = „ta osoba ma
  rolę Y w tenancie X". C nie zastępuje 2.14, zakłada je jako dalszy krok.
- **2.15** (migracja RLS wg roli, spójnie dla wszystkich tabel) — C2/C3 dają
  RLS coś, na czym może się oprzeć dla desktopu (rola z `current_app_role()`
  zamiast dziś powszechnego `anon FOR ALL`), ale pełne domknięcie 2.15 nadal
  wymaga przejścia przez wszystkie tabele HK/telefonów — C jest warunkiem
  wstępnym dla desktopu, nie całością 2.15.

**ICE:**

| Krok | I | C | E | ICE |
|---|---|---|---|---|
| C1 — shell „GuestSage Kierownik" (osobny build/installer, wrapuje istniejący panel.html) | 4 | 4 | 3 | **48** |
| C2 — wspólne konto Supabase Auth zamiast lokalnego hasła (login na obu appkach + audyt sesji) | 5 | 3 | 2 | **30** |
| C3 — `current_app_role()` jako wspólne źródło ról dla desktopu i panelu | 4 | 3 | 3 | **36** |

Walidacja: kierownik loguje się w apce Kierownik z biura bez VPN/dostępu do
sieci hotelowej i widzi te same dane co dziś na panel.html; to samo konto na
komputerze recepcji podnosi uprawnienia bez lokalnego hasła; wylogowanie w
jednym miejscu nie wymaga zmiany w drugim (osobne sesje, wspólna tożsamość).

### D. Łatwa konfigurowalność zamiast hardcode

**Stan dziś:** `UstawieniaPanel.jsx` istnieje, ale obejmuje wyłącznie
4 rzeczy: aktualizacje appki (`:103-108`), status/hasło automatyzacji IMAP
(`AutomationCard`, `:11-93`), backup JSON (`:112-127`) i 2 przełączniki
globalne — dźwięk i dark mode (`:129-147`, tablica inline, nie rejestr).
Brak jakiegokolwiek mechanizmu „nowa opcja = wpis w konfiguracji" — każdy
nowy przełącznik dziś wymaga nowego stanu w App.jsx + nowego UI w tym pliku.
`MODULE_REGISTRY` (`src/lib/modules.js`) to jedyny istniejący **wzorzec**
rejestru sterowanego danymi, wart rozszerzenia zamiast wynajdywania nowego.

**Projekt — jeden mechanizm, dwie warstwy (rejestr + generyczny renderer),
NIE generyczny CMS:**

1. **Tabela `tenant_settings`** (Supabase, wzorem `panel_mirror`/`hk_state`):
   `tenant_id uuid, key text, value jsonb, updated_at, updated_by,
   rev int` — PK `(tenant_id, key)`. Merge/konflikt tym samym wzorcem co
   `hk_state_merge`/`schedule_merge` (spójne z MASTERPLAN 2.10 — jeden
   wzorzec konfliktów dla wszystkich danych dwustronnych), bo dwóch
   kierowników może edytować ustawienia równolegle.
2. **`SETTINGS_REGISTRY`** w `src/lib/settingsRegistry.js` — płaska lista
   deklaracji, każda: `{ key, type: 'boolean'|'number'|'string'|'enum'|
   'stringList', label, group, default, options? }`. Przykłady pierwszego
   zestawu (migracja istniejących hardkodów, nie nowy pomysł): moduły z
   `MODULE_REGISTRY` (dziś VITE_MODULES, S1 pkt „czego brakuje" — to samo
   repo faktycznie potrzebuje), `thresholds.adhoc.weekday/weekend`
   (`DEFAULT_ADHOC_THRESHOLDS`, `constants.js:68`), `cash.stalaKasowa`
   (dziś `500` twarde w `App.jsx:770`), `labels.emptyValue` (`EMPTY_LABEL`
   z WORK_PLAN A14), widoczność kolumn typu `staliGoscie.showCompanyColumn`.
   Nowa opcja = nowy wiersz w tej liście, zero nowego JSX w większości
   przypadków.
3. **Jeden generyczny renderer formularza** w `UstawieniaPanel.jsx` — grupuje
   `SETTINGS_REGISTRY` po `group`, renderuje input wg `type` (checkbox/number/
   text/select/tag-editor dla `stringList`), pisze przez wspólny hook
   `useTenantSetting(key)` → upsert do `tenant_settings` + optymistyczny stan
   lokalny. Nowy typ kontrolki (rzadkie) wymaga kodu raz; nowa wartość tego
   samego typu — nie wymaga.
4. **Warstwa odczytu w runtime:** `src/tenants/config.js` zostaje jako
   fallback dev/offline (dzisiejsze `VITE_*`), ale primary source po
   zalogowaniu to `tenant_settings` załadowane raz przy starcie do kontekstu
   React (`TenantSettingsProvider`), z cache w localStorage na wypadek startu
   offline — ten sam wzorzec co `tenantConfig` dziś, tylko z bazy zamiast
   z buildu (zgodne z S2 fabryką runtime).

**Sekwencja wdrożenia:** Faza 1 — migracja modułów (VITE_MODULES →
`tenant_settings` key `'modules'`, współpracuje z MASTERPLAN 2.1-2.4). Faza 2
— migracja configu HK (piętra/pokoje, dziś VITE_HK_*). Faza 3 — nowe,
drobne przełączniki dodawane pojedynczo, każdy jako 1 wiersz rejestru bez
nowego PR-a w UI.

**ICE:** Impact 4 (odblokowuje dziesiątki przyszłych drobnych próśb bez
kodu) · Confidence 4 (wzorzec merge+rev już sprawdzony w hk_state/schedule)
· Ease 3 (nowa tabela + rejestr + 1 generyczny formularz + migracja
istniejących hardkodów) → **ICE 48**.

### E. Audyt design panel.html — centrowanie i emoji

**Metodologia:** `rg` po `public/hk-phone/panel.html` (4588 linii, CSS w
`<style>` + generowany HTML w template literals JS w jednym pliku).

**Centrowanie — surowe liczby:** `text-align` × 33 (z czego `text-align:
center` × 23), `justify-content` × 24 (`justify-content:center` × 11),
`align-items` × 92 (w większości `align-items:center` do poziomego
wyrównania ikona+etykieta we flex-row — to NIE jest centrowanie tekstu,
tylko standardowe wyrównanie osi flex i jest uzasadnione niemal zawsze;
pomijam w klasyfikacji niżej, bo nie o to chodzi w zarzucie usera).

Klasyfikacja wszystkich 23 `text-align:center` (plik:linia):

| Linia | Kontekst | Ocena |
|---|---|---|
| 98–99 `.foot`, `.spin` | stopka / spinner ładowania | ✅ uzasadnione (pusty/przejściowy stan) |
| 116 `.pill` | mała plakietka liczby/statusu | ✅ uzasadnione (badge, nie akapit) |
| 146 `.empty` | pusty stan listy | ✅ uzasadnione (empty state) |
| 150, 154 `.zm-h`, `.zm-day` | nagłówek/komórka mini-kalendarza grafiku | ✅ uzasadnione (siatka dat, nie proza) |
| 200–203 `.wrap.auth` (branding + `.h2`/`.sub`) | ekran logowania — nazwa hotelu, „Panel menedżerski”, nagłówek, podtytuł | ⚠️ **generyczne AI-brandowanie** — 4 elementy z rzędu wyśrodkowane na ekranie logowania (typowy wzorzec „hero card”); podtytuł (`.sub`) w szczególności nie musi być centrowany, czyta się naturalniej do lewej pod nagłówkiem |
| 281, 301, 307 `.fitem .ic`, `.notif-row .ni`, `.notif-set .ni` | kolumna ikony w wierszu listy | ✅ uzasadnione (stała szerokość ikony, nie tekst) |
| 309 `.notif-empty,.notif-foot` | pusty stan powiadomień | ✅ uzasadnione (empty state) |
| 310 `.auth-foot` | stopka ekranu logowania | ✅ uzasadnione (stopka, mała waga wizualna) |
| 377 `.praca-desktop` (+ `align-items`+`justify-content` też center) | komunikat blokujący „użyj desktopu” | ⚠️ potrójne centrowanie (pion+poziom+tekst) dla pojedynczego zdania — częsty „AI generic empty state”, ale funkcjonalnie to ekran blokujący pełnoekranowy, więc **granicznie uzasadnione** |
| 385, 405, 390 `.sched-tbl th/td`, `#printArea`, `.scell` | komórki tabeli grafiku / wydruku | ✅ uzasadnione (dane tabelaryczne, liczby/godziny) |
| 419 `.more-tile` | kafelek menu „więcej” (ikona+etykieta) | ✅ uzasadnione (kafelek, nie akapit) |
| 1443 (input godziny) | input liczby 2-cyfrowej | ✅ uzasadnione |
| 3348 (`<td>`) | komórka tabeli obłożenia | ✅ uzasadnione |
| 4005 (`<span>` etykieta) | etykieta w wierszu statystyk | ⚠️ mogłoby być do lewej jak większość etykiet w pliku — pojedynczy odstający przypadek, niska waga |

**Werdykt centrowania:** zarzut usera jest **częściowo trafny, nie
masowy** — na 23 wystąpienia `text-align:center` **19 jest funkcjonalnie
uzasadnionych** (badge/tabela/pusty stan/stopka/siatka dat), **3-4 są
kandydatami do zmiany** (ekran logowania 200-203/310 — typowy „AI hero”
branding, i pojedyncza etykieta 4005). Realny problem estetyczny w tym pliku
to nie masowe nadużycie centrowania w treści, tylko **koncentracja go na
ekranie logowania** — właśnie tam, gdzie user prawdopodobnie najpierw
zauważa „to wygląda jak wygenerowane”.

**Emoji jako ikony — plik:linia (panel.html), z klasyfikacją:**

142 wystąpień emoji ogółem w pliku; po odjęciu prostych typograficznych
znaków `✓ ✗ ✕` (34 razy — funkcjonują jak `check`/`×`, akceptowalne jako
tekst-nie-ikona) zostaje **~90 wystąpień 24 różnych piktogramów**:

| Emoji | Wystąpienia (linie) | Ocena |
|---|---|---|
| 🔔 | 1524, 1650, 1769 | ⚠️ **czysto dekoracyjne obok tekstu, który już mówi to samo** (np. „🔔 pusty — do sprzątania”) → zamiana na SVG dzwonka lub usunięcie |
| 📅 | 2032, 2147, 2299, 3873, 4165(sekcja select) | ⚠️ dekoracyjne przy etykietach dat — kandydat na SVG (kalendarz), spójne z resztą |
| 🎉 | 2190, 2537, 3672 | ⚠️ **czysto dekoracyjne** w pustych stanach („Brak otwartych zadań. 🎉”) — typowy „AI playful” akcent, do usunięcia lub zastąpienia neutralnym stanem pustym w stylu reszty appki (patrz `.empty` gdzie indziej bez emoji) |
| 🧾📝📋 | 2295–2297, 3338, 3796, 3840 | ⚠️ dekoracyjne ikony kategorii (korekty/notatki/raporty) — kandydaci na SVG z lucide (już używane w React), dla spójności z resztą produktu |
| ⚙ | 2428, 2429 | ⚠️ dekoracyjne obok `title="Ustawienia"` — zbędne, SVG ikona trybika już standard w reszcie UI |
| 📌 | 2559, 4165, 4177 | ⚠️ dekoracyjne przy „pokaż też na recepcji” / „stałe przypomnienie” |
| 💰🛠️🚪👥 | 3062, 3064, 3065, 3066 | ⚠️ dekoracyjne ikony kafelków dashboardu — bezpośredni kandydat na zestaw SVG (te 4 kafelki są głównym ekranem startowym panelu — tu emoji rzuca się najbardziej) |
| 🔒🟢 | 3205 | 🟡 **niosą realny sens stanu** (zamknięte/otwarte) — zastąpić kolorową kropką/SVG zamiast usuwać, bo funkcja informacyjna jest prawdziwa |
| ⚠ / ⚠️ | 2796, 3019, 3398, 4270, 4454 | 🟡 **niosą sens** (ostrzeżenie/rozbieżność) — zostają jako koncept, docelowo SVG `AlertTriangle` (już w lucide-react w reszcie appki) zamiast tekstowego emoji dla spójności renderowania między systemami/fontami |
| 📖 | 4167, 4190 | ⚠️ dekoracyjne (Wiki) |
| 📱 | 1342 | 🟡 niesie sens (źródło zgłoszenia = telefon HK) — zostaje jako koncept, SVG docelowo |
| ✅☑ | 4454(kontekst), FEED_ICON:1524 | 🟡 stan „zrobione” — sensowne, kandydat na SVG zamiast emoji dla spójności krojów między Windows/Mac/mobile (emoji renderuje się różnie między systemami — to realne ryzyko niespójności UI, nie tylko estetyki) |

**Emoji w komponentach React (`src/`, dodatkowe, nie duplikujące panel.html):**
`src/App.jsx:641,970,1362,1815,2103,3195` (🔄📋⚠️🖼️🕒), `src/components/
HKAgent/AgentWidget.jsx:37,61,90` i `AgentBot.jsx:130,150,177,213,245,258`
(🤖 ×6, 🙋 ×2, 👀 — maskotka „Agent AI” powtórzona 6× w jednym module),
`src/modules/HK/HKPanel.jsx:498,518,1103,1107,1407,1543,1549,1563` (⚡💬🔄🧺📱),
`src/modules/Faults/FaultsPanel.jsx:302`, `src/modules/Admin/
AlertsAdminPanel.jsx:178` (📭 pusty stan), `src/modules/Parking/
ParkingPanel.jsx:391,427,466` (📞💰) — **istotne**: `lucide-react` jest już
zaimportowane i używane w każdym z tych plików (App.jsx importuje ~40 ikon
lucide na starcie) — emoji obok gotowej biblioteki SVG-ikon to niespójność,
nie brak narzędzia. `🤖` dla „Agent AI” powtórzone 6× w 2 plikach to
najbardziej odstający pojedynczy przypadek — silny kandydat na jedną, spójną
ikonę SVG maskotki.

**Rekomendacja (krótka, bez przepisywania CSS):**
1. Priorytet 1 — ekran logowania panel.html (200-203, 310): zmniejszyć
   centrowanie do samego brandingu, wyrównać podtytuł/opis do lewej.
2. Priorytet 2 — 4 kafelki dashboardu (3062-3066) i maskotka Agent AI (🤖 ×6):
   zamiana na lucide SVG — to dwa miejsca o największej widoczności (ekran
   startowy panelu, stały widget na desktopie).
3. Priorytet 3 — pozostałe dekoracyjne emoji (🎉🧾📝📋⚙📌📖): usunąć lub
   zamienić przy okazji najbliższej zmiany danego widoku, niski priorytet
   samodzielny.
4. Zostawić jako koncept, docelowo SVG nie usunięcie: 🔒🟢⚠️📱✅☑ — niosą
   realną informację o stanie, zamiana ma sens tylko dla spójności renderingu
   między systemami, nie dla „mniej AI-owego wyglądu”.

---

## Brainstorming 22.07.2026 — bot WhatsApp do grafiku + onboarding pracownika (4.24, 4.25)

**4.24 Bot WhatsApp [ICE 36, add-on/STANDARD]:** rozważono trzy warianty dystrybucji
linku do grafiku — (a) WhatsApp Business Cloud API oficjalne, (b) biblioteka
nieoficjalna (Baileys/whatsapp-web.js), (c) e-mail/push istniejący. Wybrano (b):
(a) wymaga weryfikacji biznesowej Meta i zatwierdzania szablonów wiadomości —
nieproporcjonalna ceremonia do „wyślij link raz w miesiącu"; (c) już istnieje
i nie zastępuje realnego wymogu usera (WhatsApp konkretnie). Ryzyko zaakceptowane:
numer może dostać bana przy nadużyciu — mitygacja przez throttling i dedykowany
numer „bot" (nie prywatny numer pracownika). Numery managerów muszą być
**szyfrowane** (pgcrypto, klucz tylko w Edge Function), nie hashowane — hash
jest nieodwracalny i bot nie mógłby wysłać wiadomości na zahashowany numer.
Reużywa istniejący TTL grafiku (migracja 0028, `expires_at`/`p_ttl_hours`)
zamiast nowego mechanizmu wygasania.

**4.25 Onboarding pracownika [ICE 40, platforma]:** odrzucono bibliotekę tour
(intro.js/driver.js) na rzecz własnej lekkiej nakładki (spotlight+checklist,
~80 linii) — w skali tego produktu i UI panel.html biblioteka wniosłaby ciężki
dependency i konflikty stylu za niewspółmierną korzyść. Odrębne od 4.13
(kreator onboardingu **hotelu/tenanta** — robi to sprzedaż/wdrożeniowiec przy
zakładaniu klienta); 4.25 to onboarding **pojedynczego pracownika** przy jego
pierwszym logowaniu, flaga per konto w `app_accounts`, nie w `localStorage`
(pracownik zmienia telefony).

**DECYZJA 22.07.2026 (owner: „rób jak chcesz" → wybór CEO):** „menadżer główny
wybiera kto co widzi" (konfigurowalna per-rola/per-osoba widoczność zakładek)
**NIE wchodzi do planu** — zostajemy przy stałym modelu ról z 2.13/2.15/2.16-2.18
(8 ról zaszytych w `tabsFor()`/RLS). Uzasadnienie wyboru: zero nowej pracy,
zero ryzyka (nie trzeba przepisywać RLS z hardcoded-role na dynamiczną tabelę
uprawnień, co byłoby realną robotą bezpieczeństwa, nie kosmetyką), i zgodne
z kierunkiem już przyjętym — dodanie configurowalności per tenant byłoby
wyjątkiem bez wystarczająco silnego uzasadnienia biznesowego. Poczta
(`manager_messages`, 0037) zostaje bez zmian — adresowanie osoba+rola,
bez dodatkowej warstwy uprawnień.

**Jeśli temat wróci w przyszłości:** nie robić od razu pełnej macierzy
uprawnień — najpierw sprawdzić, czy chodzi o realną, wąską potrzebę (np. „ten
jeden kierownik HK ma widzieć więcej niż inni") — to mały, punktowy wyjątek
(kolumna override na koncie), nie przepisywanie całego modelu RLS.

**Temat 5.2 (trial 7 dni + kill-switch) — bez zmian, już w planie:** trial/
zawieszenie tenanta to dokładnie `tenants.status` (`trial`/`active`/`suspended`)
z 2.1 (**już wdrożone**, migracja 0049) + `trial_ends_at`; realne wymuszenie
(nie tylko kosmetyka UI) czeka na 2.14 (token urządzenia) — bez tego
5.2 sprawdza status tylko przy starcie, nie może odciąć aktywnej sesji
offline. Odrzucono blokowanie po IP (trywialne do obejścia VPN-em) i samo
zaciemnianie/hashowanie kodu klienckiego jako jedyną ochronę (podnosi próg
wejścia, nie zatrzymuje — powtórka ryzyka z incydentu wycieku `.env`
w instalatorach, patrz Etap 0).
