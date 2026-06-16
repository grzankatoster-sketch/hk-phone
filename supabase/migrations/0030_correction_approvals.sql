-- 0030_correction_approvals.sql
-- Zatwierdzanie korekt płatności z panelu menedżerskiego.
-- Korekty są zapisywane jednokierunkowo (recepcja -> panel_mirror, read-only snapshot),
-- więc decyzję kierownika trzymamy w osobnej tabeli, żeby nie nadpisywać lustra recepcji.
-- Panel zapisuje i odczytuje zatwierdzenia; aplikacja recepcji może je odczytać w przyszłości.

create table if not exists public.payment_correction_approvals (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  correction_id  text not null,          -- id korekty z aplikacji recepcji (crypto.randomUUID)
  decision       text not null default 'approved',  -- approved | rejected
  manager        text,                   -- imię kierownika podejmującego decyzję
  note           text,                   -- opcjonalny komentarz
  decided_at     timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  unique (tenant_id, correction_id)
);

create index if not exists correction_approvals_tenant_idx
  on public.payment_correction_approvals (tenant_id, decided_at desc);

alter table public.payment_correction_approvals enable row level security;

drop policy if exists "corr_appr_anon_read"   on public.payment_correction_approvals;
drop policy if exists "corr_appr_anon_insert" on public.payment_correction_approvals;
drop policy if exists "corr_appr_anon_update" on public.payment_correction_approvals;
create policy "corr_appr_anon_read"   on public.payment_correction_approvals for select to anon using (true);
create policy "corr_appr_anon_insert" on public.payment_correction_approvals for insert to anon with check (true);
create policy "corr_appr_anon_update" on public.payment_correction_approvals for update to anon using (true) with check (true);
