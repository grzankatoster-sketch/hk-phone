# Obchód konserwacji + status pokoju przy usterce

Data: 2026-07-27
Status: zatwierdzone (design), przed planem implementacji

## Kontekst

Kontrole per-pokój dla HK już istnieją (`hk_check_plans`/`hk_check_items`, migracja 0059): menedżer tworzy plan z zadaniem i listą pokoi, zadanie jest przypięte do pokoju i widzi je ten, kto akurat sprząta dany pokój danego dnia.

Konserwacja (`konserwacja.html` + `panel.html` zakładka "Plan") ma tylko zadania przypisane do OSOBY (`maintenance_plans`→`panel_plan`, migracja 0041), bez pojęcia pokoju. Usterki (`faults`) nie pokazują żadnego kontekstu o stanie pokoju.

Cel: (A) analogiczna checklista per-pokój dla konserwacji, ale w formie jednorazowego obchodu całego obiektu; (B) widoczność na żywo, czy w pokoju są goście / czy to wyjazd jeszcze nieposprzątany / czy jest pusty i posprzątany — przy usterkach i w obchodzie.

## A) Obchód konserwacji

**Różnica względem Kontroli HK:** obchód nie jest cykliczny (brak okna dat, brak odświeżania dzień po dniu) i nie ma powodu niepowodzenia — to jednorazowa lista wszystkich pokoi obiektu, którą konserwator odhacza aż skończy. Lista pokoi jest ciągnięta automatycznie z rejestru pokoi, nie wpisywana ręcznie.

**Model danych (migracja `0063_maintenance_rounds.sql`):**

1. Zasiew tabeli `public.rooms` (istnieje od migracji 0002, dotąd pusta — potwierdzone zapytaniem do żywej bazy) dla tenant Conrad Comfort (`00000000-0000-0000-0000-000000000001`), 66 pokoi, z `src/tenants/defaults.js` (`DEFAULTS.hk.floor1/2/3`), z `is_apartment` ustawionym dla pokoi z listy `apts`. Insert idempotentny (`on conflict (tenant_id, room_no) do nothing`).

2. `maintenance_rounds`: `id uuid pk`, `tenant_id uuid`, `name text`, `task text`, `status text default 'active'` (`active`|`done`), `created_at timestamptz`.

3. `maintenance_round_items`: `id uuid pk`, `tenant_id uuid`, `round_id uuid` (FK → maintenance_rounds), `room text`, `status text default 'pending'` (`pending`|`done`), `done_by text`, `done_at timestamptz`. `unique(round_id, room)`.

4. RLS: wzorem `maintenance_plans` — `for all to anon using (true) with check (true)` i to samo dla `authenticated`. Obie tabele dopisane do publikacji `supabase_realtime` (idempotentnie, `if not exists` na `pg_publication_tables`, wzorem migracji 0041).

5. Migracja dopisana do `panel_install.sql` (deploy przez wklejenie na żywą bazę — brak CLI, por. [[project_wykonanie_progress]]).

**Flow menedżera (`panel.html`):** nowa zakładka "Obchód" w sekcji konserwacji (obok "Plan"), widoczna dla `mgr_konserwacja`/`admin`. Tworzenie: nazwa + treść zadania → insert do `maintenance_rounds`, następnie select wszystkich `room_no` z `rooms` dla tenanta i bulk insert do `maintenance_round_items` (status `pending`). Lista rund pokazuje postęp (`x/66`). Widok szczegółu: read-only, pokoje pogrupowane po piętrze (z `rooms.floor`), zielone tło dla `done`, z podpisem kto/kiedy. Przycisk ręcznego zamknięcia rundy jak w Kontrolach HK.

**Flow konserwatora (`konserwacja.html`):** nowa zakładka "Obchód". Lista rund o statusie `active` (+ opcja pokazania zakończonych). Wejście w rundę: pokoje pogrupowane po piętrze, każdy z jednym przyciskiem `✓` (bez pola powodu — potwierdzone z userem, prostszy model niż Kontrole HK). Kliknięcie → `update maintenance_round_items set status='done', done_by=WORKER, done_at=now()`. Po zapisie ostatniego brakującego pokoju runda automatycznie dostaje `status='done'` (sprawdzenie client-side po każdym odhaczeniu: jeśli wszystkie item.status==='done', update rundy). Realtime subskrypcja na `maintenance_round_items` dla żywego wglądu (drugi konserwator widzi odhaczenia pierwszego).

**Poza zakresem:** przydział konkretnego konserwatora do rundy (obaj widzą i mogą odhaczać dowolny pokój — jak dziś `assigned_to` w `maintenance_plans`, tu pomijamy, bo to jednorazowy wspólny obchód, nie codzienna praca przypisana do osoby).

## B) Status pokoju (wyjazd / są goście / puste-posprzątane)

Bez nowych tabel — liczone na żywo z istniejących źródeł, zweryfikowanych bezpośrednio w żywej bazie (nie z migracji — schemat faktyczny odbiega od `0001_init.sql`, por. [[project_db_schema_drift]]):

- `hk_plan` (najnowszy wiersz na dziś, kolumna `pm_room_types`, jsonb `{ "123": "W" }`) — occupancy code dla zmiany popołudniowej. `PG`/`PGZ` = gość zostaje (pobyt). Brak wpisu lub `W`/`WP` = nie ma tam dziś zaplanowanego pobytu popołudniowego.
- `hk_rooms` (wiersze na dziś, po `room`, kolumny faktyczne: `date,room,worker,status,vacated,started_at,done_at,report` — bez `tenant_id`, jednotenantowe w praktyce) — `status==='czyste'` = posprzątane; inny status (`W`/`czyszczenie`/`pominięte`) przy braku wpisu w `pm_room_types` jako pobyt = wyjazd jeszcze nieposprzątany.

Logika (czysta funkcja, liczona w kliencie z już pobranych danych):

```
function roomStatusBadge(room, pmRoomTypes, hkRoomsToday) {
  const pmt = pmRoomTypes[room];
  if (pmt === "PG" || pmt === "PGZ") return { label: "🧍 są goście", tone: "guest" };
  const row = hkRoomsToday[room];
  if (row && row.status === "czyste") return { label: "✓ puste, posprzątane", tone: "clean" };
  if (row) return { label: "🚪 wyjazd, do sprzątania", tone: "pending" };
  if (pmt === "W" || pmt === "WP") return { label: "🚪 wyjazd", tone: "pending" };
  return null; // brak danych na dziś — nie zgadujemy, nie pokazujemy badge'a
}
```

**Miejsca wyświetlania w `konserwacja.html`:**
1. Karta usterki (`faults` list) — badge obok numeru pokoju.
2. Wiersz pokoju w widoku obchodu (sekcja A) — badge obok checkboxa.

**Dane i odświeżanie:** `hk_plan` (dziś) i `hk_rooms` (dziś) pobierane raz przy starcie strony, plus realtime subskrypcja na obie tabele (już publikowane) żeby badge aktualizował się bez odświeżania — analogicznie do istniejącego `pendingAskFor`/`priorityFor` w `index.html`.

**Poza zakresem:** panel menedżera nie dostaje tego badge'a w tej iteracji (menedżer już ma pełny wgląd w HK Live) — do rozważenia later, nie teraz.

## Testowanie

Brak automatycznych testów w tym module (statyczne HTML + Supabase, wzorem istniejących funkcji HK/konserwacji). Walidacja ręczna w przeglądarce po wklejeniu `panel_install.sql` na bazę dev/testową: utworzenie rundy w panelu, odhaczanie w `konserwacja.html`, sprawdzenie badge'a na usterce przy pokoju z aktywnym pobytem (PG/PGZ) i przy pokoju po wyjeździe.

## Ryzyka

- `rooms` seedowane tylko dla jednego tenanta (Conrad Comfort) na sztywno wpisanym UUID — zgodne z obecną jednotenantową rzeczywistością reszty schematu (`hk_plan`/`hk_rooms` też bez `tenant_id`), ale przy realnym multi-tenant SaaS trzeba będzie seedować per tenant.
- Jeśli menedżer doda/usunie pokój z `rooms` już po utworzeniu rundy, runda tego nie złapie (lista zamrożona w momencie tworzenia) — akceptowalne, obchody są rzadkie i krótkotrwałe.
