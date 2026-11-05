-- MerkaDo database schema (Supabase / Postgres).
-- Run once in the Supabase SQL Editor on a fresh project, then seed_products.sql.
-- Authoritative interface: merkado-app/CONTRACT.md §2. Design: Architecture v2 §5 + Appendix A.
-- Re-running is safe (if not exists / create or replace / drop policy if exists).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.products (
  product_id serial primary key,
  product text not null check (product !~ '[()]'),
  unit text not null default 'pc',
  pack_multiplier int not null default 1 check (pack_multiplier > 0),
  price numeric(8,2) check (price >= 0),
  sort_order int not null default 999,
  active boolean not null default true,
  unique (product, unit)
);

create table if not exists public.sales (
  trans_id text primary key,
  sale_date date not null,
  sale_time time not null,
  payment text not null check (payment in ('Cash','GCash','Utang')),
  device_id text,
  received_at timestamptz not null default now(),
  voided boolean not null default false,
  voided_at timestamptz
);

create table if not exists public.sale_items (
  trans_id text not null references public.sales on delete restrict,
  line_no smallint not null,
  product_id int not null references public.products,
  qty int not null check (qty > 0),
  unit_price numeric(8,2),
  primary key (trans_id, line_no)
);

create table if not exists public.day_events (
  event_id text primary key,
  event_date date not null,
  event_time time not null,
  type text not null check (type in ('stockout','rainy','closed')),
  product_id int references public.products,
  device_id text,
  received_at timestamptz not null default now(),
  check (type <> 'stockout' or product_id is not null)
);

create table if not exists public.stock_counts (
  event_id text primary key,
  count_date date not null,
  count_time time not null,
  product_id int not null references public.products,
  count int not null check (count >= 0),
  device_id text,
  received_at timestamptz not null default now()
);

create table if not exists public.store_users (
  user_id uuid primary key references auth.users,
  role text not null check (role in ('owner','analyst'))
);

create index if not exists sale_items_product_id_idx on public.sale_items (product_id);
create index if not exists sales_sale_date_idx on public.sales (sale_date);
create index if not exists day_events_event_date_idx on public.day_events (event_date);
create index if not exists stock_counts_product_date_idx on public.stock_counts (product_id, count_date);

-- ---------------------------------------------------------------------------
-- Table privileges. Supabase default-grants ALL on new public tables to
-- anon/authenticated; take that back. TRUNCATE ignores RLS, so it must go too.
-- Owner/analyst keeps SELECT on the three tables the app reads (filtered by RLS).
-- All writes go through submit_events / void_sale (security definer).
-- ---------------------------------------------------------------------------

revoke all on table public.products, public.sales, public.sale_items,
                    public.day_events, public.stock_counts, public.store_users
  from public, anon, authenticated;
revoke all on sequence public.products_product_id_seq from public, anon, authenticated;
grant select on table public.products, public.sales, public.sale_items to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security (CONTRACT §2.3): read-only policies, no write policies.
-- ---------------------------------------------------------------------------

alter table public.products     enable row level security;
alter table public.sales        enable row level security;
alter table public.sale_items   enable row level security;
alter table public.day_events   enable row level security;
alter table public.stock_counts enable row level security;
alter table public.store_users  enable row level security;

-- store_users is unreadable to API roles, so policies check membership through
-- this security definer helper instead of a subquery.
create or replace function public.is_store_user() returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$ select exists (select 1 from public.store_users u where u.user_id = auth.uid()) $$;

revoke execute on function public.is_store_user() from public, anon;
grant execute on function public.is_store_user() to authenticated;

drop policy if exists owner_read_products on public.products;
create policy owner_read_products on public.products for select to authenticated
  using (active and (select public.is_store_user()));

drop policy if exists owner_read_sales on public.sales;
create policy owner_read_sales on public.sales for select to authenticated
  using ((select public.is_store_user())
         and sale_date >= (now() at time zone 'Asia/Manila')::date - 1);

drop policy if exists owner_read_sale_items on public.sale_items;
create policy owner_read_sale_items on public.sale_items for select to authenticated
  using ((select public.is_store_user())
         and exists (select 1 from public.sales s
                     where s.trans_id = sale_items.trans_id
                       and s.sale_date >= (now() at time zone 'Asia/Manila')::date - 1));

-- ---------------------------------------------------------------------------
-- submit_events (CONTRACT §2.1)
-- ---------------------------------------------------------------------------

create or replace function public.submit_events(p_events jsonb) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_accepted   jsonb := '[]'::jsonb;
  v_duplicates jsonb := '[]'::jsonb;
  v_rejected   jsonb := '[]'::jsonb;
  e            jsonb;
  item         jsonb;
  v_id         text;
  v_type       text;
  v_date       date;
  v_time       time;
  v_qty        int;
  v_count      int;
  v_line       int;
  v_pid        int;
  v_price      numeric(8,2);
  v_active     boolean;
  v_rows       int;
begin
  if not exists (select 1 from public.store_users u where u.user_id = auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'p_events must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_events) > 200 then
    raise exception 'too many events (max 200)' using errcode = '22023';
  end if;

  for e in select value from jsonb_array_elements(p_events) loop
    v_id := e ->> 'id';
    v_type := e ->> 'type';
    begin
      if v_type is null or v_type not in ('sale','stockout','rainy','closed','stock_count','void') then
        raise exception 'unknown event type';
      end if;

      if coalesce(e ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
         or coalesce(e ->> 'time', '') !~ '^\d{2}:\d{2}:\d{2}$' then
        raise exception 'invalid date or time';
      end if;
      begin
        v_date := (e ->> 'date')::date;
        v_time := (e ->> 'time')::time;
      exception when invalid_datetime_format or datetime_field_overflow then
        raise exception 'invalid date or time';
      end;

      if v_type = 'sale' then
        if coalesce(e ->> 'payment', '') not in ('Cash','GCash','Utang') then
          raise exception 'invalid payment';
        end if;
        if jsonb_typeof(e -> 'items') is distinct from 'array'
           or jsonb_array_length(e -> 'items') = 0 then
          raise exception 'sale has no items';
        end if;

        insert into public.sales (trans_id, sale_date, sale_time, payment, device_id)
        values (v_id, v_date, v_time, e ->> 'payment', e ->> 'device_id')
        on conflict (trans_id) do nothing;
        get diagnostics v_rows = row_count;

        if v_rows = 0 then
          v_duplicates := v_duplicates || jsonb_build_array(v_id);
        else
          v_line := 0;
          for item in select value from jsonb_array_elements(e -> 'items') loop
            v_line := v_line + 1;
            if jsonb_typeof(item -> 'product_id') is distinct from 'number'
               or (item ->> 'product_id') !~ '^\d{1,9}$' then
              raise exception 'unknown product';
            end if;
            select p.active, p.price into v_active, v_price
              from public.products p where p.product_id = (item ->> 'product_id')::int;
            if not found then
              raise exception 'unknown product';
            end if;
            if not v_active then
              raise exception 'product not active';
            end if;
            if jsonb_typeof(item -> 'qty') is distinct from 'number'
               or (item ->> 'qty') !~ '^\d{1,9}$' or (item ->> 'qty')::int <= 0 then
              raise exception 'invalid quantity';
            end if;
            v_qty := (item ->> 'qty')::int;
            insert into public.sale_items (trans_id, line_no, product_id, qty, unit_price)
            values (v_id, v_line, (item ->> 'product_id')::int, v_qty,
                    coalesce((item ->> 'unit_price')::numeric, v_price));
          end loop;
          v_accepted := v_accepted || jsonb_build_array(v_id);
        end if;

      elsif v_type in ('stockout','rainy','closed') then
        v_pid := null;
        if v_type = 'stockout' then
          if jsonb_typeof(e -> 'product_id') is distinct from 'number'
             or (e ->> 'product_id') !~ '^\d{1,9}$'
             or not exists (select 1 from public.products p where p.product_id = (e ->> 'product_id')::int) then
            raise exception 'unknown product';
          end if;
          v_pid := (e ->> 'product_id')::int;
        end if;
        insert into public.day_events (event_id, event_date, event_time, type, product_id, device_id)
        values (v_id, v_date, v_time, v_type, v_pid, e ->> 'device_id')
        on conflict (event_id) do nothing;
        get diagnostics v_rows = row_count;
        if v_rows = 0 then
          v_duplicates := v_duplicates || jsonb_build_array(v_id);
        else
          v_accepted := v_accepted || jsonb_build_array(v_id);
        end if;

      elsif v_type = 'stock_count' then
        if jsonb_typeof(e -> 'product_id') is distinct from 'number'
           or (e ->> 'product_id') !~ '^\d{1,9}$'
           or not exists (select 1 from public.products p where p.product_id = (e ->> 'product_id')::int) then
          raise exception 'unknown product';
        end if;
        if jsonb_typeof(e -> 'count') is distinct from 'number'
           or (e ->> 'count') !~ '^\d{1,9}$' then
          raise exception 'invalid count';
        end if;
        v_count := (e ->> 'count')::int;
        insert into public.stock_counts (event_id, count_date, count_time, product_id, count, device_id)
        values (v_id, v_date, v_time, (e ->> 'product_id')::int, v_count, e ->> 'device_id')
        on conflict (event_id) do nothing;
        get diagnostics v_rows = row_count;
        if v_rows = 0 then
          v_duplicates := v_duplicates || jsonb_build_array(v_id);
        else
          v_accepted := v_accepted || jsonb_build_array(v_id);
        end if;

      else -- void
        update public.sales
           set voided = true, voided_at = coalesce(voided_at, now())
         where trans_id = e ->> 'trans_id';
        if not found then
          raise exception 'sale not found';
        end if;
        v_accepted := v_accepted || jsonb_build_array(v_id);
      end if;

    exception when others then
      v_rejected := v_rejected || jsonb_build_array(jsonb_build_object('id', v_id, 'reason', sqlerrm));
    end;
  end loop;

  return jsonb_build_object(
    'accepted', v_accepted,
    'duplicates', v_duplicates,
    'rejected', v_rejected,
    'server_time', to_jsonb(now())
  );
end
$$;

-- ---------------------------------------------------------------------------
-- void_sale (CONTRACT §2.2)
-- ---------------------------------------------------------------------------

create or replace function public.void_sale(p_trans_id text) returns boolean
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.store_users u where u.user_id = auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.sales
     set voided = true, voided_at = coalesce(voided_at, now())
   where trans_id = p_trans_id;
  return found;
end
$$;

revoke execute on function public.submit_events(jsonb) from public, anon;
revoke execute on function public.void_sale(text) from public, anon;
grant execute on function public.submit_events(jsonb) to authenticated;
grant execute on function public.void_sale(text) to authenticated;

-- ---------------------------------------------------------------------------
-- reporting schema (CONTRACT §2.4). Not exposed through the API.
-- Views run with the owner's rights, so they see all rows; only
-- merkado_reader may read them.
-- ---------------------------------------------------------------------------

create schema if not exists reporting;
revoke all on schema reporting from public, anon, authenticated;

create or replace view reporting.v_sales_log as
select s.sale_date as "Date", s.sale_time as "Time", s.trans_id as "Trans_ID",
       p.product as "Product", p.unit as "Unit", i.qty as "Qty",
       i.unit_price as "UnitPrice", s.payment as "PaymentType",
       p.pack_multiplier as "Pack_Multiplier"
from public.sales s
join public.sale_items i using (trans_id)
join public.products p using (product_id)
where not s.voided;

create or replace view reporting.v_day_events as
select d.event_date as "Date", d.event_time as "Time", d.type as "Type",
       case when d.type = 'stockout' then p.product end as "Product",
       case when d.type = 'stockout' then p.unit end as "Unit"
from public.day_events d
left join public.products p using (product_id);

create or replace view reporting.v_stock_latest as
select p.product as "Product", p.unit as "Unit", c.count as "Count",
       p.pack_multiplier as "Pack_Multiplier", c.count_date as "Date"
from (select distinct on (product_id) product_id, count, count_date
        from public.stock_counts
       order by product_id, count_date desc, count_time desc, received_at desc) c
join public.products p using (product_id);

create or replace view reporting.v_products as
select product_id as "Product_ID", product as "Product", unit as "Unit",
       pack_multiplier as "Pack_Multiplier", price as "Price",
       sort_order as "Sort_Order", active as "Active"
from public.products;

create or replace view reporting.raw_products     as select * from public.products;
create or replace view reporting.raw_sales        as select * from public.sales;
create or replace view reporting.raw_sale_items   as select * from public.sale_items;
create or replace view reporting.raw_day_events   as select * from public.day_events;
create or replace view reporting.raw_stock_counts as select * from public.stock_counts;

revoke all on all tables in schema reporting from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- merkado_reader: read-only notebook role. Password is set in the dashboard
-- (alter role merkado_reader with password '…'), never in Git.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'merkado_reader') then
    create role merkado_reader login;
  end if;
end
$$;

grant usage on schema reporting to merkado_reader;
grant select on all tables in schema reporting to merkado_reader;
