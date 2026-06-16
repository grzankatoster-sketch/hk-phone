-- 0027_panel_hk_quality.sql
-- Trzy elementy żądane przez kierownika HK:
--   1) hk_qc_settings     — ustawienia losowej kontroli pokoi (tryb, osoba, pytania)
--   2) hk_quality_checks  — pojedyncze losowe kontrole (kto, pokój, pytania, odpowiedzi)
--   3) hk_reminder_acks   — potwierdzenia przeczytania przypomnień (każdy musi przeklikać)
-- Telefon HK używa klucza anon → polityki anon (read/insert/update), jak hk_roster.

-- ── 1. Ustawienia losowej kontroli ───────────────────────────────────────────
create table if not exists public.hk_qc_settings (
  tenant_id     uuid primary key,
  enabled       boolean not null default true,
  mode          text    not null default 'random',   -- 'random' | 'person'
  chosen_person text,                                 -- gdy mode='person'
  daily_limit   int     not null default 4,           -- ile kontroli losowych na dzień
  items         jsonb   not null default
    '["Sprawdziłaś pod łóżkiem?","Stan czajnika (czysty, woda, kubki)?","Ręczniki uzupełnione?","Łazienka — kosmetyki i papier?","Minibar uzupełniony?","Zasłony / okno domknięte?"]',
  updated_at    timestamptz not null default now()
);

alter table public.hk_qc_settings enable row level security;
drop policy if exists "hk_qc_settings_read"  on public.hk_qc_settings;
drop policy if exists "hk_qc_settings_write" on public.hk_qc_settings;
create policy "hk_qc_settings_read"  on public.hk_qc_settings for select to anon, authenticated using (true);
create policy "hk_qc_settings_write" on public.hk_qc_settings for all to anon, authenticated using (true) with check (true);

-- ── 2. Losowe kontrole pokoi ──────────────────────────────────────────────────
create table if not exists public.hk_quality_checks (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  date          date not null,
  room          text not null,
  cleaned_by    text,                                 -- kto sprzątał pokój
  target_worker text not null,                        -- kto ma sprawdzić (cel kontroli)
  items         jsonb not null default '[]',          -- [{q:"...", checked:bool}]
  status        text  not null default 'pending',     -- 'pending' | 'done'
  created_at    timestamptz not null default now(),
  acked_at      timestamptz
);
create index if not exists hk_quality_checks_day_idx
  on public.hk_quality_checks(tenant_id, date, created_at desc);
create index if not exists hk_quality_checks_target_idx
  on public.hk_quality_checks(tenant_id, date, target_worker, status);

alter table public.hk_quality_checks enable row level security;
drop policy if exists "hk_quality_checks_read"  on public.hk_quality_checks;
drop policy if exists "hk_quality_checks_write" on public.hk_quality_checks;
create policy "hk_quality_checks_read"  on public.hk_quality_checks for select to anon, authenticated using (true);
create policy "hk_quality_checks_write" on public.hk_quality_checks for all to anon, authenticated using (true) with check (true);

-- ── 3. Potwierdzenia przypomnień ─────────────────────────────────────────────
create table if not exists public.hk_reminder_acks (
  reminder_id uuid not null,
  worker      text not null,
  acked_at    timestamptz not null default now(),
  primary key (reminder_id, worker)
);
create index if not exists hk_reminder_acks_worker_idx on public.hk_reminder_acks(worker);

alter table public.hk_reminder_acks enable row level security;
drop policy if exists "hk_reminder_acks_read"  on public.hk_reminder_acks;
drop policy if exists "hk_reminder_acks_write" on public.hk_reminder_acks;
create policy "hk_reminder_acks_read"  on public.hk_reminder_acks for select to anon, authenticated using (true);
create policy "hk_reminder_acks_write" on public.hk_reminder_acks for all to anon, authenticated using (true) with check (true);

-- ── Realtime: natychmiastowy modal kontroli/przypomnienia na telefonie ───────
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='hk_quality_checks') then
    alter publication supabase_realtime add table public.hk_quality_checks;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='hk_reminders') then
    alter publication supabase_realtime add table public.hk_reminders;
  end if;
end $$;
