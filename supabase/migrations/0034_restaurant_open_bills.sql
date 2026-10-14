
-- JIUZE POS
-- Migration 0034: Owner-only Open Bills.
-- Local implementation only. Do not apply to production without approval.

create or replace function public.list_restaurant_open_bills(
  p_cashier_id uuid default null
)
returns table (
  id uuid,
  order_number text,
  location_type text,
  table_number integer,
  discount numeric,
  created_by uuid,
  created_by_name text,
  updated_at timestamptz,
  printed_at timestamptz,
  subtotal numeric,
  total numeric,
  items jsonb
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.'
      using errcode = '28000';
  end if;

  if not public.is_owner() then
    raise exception 'Only the business owner can view Open Bills.';
  end if;

  return query
  select
    o.id,
    o.order_number,
    o.location_type,
    o.table_number,
    o.discount,
    o.created_by,
    coalesce(profile.full_name, 'Unknown cashier')::text,
    o.updated_at,
    prints.printed_at,
    totals.subtotal,
    greatest(totals.subtotal - o.discount, 0)::numeric,
    item_data.items
  from public.restaurant_orders o
  join public.profiles profile
    on profile.id = o.created_by
  join lateral (
    select max(rp.printed_at) as printed_at
    from public.restaurant_order_prints rp
    where rp.order_id = o.id
      and rp.business_id = o.business_id
      and rp.print_type = 'order_slip'
  ) prints on prints.printed_at is not null
  join lateral (
    select coalesce(sum(i.subtotal), 0)::numeric as subtotal
    from public.restaurant_order_items i
    where i.order_id = o.id
  ) totals on true
  join lateral (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'product_id', i.product_id,
          'product_name', i.product_name,
          'quantity', i.quantity,
          'unit_price', i.unit_price,
          'subtotal', i.subtotal
        )
        order by i.created_at, i.id
      ),
      '[]'::jsonb
    ) as items
    from public.restaurant_order_items i
    where i.order_id = o.id
  ) item_data on true
  where o.business_id = public.auth_business_id()
    and o.status = 'open'
    and (
      p_cashier_id is null
      or o.created_by = p_cashier_id
    )
    and exists (
      select 1
      from public.restaurant_order_items i
      where i.order_id = o.id
    )
  order by prints.printed_at asc;
end;
$$;

revoke all
on function public.list_restaurant_open_bills(uuid)
from public, anon;

grant execute
on function public.list_restaurant_open_bills(uuid)
to authenticated;

notify pgrst, 'reload schema';
