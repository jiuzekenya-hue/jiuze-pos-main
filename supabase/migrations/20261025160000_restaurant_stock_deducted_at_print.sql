-- Track restaurant item inventory deduction and avoid deducting the same stock twice.
ALTER TABLE public.restaurant_order_items
  ADD COLUMN IF NOT EXISTS stock_deducted_at timestamptz;

CREATE OR REPLACE FUNCTION public.record_restaurant_order_print(p_order_id uuid,p_print_type text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_user_id uuid:=auth.uid(); v_business_id uuid; v_created_by uuid; v_status text; v_print_id uuid; v_item record; v_product public.products%rowtype; v_count integer:=0;
BEGIN
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated.' USING errcode='28000'; END IF;
 IF p_print_type NOT IN ('order_slip','sales_receipt') THEN RAISE EXCEPTION 'Invalid restaurant print type.'; END IF;
 SELECT business_id,created_by,status INTO v_business_id,v_created_by,v_status FROM public.restaurant_orders WHERE id=p_order_id FOR UPDATE;
 IF v_business_id IS NULL THEN RAISE EXCEPTION 'Restaurant order not found.'; END IF;
 IF v_business_id<>public.auth_business_id() THEN RAISE EXCEPTION 'Restaurant order does not belong to your business.'; END IF;
 IF NOT public.is_owner() AND v_created_by<>v_user_id THEN RAISE EXCEPTION 'You can only print your own restaurant order.' USING errcode='42501'; END IF;
 IF p_print_type='order_slip' THEN
  IF v_status<>'open' THEN RAISE EXCEPTION 'Only open orders can print an order slip.'; END IF;
  FOR v_item IN SELECT id,product_id,product_name,quantity FROM public.restaurant_order_items WHERE order_id=p_order_id AND printed_at IS NULL AND stock_deducted_at IS NULL ORDER BY created_at,id FOR UPDATE LOOP
   IF v_item.product_id IS NULL THEN RAISE EXCEPTION 'Order item has no linked product.'; END IF;
   SELECT * INTO v_product FROM public.products WHERE id=v_item.product_id AND business_id=v_business_id FOR UPDATE;
   IF NOT FOUND OR NOT v_product.is_active THEN RAISE EXCEPTION 'Product is no longer available.'; END IF;
   IF v_product.stock_quantity<v_item.quantity THEN RAISE EXCEPTION 'Insufficient stock for "%": % available, % required. Stock unchanged.',v_product.name,v_product.stock_quantity,v_item.quantity USING ERRCODE='check_violation'; END IF;
   UPDATE public.products SET stock_quantity=stock_quantity-v_item.quantity WHERE id=v_product.id AND business_id=v_business_id;
   INSERT INTO public.stock_movements(business_id,product_id,type,quantity,reference_id,reason,created_by) VALUES(v_business_id,v_product.id,'sale',-v_item.quantity,p_order_id,'Restaurant order printed '||p_order_id::text,v_created_by);
   UPDATE public.restaurant_order_items SET printed_at=now(),stock_deducted_at=now() WHERE id=v_item.id;
   v_count:=v_count+1;
  END LOOP;
  IF v_count=0 AND NOT EXISTS (SELECT 1 FROM public.restaurant_order_prints WHERE order_id=p_order_id AND business_id=v_business_id AND print_type='order_slip') THEN RAISE EXCEPTION 'There are no printable items.'; END IF;
 ELSE
  IF v_status<>'paid' THEN RAISE EXCEPTION 'Only paid orders can print a sales receipt.'; END IF;
 END IF;
 INSERT INTO public.restaurant_order_prints(business_id,order_id,printed_by,print_type) VALUES(v_business_id,p_order_id,v_user_id,p_print_type) RETURNING id INTO v_print_id;
 RETURN v_print_id;
END; $$;
REVOKE ALL ON FUNCTION public.record_restaurant_order_print(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_restaurant_order_print(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
