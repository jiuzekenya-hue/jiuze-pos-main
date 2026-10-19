-- Expand cashier permissions and delegate Open Bills access safely.
alter table public.cashier_permissions
  drop constraint if exists cashier_permissions_allowed_keys;

alter table public.cashier_permissions
  add constraint cashier_permissions_allowed_keys check (
    permissions <@ array[
      'dashboard','pos','products','productCreate','productEdit','inventory',
      'sales','reports','settings','userManagement','stockAdjustments',
      'categories','openBills','recordOpenBillPayments','voidReturnSales','mySales'
    ]::text[]
  );

-- Categories are independently permissioned, not implicitly tied to product viewing.
drop policy if exists categories_select_own_business on public.categories;
create policy categories_select_own_business on public.categories
for select to authenticated
using (
  business_id = public.auth_business_id()
  and (
    public.has_cashier_permission('categories')
    or public.has_cashier_permission('products')
  )
);

-- Owners and explicitly authorized bill collectors may list printed, unpaid bills.
create or replace function public.list_restaurant_open_bills(p_cashier_id uuid default null)
returns table(
  id uuid, order_number text, location_type text, table_number integer,
  discount numeric, created_by uuid, created_by_name text,
  updated_at timestamptz, printed_at timestamptz, subtotal numeric,
  total numeric, items jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  if not public.is_owner() and not public.has_cashier_permission('openBills') then
    raise exception 'You do not have permission to view Open Bills.' using errcode = '42501';
  end if;

  -- Cashiers can only view their own bills; only owners may filter across cashiers.
  if not public.is_owner() and p_cashier_id is not null and p_cashier_id <> auth.uid() then
    raise exception 'Cashiers may only filter their own bills.' using errcode = '42501';
  end if;

  return query
  select
    o.id, o.order_number, o.location_type, o.table_number, o.discount,
    o.created_by, coalesce(profile.full_name, 'Unknown cashier')::text,
    o.updated_at, prints.printed_at, totals.subtotal,
    greatest(totals.subtotal - o.discount, 0)::numeric, item_data.items
  from public.restaurant_orders o
  left join public.profiles profile on profile.id = o.created_by
  join lateral (
    select max(rp.printed_at) as printed_at
    from public.restaurant_order_prints rp
    where rp.order_id = o.id
      and rp.business_id = o.business_id
      and rp.print_type = 'order_slip'
  ) prints on true
  join lateral (
    select coalesce(sum(i.subtotal), 0)::numeric as subtotal
    from public.restaurant_order_items i where i.order_id = o.id
  ) totals on true
  join lateral (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'product_id', i.product_id, 'product_name', i.product_name,
      'quantity', i.quantity, 'unit_price', i.unit_price, 'subtotal', i.subtotal
    ) order by i.created_at, i.id), '[]'::jsonb) as items
    from public.restaurant_order_items i where i.order_id = o.id
  ) item_data on true
  where o.business_id = public.auth_business_id()
    and o.status = 'open'
    and prints.printed_at is not null
    and (public.is_owner() or o.created_by = auth.uid())
    and (p_cashier_id is null or o.created_by = p_cashier_id)
    and exists (select 1 from public.restaurant_order_items i where i.order_id = o.id)
  order by prints.printed_at asc, o.created_at asc;
end;
$function$;

-- Payment collection can be delegated, but only after a successful order-slip print.
-- The caller remains paid_by; original order creator attribution is preserved on the sale.
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
as $function$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_created_by uuid;
  v_discount numeric(12,2);
  v_status text;
  v_items jsonb;
  v_sale jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  if not public.is_owner() and not public.has_cashier_permission('recordOpenBillPayments') then
    raise exception 'You do not have permission to record restaurant payments.' using errcode = '42501';
  end if;

  if not public.has_subscription_access() then
    raise exception 'Subscription access is required.' using errcode = '42501';
  end if;

  select o.business_id, o.created_by, o.discount, o.status
    into v_business_id, v_created_by, v_discount, v_status
    from public.restaurant_orders o
   where o.id = p_order_id
   for update;

  if v_business_id is null then
    raise exception 'Restaurant order not found.';
  end if;

  if v_business_id <> public.auth_business_id() then
    raise exception 'Restaurant order does not belong to your business.' using errcode = '42501';
  end if;

  if not public.is_owner() and not public.has_cashier_permission('openBills') then
    raise exception 'Open Bills access is required to collect payment.' using errcode = '42501';
  end if;

  if v_status <> 'open' then
    raise exception 'Only open restaurant orders can be paid.';
  end if;

  if not exists (
    select 1 from public.restaurant_order_prints pr
    where pr.order_id = p_order_id and pr.business_id = v_business_id
      and pr.print_type = 'order_slip'
  ) then
    raise exception 'A successful order-slip print is required before taking payment.';
  end if;

  if not exists (select 1 from public.restaurant_order_items i where i.order_id = p_order_id) then
    raise exception 'Restaurant order has no items.';
  end if;

  if exists (
    select 1 from public.restaurant_order_items i
    left join public.products p on p.id = i.product_id and p.business_id = v_business_id
    where i.order_id = p_order_id
      and (i.product_id is null or p.id is null or p.is_active = false)
  ) then
    raise exception 'One or more products in this order are no longer available.';
  end if;

  if exists (
    select 1 from public.restaurant_order_items i
    join public.products p on p.id = i.product_id
    where i.order_id = p_order_id and p.selling_price <> i.unit_price
  ) then
    raise exception 'One or more product prices changed after this order was opened. Refresh the order before taking payment.';
  end if;

  select jsonb_agg(jsonb_build_object('product_id', i.product_id, 'quantity', i.quantity)
                   order by i.created_at, i.id)
    into v_items
    from public.restaurant_order_items i where i.order_id = p_order_id;

  v_sale := public.complete_sale(v_items, p_payment_method, p_payment_amount, p_payment_reference, v_discount);

  -- Preserve the cashier who opened the order as the sale's cashier attribution.
  update public.sales
     set cashier_id = v_created_by
   where id = (v_sale->>'sale_id')::uuid
     and business_id = v_business_id;

  update public.restaurant_orders
     set status = 'paid',
         sale_id = (v_sale->>'sale_id')::uuid,
         paid_by = v_user_id,
         paid_at = now(),
         updated_at = now()
   where id = p_order_id;

  return v_sale;
end;
$function$;

revoke all on function public.list_restaurant_open_bills(uuid) from public;
grant execute on function public.list_restaurant_open_bills(uuid) to authenticated;
revoke all on function public.complete_restaurant_order(uuid,text,numeric,text) from public;
grant execute on function public.complete_restaurant_order(uuid,text,numeric,text) to authenticated;
