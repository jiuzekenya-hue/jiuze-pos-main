-- Restaurant payment uses saved prices and deducts inventory only when the item was not already deducted at print.
CREATE OR REPLACE FUNCTION public.complete_restaurant_order(
 p_order_id uuid,p_payment_method text,p_payment_amount numeric,p_payment_reference text DEFAULT NULL::text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
 v_user_id uuid:=auth.uid(); v_business_id uuid; v_created_by uuid; v_discount numeric(12,2); v_status text;
 v_sale_id uuid; v_receipt_number text; v_subtotal numeric:=0; v_total numeric:=0; v_change numeric:=0;
 v_payment_reference text:=nullif(btrim(p_payment_reference),''); v_item record; v_product public.products%rowtype;
BEGIN
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated.' USING errcode='28000'; END IF;
 IF NOT public.is_owner() AND NOT public.has_cashier_permission('openBills') THEN RAISE EXCEPTION 'Open Bills access is required to record payment.' USING errcode='42501'; END IF;
 IF NOT public.has_subscription_access() THEN RAISE EXCEPTION 'Subscription access is required.' USING errcode='42501'; END IF;
 SELECT o.business_id,o.created_by,o.discount,o.status INTO v_business_id,v_created_by,v_discount,v_status FROM public.restaurant_orders o WHERE o.id=p_order_id FOR UPDATE;
 IF v_business_id IS NULL THEN RAISE EXCEPTION 'Restaurant order not found.'; END IF;
 IF v_business_id<>public.auth_business_id() THEN RAISE EXCEPTION 'Restaurant order does not belong to your business.' USING errcode='42501'; END IF;
 IF v_status<>'open' THEN RAISE EXCEPTION 'Only open restaurant orders can be paid.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.restaurant_order_prints pr WHERE pr.order_id=p_order_id AND pr.business_id=v_business_id AND pr.print_type='order_slip') THEN RAISE EXCEPTION 'A successful order-slip print is required before taking payment.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.restaurant_order_items i WHERE i.order_id=p_order_id) THEN RAISE EXCEPTION 'Restaurant order has no items.'; END IF;
 IF p_payment_method NOT IN ('cash','mpesa','card') THEN RAISE EXCEPTION 'Invalid payment method.'; END IF;
 IF p_payment_method IN ('mpesa','card') AND v_payment_reference IS NULL THEN RAISE EXCEPTION 'Payment reference is required for % payments',p_payment_method; END IF;
 IF p_payment_amount IS NULL OR p_payment_amount<0 THEN RAISE EXCEPTION 'Payment amount cannot be negative.'; END IF;

 FOR v_item IN SELECT i.id AS item_id,i.product_id,i.product_name,i.quantity,i.unit_price,i.stock_deducted_at FROM public.restaurant_order_items i WHERE i.order_id=p_order_id ORDER BY i.created_at,i.id LOOP
  IF v_item.product_id IS NULL THEN RAISE EXCEPTION 'An order item has no linked product.'; END IF;
  SELECT * INTO v_product FROM public.products p WHERE p.id=v_item.product_id AND p.business_id=v_business_id FOR UPDATE;
  IF NOT FOUND OR NOT v_product.is_active THEN RAISE EXCEPTION 'One or more products in this order are no longer available.'; END IF;
  IF v_product.unit_type IN ('piece','pack') AND v_item.quantity<>trunc(v_item.quantity) THEN RAISE EXCEPTION 'Product "%" requires a whole-number quantity.',v_product.name; END IF;
  IF v_item.stock_deducted_at IS NULL AND v_product.stock_quantity<v_item.quantity THEN RAISE EXCEPTION 'Insufficient stock for "%": % available, % required. Reconcile this previously printed order before payment.',v_product.name,v_product.stock_quantity,v_item.quantity USING ERRCODE='check_violation'; END IF;
  v_subtotal:=v_subtotal+(v_item.unit_price*v_item.quantity);
 END LOOP;

 v_total:=v_subtotal-coalesce(v_discount,0);
 IF v_total<0 THEN RAISE EXCEPTION 'Order discount exceeds subtotal.'; END IF;
 IF p_payment_method='cash' THEN
  IF p_payment_amount<v_total THEN RAISE EXCEPTION 'Amount received (%) is less than the order total (%).',p_payment_amount,v_total; END IF;
  v_change:=p_payment_amount-v_total;
 ELSIF p_payment_amount<>v_total THEN
  RAISE EXCEPTION 'Payment amount (%) must equal the order total (%) for % payments.',p_payment_amount,v_total,p_payment_method;
 END IF;

 v_receipt_number:=public.next_receipt_number(v_business_id);
 INSERT INTO public.sales(business_id,receipt_number,cashier_id,subtotal,discount,total,status) VALUES(v_business_id,v_receipt_number,v_created_by,v_subtotal,coalesce(v_discount,0),v_total,'completed') RETURNING id INTO v_sale_id;
 FOR v_item IN SELECT i.id AS item_id,i.product_id,i.product_name,i.quantity,i.unit_price,i.stock_deducted_at FROM public.restaurant_order_items i WHERE i.order_id=p_order_id ORDER BY i.created_at,i.id LOOP
  SELECT * INTO v_product FROM public.products p WHERE p.id=v_item.product_id AND p.business_id=v_business_id FOR UPDATE;
  INSERT INTO public.sale_items(sale_id,product_id,product_name,quantity,unit_price,cost_price,discount,subtotal) VALUES(v_sale_id,v_product.id,v_item.product_name,v_item.quantity,v_item.unit_price,v_product.cost_price,0,v_item.unit_price*v_item.quantity);
  IF v_item.stock_deducted_at IS NULL THEN
   UPDATE public.products SET stock_quantity=stock_quantity-v_item.quantity WHERE id=v_product.id AND business_id=v_business_id AND stock_quantity>=v_item.quantity;
   IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient stock for "%"; payment was not recorded.',v_product.name USING ERRCODE='check_violation'; END IF;
   INSERT INTO public.stock_movements(business_id,product_id,type,quantity,reference_id,reason,created_by) VALUES(v_business_id,v_product.id,'sale',-v_item.quantity,v_sale_id,'Restaurant order payment '||p_order_id::text,v_created_by);
   UPDATE public.restaurant_order_items SET stock_deducted_at=now() WHERE id=v_item.item_id;
  END IF;
 END LOOP;
 INSERT INTO public.payments(business_id,sale_id,method,amount,reference) VALUES(v_business_id,v_sale_id,p_payment_method,p_payment_amount,v_payment_reference);
 UPDATE public.restaurant_orders SET status='paid',sale_id=v_sale_id,paid_by=v_user_id,paid_at=now(),updated_at=now() WHERE id=p_order_id;
 RETURN jsonb_build_object('sale_id',v_sale_id,'receipt_number',v_receipt_number,'business_id',v_business_id,'subtotal',v_subtotal,'discount',coalesce(v_discount,0),'total',v_total,'payment_method',p_payment_method,'amount_paid',p_payment_amount,'change',v_change,'status','completed');
END; $$;
REVOKE ALL ON FUNCTION public.complete_restaurant_order(uuid,text,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_restaurant_order(uuid,text,numeric,text) TO authenticated;
NOTIFY pgrst,'reload schema';
