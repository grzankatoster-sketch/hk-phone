-- 0060_shop_sklepik.sql
-- Sklepik recepcji jako MAGAZYN (WYKONANIE 4.2, rozszerzone o wymaganie usera:
-- prawdziwy stan/wydania, nie tylko log sprzedaży). Trzy tabele:
--   shop_items     — katalog: nazwa, cena sprzedaży, stan bieżący (stock)
--   shop_sales     — wydania gościom (kasjer/recepcja) — ujemne qty = storno
--   shop_purchases — przyjęcia towaru ("Zakupy") — wyłącznie menedżer po
--                    stronie UI (isAdmin), tu bez osobnej roli DB (ten sam
--                    model co reszta funkcji admina w tej appce — PIN menedżera)
--
-- Stock jest MUTOWANY wyłącznie przez RPC (shop_sell/shop_storno/shop_purchase),
-- z blokadą wiersza (for update), żeby dwie jednoczesne sprzedaże nie przesprzedały
-- towaru. Utarg to osobny log (shop_sales) — zero zmian w calculateShiftCash,
-- wzorem już wdrożonych 4.1 (safe_operations) i 4.12 (upsell_charges).

create table if not exists public.shop_items (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default '00000000-0000-0000-0000-000000000001',
  name       text not null,
  price      numeric(10,2) not null default 0,
  stock      integer not null default 0,
  min_stock  integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shop_items_tenant_idx on public.shop_items(tenant_id, active, name);

create table if not exists public.shop_sales (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default '00000000-0000-0000-0000-000000000001',
  item_id    uuid not null references public.shop_items(id),
  name       text not null,              -- denormalizowana nazwa (historia niezależna od zmian w katalogu)
  qty        integer not null,           -- ujemne = storno
  unit_price numeric(10,2) not null,
  total      numeric(10,2) not null,
  payment    text not null default 'gotowka', -- gotowka | karta
  shift      text,
  by         text,
  created_at timestamptz not null default now()
);
create index if not exists shop_sales_tenant_idx on public.shop_sales(tenant_id, created_at desc);

create table if not exists public.shop_purchases (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default '00000000-0000-0000-0000-000000000001',
  item_id    uuid not null references public.shop_items(id),
  name       text not null,
  qty        integer not null,
  unit_cost  numeric(10,2),
  by         text,
  created_at timestamptz not null default now()
);
create index if not exists shop_purchases_tenant_idx on public.shop_purchases(tenant_id, created_at desc);

alter table public.shop_items enable row level security;
drop policy if exists "shop_items_anon" on public.shop_items;
drop policy if exists "shop_items_auth" on public.shop_items;
create policy "shop_items_anon" on public.shop_items for all to anon using (true) with check (true);
create policy "shop_items_auth" on public.shop_items for all to authenticated using (true) with check (true);

alter table public.shop_sales enable row level security;
drop policy if exists "shop_sales_anon" on public.shop_sales;
drop policy if exists "shop_sales_auth" on public.shop_sales;
create policy "shop_sales_anon" on public.shop_sales for all to anon using (true) with check (true);
create policy "shop_sales_auth" on public.shop_sales for all to authenticated using (true) with check (true);

alter table public.shop_purchases enable row level security;
drop policy if exists "shop_purchases_anon" on public.shop_purchases;
drop policy if exists "shop_purchases_auth" on public.shop_purchases;
create policy "shop_purchases_anon" on public.shop_purchases for all to anon using (true) with check (true);
create policy "shop_purchases_auth" on public.shop_purchases for all to authenticated using (true) with check (true);

-- ── Sprzedaż: blokada wiersza + sprawdzenie stanu, żeby nie przesprzedać ─────
drop function if exists public.shop_sell(uuid, integer, text, text, text);
create or replace function public.shop_sell(
  p_item_id uuid,
  p_qty     integer,
  p_payment text default 'gotowka',
  p_shift   text default null,
  p_by      text default null
) returns public.shop_sales
language plpgsql security definer set search_path = public as $$
declare it public.shop_items; s public.shop_sales;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Ilość musi być dodatnia';
  end if;
  select * into it from public.shop_items where id = p_item_id for update;
  if not found then raise exception 'Produkt nie istnieje'; end if;
  if it.stock < p_qty then raise exception 'Za mało na stanie (dostępne: %)', it.stock; end if;
  update public.shop_items set stock = stock - p_qty, updated_at = now() where id = p_item_id;
  insert into public.shop_sales(tenant_id, item_id, name, qty, unit_price, total, payment, shift, by)
    values (it.tenant_id, it.id, it.name, p_qty, it.price, it.price * p_qty, coalesce(p_payment,'gotowka'), p_shift, p_by)
    returning * into s;
  return s;
end $$;
grant execute on function public.shop_sell(uuid, integer, text, text, text) to anon, authenticated;

-- ── Storno: przywraca stan, dopisuje wiersz ujemny (nigdy nie edytuje oryginału,
-- żeby raport z danego dnia zawsze odtwarzał się identycznie) ───────────────
drop function if exists public.shop_storno(uuid, text);
create or replace function public.shop_storno(
  p_sale_id uuid,
  p_by      text default null
) returns public.shop_sales
language plpgsql security definer set search_path = public as $$
declare orig public.shop_sales; s public.shop_sales;
begin
  select * into orig from public.shop_sales where id = p_sale_id for update;
  if not found then raise exception 'Sprzedaż nie istnieje'; end if;
  if orig.qty < 0 then raise exception 'To już jest storno'; end if;
  update public.shop_items set stock = stock + orig.qty, updated_at = now() where id = orig.item_id;
  insert into public.shop_sales(tenant_id, item_id, name, qty, unit_price, total, payment, shift, by)
    values (orig.tenant_id, orig.item_id, orig.name, -orig.qty, orig.unit_price, -orig.total, orig.payment, orig.shift, p_by)
    returning * into s;
  return s;
end $$;
grant execute on function public.shop_storno(uuid, text) to anon, authenticated;

-- ── Zakupy (Zakupy = wyłącznie menedżer, egzekwowane w UI): przyjęcie towaru,
-- podbija stan magazynowy. Osobny log od sprzedaży (koszt vs cena sprzedaży). ─
drop function if exists public.shop_purchase(uuid, integer, numeric, text);
create or replace function public.shop_purchase(
  p_item_id   uuid,
  p_qty       integer,
  p_unit_cost numeric default null,
  p_by        text default null
) returns public.shop_purchases
language plpgsql security definer set search_path = public as $$
declare it public.shop_items; pr public.shop_purchases;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Ilość musi być dodatnia';
  end if;
  select * into it from public.shop_items where id = p_item_id for update;
  if not found then raise exception 'Produkt nie istnieje'; end if;
  update public.shop_items set stock = stock + p_qty, updated_at = now() where id = p_item_id;
  insert into public.shop_purchases(tenant_id, item_id, name, qty, unit_cost, by)
    values (it.tenant_id, it.id, it.name, p_qty, p_unit_cost, p_by)
    returning * into pr;
  return pr;
end $$;
grant execute on function public.shop_purchase(uuid, integer, numeric, text) to anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='shop_items') then
    alter publication supabase_realtime add table public.shop_items;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='shop_sales') then
    alter publication supabase_realtime add table public.shop_sales;
  end if;
end $$;
