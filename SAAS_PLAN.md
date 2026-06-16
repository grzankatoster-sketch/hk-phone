# Plan komercjalizacji — Panel Recepcji jako SaaS (licencja miesięczna)

> Cel: sprzedawać aplikację innym obiektom jako licencję miesięczną.
> Stan na: 2026-06-13. Dokument żywy — aktualizować przy każdej decyzji.

---

## 0. Diagnoza stanu obecnego (fakty z kodu)

1. **Aplikacja desktopowa Electron**, instalowana per-maszyna (NSIS, `electron-updater`, jedno repo releases). Wersja 1.6.3.
2. **Konfiguracja hotelu = zmienne `.env` w czasie buildu** (`src/tenants/config.js`). Nowy hotel = ręczna edycja `.env` + osobny build. To "white-label przez rebuild", nie multi-tenancy.
3. **Dane core w `localStorage`** (`src/lib/storage.js`, ~40 kluczy). Dane uwięzione na jednej maszynie, bez backupu i synchronizacji. 3 stanowiska = 3 rozjechane bazy.
4. **Supabase istnieje**, ale obsługuje tylko wybrane funkcje (sync HK, push, opinie) — nie jest centralną bazą tenanta.

Fundament (Supabase, tenant config, electron-updater) jest. Brakuje warstwy multi-tenant, licencjonowania i fabryki.

---

## ✅ DECYZJA: Web SaaS (rozstrzygnięte 2026-06-13)

Model dystrybucji = **Web SaaS**. Jeden deploy, nowy hotel = wpis do bazy + włączone moduły. Zero instalacji i buildu per hotel. Fabryka działa jako **provisioning runtime**.

Konsekwencje dla planu:
- Tier 0.1 (licencja/kill-switch) realizowany przez status tenanta w bazie, nie klucz w installerze.
- Fabryka (Tier 2.0) = wyłącznie tryb runtime; gałąź "generuj installer" odpada.
- Electron pozostaje opcjonalnym kioskiem wskazującym na ten sam backend (nie priorytet).

---

## TIER 0 — Bez tego nie sprzedasz ani jednej licencji

| # | Zadanie | Po co |
|---|---------|-------|
| 0.1 | **Mechanizm licencji + kill-switch** — token sprawdzany przy starcie, karencja offline (np. 7 dni), blokada po wygaśnięciu | Brak czegokolwiek, co wygasa gdy klient przestaje płacić |
| 0.2 | **Płatności cykliczne** — Stripe / Przelewy24 / Paddle (Paddle = merchant of record, ogarnia VAT UE) | Pobieranie abonamentu |
| 0.3 | **Rejestr tenantów** — tabela `tenants`: id, nazwa, status (trial/active/suspended), plan, data wygaśnięcia | Serce całego modelu |

---

## TIER 1 — Fundament multi-tenant (największy nakład)

| # | Zadanie | Uwaga |
|---|---------|-------|
| 1.1 | **Migracja danych z localStorage → Supabase**, kolumna `tenant_id` wszędzie | Największy item. Bez tego nie ma chmury, backupu, wielu stanowisk |
| 1.2 | **Row Level Security per tenant** | Izolacja na poziomie bazy, nie aplikacji |
| 1.3 | **Konta i role (Supabase Auth) + RBAC serwerowy** | Dziś hasło admina to hash w localStorage per-maszyna |
| 1.4 | **Konfiguracja hotelu edytowalna w aplikacji** (pokoje, piętra, pracownicy → DB, nie `.env`) | Warunek konieczny dla Fabryki |
| 1.5 | **Katalog modularny / entitlements** (patrz sekcja niżej) | Warunek konieczny dla "co hotel może dokupić" |

---

## ★ TIER 1.5 — Katalog modularny (entitlements)

Każdy moduł = włączany/wyłączany per tenant, powiązany z planem lub kupowany à la carte.
Mechanika: tabela `tenant_features` (lub JSON entitlements na tenancie) + bramka:
- **UI:** `useEntitlement('hk')` → ukrywa moduł, jeśli nieopłacony
- **Serwer:** RLS / Edge Function sprawdza feature (żeby nie dało się obejść frontu)

### Pakiet CORE (w każdym planie, nieusuwalny)
- Przekazanie zmiany / Zadania (`ZadaniaPanel`)
- Kasa + Korekty (`KasaAdminPanel`, `KorektyPanel`)
- Historia (`HistoriaPanel`)
- Pracownicy (`PracownicyPanel`)
- Ustawienia (`UstawieniaPanel`)
- Wiadomości wewnętrzne (`WiadomosciPanel`, `AdminMessagesPanel`)

### Moduły DOKUPOWALNE (add-on)
- **Housekeeping** — `HKPanel`, `HKLivePanel` + automatyzacja (flagowy add-on)
- **Usterki** — `FaultsPanel`
- **Opinie / Reviews** — `ReviewsPanel`
- **Statystyki / BI** — `StatystykiPanel`
- **Grafik** — `ScheduleAdminPanel`
- **Agent AI / LLM** — briefing, triage usterek, RAG Wiki
- **Push / PWA telefony HK**
- **Parking** — `ParkingPanel`
- **Vouchery** — `VouchersPanel`
- **Stali goście** — `StaliGosciePanel`
- **Wiki / baza wiedzy** — `WikiAdminPanel`
- **Ewidencja** — `EwidencjaPanel`
- **Alerty / przypomnienia** — `AlertsAdminPanel`, `StandingRemindersPanel`
- **Integracja PMS** — `KWHotelPanel` + konektory pod inne systemy (patrz 2.2)

### Propozycja planów
| Plan | Zawiera |
|------|---------|
| **Start** | tylko CORE |
| **Pro** | CORE + HK + Usterki + Grafik |
| **Premium** | wszystko + AI |
| **Add-ony** | dowolny moduł dokupywany ponad plan |

---

## ★ TIER 2.0 — Fabryka tenantów ("maszyna")

Cel: **maszyna, która sama tworzy aplikację pod dany hotel** — bez ręcznej edycji kodu.

### Model szablon → instancje ("2 widoki")
- **Szablon bazowy** (template) — neutralny, zero "Conrad Comfort" w rdzeniu.
- **Instancje** — Conrad Comfort = instancja #1; drugi hotel demo = instancja #2.
- Cel praktyczny: postawienie 2 niezależnych instancji **udowadnia, że nic nie jest zahardkodowane** i że fabryka działa.

### Składniki maszyny
1. **Manifest tenanta** (JSON / wiersz w DB): nazwa, branding (logo, kolory, skrót), config (pokoje, piętra, pracownicy), `entitlements` (aktywne moduły), plan, status.
2. **Silnik provisioningu (runtime, web):** `INSERT` do `tenants` + `tenant_features` + seed configu. App czyta manifest w runtime i renderuje **tylko opłacone moduły**. Zero buildu, zero installera.
3. **Panel operatora (super-admin)** — Twój kokpit sprzedaży: tworzysz tenanta, włączasz/wyłączasz moduły, ustawiasz plan, zawieszasz za brak płatności.
4. **Bramka entitlements** (z Tier 1.5) — wspólna dla wszystkich instancji.

### Zależności
Fabryka ma sens **dopiero** gdy gotowe: 1.4 (config w DB) + 1.5 (entitlements) + 0.3 (rejestr tenantów). Inaczej "maszyna" nie miałaby czym sterować.

---

## TIER 2 — Onboarding i odklejenie od marki

| # | Zadanie |
|---|---------|
| 2.1 | **De-hardcode brandingu** — `appId`, `productName`, `copyright` w `package.json` są sztywne; do tego teksty UI |
| 2.2 | **Generalizacja integracji** — `parser.cjs`, KWHotel, IMAP są pisane pod konkretny format maili tego hotelu. Inny hotel = inny PMS. MVP: import CSV/ręczny; docelowo konektory pod popularne PMS |
| 2.3 | **Self-service onboarding** — rejestracja, trial 14 dni, kreator konfiguracji |
| 2.4 | **Realizacja decyzji desktop vs web** |

---

## TIER 3 — Legal / komercyjne (równolegle, nie blokuje kodu)

- **RODO** — sprzedając innym hotelom stajesz się **procesorem danych** (dane gości + płatności). Potrzebne: umowa powierzenia (DPA), retencja, prawo do usunięcia, szyfrowanie, regulamin/ToS.
- Cennik z poziomami (np. per liczba pokoi), faktury, kanał wsparcia, podstawowe SLA.

---

## Rekomendowana sekwencja

```
[✓] Decyzja: Web SaaS
   → Tier 0   (licencja przez status tenanta + płatność + rejestr tenantów)
   → Tier 1.1/1.2 (dane → Supabase + RLS)        ← rdzeń, najwięcej pracy
   → Tier 1.3/1.4 (auth + config w aplikacji)
   → Tier 1.5 (entitlements / katalog modularny)
   → Tier 2.0 (Fabryka tenantów runtime + model 2 instancji)
   → Tier 2   (onboarding, de-brand, integracje)
   → Tier 3   równolegle
```

**Pierwszy krok wykonawczy:** Tier 0.3 + 1.1 razem — schemat `tenants` / `tenant_features` w Supabase i mapa migracji ~40 kluczy localStorage na tabele z `tenant_id`. To odblokowuje całą resztę.
