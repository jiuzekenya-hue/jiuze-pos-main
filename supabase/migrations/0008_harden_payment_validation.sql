-- JIUZE POS — Migration 8
-- Harden payment validation at the database boundary.
-- Frontend validation is not sufficient because complete_sale() is callable
-- directly by an authenticated client.

create or replace function public.complete_sale(
  p_items jsonb,
  p_payment_method text,
  p_payment_amount numeric,
  p_payment_reference text default null,
  p_discount numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cashier_id      uuid := auth.uid();
  v_business_id     uuid;
  v_allow_negative  boolean;
  v_receipt_number  text;
  v_sale_id         uuid;
  v_item            jsonb;
  v_product         public.products%rowtype;
  v_quantity        integer;
  v_item_discount   numeric;
  v_line_subtotal   numeric;
  v_subtotal        numeric := 0;
  v_discount        numeric := coalesce(p_discount, 0);
  v_total           numeric;
  v_change          numeric := 0;
  v_payment_reference text := nullif(btrim(p_payment_reference), '');
begin
  if v_cashier_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select business_id into v_business_id from public.profiles where id = v_cashier_id;
  if v_business_id is null then
    raise exception 'No business is associated with this user' using errcode = '28000';
  end if;

  if p_payment_method not in ('cash', 'mpesa', 'card') then
    raise exception 'Invalid payment method: %', p_payment_method;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  if v_discount < 0 then
    raise exception 'Discount cannot be negative';
  end if;

  if p_payment_amount is null or p_payment_amount < 0 then
    raise exception 'Payment amount cannot be negative';
  end if;

  if p_payment_method in ('mpesa', 'card') and v_payment_reference is null then
    raise exception 'Payment reference is required for % payments', p_payment_method;
  end if;

  select allow_negative_stock into v_allow_negative
  from public.settings
  where business_id = v_business_id;
  v_allow_negative := coalesce(v_allow_negative, false);

  v_receipt_number := public.next_receipt_number(v_business_id);

  -- Pass 1: validate every line and lock product rows so concurrent
  -- checkouts cannot oversell the same stock.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if not (v_item ? 'product_id') or not (v_item ? 'quantity') then
      raise exception 'Each cart item requires product_id and quantity';
    end if;

    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Item quantity must be a positive integer';
    end if;

    v_item_discount := coalesce((v_item->>'discount')::numeric, 0);
    if v_item_discount < 0 then
      raise exception 'Item discount cannot be negative';
    end if;

    select * into v_product
    from public.products
    where id = (v_item->>'product_id')::uuid
      and business_id = v_business_id
    for update;

    if not found then
      raise exception 'Product % not found for this business', v_item->>'product_id';
    end if;

    if not v_product.is_active then
      raise exception 'Product "%" is not active and cannot be sold', v_product.name;
    end if;

    if not v_allow_negative and v_product.stock_quantity < v_quantity then
      raise exception 'Insufficient stock for "%": only % available', v_product.name, v_product.stock_quantity;
    end if;

    v_line_subtotal := (v_product.selling_price * v_quantity) - v_item_discount;
    if v_line_subtotal < 0 then
      raise exception 'Item discount exceeds item total for "%"', v_product.name;
    end if;

    v_subtotal := v_subtotal + v_line_subtotal;
  end loop;

  v_total := v_subtotal - v_discount;
  if v_total < 0 then
    raise exception 'Sale-level discount exceeds subtotal';
  end if;

  -- Cash may exceed the total (change is returned). M-Pesa and card
  -- must match the sale total exactly because there is no cash-change flow.
  if p_payment_method = 'cash' then
    if p_payment_amount < v_total then
      raise exception 'Amount received (%) is less than the total due (%)', p_payment_amount, v_total;
    end if;
    v_change := p_payment_amount - v_total;
  elsif p_payment_amount <> v_total then
    raise exception 'Payment amount (%) must equal the total due (%) for % payments',
      p_payment_amount, v_total, p_payment_method;
  end if;

  -- Pass 2: everything validated — create the sale and its children.
  insert into public.sales (business_id, receipt_number, cashier_id, subtotal, discount, total, status)
  values (v_business_id, v_receipt_number, v_cashier_id, v_subtotal, v_discount, v_total, 'completed')
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item->>'quantity')::integer;
    v_item_discount := coalesce((v_item->>'discount')::numeric, 0);

    select * into v_product
    from public.products
    where id = (v_item->>'product_id')::uuid;

    insert into public.sale_items
      (sale_id, product_id, product_name, quantity, unit_price, cost_price, discount, subtotal)
    values (
      v_sale_id,
      v_product.id,
      v_product.name,
      v_quantity,
      v_product.selling_price,
      v_product.cost_price,
      v_item_discount,
      (v_product.selling_price * v_quantity) - v_item_discount
    );

    insert into public.stock_movements
      (business_id, product_id, type, quantity, reference_id, reason, created_by)
    values (
      v_business_id,
      v_product.id,
      'sale',
      -v_quantity,
      v_sale_id,
      'Sale ' || v_receipt_number,
      v_cashier_id
    );

    update public.products
    set stock_quantity = stock_quantity - v_quantity
    where id = v_product.id;
  end loop;

  insert into public.payments (business_id, sale_id, method, amount, reference)
  values (v_business_id, v_sale_id, p_payment_method, p_payment_amount, v_payment_reference);

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'receipt_number', v_receipt_number,
    'business_id', v_business_id,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'total', v_total,
    'payment_method', p_payment_method,
    'amount_paid', p_payment_amount,
    'change', v_change,
    'status', 'completed'
  );
end;
$$;

revoke all on function public.complete_sale(jsonb, text, numeric, text, numeric) from public;
grant execute on function public.complete_sale(jsonb, text, numeric, text, numeric) to authenticated;
