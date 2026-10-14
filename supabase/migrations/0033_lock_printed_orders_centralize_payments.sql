-- JIUZE POS
-- Migration 0033: Lock printed orders and centralize payments.
-- Review before applying to Supabase.

-- ============================================================
-- 1. LOCK PRINTED ORDERS AGAINST CASHIER CHANGES
-- ============================================================

create or replace function public.guard_printed_restaurant_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_second_order_id uuid;
begin
  if tg_table_name = 'restaurant_orders' then
    v_order_id := old.id;
  elsif tg_op = 'INSERT' then
    v_order_id := new.order_id;
  elsif tg_op = 'DELETE' then
    v_order_id := old.order_id;
  else
    v_order_id := old.order_id;
    v_second_order_id := new.order_id;
  end if;

  if not public.is_owner() and exists (
    select 1
    from public.restaurant_order_prints pr
    where pr.print_type = 'order_slip'
      and pr.order_id in (v_order_id, v_second_order_id)
  ) then
    raise exception
      'This order has been printed and is locked. Ask the owner to make changes.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_printed_restaurant_order_update
  on public.restaurant_orders;

drop trigger if exists guard_printed_restaurant_order_delete
  on public.restaurant_orders;

create trigger guard_printed_restaurant_order_update
before update on public.restaurant_orders
for each row
execute function public.guard_printed_restaurant_order();

create trigger guard_printed_restaurant_order_delete
before delete on public.restaurant_orders
for each row
execute function public.guard_printed_restaurant_order();

drop trigger if exists guard_printed_restaurant_order_items
  on public.restaurant_order_items;

create trigger guard_printed_restaurant_order_items
before insert or update or delete on public.restaurant_order_items
for each row
execute function public.guard_printed_restaurant_order();


-- ============================================================
-- 3. CASHIERS CANNOT CLEAR PRINTED ORDERS
-- Owners can clear them with a recorded reason.
-- ============================================================

create or replace function public.clear_restaurant_order(
  p_order_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_created_by uuid;
  v_status text;
  v_reason text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.'
      using errcode = '28000';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  if v_reason is null then
    raise exception
      'A reason is required when clearing an order.';
  end if;

  select business_id, created_by, status
    into v_business_id, v_created_by, v_status
    from public.restaurant_orders
   where id = p_order_id
   for update;

  if v_business_id is null then
    raise exception 'Restaurant order not found.';
  end if;

  if v_business_id <> public.auth_business_id() then
    raise exception
      'Restaurant order does not belong to your business.';
  end if;

  if v_status <> 'open' then
    raise exception 'Only open orders can be cleared.';
  end if;

  if not public.is_owner() then
    raise exception
      'Only the business owner can clear restaurant orders.'
      using errcode = '42501';
  end if;

  update public.restaurant_orders
     set status = 'cancelled',
         cleared_by = v_user_id,
         cleared_at = now(),
         clear_reason = v_reason,
         updated_at = now()
   where id = p_order_id;
end;
$$;

revoke all
on function public.clear_restaurant_order(uuid, text)
from public, anon;

grant execute
on function public.clear_restaurant_order(uuid, text)
to authenticated;

notify pgrst, 'reload schema';