-- 0042_found_items.sql
-- „Rzeczy znalezione" — działa tak samo jak usterki (faults): zgłoszenie z telefonu HK
-- (kto, kiedy, jaki pokój, co + zdjęcia), widoczne na recepcji (HK Live) i w panelu menedżera.
-- Wzór jak faults: anon insert + immutable opis/zdjęcia, brak DELETE, edytowalny tylko status.
-- Zdjęcia trafiają do istniejącego bucketu 'hk-faults' (anon read/insert).

create table if not exists public.found_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  room        text,                                  -- pokój, w którym znaleziono (może być puste)
  description text not null,                          -- co znaleziono
  photos      text[] not null default '{}',           -- zdjęcia (URL-e z bucketu hk-faults)
  reported_by text,                                   -- kto zgłosił (pracownik HK)
  source      text not null default 'hk',             -- 'hk' | 'reception'
  status      text not null default 'open',           -- open (w depozycie) | returned (oddane)
  returned_by   text,                                 -- kto oznaczył jako oddane
  returned_at   timestamptz,
  returned_note text,                                 -- komu oddano / uwaga
  reported_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists found_items_tenant_idx on public.found_items(tenant_id, reported_at desc);

alter table public.found_items enable row level security;

-- Odczyt + dodawanie dla anon (telefon HK), aktualizacja statusu też (jak faults).
drop policy if exists "found_items_anon_read"   on public.found_items;
drop policy if exists "found_items_anon_insert" on public.found_items;
drop policy if exists "found_items_anon_update" on public.found_items;
create policy "found_items_anon_read"   on public.found_items for select to anon using (true);
create policy "found_items_anon_insert" on public.found_items for insert to anon with check (true);
create policy "found_items_anon_update" on public.found_items for update to anon using (true) with check (true);

drop policy if exists "found_items_auth_all" on public.found_items;
create policy "found_items_auth_all" on public.found_items for all to authenticated using (true) with check (true);

-- Niezmienność zgłoszenia (opis/zdjęcia/metadane), edytowalny tylko status/oddanie.
create or replace function public.found_items_block_immutable()
returns trigger language plpgsql as $$
begin
  if NEW.id          <> OLD.id
     or NEW.tenant_id   is distinct from OLD.tenant_id
     or NEW.reported_at <> OLD.reported_at
     or NEW.source      is distinct from OLD.source
     or NEW.room        is distinct from OLD.room
     or NEW.description is distinct from OLD.description
     or NEW.photos      is distinct from OLD.photos
     or NEW.reported_by is distinct from OLD.reported_by then
    raise exception 'Rzeczy znalezione są niezmienne — nie wolno zmieniać opisu/zdjęć/metadanych zgłoszenia.';
  end if;
  if NEW.status not in ('open','returned') then
    raise exception 'Nieprawidłowy status rzeczy znalezionej: %', NEW.status;
  end if;
  NEW.updated_at := now();
  return NEW;
end $$;

drop trigger if exists found_items_immutable on public.found_items;
create trigger found_items_immutable
  before update on public.found_items
  for each row execute function public.found_items_block_immutable();

-- Realtime: recepcja (HK Live) i panel widzą nowe zgłoszenia na żywo.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='found_items') then
    alter publication supabase_realtime add table public.found_items;
  end if;
end $$;
