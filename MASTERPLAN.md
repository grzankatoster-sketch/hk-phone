# MASTERPLAN — Panel Recepcji → GuestSage SaaS
Pełna, nierozbundlowana wersja (poprzednia wersja z 19.07.2026 błędnie
skleiła kilkanaście pozycji w zbiorcze linie — m.in. schowała naprawę hasha
hasła admina w „drobiazgach"; poprawione 20.07.2026). 62 pozycje = audyt kodu
(33) + analiza relacji (9) + analiza SaaS (20). Szczegóły plik:linia i pełne
uzasadnienia: ROADMAP.md. Komenda walidacji po KAŻDEJ zmianie:
`npm test && npm run test:cash && npm run test:logic && npm run lint`

🔒 Strefy zamrożone (zmiany tylko z kompletem testów i zgodą właściciela):
logika kasy/sejfu (App.jsx:1060–1830), parser KWHotel, migracje bazy
(żywa baza — tylko dopisywanie), skrypty live (deploy/upload/release/hk:auto/broker).

✅ ROZWIĄZANE (20.07.2026): fałszywy alarm o równoległej pracy — to była
niescommitowana, porzucona od 27.06.2026 robota (SLA dla usterek: terminy wg
priorytetu, eskalacja, progi per hotel — dokładnie wzorzec z 2.19). Sprawdzona
(diffy, testy 45/45+8/8 zielone) i **SCOMMITOWANA** (`43f26a1`). Migracje
0043–0045 NIE są jeszcze wgrane na żywą bazę — osobna decyzja (patrz niżej).

✅ ROZWIĄZANE (20.07.2026): `main` okazał się niepowiązaną historią (2 pliki:
index.html + wyjazdy.html — wcześniejszy, uboższy szkic tej samej strony,
205 linii vs 459 w realnej aplikacji), nie zaniedbaną gałęzią produkcyjną.
Cała prawdziwa aplikacja żyła w linii `redesign/01…37-*`. Wykonano:
`main` przestawiony na treść `redesign/17-wiadomosci-v2` (real app + uratowane
SLA), 33 martwe gałęzie redesign usunięte, testy zielone (45/45) po zmianie.
Wszystko lokalnie — NIE wypchnięte na GitHub (osobna decyzja usera).
Gałąź `master` (odrębna od main) zostawiona nietknięta — do wyjaśnienia.

---

## ETAP 0 — BEZPIECZEŃSTWO (blokuje release'y i sprzedaż) — 6 pozycji
- [ ] 0.1 [ICE 100] Unieważnić token ngrok na koncie + usunąć electron/ngrok.cjs
- [ ] 0.2 [ICE 100] Hasło admina poza bundle (hash bootstrapowy w Supabase, nie VITE_) + rotacja obecnego
- [ ] 0.3 [ICE 100] Purge PII z seedów (Parking, StaliGoscie, reviewsSeed) → import do bazy per tenant
- [ ] 0.4 [ICE 100] Zielony security-lint (3 naruszenia) + rozszerzone reguły + bramka CI
- [ ] 0.5 [ICE 60] Domknięcie RLS: koniec `anon FOR ALL` na hk_* i panel_mirror
- [ ] 0.6 [ICE 32] Token w QR zamiast imienia w URL dla telefonów LAN (x-secret realnie sprawdzany)

## ETAP 1 — PORZĄDKI (zero ryzyka) — 14 pozycji
- [ ] 1.1 [ICE 75] Higiena repo: usunąć open-design/ (156 MB), scripts/broker/, release/ (3,9 GB) do .gitignore, tmp-*, test_results.txt, .mcp.json.backup*
- [ ] 1.2 [ICE 75] Naprawa zdublowanych numerów migracji (0013/0030/0036 ×2) + kontrola unikalności w CI
- [ ] 1.3 [ICE 60] Wszystkie klucze localStorage przez STORAGE_KEYS (~20 luzem) + reguła lint
- [ ] 1.4 [ICE 60] Ścieżki `C:\zmiany i raporty` → ustawienie w UI (userData)
- [ ] 1.5 [ICE 60] syncQueue: wpiąć naprawdę (retry po online) ALBO usunąć — dziś martwy kod
- [ ] 1.6 [ICE 40] Jeden normalizator diakrytyków (names.js) zamiast 8 kopii
- [ ] 1.7 [ICE 50] Helper `pushHandoverLog()` zamiast 5× `slice(0,300)` w App.jsx
- [ ] 1.8 [ICE 32] Wspólny helper nagłówka/stopki dla 5 generatorów PDF
- [ ] 1.9 🔧 SEC adminAuth: SHA-256 bez soli → PBKDF2/argon2 lub auth serwerowy (NIE kosmetyka — priorytet blisko Etapu 0; docelowo zastąpione całkiem przez 2.17, to jest łatka na już)
- [ ] 1.10 Stała kasowa 500 zł jako nazwana stała → docelowo app_settings per tenant
- [ ] 1.11 Usunięcie martwego klucza `openaiKey` (storage.js:30)
- [ ] 1.12 Usunięcie domyślnego TENANT_ID (constants.js:7) — hardcode tenanta
- [ ] 1.13 Poprawka komentarza llm.js:1 („proxy Claude" → faktycznie Groq/Llama)
- [ ] 1.14 Aktualizacja przestarzałego NEXT_SESSION.md (opisuje nieistniejący już martwy kod A1–A4)
- [ ] 1.15 Ekran logowania panel.html: nadmierne centrowanie (nazwa hotelu+nagłówek+podtytuł+stopka wszystko wyśrodkowane) → podtytuł i stopkę do lewej
- [ ] 1.16 [widoczność: wysoka] 4 kafelki dashboardu panel.html (💰🛠️🚪👥) → ikony SVG zamiast emoji — to pierwszy ekran, jaki widzi kierownik
- [ ] 1.17 Maskotka 🤖 zduplikowana 6× w AgentWidget.jsx i AgentBot.jsx → jedna wspólna ikona SVG (duplikacja + estetyka naraz)
- [ ] 1.18 Reszta dekoracyjnych emoji w panel.html (~90 wystąpień 24 piktogramów: 🔔🎉📌📅📖⚙🧾📝📋) → SVG przy okazji edycji danego widoku, niski priorytet samodzielny

## ETAP 2 — FUNDAMENT SAAS — 12 pozycji
- [ ] 2.1 [ICE 40] Tabele `tenants` + `tenant_features` w DB (R6)
- [ ] 2.2 Egzekwowanie server-side zamiast tylko client-side (VITE_MODULES dziś omijalne)
- [ ] 2.3 Polityka deny-by-default zamiast dziś permisywnej (nieznany moduł = włączony)
- [ ] 2.4 Rozszerzenie MODULE_REGISTRY o funkcje „zawsze dostępne" (kasa, grafik, statystyki) — inaczej nie ma czym różnicować tierów
- [ ] 2.5 [ICE 75] De-hardcode brandu: „Conrad Comfort" (~14 miejsc) → tenantConfig (R3)
- [ ] 2.6 Rozbicie style.css (8354 linii) na warstwy core/theme
- [ ] 2.7 Fabryka wersji: jeden neutralny build „GuestSage Panel" + manifest tenanta z DB w runtime (odrzucone: build per hotel z .env)
- [ ] 2.8 URL-e GitHub Pages (4 miejsca) → konfiguracja zamiast hardcode
- [ ] 2.9 [ICE 15] Migracja danych core z localStorage do Supabase z tenant_id (R7)
- [ ] 2.10 [ICE 48] Jeden wzorzec konfliktów (merge+rev jak hk_state_merge) dla wszystkich danych dwustronnych (R18)
- [ ] 2.11 [ICE 80] Świeżość danych u kierownika: heartbeat + banner „recepcja offline od X min" (R17)
- [ ] 2.12 [ICE 48] Wydzielenie domeny kasy z App.jsx do lib/cash.mjs z testami (R8)
- [ ] 2.13 Jednolity model ról w bazie: właściciel / kierownik / recepcja / pokojówka (dziś tylko panel kierownika ma konta+role; desktop i telefony nie mają tożsamości)
- [ ] 2.14 Token urządzenia dla desktopu nadawany przy aktywacji licencji (zastępuje goły klucz publiczny bez tożsamości) — RLS sprawdza tenant_id + rolę zamiast wpuszczać wszystkich
- [ ] 2.15 Migracja RLS z „każdy może wszystko" na reguły wg roli i przynależności do hotelu, spójnie dla wszystkich tabel (uzupełnia 0.5/R16 pełnym modelem docelowym)
- [ ] 2.16 [ICE 48] Osobna aplikacja „GuestSage Kierownik": cienki natywny shell wrapujący istniejący panel kierownika, własny instalator, ta sama fabryka wersji co recepcja
- [ ] 2.17 [ICE 30] Wspólne logowanie kontem (Supabase Auth) zamiast lokalnego hasła — to samo konto działa w aplikacji kierownika i jako podniesienie uprawnień na recepcji przy zastępstwie
- [ ] 2.18 [ICE 36] Wspólne źródło ról dla obu aplikacji (jedna funkcja sprawdzająca rolę zamiast dwóch osobnych mechanizmów)
- [ ] 2.19 [ICE 48] Mechanizm ustawień per hotel: rejestr opcji + jeden uniwersalny formularz — nowa opcja konfiguracyjna to wpis w rejestrze, nie nowy kod

## ETAP 3 — INFRASTRUKTURA MULTI-TENANT — 10 pozycji
- [ ] 3.1 [ICE 32] Automat IMAP z laptopa recepcji → Supabase cron+Edge (likwidacja SPOF, R19)
- [ ] 3.2 Link kierownika per tenant: app.guestsage.pl/t/{hotel}/panel (jeden deploy)
- [ ] 3.3 Maile raportowe per tenant: centralny inbound raporty+{hotel}@guestsage.pl + routing
- [ ] 3.4 [ICE 24] Interfejs PmsConnector — KWHotel jako pierwsza wtyczka + import CSV jako MVP (R14)
- [ ] 3.5 [ICE 36] hkserver: strony LAN jako pliki statyczne + SSE zamiast pollingu 1s/4s/5s (R9)
- [ ] 3.6 [ICE 36] Polling → zdarzenia w usterkach/czacie/agencie/HKLive (R11)
- [ ] 3.7 [ICE 18] panel.html (4588 linii) do pipeline'u Vite ze wspólnymi modułami (R15)
- [ ] 3.8 Konsolidacja dwóch systemów web-push (VAPID hkservera + Edge push-send) w jeden
- [ ] 3.9 hk_plan w Supabase jako jedyne źródło planów HK (dysk tylko jako cache)
- [ ] 3.10 Baza: pozostać przy jednym projekcie Supabase multi-tenant, region EU + DPA per hotel + retencja pg_cron

## ETAP 4 — NOWE FUNKCJE — teraz 25 pozycje
- [ ] 4.1 [ICE 48, START] Wpłaty/wypłaty do sejfu — rozszerzenie strefy zamrożonej, pełne testy (S5a)
- [ ] 4.2 [ICE 36, add-on/STANDARD] Sklepik recepcji — osobna linia utargu w raporcie (S5b)
- [ ] 4.3 [ICE 64, STANDARD] Dashboard przyjazdów/wyjazdów dnia (F1 — backend już gotowy)
- [ ] 4.4 [ICE 64, PREMIUM] Drafty odpowiedzi na opinie Booking przez AI (F2)
- [ ] 4.5 [ICE 60, PRO] Lost & found w desktopie (F3 — tabela już istnieje)
- [ ] 4.6 [ICE 48, START] Budziki / wake-up calls (F4)
- [ ] 4.7 [ICE 48, STANDARD] Rejestr kluczy i kart pokojowych (F5)
- [ ] 4.8 [ICE 48, STANDARD] Depozyty gości z podpisem (F6 — SignatureCanvas już jest)
- [ ] 4.9 [ICE 48, PREMIUM] Nocny raport e-mail do właściciela (F7)
- [ ] 4.10 [ICE 48, PREMIUM] Panel właściciela read-only (F8)
- [ ] 4.11 [ICE 48, PRO] Inspekcje jakości HK (F9 — tabela już istnieje)
- [ ] 4.12 [ICE 48, STANDARD] Upsell tracker late-checkout/early check-in (F10)
- [ ] 4.13 [ICE 40, platforma] Kreator onboardingu nowego hotelu (F11)
- [ ] 4.14 [ICE 36, STANDARD] Wielojęzyczność EN/UK (F12)
- [ ] 4.15 [ICE 36, PRO] Moduł śniadań (F13)
- [ ] 4.16 [ICE 8, odłożone] Integracja KSeF/faktury (F14 — czekać na >10 tenantów)
- [ ] 4.17 [ICE 80] Naprawa syncu opinii: przeniesienie do main procesu (dziś żyje tylko w komponencie UI, więc bez odwiedzenia zakładki nie odświeża się) + trwały zapis widzianych ID + realny komunikat błędu zamiast cichego powrotu do danych z kwietnia
- [ ] 4.18 [ICE 64, PREMIUM] Powiadomienie w aplikacji o nowej opinii (diff w main → natywne powiadomienie + toast, wzorzec już istnieje w kodzie)
- [ ] 4.19 [ICE 48, PREMIUM] Draft odpowiedzi AI dołączony od razu do powiadomienia (nowe zadanie w Edge — łączy się z F2/4.4)
- [ ] 4.20 [ICE 60, PREMIUM] Asystent cen BEZ konkurencji (bezpieczna wersja, zastępuje poprzedni pomysł opierania się na Bookingu): baza = własne aktualne stawki (cennik/KWHotel); silnik dolicza modyfikatory: dzień tygodnia z własnej historii obłożenia, własne obłożenie na już (dużo rezerwacji → drożej, mało blisko terminu → taniej); każda propozycja z rozpisanym uzasadnieniem, zero automatycznych zmian — kierownik zawsze zatwierdza
- [ ] 4.21 [ICE 40, PREMIUM] Modyfikator „coś się dzieje w mieście": wydarzenia przez darmowe API (Ticketmaster) + ręczne dodawanie lokalnych wydarzeń (małe miasta słabo pokryte przez API) → dopisany procent do ceny z uzasadnieniem
- [ ] 4.22 [ICE 20, PREMIUM] Modyfikator pogodowy (darmowe Open-Meteo, mała waga, głównie w sezonie) — dokładany po sprawdzeniu 4.20/4.21 w praktyce
- [ ] 4.23 ⚠️ [ICE 12, PREMIUM add-on, WYŁĄCZONY DOMYŚLNIE] Opcjonalne rozszerzenie: śledzenie cen konkurencji z Booking — RYZYKO PRAWNE (narusza regulamin), tylko za świadomą zgodą i limitem częstotliwości; rozważyć płatne API rate-shopperów zamiast własnego scrapingu zamiast tej pozycji
- [ ] 4.24 [ICE 36, add-on/STANDARD] Bot WhatsApp: wysyłka linku do grafiku (F15 — brainstorming 22.07.2026)
- [x] 4.25 [ICE 40, platforma] Onboarding pracownika: tura pierwszego logowania (F16 — brainstorming 22.07.2026) — KOD GOTOWY, migracja 0052 czeka na `supabase db push`

## ETAP 5 — KOMERCJA — 4 pozycje
- [ ] 5.1 Tiery cenowe: START 149 / STANDARD 299 / PRO 499 / PREMIUM 749 PLN/msc + add-ony 29–99
- [ ] 5.2 Płatności i licencje: Paddle/Stripe + klucze licencyjne + kill-switch
- [ ] 5.3 Prawne: umowa SaaS + DPA per hotel + polityka retencji (dział LEG)
- [ ] 5.4 Pilot: hotel #2 na wersji neutralnej — dowód, że fabryka wersji działa

---
**Suma: 82 pozycje** (20.07.2026: +3 autoryzacja, +6 opinie/ceny, +4 aplikacja
kierownika, +1 konfigurowalność, +4 audyt design/emoji, +1 rozbicie cen na
bezpieczną wersję bez konkurencji; 22.07.2026: +2 z brainstormingu — bot
WhatsApp do grafiku, onboarding pracownika). Pozycja 4.23 (jedyna z ryzykiem
prawnym) jest teraz opcjonalnym dodatkiem wyłączonym domyślnie, nie blokerem.
⚠️ Migracje bazy przy 0045 (audyt bazował na 0001–0037) — skoordynować
z równoległą pracą PRZED Etapem 0. Kolejność: Etap 0 zawsze pierwszy.
Etap 1 równolegle z Etapem 2. Etap 3 kończy się przed przyjęciem hotelu #2.
Etap 4 wchodzi po 2.1–2.4 (żeby funkcje od razu miały przypisany tier).
