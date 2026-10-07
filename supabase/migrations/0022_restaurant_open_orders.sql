-- JIUZE POS — Open restaurant table orders
create table public.restaurant_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  table_number integer,
  customer_name text,
  server_id uuid not null references public.profiles(id),
  status text not null default 'open' check (status in ('open','paid','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (table_number is not null or customer_name is not null)
);

create table public.restaurant_order_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.restaurant_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  created_at timestamptz not null default now()
);

create index restaurant_orders_business_status_idx
  on public.restaurant_orders(business_id, status);
create index restaurant_order_items_order_idx
  on public.restaurant_order_items(order_id);

alter table public.restaurant_orders enable row level security;
alter table public.restaurant_order_items enable row level security;

create policy restaurant_orders_select
on public.restaurant_orders for select to authenticated
using (business_id = public.auth_business_id());

create policy restaurant_order_items_select
on public.restaurant_order_items for select to authenticated
using (business_id = public.auth_business_id());

create policy restaurant_orders_insert
on public.restaurant_orders for insert to authenticated
with check (business_id = public.auth_business_id());

create policy restaurant_order_items_insert
on public.restaurant_order_items for insert to authenticated
with check (business_id = public.auth_business_id());

create policy restaurant_orders_update
on public.restaurant_orders for update to authenticated
using (business_id = public.auth_business_id())
with check (business_id = public.auth_business_id());

create policy restaurant_order_items_update
on public.restaurant_order_items for update to authenticated
using (business_id = public.auth_business_id())
with check (business_id = public.auth_business_id());

create or replace function public.save_restaurant_order(
  p_table_number integer,
  p_customer_name text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_id uuid := public.auth_business_id();
  v_server_id uuid := auth.uid();
  v_order_id uuid;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
begin
  if v_business_id is null then raise exception 'No business is associated with this user'; end if;
  if p_table_number is null and nullif(btrim(p_customer_name), '') is null then
    raise exception 'Table or customer is required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Order is empty';
  end if;

  select id into v_order_id
  from public.restaurant_orders
  where business_id = v_business_id
    and status = 'open'
    and (
      (p_table_number is not null and table_number = p_table_number)
      or (p_table_number is null and table_number is null and customer_name = nullif(btrim(p_customer_name), ''))
    )
  limit 1;

  if v_order_id is null then
    insert into public.restaurant_orders(business_id, table_number, customer_name, server_id)
    values(v_business_id, p_table_number, nullif(btrim(p_customer_name), ''), v_server_id)
    returning id into v_order_id;
  else
    update public.restaurant_orders
    set customer_name = coalesce(nullif(btrim(p_customer_name), ''), customer_name),
        updated_at = now()
    where id = v_order_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity is null or v_quantity <= 0 then raise exception 'Invalid item quantity'; end if;
    select * into v_product from public.products where id=(v_item->>'product_id')::uuid and business_id=v_business_id and is_active=true;
    if not found then raise exception 'Product not found'; end if;

    insert into public.restaurant_order_items(business_id, order_id, product_id, product_name, quantity, unit_price)
    values(v_business_id, v_order_id, v_product.id, v_product.name, v_quantity, v_product.selling_price);
  end loop;

  update public.restaurant_orders set updated_at=now() where id=v_order_id;
  return v_order_id;
end;
$$;

revoke all on function public.save_restaurant_order(integer,text,jsonb) from public;
grant execute on function public.save_restaurant_order(integer,text,jsonb) to authenticated;
