-- JIUZE POS — Allow payment for audited printed orders when the legacy reservation row is missing.
-- Keep owner-only payment, business/order status, print audit, item/product/price checks,
-- complete_sale validation, and payment attribution unchanged.
-- The print-lock table remains in use for order-content protection; it is not a payment prerequisite.

begin;

create or replace function public.complete_restaurant_order(
  p_order_id uuid,
  p_payment_method text,
  p_payment_amount numeric,
  p_payment_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_discount numeric(12,2);
  v_status text;
  v_items jsonb;
  v_sale jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  if not public.is_owner() then
    raise exception 'Only the business owner can record restaurant payments.'
      using errcode = '42501';
  end if;

  select o.business_id, o.discount, o.status
    into v_business_id, v_discount, v_status
    from public.restaurant_orders o
   where o.id = p_order_id
   for update;

  if v_business_id is null then
    raise exception 'Restaurant order not found.';
  end if;

  if v_business_id <> public.auth_business_id() then
    raise exception 'Restaurant order does not belong to your business.';
  end if;

  if v_status <> 'open' then
    raise exception 'Only open restaurant orders can be paid.';
  end if;

  -- A successful order-slip print is the payment prerequisite.
  -- Do not require restaurant_order_print_locks: older or partially recorded
  -- print workflows can leave a valid immutable print audit without that row.
  if not exists (
    select 1
    from public.restaurant_order_prints pr
    where pr.order_id = p_order_id
      and pr.business_id = v_business_id
      and pr.print_type = 'order_slip'
  ) then
    raise exception 'A successful order-slip print is required before taking payment.';
  end if;

  if not exists (
    select 1 from public.restaurant_order_items i where i.order_id = p_order_id
  ) then
    raise exception 'Restaurant order has no items.';
  end if;

  if exists (
    select 1
    from public.restaurant_order_items i
    left join public.products p
      on p.id = i.product_id
     and p.business_id = v_business_id
    where i.order_id = p_order_id
      and (i.product_id is null or p.id is null or p.is_active = false)
  ) then
    raise exception 'One or more products in this order are no longer available.';
  end if;

  if exists (
    select 1
    from public.restaurant_order_items i
    join public.products p on p.id = i.product_id
    where i.order_id = p_order_id
      and p.selling_price <> i.unit_price
  ) then
    raise exception 'One or more product prices changed after this order was opened. Refresh the order before taking payment.';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'product_id', i.product_id,
      'quantity', i.quantity
    )
    order by i.created_at, i.id
  )
    into v_items
    from public.restaurant_order_items i
   where i.order_id = p_order_id;

  v_sale := public.complete_sale(
    v_items,
    p_payment_method,
    p_payment_amount,
    p_payment_reference,
    v_discount
  );

  update public.restaurant_orders
     set status = 'paid',
         sale_id = (v_sale->>'sale_id')::uuid,
         paid_by = v_user_id,
         paid_at = now(),
         updated_at = now()
   where id = p_order_id;

  return v_sale;
end;
$$;

revoke all on function public.complete_restaurant_order(uuid, text, numeric, text)
  from public, anon;
grant execute on function public.complete_restaurant_order(uuid, text, numeric, text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
