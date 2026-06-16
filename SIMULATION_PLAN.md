# Plan symulacji i analizy — Panel Recepcji

Cel: systematycznie wykrywać błędy **w przepływach i stanie** (nie tylko w czystych
funkcjach), bo to tam ukrył się błąd przekazywania zadań, którego nie złapały
3 boty (Claude + Gemini + Codex).

---

## 1. Post-mortem: dlaczego błąd umknął

Błąd: domyślny cel przekazania zadania = sztywno `"nocna"` → zadania nie docierały
do właściwej następnej zmiany.

Dlaczego 3 boty go nie znalazły:

| Luka | Opis | Wniosek |
|---|---|---|
| **Zakres = diff** | Testowaliśmy tylko zmienione funkcje (logika zmian), a carry-over był „obok". | Symulacja musi pokrywać **całą domenę**, nie tylko diff. |
| **Asercje vs kod, nie vs oczekiwanie** | Sprawdzaliśmy „czy kod robi to, co robi". Zły domyślny `"nocna"` był spójny → wyglądał OK. | Asercje muszą kodować **oczekiwanie użytkownika**, nie obecne zachowanie. |
| **Brak wielu aktorów** | Testy jednofunkcyjne, bez modelu „zmiana A → zmiana B". | Modelować **podróże wieloaktorowe** (nadawca/odbiorca/czas). |
| **Brak stanu początkowego/domyślnych** | Nie testowaliśmy wartości domyślnych (`useState("nocna")`). | Defaults i initial state to osobna kategoria testów. |
| **Recenzja czytała diff** | Gemini/Codex dostały diff, nie pełen kontekst przepływu. | Analiza statyczna musi iść **wzdłuż przepływu danych**, nie po liniach diffa. |

---

## 2. Zasady (czego szukamy)

1. **Expected-behavior first** — każdy test zaczyna od „co powinien zobaczyć
   użytkownik", potem sprawdza kod.
2. **Wieloaktorowość** — modeluj ≥2 pracowników + kierownika + przejścia zmian.
3. **Wymiar czasu i daty** — przełom doby, format `fmtA` (`DD.MM.YYYY, HH:mm`),
   `targetDate` vs `currentSessionDate`, wygasanie (`expires_at`).
4. **Cykl życia stanu** — initial → akcja → zapis → reload → re-login → reset.
   Co przeżywa re-login? Co powinno?
5. **Spójność między systemami** — 4 kanały powiadomień muszą zgodnie traktować
   „broadcast" (brak `targetShift`) i targetowanie po zmianie.
6. **Kształt danych i kompatybilność** — stare vs nowe formaty (`{start,end,shift}`
   vs string vs klucz), round-trip przez XLSX/PDF/JSON.
7. **Inwarianty** — własności, które muszą zawsze zachodzić (niżej).

---

## 3. Inwentaryzacja domen + macierz ryzyka

Stan: 40+ kluczy w `STORAGE_KEYS`. Domeny wg ryzyka (R=ryzyko, U=użycie):

| # | Domena | Kluczowe pliki / stan | R×U | Priorytet |
|---|---|---|---|---|
| D1 | Przekazywanie zadań (carry-over) | `carry`, `carryOverTarget` | wys×wys | **P0** |
| D2 | Powiadomienia (4 kanały) | `managerAlerts`,`standingReminders`,`globalNotifications`,`datedReminders` | wys×wys | **P0** |
| D3 | Rozliczenie zmiany + raport dobowy | `reportsFull`,`reports`,`employeeLog` | wys×śr | **P0** |
| D4 | Kasa / sejf | `cash.mjs` | wys×wys | **P1** |
| D5 | Logowanie / wybór zmiany / popup | `schedule`,`employeeLog` | śr×wys | **P1** |
| D6 | Grafik (godziny + typ zmiany) | `schedule` | śr×śr | **P1** |
| D7 | Ewidencja czasu pracy | `employeeLog` (parsing dat) | śr×śr | **P1** |
| D8 | Korekty płatności | `paymentCorrections` | śr×śr | P2 |
| D9 | Wiadomości pracownik↔kierownik | `messages` | śr×śr | P2 |
| D10 | Vouchery / Opinie / Parking / Stali | `vouchers`,`reviews`,`parking`,`staliGoscie` | nis×śr | P2 |
| D11 | Housekeeping | `hkData`,`adhocTasks` | śr×nis | P3 |
| D12 | Usterki | `faults` | nis×śr | P3 |

---

## 4. Katalog scenariuszy (P0/P1)

### D1 — Carry-over
- [x] Domyślny cel = następna zmiana po obecnej (nie „nocna").
- [x] Zadanie przekazane dociera do zmiany-celu, nie do innych.
- [ ] Zadanie odhaczone znika; nieodhaczone przeżywa do wykonania.
- [ ] **RYZYKO**: brak wymiaru daty → zadania kumulują się bez końca.
- [ ] Re-login odbiorcy w tej samej sesji odświeża listę.

### D2 — Powiadomienia
- [x] Datowane „Wszystkie zmiany" (`targetShift=null`) widzi każda zmiana.
- [x] Datowane targetowane widzi tylko zmiana-cel; zła data = niewidoczne.
- [ ] **Inwariant broadcast**: brak `targetShift` ⇒ widzą wszyscy (4 kanały).
- [ ] **RYZYKO**: odrzucenie (`dismiss`) przeżywa re-login (dziś NIE — reset).
- [ ] **RYZYKO**: nowy `managerAlert` po ACK nie wyskakuje ponownie w oknie startu.
- [ ] Wygasłe alerty (`expires_at`) zniknięte; wygaśnięcie respektowane.

### D3 — Raport dobowy
- [ ] Parsing daty z `fmtA` round-trip (`DD.MM.YYYY, HH:mm` → `YYYY-MM-DD`).
- [ ] Nocna 22-7: zapis o 07:00 liczony do dnia poprzedniego.
- [ ] Kolejność i dedup zmian; brak zgubienia zmiany.
- [ ] `kwTotal` przenoszony między zmianami bez dryfu.

### D4 — Kasa
- [x] `calculateShiftCash` / `calculateSafeDeposit` (istniejące testy + brzegowe).
- [ ] Zaokrąglenia groszy; wartości ujemne; przecinek vs kropka.

### D5/D6 — Login + grafik
- [x] Popup ≤30 min przed startem; godziny z grafiku; „ł" w nazwiskach.
- [ ] Override zmiany przy logowaniu nie psuje etykiet.

### D7 — Ewidencja
- [ ] Filtr miesiąca z `loginAt` (parsing `DD.MM.YYYY`).
- [ ] Brak `logoutAt` (porzucona zmiana) — nie wywala raportu.

---

## 5. Warstwy wykonania

- **L1 — Pure logic** (`shift-logic-sim.mjs`): import realnych funkcji z `src/lib`.
- **L2 — Stateful model** (`full-sim.mjs`): mock `localStorage` + reduktory
  odwzorowujące handlery z `App.jsx`; podróże wieloaktorowe; asercje = oczekiwanie.
- **L3 — Inwarianty**: własności sprawdzane na losowych/granicznych danych.
- **L4 — Analiza statyczna wzdłuż przepływu**: ręczny przegląd cyklu życia stanu
  (initial→reset), nie po liniach diffa.

### Inwarianty (L3)
- INV-1: kanał powiadomień bez `targetShift` ⇒ widoczny dla każdej zmiany.
- INV-2: akcja „dismiss/zamknij" ⇒ element nie wraca w tej samej dobie.
- INV-3: zadanie przekazane do zmiany X ⇒ widoczne wyłącznie dla X (do wykonania).
- INV-4: każda wartość zmiany w stanie należy do `SHIFT_OPTIONS`.
- INV-5: round-trip daty `fmtA → parse → YYYY-MM-DD` jest stabilny.

---

## 6. Uruchomienie

```
node --import ./scripts/_ext-register.mjs scripts/shift-logic-sim.mjs   # L1
node --import ./scripts/_ext-register.mjs scripts/full-sim.mjs           # L2/L3
node scripts/cash-logic-tests.mjs                                        # D4
```

WARN = rozbieżność oczekiwanie↔kod do decyzji; FAIL = błąd logiczny.
