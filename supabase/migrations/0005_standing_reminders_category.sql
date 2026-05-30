-- 0005_standing_reminders_category.sql
-- StandingRemindersPanel wstawia pole `category` (kategoria przypomnienia), a tabela
-- z 0002 tej kolumny nie miała → PostgREST odrzucał insert i przypomnienia nie
-- zapisywały się do chmury (zostawały tylko w localStorage). Dodajemy kolumnę.

alter table public.standing_reminders add column if not exists category text;
