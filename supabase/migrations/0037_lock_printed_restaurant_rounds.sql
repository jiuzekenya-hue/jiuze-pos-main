-- JIUZE POS: Lock printed restaurant order rounds, not the entire open bill.
-- Printed item rows are immutable. Unprinted rows remain editable/deletable.
-- The existing client sends the full bill quantity per product; save RPC preserves
-- printed quantities and replaces only the unprinted remainder.

begin;

alter table public.restaurant_order_items
  add column if not exists printed_at timestamptz;

create index if not exists restaurant_order_items_printed_round_idx
  on public.restaurant_order_items (order_id, printed_at)
  where printed_at is not null;

create or replace function public.guard_printed_restaurant_order_item_round()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  if tg_op = 'INSERT' then
    v_order_id := new.order_id;
  else
    v_order_id := old.order_id;
  end if;

  if tg_op = 'UPDATE' and old.printed_at is not null then
    raise exception 'This item belongs to a printed order round and cannot be changed.';
  end if;

  if tg_op = 'DELETE' and old.printed_at is not null then
    raise exception 'This item belongs to a printed order round and cannot be deleted.';
  end if;

  if tg_op = 'UPDATE' and new.order_id is distinct from old.order_id then
    raise exception 'Order items cannot be moved between bills.';
  end if;

  if tg_op = 'INSERT' then
    return new;
  elsif tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;

drop trigger if exists guard_printed_restaurant_order_items
  on public.restaurant_order_items;
create trigger guard_printed_restaurant_order_items
before insert or update or delete on public.restaurant_order_items
for each row execute function public.guard_printed_restaurant_order_item_round();

-- Replace the print RPC so only the current unprinted round is locked.
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
  if not public.is_owner() and v_created_by <> v_user_id then
    raise exception 'You can only print your own restaurant order.'
      using errcode = '42501';
  end if;
  if p_print_type = 'order_slip' and v_status <> 'open' then
    raise exception 'Only open orders can print an order slip.';
  end if;
  if p_print_type = 'sales_receipt' and v_status <> 'paid' then
    raise exception 'Only paid orders can print a sales receipt.';
  end if;

  if p_print_type = 'order_slip' then
    update public.restaurant_order_items
       set printed_at = now()
     where order_id = p_order_id
       and printed_at is null;

    if not found then
      raise exception 'There are no new unprinted items to print.';
    end if;
  end if;

  insert into public.restaurant_order_prints (
    business_id, order_id, printed_by, print_type
  ) values (
    v_business_id, p_order_id, v_user_id, p_print_type
  ) returning id into v_print_id;

  return v_print_id;
end;
$$;

revoke all on function public.record_restaurant_order_print(uuid, text)
  from public, anon;
grant execute on function public.record_restaurant_order_print(uuid, text)
  to authenticated;

-- Save the full bill submitted by the existing UI, but never rewrite printed rows.
-- For each product, submitted quantity must be >= the sum already printed.
create or replace function public.save_restaurant_order(
  p_order_id uuid,
  p_location_type text,
  p_table_number integer,
  p_items jsonb,
  p_discount numeric default 0
)
returns table (order_id uuid, order_number text, status text)
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
  v_item record;
  v_printed_qty numeric;
  v_product_name text;
  v_unit_price numeric;
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
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Order items must be an array.';
  end if;

  v_discount := greatest(coalesce(p_discount, 0), 0);

  if p_order_id is null then
    select o.id, o.order_number into v_order_id, v_order_number
      from public.restaurant_orders o
     where o.business_id = v_business_id and o.status = 'open'
       and o.location_type = p_location_type
       and coalesce(o.table_number, 0) = coalesce(p_table_number, 0)
     limit 1 for update;

    if v_order_id is null then
      v_order_number := 'ORD-' || lpad(nextval('public.restaurant_order_number_seq')::text, 6, '0');
      insert into public.restaurant_orders (
        business_id, order_number, location_type, table_number, status, discount, created_by
      ) values (
        v_business_id, v_order_number, p_location_type, p_table_number, 'open', v_discount, v_user_id
      ) returning id into v_order_id;
    end if;
  else
    select o.id, o.order_number into v_order_id, v_order_number
      from public.restaurant_orders o
     where o.id = p_order_id and o.business_id = v_business_id and o.status = 'open'
     for update;
    if v_order_id is null then
      raise exception 'Open restaurant order not found.';
    end if;
    if not public.is_owner() and not exists (
      select 1 from public.restaurant_orders o
      where o.id = v_order_id and o.created_by = v_user_id
    ) then
      raise exception 'You can only edit your own restaurant order.'
        using errcode = '42501';
    end if;
  end if;

  -- Validate every submitted product and quantity before changing rows.
  if exists (
    select 1
      from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
        as x(product_id uuid, quantity numeric)
     where x.quantity <= 0 or not exists (
       select 1 from public.products p
        where p.id = x.product_id and p.business_id = v_business_id and p.is_active = true
     )
  ) then
    raise exception 'One or more order items are invalid.';
  end if;

  -- Prevent removing or reducing any product quantity already printed.
  for v_item in
    select x.product_id, sum(x.quantity)::numeric as requested_qty
      from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
        as x(product_id uuid, quantity numeric)
     group by x.product_id
  loop
    select coalesce(sum(roi.quantity), 0) into v_printed_qty
      from public.restaurant_order_items roi
     where roi.order_id = v_order_id
       and roi.product_id = v_item.product_id
       and roi.printed_at is not null;

    if v_item.requested_qty < v_printed_qty then
      raise exception 'Printed items cannot be removed or reduced. Additions are still allowed.';
    end if;
  end loop;

  -- A printed product omitted entirely from the submitted payload is also protected.
  if exists (
    select 1
      from public.restaurant_order_items roi
     where roi.order_id = v_order_id and roi.printed_at is not null
       and not exists (
         select 1 from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
           as x(product_id uuid, quantity numeric)
          where x.product_id = roi.product_id
       )
  ) then
    raise exception 'Printed items cannot be removed. Additions are still allowed.';
  end if;

  update public.restaurant_orders
     set discount = v_discount, updated_at = now()
   where id = v_order_id;

  -- Replace only the unprinted rows. Printed rows remain immutable.
  delete from public.restaurant_order_items roi
   where roi.order_id = v_order_id and roi.printed_at is null;

  insert into public.restaurant_order_items (
    order_id, product_id, product_name, quantity, unit_price, subtotal
  )
  select v_order_id, p.id, p.name,
         (x.quantity - coalesce(printed.qty, 0))::numeric,
         p.selling_price,
         round((p.selling_price * (x.quantity - coalesce(printed.qty, 0)))::numeric, 2)
    from (
      select product_id, sum(quantity)::numeric as quantity
        from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
          as inp(product_id uuid, quantity numeric)
       group by product_id
    ) x
    join public.products p on p.id = x.product_id
      and p.business_id = v_business_id and p.is_active = true
    left join (
      select roi.product_id, sum(roi.quantity)::numeric as qty
        from public.restaurant_order_items roi
       where roi.order_id = v_order_id and roi.printed_at is not null
       group by roi.product_id
    ) printed on printed.product_id = p.id
   where x.quantity > coalesce(printed.qty, 0);

  if not exists (
    select 1 from public.restaurant_order_items roi where roi.order_id = v_order_id
  ) then
    delete from public.restaurant_orders ro where ro.id = v_order_id;
    return;
  end if;

  return query select v_order_id, v_order_number, 'open'::text;
end;
$$;

revoke all on function public.save_restaurant_order(uuid, text, integer, jsonb, numeric)
  from public, anon;
grant execute on function public.save_restaurant_order(uuid, text, integer, jsonb, numeric)
  to authenticated;

-- Ensure the former whole-order trigger cannot reject legitimate new rounds.
drop trigger if exists guard_printed_restaurant_order_update on public.restaurant_orders;
drop trigger if exists guard_printed_restaurant_order_delete on public.restaurant_orders;

notify pgrst, 'reload schema';
commit;
