-- 0037_manager_mail.sql
-- POCZTA WEWNĘTRZNA menedżerów (panel ↔ panel). Dotąd jedyny kanał przekazywania
-- zadań z panelu (manager_alerts) był celowany na ZMIANĘ RECEPCJI (target_shift),
-- więc nie nadaje się na korespondencję osoba↔osoba/rola. Tu dokładamy osobny,
-- „mailowy" kanał między kontami panelu (app_accounts):
--
--   • adresat = konkretna OSOBA (to_email) ALBO cała ROLA (to_role) — broadcast,
--   • typ wiadomości kind: 'prosba' (wymaga odpowiedzi/akceptacji) | 'zadanie' (do
--     odhaczenia) | 'info' (do wiadomości),
--   • wątki/odpowiedzi przez thread_id (= id pierwszej wiadomości wątku) + parent_id,
--   • statusy: open → in_progress → done | rejected (z reply_note = powód/notatka),
--   • read_at = znacznik przeczytania (badge nieprzeczytanych w panelu).
--
-- Bezpieczeństwo: tabela RLS-only (zero polityk anon). Czyta/pisze wyłącznie zalogowane
-- konto panelu (current_app_role() != null). Widzisz wiadomość, gdy jesteś nadawcą,
-- adresatem imiennym, należysz do adresowanej roli — albo jesteś adminem.
-- Idempotentne.

-- ─── Helper: e-mail (ukryty login) zalogowanego konta panelu ──────────────────
-- Analogiczny do current_app_role(); używany w politykach RLS poczty.
create or replace function public.current_app_email()
returns text language sql stable security definer set search_path = public as $$
  select email from public.app_accounts where user_id = auth.uid()
$$;
grant execute on function public.current_app_email() to anon, authenticated;

-- ─── Tabela ───────────────────────────────────────────────────────────────────
create table if not exists public.manager_messages (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default '00000000-0000-0000-0000-000000000001',
  thread_id   uuid not null,                                  -- = id pierwszej wiadomości wątku
  parent_id   uuid,                                           -- odpowiedź na konkretną wiadomość
  from_email  text not null,                                  -- nadawca (app_accounts.email)
  from_name   text not null,
  from_role   text,
  to_email    text,                                           -- adresat imienny (XOR z to_role)
  to_role     text,                                           -- broadcast do roli
  subject     text not null,
  body        text not null,
  kind        text not null default 'prosba',                 -- prosba | zadanie | info
  priority    text not null default 'normal',                 -- normal | high
  status      text not null default 'open',                   -- open | in_progress | done | rejected
  read_at     timestamptz,
  done_at     timestamptz,
  done_by     text,
  reply_note  text,                                           -- powód odrzucenia / notatka odpowiedzi
  created_at  timestamptz not null default now(),
  check (to_email is not null or to_role is not null)
);

create index if not exists manager_messages_thread_idx on public.manager_messages (thread_id, created_at);
create index if not exists manager_messages_to_email_idx on public.manager_messages (to_email);
create index if not exists manager_messages_to_role_idx  on public.manager_messages (to_role);

alter table public.manager_messages enable row level security;

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Odczyt: nadawca, adresat imienny, członek adresowanej roli, lub admin.
drop policy if exists "mm_read" on public.manager_messages;
create policy "mm_read" on public.manager_messages
  for select to authenticated using (
        from_email = public.current_app_email()
     or to_email   = public.current_app_email()
     or to_role    = public.current_app_role()
     or public.current_app_role() = 'admin'
  );

-- Zapis (wysłanie): zalogowane konto panelu, nadawca = ja.
drop policy if exists "mm_insert" on public.manager_messages;
create policy "mm_insert" on public.manager_messages
  for insert to authenticated with check (
        public.current_app_role() is not null
    and from_email = public.current_app_email()
  );

-- Aktualizacja (przeczytane / status / odpowiedź-notatka): tylko uczestnik wątku.
drop policy if exists "mm_update" on public.manager_messages;
create policy "mm_update" on public.manager_messages
  for update to authenticated using (
        from_email = public.current_app_email()
     or to_email   = public.current_app_email()
     or to_role    = public.current_app_role()
     or public.current_app_role() = 'admin'
  ) with check (true);

-- ─── Realtime: nowa wiadomość / zmiana statusu wchodzi na żywo (badge) ────────
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='manager_messages'
  ) then
    alter publication supabase_realtime add table public.manager_messages;
  end if;
end $$;

-- ─── TTL: poczta starsza niż 30 dni znika (dłużej niż 14 dni zadań — to korespondencja) ─
create or replace function public.panel_ttl_cleanup()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.panel_audit            where created_at < now() - interval '14 days';
  delete from public.availability_requests  where created_at < now() - interval '14 days'; -- kaskada tokens/entries
  delete from public.manager_alerts         where created_at < now() - interval '14 days';
  delete from public.manager_messages       where created_at < now() - interval '30 days';
end $$;
