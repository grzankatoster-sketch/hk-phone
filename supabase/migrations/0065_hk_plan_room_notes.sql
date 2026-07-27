-- Dodatkowe info na kafelku pokoju w telefonie HK (index.html) — wiadomość
-- zbiorcza dla wszystkich pokoi grupy (np. "kapcie do pokoi", "pobudka 7:00"),
-- wysyłana z sekcji "Grupy" w HKPanel.jsx (grupy wykrywane z meal_plans.reservation_id).
ALTER TABLE public.hk_plan ADD COLUMN IF NOT EXISTS room_notes jsonb DEFAULT '{}'::jsonb;
