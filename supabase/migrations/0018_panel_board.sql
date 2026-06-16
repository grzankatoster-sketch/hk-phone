-- 0018_panel_board.sql
-- Tablica: stałe przypomnienia (standing_reminders) widoczne i edytowalne z panelu.
-- manager_alerts i tak ma już polityki dla authenticated (0011). Tu dokładamy standing_reminders.

drop policy if exists "standing_reminders_auth_read" on public.standing_reminders;
create policy "standing_reminders_auth_read" on public.standing_reminders
  for select to authenticated using (true);

drop policy if exists "standing_reminders_auth_insert" on public.standing_reminders;
create policy "standing_reminders_auth_insert" on public.standing_reminders
  for insert to authenticated with check ( public.current_app_role() is not null );

drop policy if exists "standing_reminders_auth_update" on public.standing_reminders;
create policy "standing_reminders_auth_update" on public.standing_reminders
  for update to authenticated
  using ( public.current_app_role() is not null )
  with check ( public.current_app_role() is not null );
