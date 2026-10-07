-- JIUZE POS — Restaurant open orders
-- Persistent table/takeaway orders for bar & restaurant mode.

create sequence if not exists public.restaurant_order_number_seq;

create table if not exists public.restaurant_orders (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  order_number  text not null,
  location_type text not null check (location_type in ('table', 'takeaway')),
  table_number  integer check (table_number between 1 and 12),
  status        text not null default 'open' check (status in ('open', 'paid', 'cancelled')),
  discount      numeric(12,2) not null default 0 check (discount >= 0),
  created_by    uuid not null references public.profiles(id),
  sale_id       uuid references public.sales(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint restaurant_orders_location_check check (
    (location_type = 'table' and table_number is not null)
    or (location_type = 'takeaway' and table_number is null)
  )
);

create unique index if not exists restaurant_orders_business_order_number_key
  on public.restaurant_orders (business_id, order_number);

create unique index if not exists restaurant_orders_one_open_location_key
  on public.restaurant_orders (business_id, location_type, coalesce(table_number, 0))
  where status = 'open';

create index if not exists restaurant_orders_business_status_idx
  on public.restaurant_orders (business_id, status, updated_at desc);

create table if not exists public.restaurant_order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.restaurant_orders(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity     numeric(12,3) not null check (quantity > 0),
  unit_price   numeric(12,2) not null check (unit_price >= 0),
  subtotal     numeric(12,2) not null check (subtotal >= 0),
  created_at   timestamptz not null default now()
);

create index if not exists restaurant_order_items_order_id_idx
  on public.restaurant_order_items (order_id);

alter table public.restaurant_orders enable row level security;
alter table public.restaurant_order_items enable row level security;

drop policy if exists restaurant_orders_select_own_business on public.restaurant_orders;
create policy restaurant_orders_select_own_business
  on public.restaurant_orders for select
  to authenticated
  using (
    business_id = public.auth_business_id()
    and business_id = public.auth_business_id()
  );

drop policy if exists restaurant_order_items_select_scoped on public.restaurant_order_items;
create policy restaurant_order_items_select_scoped
  on public.restaurant_order_items for select
  to authenticated
  using (
    exists (
      select 1
      from public.restaurant_orders o
      where o.id = restaurant_order_items.order_id
        and o.business_id = public.auth_business_id()
        and o.business_id = public.auth_business_id()
    )
  );

revoke all on public.restaurant_orders from authenticated, anon;
revoke all on public.restaurant_order_items from authenticated, anon;
grant select on public.restaurant_orders to authenticated;
grant select on public.restaurant_order_items to authenticated;

create or replace function public.save_restaurant_order(
  p_order_id uuid,
  p_location_type text,
  p_table_number integer,
  p_items jsonb,
  p_discount numeric default 0
)
returns table (
  order_id uuid,
  order_number text,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_user_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_discount numeric(12,2);
begin
  v_user_id := auth.uid();
  v_business_id := public.auth_business_id();

  if v_user_id is null or v_business_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_location_type not in ('table', 'takeaway') then
    raise exception 'Invalid restaurant order location.';
  end if;

  if p_location_type = 'table' and (p_table_number is null or p_table_number < 1 or p_table_number > 12) then
    raise exception 'Invalid table number.';
  end if;

  if p_location_type = 'takeaway' and p_table_number is not null then
    raise exception 'Takeaway orders cannot have a table number.';
  end if;

  v_discount := greatest(coalesce(p_discount, 0), 0);

  if p_order_id is null then
    select o.id, o.order_number
      into v_order_id, v_order_number
      from public.restaurant_orders o
     where o.business_id = v_business_id
       and o.status = 'open'
       and o.location_type = p_location_type
       and coalesce(o.table_number, 0) = coalesce(p_table_number, 0)
     limit 1;

    if v_order_id is null then
      v_order_number := 'ORD-' || lpad(nextval('public.restaurant_order_number_seq')::text, 6, '0');
      insert into public.restaurant_orders (
        business_id, order_number, location_type, table_number, status, discount, created_by
      )
      values (
        v_business_id, v_order_number, p_location_type, p_table_number, 'open', v_discount, v_user_id
      )
      returning id into v_order_id;
    end if;
  else
    select o.id, o.order_number
      into v_order_id, v_order_number
      from public.restaurant_orders o
     where o.id = p_order_id
       and o.business_id = v_business_id
       and o.status = 'open'
       and o.business_id = v_business_id
     for update;

    if v_order_id is null then
      raise exception 'Open restaurant order not found.';
    end if;

    update public.restaurant_orders
       set discount = v_discount,
           updated_at = now()
     where id = v_order_id;
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Order items must be an array.';
  end if;

  delete from public.restaurant_order_items
   where order_id = v_order_id;

  insert into public.restaurant_order_items (
    order_id, product_id, product_name, quantity, unit_price, subtotal
  )
  select
    v_order_id,
    p.id,
    p.name,
    x.quantity,
    p.selling_price,
    round((p.selling_price * x.quantity)::numeric, 2)
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
       as x(product_id uuid, quantity numeric)
  join public.products p
    on p.id = x.product_id
   and p.business_id = v_business_id
   and p.is_active = true
  where x.quantity > 0;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
         as x(product_id uuid, quantity numeric)
    where x.quantity <= 0
       or not exists (
         select 1 from public.products p
          where p.id = x.product_id
            and p.business_id = v_business_id
            and p.is_active = true
       )
  ) then
    raise exception 'One or more order items are invalid.';
  end if;

  if not exists (
    select 1 from public.restaurant_order_items i where i.order_id = v_order_id
  ) then
    delete from public.restaurant_orders where id = v_order_id;
    return;
  end if;

  update public.restaurant_orders
     set updated_at = now()
   where id = v_order_id;

  return query
  select v_order_id, v_order_number, 'open'::text;
end;
$$;

revoke all on function public.save_restaurant_order(uuid, text, integer, jsonb, numeric) from public, anon;
grant execute on function public.save_restaurant_order(uuid, text, integer, jsonb, numeric) to authenticated;

create or replace function public.close_restaurant_order(
  p_order_id uuid,
  p_sale_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  v_business_id := public.auth_business_id();

  if v_user_id is null or v_business_id is null then
    raise exception 'Authentication required.';
  end if;

  if not exists (
    select 1
    from public.restaurant_orders o
    where o.id = p_order_id
      and o.business_id = v_business_id
      and o.status = 'open'
      and (public.is_owner() or o.created_by = v_user_id)
  ) then
    raise exception 'Open restaurant order not found.';
  end if;

  if not exists (
    select 1
    from public.sales s
    where s.id = p_sale_id
      and s.business_id = v_business_id
      and s.status = 'completed'
  ) then
    raise exception 'Completed sale not found.';
  end if;

  update public.restaurant_orders
     set status = 'paid',
         sale_id = p_sale_id,
         updated_at = now()
   where id = p_order_id;
end;
$$;

revoke all on function public.close_restaurant_order(uuid, uuid) from public, anon;
grant execute on function public.close_restaurant_order(uuid, uuid) to authenticated;

create trigger restaurant_orders_set_updated_at
  before update on public.restaurant_orders
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
