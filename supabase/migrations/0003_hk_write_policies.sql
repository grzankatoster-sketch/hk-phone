-- Dodanie polityk zapisu (INSERT/UPDATE/DELETE) dla tabel HK
-- Analogicznie do anon_write_* w 0002_app_tables.sql

CREATE POLICY "anon_write_hk_workers" ON public.hk_workers
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_write_hk_rooms" ON public.hk_rooms
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_write_hk_tasks" ON public.hk_tasks
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_write_hk_logs" ON public.hk_logs
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_write_hk_plan" ON public.hk_plan
  FOR ALL TO anon USING (true) WITH CHECK (true);
