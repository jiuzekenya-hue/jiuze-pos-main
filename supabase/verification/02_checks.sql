-- Phase 3 live verification — checks.
--
-- >>> BEFORE RUNNING: replace all occurrences of <OWNER-A-UUID>,
-- >>> <CASHIER-A-UUID>, <OWNER-B-UUID>, and <CASHIER-B-UUID> in this
-- >>> file with the real auth user UUIDs from Step 2 (each appears
-- >>> multiple times — a find-and-replace across the whole file is
-- >>> easiest). An unreplaced placeholder will fail with "invalid
-- >>> input syntax for type uuid", which is expected and just means
-- >>> one was missed.
--
-- >>> RUN ONE NUMBERED SECTION AT A TIME (-- === N. ... === blocks),
-- >>> not the whole file in one go. Sections 5, 6, and 7 each contain
-- >>> a statement that is *expected* to raise an error (that's the
-- >>> check passing) — in the Supabase SQL Editor, an error aborts the
-- >>> rest of that execution, so anything after it in the same "Run"
-- >>> would silently not happen.
--
-- Each block is annotated with what result to expect.
--
-- IMPORTANT: the SQL Editor connects as the `postgres` superuser by
-- default, which bypasses RLS. `set role authenticated;` is what makes
-- RLS actually apply — every block below needs it.

-- =========================================================
-- 1. Owner A sees only Business A's data
-- =========================================================
set role authenticated;
set request.jwt.claims = '{"sub": "<OWNER-A-UUID>", "role": "authenticated"}';

select 'Owner A: businesses (expect 1 row, Business A)' as check;
select id, name from public.businesses;

select 'Owner A: products (expect 2 rows, both business A)' as check;
select name, business_id from public.products order by name;

select 'Owner A: profiles (expect 2 rows, both business A)' as check;
select full_name, role, business_id from public.profiles order by full_name;

reset role;

-- =========================================================
-- 2. Cross-tenant read/write rejection
-- =========================================================
set role authenticated;
set request.jwt.claims = '{"sub": "<OWNER-A-UUID>", "role": "authenticated"}';

select 'Owner A reads Business B by id (expect 0 rows)' as check;
select * from public.businesses where id = 'bbbbbbbb-0000-0000-0000-000000000001';

select 'Owner A updates Business B (expect UPDATE 0)' as check;
update public.businesses set name = 'HACKED' where id = 'bbbbbbbb-0000-0000-0000-000000000001';

select 'Owner A inserts a product into Business B (expect RLS error)' as check;
insert into public.products (business_id, name, selling_price)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'Malicious Product', 10);
-- ^ expected: ERROR: new row violates row-level security policy for table "products"

reset role;

-- =========================================================
-- 3. Cashier permissions (owner-only actions rejected, read-only OK)
-- =========================================================
set role authenticated;
set request.jwt.claims = '{"sub": "<CASHIER-A-UUID>", "role": "authenticated"}';

select 'Cashier A changes a product price (expect UPDATE 0)' as check;
update public.products set selling_price = 999 where id = 'faaaaaaa-0000-0000-0000-000000000001';

select 'Cashier A inserts a category (expect RLS error)' as check;
insert into public.categories (business_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Snacks');
-- ^ expected: ERROR: new row violates row-level security policy for table "categories"

reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "<CASHIER-A-UUID>", "role": "authenticated"}';

select 'Cashier A reads products (expect 2 rows — read access is fine)' as check;
select name, selling_price from public.products order by name;

select 'Cashier A reads stock_movements (expect 0 rows — owner-only view)' as check;
select * from public.stock_movements;

reset role;

-- =========================================================
-- 4. complete_sale() end-to-end
-- =========================================================
set role authenticated;
set request.jwt.claims = '{"sub": "<CASHIER-A-UUID>", "role": "authenticated"}';

select 'Cashier A completes a valid cash sale: 2 sodas @70, pays 150' as check;
select public.complete_sale(
  jsonb_build_array(jsonb_build_object('product_id', 'faaaaaaa-0000-0000-0000-000000000001', 'quantity', 2)),
  'cash', 150, null, 0
);
-- ^ expected: jsonb with total 140.00, change 10.00, status "completed"

select 'Stock decremented (expect 18)' as check;
select stock_quantity from public.products where id = 'faaaaaaa-0000-0000-0000-000000000001';

select 'Sale + payment recorded' as check;
select receipt_number, total, status from public.sales;
select method, amount from public.payments;

reset role;

set role authenticated;
set request.jwt.claims = '{"sub": "<OWNER-A-UUID>", "role": "authenticated"}';
select 'Stock movement recorded (as owner — stock_movements is owner-only)' as check;
select type, quantity, reason from public.stock_movements where product_id = 'faaaaaaa-0000-0000-0000-000000000001';
reset role;

-- =========================================================
-- 5. Insufficient-stock rejection + rollback
-- =========================================================
set role authenticated;
set request.jwt.claims = '{"sub": "<CASHIER-A-UUID>", "role": "authenticated"}';

select 'Insufficient stock: Bread has 3, request 5 (expect ERROR)' as check;
select public.complete_sale(
  jsonb_build_array(jsonb_build_object('product_id', 'faaaaaaa-0000-0000-0000-000000000002', 'quantity', 5)),
  'cash', 500, null, 0
);
-- ^ expected: ERROR: Insufficient stock for "Bread Loaf": only 3 available

reset role;

-- Run this as a fresh statement (previous one aborted the transaction):
set role authenticated;
set request.jwt.claims = '{"sub": "<CASHIER-A-UUID>", "role": "authenticated"}';
select 'No partial sale left behind (expect exactly 1 — only the earlier successful sale)' as check;
select count(*) from public.sales;
reset role;

-- =========================================================
-- 6. Inactive-product rejection
-- =========================================================
update public.products set is_active = false where id = 'faaaaaaa-0000-0000-0000-000000000002'; -- as postgres

set role authenticated;
set request.jwt.claims = '{"sub": "<CASHIER-A-UUID>", "role": "authenticated"}';
select 'Selling a deactivated product (expect ERROR)' as check;
select public.complete_sale(
  jsonb_build_array(jsonb_build_object('product_id', 'faaaaaaa-0000-0000-0000-000000000002', 'quantity', 1)),
  'cash', 100, null, 0
);
-- ^ expected: ERROR: Product "Bread Loaf" is not active and cannot be sold
reset role;

-- =========================================================
-- 7. Underpayment rejection
-- =========================================================
set role authenticated;
set request.jwt.claims = '{"sub": "<CASHIER-A-UUID>", "role": "authenticated"}';
select 'Underpayment: pay 50 for a 70 total (expect ERROR)' as check;
select public.complete_sale(
  jsonb_build_array(jsonb_build_object('product_id', 'faaaaaaa-0000-0000-0000-000000000001', 'quantity', 1)),
  'cash', 50, null, 0
);
-- ^ expected: ERROR: Amount received (50) is less than the total due (70.00)
reset role;

-- =========================================================
-- 8. Direct writes to sales/payments/stock_movements remain blocked
-- =========================================================
set role authenticated;
set request.jwt.claims = '{"sub": "<OWNER-A-UUID>", "role": "authenticated"}';

select 'Owner direct-INSERT into sales, bypassing complete_sale (expect permission denied)' as check;
insert into public.sales (business_id, receipt_number, cashier_id, subtotal, total)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'FAKE-001', '<OWNER-A-UUID>', 100, 100);
-- ^ expected: ERROR: permission denied for table sales

reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "<OWNER-A-UUID>", "role": "authenticated"}';

select 'Owner direct-INSERT into stock_movements (expect permission denied)' as check;
insert into public.stock_movements (business_id, product_id, type, quantity)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'faaaaaaa-0000-0000-0000-000000000001', 'adjustment', 999);
-- ^ expected: ERROR: permission denied for table stock_movements

reset role;
