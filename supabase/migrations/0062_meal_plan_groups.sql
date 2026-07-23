-- Rezerwacje grupowe w raporcie "Posiłki" nie mają numeru pokoju (raport zwraca
-- jeden zbiorczy wiersz na całą grupę, nr pok.=-1) — wcześniej były pomijane,
-- co zaniżało liczby o połowę i więcej. Teraz zapisywane jako osobna pozycja
-- oznaczona is_group, żeby UI mogło pokazać inny styl kafla i większy krok.
alter table public.meal_plans add column if not exists is_group boolean not null default false;
