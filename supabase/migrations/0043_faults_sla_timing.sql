-- 0043_faults_sla_timing.sql
-- Ożywia dashboard SLA menedżera (loadSLA w panel.html), który czyta due_at / started_at /
-- completed_at, ale dotąd te kolumny były wypełniane TYLKO przez desktopowy FaultDetailsModal.
-- Główna ścieżka terenowa (konserwacja.html) zapisywała resolved_at, nie completed_at, a HK/
-- telefon/addKonserwTask nie ustawiały due_at => metryki czasu i „po terminie" były martwe.
--
-- Rozwiązanie: jeden punkt w bazie (triggery), działa dla WSZYSTKICH klientów bez zmian w JS.
-- Wstecznie bezpieczne: uzupełnia wyłącznie puste pola, nigdy nie nadpisuje istniejących.

-- 1) BEFORE INSERT: automatyczny termin SLA z priorytetu + domknięcie czasów przy insertach
--    od razu w statusie in_progress/done. Defaulty kolumn (reported_at) są już przypisane do
--    NEW zanim odpali BEFORE INSERT, więc coalesce(NEW.reported_at, now()) jest bezpieczny.
create or replace function public.faults_set_due_at()
returns trigger language plpgsql as $$
begin
  if NEW.due_at is null then
    NEW.due_at := coalesce(NEW.reported_at, now()) +
      case lower(coalesce(NEW.priority, 'normal'))
        when 'urgent' then interval '4 hours'   -- P1 (recepcja/React, triage LLM)
        when 'high'   then interval '4 hours'   -- P1 (alias z panel.html/addKonserwTask)
        when 'low'    then interval '72 hours'  -- P3
        else               interval '24 hours'  -- P2 (normal i nieznane)
      end;
  end if;
  if NEW.status = 'in_progress' and NEW.started_at is null then
    NEW.started_at := now();
  end if;
  if NEW.status = 'done' and NEW.completed_at is null then
    NEW.completed_at := coalesce(NEW.resolved_at, now());
  end if;
  return NEW;
end $$;

drop trigger if exists faults_set_due on public.faults;
create trigger faults_set_due
  before insert on public.faults
  for each row execute function public.faults_set_due_at();

-- 2) BEFORE UPDATE: rozszerzenie istniejącej funkcji niezmienności z 0004 o stemple czasu.
--    Zachowuje 1:1 dotychczasowe blokady (opis/zdjęcia/metadane) i walidację statusu, a dodatkowo:
--      - start naprawy (status → in_progress) stempluje started_at, jeśli puste,
--      - zamknięcie (status → done) stempluje completed_at (z resolved_at jeśli klient go ustawił).
--    started_at NIE jest uzupełniane przy bezpośrednim open → done, żeby nie zaniżać śr. czasu reakcji.
create or replace function public.faults_block_immutable()
returns trigger language plpgsql as $$
begin
  if NEW.id          <> OLD.id
     or NEW.tenant_id  is distinct from OLD.tenant_id
     or NEW.reported_at <> OLD.reported_at
     or NEW.source      is distinct from OLD.source
     or NEW.room        is distinct from OLD.room
     or NEW.description is distinct from OLD.description
     or NEW.photos      is distinct from OLD.photos
     or NEW.photo_url   is distinct from OLD.photo_url then
    raise exception 'Usterki są niezmienne — nie wolno zmieniać opisu/zdjęć/metadanych zgłoszenia.';
  end if;
  if NEW.status not in ('open','in_progress','done') then
    raise exception 'Nieprawidłowy status usterki: %', NEW.status;
  end if;

  -- Stemple czasu SLA (tylko gdy puste — nie nadpisujemy historii).
  if NEW.status = 'in_progress' and NEW.started_at is null then
    NEW.started_at := now();
  end if;
  if NEW.status = 'done' and NEW.completed_at is null then
    NEW.completed_at := coalesce(NEW.resolved_at, now());
  end if;

  NEW.updated_at := now();
  return NEW;
end $$;
-- Trigger faults_immutable z 0004 nadal wskazuje na tę funkcję — create or replace wystarcza.

-- 3) Uzupełnienie historycznych danych (jednorazowo): termin dla usterek bez due_at oraz
--    completed_at dla już zamkniętych, by dashboard SLA pokazał sensowne wartości od razu.
update public.faults
   set due_at = reported_at +
     case lower(coalesce(priority,'normal'))
       when 'urgent' then interval '4 hours'
       when 'high'   then interval '4 hours'
       when 'low'    then interval '72 hours'
       else               interval '24 hours'
     end
 where due_at is null and reported_at is not null;

update public.faults
   set completed_at = coalesce(resolved_at, updated_at)
 where status = 'done' and completed_at is null;
