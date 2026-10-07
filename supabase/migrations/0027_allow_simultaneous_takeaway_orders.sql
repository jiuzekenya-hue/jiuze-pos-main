-- JIUZE POS — Allow simultaneous takeaway orders
-- Tables remain single-occupancy locations.
-- Takeaway is an order channel, not a physical location, so multiple
-- open takeaway orders may exist at the same time.

drop index if exists public.restaurant_orders_one_open_location_key;

create unique index if not exists restaurant_orders_one_open_table_key
  on public.restaurant_orders (business_id, table_number)
  where status = 'open' and location_type = 'table';

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
  v_existing_created_by uuid;
begin
  v_user_id := auth.uid();
  v_business_id := public.auth_business_id();

  if v_user_id is null or v_business_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_location_type not in ('table', 'takeaway') then
    raise exception 'Invalid restaurant order location.';
  end if;

  if p_location_type = 'table'
     and (p_table_number is null or p_table_number < 1 or p_table_number > 12) then
    raise exception 'Invalid table number.';
  end if;

  if p_location_type = 'takeaway' and p_table_number is not null then
    raise exception 'Takeaway orders cannot have a table number.';
  end if;

  v_discount := greatest(coalesce(p_discount, 0), 0);

  if p_order_id is null then
    if p_location_type = 'table' then
      select o.id, o.order_number, o.created_by
        into v_order_id, v_order_number, v_existing_created_by
        from public.restaurant_orders o
       where o.business_id = v_business_id
         and o.status = 'open'
         and o.location_type = 'table'
         and o.table_number = p_table_number
       limit 1
       for update;

      if v_order_id is not null then
        if not public.is_owner() and v_existing_created_by <> v_user_id then
          raise exception 'This table already has an order owned by another cashier.';
        end if;
      end if;
    end if;

    if v_order_id is null then
      v_order_number := 'ORD-' || lpad(nextval('public.restaurant_order_number_seq')::text, 6, '0');

      insert into public.restaurant_orders (
        business_id,
        order_number,
        location_type,
        table_number,
        status,
        discount,
        created_by
      )
      values (
        v_business_id,
        v_order_number,
        p_location_type,
        p_table_number,
        'open',
        v_discount,
        v_user_id
      )
      returning id into v_order_id;
    end if;
  else
    select o.id, o.order_number, o.created_by
      into v_order_id, v_order_number, v_existing_created_by
      from public.restaurant_orders o
     where o.id = p_order_id
       and o.business_id = v_business_id
       and o.status = 'open'
     for update;

    if v_order_id is null then
      raise exception 'Open restaurant order not found.';
    end if;

    if not public.is_owner() and v_existing_created_by <> v_user_id then
      raise exception 'You can only modify your own restaurant orders.';
    end if;

    update public.restaurant_orders
       set discount = v_discount,
           updated_at = now()
     where public.restaurant_orders.id = v_order_id;
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Order items must be an array.';
  end if;

  delete from public.restaurant_order_items as roi
   where roi.order_id = v_order_id;

  insert into public.restaurant_order_items (
    order_id,
    product_id,
    product_name,
    quantity,
    unit_price,
    subtotal
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
         select 1
         from public.products p
         where p.id = x.product_id
           and p.business_id = v_business_id
           and p.is_active = true
       )
  ) then
    raise exception 'One or more order items are invalid.';
  end if;

  if not exists (
    select 1
    from public.restaurant_order_items roi
    where roi.order_id = v_order_id
  ) then
    delete from public.restaurant_orders
     where public.restaurant_orders.id = v_order_id;

    return;
  end if;

  update public.restaurant_orders
     set updated_at = now()
   where public.restaurant_orders.id = v_order_id;

  return query
  select v_order_id, v_order_number, 'open'::text;
end;
$$;

revoke all on function public.save_restaurant_order(uuid, text, integer, jsonb, numeric) from public, anon;
grant execute on function public.save_restaurant_order(uuid, text, integer, jsonb, numeric) to authenticated;

notify pgrst, 'reload schema';
