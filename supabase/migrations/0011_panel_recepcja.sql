-- 0011_panel_recepcja.sql
-- Iteracja 3 panelu: recepcja/koordynator — przekazane zadania + stan kasy.
-- Komputer recepcji (App.jsx) czyta `manager_alerts` na żywo; panel pozwala je DODAWAĆ z telefonu.
-- shift_reports ma już odczyt dla authenticated (0010 dodał *_auth_read) — tu dokładamy
-- odczyt + zapis manager_alerts dla zalogowanych z rolą panelu.

-- Odczyt manager_alerts dla zalogowanych (lista przekazanych zadań w panelu).
drop policy if exists "manager_alerts_auth_read" on public.manager_alerts;
create policy "manager_alerts_auth_read" on public.manager_alerts
  for select to authenticated using (true);

-- Zapis: tylko zalogowani z przypisaną rolą panelu (current_app_role() != null).
-- Dzięki temu „przekazanie zadania na komputer" działa, ale nie dla przypadkowego anona z kluczem.
drop policy if exists "manager_alerts_auth_insert" on public.manager_alerts;
create policy "manager_alerts_auth_insert" on public.manager_alerts
  for insert to authenticated
  with check ( public.current_app_role() is not null );
