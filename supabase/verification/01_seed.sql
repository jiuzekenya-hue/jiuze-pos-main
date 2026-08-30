-- Phase 3 live verification — seed data.
-- Run as postgres (default in the SQL Editor).
--
-- >>> BEFORE RUNNING: replace all 4 placeholders below with the real
-- >>> auth user UUIDs created in Step 2 (owner-a, cashier-a, owner-b,
-- >>> cashier-b). If you forget one, this script will fail with
-- >>> "invalid input syntax for type uuid" rather than inserting bad
-- >>> data — that's expected and just means a placeholder was missed.
--
-- Everything else below (business/category/product IDs) is a fixed,
-- self-contained test value and does not need editing.

insert into public.businesses (id, name, currency) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Verify Business A', 'KES'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Verify Business B', 'KES');

insert into public.profiles (id, business_id, full_name, role) values
  ('<OWNER-A-UUID>',   'aaaaaaaa-0000-0000-0000-000000000001', 'Owner A',   'owner'),
  ('<CASHIER-A-UUID>', 'aaaaaaaa-0000-0000-0000-000000000001', 'Cashier A', 'cashier'),
  ('<OWNER-B-UUID>',   'bbbbbbbb-0000-0000-0000-000000000001', 'Owner B',   'owner'),
  ('<CASHIER-B-UUID>', 'bbbbbbbb-0000-0000-0000-000000000001', 'Cashier B', 'cashier');

insert into public.categories (id, business_id, name) values
  ('caaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Beverages'),
  ('cbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Beverages');

insert into public.products
  (id, business_id, category_id, name, sku, barcode, cost_price, selling_price, stock_quantity, minimum_stock)
values
  ('faaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'caaaaaaa-0000-0000-0000-000000000001', 'Soda 500ml', 'VERIFY-SODA', '6009900000001', 55, 70, 20, 5),
  ('faaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   'caaaaaaa-0000-0000-0000-000000000001', 'Bread Loaf', 'VERIFY-BREAD', null, 60, 80, 3, 5),
  ('fbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
   'cbbbbbbb-0000-0000-0000-000000000001', 'Soda 500ml', 'VERIFY-SODA', '6009900000002', 55, 70, 15, 5);

select 'seed complete' as status;
