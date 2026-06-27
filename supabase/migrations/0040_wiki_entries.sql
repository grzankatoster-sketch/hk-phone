-- 0040_wiki_entries.sql
-- Wiki recepcji w bazie (dotąd tylko localStorage komputera recepcji).
-- Dzięki temu menedżer z panelu (Tablica → „Wpis do Wiki") dopisuje wprost do Wiki,
-- a recepcja synchronizuje wpisy NA ŻYWO — tak jak manager_alerts i standing_reminders.
--
-- id jest TEXT (nie uuid), by zachować dotychczasowe identyfikatory wpisów z recepcji
-- (seed „wiki1"/„wiki2" oraz crypto.randomUUID()). tenant_id = uuid (jak reszta tabel).
-- Idempotentne.

create table if not exists public.wiki_entries (
  id          text PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  topic       text NOT NULL,
  content     text NOT NULL DEFAULT '',
  images      jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by  text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

alter table public.wiki_entries enable row level security;

-- Recepcja (App.jsx) działa na kluczu anon i sama edytuje Wiki — pełny dostęp jak standing_reminders (0002).
drop policy if exists "anon_read_wiki_entries"  on public.wiki_entries;
create policy "anon_read_wiki_entries"  on public.wiki_entries for select to anon using (true);
drop policy if exists "anon_write_wiki_entries" on public.wiki_entries;
create policy "anon_write_wiki_entries" on public.wiki_entries for all to anon using (true) with check (true);

-- Panel (zalogowany menedżer): odczyt dla wszystkich, zapis tylko z przypisaną rolą panelu.
drop policy if exists "wiki_entries_auth_read" on public.wiki_entries;
create policy "wiki_entries_auth_read" on public.wiki_entries
  for select to authenticated using (true);

drop policy if exists "wiki_entries_auth_insert" on public.wiki_entries;
create policy "wiki_entries_auth_insert" on public.wiki_entries
  for insert to authenticated with check ( public.current_app_role() is not null );

drop policy if exists "wiki_entries_auth_update" on public.wiki_entries;
create policy "wiki_entries_auth_update" on public.wiki_entries
  for update to authenticated
  using ( public.current_app_role() is not null )
  with check ( public.current_app_role() is not null );

drop policy if exists "wiki_entries_auth_delete" on public.wiki_entries;
create policy "wiki_entries_auth_delete" on public.wiki_entries
  for delete to authenticated
  using ( public.current_app_role() is not null );

-- Realtime: zapis z panelu/recepcji od razu trafia na pozostałe urządzenia.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='wiki_entries'
  ) then
    alter publication supabase_realtime add table public.wiki_entries;
  end if;
end $$;
