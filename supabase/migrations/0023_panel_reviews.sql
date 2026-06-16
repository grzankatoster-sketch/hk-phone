-- 0023_panel_reviews.sql
-- Recepcja widzi opinie gości (Booking) przez statystyki/raporty — odczyt dla zalogowanych.

drop policy if exists "booking_reviews_auth_read" on public.booking_reviews;
create policy "booking_reviews_auth_read" on public.booking_reviews
  for select to authenticated using (true);
