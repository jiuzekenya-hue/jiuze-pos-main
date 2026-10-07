-- JIUZE POS — Audit restaurant order clearing
-- Never delete an order when it is cleared. Mark it cancelled and record
-- exactly who cleared it, when, and why.

alter table public.restaurant_orders
  add column if not exists cleared_by uuid references public.profiles(id),
  add column if not exists cleared_at timestamptz,
  add column if not exists clear_reason text;

create index if not exists restaurant_orders_cleared_by_idx
  on public.restaurant_orders (cleared_by)
  where cleared_by is not null;

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
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  if v_reason is null then
    raise exception 'A reason is required when clearing an order.';
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
    raise exception 'Restaurant order does not belong to your business.';
  end if;

  if v_status <> 'open' then
    raise exception 'Only open orders can be cleared.';
  end if;

  if not public.is_owner() and v_created_by <> v_user_id then
    raise exception 'You can only clear your own restaurant orders.';
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

revoke all on function public.clear_restaurant_order(uuid, text) from public, anon;
grant execute on function public.clear_restaurant_order(uuid, text) to authenticated;

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
  cleared_by uuid,
  cleared_by_name text,
  cleared_at timestamptz,
  clear_reason text,
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
    o.cleared_by,
    coalesce(clp.full_name, 'Unknown user'),
    o.cleared_at,
    o.clear_reason,
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
  left join public.profiles clp
    on clp.id = o.cleared_by
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
    o.cleared_by,
    clp.full_name,
    o.cleared_at,
    o.clear_reason,
    o.updated_at
  order by o.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

revoke all on function public.list_recent_restaurant_orders(integer) from public, anon;
grant execute on function public.list_recent_restaurant_orders(integer) to authenticated;

notify pgrst, 'reload schema';
