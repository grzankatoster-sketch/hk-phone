-- 0022_panel_grafik_ai.sql
-- Panel (zalogowany) może ZAPISYWAĆ do panel_mirror — m.in. propozycję grafiku (kind='proposed_schedule'),
-- którą aplikacja recepcji pobiera i wstawia do swojego grafiku.

drop policy if exists "panel_mirror_auth_write" on public.panel_mirror;
create policy "panel_mirror_auth_write" on public.panel_mirror
  for all to authenticated using (true) with check (true);
