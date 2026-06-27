-- 0036_grafik_dept_visibility.sql
-- KORELACJA DZIAŁU dla zbiórek dyspozycyjności (zakładka „Grafik" w panelu).
-- Dotąd `list_availability_requests` zwracała wszystkie prośby, a panel filtrował
-- je po imieniu twórcy (created_by === zalogowany) — przez co koordynator i
-- menedżer recepcji NIE widzieli nawzajem swoich grafików, mimo że obsługują ten
-- sam dział (recepcja). Teraz RPC zwraca też `kind` prośby (dział: 'hk' |
-- 'recepcja'), wyznaczony z tokenów (wszystkie tokeny jednej prośby mają jeden
-- kind). Panel filtruje po DZIALE roli, więc cały dział recepcji (koordynator +
-- menedżer recepcji + gł./oper.) widzi wspólną pulę grafików recepcji, a menedżer
-- HK — grafiki HK. Usuwanie pozostaje przy właścicielu (migracja 0026).
--
-- Bez zmiany schematu tabel — tylko sygnatura funkcji zyskuje kolumnę `kind`.

drop function if exists public.list_availability_requests();
create function public.list_availability_requests()
returns table(id uuid, period_type text, period_start date, created_by text,
              created_at timestamptz, expires_at timestamptz, kind text,
              persons bigint, answered bigint)
language sql stable security definer set search_path = public as $$
  select r.id, r.period_type, r.period_start, r.created_by, r.created_at, r.expires_at,
         (select max(t.kind) from public.availability_tokens t where t.request_id = r.id) as kind,
         (select count(*) from public.availability_tokens t where t.request_id = r.id) as persons,
         (select count(distinct e.token) from public.availability_entries e
            join public.availability_tokens t on t.token = e.token where t.request_id = r.id) as answered
  from public.availability_requests r
  where public.current_app_role() is not null
  order by r.created_at desc limit 50;
$$;
grant execute on function public.list_availability_requests() to authenticated;
