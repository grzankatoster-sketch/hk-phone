-- 0034_schedule_realtime.sql
-- GRAFIK „Zmiany" — dwukierunkowa synchronizacja NA ŻYWO między aplikacją recepcji
-- (App.jsx, klucz anon) a panelem menedżerskim (panel.html, zalogowany). Dotąd grafik
-- był wypychany JEDNOKIERUNKOWO przez pushMirror (snapshot kolumny `data`), a panel
-- tylko go czytał. Teraz obie strony mogą edytować, a zmiany scalają się per-komórka.
--
-- Dokument `data` (jsonb) w wierszu (tenant_id, kind='schedule'):
--   { "YYYY-MM-DD": { "Agata": {"start":"7","end":"15","shift":"poranna"}, ... }, ... }
--
-- Wzór 1:1 z hk_state (migracja 0032): merge po stronie bazy nie kasuje cudzych
-- komórek, `rev` rośnie monotonicznie (last-write-wins per komórka), a
-- `updated_device` pozwala klientowi zignorować WŁASNE echo realtime (inaczej
-- powstałaby pętla zapis→event→zapis).
-- Różnica wobec hk_state: merge jest O JEDEN POZIOM GŁĘBSZY, bo grafik to
-- {dzień: {pracownik: {...}}} — scalamy po pracowniku w obrębie dnia.
-- Idempotentne.

alter table public.panel_mirror add column if not exists rev            bigint not null default 0;
alter table public.panel_mirror add column if not exists updated_device text;

-- ── Atomowy 2-poziomowy merge grafiku + bump rev. Zwraca nowy wiersz. ────────
-- Wywołanie: supabase.rpc('schedule_merge', { p_cells, p_device, p_tenant })
create or replace function public.schedule_merge(
  p_cells  jsonb,
  p_device text default null,
  p_tenant uuid  default '00000000-0000-0000-0000-000000000001'
) returns public.panel_mirror
language plpgsql security definer set search_path = public as $$
declare
  r   public.panel_mirror;
  d   jsonb;
  dk  text;
begin
  -- Wczytaj bieżący dokument (albo pusty) i scal po dniu→pracowniku.
  select coalesce(pm.data, '{}'::jsonb) into d
    from public.panel_mirror pm
    where pm.tenant_id = p_tenant and pm.kind = 'schedule'
    for update;
  if d is null then d := '{}'::jsonb; end if;
  for dk in select jsonb_object_keys(coalesce(p_cells, '{}'::jsonb)) loop
    d := jsonb_set(d, array[dk], coalesce(d->dk, '{}'::jsonb) || (p_cells->dk), true);
  end loop;

  insert into public.panel_mirror(tenant_id, kind, data, rev, updated_device, updated_at)
  values (p_tenant, 'schedule', d, 1, p_device, now())
  on conflict (tenant_id, kind) do update
    set data           = d,
        rev            = public.panel_mirror.rev + 1,
        updated_device = p_device,
        updated_at     = now()
  returning * into r;
  return r;
end $$;

grant execute on function public.schedule_merge(jsonb, text, uuid) to anon, authenticated;

-- ── Realtime: każdy zapis natychmiast trafia na pozostałe urządzenia ─────────
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='panel_mirror'
  ) then
    alter publication supabase_realtime add table public.panel_mirror;
  end if;
end $$;
