-- 0057_own_rates_current.sql  (WYKONANIE 4.20 — pulpit aktualna vs proponowana)
-- Aktualna cena wystawiona (odczyt z YieldPlanet/KWHotel — TYLKO odczyt, bez wysyłania)
-- oraz źródło, z którego przyszła. Silnik liczy proponowaną; kierownik wpisuje ją ręcznie
-- na YP. Idempotentne.
alter table public.own_rates add column if not exists current_price numeric;
alter table public.own_rates add column if not exists source text;         -- 'yieldplanet' | 'kwhotel' | 'manual'
alter table public.own_rates add column if not exists occupancy numeric;    -- zajętość danej daty 0..1 (do zaniżania)
