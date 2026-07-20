-- 0044_faults_sla_escalation.sql  (Etap 3a — eskalacja przekroczonego SLA)
-- Gdy usterka przekroczy termin (due_at < now) i wciąż jest otwarta/w toku, raz tworzymy
-- AKTYWNY alert PILNY w manager_alerts (recepcja „Pilne" + ack przed zmianą, panel widzi),
-- po czym oznaczamy ją flagą escalated_at, żeby nie eskalować jej w kółko (bez spamu).
--
-- Bez sekretów i bez edycji Edge Functions — czysta logika w bazie + harmonogram pg_cron.
-- Push na telefon konserwatora to osobny krok 3b (pg_net/Vault lub Database Webhook).
-- Idempotentne.

-- 1) Flaga anty-spam: kiedy usterka została już zgłoszona jako po terminie.
alter table public.faults add column if not exists escalated_at timestamptz;

-- 2) Funkcja eskalacji — działa dla WSZYSTKICH tenantów (per-row tenant_id), zwraca liczbę
--    nowo zeskalowanych usterek. SECURITY DEFINER, bo uruchamia ją pg_cron (nie zalogowany user).
create or replace function public.escalate_overdue_faults()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with due as (
    select id, tenant_id,
           coalesce(nullif(room,''), nullif(space_id,''), '—') as loc,
           nullif(description,'')  as descr,
           nullif(assigned_to,'')  as who
    from public.faults
    where status in ('open','in_progress')
      and due_at is not null
      and due_at < now()
      and escalated_at is null
  ),
  ins as (
    insert into public.manager_alerts (tenant_id, title, body, priority, kind, created_by)
    select tenant_id,
           'SLA przekroczone: ' || loc,
           'Usterka po terminie naprawy'
             || coalesce(' — ' || descr, '')
             || coalesce(' · przypisana: ' || who, ' · nieprzypisana'),
           'high', 'alert', 'System SLA'
    from due
    returning 1
  )
  update public.faults f
     set escalated_at = now()
    from due
   where f.id = due.id;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- 3) Harmonogram: pg_cron co 15 min. Na Supabase pg_cron bywa włączany w Dashboard →
--    Database → Extensions; poniższe próbuje go włączyć i re-rejestruje zadanie idempotentnie.
do $$
begin
  -- Włącz rozszerzenie, jeśli dostępne (gdy brak uprawnień — włącz ręcznie w Dashboard).
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron: nie udało się utworzyć rozszerzenia tutaj — włącz je w Dashboard, potem uruchom samą sekcję cron.schedule.';
  end;

  -- Re-rejestracja zadania (usuń stare o tej nazwie, dodaj świeże).
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
      from cron.job where jobname = 'escalate-overdue-faults';
    perform cron.schedule(
      'escalate-overdue-faults',
      '*/15 * * * *',
      $cron$ select public.escalate_overdue_faults(); $cron$
    );
  end if;
end $$;
