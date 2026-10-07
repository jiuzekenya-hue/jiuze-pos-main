-- JIUZE POS — Track who actually processed restaurant payment
-- Separates the cashier who opened the order from the user who completed payment.

alter table public.restaurant_orders
  add column if not exists paid_by uuid references public.profiles(id),
  add column if not exists paid_at timestamptz;

create index if not exists restaurant_orders_paid_by_idx
  on public.restaurant_orders (paid_by)
  where paid_by is not null;

-- Backfill already-paid restaurant orders from the existing sale record.
update public.restaurant_orders ro
   set paid_by = s.cashier_id,
       paid_at = coalesce(ro.updated_at, s.created_at)
  from public.sales s
 where ro.sale_id = s.id
   and ro.status = 'paid'
   and ro.paid_by is null
   and s.cashier_id is not null;

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

revoke all on function public.complete_restaurant_order(uuid, text, numeric, text) from public, anon;
grant execute on function public.complete_restaurant_order(uuid, text, numeric, text) to authenticated;

notify pgrst, 'reload schema';


create or replace function public.list_recent_restaurant_orders(
  p_limit integer default 30
)
returns table (
  id uuid,
  order_number text,
  location_type text,
  table_number integer,
  status text,
  discount numeric,
  created_by uuid,
  created_by_name text,
  paid_by uuid,
  paid_by_name text,
  paid_at timestamptz,
  updated_at timestamptz,
  subtotal numeric,
  total numeric
)
language sql
security definer
stable
set search_path = public
as $$
  select
    o.id,
    o.order_number,
    o.location_type,
    o.table_number,
    o.status,
    o.discount,
    o.created_by,
    coalesce(cp.full_name, 'Unknown cashier'),
    o.paid_by,
    coalesce(pp.full_name, 'Not paid'),
    o.paid_at,
    o.updated_at,
    coalesce(sum(i.subtotal), 0)::numeric(12,2),
    greatest(
      0,
      coalesce(sum(i.subtotal), 0) - o.discount
    )::numeric(12,2)
  from public.restaurant_orders o
  left join public.profiles cp
    on cp.id = o.created_by
  left join public.profiles pp
    on pp.id = o.paid_by
  left join public.restaurant_order_items i
    on i.order_id = o.id
  where o.business_id = public.auth_business_id()
    and (public.is_owner() or o.created_by = auth.uid())
  group by
    o.id,
    o.order_number,
    o.location_type,
    o.table_number,
    o.status,
    o.discount,
    o.created_by,
    cp.full_name,
    o.paid_by,
    pp.full_name,
    o.paid_at,
    o.updated_at
  order by o.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

revoke all on function public.list_recent_restaurant_orders(integer) from public, anon;
grant execute on function public.list_recent_restaurant_orders(integer) to authenticated;

notify pgrst, 'reload schema';
