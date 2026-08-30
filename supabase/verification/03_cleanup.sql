-- Phase 3 live verification — cleanup.
-- Run as postgres. Deleting the two businesses cascades to their
-- profiles, categories, products, sales, sale_items, payments,
-- stock_movements, and settings via foreign keys.

delete from public.businesses where id in (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000001'
);

select 'cleanup complete — now delete the 4 test auth users via Dashboard -> Authentication -> Users' as status;
