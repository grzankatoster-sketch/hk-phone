-- Sklepik (migracja 0060) zostal dopisany do MODULE_REGISTRY jako licencjonowalny,
-- ale nigdy nie trafil do seeda tenant_features (0049) — przez co byl niewidoczny
-- mimo lokalnego przelacznika w Ustawieniach (DB ma pierwszenstwo nad overridem).
insert into public.tenant_features (tenant_id, feature_key, enabled)
values ('00000000-0000-0000-0000-000000000001', 'sklepik', true)
on conflict (tenant_id, feature_key) do update set enabled = true;
