-- 0004_faults.sql
-- UJEDNOLICENIE usterek: jedna tabela public.faults (recepcja + HK z telefonu).
-- Rozszerza ISTNIEJĄCĄ tabelę z 0002 (nie tworzy drugiej).
-- Wymóg: usterek nie można usuwać; opis i zdjęcia są niezmienne (trwały zapis w chmurze).
-- Status pozostaje w słowniku istniejącym: 'open' | 'in_progress' | 'done'.

-- 1) Nowe kolumny dla zgłoszeń z telefonu HK
alter table public.faults add column if not exists source text not null default 'reception'; -- 'reception' | 'hk'
alter table public.faults add column if not exists room   text;                              -- numer pokoju (HK)
alter table public.faults add column if not exists photos text[] not null default '{}';       -- wiele zdjęć (HK); recepcja używa też photo_url

-- 1b) Pola workflow recepcji (FaultFormModal / FaultDetailsModal) — bez nich
--     insert/update z recepcji byłby odrzucany przez PostgREST (nieznane kolumny).
alter table public.faults add column if not exists due_at          timestamptz; -- termin wykonania
alter table public.faults add column if not exists started_at      timestamptz; -- rozpoczęcie naprawy
alter table public.faults add column if not exists completed_at    timestamptz; -- zakończenie naprawy
alter table public.faults add column if not exists completion_note text;        -- notatka konserwatora

-- 2) Niezmienność + brak usuwania: zdejmij permisywną politykę FOR ALL z 0002,
--    zostaw odczyt, dodaj INSERT i UPDATE, NIE dodawaj DELETE => usuwanie zablokowane.
drop policy if exists "anon_write_faults" on public.faults;
create policy "faults_anon_insert" on public.faults for insert to anon with check (true);
create policy "faults_anon_update" on public.faults for update to anon using (true) with check (true);
-- (polityka SELECT "anon_read_faults" z 0002 pozostaje)

-- 3) Trigger: opis, zdjęcia i metadane zgłoszenia są nietykalne; edytowalny status/przypisanie/rozwiązanie.
create or replace function public.faults_block_immutable()
returns trigger language plpgsql as $$
begin
  if NEW.id          <> OLD.id
     or NEW.tenant_id  is distinct from OLD.tenant_id
     or NEW.reported_at <> OLD.reported_at
     or NEW.source      is distinct from OLD.source
     or NEW.room        is distinct from OLD.room
     or NEW.description is distinct from OLD.description
     or NEW.photos      is distinct from OLD.photos
     or NEW.photo_url   is distinct from OLD.photo_url then
    raise exception 'Usterki są niezmienne — nie wolno zmieniać opisu/zdjęć/metadanych zgłoszenia.';
  end if;
  if NEW.status not in ('open','in_progress','done') then
    raise exception 'Nieprawidłowy status usterki: %', NEW.status;
  end if;
  NEW.updated_at := now();
  return NEW;
end $$;

drop trigger if exists faults_immutable on public.faults;
create trigger faults_immutable
  before update on public.faults
  for each row execute function public.faults_block_immutable();

-- 4) Storage na zdjęcia usterek (publiczny odczyt, dodawanie tak, usuwanie NIE).
insert into storage.buckets (id, name, public)
  values ('hk-faults', 'hk-faults', true)
  on conflict (id) do nothing;

drop policy if exists "hk_faults_obj_read"   on storage.objects;
drop policy if exists "hk_faults_obj_insert" on storage.objects;
create policy "hk_faults_obj_read"   on storage.objects for select to anon using (bucket_id = 'hk-faults');
create policy "hk_faults_obj_insert" on storage.objects for insert to anon with check (bucket_id = 'hk-faults');
-- brak update/delete dla bucketu 'hk-faults' => zdjęcia trwałe.
