# Zamówienia gastro (kuchnia/bar → kierownik gastronomii)

**Data:** 2026-07-28
**Status:** zaakceptowany przez usera, gotowy do planu implementacji

## Kontekst

Część 1 z 3 zaplanowanych funkcji dla restauracji (patrz pamięć
`project_restaurant_tablet2_orders_plan`). Pozostałe dwie (drugi tablet
"kuchnia" z widokiem dni/grup/liczby śniadań bez numerów pokoi; ewentualny
osobny tablet bar) są świadomie ODŁOŻONE na kolejne sesje — user zdecydował
zacząć od najmniejszego kroku: guzik "Zamówienie" w istniejącym
`posilki.html` + widok kierownika gastronomii na telefonie (rola `mgr_gastro`
w `panel.html` już istnieje, z placeholderem "Stany / dostawy (wkrótce)").

Bar nie ma własnego tabletu — pracownicy baru korzystają z tego samego
`posilki.html` co kuchnia/obsługa posiłków.

Zamówienie pracownika = pozycja na wspólnej liście zakupów (nie osobny byt).
Pracownik dopisuje pozycję+ilość; kierownik gastronomii widzi tę samą listę
na telefonie i odznacza jako kupione, gdy jest w sklepie.

## Model danych

Nowa tabela `gastro_shopping_list`, bez RPC/blokad wiersza (to lista, nie
stan magazynowy z ryzykiem wyścigu jak Sklepik):

```sql
create table public.gastro_shopping_list (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default '00000000-0000-0000-0000-000000000001',
  name       text not null,
  qty        numeric(10,2) not null default 1,
  unit       text,                      -- "szt"/"kg"/"l"/"opak." — wolny tekst, opcjonalne
  category   text,                      -- wypełniane przez LLM z ustalonego katalogu
  status     text not null default 'to_buy',  -- to_buy | bought
  added_by   text,
  bought_by  text,
  bought_at  timestamptz,
  created_at timestamptz not null default now()
);
```

RLS: `for all to anon, authenticated using (true) with check (true)` —
zgodnie z resztą tabel core w tej appce (nie ma osobnej roli DB, gating
tylko przez UI jak w Sklepiku).

Nic nie jest trwale usuwane — pozycje kupione (`status='bought'`) zostają
jako historia, po prostu znikają z aktywnego widoku.

## UI — posilki.html (tablet kuchnia/posiłki, obsługuje też bar)

- Nowy przycisk w headerze obok `themeBtn`: ikona 🛒, otwiera pełnoekranowy
  overlay (analogicznie do istniejącego `daydrop` kalendarza, ale modal).
- **Formularz dodania:** nazwa (tekst) + ilość (liczba) + jednostka (select
  szt/kg/l/opak. + wolny tekst). Po zapisie: `insert` do
  `gastro_shopping_list` (`added_by=null`, zgodnie z wcześniejszą decyzją
  usunięcia pola "imię" z posiłków), następnie wywołanie LLM do
  kategoryzacji całej aktywnej listy.
- **Lista aktywna** (`status='to_buy'`), pogrupowana wg `category` (nagłówki
  sekcji, pozycje bez kategorii pod "Inne"/"Bez kategorii" do czasu aż LLM
  odpowie). Tylko odczyt — bez usuwania/odznaczania z tabletu (to robi
  kierownik gastronomii na telefonie).
- Realtime: `sb.channel` subskrybujący `postgres_changes` na
  `gastro_shopping_list` filtrowane po `tenant_id`, wzorem istniejącego
  kanału `meal_checkins` w tym samym pliku.

## UI — panel.html (rola mgr_gastro, telefon kierownika gastronomii)

- Nowa zakładka **"Zakupy"** (ikona 🛒) w liście zakładek `mgr_gastro`
  (obecnie `poczta/grafik/zadania/tablica/akcje` — zamieniamy placeholder
  "Stany / dostawy (wkrótce)" na tę realną funkcję).
- Lista aktywnych pozycji pogrupowana wg kategorii, każda z checkboxem
  "Kupione". Kliknięcie → `update` ustawiający
  `status='bought', bought_by=CURRENT.name, bought_at=now()` — pozycja
  znika z aktywnego widoku (zostaje jako historia w tabeli).
- Bez formularza dodawania po stronie managera — dodają wyłącznie
  pracownicy z tabletu (nie było proszone, YAGNI).
- Wzorzec implementacji: `loadTablica()` w `panel.html` (fetch przez `sb`,
  budowa HTML stringa, `body(...)`) — nowa funkcja `loadZakupy()` analogicznie.

## LLM — automatyczna kategoryzacja

Nowe zadanie `"gastro_shop"` w `supabase/functions/llm/index.ts`, wzorem
`"roletabs"` (LLM wybiera WYŁĄCZNIE z ustalonego katalogu przekazanego w
promptcie, nigdy nie wymyśla własnych wartości — filtrowanie po stronie
Edge Function jak `roletabs`):

- Katalog kategorii (stały, po polsku): Nabiał, Pieczywo, Warzywa i owoce,
  Mięso i ryby, Napoje, Alkohol/bar, Mrożonki, Sypkie/przyprawy, Chemia i
  higiena, Jednorazówki, Inne.
- Wejście: pełna aktywna lista pozycji (`name`, opcjonalnie `qty`/`unit` dla
  kontekstu). Wyjście: `{"items":[{"name":string,"category":string}]}`
  (`response_format: json_object`, `temperature:0`, jak `triage`/`roletabs`).
- Wywoływane z klienta (posilki.html) automatycznie po każdym dodaniu nowej
  pozycji do listy (zgodnie z decyzją usera — nie na przycisk). Po
  odpowiedzi: `update` kategorii per wiersz w `gastro_shopping_list`.
  Realtime odświeża widok kierownika gastronomii bez akcji z jego strony.
- Model: `llama-3.3-70b-versatile` (Groq, darmowy tier) — spójnie z resztą
  zadań tekstowych w tym pliku, brak nowego dostawcy LLM.

## Błędy i przypadki brzegowe

- Błąd zapisu `insert` (offline/timeout) — istniejący wzorzec `msg`/`err` z
  `posilki.html`/`panel.html` (czerwony komunikat, przycisk odblokowany do
  ponowienia).
- Błąd/timeout LLM (Groq rate-limit 429, upstream error) — pozycja zostaje
  zapisana bez kategorii (`category=null`), trafia do sekcji "Bez
  kategorii" na obu widokach; nie blokuje dodania pozycji do listy (LLM to
  warstwa pomocnicza, nie krytyczna ścieżka zapisu — zgodnie z zasadą z
  `llm/index.ts`: "LLM nigdy nie jest źródłem liczb/krytycznych danych").
- Duplikat nazwy (np. dwóch pracowników dodaje "mleko" niezależnie) — bez
  deduplikacji w tej wersji (YAGNI, user tego nie zgłosił); kierownik widzi
  dwie osobne pozycje i kupuje odpowiednio.

## Testowanie

- Manualne (Playwright, jak przy poprzednich funkcjach `posilki.html`):
  dodanie pozycji z tabletu → weryfikacja pojawienia się z poprawną
  kategorią po stronie panelu managera (realtime), odznaczenie jako
  kupione → zniknięcie z aktywnej listy na obu widokach.
- Weryfikacja że LLM nie zwraca kategorii spoza ustalonego katalogu
  (filtrowanie po stronie Edge Function, jak przy `roletabs`).

## Poza zakresem tej sesji (świadomie odłożone)

- Nowy tablet "kuchnia" (widok dni/grup/liczby śniadań bez numerów pokoi).
- Osobny tablet/URL dla baru.
- Formularz dodawania po stronie managera.
- Deduplikacja/scalanie podobnych pozycji.
