-- JIUZE POS — Settle printed restaurant orders after service even when current stock is below ordered quantity.
-- Uses the saved order prices, preserves original cashier attribution, and records the actual payment collector.
-- This does not change normal retail checkout validation.

CREATE OR REPLACE FUNCTION public.complete_restaurant_order(
  p_order_id uuid,
  p_payment_method text,
  p_payment_amount numeric,
  p_payment_reference text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  if not public.is_owner() and not public.has_cashier_permission('openBills') then
    raise exception 'Open Bills access is required to record payment.' using errcode = '42501';
  end if;
  if not public.has_subscription_access() then
    raise exception 'Subscription access is required.' using errcode = '42501';
  end if;

  select o.business_id, o.created_by, o.discount, o.status
    into v_business_id, v_created_by, v_discount, v_status
    from public.restaurant_orders o
   where o.id = p_order_id
   for update;

  if v_business_id is null then raise exception 'Restaurant order not found.'; end if;
  if v_business_id <> public.auth_business_id() then
    raise exception 'Restaurant order does not belong to your business.' using errcode = '42501';
  end if;
  if v_status <> 'open' then raise exception 'Only open restaurant orders can be paid.'; end if;
  if not exists (
    select 1 from public.restaurant_order_prints pr
     where pr.order_id = p_order_id and pr.business_id = v_business_id and pr.print_type = 'order_slip'
  ) then raise exception 'A successful order-slip print is required before taking payment.'; end if;
  if not exists (select 1 from public.restaurant_order_items i where i.order_id = p_order_id) then
    raise exception 'Restaurant order has no items.';
  end if;
  if p_payment_method not in ('cash','mpesa','card') then raise exception 'Invalid payment method.'; end if;
  if p_payment_method in ('mpesa','card') and v_payment_reference is null then
    raise exception 'Payment reference is required for % payments', p_payment_method;
  end if;
  if p_payment_amount is null or p_payment_amount < 0 then raise exception 'Payment amount cannot be negative.'; end if;

  -- Orders are served before the owner/cashier settles them. Do not block payment
  -- because current stock changed after service; the sale records the shortage.
  -- Order saving/printing does not deduct stock, so stock is deducted once here.
  for v_item in
    select i.product_id, i.product_name, i.quantity, i.unit_price
      from public.restaurant_order_items i
     where i.order_id = p_order_id
     order by i.created_at, i.id
  loop
    if v_item.product_id is null then raise exception 'An order item has no linked product.'; end if;
    select * into v_product from public.products p
     where p.id = v_item.product_id and p.business_id = v_business_id for update;
    if not found or not v_product.is_active then
      raise exception 'One or more products in this order are no longer available.';
    end if;
    if v_product.unit_type in ('piece','pack') and v_item.quantity <> trunc(v_item.quantity) then
      raise exception 'Product "%" requires a whole-number quantity.', v_product.name;
    end if;
    v_subtotal := v_subtotal + (v_item.unit_price * v_item.quantity);
  end loop;

  v_total := v_subtotal - coalesce(v_discount,0);
  if v_total < 0 then raise exception 'Order discount exceeds subtotal.'; end if;
  if p_payment_method = 'cash' then
    if p_payment_amount < v_total then
      raise exception 'Amount received (%) is less than the order total (%).', p_payment_amount, v_total;
    end if;
    v_change := p_payment_amount - v_total;
  elsif p_payment_amount <> v_total then
    raise exception 'Payment amount (%) must equal the order total (%) for % payments.', p_payment_amount, v_total, p_payment_method;
  end if;

  v_receipt_number := public.next_receipt_number(v_business_id);
  insert into public.sales (business_id, receipt_number, cashier_id, subtotal, discount, total, status)
  values (v_business_id, v_receipt_number, v_created_by, v_subtotal, coalesce(v_discount,0), v_total, 'completed')
  returning id into v_sale_id;

  for v_item in
    select i.product_id, i.product_name, i.quantity, i.unit_price
      from public.restaurant_order_items i
     where i.order_id = p_order_id
     order by i.created_at, i.id
  loop
    select * into v_product from public.products p
     where p.id = v_item.product_id and p.business_id = v_business_id for update;

    insert into public.sale_items
      (sale_id, product_id, product_name, quantity, unit_price, cost_price, discount, subtotal)
    values
      (v_sale_id, v_product.id, v_item.product_name, v_item.quantity, v_item.unit_price,
       v_product.cost_price, 0, v_item.unit_price * v_item.quantity);

    insert into public.stock_movements
      (business_id, product_id, type, quantity, reference_id, reason, created_by)
    values
      (v_business_id, v_product.id, 'sale', -v_item.quantity, v_sale_id,
       'Restaurant order payment ' || p_order_id::text, v_created_by);

    update public.products set stock_quantity = stock_quantity - v_item.quantity
     where id = v_item.product_id and business_id = v_business_id;
  end loop;

  insert into public.payments (business_id, sale_id, method, amount, reference)
  values (v_business_id, v_sale_id, p_payment_method, p_payment_amount, v_payment_reference);

  update public.restaurant_orders
     set status = 'paid', sale_id = v_sale_id, paid_by = v_user_id, paid_at = now(), updated_at = now()
   where id = p_order_id;

  return jsonb_build_object(
    'sale_id', v_sale_id, 'receipt_number', v_receipt_number, 'business_id', v_business_id,
    'subtotal', v_subtotal, 'discount', coalesce(v_discount,0), 'total', v_total,
    'payment_method', p_payment_method, 'amount_paid', p_payment_amount,
    'change', v_change, 'status', 'completed'
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.complete_restaurant_order(uuid, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_restaurant_order(uuid, text, numeric, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
