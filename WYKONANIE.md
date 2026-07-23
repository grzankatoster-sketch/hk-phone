# WYKONANIE — specyfikacja wykonawcza MASTERPLAN.md (80 pozycji)

Data: 2026-07-20. Numeracja identyczna z `MASTERPLAN.md`. Szczegółowe uzasadnienia,
plik:linia i ICE — w `ROADMAP.md` (sekcje: Audyt R&D 2026-07-19, SaaS 2026-07-19,
Nowe funkcje user 2026-07-20, Aplikacja kierownika + konfiguracja + audyt UI
2026-07-20). Ten dokument to READ-ONLY specyfikacja „jak zrobić", nie zmienia kodu.

🔒 Strefy zamrożone (przypomnienie): logika kasy/sejfu (App.jsx:1060–1830),
parser KWHotel, migracje 0001–0037 (żywa baza), skrypty live. Pozycje ich
dotyczące (4.1, 2.12) są rozszerzeniami z pełnymi testami, nie przeróbką.

Komenda walidacji bazowa dla każdej pozycji DEV: `npm test && npm run test:cash
&& npm run test:logic && npm run lint`.

---

## ETAP 0 — BEZPIECZEŃSTWO

### 0.1 Unieważnić token ngrok + usunąć electron/ngrok.cjs
**Jak ma działać:** plik `electron/ngrok.cjs` (martwy kod, `FIXED_TOKEN` na stałe w źródle) znika z repo; ngrok jako mechanizm dostępu zdalnego przestaje istnieć w projekcie (zastąpiony docelowo przez S3 — link kierownika przez domenę produktu).
**Kryterium gotowości:** `rg -n "ngrok" electron package.json` = 0 trafień; token unieważniony w panelu ngrok.dev (poza kodem); `npm run build` przechodzi bez pliku.
**Dział mózgu:** SEC (inline) usuwa/rotuje → OPS (inline) usuwa plik z `build.files` jeśli referencjonowany. Zależność: brak, wykonać natychmiast, blokuje release.

### 0.2 Hasło admina poza bundle (hash w Supabase) + rotacja
**Jak ma działać:** `VITE_ADMIN_PASSWORD` (`src/lib/constants.js:8`) przestaje istnieć jako zmienna kompilowana do bundla; `src/lib/adminAuth.js` (`verifyBootstrapPassword`, `verifyOrCreateAdminPassword`) zamiast porównania z hardcoded stałą woła Supabase (hash bootstrapowy w tabeli/`app_settings` per tenant) lub — docelowo — zostaje zastąpione przez 2.17 (logowanie kontem). Obecne hasło (widoczne dziś w skompilowanym `dist/`) rotowane natychmiast.
**Kryterium gotowości:** `rg "VITE_ADMIN_PASSWORD"` nie zwraca nic w `dist/assets/*.js` po buildzie; stare hasło już nie działa.
**Dział mózgu:** SEC (inline, pilne) projektuje przejście → DEV (mozg-dev) implementuje. Zależność: może być tymczasowym rozwiązaniem do czasu 2.17 (docelowe pełne rozwiązanie).

### 0.3 Purge PII z seedów → import do bazy per tenant
**Jak ma działać:** `src/modules/Parking/ParkingPanel.jsx:5-25` (`DEFAULT_PARKING`), `src/modules/StaliGoscie/StaliGosciePanel.jsx:5-40` (`DEFAULT_STALI_GOSCIE`), `src/modules/Reviews/reviewsSeed.js` (`REVIEWS_SEED`) przestają zawierać realne dane osobowe w źródle JS. Dane migrowane jednorazowym skryptem do Supabase (tabele per moduł, `tenant_id`), pliki źródłowe zostają z pustą tablicą/przykładowym fikcyjnym rekordem demo.
**Kryterium gotowości:** `rg -n "phone:\"[0-9]" src` = 0 trafień; `rg "Kowalski|Ventus|Bremer"` (przykładowe realne nazwiska z audytu) = 0 w src; aplikacja czyta dane produkcyjne z DB.
**Dział mózgu:** LEG (inline) ocenia zakres RODO i konieczność zgody/podstawy prawnej przed migracją → DEV (mozg-dev) wykonuje skrypt migracyjny. Zależność: przed 2.1 (tabele tenant) lub równolegle z nim.

### 0.4 Zielony security-lint + reguły + bramka CI
**Jak ma działać:** `npm run lint` (`scripts/security-lint.cjs`) przechodzi bez błędów. Dziś 3 naruszenia: `scripts/sync-hk-plans-to-supabase.mjs:13`, `scripts/upload-hk-phone.mjs:10` (hardcoded URL Supabase), `src/modules/Admin/ZadaniaPanel.jsx:119` (`dangerouslySetInnerHTML` dla encji HTML — zamienić na literał znaku). Reguły rozszerzone o wykrywanie kluczy/tokenów (wzorem `no-hardcoded-jwt-key`) i portów/ścieżek C:\.
**Kryterium gotowości:** `npm run lint` exit code 0; lint podpięty jako krok przed `npm run release`/`dist` (git hook lub skrypt wrapper), nie tylko ręczne wywołanie.
**Dział mózgu:** SEC (inline) projektuje reguły → DEV (mozg-dev) naprawia 3 naruszenia i podpina bramkę. Zależność: brak.

### 0.5 Domknięcie RLS: koniec anon FOR ALL na hk_* i panel_mirror
**Jak ma działać:** `supabase/migrations/0003_hk_write_policies.sql:5-17` i `0019_panel_mirror.sql:19` (`FOR ALL TO anon USING (true)`) zastąpione politykami wymagającymi `authenticated` + sprawdzenia `tenant_id`/roli. Anon (telefony, publiczne strony) dostaje tylko wąski SELECT na potrzebne kolumny; zapisy idą przez RPC z walidacją (wzorem `hk_state_merge`) albo przez uwierzytelnione konta (patrz 2.14/2.17).
**Kryterium gotowości:** nowa migracja `00XX_rls_tighten.sql`; test: klucz anon z zewnątrz nie może już `upsert` do `panel_mirror`/`hk_plan` (próba przez `curl`/Postman zwraca 401/403).
**Dział mózgu:** SEC (inline) projektuje politykę → DEV (mozg-dev) pisze migrację. Zależność: częściowo zależne od 2.14 (token urządzenia) dla pełnego domknięcia telefonów; można zrobić częściowo wcześniej dla panel_mirror.

### 0.6 Token w QR zamiast imienia w URL dla telefonów LAN
**Jak ma działać:** `electron/hkserver.cjs` — dziś tożsamość pracownika w LAN to gołe imię w URL (`/hk/:worker/action`, QR z `?w=Imie`, `hkserver.cjs:1297-1299`), nagłówek `x-secret` dopuszczony w CORS (`:1205`) ale nigdzie niesprawdzany. Zmiana: QR koduje podpisany token (worker+expiry+HMAC), `hkserver.cjs` weryfikuje `x-secret`/token na każdym endpointzie POST przed wykonaniem akcji.
**Kryterium gotowości:** żądanie POST `/hk/:worker/action` bez ważnego tokenu zwraca 401; QR wygenerowany przez `hk-get-qr` (`main.cjs:304-306`) zawiera token, nie tylko imię.
**Dział mózgu:** SEC (inline) projektuje format tokenu → DEV (mozg-dev) implementuje w `hkserver.cjs` + generator QR. Zależność: brak, niezależne od reszty Etapu 0.

---

## ETAP 1 — PORZĄDKI

### 1.1 Higiena repo: usunąć open-design/, scripts/broker/, release/, tmp-*
**Jak ma działać:** katalogi `open-design/` (156 MB, obcy projekt), `scripts/broker/` (narzędzie treningowe do egzaminu maklerskiego, `@anthropic-ai/sdk` z dependencies używany wyłącznie przez niego), `release/` (3,9 GB — do `.gitignore`, nie do repo), `tmp-conrad-images/`, `tmp-docx-conrad/`, `test_results.txt` (wynik testów innego projektu — MAKLER), `.mcp.json.backup*` znikają z repo/są w `.gitignore`. `@anthropic-ai/sdk` usunięty z `dependencies` w `package.json` (przenieść do osobnego narzędzia, jeśli broker ma zostać, albo usunąć całkiem).
**Kryterium gotowości:** `du -sh .` na repo spada o ~4 GB; `npm ci && npm run build` nadal przechodzi; `git status` czysty po `.gitignore`.
**Dział mózgu:** OPS (mozg-ops) wykonuje porządki i aktualizuje `.gitignore`. Zależność: brak, zero ryzyka.

### 1.2 Naprawa zdublowanych numerów migracji (0013/0030/0036 ×2)
**Jak ma działać:** w `supabase/migrations/` istnieją dwa pliki `0013_*`, dwa `0030_*`, dwa `0036_*` — jeden z każdej pary przenumerowany na kolejny wolny numer (dziś seria doszła do `0045`, więc np. na `0046`/`0047`), z zachowaniem kolejności zależności SQL. Dodany prosty skrypt CI sprawdzający unikalność prefiksu numerycznego.
**Kryterium gotowości:** `ls supabase/migrations | cut -d_ -f1 | sort | uniq -d` = pusty wynik; `supabase db push` (poza zakresem audytu, wykonuje DEV) nie się nie wywala na duplikacie.
**Dział mózgu:** DEV (mozg-dev) przenumerowuje i dodaje sprawdzenie w CI. Zależność: wykonać przed jakimkolwiek kolejnym `db push` na świeżą bazę (pilot 5.4).

### 1.3 Wszystkie klucze localStorage przez STORAGE_KEYS
**Jak ma działać:** ~20 surowych stringów `"reception-*"` rozsianych w `App.jsx` (m.in. linie 156,206-207,430,435,768-770,1072,1214-1224,1285,1360-1363,1797-1832,1871), `TeamChat.jsx:8-9`, `KasaAdminPanel.jsx:14-15`, `HKPanel.jsx:32-40`, `konserwatorzy.js:6`, `errorLog.js:7`, `syncQueue.js:5` przeniesione do `STORAGE_KEYS` w `src/lib/storage.js`. Nowa reguła w `security-lint.cjs` wykrywająca literał `"reception-` poza `storage.js`.
**Kryterium gotowości:** `rg '"reception-' src --glob '!src/lib/storage.js'` = 0 trafień; `npm test` bez regresji.
**Dział mózgu:** DEV (mozg-dev) refaktoryzuje mechanicznie. Zależność: brak, ale wykonać przed 2.9 (migracja do Supabase), żeby mapa kluczy była kompletna.

### 1.4 Ścieżki C:\zmiany i raporty → ustawienie w UI
**Jak ma działać:** `PDF_DIRS` (`electron/main.cjs:248-251`), `HK_AUTOMATION_DIR` (`main.cjs:270`), `DEFAULT_OUTPUT_DIR` (`electron/hkAutomation.cjs:39`), `scripts/hk-automation/lib/config.cjs:23` przestają mieć zaszyty katalog `C:\zmiany i raporty`. Ścieżka konfigurowalna w nowym polu w `UstawieniaPanel.jsx` (lub docelowo `tenant_settings` z 2.19), zapisywana w `app.getPath("userData")`/config lokalny, z fallbackiem do dzisiejszej wartości.
**Kryterium gotowości:** zmiana katalogu w UI powoduje, że kolejny zapis PDF/planu HK trafia w nowe miejsce (scenariusz manualny w Electronie).
**Dział mózgu:** DEV (mozg-dev) implementuje pole ustawień + odczyt w main.cjs. Zależność: naturalnie połączyć z 2.19 (mechanizm ustawień) zamiast robić osobny ad-hoc mechanizm.

### 1.5 syncQueue: wpiąć naprawdę albo usunąć
**Jak ma działać:** `src/lib/syncQueue.js` (enqueue/flushAll/initSyncQueueListener) ma dziś zero wywołań w `src/` — decyzja: albo podpiąć pod `pushMirror`/`pushHkState`/`pushSchedule` (retry po `online`, prawdziwy offline-bufor), albo usunąć plik i zdjąć fałszywe założenie z WORK_PLAN B1 że offline-safety już istnieje.
**Kryterium gotowości:** jeśli wpięty — test w devtools: wyłączona sieć → operacja w `App.jsx` → włączona sieć → operacja dociera do Supabase (sprawdzone w tabeli). Jeśli usunięty — `rg "syncQueue"` = 0 poza commitem usuwającym.
**Dział mózgu:** DEV (mozg-dev) decyduje i wykonuje jeden z wariantów. Zależność: brak, ale rekomendacja: wpiąć, bo częściowo pokrywa ryzyko z analizy relacji (Supabase padnie → utrata zmian).

### 1.6 Jeden normalizator diakrytyków zamiast 8 kopii
**Jak ma działać:** funkcja `strip`/`stripDiacritics`/`normalizedReviewText` (identyczna logika NFD + mapowanie „ł") zduplikowana w `src/lib/names.js:8` (kanoniczny), `src/App.jsx:3539`, `src/lib/llm.js:29`, `src/components/modals/GlobalSearchModal.jsx:99`, `src/modules/Reviews/ReviewsPanel.jsx:71`, `src/lib/dates.js:57`, `electron/bookingReviews.cjs:28`, `public/hk-phone/panel.html:4017`. Wszystkie miejsca w `src/` importują z `names.js`; `bookingReviews.cjs` i `panel.html` (Node/plik statyczny, brak wspólnego bundla) zostają z lokalną kopią udokumentowaną komentarzem „duplikat celowy, patrz names.js".
**Kryterium gotowości:** `rg "normalize\(\"NFD\"\)" src` zwraca tylko `names.js` + ew. 2 wyjątki poza bundlem, z komentarzem.
**Dział mózgu:** DEV (mozg-dev) refaktoryzuje. Zależność: brak.

### 1.7 Helper pushHandoverLog() zamiast 5× slice(0,300)
**Jak ma działać:** `src/App.jsx:1458,1473,1483,1489,1862` powtarzają identyczny wzorzec `[logEntry,...handoverLog].slice(0,300); setHandoverLog(...); saveJson(STORAGE_KEYS.handoverLog,...)`. Zastąpione jedną funkcją `pushHandoverLog(entry)` w `src/lib/` (lub lokalnie w App.jsx jako helper), wołaną w 5 miejscach.
**Kryterium gotowości:** `rg "handoverLog\].slice\(0,300\)" src/App.jsx` = 0 (poza definicją helpera); `npm test` bez regresji.
**Dział mózgu:** DEV (mozg-dev), refaktor mechaniczny niskiego ryzyka. Zależność: brak.

### 1.8 Wspólny helper nagłówka/stopki dla 5 generatorów PDF
**Jak ma działać:** `src/lib/pdf.js`, `pdf-daily.js`, `pdf-reports.js`, `pdf-hk.js`, `pdf-voucher.js` każdy definiuje własny nagłówek/stopkę jsPDF (setFont/branding/numer strony). Wydzielić `mkPDF_header`/`mkPDF_footer` do wspólnego miejsca (już częściowo istnieje jako `mkPDF_header`, patrz `pdf-daily.js:12` — ujednolicić resztę do tego wzorca) i użyć we wszystkich 5 plikach.
**Kryterium gotowości:** wizualne porównanie nagłówków 5 typów PDF przed/po (identyczne), redukcja duplikacji linii w `rg -c "setFont" src/lib/pdf*.js`.
**Dział mózgu:** DEV (mozg-dev). Zależność: brak, wykonać razem z 1.7 jako pakiet „porządki App/PDF".

### 1.9 adminAuth: PBKDF2/argon2 zamiast SHA-256 bez soli
**Jak ma działać:** `src/lib/adminAuth.js:4-8` (`sha256Hex`) to prosty hash bez soli i bez kosztu obliczeniowego — podatny na słownikowy atak offline, jeśli ktoś wyciągnie hash z localStorage/pliku backupu. Zamiana na PBKDF2 (Web Crypto `crypto.subtle.deriveBits`, dostępne bez nowej zależności) z losową solą per instalacja, zapisaną obok hasha. Docelowo i tak zastąpione przez 2.17 (auth serwerowy) — to łatka na czas przejściowy.
**Kryterium gotowości:** nowy hash w `localStorage` ma format `salt:iterations:hash`; stare hashe migrowane przy pierwszym logowaniu po update.
**Dział mózgu:** SEC (inline) projektuje parametry (iteracje, długość soli) → DEV (mozg-dev) implementuje. Zależność: niezależne od 2.17, ale robić tylko jeśli 2.17 nie wchodzi w najbliższym czasie (inaczej to praca do wyrzucenia).

### 1.10 Stała kasowa 500 zł jako nazwana stała
**Jak ma działać:** `src/App.jsx:770` (`const [stalaKasowa,setStalaKasowa]=useState(()=>{...:500})`) — magiczna liczba `500` wyciągnięta do nazwanej stałej (np. `DEFAULT_STALA_KASOWA` w `src/lib/constants.js`), z komentarzem że to wartość startowa nadpisywana przez kierownika. Docelowo (2.19) migruje do `tenant_settings`.
**Kryterium gotowości:** `rg ":500\)" src/App.jsx` w kontekście stałej kasowej = 0, stała zaimportowana z constants.js.
**Dział mózgu:** DEV (mozg-dev), zmiana kosmetyczna niskiego ryzyka. Zależność: naturalny krok przejściowy przed 2.19.

### 1.11 Usunięcie martwego klucza openaiKey
**Jak ma działać:** `src/lib/storage.js:30` (`openaiKey: "reception-openai-key"`) — klucz zdefiniowany, zero użyć w kodzie (`rg "openaiKey" src` = tylko definicja). Usunąć wpis z `STORAGE_KEYS`.
**Kryterium gotowości:** `rg "openaiKey" src` = 0 wyników.
**Dział mózgu:** OPS (mozg-ops) lub DEV, trywialna zmiana jednolinijkowa. Zależność: brak.

### 1.12 Usunięcie domyślnego TENANT_ID
**Jak ma działać:** `src/lib/constants.js:7` (`TENANT_ID = import.meta.env.VITE_TENANT_ID || "00000000-0000-0000-0000-000000000001"`) — domyślny UUID Conrad Comfort zaszyty jako fallback. Po wdrożeniu 2.1 (tabela tenants) i mechanizmu logowania (2.17), `TENANT_ID` powinien pochodzić z sesji/konta, nie z build-time fallbacku; fallback zostaje wyłącznie jako awaryjny dla trybu dev bez logowania, z jawnym `console.warn`.
**Kryterium gotowości:** w buildzie produkcyjnym multi-tenant `TENANT_ID` nigdy nie przyjmuje wartości fallbacku (log/telemetria to potwierdza).
**Dział mózgu:** DEV (mozg-dev). Zależność: wykonać PO 2.1/2.17 — wcześniej nie ma z czego czytać realnego tenant_id.

### 1.13 Poprawka komentarza llm.js (Groq nie Claude)
**Jak ma działać:** `src/lib/llm.js:1` twierdzi „proxy Claude" — Edge Function `llm` faktycznie woła Groq/Llama (`supabase/functions/llm/index.ts:25-40`, `README.md:1`). Poprawić komentarz na zgodny ze stanem faktycznym; jeśli plan to faktycznie zmienić dostawcę na Anthropic — osobna decyzja produktowa, nie część tej pozycji.
**Kryterium gotowości:** komentarz w pliku zgodny z realnym dostawcą.
**Dział mózgu:** OPS (mozg-ops), zmiana jednolinijkowa. Zależność: brak.

### 1.14 Aktualizacja NEXT_SESSION.md
**Jak ma działać:** `NEXT_SESSION.md` opisuje martwy kod (A1-A4: `loginStep`, `AdminTopNav`, `adminSidebarGroups`, stary `ManagerSelectModal`) który już nie istnieje w `App.jsx` (dziś 3997 linii, nie ~7000 jak sugeruje dokument) — checklisty A1-A4 oznaczyć jako wykonane/nieaktualne, dopisać notatkę że stan z dokumentu jest sprzed dużego refaktoru.
**Kryterium gotowości:** dokument nie wprowadza w błąd co do obecnego stanu App.jsx (sprawdzone porównaniem z realnymi liniami).
**Dział mózgu:** OPS (mozg-ops), aktualizacja dokumentacji. Zależność: brak, czysto porządkowe.

### 1.15 Ekran logowania panel.html: mniej centrowania
**Jak ma działać:** `public/hk-phone/panel.html:200-203` (branding `.wrap.auth::before/::after`, `.h2`, `.sub`) i `:310` (`.auth-foot`) — 4-5 elementów z rzędu wyśrodkowanych na ekranie logowania (typowy „AI hero" wzorzec, patrz audyt design w ROADMAP.md sekcja E). Zmiana: nazwa hotelu i „Panel menedżerski" zostają wyśrodkowane (branding), ale `.sub` (podtytuł/opis) i stopka przechodzą na wyrównanie do lewej pod nagłówkiem.
**Kryterium gotowości:** wizualne porównanie przed/po (screenshot), review DES.
**Dział mózgu:** DES (mozg-des) projektuje poprawkę → DEV (mozg-dev) wprowadza w CSS. Zależność: brak, niskie ryzyko.

### 1.16 4 kafelki dashboardu (emoji) → SVG
**Jak ma działać:** `public/hk-phone/panel.html:3062-3066` — kafelki dashboardu „Kasa"/„Usterki/SLA"/„Wyjazdy"/„Obsada" używają emoji 💰🛠️🚪👥 jako ikon. To najwyżej widoczny ekran panelu (start). Zamiana na SVG (lucide-set spójny z resztą produktu React, lub inline SVG jeśli panel.html zostaje poza bundlem Vite do czasu 3.7).
**Kryterium gotowości:** 4 kafelki renderują SVG identycznej wielkości/koloru co reszta ikon panelu, brak regresji layoutu (webapp-testing/Playwright screenshot).
**Dział mózgu:** DES (mozg-des) dobiera zestaw ikon → DEV (mozg-dev) wdraża → QA (mozg-qa) wizualna weryfikacja. Zależność: żadna, ale efektywniej razem z 3.7 (panel.html w Vite, dostęp do lucide-react).

### 1.17 Maskotka 🤖 ×6 → jedna ikona SVG
**Jak ma działać:** emoji 🤖 powtórzone 6× w `src/components/HKAgent/AgentWidget.jsx:37,61,90` i `AgentBot.jsx:130,150,177,213,245,258` jako maskotka „Agent AI". Zastąpić jedną spójną ikoną SVG (np. `Bot`/`Sparkles` z lucide-react, już zaimportowane w projekcie gdzie indziej) używaną we wszystkich 6 miejscach przez wspólny komponent `<AgentIcon/>`.
**Kryterium gotowości:** `rg "🤖" src` = 0; wizualnie spójna ikona w widgetach i bąblach agenta.
**Dział mózgu:** DES (mozg-des) wybiera ikonę → DEV (mozg-dev) tworzy komponent i podmienia 6 miejsc. Zależność: brak.

### 1.18 Reszta dekoracyjnych emoji w panel.html → SVG
**Jak ma działać:** pozostałe czysto dekoracyjne emoji (🎉 `panel.html:2190,2537,3672`; 🧾📝📋 `:2295-2297,3338,3796,3840`; ⚙ `:2428-2429`; 📌 `:2559,4165,4177`; 📖 `:4167,4190`; 🔔 `:1524,1650,1769`) — zamienione na SVG lub usunięte tam, gdzie tekst już niesie sens bez ikony (np. `🎉` w pustych stanach). Emoji niosące realny sens stanu (🔒🟢⚠️📱✅☑ — pełna lista w ROADMAP sekcja E) NIE są częścią tej pozycji — zostają jako koncept, ich zamiana na SVG to osobna, niżej priorytetowa decyzja o spójności renderingu.
**Kryterium gotowości:** lista dekoracyjnych emoji z ROADMAP sekcja E zredukowana do 0 lub zamieniona na SVG, przy zachowaniu emoji niosących stan.
**Dział mózgu:** DES (mozg-des) klasyfikuje przypadek po przypadku przy okazji zmian w danym widoku → DEV (mozg-dev) wdraża. Zależność: niski priorytet, robić przy okazji innych zmian w tych widokach, nie osobnym sprintem.

---

## ETAP 2 — FUNDAMENT SAAS

### 2.1 Tabele tenants + tenant_features w DB
**Jak ma działać:** nowa migracja Supabase: `tenants(id uuid pk, name, slug, status['trial'|'active'|'suspended'], plan, created_at, trial_ends_at)` + `tenant_features(tenant_id fk, feature_key text, enabled boolean)`. To rejestr tenantów z SAAS_PLAN Tier 0.3, warunek konieczny dla 2.2-2.4 i całej fabryki wersji.
**Kryterium gotowości:** `INSERT` dwóch tenantów demo z różnym `plan`/`status`; SELECT po slug zwraca poprawny wiersz.
**Dział mózgu:** DEV (mozg-dev) pisze migrację, review Plan Mode zalecany (fundament SaaS). Zależność: poprzedza 2.2, 2.3, 2.4, S2 fabrykę (2.7), 5.1.

### 2.2 Egzekwowanie server-side zamiast client-side
**Jak ma działać:** dziś `VITE_MODULES` (`src/tenants/config.js:36-44`) jest sprawdzane wyłącznie w renderze — każdy może obejść przez devtools. Po 2.1: `isModuleEnabled()` (`src/lib/modules.js:39-44`) czyta z `tenant_features` (przez Supabase, nie z buildu), a RLS/Edge Function dodatkowo blokuje zapisy do tabel modułu nieopłaconego (np. INSERT do `faults`/`hk_plan` odrzucony gdy `tenant_features.hk = false`).
**Kryterium gotowości:** wyłączenie modułu w DB dla tenanta powoduje, że próba zapisu do jego tabeli (np. curl z anon+authenticated) jest odrzucana, nie tylko ukrywana w UI.
**Dział mózgu:** SEC (inline) projektuje politykę egzekwowania → DEV (mozg-dev) implementuje. Zależność: wymaga 2.1.

### 2.3 Polityka deny-by-default
**Jak ma działać:** `src/lib/modules.js:39-44` (`isModuleEnabled`) dziś: nieznany klucz modułu ⇒ włączony (`return true`). Odwrócić: nieznany/brakujący klucz w `tenant_features` ⇒ wyłączony, chyba że moduł ma `core:true` w `MODULE_REGISTRY`.
**Kryterium gotowości:** nowy tenant bez jawnie ustawionych `tenant_features` widzi tylko moduły core; dodanie wiersza `feature_key='hk', enabled=true` odblokowuje HK.
**Dział mózgu:** DEV (mozg-dev), zmiana jednej funkcji + testy. Zależność: wymaga 2.1, robić razem z 2.2.

### 2.4 Rozszerzenie MODULE_REGISTRY o funkcje core
**Jak ma działać:** `MODULE_REGISTRY` (`src/lib/modules.js:15-29`) dziś nie obejmuje kasy, grafiku, statystyk, ewidencji, wiadomości, wiki, pracowników, ustawień — funkcji dziś zawsze dostępnych bez flagi. Dodać je jako wpisy z `core:true` (żeby nie dało się ich wyłączyć bez decyzji produktowej) — warunek konieczny, żeby S1 (tiery START/STANDARD/PRO/PREMIUM z ROADMAP) miało czym sterować.
**Kryterium gotowości:** `MODULE_REGISTRY` zawiera pełną listę modułów aplikacji (core i licencjonowalne), zgodną z tabelą tierów w ROADMAP sekcja S1.
**Dział mózgu:** DEV (mozg-dev) rozszerza rejestr, konsultacja z SMB/FIN (tiery) co ma być w którym tierze. Zależność: przed 5.1 (tiery cenowe).

### 2.5 De-hardcode brandu Conrad Comfort → tenantConfig
**Jak ma działać:** ~14 miejsc z zaszytym „Conrad Comfort" mimo istnienia `tenantConfig.hotelName`: `src/App.jsx:923,3457,3512,3757`, `src/components/Rail/WorkerSidebar.jsx:58`, `AdminSidebarRail.jsx:76`, `WelcomeOverlayScreen.jsx:29`, `src/ui/Logo.jsx:28`, `index.html:6`, `electron/main.cjs:34,90`, `package.json` (productName/appId/copyright), plus paleta plum/gold w `style.css` (tokeny `--cc-*`). Wszystkie zastąpione odczytem z `tenantConfig`/theme tenanta (docelowo `tenant_settings` z 2.19); logo SVG parametryzowane lub wymienialne per tenant.
**Kryterium gotowości:** `rg "Conrad" src electron index.html` = 0 poza `src/tenants/defaults.js` (fallback demo); build z innym `.env`/manifestem tenanta pokazuje inną nazwę i inne kolory bez zmian w kodzie.
**Dział mózgu:** DES (mozg-des) projektuje warstwę theme (tokeny CSS) → DEV (mozg-dev) wdraża podmianę w 14 miejscach. Zależność: naturalnie razem z 2.6 (rozbicie style.css) i 2.7 (fabryka wersji).

### 2.6 Rozbicie style.css na core/theme
**Jak ma działać:** `src/style.css` (8354 linii) dziś miesza layout/komponenty (core, wspólne dla każdego tenanta) z kolorami/typografią marki Conrad Comfort (theme, per tenant). Podział na `core.css` (struktura, spacing, komponenty) + `theme-conrad.css` (zmienne `--cc-*`, kolory, fonty) ładowany warunkowo/nadpisywany przez zmienne CSS z manifestu tenanta w runtime.
**Kryterium gotowości:** zmiana wyłącznie pliku theme (bez ruszania core.css) daje inny wygląd aplikacji przy tej samej strukturze DOM.
**Dział mózgu:** DES (mozg-des) projektuje podział tokenów → DEV (mozg-dev) fizycznie dzieli plik. Zależność: razem z 2.5, poprzedza pełną fabrykę wersji (2.7).

### 2.7 Fabryka wersji: jeden neutralny build + manifest z DB
**Jak ma działać:** zamiast build per hotel z `.env` (dzisiejszy `src/tenants/config.js`), jeden neutralny build „GuestSage Panel"/„GuestSage Kierownik" (neutralny `appId`/`productName`/ikona w `package.json`/`electron-builder.manager.json`) czyta manifest tenanta (branding, moduły z 2.1, config pokoi) z DB w runtime po zalogowaniu, cache w `userData`. Web: jeden deploy, tenant rozpoznawany po zalogowaniu/URL (3.2).
**Kryterium gotowości:** 2 instancje demo (Conrad Comfort + hotel testowy) działają z tego samego builda/deployu, z różnym brandingiem i zestawem modułów — dowód działania fabryki (SAAS_PLAN Tier 2.0, też pilot 5.4).
**Dział mózgu:** DEV (mozg-dev), duża pozycja — Plan Mode obowiązkowy. Zależność: wymaga 2.1, 2.5, 2.6, 2.19 (ustawienia z DB); poprzedza 5.4 (pilot).

### 2.8 URL-e GitHub Pages → konfiguracja
**Jak ma działać:** `grzankatoster-sketch.github.io` zaszyte w `src/lib/supabase.js:11`, `electron/main.cjs:324`, `public/hk-phone/panel.html:3142`, `scripts/deploy-hk-phone.mjs:15` — zastąpione zmienną konfiguracyjną (env lub `tenant_settings`/manifest), tak żeby inny tenant/inna domena produktu (docelowo `app.guestsage.pl`, patrz 3.2) nie wymagały zmiany w kodzie.
**Kryterium gotowości:** `rg "grzankatoster-sketch.github.io" src electron public` = 0 poza jednym miejscem konfiguracji domyślnej.
**Dział mózgu:** DEV (mozg-dev). Zależność: naturalnie razem z 3.2 (nowa domena produktu).

### 2.9 Migracja danych core localStorage → Supabase z tenant_id
**Jak ma działać:** rdzeń danych dziś w localStorage (`src/lib/storage.js`, ~40 kluczy z `STORAGE_KEYS`) migruje do tabel Supabase z kolumną `tenant_id` (schemat już częściowo istnieje dla HK/opinii/faults — rozszerzyć o resztę: zadania, wiadomości, wiki, korekty, historię). localStorage zostaje jako lokalny cache/offline-buffer (współpracuje z 1.5 syncQueue), nie jedyne źródło prawdy.
**Kryterium gotowości:** dwa stanowiska recepcji (2 przeglądarki/2 instalacje Electron) widzą te same dane rdzenia w czasie rzeczywistym/po odświeżeniu, nie tylko dane HK/grafiku jak dziś.
**Dział mózgu:** DEV (mozg-dev), największa pozycja Etapu 2 — Plan Mode obowiązkowy, rozbić na tabele/moduły osobnymi sesjami. Zależność: wymaga 1.3 (kompletna mapa kluczy) i 2.1; poprzedza pełne multi-stanowisko z S1.

### 2.10 Jeden wzorzec konfliktów (merge+rev) dla wszystkich danych dwustronnych
**Jak ma działać:** dziś tylko `hk_state` (`src/lib/hkState.js`, RPC `hk_state_merge`) i `schedule` (`scheduleSync.js`, RPC `schedule_merge`) mają porządny merge z `rev`+`updated_device` i ignorowaniem własnego echa. Reszta danych dwustronnych (`panel_mirror` inne `kind`, przyszłe `tenant_settings` z 2.19) dostaje ten sam wzorzec: RPC merge + `rev` + echo-ignore zamiast LWW-upsert (`cloudSync.js:20-26`).
**Kryterium gotowości:** dwie sesje edytujące ten sam rekord (np. korekty płatności z dwóch przeglądarek) nie tracą wzajemnie swoich zmian (test manualny z 2 kartami).
**Dział mózgu:** DEV (mozg-dev) uogólnia istniejący wzorzec RPC na nowe tabele. Zależność: wzorzec do zastosowania też w 2.19 (ustawienia) i 4.1 (operacje sejfowe, jeśli synchronizowane).

### 2.11 Świeżość danych u kierownika: heartbeat + banner offline
**Jak ma działać:** panel kierownika (`public/hk-phone/panel.html:2810-2935`) dziś pokazuje `cash_state` bez informacji o wieku danych. Desktop wysyła heartbeat (`pushMirror("heartbeat", {at: now})` co ~60s, wzorem istniejących `pushMirror` w `App.jsx:204,385,1076,1591`) — panel renderuje banner „recepcja offline od X min" gdy heartbeat starszy niż próg (np. 3 min), plus widoczny `updatedAt` przy każdej wartości z mirrora.
**Kryterium gotowości:** wyłączenie aplikacji recepcji → po ~3 min panel kierownika pokazuje ostrzeżenie zamiast milczącej starej kasetki.
**Dział mózgu:** DEV (mozg-dev) implementuje heartbeat + UI bannera. Zależność: brak, niezależne, wysoki ICE (80) — priorytet w Etapie 2.

### 2.12 Wydzielenie domeny kasy z App.jsx do lib/cash.mjs z testami
**Jak ma działać:** logika kasy/sejfu dziś częściowo w `src/App.jsx:1060-1830` (JSX + handlery), częściowo już w `src/lib/cash.mjs` (`calculateShiftCash`, `calculateSafeDeposit`). Dokończyć wydzielenie: `handleSafeDeposit`, `finishShift`-kasowa część, logika strażnika sejfu — czyste funkcje w `cash.mjs`, `App.jsx` tylko woła i renderuje wynik. **Strefa zamrożona — zmiana wyłącznie z kompletem testów, bez zmiany zachowania.**
**Kryterium gotowości:** `tests/cash.test.mjs` rozszerzone o przypadki dla wydzielonych funkcji; `npm run test:cash` + `node scripts/sim-nocna-sejf-300.mjs` (lokalnie, bez wysyłki) bez regresji; identyczne zachowanie przed/po (diff behawioralny, nie tylko strukturalny).
**Dział mózgu:** DEV (mozg-dev) refaktoryzuje → QA (mozg-qa) obowiązkowa weryfikacja przed merge (strefa zamrożona). Zależność: poprzedza 4.1 (operacje sejfowe budowane na tym samym module).

### 2.13 Jednolity model ról: właściciel/kierownik/recepcja/pokojówka
**Jak ma działać:** dziś tylko panel kierownika ma konta+role (`app_accounts`, `current_app_role()`); desktop (hasło-przełącznik) i telefony (gołe imię) nie mają tożsamości. Docelowy model ról w DB rozszerzony o `owner` (patrz 4.10 panel właściciela) i formalnie o `housekeeper`/`reception` jako role kont, nie tylko etykiety w UI. **Realizowane w praktyce przez 2.16-2.18** (patrz niżej — to ich bezpośrednia implementacja dla desktopu), tu tylko domknięcie modelu w DB o rolę `owner`.
**Kryterium gotowości:** tabela ról/`current_app_role()` zwraca jedną z 4 wartości spójnie dla każdego typu konta.
**Dział mózgu:** DEV (mozg-dev) rozszerza model roli o `owner`. Zależność: 2.16-2.18 implementują resztę; wymaga 2.1.

### 2.14 Token urządzenia dla desktopu
**Jak ma działać:** desktop dziś łączy się z Supabase gołym kluczem anon bez tożsamości urządzenia/instalacji. Przy aktywacji licencji (klucz licencyjny, patrz 5.2) desktop dostaje token urządzenia (np. JWT podpisany po stronie Edge Function, zapisany w `userData`/`safeStorage`) — RLS może wtedy sprawdzać `tenant_id` powiązany z tym urządzeniem zamiast wpuszczać każdy anon key. Komplementarne do 2.17 (konto identyfikuje osobę, token identyfikuje maszynę) — działają razem.
**Kryterium gotowości:** żądanie do Supabase z desktopu bez ważnego tokenu urządzenia jest odrzucane przez RLS/Edge Function.
**Dział mózgu:** SEC (inline) projektuje format tokenu i miejsce weryfikacji → DEV (mozg-dev) implementuje wydawanie i sprawdzanie. Zależność: wymaga 2.1 (tenants) i częściowo 5.2 (mechanizm licencji, żeby było co aktywować).

### 2.15 Migracja RLS na model ról i przynależności do hotelu
**Jak ma działać:** pełne domknięcie — wszystkie tabele (nie tylko `panel_mirror`/`hk_*` z 0.5) dostają polityki RLS sprawdzające jednocześnie `tenant_id` (przynależność do hotelu) i rolę konta/urządzenia (co wolno tej roli). Zastępuje dzisiejsze „każdy authenticated/anon może wszystko" spójnym modelem end-to-end.
**Kryterium gotowości:** macierz ról × tabel × operacji (SELECT/INSERT/UPDATE/DELETE) udokumentowana i pokryta politykami; próba operacji poza uprawnieniami roli odrzucona dla każdej tabeli w projekcie.
**Dział mózgu:** SEC (inline) projektuje macierz → DEV (mozg-dev) implementuje migracjami wsadowo. Zależność: wymaga 0.5, 2.13, 2.14, 2.17 — to pozycja domykająca, robić na końcu Etapu 2.

### 2.16 Osobna aplikacja „GuestSage Kierownik" — shell wrapujący panel kierownika
**Jak ma działać:** (pełny projekt w ROADMAP.md, sekcja „Aplikacja kierownika…", punkt C1). Streszczenie: nowy katalog `electron-manager/` — cienki natywny shell Electron (nie re-bundluje Reacta recepcji), `loadURL`/`loadFile` na istniejącym `panel.html`, osobny `appId`/ikona/`productName`, osobny plik `electron-builder.manager.json` i skrypty `dist:manager`/`release:manager`. Fabryka wersji jak recepcja — jeden neutralny build (zgodnie z 2.7), branding/tenant w runtime.
**Kryterium gotowości:** kierownik instaluje jedną aplikację w swoim biurze i loguje się bez przeglądarki i bez dostępu do komputera recepcji; ROADMAP ICE = 48.
**Dział mózgu:** DEV (mozg-dev) buduje shell, DES (mozg-des) projektuje ikonę/branding installer. Zależność: wymaga 2.7 (fabryka runtime) dla pełnej wersji; wersja przejściowa (loadFile lokalny panel.html) możliwa wcześniej.

### 2.17 Wspólne logowanie kontem (Supabase Auth) zamiast lokalnego hasła
**Jak ma działać:** (pełny projekt w ROADMAP.md, punkt C2). Streszczenie: `src/lib/adminAuth.js` (lokalne hasło-przełącznik) zastąpione logowaniem Supabase Auth przeciw `app_accounts` — to samo konto działa w apce Kierownika (2.16) i jako podniesienie uprawnień na recepcji (przycisk „Zaloguj jako kierownik" zamiast lokalnego hasła). Sesja zastępstwa na recepcji oznaczona w audycie (`admin_login_sessions`, `0038_panel_login_audit.sql:9`, nowe pole `device_context`).
**Kryterium gotowości:** logowanie tym samym kontem działa w obu aplikacjach; audyt logowań rozróżnia sesję z apki Kierownika od zastępstwa na recepcji; ROADMAP ICE = 30.
**Dział mózgu:** SEC (inline) projektuje model sesji → DEV (mozg-dev) implementuje. Zależność: wymaga 2.16 i uzupełnia 0.2/1.9 (te stają się zbędne po wdrożeniu).

### 2.18 Wspólne źródło ról dla obu aplikacji
**Jak ma działać:** (pełny projekt w ROADMAP.md, punkt C3). Streszczenie: `current_app_role()` (RPC już używane w panel.html) staje się źródłem prawdy o roli również dla desktopu recepcji po zalogowaniu kierownika przez 2.17 — koniec dublowania logiki „czy to jest kierownik" osobno w `adminAuth.js` i osobno w panelu.
**Kryterium gotowości:** desktop i panel kierownika odczytują rolę z tego samego wywołania RPC dla tego samego zalogowanego konta; ROADMAP ICE = 36.
**Dział mózgu:** DEV (mozg-dev). Zależność: wymaga 2.17; domyka 2.13 dla desktopu.

### 2.19 Mechanizm ustawień per hotel: rejestr + uniwersalny formularz
**Jak ma działać:** (pełny projekt w ROADMAP.md, sekcja „Łatwa konfigurowalność", punkt D). Streszczenie: nowa tabela `tenant_settings(tenant_id, key, value jsonb, rev, ...)` (wzorem `panel_mirror`/`hk_state_merge`, merge+rev zgodnie z 2.10) + `SETTINGS_REGISTRY` w `src/lib/settingsRegistry.js` (płaska lista `{key, type, label, group, default}`) + jeden generyczny formularz w `UstawieniaPanel.jsx` renderujący rejestr. Pierwszy zestaw = migracja istniejących hardkodów: moduły (2.3/2.4), progi adhoc (`DEFAULT_ADHOC_THRESHOLDS`, `constants.js:68`), stała kasowa (1.10), `EMPTY_LABEL`.
**Kryterium gotowości:** dodanie nowego prostego przełącznika (boolean/number/string) nie wymaga nowego JSX — tylko wiersza w `SETTINGS_REGISTRY`; ROADMAP ICE = 48.
**Dział mózgu:** DEV (mozg-dev) buduje tabelę+rejestr+formularz. Zależność: wymaga 2.1, wspiera 1.4, 1.10, 2.4, poprzedza pełną fabrykę wersji (2.7).

---

## ETAP 3 — INFRASTRUKTURA MULTI-TENANT

### 3.1 Automat IMAP z laptopa → Supabase cron+Edge
**Jak ma działać:** dzisiejszy `electron/hkAutomation.cjs` (proces w Electronie recepcji, cykl co 15 min, IMAP `panel34.kki.pl`) migruje na Supabase: `pg_cron` (już używany do TTL, patrz `PANEL_DEPLOY.md` sekcja 3) wyzwala Edge Function co N minut, która robi to samo (IMAP fetch → `scripts/hk-automation/lib/parser.cjs` przeniesiony/przepisany pod Deno lub jako osobny mikroserwis) i pisze do `hk_plan`. Likwiduje SPOF „laptop wyłączony = brak planów HK".
**Kryterium gotowości:** plany HK powstają w Supabase przy WYŁĄCZONYM desktopie recepcji (test: zatrzymać Electron, poczekać na cykl crona, sprawdzić nowy wiersz `hk_plan`).
**Dział mózgu:** DEV (mozg-dev), duża migracja infrastrukturalna — Plan Mode zalecany. Zależność: niezależne, ale logicznie po 2.1 (tenant_id już wszędzie).

### 3.2 Link kierownika per tenant: app.guestsage.pl/t/{hotel}/panel
**Jak ma działać:** zamiast dzisiejszego GitHub Pages na prywatnym koncie (`grzankatoster-sketch.github.io/hk-phone/panel.html`), jeden deploy (Vercel/Cloudflare Pages, darmowy tier) pod domeną produktu, tenant rozpoznawany po ścieżce `/t/{slug}/`. Slug → `tenant_id` rozwiązywany przez zapytanie do `tenants` (2.1).
**Kryterium gotowości:** dwóch różnych tenantów pod dwoma różnymi slugami widzi wyłącznie własne dane pod tym samym deployem.
**Dział mózgu:** DEV (mozg-dev) implementuje routing → OPS (mozg-ops) konfiguruje domenę/DNS. Zależność: wymaga 2.1, 3.7 (panel.html w pipeline) ułatwia, ale nie blokuje.

### 3.3 Maile raportowe per tenant: centralny inbound + routing
**Jak ma działać:** zamiast jednej skrzynki `raporty@conradcomfort.pl`, centralny inbound `raporty+{slug}@guestsage.pl` (Cloudflare Email Routing → Worker → Supabase Storage/Edge Function), routing po adresacie do właściwego tenanta. Docelowo (3.4) zastąpiony webhookiem/API PMS zamiast maila w ogóle — to rozwiązanie przejściowe dla hoteli bez integracji API.
**Kryterium gotowości:** mail wysłany na `raporty+demo@guestsage.pl` trafia do planów HK tenanta „demo", nie miesza się z innymi tenantami.
**Dział mózgu:** DEV (mozg-dev) implementuje routing/Worker → OPS (mozg-ops) konfiguruje domenę pocztową. Zależność: wymaga 2.1; powiązane z 3.1 (automat bez laptopa).

### 3.4 Interfejs PmsConnector, KWHotel jako pierwsza wtyczka
**Jak ma działać:** dziś `electron/kwhotel.cjs` (`login`, `getArrivals`, `getDepartures`, `getRoomStatus`) i `scripts/hk-automation/lib/parser.cjs` są pisane wprost pod format KWHotel/mail tego hotelu. Nowy interfejs `PmsConnector` (`{testConnection, getArrivals, getDepartures, getRoomStatus}`) z KWHotel jako pierwszą implementacją; import CSV ręczny jako uniwersalny MVP dla hoteli z innym PMS, zanim powstaną kolejne konektory.
**Kryterium gotowości:** `npm run hk:auto:test` przechodzi zarówno na próbkach formatu KWHotel, jak i na przykładowym CSV przez nowy import.
**Dział mózgu:** DEV (mozg-dev) projektuje interfejs i migruje istniejący kod KWHotel pod niego. Zależność: niezależne, ale wartościowe dopiero przy 5.4 (pilot hotel #2 z innym PMS).

### 3.5 hkserver: strony LAN jako pliki statyczne + SSE zamiast pollingu
**Jak ma działać:** `electron/hkserver.cjs:867,965,1063` generuje strony telefonów jako sklejane stringi JS z pollingiem 1s/4s/5s. Zamiana na osobne pliki statyczne w `public/hk-lan/*.html` serwowane przez ten sam serwer HTTP, komunikacja przez istniejący SSE (hkserver ma już mechanizm push) zamiast setInterval na kliencie.
**Kryterium gotowości:** telefon w LAN otrzymuje aktualizacje przez SSE zamiast odpytywania co 1s; `rg "setInterval" electron/hkserver.cjs` znacząco zredukowane.
**Dział mózgu:** DEV (mozg-dev), refaktor średniego ryzyka (dotyka działającej funkcji telefonów) → QA (mozg-qa) test na realnym telefonie w LAN przed merge. Zależność: brak, ale robić razem z 0.6 (token QR) skoro dotyka tego samego pliku.

### 3.6 Polling → zdarzenia w usterkach/czacie/agencie/HKLive
**Jak ma działać:** `App.jsx:1207` (faults, 3s), `App.jsx:1226` (chat, 15s — mimo że storage-event już podpięty obok w `:1224`), `useHKAgent.js:298` (agent, 12s), `HKLivePanel.jsx:294,222` (HK live, 15s/1s) zastąpione Supabase Realtime (`postgres_changes`, wzorem `subscribeHkState`/`subscribeSchedule`) tam gdzie dane już są w Supabase, albo natywnym `storage`-event tam gdzie tylko localStorage.
**Kryterium gotowości:** zmiana w jednej karcie widoczna w drugiej bez 3-15s opóźnienia; zużycie CPU na bezczynnej karcie spada (DevTools Performance).
**Dział mózgu:** DEV (mozg-dev). Zależność: częściowo zależy od 2.9 (dane w Supabase), dla czysto-localStorage części (chat) można zrobić od razu.

### 3.7 panel.html do pipeline'u Vite ze wspólnymi modułami
**Jak ma działać:** `public/hk-phone/panel.html` (4588 linii ręcznego HTML+JS) staje się drugim entrypointem w `vite.config.js`, dzieląc z `src/` wspólne moduły: normalizator diakrytyków (1.6), klient Supabase (`src/lib/supabase.js`), kolory statusów HK (`constants.js`), docelowo komponenty React zamiast template-literali. Build generuje `panel.html` jako artefakt Vite zamiast ręcznie utrzymywanego pliku.
**Kryterium gotowości:** `npm run build` generuje działający `panel.html`; smoke test z `PANEL_DEPLOY.md` punkt 7 przechodzi bez regresji.
**Dział mózgu:** DEV (mozg-dev), duża pozycja refaktoryzacyjna — Plan Mode zalecany, rozbić na etapy (najpierw wspólne moduły, potem stopniowa migracja komponentów). Zależność: ułatwia 1.16 (ikony SVG), 3.2 (routing), nie blokuje żadnej z nich krytycznie.

### 3.8 Konsolidacja dwóch systemów web-push w jeden
**Jak ma działać:** dziś dwa niezależne systemy: lokalny w `hkserver.cjs` (VAPID w `~/.hkserver-vapid.json`, `:30-31`, push przez `/push/task|priority|info`) i chmurowy Edge Function `push-send` (service role, webhook na INSERT do `hk_tasks`/`faults`). Docelowo jeden system — rekomendacja: `push-send` jako jedyny (przeżywa restart desktopu, działa też gdy laptop offline zgodnie z 3.1), `hkserver.cjs` przestaje zarządzać własnymi subskrypcjami VAPID.
**Kryterium gotowości:** telefon subskrybuje push raz i dostaje powiadomienia niezależnie od tego, czy desktop jest włączony; `rg "hkserver-vapid" electron` = 0 po migracji.
**Dział mózgu:** DEV (mozg-dev). Zależność: wymaga/współgra z 3.1 (automat poza laptopem) i 3.5.

### 3.9 hk_plan w Supabase jako jedyne źródło planów HK
**Jak ma działać:** dziś plany HK piszą się i na dysk (`C:\zmiany i raporty\hk-automation\plans\`, `writePlans` w `hkAutomation.cjs:238`) i do Supabase `hk_plan` (`upsertPlansToSupabase`, `:249`) — dwa magazyny, dwóch czytelników (desktop czyta dysk przez IPC `hk-automation-get-plan`, panel/telefony czytają Supabase). Po 3.1 (automat w chmurze) dysk przestaje być potrzebny — Supabase staje się jedynym źródłem, desktop czyta też z Supabase zamiast IPC-do-dysku.
**Kryterium gotowości:** `rg "hk-automation-get-plan" electron/main.cjs` usunięte/zastąpione odczytem Supabase; brak rozjazdu między dyskiem a bazą (bo dysku już nie ma).
**Dział mózgu:** DEV (mozg-dev). Zależność: wymaga 3.1 (bez migracji automatu ta pozycja nie ma sensu — nie ma czym pisać do Supabase bez laptopa).

### 3.10 Baza: jeden projekt Supabase multi-tenant, region EU
**Jak ma działać:** (uzasadnienie pełne w ROADMAP.md, sekcja S4). Decyzja architektoniczna, nie zadanie kodowe: pozostać przy jednym projekcie Supabase (nie projekt per tenant — koszt $10-25/msc/hotel zabiłby marżę przy cenach z 5.1), region Frankfurt/EU, RODO przez DPA per hotel (5.3) + szczelne RLS per tenant (0.5, 2.15) + retencja pg_cron. Dedykowany projekt tylko jako opcja enterprise za dopłatą, nie domyślny model.
**Kryterium gotowości:** decyzja udokumentowana i zakomunikowana zespołowi/klientom w materiałach sprzedażowych (SAL) i prawnych (LEG); brak technicznej pracy poza tym co już robi 0.5/2.1/2.15.
**Dział mózgu:** RES (mozg-research) potwierdza analizę kosztową → LEG (mozg-leg) potwierdza zgodność RODO → decyzja CEO. Zależność: informuje 2.1, 2.15, 5.3.

---

## ETAP 4 — NOWE FUNKCJE

### 4.1 Wpłaty/wypłaty do sejfu (rozszerzenie strefy zamrożonej)
**Jak ma działać:** (pełny projekt w ROADMAP.md, sekcja S5a). Streszczenie: nowy log `safe_operations` (docelowo tabela z `tenant_id`) `{id, date, shift, type:'deposit'|'withdrawal', amount, reason, by, balanceAfter}`. Nowa funkcja `applySafeOperation()` w `src/lib/cash.mjs` OBOK istniejących `calculateShiftCash`/`calculateSafeDeposit` — te dwie NIETKNIĘTE. UI: przycisk „Operacja sejfowa" w `KasaAdminPanel`, saldo read-only dla recepcji. Raport dobowy PDF dostaje nową sekcję.
**Kryterium gotowości:** nowe przypadki w `tests/cash.test.mjs` (wpłata/wypłata/overWithdrawal/sekwencja vs `handleSafeDeposit`) + `sim-nocna-sejf-300` bez regresji; ROADMAP ICE = 48.
**Dział mózgu:** DEV (mozg-dev) implementuje jako rozszerzenie → QA (mozg-qa) obowiązkowa pełna weryfikacja (strefa zamrożona) przed merge. Zależność: wymaga dokończenia 2.12 (domena kasy wydzielona).

### 4.2 Sklepik recepcji — osobna linia utargu w raporcie
**Jak ma działać:** (pełny projekt w ROADMAP.md, sekcja S5b). Streszczenie: `shop_items{id,name,price,stock,minStock,active}`, `shop_sales{id,itemId,name,qty,unitPrice,total,payment,shift,by,createdAt}` (ceny denormalizowane). Nowy moduł `sklepik` w `MODULE_REGISTRY` (2.4). Utarg jako osobna linia w raporcie zmiany/dobowym PDF — zero zmian w `calculateShiftCash` (kasa sklepiku nie miesza się z logiką KW). Alert stanu minimalnego w `InboxPanel`.
**Kryterium gotowości:** czysta funkcja `shopTotals()` z testami vitest (sumy per metoda płatności, storno, stany); ROADMAP ICE = 36.
**Dział mózgu:** DEV (mozg-dev) implementuje moduł. Zależność: wymaga 2.4 (rejestr modułów), niezależne od strefy zamrożonej kasy.

### 4.3 Dashboard przyjazdów/wyjazdów dnia
**Jak ma działać:** `electron/kwhotel.cjs:246-283` ma już gotowe `getArrivals(date)`/`getDepartures(date)` (próbuje REST API KWHotel, fallback scrape HTML) — dziś bez żadnego UI w desktopie. Nowy widok/panel w recepcji renderujący listę przyjazdów/wyjazdów dnia z wywołania istniejącego IPC (`kwhotel-arrivals`/`kwhotel-departures`, `main.cjs:223-224`).
**Kryterium gotowości:** nowa zakładka pokazuje realną listę gości na dziś z połączonego KWHotel (manualny test na danych testowych).
**Dział mózgu:** DEV (mozg-dev) buduje UI na istniejącym backendzie → DES (mozg-des) projektuje layout listy. Zależność: brak, backend gotowy — najniższy próg wejścia z całego Etapu 4 (ROADMAP ICE = 64).

### 4.4 Drafty odpowiedzi na opinie Booking przez AI
**Jak ma działać:** nowy task `reply` w Edge Function `llm` (`supabase/functions/llm/index.ts:25-40`, dziś 12 tasków, brak `reply`) generujący draft odpowiedzi na pojedynczą opinię: `generateReviewReply({score,positives,negatives,guest_name,language})` w `src/lib/llm.js` obok `analyzeReviews` (`:126-138`). UI w `ReviewsPanel.jsx` — przycisk „Wygeneruj odpowiedź" przy każdej opinii, draft w edytowalnym textarea do ręcznego wklejenia na Booking (brak publicznego API do auto-publikacji).
**Kryterium gotowości:** kliknięcie przy opinii generuje sensowny draft PL/EN zależnie od `language` opinii; publikacja pozostaje ręczna.
**Dział mózgu:** DEV (mozg-dev) implementuje task + UI. Zależność: naturalnie razem z 4.17-4.19 (ta sama domena opinii), patrz ROADMAP „reviews-notify + draft AI" ICE = 48.

### 4.5 Lost & found w desktopie
**Jak ma działać:** tabela `found_items` już istnieje i jest używana przez telefony HK (`public/hk-phone/index.html:717,742,747`) — brak odpowiednika w desktopie recepcji. Nowy panel w `src/modules/` (np. `LostFound/LostFoundPanel.jsx`) czytający/piszący tę samą tabelę Supabase: rejestr znalezionych przedmiotów, wydania gościom, generowanie PDF pokwitowania (wzorem `pdf-voucher.js`).
**Kryterium gotowości:** przedmiot dodany z telefonu HK widoczny w nowym panelu recepcji i odwrotnie; PDF pokwitowania generuje się poprawnie.
**Dział mózgu:** DEV (mozg-dev). Zależność: brak, backend gotowy (ROADMAP ICE = 60).

### 4.6 Budziki / wake-up calls
**Jak ma działać:** nowy moduł wzorowany na `datedReminders` (istniejący wzorzec przypomnień z datą) — harmonogram budzenia per pokój/gość (`wake_up_calls{room, guestName, requestedAt, done, doneBy}`), lista na zmianę nocną z odhaczaniem, integracja z `InboxPanel` (alert o zbliżającym się budzeniu).
**Kryterium gotowości:** dodanie budzenia na konkretną godzinę generuje przypomnienie widoczne w `InboxPanel` w tym oknie czasowym; odhaczenie zapisuje kto i kiedy.
**Dział mózgu:** DEV (mozg-dev) implementuje na wzorcu istniejących przypomnień. Zależność: brak (ROADMAP ICE = 48, tier START).

### 4.7 Rejestr kluczy i kart pokojowych
**Jak ma działać:** nowy moduł wzorowany na `ParkingPanel.jsx` (CRUD + historia, ten sam kształt komponentu) — `room_keys{room, cardNo, issuedTo, issuedAt, returnedAt, deposit, lost}`, wydania/zwroty z historią, alert dla kart niezwróconych po wymeldowaniu (zderzenie z listą wyjazdów z 4.3).
**Kryterium gotowości:** wydanie i zwrot karty rejestruje się w historii; karta niezwrócona po dacie wymeldowania pojawia się jako alert.
**Dział mózgu:** DEV (mozg-dev) na wzorcu ParkingPanel. Zależność: korzysta z 4.3 (lista wyjazdów) dla pełnej wartości, ale działa też samodzielnie (ROADMAP ICE = 48, tier STANDARD).

### 4.8 Depozyty gości z podpisem
**Jak ma działać:** `SignatureCanvas` (`src/components/SignatureCanvas.jsx`) już istnieje i jest używany w `CorrectionApprovalModal.jsx` — nowy moduł depozytów (`guest_deposits{guestName, room, itemDesc, depositedAt, returnedAt, signatureIn, signatureOut}`) reużywa ten sam komponent podpisu przy złożeniu i przy odbiorze; PDF pokwitowania wzorem `pdf-voucher.js`.
**Kryterium gotowości:** złożenie i zwrot depozytu wymaga podpisu (canvas), generuje się PDF z obydwoma podpisami.
**Dział mózgu:** DEV (mozg-dev), reużycie istniejącego komponentu obniża pracochłonność. Zależność: brak (ROADMAP ICE = 48, tier STANDARD).

### 4.9 Nocny raport e-mail do właściciela
**Jak ma działać:** dane już istnieją w `reports_full`/`shift_reports` (`panel_mirror`/tabela raportów) — nowa Edge Function (Resend, zgodnie z WORK_PLAN B8) uruchamiana `pg_cron` w nocy, składająca podsumowanie (obłożenie, kasa, incydenty) i wysyłająca mailem do adresu właściciela z `tenant_settings` (2.19).
**Kryterium gotowości:** mail przychodzi automatycznie o ustalonej porze z poprawnymi liczbami za miniony dzień.
**Dział mózgu:** DEV (mozg-dev) implementuje Edge Function + cron. Zależność: wymaga 2.19 (adres per tenant) i danych z 2.9 (raporty w Supabase); ROADMAP ICE = 48, tier PREMIUM.

### 4.10 Panel właściciela read-only
**Jak ma działać:** panel.html ma już model ról (`current_app_role()`) — dodanie nowej roli `owner` (patrz 2.13) z dedykowanym, read-only widokiem agregatów: kasa, obłożenie, opinie, usterki, HK — bez możliwości edycji, tylko podgląd KPI.
**Kryterium gotowości:** konto z rolą `owner` widzi zbiorczy dashboard i nie ma dostępu do żadnej akcji zapisu (sprawdzone RLS + UI).
**Dział mózgu:** DEV (mozg-dev) implementuje widok i rolę → SEC (inline) weryfikuje że rola faktycznie nie ma praw zapisu. Zależność: wymaga 2.13/2.15 (model ról i RLS); ROADMAP ICE = 48, tier PREMIUM.

### 4.11 Inspekcje jakości HK
**Jak ma działać:** tabela `hk_quality_checks` już istnieje i jest używana przez telefony (`public/hk-phone/index.html:962,984`) — brak UI w desktopie. Nowy panel w module HK (`src/modules/HK/`) z checklistami pokoi i ocenami, czytający/piszący tę samą tabelę.
**Kryterium gotowości:** inspekcja dodana z desktopu widoczna w tabeli używanej też przez telefony (i odwrotnie).
**Dział mózgu:** DEV (mozg-dev). Zależność: brak, backend gotowy (ROADMAP ICE = 48, tier PRO).

### 4.12 Upsell tracker late-checkout/early check-in
**Jak ma działać:** nowy, prosty moduł rejestrujący dopłaty (late checkout, early check-in, dostawka łóżka itp.) jako osobną linię w raporcie zmiany/dobowym — ten sam wzorzec co sklepik (4.2): `upsell_charges{type, amount, room, shift, by, createdAt}`, suma w raporcie PDF, zero wpływu na logikę KW/kasy.
**Kryterium gotowości:** dodana dopłata pojawia się w raporcie dobowym jako osobna, podsumowana pozycja.
**Dział mózgu:** DEV (mozg-dev), wzorzec identyczny do 4.2 — sensownie robić razem/od razu po. Zależność: brak (ROADMAP ICE = 48, tier STANDARD).

### 4.13 Kreator onboardingu nowego hotelu
**Jak ma działać:** formularz krokowy (nazwa, branding, pokoje/piętra, pracownicy, wybór modułów z `MODULE_REGISTRY`) zapisujący bezpośrednio do `tenants`/`tenant_features`/`tenant_settings` (2.1, 2.19) — konsumuje manifest tenanta zaprojektowany w 2.7, zastępuje dzisiejszy ręczny proces „nowy `.env` + build".
**Kryterium gotowości:** wypełnienie kreatora tworzy w pełni działającego nowego tenanta bez ręcznej edycji kodu/bazy przez dewelopera.
**Dział mózgu:** DEV (mozg-dev) implementuje formularz → DES (mozg-des) projektuje flow UX. Zależność: wymaga 2.1, 2.7, 2.19 — robić na końcu Etapu 2/na progu Etapu 5; poprzedza 5.4 (pilot).

### 4.14 Wielojęzyczność EN/UK
**Jak ma działać:** ekstrakcja hardcoded polskich stringów UI (naturalny produkt uboczny 2.5 de-hardcode brandu) do plików tłumaczeń (`i18n/pl.json`, `i18n/en.json`, `i18n/uk.json`), przełącznik języka per konto/urządzenie (istotne dla personelu HK, często obcokrajowcy). Zakres startowy: UI pracownika (WorkerSidebar, moduły worker-facing), nie cały panel admina.
**Kryterium gotowości:** przełączenie języka w ustawieniach konta zmienia etykiety UI pracownika bez przeładowania danych.
**Dział mózgu:** DEV (mozg-dev) implementuje mechanizm i18n → DES (mozg-des) dba o spójność UI przy dłuższych tłumaczeniach EN. Zależność: efektywniej po 2.5 (stringi już przechodzą przez warstwę konfiguracji); ROADMAP ICE = 36, tier STANDARD.

### 4.15 Moduł śniadań
**Jak ma działać:** lista gości z opcją BB (bed&breakfast) na dany dzień, pochodząca z danych KWHotel/importu (4.3 dashboard jako fundament), z odhaczaniem obecności na sali śniadaniowej — nowy prosty panel `src/modules/Breakfast/` wzorem listy dnia jak w 4.3.
**Kryterium gotowości:** lista gości BB na dziś generuje się z danych przyjazdów, odhaczenie zapisuje się i jest widoczne dla całej zmiany.
**Dział mózgu:** DEV (mozg-dev). Zależność: korzysta z danych z 4.3; ROADMAP ICE = 36, tier PRO.

### 4.16 Integracja KSeF/faktury (odłożone)
**Jak ma działać:** integracja z Krajowym Systemem e-Faktur dla modułów generujących dokumenty sprzedaży (sklepik 4.2, vouchery, ewentualnie stali goście z fakturami). Świadomie odłożone — duży compliance, sensowne dopiero przy >10 tenantach płacących.
**Kryterium gotowości:** brak — pozycja odłożona, kryterium to decyzja „zaczynamy" podjęta przy odpowiedniej skali klientów.
**Dział mózgu:** LEG (mozg-leg) monitoruje próg regulacyjny/biznesowy → DEV dopiero po zielonym świetle. Zależność: liczba aktywnych tenantów (5.1/5.2/5.4); ROADMAP ICE = 8, najniższy priorytet.

### 4.17 Naprawa syncu opinii: main proces + trwały zapis widzianych ID
**Jak ma działać:** (pełna diagnoza i projekt w ROADMAP.md, sekcja „Nowe funkcje user", część A, punkty N1-N4). Streszczenie: sync Booking (dziś żyje tylko w `useEffect` `ReviewsPanel.jsx:217-228`, umiera gdy zakładka nie jest otwarta) przeniesiony do `electron/main.cjs` jako niezależny `setInterval` od `app.whenReady()` (wzorem `hkAutomation.start()`, `main.cjs:388`); trwały zapis „widzianych ID" w `userData`; licznik kolejnych porażek z realnym komunikatem błędu zamiast generycznego „pokazuję zapisane" (`ReviewsPanel.jsx:202,209`); cache-fallback w `main.cjs:196-218` uruchamiany też dla `ok:false` bez wyjątku (dziś tylko w `catch`).
**Kryterium gotowości:** wyłączenie `APIFY_TOKEN` na chwilę pokazuje realny powód błędu i eskaluje po kilku porażkach zamiast ciszy; ROADMAP ICE = 80.
**Dział mózgu:** DEV (mozg-dev) implementuje. Zależność: poprzedza 4.18/4.19 (powiadomienie potrzebuje działającego syncu w tle).

### 4.18 Powiadomienie w aplikacji o nowej opinii
**Jak ma działać:** (pełny projekt w ROADMAP.md, część A). Streszczenie: diff nowości liczony w main procesie po 4.17 (zbiór ID poprzedniego cyklu vs nowy) — nowa opinia wyzwala natywny `notify` (już istnieje, `main.cjs:339-365`) oraz wewnątrz-appowy toast przez istniejący `ToastContainer`, event IPC `review-new` wysyłany z main do renderera (wzorem `sendUpdateEvent`, `main.cjs:56-58`).
**Kryterium gotowości:** nowa opinia w danych testowych Apify skutkuje toastem + natywnym powiadomieniem w ≤5 min bez otwierania zakładki Opinie; ROADMAP ICE = 64.
**Dział mózgu:** DEV (mozg-dev). Zależność: wymaga 4.17.

### 4.19 Draft odpowiedzi AI dołączony do powiadomienia
**Jak ma działać:** (pełny projekt w ROADMAP.md, część A, oraz 4.4). Streszczenie: powiadomienie z 4.18 dołącza od razu draft wygenerowany nowym taskiem `reply` w Edge `llm` (ten sam task co 4.4) — toast/panel „Nowa opinia" pokazuje ocenę + edytowalny draft do wklejenia na Booking.
**Kryterium gotowości:** powiadomienie o nowej opinii zawiera gotowy draft odpowiedzi bez dodatkowego kliknięcia „Wygeneruj"; ROADMAP ICE = 48.
**Dział mózgu:** DEV (mozg-dev). Zależność: wymaga 4.4 (task `reply` istnieje) i 4.18 (mechanizm powiadomień).

### 4.20 Asystent cen BEZ konkurencji: własne stawki + własna historia obłożenia
**Jak ma działać:** (fundament silnika opisany w ROADMAP.md część B jako „pricing-engine-reguły", tu zawężone do wariantu bez scrapingu konkurencji — patrz 4.23). Model danych: `own_rates{tenant_id, stay_date, room_type, current_price, suggested_price, suggested_reason jsonb, status}`. Silnik: `suggested_price = own_base_price × sezonowość(dzień tygodnia, trend obłożenia z KWHotel getArrivals/getDepartures, kwhotel.cjs:246-283)`, bez czynnika konkurencji. Ekran „Propozycje cen" per dzień z uzasadnieniem, kierownik zatwierdza/edytuje/odrzuca — zero automatycznych zmian.
**Kryterium gotowości:** propozycja ceny na weekend/dzień o wysokim historycznym obłożeniu jest wyżej niż na dzień słaby, z widocznym uzasadnieniem; zatwierdzenie zapisuje `approved_price`.
**Dział mózgu:** DEV (mozg-dev) implementuje model+silnik+UI. Zależność: korzysta z danych KWHotel (już dostępnych); nie wymaga 4.23. Tier PREMIUM add-on, ROADMAP „pricing-engine-reguły" ICE = 30 (bez komponentu konkurencji, proporcjonalnie niższy zakres niż wersja pełna).

### 4.21 Modyfikator „coś się dzieje w mieście": wydarzenia (Ticketmaster + ręcznie)
**Jak ma działać:** (pełny projekt w ROADMAP.md, część B, „pricing-engine-sygnały-zewnętrzne"). Tabela `external_signals{tenant_id, signal_date, kind:'event', payload jsonb, weight_hint}`. Źródło: **Ticketmaster Discovery API** (darmowy tier, dobre pokrycie dużych eventów) + ręczne dodawanie eventów przez kierownika (prosty formularz) jako uzupełnienie tańsze i pewniejsze niż scraping niepewnych lokalnych kalendarzy. Modyfikator addytywny (+10-25% zależnie od `expected_attendance`) dokładany do bazowej ceny z 4.20.
**Kryterium gotowości:** duży event w dniu `stay_date` (z Ticketmaster lub wpisany ręcznie) podnosi `suggested_price` z widocznym uzasadnieniem „+15% — koncert Tauron Arena".
**Dział mózgu:** RES (mozg-research) potwierdza dobór API (Ticketmaster vs alternatywy) → DEV (mozg-dev) implementuje integrację. Zależność: wymaga 4.20 (silnik bazowy); ROADMAP ICE = 12 (razem z 4.22).

### 4.22 Modyfikator pogodowy (Open-Meteo)
**Jak ma działać:** (część projektu z ROADMAP.md B, „pricing-engine-sygnały-zewnętrzne"). Kolejny `external_signals kind='weather'` z **Open-Meteo** (darmowe, bez klucza API) — prognoza/historia dla lokalizacji hotelu. Waga celowo mała (±2-3%) — pogoda to słaby predyktor popytu hotelowego, nie przeceniać w V1.
**Kryterium gotowości:** prognoza deszczu/chłodu dla weekendu daje niewielki modyfikator w dół dla ofert typu city-break, widoczny w `suggested_reason`.
**Dział mózgu:** RES (mozg-research) potwierdza że Open-Meteo wystarcza (darmowe, bez klucza) → DEV (mozg-dev) implementuje. Zależność: wymaga 4.20; razem z 4.21 dopiero PO sprawdzeniu 4.20 w praktyce (zasada „reguły przed sygnałami" z ROADMAP).

### 4.23 Opcjonalny dodatek: śledzenie cen konkurencji z Booking (ryzyko prawne, wyłączony domyślnie)
**Jak ma działać:** (pełny projekt i **zastrzeżenie prawne** w ROADMAP.md część B — obowiązkowo przeczytać przed wdrożeniem). Model: `competitors{tenant_id,name,booking_url,active}`, `competitor_rates{tenant_id,competitor_id,observed_at,stay_date,room_type,price,source}` jako **append-only log** (trend, nie snapshot). Scraping przez Apify (osobny actor do dostępności/cen, do doboru — nie ten sam co opinie), harmonogram max 2×/dzień, limit liczby konkurentów, **domyślnie WYŁĄCZONY**, wymaga świadomej zgody klienta (checkbox z disclaimerem o ToS Booking.com) przed aktywacją. Strategia `cheaper`/`pricier`/`match_pct` z twardymi widełkami `min_price`/`max_price` jako dodatkowy modyfikator do silnika z 4.20.
**Kryterium gotowości:** funkcja nieaktywna bez jawnej zgody tenanta w UI; po włączeniu — trend cen konkurenta widoczny na wykresie, propozycja ceny uwzględnia strategię względem niego.
**Dział mózgu:** LEG (mozg-leg) ocenia i formalizuje ryzyko prawne (ToS Booking.com, ustawa o zwalczaniu nieuczciwej konkurencji) PRZED jakąkolwiek implementacją → RES (mozg-research) ocenia alternatywę (płatne API rate-shopperów typu OTA Insight/RateGain) → DEV (mozg-dev) implementuje dopiero po decyzji CEO. Zależność: wymaga 4.20; ROADMAP ICE = 24 — najniższy w grupie cenowej z powodu ryzyka prawnego, mimo realnej wartości biznesowej.

---

### 4.24 Bot WhatsApp: wysyłka linku do grafiku
**Jak ma działać:** jeden wspólny serwis (wzorem `hkAutomation.cjs`) z jedną sesją Baileys (WhatsApp Web przez QR, numer dedykowany „bot", nie prywatny numer pracownika) — multi-tenant: przy publikacji grafiku (przycisk „Zapisz grafik" już istniejący, [[project_schedule_realtime_sync]]) serwis odczytuje numer managera (przechowywany zaszyfrowany w Supabase przez `pgcrypto`/`pgp_sym_encrypt`, klucz deszyfrujący WYŁĄCZNIE w Edge Function, nigdy w paczce Electron — powtórka wzorca wycieku z 0.2/0.3) i TTL (`availability_requests.expires_at`/`p_ttl_hours`, wzorzec [[project_grafik_ttl_hk]]) i wysyła szablon: „Dzień dobry! Grafik — [nazwa hotelu z tenants.name]. Link: [url]. Aktywny przez [24h/48h], do [expires_at]." Throttling wysyłki (kilka sekund między wiadomościami) żeby wolumen wielu hoteli naraz nie oznaczył numeru jako spam.
**Kryterium gotowości:** kliknięcie „Zapisz grafik" wysyła wiadomość WhatsApp z poprawnym linkiem, nazwą hotelu i datą wygaśnięcia zgodną z `expires_at`; numer telefonu managera nigdy nie pojawia się w postaci jawnej w kliencie Electron/panelu (tylko w Edge Function).
**Dział mózgu:** DEV (mozg-dev) implementuje serwis + szyfrowanie numerów → SEC (inline) weryfikuje że klucz deszyfrujący nie wycieka do klienta (powtórka checklisty z [[project_secret_leak_installer]]). Zależność: wymaga 2.1 (tenants, nazwa hotelu), korzysta z istniejącego TTL (0028); niezależne od reszty Etapu 4.

### 4.25 Onboarding pracownika: tura pierwszego logowania
**Jak ma działać:** flaga `onboarded_at` per konto w `app_accounts` (nie `localStorage` — pracownik może logować się z różnych telefonów). Przy pierwszym logowaniu (flaga pusta) panel pokazuje lekką nakładkę własnej roboty (bez biblioteki typu intro.js/driver.js — niepotrzebny dependency dla prostego spotlightu na 4-5 ikonach) — checklist + podświetlenie zakładek z `tabsFor(role)`, „Dalej"/„Pomiń". Po zakończeniu/pominięciu RPC ustawia `onboarded_at=now()`.
**Kryterium gotowości:** nowe konto po pierwszym `claim_account`/zalogowaniu widzi turę dokładnie raz; drugie logowanie (nawet z innego telefonu) już jej nie pokazuje.
**Dział mózgu:** DES (mozg-des) projektuje nakładkę (spotlight+checklist) → DEV (mozg-dev) implementuje flagę + komponent. Zależność: brak, niezależne; naturalnie razem z 4.13 (kreator onboardingu tenanta) jako para „onboarding hotelu" + „onboarding pracownika", ale osobne zakresy.

---

## ETAP 5 — KOMERCJA

### 5.1 Tiery cenowe: START/STANDARD/PRO/PREMIUM + add-ony
**Jak ma działać:** (pełna tabela w ROADMAP.md, sekcja S1). START 149 PLN/msc (rdzeń: przekazanie zmiany, kasa+sejf w tym 4.1, raporty PDF, usterki, historia, wiki, wiadomości), STANDARD 299 (+grafik, parking, stali goście, vouchery, ewidencja, multi-stanowisko, sklepik 4.2), PRO 499 (+HK komplet, telefony, panel kierownika), PREMIUM 749 (+AI/LLM, opinie Booking, BI, panel właściciela). Add-ony 29-99 PLN dokupywane do niższych tierów. Wymaga rozszerzonego `MODULE_REGISTRY` (2.4) jako mechanizmu egzekwowania.
**Kryterium gotowości:** cennik i zawartość tierów zatwierdzone i spisane w materiale sprzedażowym; każdy moduł z Etapu 4 ma przypisany tier w `MODULE_REGISTRY`.
**Dział mózgu:** FIN (mozg-fin) i SMB (mozg-smb) ustalają finalne ceny/marże → SAL (mozg-sal) przygotowuje materiał sprzedażowy. Zależność: wymaga 2.4 (rejestr modułów gotowy do różnicowania).

### 5.2 Płatności i licencje: Paddle/Stripe + kill-switch
**Jak ma działać:** integracja Paddle (merchant of record, ogarnia VAT UE — rekomendacja z SAAS_PLAN) lub Stripe do subskrypcji cyklicznych; status tenanta (`tenants.status` z 2.1: `trial`/`active`/`suspended`) sprawdzany przy starcie aplikacji/logowaniu — brak płatności po karencji (np. 7 dni) → `suspended` → aplikacja blokuje dostęp z komunikatem, nie usuwa danych. Powiązane z 2.14 (token urządzenia sprawdza też status przy odświeżaniu).
**Kryterium gotowości:** symulacja końca okresu próbnego bez płatności skutkuje blokadą logowania z jasnym komunikatem, dane tenanta pozostają nienaruszone.
**Dział mózgu:** FIN (mozg-fin) projektuje flow płatności → DEV (mozg-dev) implementuje integrację i kill-switch. Zależność: wymaga 2.1, 2.14; poprzedza 5.4 (pilot płatny).

### 5.3 Prawne: umowa SaaS + DPA per hotel + retencja
**Jak ma działać:** wzór umowy SaaS (regulamin/ToS) + DPA (umowa powierzenia danych — GuestSage jako procesor danych gości hoteli-klientów, zgodnie z ryzykiem RODO opisanym w ROADMAP S4), polityka retencji danych (zgodna z `pg_cron` TTL już używanym w projekcie), procedura prawa do usunięcia danych po `tenant_id`.
**Kryterium gotowości:** komplet dokumentów (ToS, DPA, polityka retencji) gotowy do podpisania z pierwszym płacącym klientem spoza Conrad Comfort.
**Dział mózgu:** LEG (mozg-leg) przygotowuje dokumenty, konsultacja zewnętrzna prawnika rekomendowana dla finalnej wersji DPA. Zależność: informowane przez 3.10 (decyzja o jednej bazie multi-tenant) i 0.3 (zakres PII).

### 5.4 Pilot: hotel #2 na wersji neutralnej
**Jak ma działać:** wdrożenie drugiego, niezależnego tenanta (inny hotel, może testowy/demo) na tej samej infrastrukturze co Conrad Comfort — jedyny sposób, by udowodnić że fabryka wersji (2.7) faktycznie działa i nic nie jest zahardkodowane. Wymaga ukończonych: 2.1 (tenants), 2.5 (de-brand), 2.7 (fabryka), 2.19 (ustawienia w DB), najlepiej 4.13 (kreator onboardingu) zamiast ręcznego setupu.
**Kryterium gotowości:** hotel #2 działa z własnym brandingiem, własną konfiguracją pokoi i wybranym zestawem modułów (tier), bez jakiejkolwiek zmiany w kodzie aplikacji — tylko wpis w bazie.
**Dział mózgu:** DEV (mozg-dev) prowadzi wdrożenie techniczne → SAL (mozg-sal) pozyskuje/koordynuje hotel pilotażowy → QA (mozg-qa) pełna weryfikacja przed uznaniem za sukces. Zależność: najpóźniejsza pozycja całego planu — wymaga większości Etapu 2 i część Etapu 4.
