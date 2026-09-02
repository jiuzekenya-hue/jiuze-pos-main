-- Harden payment validation at the database boundary.
-- Cash may exceed the sale total (change is expected), but M-Pesa/card
-- payments must exactly match the sale total and include a reference.

CREATE OR REPLACE FUNCTION public.complete_sale(
  p_items jsonb,
  p_payment_method text,
  p_payment_amount numeric,
  p_payment_reference text DEFAULT NULL::text,
  p_discount numeric DEFAULT 0
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cashier_id      uuid := auth.uid();
  v_business_id     uuid;
  v_allow_negative  boolean;
  v_sale_id         uuid;
  v_receipt_number  text;
  v_subtotal        numeric := 0;
  v_total           numeric := 0;
  v_payment_amount  numeric := coalesce(p_payment_amount, 0);
  v_payment_method  text := lower(trim(coalesce(p_payment_method, '')));
  v_payment_ref     text := nullif(trim(coalesce(p_payment_reference, '')), '');
  v_item            jsonb;
  v_product_id      uuid;
  v_quantity        integer;
  v_item_discount   numeric;
  v_unit_price      numeric;
  v_line_subtotal   numeric;
begin
  if v_cashier_id is null then
    raise exception 'Authentication required';
  end if;

  select business_id into v_business_id
  from public.profiles
  where id = v_cashier_id;

  if v_business_id is null then
    raise exception 'Business profile not found';
  end if;

  if v_payment_method not in ('cash', 'mpesa', 'card') then
    raise exception 'Invalid payment method';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart cannot be empty';
  end if;

  if p_discount is null or p_discount < 0 then
    raise exception 'Invalid sale discount';
  end if;

  if v_payment_amount < 0 then
    raise exception 'Payment amount cannot be negative';
  end if;

  select coalesce(allow_negative_stock, false) into v_allow_negative
  from public.businesses
  where id = v_business_id;

  if not found then
    raise exception 'Business not found';
  end if;

  -- Validate every item and calculate the authoritative subtotal from the DB.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item->>'product_id')::uuid;
      v_quantity := (v_item->>'quantity')::integer;
      v_item_discount := coalesce((v_item->>'discount')::numeric, 0);
    exception when others then
      raise exception 'Invalid cart item';
    end;

    if v_quantity is null or v_quantity <= 0 or (v_item->>'quantity')::numeric <> v_quantity then
      raise exception 'Invalid item quantity';
    end if;

    if v_item_discount < 0 then
      raise exception 'Invalid item discount';
    end if;

    select price, stock_quantity into v_unit_price, v_quantity
    from public.products
    where id = v_product_id
      and business_id = v_business_id
      and is_active = true
    for update;

    if not found then
      raise exception 'Product not found or inactive';
    end if;

    -- Re-read the requested quantity because the SELECT above locks the row.
    v_quantity := (v_item->>'quantity')::integer;

    if not v_allow_negative and (select stock_quantity from public.products where id = v_product_id) < v_quantity then
      raise exception 'Insufficient stock';
    end if;

    v_line_subtotal := (v_unit_price * v_quantity) - v_item_discount;

    if v_line_subtotal < 0 then
      raise exception 'Item discount exceeds line subtotal';
    end if;

    v_subtotal := v_subtotal + v_line_subtotal;
  end loop;

  if p_discount > v_subtotal then
    raise exception 'Sale discount exceeds subtotal';
  end if;

  v_total := v_subtotal - p_discount;

  -- Enforce payment semantics in the database, not only in the frontend.
  if v_payment_method = 'cash' then
    if v_payment_amount < v_total then
      raise exception 'Cash payment is less than sale total';
    end if;
  else
    if v_payment_ref is null then
      raise exception 'Payment reference is required';
    end if;

    if v_payment_amount <> v_total then
      raise exception 'Non-cash payment must exactly match sale total';
    end if;
  end if;

  v_receipt_number := public.next_receipt_number(v_business_id);

  insert into public.sales (
    business_id,
    cashier_id,
    receipt_number,
    subtotal,
    discount,
    total
  ) values (
    v_business_id,
    v_cashier_id,
    v_receipt_number,
    v_subtotal,
    p_discount,
    v_total
  ) returning id into v_sale_id;

  -- Insert line items and apply stock movements.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    v_item_discount := coalesce((v_item->>'discount')::numeric, 0);

    select price into v_unit_price
    from public.products
    where id = v_product_id
      and business_id = v_business_id
      and is_active = true;

    v_line_subtotal := (v_unit_price * v_quantity) - v_item_discount;

    insert into public.sale_items (
      sale_id,
      product_id,
      quantity,
      unit_price,
      discount,
      subtotal
    ) values (
      v_sale_id,
      v_product_id,
      v_quantity,
      v_unit_price,
      v_item_discount,
      v_line_subtotal
    );

    insert into public.stock_movements (
      business_id,
      product_id,
      movement_type,
      quantity,
      reference_type,
      reference_id,
      notes,
      created_by
    ) values (
      v_business_id,
      v_product_id,
      'sale',
      -v_quantity,
      'sale',
      v_sale_id,
      'Stock deducted from completed sale',
      v_cashier_id
    );

    update public.products
    set stock_quantity = stock_quantity - v_quantity,
        updated_at = now()
    where id = v_product_id
      and business_id = v_business_id;
  end loop;

  insert into public.payments (
    sale_id,
    business_id,
    payment_method,
    amount,
    reference
  ) values (
    v_sale_id,
    v_business_id,
    v_payment_method,
    v_payment_amount,
    v_payment_ref
  );

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'receipt_number', v_receipt_number,
    'subtotal', v_subtotal,
    'discount', p_discount,
    'total', v_total,
    'payment_method', v_payment_method,
    'payment_amount', v_payment_amount,
    'payment_reference', v_payment_ref,
    'change', greatest(v_payment_amount - v_total, 0)
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.complete_sale(jsonb, text, numeric, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_sale(jsonb, text, numeric, text, numeric) TO authenticated;
