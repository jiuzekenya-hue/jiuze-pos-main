-- JIUZE POS: allow owners to settle printed restaurant bills when stock
-- has already reached zero, without attempting a second/negative deduction.
--
-- A NULL stock_deducted_at identifies legacy/late-added order lines that
-- were not deducted at print. If stock remains available, payment deducts it
-- once. If stock is already below the order quantity, payment records an
-- explicit reconciliation timestamp and leaves inventory unchanged. This
-- preserves the physical stock count while allowing settlement.

alter table public.restaurant_order_items
  add column if not exists stock_reconciled_at timestamptz;

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
  v_created_by uuid;
  v_discount numeric(12,2);
  v_status text;
  v_sale_id uuid;
  v_receipt_number text;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_change numeric := 0;
  v_payment_reference text := nullif(btrim(p_payment_reference), '');
  v_item record;
  v_product public.products%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  if not public.is_owner()
     and not public.has_cashier_permission('openBills') then
    raise exception 'Open Bills access is required to record payment.'
      using errcode = '42501';
  end if;

  if not public.has_subscription_access() then
    raise exception 'Subscription access is required.'
      using errcode = '42501';
  end if;

  select o.business_id, o.created_by, o.discount, o.status
    into v_business_id, v_created_by, v_discount, v_status
    from public.restaurant_orders o
   where o.id = p_order_id
   for update;

  if v_business_id is null then
    raise exception 'Restaurant order not found.';
  end if;

  if v_business_id <> public.auth_business_id() then
    raise exception 'Restaurant order does not belong to your business.'
      using errcode = '42501';
  end if;

  if v_status <> 'open' then
    raise exception 'Only open restaurant orders can be paid.';
  end if;

  if not exists (
    select 1 from public.restaurant_order_prints pr
     where pr.order_id = p_order_id
       and pr.business_id = v_business_id
       and pr.print_type = 'order_slip'
  ) then
    raise exception 'A successful order-slip print is required before taking payment.';
  end if;

  if not exists (
    select 1 from public.restaurant_order_items i
     where i.order_id = p_order_id
  ) then
    raise exception 'Restaurant order has no items.';
  end if;

  if p_payment_method not in ('cash', 'mpesa', 'card') then
    raise exception 'Invalid payment method.';
  end if;

  if p_payment_method in ('mpesa', 'card') and v_payment_reference is null then
    raise exception 'Payment reference is required for % payments', p_payment_method;
  end if;

  if p_payment_amount is null or p_payment_amount < 0 then
    raise exception 'Payment amount cannot be negative.';
  end if;

  -- Validate product identity and calculate the frozen order total.
  -- Do not reject a printed bill because live stock has since reached zero.
  for v_item in
    select i.id as item_id, i.product_id, i.product_name, i.quantity,
           i.unit_price, i.stock_deducted_at
      from public.restaurant_order_items i
     where i.order_id = p_order_id
     order by i.created_at, i.id
  loop
    if v_item.product_id is null then
      raise exception 'An order item has no linked product.';
    end if;

    select * into v_product
      from public.products p
     where p.id = v_item.product_id
       and p.business_id = v_business_id
     for update;

    if not found or not v_product.is_active then
      raise exception 'One or more products in this order are no longer available.';
    end if;

    if v_product.unit_type in ('piece', 'pack')
       and v_item.quantity <> trunc(v_item.quantity) then
      raise exception 'Product "%" requires a whole-number quantity.', v_product.name;
    end if;

    v_subtotal := v_subtotal + (v_item.unit_price * v_item.quantity);
  end loop;

  v_total := v_subtotal - coalesce(v_discount, 0);
  if v_total < 0 then
    raise exception 'Order discount exceeds subtotal.';
  end if;

  if p_payment_method = 'cash' then
    if p_payment_amount < v_total then
      raise exception 'Amount received (%) is less than the order total (%).',
        p_payment_amount, v_total;
    end if;
    v_change := p_payment_amount - v_total;
  elsif p_payment_amount <> v_total then
    raise exception 'Payment amount (%) must equal the order total (%) for % payments.',
      p_payment_amount, v_total, p_payment_method;
  end if;

  v_receipt_number := public.next_receipt_number(v_business_id);

  insert into public.sales
    (business_id, receipt_number, cashier_id, subtotal, discount, total, status)
  values
    (v_business_id, v_receipt_number, v_created_by,
     v_subtotal, coalesce(v_discount, 0), v_total, 'completed')
  returning id into v_sale_id;

  for v_item in
    select i.id as item_id, i.product_id, i.product_name, i.quantity,
           i.unit_price, i.stock_deducted_at
      from public.restaurant_order_items i
     where i.order_id = p_order_id
     order by i.created_at, i.id
  loop
    select * into v_product
      from public.products p
     where p.id = v_item.product_id
       and p.business_id = v_business_id
     for update;

    insert into public.sale_items
      (sale_id, product_id, product_name, quantity, unit_price,
       cost_price, discount, subtotal)
    values
      (v_sale_id, v_product.id, v_item.product_name, v_item.quantity,
       v_item.unit_price, v_product.cost_price, 0,
       v_item.unit_price * v_item.quantity);

    if v_item.stock_deducted_at is null then
      if v_product.stock_quantity >= v_item.quantity then
        -- Legacy/late-added line with stock available: deduct it once.
        update public.products
           set stock_quantity = stock_quantity - v_item.quantity
         where id = v_product.id
           and business_id = v_business_id
           and stock_quantity >= v_item.quantity;

        if not found then
          raise exception 'Stock changed while settling "%". Retry payment.',
            v_product.name using errcode = '40001';
        end if;

        insert into public.stock_movements
          (business_id, product_id, type, quantity, reference_id, reason, created_by)
        values
          (v_business_id, v_product.id, 'sale', -v_item.quantity,
           v_sale_id, 'Restaurant order payment ' || p_order_id::text, v_created_by);

        update public.restaurant_order_items
           set stock_deducted_at = now()
         where id = v_item.item_id;
      else
        -- The printed/served item is already reflected in current stock,
        -- or the physical count needs owner reconciliation. Do not deduct
        -- below zero and do not block payment. Keep a separate audit marker.
        update public.restaurant_order_items
           set stock_reconciled_at = now()
         where id = v_item.item_id
           and stock_deducted_at is null;
      end if;
    end if;
  end loop;

  insert into public.payments
    (business_id, sale_id, method, amount, reference)
  values
    (v_business_id, v_sale_id, p_payment_method,
     p_payment_amount, v_payment_reference);

  update public.restaurant_orders
     set status = 'paid',
         sale_id = v_sale_id,
         paid_by = v_user_id,
         paid_at = now(),
         updated_at = now()
   where id = p_order_id;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'receipt_number', v_receipt_number,
    'business_id', v_business_id,
    'subtotal', v_subtotal,
    'discount', coalesce(v_discount, 0),
    'total', v_total,
    'payment_method', p_payment_method,
    'amount_paid', p_payment_amount,
    'change', v_change,
    'status', 'completed'
  );
end;
$$;

revoke all
on function public.complete_restaurant_order(uuid, text, numeric, text)
from public, anon;

grant execute
on function public.complete_restaurant_order(uuid, text, numeric, text)
to authenticated;

notify pgrst, 'reload schema';
