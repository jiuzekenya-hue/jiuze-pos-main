-- JIUZE POS — immutable restaurant print snapshots and outcomes
-- Records the exact order contents before the print bridge is called.
alter table public.restaurant_order_prints
  add column if not exists order_number_snapshot text,
  add column if not exists location_type_snapshot text,
  add column if not exists table_number_snapshot integer,
  add column if not exists items_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists subtotal_snapshot numeric(12,2) not null default 0,
  add column if not exists discount_snapshot numeric(12,2) not null default 0,
  add column if not exists total_snapshot numeric(12,2) not null default 0,
  add column if not exists print_status text not null default 'printed'
    check (print_status in ('pending', 'printed', 'failed')),
  add column if not exists print_error text;

create or replace function public.record_restaurant_order_print(
  p_order_id uuid,
  p_print_type text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_created_by uuid;
  v_status text;
  v_order_number text;
  v_location_type text;
  v_table_number integer;
  v_discount numeric(12,2);
  v_print_id uuid;
  v_items jsonb;
  v_subtotal numeric(12,2);
begin
  if v_user_id is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;
  if p_print_type not in ('order_slip', 'sales_receipt') then
    raise exception 'Invalid restaurant print type.';
  end if;

  select o.business_id, o.created_by, o.status, o.order_number,
         o.location_type, o.table_number, o.discount
    into v_business_id, v_created_by, v_status, v_order_number,
         v_location_type, v_table_number, v_discount
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
    raise exception 'You can only print your own restaurant order.';
  end if;
  if p_print_type = 'order_slip' and v_status <> 'open' then
    raise exception 'Only open orders can print an order slip.';
  end if;
  if p_print_type = 'sales_receipt' and v_status <> 'paid' then
    raise exception 'Only paid orders can print a sales receipt.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'product_id', i.product_id,
           'product_name', i.product_name,
           'quantity', i.quantity,
           'unit_price', i.unit_price,
           'subtotal', i.subtotal
         ) order by i.created_at, i.id), '[]'::jsonb),
         coalesce(sum(i.subtotal), 0)::numeric(12,2)
    into v_items, v_subtotal
    from public.restaurant_order_items i
   where i.order_id = p_order_id;

  insert into public.restaurant_order_prints (
    business_id, order_id, printed_by, print_type,
    order_number_snapshot, location_type_snapshot, table_number_snapshot,
    items_snapshot, subtotal_snapshot, discount_snapshot, total_snapshot,
    print_status
  ) values (
    v_business_id, p_order_id, v_user_id, p_print_type,
    v_order_number, v_location_type, v_table_number,
    v_items, v_subtotal, coalesce(v_discount, 0),
    greatest(0, v_subtotal - coalesce(v_discount, 0)), 'pending'
  )
  returning id into v_print_id;

  return v_print_id;
end;
$$;

create or replace function public.finish_restaurant_order_print(
  p_print_id uuid,
  p_print_status text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;
  if p_print_status not in ('printed', 'failed') then
    raise exception 'Invalid print result.';
  end if;

  update public.restaurant_order_prints pr
     set print_status = p_print_status,
         print_error = case when p_print_status = 'failed'
                            then left(coalesce(p_error, 'Print failed'), 500)
                            else null end
   where pr.id = p_print_id
     and pr.business_id = public.auth_business_id()
     and pr.printed_by = auth.uid()
     and pr.print_status = 'pending';

  if not found then
    raise exception 'Pending print record not found or access denied.';
  end if;
end;
$$;

revoke all on function public.record_restaurant_order_print(uuid, text) from public, anon;
grant execute on function public.record_restaurant_order_print(uuid, text) to authenticated;
revoke all on function public.finish_restaurant_order_print(uuid, text, text) from public, anon;
grant execute on function public.finish_restaurant_order_print(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
