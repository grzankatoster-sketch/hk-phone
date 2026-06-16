-- 0014_panel_konserwatorzy.sql
-- Iteracja 5 panelu: menedżer główny/operacyjny dodaje zadania konserwatorom.
-- Zadanie = wpis do `faults` (assigned_to = konserwator). Istniejący Database Webhook na INSERT
-- do `faults` automatycznie wyśle push (push-send) — bez dodatkowego kodu.
-- Odczyt faults dla authenticated dodaliśmy w 0010; tu dokładamy INSERT dla zalogowanych z rolą.

drop policy if exists "faults_auth_insert" on public.faults;
create policy "faults_auth_insert" on public.faults
  for insert to authenticated
  with check ( public.current_app_role() is not null );
