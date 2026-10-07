-- JIUZE POS — Audit every restaurant order print
-- Every successful print is recorded as an immutable event.

create table if not exists public.restaurant_order_prints (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.restaurant_orders(id) on delete restrict,
  printed_by uuid not null references public.profiles(id),
  printed_at timestamptz not null default now(),
  print_type text not null check (print_type in ('order_slip', 'sales_receipt'))
);

create index if not exists restaurant_order_prints_order_idx
  on public.restaurant_order_prints (order_id, printed_at desc);

create index if not exists restaurant_order_prints_business_idx
  on public.restaurant_order_prints (business_id, printed_at desc);

alter table public.restaurant_order_prints enable row level security;

create policy restaurant_order_prints_select_scoped
  on public.restaurant_order_prints
  for select
  to authenticated
  using (
    business_id = public.auth_business_id()
    and (
      public.is_owner()
      or printed_by = auth.uid()
    )
  );

create or replace function public.record_restaurant_order_print(
  p_order_id uuid,
  p_print_type text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_created_by uuid;
  v_status text;
  v_print_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  if p_print_type not in ('order_slip', 'sales_receipt') then
    raise exception 'Invalid restaurant print type.';
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

  if not public.is_owner() and v_created_by <> v_user_id then
    raise exception 'You can only print your own restaurant order.';
  end if;

  if p_print_type = 'order_slip' and v_status <> 'open' then
    raise exception 'Only open orders can print an order slip.';
  end if;

  if p_print_type = 'sales_receipt' and v_status <> 'paid' then
    raise exception 'Only paid orders can print a sales receipt.';
  end if;

  insert into public.restaurant_order_prints (
    business_id,
    order_id,
    printed_by,
    print_type
  )
  values (
    v_business_id,
    p_order_id,
    v_user_id,
    p_print_type
  )
  returning id into v_print_id;

  return v_print_id;
end;
$$;

revoke all on function public.record_restaurant_order_print(uuid, text) from public, anon;
grant execute on function public.record_restaurant_order_print(uuid, text) to authenticated;

notify pgrst, 'reload schema';


-- Extend recent-order audit with print activity.
drop function if exists public.list_recent_restaurant_orders(integer);

create or replace function public.list_recent_restaurant_orders(
  p_limit integer default 30
)
returns table (
  id uuid, order_number text, location_type text, table_number integer,
  status text, discount numeric, created_by uuid, created_by_name text,
  paid_by uuid, paid_by_name text, paid_at timestamptz,
  cleared_by uuid, cleared_by_name text, cleared_at timestamptz,
  clear_reason text, updated_at timestamptz, subtotal numeric, total numeric,
  order_slip_print_count bigint, last_order_slip_printed_by uuid,
  last_order_slip_printed_by_name text, last_order_slip_printed_at timestamptz,
  sales_receipt_print_count bigint
)
language sql security definer stable set search_path = public
as $$
  select
    o.id, o.order_number, o.location_type, o.table_number, o.status,
    o.discount, o.created_by, coalesce(cp.full_name, 'Unknown cashier'),
    o.paid_by, coalesce(pp.full_name, 'Not paid'), o.paid_at,
    o.cleared_by, coalesce(clp.full_name, 'Unknown user'), o.cleared_at,
    o.clear_reason, o.updated_at,
    coalesce(sum(distinct i.subtotal), 0)::numeric(12,2),
    greatest(0, coalesce(sum(distinct i.subtotal), 0) - o.discount)::numeric(12,2),
    count(*) filter (where pr.print_type = 'order_slip'),
    (array_agg(pr.printed_by order by pr.printed_at desc) filter (where pr.print_type = 'order_slip'))[1],
    (array_agg(ppr.full_name order by pr.printed_at desc) filter (where pr.print_type = 'order_slip'))[1],
    max(pr.printed_at) filter (where pr.print_type = 'order_slip'),
    count(*) filter (where pr.print_type = 'sales_receipt')
  from public.restaurant_orders o
  left join public.profiles cp on cp.id = o.created_by
  left join public.profiles pp on pp.id = o.paid_by
  left join public.profiles clp on clp.id = o.cleared_by
  left join public.restaurant_order_items i on i.order_id = o.id
  left join public.restaurant_order_prints pr on pr.order_id = o.id
  left join public.profiles ppr on ppr.id = pr.printed_by
  where o.business_id = public.auth_business_id()
    and (public.is_owner() or o.created_by = auth.uid())
  group by o.id, o.order_number, o.location_type, o.table_number, o.status,
    o.discount, o.created_by, cp.full_name, o.paid_by, pp.full_name, o.paid_at,
    o.cleared_by, clp.full_name, o.cleared_at, o.clear_reason, o.updated_at
  order by o.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

revoke all on function public.list_recent_restaurant_orders(integer) from public, anon;
grant execute on function public.list_recent_restaurant_orders(integer) to authenticated;

notify pgrst, 'reload schema';
