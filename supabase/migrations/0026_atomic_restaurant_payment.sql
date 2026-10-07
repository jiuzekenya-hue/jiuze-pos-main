-- JIUZE POS — Atomic restaurant payment
-- Completes the sale and closes the restaurant order in one database transaction.
-- Also rejects price drift between the saved order snapshot and the current product price.

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
  v_created_by uuid;
  v_discount numeric(12,2);
  v_items jsonb;
  v_sale jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select business_id, created_by, discount
    into v_business_id, v_created_by, v_discount
    from public.restaurant_orders
   where id = p_order_id
     and status = 'open'
   for update;

  if v_business_id is null then
    raise exception 'Open restaurant order not found.';
  end if;

  if v_business_id <> public.auth_business_id() then
    raise exception 'Restaurant order does not belong to your business.';
  end if;

  if not public.is_owner() and v_created_by <> v_user_id then
    raise exception 'You can only pay your own restaurant orders.';
  end if;

  if not exists (
    select 1
      from public.restaurant_order_items i
     where i.order_id = p_order_id
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

  -- complete_sale() runs inside this same transaction. If closing the
  -- restaurant order below fails, the sale and stock changes roll back too.
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
         updated_at = now()
   where id = p_order_id;

  return v_sale;
end;
$$;

revoke all on function public.complete_restaurant_order(uuid, text, numeric, text) from public, anon;
grant execute on function public.complete_restaurant_order(uuid, text, numeric, text) to authenticated;

notify pgrst, 'reload schema';
