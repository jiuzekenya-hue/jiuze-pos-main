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
