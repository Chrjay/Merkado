-- MerkaDo self-checking SQL tests (Architecture v2 §11, SQL-level rows; CONTRACT §2).
-- Each check raises an exception on failure and `PASS: …` notices on success.
-- Run after stub.sql (local only) → schema.sql → seed_products.sql, via `npm run db:test`.
-- Writes test data and commits it: run only on a throwaway database / test project, never on the main project.
-- Users are simulated with `set local role …` + `set local request.jwt.claim.sub = …` inside transactions.

-- ---------------------------------------------------------------------------
-- Helpers and fixtures (as the database owner)
-- ---------------------------------------------------------------------------

create schema if not exists merkado_test;
grant usage on schema merkado_test to public;

create or replace function merkado_test.ok(cond boolean, msg text) returns void
language plpgsql as $$
begin
  if cond is distinct from true then
    raise exception 'FAIL: %', msg;
  end if;
  raise notice 'PASS: %', msg;
end
$$;
grant execute on function merkado_test.ok(boolean, text) to public;

-- Runs a statement and reports whether it was refused with 42501 (permission / RLS).
create or replace function merkado_test.denied(stmt text) returns boolean
language plpgsql as $$
begin
  execute stmt;
  return false;
exception when insufficient_privilege then
  return true;
end
$$;
grant execute on function merkado_test.denied(text) to public;

-- Runs a statement and returns the SQLSTATE it raised (null if none).
create or replace function merkado_test.errcode_of(stmt text) returns text
language plpgsql as $$
begin
  execute stmt;
  return null;
exception when others then
  return sqlstate;
end
$$;
grant execute on function merkado_test.errcode_of(text) to public;

-- Reason for one event in a submit_events result.
create or replace function merkado_test.reason(r jsonb, id text) returns text
language sql immutable as $$
  select x ->> 'reason' from jsonb_array_elements(r -> 'rejected') x where x ->> 'id' = id
$$;
grant execute on function merkado_test.reason(jsonb, text) to public;

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),  -- store owner
  ('22222222-2222-2222-2222-222222222222');  -- logged in, not a store user
insert into public.store_users (user_id, role) values
  ('11111111-1111-1111-1111-111111111111', 'owner');
insert into public.products (product, unit, pack_multiplier, price, sort_order, active)
values ('Test Inactive Item', 'pc', 1, 1.00, 998, false);

do $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_pandesal int := (select product_id from public.products where product = 'Pandesal' and unit = 'pc');
begin
  perform set_config('test.today', v_today::text, false);
  perform set_config('test.pandesal', v_pandesal::text, false);
  perform set_config('test.egg', (select product_id from public.products where product = 'Egg' and unit = 'pc')::text, false);
  perform set_config('test.shampoo_banig', (select product_id from public.products where product = 'Shampoo Sachet' and unit = 'banig')::text, false);
  perform set_config('test.inactive', (select product_id from public.products where product = 'Test Inactive Item')::text, false);

  -- Old sales for the 2-day RLS window, inserted directly by the database owner.
  insert into public.sales (trans_id, sale_date, sale_time, payment, device_id) values
    ('S-OLD-10', v_today - 10, '08:00:00', 'Cash', 'phone-1'),
    ('S-OLD-2',  v_today - 2,  '08:00:00', 'Cash', 'phone-1'),
    ('S-OLD-1',  v_today - 1,  '08:00:00', 'Cash', 'phone-1');
  insert into public.sale_items (trans_id, line_no, product_id, qty, unit_price) values
    ('S-OLD-10', 1, v_pandesal, 1, 3), ('S-OLD-2', 1, v_pandesal, 1, 3), ('S-OLD-1', 1, v_pandesal, 1, 3);

  perform merkado_test.ok((select count(*) from public.products where active) = 25, 'seed: 25 active products (22 pc + 3 packs)');
end
$$;

-- ---------------------------------------------------------------------------
-- 1. Offline batch of 10 sales accepted
-- ---------------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare b jsonb; r jsonb;
begin
  select jsonb_agg(jsonb_build_object(
           'id', 'S-T1-' || lpad(g::text, 2, '0'), 'type', 'sale',
           'date', current_setting('test.today'), 'time', '06:00:' || lpad(g::text, 2, '0'),
           'device_id', 'phone-1', 'payment', (array['Cash','GCash','Utang'])[1 + g % 3],
           'items', jsonb_build_array(
             jsonb_build_object('product_id', current_setting('test.pandesal')::int, 'qty', 2, 'unit_price', null),
             jsonb_build_object('product_id', current_setting('test.egg')::int, 'qty', 1, 'unit_price', 9.00))))
    into b from generate_series(1, 10) g;
  perform set_config('test.batch1', b::text, false);
  r := public.submit_events(b);
  perform merkado_test.ok(jsonb_array_length(r -> 'accepted') = 10, 'batch of 10 sales: 10 accepted');
  perform merkado_test.ok(r -> 'duplicates' = '[]' and r -> 'rejected' = '[]', 'batch of 10 sales: no duplicates/rejections');
  perform merkado_test.ok(r ? 'server_time' and (r ->> 'server_time')::timestamptz is not null, 'result has ISO server_time');
  perform merkado_test.ok((select array_agg(k order by k) from jsonb_object_keys(r) k) = array['accepted','duplicates','rejected','server_time'],
                          'result has exactly accepted/duplicates/rejected/server_time');
end
$$;
commit;

do $$
begin
  perform merkado_test.ok((select count(*) from public.sales where trans_id like 'S-T1-%') = 10, 'batch: 10 rows in sales');
  perform merkado_test.ok((select count(*) from public.sale_items where trans_id like 'S-T1-%') = 20, 'batch: 20 rows in sale_items');
  perform merkado_test.ok((select count(*) from reporting.v_sales_log where "Trans_ID" like 'S-T1-%') = 20, 'batch: 20 lines in v_sales_log');
  perform merkado_test.ok((select array_agg(line_no order by line_no) from public.sale_items where trans_id = 'S-T1-01') = array[1,2]::smallint[],
                          'line_no is the 1-based item index');
  perform merkado_test.ok((select unit_price from public.sale_items where trans_id = 'S-T1-01' and line_no = 1) = 3.00,
                          'null unit_price falls back to products.price');
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Same batch resent: all duplicates, counts unchanged
-- ---------------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare r jsonb;
begin
  r := public.submit_events(current_setting('test.batch1')::jsonb);
  perform merkado_test.ok(jsonb_array_length(r -> 'duplicates') = 10 and r -> 'accepted' = '[]' and r -> 'rejected' = '[]',
                          'resent batch: all 10 are duplicates');
end
$$;
commit;

do $$
begin
  perform merkado_test.ok((select count(*) from public.sales where trans_id like 'S-T1-%') = 10
                      and (select count(*) from public.sale_items where trans_id like 'S-T1-%') = 20,
                          'resent batch: counts unchanged');
end
$$;

-- ---------------------------------------------------------------------------
-- 3. One sale with an inactive product: only that sale rejected, nothing of it saved
-- ---------------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare r jsonb; p int := current_setting('test.pandesal')::int; t text := current_setting('test.today');
begin
  r := public.submit_events(jsonb_build_array(
    jsonb_build_object('id','S-T3-1','type','sale','date',t,'time','07:00:00','device_id','phone-1','payment','Cash',
                       'items', jsonb_build_array(jsonb_build_object('product_id',p,'qty',1,'unit_price',3))),
    jsonb_build_object('id','S-T3-2','type','sale','date',t,'time','07:01:00','device_id','phone-1','payment','Cash',
                       'items', jsonb_build_array(jsonb_build_object('product_id',p,'qty',1,'unit_price',3),
                                                  jsonb_build_object('product_id',current_setting('test.inactive')::int,'qty',1,'unit_price',1))),
    jsonb_build_object('id','S-T3-3','type','sale','date',t,'time','07:02:00','device_id','phone-1','payment','GCash',
                       'items', jsonb_build_array(jsonb_build_object('product_id',p,'qty',3,'unit_price',3)))));
  perform merkado_test.ok(r -> 'accepted' = '["S-T3-1","S-T3-3"]', 'mixed batch: other sales accepted');
  perform merkado_test.ok(r -> 'rejected' = '[{"id":"S-T3-2","reason":"product not active"}]', 'mixed batch: inactive-product sale rejected with "product not active"');
end
$$;
commit;

do $$
begin
  perform merkado_test.ok(not exists (select 1 from public.sales where trans_id = 'S-T3-2')
                      and not exists (select 1 from public.sale_items where trans_id = 'S-T3-2'),
                          'rejected sale: no header and no lines saved');
  perform merkado_test.ok((select count(*) from public.sale_items where trans_id in ('S-T3-1','S-T3-3')) = 2, 'accepted sales of mixed batch saved');
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Bad values → exact reason strings; bad batch shape → 22023
-- ---------------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare r jsonb; p int := current_setting('test.pandesal')::int; t text := current_setting('test.today');
  base jsonb := jsonb_build_object('type','sale','date',t,'time','08:00:00','device_id','phone-1','payment','Cash');
  line jsonb := jsonb_build_object('product_id',p,'qty',1,'unit_price',3);
begin
  r := public.submit_events(jsonb_build_array(
    base || jsonb_build_object('id','B-qty0','items',jsonb_build_array(line || '{"qty":0}')),
    base || jsonb_build_object('id','B-qtyneg','items',jsonb_build_array(line || '{"qty":-2}')),
    base || jsonb_build_object('id','B-qtyfrac','items',jsonb_build_array(line || '{"qty":1.5}')),
    base || jsonb_build_object('id','B-qtystr','items',jsonb_build_array(line || '{"qty":"2"}')),
    base || jsonb_build_object('id','B-pay','payment','Card','items',jsonb_build_array(line)),
    base || jsonb_build_object('id','B-empty','items','[]'::jsonb),
    (base || jsonb_build_object('id','B-noitems')),
    base || jsonb_build_object('id','B-prod','items',jsonb_build_array(line || '{"product_id":999999}')),
    base || jsonb_build_object('id','B-date','date','2026-13-40','items',jsonb_build_array(line)),
    base || jsonb_build_object('id','B-time','time','6:00','items',jsonb_build_array(line)),
    base || jsonb_build_object('id','B-type','type','refund'),
    jsonb_build_object('id','B-notype','date',t,'time','08:00:00'),
    jsonb_build_object('id','B-count','type','stock_count','date',t,'time','08:00:00','product_id',p,'count',-1),
    jsonb_build_object('id','B-stockprod','type','stockout','date',t,'time','08:00:00','product_id',999999),
    jsonb_build_object('id','B-void','type','void','date',t,'time','08:00:00','trans_id','S-NOPE')));
  perform merkado_test.ok(r -> 'accepted' = '[]' and r -> 'duplicates' = '[]', 'bad values: nothing accepted');
  perform merkado_test.ok(merkado_test.reason(r,'B-qty0') = 'invalid quantity', 'qty 0 → invalid quantity');
  perform merkado_test.ok(merkado_test.reason(r,'B-qtyneg') = 'invalid quantity', 'qty -2 → invalid quantity');
  perform merkado_test.ok(merkado_test.reason(r,'B-qtyfrac') = 'invalid quantity', 'qty 1.5 → invalid quantity');
  perform merkado_test.ok(merkado_test.reason(r,'B-qtystr') = 'invalid quantity', 'qty as string → invalid quantity');
  perform merkado_test.ok(merkado_test.reason(r,'B-pay') = 'invalid payment', 'unknown payment → invalid payment');
  perform merkado_test.ok(merkado_test.reason(r,'B-empty') = 'sale has no items', 'empty items → sale has no items');
  perform merkado_test.ok(merkado_test.reason(r,'B-noitems') = 'sale has no items', 'missing items → sale has no items');
  perform merkado_test.ok(merkado_test.reason(r,'B-prod') = 'unknown product', 'unknown product_id → unknown product');
  perform merkado_test.ok(merkado_test.reason(r,'B-date') = 'invalid date or time', 'bad date → invalid date or time');
  perform merkado_test.ok(merkado_test.reason(r,'B-time') = 'invalid date or time', 'bad time → invalid date or time');
  perform merkado_test.ok(merkado_test.reason(r,'B-type') = 'unknown event type', 'unknown type → unknown event type');
  perform merkado_test.ok(merkado_test.reason(r,'B-notype') = 'unknown event type', 'missing type → unknown event type');
  perform merkado_test.ok(merkado_test.reason(r,'B-count') = 'invalid count', 'stock count -1 → invalid count');
  perform merkado_test.ok(merkado_test.reason(r,'B-stockprod') = 'unknown product', 'stockout of unknown product → unknown product');
  perform merkado_test.ok(merkado_test.reason(r,'B-void') = 'sale not found', 'void of unknown sale → sale not found');
  perform merkado_test.ok(jsonb_array_length(r -> 'rejected') = 15, 'bad values: all 15 rejected');

  perform merkado_test.ok(merkado_test.errcode_of($q$select public.submit_events('{"id":"x"}'::jsonb)$q$) = '22023', 'non-array p_events → 22023');
  perform merkado_test.ok(merkado_test.errcode_of($q$select public.submit_events(null)$q$) = '22023', 'null p_events → 22023');
  perform merkado_test.ok(merkado_test.errcode_of(
    $q$select public.submit_events((select jsonb_agg(jsonb_build_object('id','X-'||g,'type','rainy')) from generate_series(1,201) g))$q$) = '22023',
    '201 events → 22023');
end
$$;
commit;

do $$
begin
  perform merkado_test.ok(not exists (select 1 from public.sales where trans_id like 'B-%')
                      and not exists (select 1 from public.stock_counts where event_id like 'B-%')
                      and not exists (select 1 from public.day_events where event_id like 'B-%' or event_id like 'X-%'),
                          'bad values: nothing saved');
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Void via event and via void_sale
-- ---------------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare r jsonb; t text := current_setting('test.today');
  v jsonb := jsonb_build_array(jsonb_build_object('id','E-V1','type','void','date',t,'time','09:00:00','device_id','phone-1','trans_id','S-T1-01'));
begin
  r := public.submit_events(v);
  perform merkado_test.ok(r -> 'accepted' = '["E-V1"]', 'void event accepted');
  r := public.submit_events(v);
  perform merkado_test.ok(r -> 'accepted' = '["E-V1"]', 'void of already voided sale accepted (idempotent)');
  perform merkado_test.ok(public.void_sale('S-T1-02') = true, 'void_sale on existing sale → true');
  perform merkado_test.ok(public.void_sale('S-T1-02') = true, 'void_sale again → true');
  perform merkado_test.ok(public.void_sale('S-NOPE') = false, 'void_sale on unknown sale → false');
end
$$;
commit;

do $$
begin
  perform merkado_test.ok((select bool_and(voided and voided_at is not null) from public.sales where trans_id in ('S-T1-01','S-T1-02')),
                          'voided sales have voided = true and voided_at set');
  perform merkado_test.ok(not exists (select 1 from reporting.v_sales_log where "Trans_ID" in ('S-T1-01','S-T1-02')),
                          'voided sales missing from reporting.v_sales_log');
  perform merkado_test.ok((select count(*) from reporting.raw_sale_items where trans_id in ('S-T1-01','S-T1-02')) = 4,
                          'voided sales kept (never deleted), visible in raw views');
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Pack sale and 7. day events / stock counts
-- ---------------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare r jsonb; t text := current_setting('test.today'); egg int := current_setting('test.egg')::int;
  ev jsonb;
begin
  r := public.submit_events(jsonb_build_array(jsonb_build_object(
    'id','S-PACK','type','sale','date',t,'time','10:00:00','device_id','phone-1','payment','Utang',
    'items', jsonb_build_array(jsonb_build_object('product_id',current_setting('test.shampoo_banig')::int,'qty',1,'unit_price',null)))));
  perform merkado_test.ok(r -> 'accepted' = '["S-PACK"]', 'pack sale accepted');

  ev := jsonb_build_array(
    jsonb_build_object('id','E-SO','type','stockout','date',t,'time','11:00:00','device_id','phone-1','product_id',egg),
    jsonb_build_object('id','E-RAIN','type','rainy','date',t,'time','11:01:00','device_id','phone-1'),
    jsonb_build_object('id','E-CLOSED','type','closed','date',t,'time','11:02:00','device_id','phone-1'),
    jsonb_build_object('id','E-SC1','type','stock_count','date',t,'time','11:03:00','device_id','phone-1','product_id',egg,'count',14),
    jsonb_build_object('id','E-SC2','type','stock_count','date',t,'time','18:00:00','device_id','phone-1','product_id',egg,'count',10),
    jsonb_build_object('id','E-SC0','type','stock_count','date',t,'time','18:00:00','device_id','phone-1','product_id',current_setting('test.pandesal')::int,'count',0));
  r := public.submit_events(ev);
  perform merkado_test.ok(jsonb_array_length(r -> 'accepted') = 6 and r -> 'rejected' = '[]', 'day events + stock counts accepted');
  r := public.submit_events(ev);
  perform merkado_test.ok(jsonb_array_length(r -> 'duplicates') = 6, 'resent day events + stock counts are duplicates');
end
$$;
commit;

do $$
declare egg int := current_setting('test.egg')::int;
begin
  perform merkado_test.ok((select "Pack_Multiplier" = 12 and "Unit" = 'banig' and "Qty" = 1 and "UnitPrice" = 96.00
                             from reporting.v_sales_log where "Trans_ID" = 'S-PACK'),
                          'pack sale in v_sales_log with Pack_Multiplier 12, unit banig, price 96');
  perform merkado_test.ok((select count(*) from public.day_events where event_id in ('E-SO','E-RAIN','E-CLOSED')) = 3, 'day events in day_events');
  perform merkado_test.ok((select "Product" = 'Egg' and "Unit" = 'pc' from reporting.v_day_events where "Type" = 'stockout'), 'v_day_events: stockout has product');
  perform merkado_test.ok((select bool_and("Product" is null and "Unit" is null) from reporting.v_day_events where "Type" in ('rainy','closed'))
                      and (select count(*) from reporting.v_day_events) = 3, 'v_day_events: rainy/closed have null product');
  perform merkado_test.ok((select count(*) from public.stock_counts where event_id like 'E-SC%') = 3, 'stock counts in stock_counts');
  perform merkado_test.ok((select "Count" = 10 and "Unit" = 'pc' and "Pack_Multiplier" = 1 from reporting.v_stock_latest where "Product" = 'Egg'),
                          'v_stock_latest: latest count per product');
  perform merkado_test.ok((select count(*) from reporting.v_stock_latest) = 2, 'v_stock_latest: one row per counted product');
  perform merkado_test.ok((select count(*) from reporting.v_products) = 26 and (select count(*) from reporting.v_products where not "Active") = 1,
                          'v_products lists all products including inactive');
end
$$;

-- ---------------------------------------------------------------------------
-- 8. Authenticated but not a store user
-- ---------------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare msg text; code text;
begin
  begin
    perform public.submit_events('[]'::jsonb);
  exception when others then msg := sqlerrm; code := sqlstate;
  end;
  perform merkado_test.ok(msg = 'not authorized' and code = '42501', 'non-store user: submit_events → not authorized (42501)');
  perform merkado_test.ok(merkado_test.denied($q$select public.void_sale('S-T1-03')$q$), 'non-store user: void_sale → not authorized');
  perform merkado_test.ok((select count(*) from public.products) = 0 and (select count(*) from public.sales) = 0
                      and (select count(*) from public.sale_items) = 0, 'non-store user: sees no rows');
end
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 9. anon: no table, view or function access
-- ---------------------------------------------------------------------------

begin;
set local role anon;
do $$
declare t text; n bigint;
begin
  foreach t in array array['products','sales','sale_items','day_events','stock_counts','store_users'] loop
    begin
      execute format('select count(*) from public.%I', t) into n;
    exception when insufficient_privilege then n := 0;
    end;
    perform merkado_test.ok(n = 0, format('anon: select on public.%s denied or empty', t));
    perform merkado_test.ok(merkado_test.denied(format('insert into public.%I default values', t)), format('anon: insert into public.%s denied', t));
    perform merkado_test.ok(merkado_test.denied(format('delete from public.%I', t)), format('anon: delete from public.%s denied', t));
    perform merkado_test.ok(merkado_test.denied(format('truncate public.%I cascade', t)), format('anon: truncate public.%s denied', t));
  end loop;
  perform merkado_test.ok(merkado_test.denied($q$select public.submit_events('[]'::jsonb)$q$), 'anon: submit_events not executable');
  perform merkado_test.ok(merkado_test.denied($q$select public.void_sale('S-T1-03')$q$), 'anon: void_sale not executable');
  perform merkado_test.ok(merkado_test.denied('select count(*) from reporting.v_sales_log'), 'anon: reporting views denied');
end
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 10. Owner: no direct writes, no reporting, active products, 2-day sales window
-- ---------------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare t text; v text;
begin
  foreach t in array array['products','sales','sale_items','day_events','stock_counts','store_users'] loop
    perform merkado_test.ok(merkado_test.denied(format('insert into public.%I default values', t)), format('owner: insert into public.%s denied', t));
    perform merkado_test.ok(merkado_test.denied(format('update public.%I set %I = %I', t,
              (select a.attname from pg_attribute a where a.attrelid = ('public.' || t)::regclass and a.attnum = 1),
              (select a.attname from pg_attribute a where a.attrelid = ('public.' || t)::regclass and a.attnum = 1))),
            format('owner: update public.%s denied', t));
    perform merkado_test.ok(merkado_test.denied(format('delete from public.%I', t)), format('owner: delete from public.%s denied', t));
    perform merkado_test.ok(merkado_test.denied(format('truncate public.%I cascade', t)), format('owner: truncate public.%s denied', t));
  end loop;
  foreach t in array array['day_events','stock_counts','store_users'] loop
    perform merkado_test.ok(merkado_test.denied(format('select count(*) from public.%I', t)), format('owner: select on public.%s denied', t));
  end loop;
  foreach v in array array['v_sales_log','v_day_events','v_stock_latest','v_products','raw_products','raw_sales','raw_sale_items','raw_day_events','raw_stock_counts'] loop
    perform merkado_test.ok(merkado_test.denied(format('select count(*) from reporting.%I', v)), format('owner: select on reporting.%s denied', v));
  end loop;
  perform merkado_test.ok(merkado_test.denied('select nextval(''public.products_product_id_seq'')'), 'owner: products sequence denied');

  perform merkado_test.ok((select count(*) from public.products) = 25 and (select bool_and(active) from public.products),
                          'owner: sees only the 25 active products');
  perform merkado_test.ok(exists (select 1 from public.sales where trans_id = 'S-OLD-1')
                      and exists (select 1 from public.sales where trans_id = 'S-T1-03'), 'owner: sees today''s and yesterday''s sales');
  perform merkado_test.ok(not exists (select 1 from public.sales where trans_id in ('S-OLD-2','S-OLD-10')), 'owner: older sales hidden');
  perform merkado_test.ok(exists (select 1 from public.sale_items where trans_id = 'S-OLD-1')
                      and not exists (select 1 from public.sale_items where trans_id in ('S-OLD-2','S-OLD-10')),
                          'owner: sale_items follow the same 2-day window');
end
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 11. merkado_reader: read reporting views only
-- ---------------------------------------------------------------------------

begin;
set local role merkado_reader;
do $$
declare t text; v text; n bigint;
begin
  foreach v in array array['v_sales_log','v_day_events','v_stock_latest','v_products','raw_products','raw_sales','raw_sale_items','raw_day_events','raw_stock_counts'] loop
    execute format('select count(*) from reporting.%I', v) into n;
    perform merkado_test.ok(n > 0, format('merkado_reader: select on reporting.%s works', v));
    -- joined views are not updatable at all (0A000/55000); single-table ones must hit 42501
    perform merkado_test.ok(merkado_test.errcode_of(format('delete from reporting.%I', v)) is not null
                        and not has_table_privilege('merkado_reader', format('reporting.%I', v), 'insert, update, delete'),
                            format('merkado_reader: writes via reporting.%s denied', v));
  end loop;
  perform merkado_test.ok(merkado_test.denied($q$insert into reporting.raw_products (product) values ('Hack')$q$), 'merkado_reader: insert via reporting view denied');
  perform merkado_test.ok(merkado_test.denied($q$update reporting.raw_sales set voided = true$q$), 'merkado_reader: update via reporting view denied');
  foreach t in array array['products','sales','sale_items','day_events','stock_counts','store_users'] loop
    perform merkado_test.ok(merkado_test.denied(format('select count(*) from public.%I', t)), format('merkado_reader: select on public.%s denied', t));
    perform merkado_test.ok(merkado_test.denied(format('insert into public.%I default values', t)), format('merkado_reader: insert into public.%s denied', t));
    perform merkado_test.ok(merkado_test.denied(format('update public.%I set %I = %I', t,
              (select a.attname from pg_attribute a where a.attrelid = ('public.' || t)::regclass and a.attnum = 1),
              (select a.attname from pg_attribute a where a.attrelid = ('public.' || t)::regclass and a.attnum = 1))),
            format('merkado_reader: update public.%s denied', t));
  end loop;
  perform merkado_test.ok(merkado_test.denied($q$select public.submit_events('[]'::jsonb)$q$), 'merkado_reader: submit_events not executable');
end
$$;
rollback;

-- ---------------------------------------------------------------------------
-- Grants sanity (catalog level)
-- ---------------------------------------------------------------------------

do $$
begin
  perform merkado_test.ok(not has_function_privilege('anon', 'public.submit_events(jsonb)', 'execute')
                      and not has_function_privilege('anon', 'public.void_sale(text)', 'execute')
                      and has_function_privilege('authenticated', 'public.submit_events(jsonb)', 'execute')
                      and has_function_privilege('authenticated', 'public.void_sale(text)', 'execute'),
                          'function execute: authenticated only');
  perform merkado_test.ok((select bool_and(relrowsecurity) from pg_class
                            where oid in ('public.products'::regclass, 'public.sales'::regclass, 'public.sale_items'::regclass,
                                          'public.day_events'::regclass, 'public.stock_counts'::regclass, 'public.store_users'::regclass)),
                          'RLS enabled on every table');
  perform merkado_test.ok(not exists (select 1 from pg_policies where schemaname = 'public' and cmd <> 'SELECT'),
                          'no insert/update/delete policies');
  perform merkado_test.ok(not has_schema_privilege('authenticated', 'reporting', 'usage')
                      and not has_schema_privilege('anon', 'reporting', 'usage'), 'reporting schema not usable by API roles');
  perform merkado_test.ok((select rolcanlogin from pg_roles where rolname = 'merkado_reader'), 'merkado_reader exists and can log in');
end
$$;

drop schema merkado_test cascade;
