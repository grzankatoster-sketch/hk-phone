-- 0059_hk_check_plans.sql
-- Plan kontroli HK: menedżer/kierownik tworzy zadanie kontrolne przypięte do POKOJU
-- (np. "sprawdź stan silikonów"), nie do osoby — realizuje je ktokolwiek akurat
-- sprząta ten pokój danego dnia (przydział z hk_plan.assignments). Jeśli dana
-- pokojówka nie ma tego pokoju, zadanie NIE znika — czeka aż ktoś go dostanie.
--
-- Reguła "final wygrywa": rano oznaczenie "wykonane" zamyka zadanie na stałe
-- (is_final=true); popołudnie może wtedy tylko przeglądać, nigdy nadpisać. Jeśli
-- rano nikt nie sprawdził, popołudnie może zgłosić WYŁĄCZNIE "nie udało się
-- sprawdzić" z powodem (np. "gość poprosił o niewchodzenie") — nie może samo
-- oznaczyć "wykonane" (to zastrzeżone dla zmiany porannej wg wymagań menedżera).
-- Egzekwowane atomowo w hk_check_submit (RPC), nie w kliencie — eliminuje wyścig
-- dwóch osób klikających jednocześnie.

create table if not exists public.hk_check_plans (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default '00000000-0000-0000-0000-000000000001',
  name       text not null,
  task       text not null,
  status     text not null default 'active',  -- active | done
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hk_check_plans_tenant_idx
  on public.hk_check_plans(tenant_id, status, created_at desc);

create table if not exists public.hk_check_items (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default '00000000-0000-0000-0000-000000000001',
  plan_id      uuid not null references public.hk_check_plans(id) on delete cascade,
  room         text not null,
  valid_from   date not null,
  valid_to     date not null,
  status       text not null default 'pending',  -- pending | done | failed
  result_shift text,                              -- 'morning' | 'pm' — kto ostatnio zgłosił wynik
  done_by      text,
  done_at      timestamptz,
  fail_reason  text,
  is_final     boolean not null default false,    -- true = zamknięte na stałe, kolejne zmiany nie mogą nadpisać
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists hk_check_items_plan_idx on public.hk_check_items(plan_id);
create index if not exists hk_check_items_room_idx
  on public.hk_check_items(tenant_id, room, valid_from, valid_to);

alter table public.hk_check_plans enable row level security;
drop policy if exists "hk_check_plans_anon" on public.hk_check_plans;
drop policy if exists "hk_check_plans_auth" on public.hk_check_plans;
create policy "hk_check_plans_anon" on public.hk_check_plans for all to anon using (true) with check (true);
create policy "hk_check_plans_auth" on public.hk_check_plans for all to authenticated using (true) with check (true);

alter table public.hk_check_items enable row level security;
drop policy if exists "hk_check_items_anon" on public.hk_check_items;
drop policy if exists "hk_check_items_auth" on public.hk_check_items;
create policy "hk_check_items_anon" on public.hk_check_items for all to anon using (true) with check (true);
create policy "hk_check_items_auth" on public.hk_check_items for all to authenticated using (true) with check (true);

-- ── Zgłoszenie wyniku kontroli — atomowe, egzekwuje regułę "final wygrywa" ───
-- Wywołanie: supabase.rpc('hk_check_submit', { p_item_id, p_shift, p_result, p_reason, p_worker })
--   p_shift  'morning' | 'pm'
--   p_result 'done' | 'failed' (popołudnie: tylko 'failed' jest dozwolone)
drop function if exists public.hk_check_submit(uuid, text, text, text, text);
create or replace function public.hk_check_submit(
  p_item_id uuid,
  p_shift   text,
  p_result  text,
  p_reason  text default null,
  p_worker  text default null
) returns public.hk_check_items
language plpgsql security definer set search_path = public as $$
declare r public.hk_check_items;
begin
  select * into r from public.hk_check_items where id = p_item_id for update;
  if not found then
    raise exception 'hk_check_items % not found', p_item_id;
  end if;
  if r.is_final then
    return r; -- już zamknięte (rano) — kolejne próby (popołudnie) nic nie zmieniają
  end if;
  if p_shift = 'pm' and p_result = 'done' then
    raise exception 'Zmiana popołudniowa nie może oznaczyć zadania jako wykonane od nowa';
  end if;
  update public.hk_check_items set
    status       = p_result,
    result_shift = p_shift,
    done_by      = p_worker,
    done_at      = now(),
    fail_reason  = case when p_result = 'failed' then p_reason else null end,
    is_final     = (p_shift = 'morning' and p_result = 'done'),
    updated_at   = now()
  where id = p_item_id
  returning * into r;
  return r;
end $$;

grant execute on function public.hk_check_submit(uuid, text, text, text, text) to anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='hk_check_plans') then
    alter publication supabase_realtime add table public.hk_check_plans;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='hk_check_items') then
    alter publication supabase_realtime add table public.hk_check_items;
  end if;
end $$;
