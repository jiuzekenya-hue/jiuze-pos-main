-- JIUZE POS — Migration 16
-- Transactional sales returns and refunds.
--
-- Returns are separate immutable transactions. The original sale remains
-- unchanged for audit history. A return restores stock, records the refund,
-- and links every returned line back to its original sale item.

create table public.sales_returns (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references public.businesses (id) on delete cascade,
  original_sale_id      uuid not null references public.sales (id) on delete restrict,
  return_receipt_number text not null,
  processed_by          uuid not null references public.profiles (id),
  refund_method         text not null check (refund_method in ('cash', 'mpesa', 'card')),
  refund_amount         numeric(12, 2) not null check (refund_amount >= 0),
  refund_reference      text,
  reason                text not null check (btrim(reason) <> ''),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index sales_returns_business_receipt_key
  on public.sales_returns (business_id, return_receipt_number);
create index sales_returns_business_sale_idx
  on public.sales_returns (original_sale_id, created_at desc);
create index sales_returns_business_created_idx
  on public.sales_returns (business_id, created_at desc);
create index sales_returns_processed_by_idx
  on public.sales_returns (processed_by);

create table public.sales_return_items (
  id                       uuid primary key default gen_random_uuid(),
  business_id              uuid not null references public.businesses (id) on delete cascade,
  return_id                uuid not null references public.sales_returns (id) on delete cascade,
  original_sale_item_id    uuid not null references public.sale_items (id) on delete restrict,
  product_id               uuid references public.products (id) on delete set null,
  product_name             text not null,
  quantity                 numeric(12, 3) not null check (quantity > 0),
  unit_price               numeric(12, 2) not null check (unit_price >= 0),
  cost_price               numeric(12, 2) not null check (cost_price >= 0),
  line_discount            numeric(12, 2) not null default 0 check (line_discount >= 0),
  allocated_sale_discount  numeric(12, 2) not null default 0 check (allocated_sale_discount >= 0),
  refund_amount            numeric(12, 2) not null check (refund_amount >= 0),
  created_at               timestamptz not null default now(),
  unique (return_id, original_sale_item_id)
);

create index sales_return_items_return_idx
  on public.sales_return_items (return_id);
create index sales_return_items_original_item_idx
  on public.sales_return_items (original_sale_item_id);
create index sales_return_items_business_idx
  on public.sales_return_items (business_id);

alter table public.sales_returns enable row level security;
alter table public.sales_return_items enable row level security;

revoke all on table public.sales_returns from anon, authenticated;
revoke all on table public.sales_return_items from anon, authenticated;
grant select on table public.sales_returns to authenticated;
grant select on table public.sales_return_items to authenticated;

create policy sales_returns_select_scoped
on public.sales_returns
for select
to authenticated
using (business_id = public.auth_business_id());

create policy sales_return_items_select_scoped
on public.sales_return_items
for select
to authenticated
using (business_id = public.auth_business_id());

create function public.next_return_receipt_number(p_business_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  perform 1
  from public.businesses
  where id = p_business_id
  for update;

  select count(*)
  into v_count
  from public.sales_returns
  where business_id = p_business_id;

  return 'RR-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((v_count + 1)::text, 4, '0');
end;
$$;

revoke all on function public.next_return_receipt_number(uuid) from public;
grant execute on function public.next_return_receipt_number(uuid) to authenticated;

create function public.process_sale_return(
  p_sale_id uuid,
  p_items jsonb,
  p_refund_method text,
  p_refund_reference text default null,
  p_reason text default 'Customer return'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id                 uuid := auth.uid();
  v_business_id             uuid;
  v_sale                    public.sales%rowtype;
  v_return_id               uuid;
  v_return_receipt_number   text;
  v_item                     jsonb;
  v_sale_item                public.sale_items%rowtype;
  v_quantity                 numeric(12,3);
  v_already_returned         numeric(12,3);
  v_remaining_quantity       numeric(12,3);
  v_sale_subtotal            numeric;
  v_allocated_sale_discount  numeric;
  v_line_net_total            numeric;
  v_previous_refund           numeric;
  v_refund_amount             numeric(12,2);
  v_total_refund              numeric(12,2) := 0;
  v_item_count                integer;
  v_distinct_item_count       integer;
  v_refund_reference          text := nullif(btrim(coalesce(p_refund_reference, '')), '');
  v_reason                    text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select business_id
  into v_business_id
  from public.profiles
  where id = v_user_id;

  if v_business_id is null then
    raise exception 'No business is associated with this user' using errcode = '28000';
  end if;

  perform public.assert_subscription_access();

  if p_sale_id is null then
    raise exception 'Original sale is required';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one item must be returned';
  end if;

  if p_refund_method not in ('cash', 'mpesa', 'card') then
    raise exception 'Invalid refund method: %', p_refund_method;
  end if;

  if v_reason is null then
    raise exception 'A return reason is required';
  end if;

  if p_refund_method in ('mpesa', 'card') and v_refund_reference is null then
    raise exception 'Refund reference is required for % refunds', p_refund_method;
  end if;

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
    and business_id = v_business_id
  for update;

  if not found then
    raise exception 'Original sale not found for this business';
  end if;

  if v_sale.status <> 'completed' then
    raise exception 'Only completed sales can be returned';
  end if;

  select count(*)
  into v_item_count
  from jsonb_array_elements(p_items);

  select count(distinct value->>'sale_item_id')
  into v_distinct_item_count
  from jsonb_array_elements(p_items);

  if v_item_count <> v_distinct_item_count then
    raise exception 'Each sale item can appear only once in a return';
  end if;

  create temporary table pg_temp.jiuze_return_lines (
    sale_item_id uuid not null,
    product_id uuid not null,
    product_name text not null,
    quantity numeric(12,3) not null,
    unit_price numeric(12,2) not null,
    cost_price numeric(12,2) not null,
    line_discount numeric(12,2) not null,
    allocated_sale_discount numeric(12,2) not null,
    refund_amount numeric(12,2) not null
  ) on commit drop;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if not (v_item ? 'sale_item_id') or not (v_item ? 'quantity') then
      raise exception 'Each return item requires sale_item_id and quantity';
    end if;

    begin
      v_quantity := (v_item->>'quantity')::numeric;
    exception when invalid_text_representation then
      raise exception 'Return quantity must be a valid number';
    end;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Return quantity must be greater than zero';
    end if;

    if v_quantity <> round(v_quantity, 3) then
      raise exception 'Return quantity can have at most 3 decimal places';
    end if;

    select si.*
    into v_sale_item
    from public.sale_items si
    where si.id = (v_item->>'sale_item_id')::uuid
      and si.sale_id = p_sale_id;

    if not found then
      raise exception 'Sale item % does not belong to the original sale', v_item->>'sale_item_id';
    end if;

    if v_sale_item.product_id is null then
      raise exception 'Product for returned item "%" is no longer available', v_sale_item.product_name;
    end if;

    select coalesce(sum(sri.quantity), 0)
    into v_already_returned
    from public.sales_return_items sri
    where sri.original_sale_item_id = v_sale_item.id;

    v_remaining_quantity := v_sale_item.quantity - v_already_returned;

    if v_quantity > v_remaining_quantity then
      raise exception 'Return quantity for "%" exceeds the remaining returnable quantity of %',
        v_sale_item.product_name,
        v_remaining_quantity;
    end if;

    v_sale_subtotal := v_sale.subtotal;
    v_allocated_sale_discount := case
      when v_sale_subtotal > 0
        then (v_sale_item.subtotal / v_sale_subtotal) * v_sale.discount
      else 0
    end;

    v_line_net_total := greatest(0, v_sale_item.subtotal - v_allocated_sale_discount);

    select coalesce(sum(sri.refund_amount), 0)
    into v_previous_refund
    from public.sales_return_items sri
    where sri.original_sale_item_id = v_sale_item.id;

    if v_quantity = v_remaining_quantity then
      v_refund_amount := round(v_line_net_total - v_previous_refund, 2);
    else
      v_refund_amount := round((v_line_net_total / v_sale_item.quantity) * v_quantity, 2);
    end if;

    if v_refund_amount < 0 then
      raise exception 'Calculated refund cannot be negative for "%"', v_sale_item.product_name;
    end if;

    insert into pg_temp.jiuze_return_lines (
      sale_item_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      cost_price,
      line_discount,
      allocated_sale_discount,
      refund_amount
    )
    values (
      v_sale_item.id,
      v_sale_item.product_id,
      v_sale_item.product_name,
      v_quantity,
      v_sale_item.unit_price,
      v_sale_item.cost_price,
      v_sale_item.discount,
      round((v_allocated_sale_discount / v_sale_item.quantity) * v_quantity, 2),
      v_refund_amount
    );

    v_total_refund := v_total_refund + v_refund_amount;
  end loop;

  v_return_receipt_number := public.next_return_receipt_number(v_business_id);

  insert into public.sales_returns (
    business_id,
    original_sale_id,
    return_receipt_number,
    processed_by,
    refund_method,
    refund_amount,
    refund_reference,
    reason
  )
  values (
    v_business_id,
    p_sale_id,
    v_return_receipt_number,
    v_user_id,
    p_refund_method,
    v_total_refund,
    v_refund_reference,
    v_reason
  )
  returning id into v_return_id;

  for v_item in select to_jsonb(line) from pg_temp.jiuze_return_lines line
  loop
    insert into public.sales_return_items (
      business_id,
      return_id,
      original_sale_item_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      cost_price,
      line_discount,
      allocated_sale_discount,
      refund_amount
    )
    values (
      v_business_id,
      v_return_id,
      (v_item->>'sale_item_id')::uuid,
      (v_item->>'product_id')::uuid,
      v_item->>'product_name',
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price')::numeric,
      (v_item->>'cost_price')::numeric,
      (v_item->>'line_discount')::numeric,
      (v_item->>'allocated_sale_discount')::numeric,
      (v_item->>'refund_amount')::numeric
    );

    update public.products
    set stock_quantity = stock_quantity + (v_item->>'quantity')::numeric
    where id = (v_item->>'product_id')::uuid
      and business_id = v_business_id;

    if not found then
      raise exception 'Product for returned item no longer exists in this business';
    end if;

    insert into public.stock_movements (
      business_id,
      product_id,
      type,
      quantity,
      reference_id,
      reason,
      created_by
    )
    values (
      v_business_id,
      (v_item->>'product_id')::uuid,
      'return',
      (v_item->>'quantity')::numeric,
      v_return_id,
      'Return ' || v_return_receipt_number || ' for sale ' || v_sale.receipt_number,
      v_user_id
    );
  end loop;

  return jsonb_build_object(
    'return_id', v_return_id,
    'return_receipt_number', v_return_receipt_number,
    'original_sale_id', p_sale_id,
    'original_receipt_number', v_sale.receipt_number,
    'business_id', v_business_id,
    'refund_method', p_refund_method,
    'refund_amount', v_total_refund,
    'refund_reference', v_refund_reference,
    'reason', v_reason,
    'status', 'completed'
  );
end;
$$;

revoke all on function public.process_sale_return(uuid, jsonb, text, text, text) from public;
grant execute on function public.process_sale_return(uuid, jsonb, text, text, text) to authenticated;
