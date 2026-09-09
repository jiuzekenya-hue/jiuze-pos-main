-- JIUZE POS — Migration 15
-- Protect stock quantity from direct product edits.
--
-- Stock is an audited operational value. Customer-facing product edits may
-- change catalogue details such as name, SKU and prices, but stock changes
-- must go through the dedicated transactional stock/sales functions so a
-- stock_movements record is created at the same time.
--
-- Trusted SECURITY DEFINER database functions (owned by postgres) are still
-- allowed to change stock. The service role is also trusted for backend
-- provisioning/administration. Normal authenticated users are blocked from
-- changing products.stock_quantity directly.

create or replace function public.prevent_direct_stock_quantity_update()
returns trigger
language plpgsql
as $$
begin
  if new.stock_quantity is distinct from old.stock_quantity
     and current_user not in ('postgres', 'service_role') then
    raise exception
      'Stock quantity cannot be changed through product editing. Use Adjust Stock or complete a sale.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all
on function public.prevent_direct_stock_quantity_update()
from public;

drop trigger if exists products_prevent_direct_stock_quantity_update
on public.products;

create trigger products_prevent_direct_stock_quantity_update
before update of stock_quantity on public.products
for each row
execute function public.prevent_direct_stock_quantity_update();
