-- JIUZE POS — lock printed restaurant orders and centralize payments.
-- Review against the target Supabase schema before applying.

begin;

-- 1. Reserve an order before attempting to print it.
create table if not exists public.restaurant_order_print_locks (
  order_id uuid primary key
    references public.restaurant_orders(id) on delete restrict,
  business_id uuid not null
    references public.businesses(id) on delete cascade,
  locked_by uuid not null
    references public.profiles(id),
  locked_at timestamptz not null default now()
);

alter table public.restaurant_order_print_locks enable row level security;

drop policy if exists restaurant_order_print_locks_select_scoped
  on public.restaurant_order_print_locks;

create policy restaurant_order_print_locks_select_scoped
  on public.restaurant_order_print_locks
  for select to authenticated
  using (
    business_id = public.auth_business_id()
    and (public.is_owner() or locked_by = auth.uid())
  );

create or replace function public.reserve_restaurant_order_print(
  p_order_id uuid
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
begin
  if v_user_id is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  select o.business_id, o.created_by, o.status
    into v_business_id, v_created_by, v_status
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
    raise exception 'Only open orders can be printed.';
  end if;

  if not public.is_owner() and v_created_by <> v_user_id then
    raise exception 'You can only print your own restaurant order.'
      using errcode = '42501';
  end if;

  insert into public.restaurant_order_print_locks (
    order_id, business_id, locked_by
  )
  values (p_order_id, v_business_id, v_user_id)
  on conflict (order_id) do nothing;
end;
$$;

revoke all on function public.reserve_restaurant_order_print(uuid)
  from public, anon;
grant execute on function public.reserve_restaurant_order_print(uuid)
  to authenticated;

-- 2. Lock order header content after reservation or a successful order-slip print.
-- Status, sale, and payment attribution fields remain available to payment/clear RPCs.
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
    if tg_op = 'DELETE' then
      v_order_id := old.id;
    else
      v_order_id := old.id;
    end if;
  elsif tg_op = 'INSERT' then
    v_order_id := new.order_id;
  elsif tg_op = 'DELETE' then
    v_order_id := old.order_id;
  else
    v_order_id := old.order_id;
    v_second_order_id := new.order_id;
  end if;

  if tg_table_name = 'restaurant_orders' and tg_op = 'UPDATE' then
    if (
      new.business_id is distinct from old.business_id
      or new.order_number is distinct from old.order_number
      or new.location_type is distinct from old.location_type
      or new.table_number is distinct from old.table_number
      or new.discount is distinct from old.discount
      or new.created_by is distinct from old.created_by
    ) and (
      exists (
        select 1 from public.restaurant_order_print_locks l
        where l.order_id = v_order_id
      )
      or exists (
        select 1 from public.restaurant_order_prints pr
        where pr.order_id = v_order_id
          and pr.print_type = 'order_slip'
      )
    ) then
      raise exception 'This printed order is locked. Its contents cannot be changed.';
    end if;
  else
    if exists (
      select 1 from public.restaurant_order_print_locks l
      where l.order_id in (v_order_id, v_second_order_id)
    ) or exists (
      select 1 from public.restaurant_order_prints pr
      where pr.print_type = 'order_slip'
        and pr.order_id in (v_order_id, v_second_order_id)
    ) then
      raise exception 'This printed order is locked. Its contents cannot be changed.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Reinstall the existing triggers so they use the stricter function above.
drop trigger if exists guard_printed_restaurant_order_update
  on public.restaurant_orders;
create trigger guard_printed_restaurant_order_update
before update on public.restaurant_orders
for each row execute function public.guard_printed_restaurant_order();

drop trigger if exists guard_printed_restaurant_order_delete
  on public.restaurant_orders;
create trigger guard_printed_restaurant_order_delete
before delete on public.restaurant_orders
for each row execute function public.guard_printed_restaurant_order();

drop trigger if exists guard_printed_restaurant_order_items
  on public.restaurant_order_items;
create trigger guard_printed_restaurant_order_items
before insert or update or delete on public.restaurant_order_items
for each row execute function public.guard_printed_restaurant_order();

-- 3. Restore payment validation from migration 0030; only the owner can record payment.
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

  if not exists (
    select 1
    from public.restaurant_order_print_locks l
    where l.order_id = p_order_id
      and l.business_id = v_business_id
  ) then
    raise exception 'Reserve and print the restaurant order before taking payment.';
  end if;

  if not exists (
    select 1
    from public.restaurant_order_prints pr
    where pr.order_id = p_order_id
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

-- 4. Keep the legacy signature for compatibility, but disallow bypassing complete_sale.
create or replace function public.close_restaurant_order(
  p_order_id uuid,
  p_sale_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception
    'This payment path is disabled. Use complete_restaurant_order instead.'
    using errcode = '0A000';
end;
$$;

revoke all on function public.close_restaurant_order(uuid, uuid)
  from public, anon;
grant execute on function public.close_restaurant_order(uuid, uuid)
  to authenticated;

notify pgrst, 'reload schema';

commit;
