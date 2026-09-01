-- JIUZE POS — Phase 4, Migration 5
-- Controlled stock adjustments.
--
-- Stock movements are append-only audit records. The client must not be
-- allowed to write arbitrary stock_movements rows or change products.stock
-- directly. This function performs the product update and audit insert in
-- one transaction, scoped to the caller's business and owner role.

create function public.adjust_stock(
  p_product_id uuid,
  p_quantity_delta integer,
  p_type text default 'adjustment',
  p_reason text default null
)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id      uuid := auth.uid();
  v_business_id  uuid;
  v_product      public.products%rowtype;
  v_reason       text := nullif(btrim(coalesce(p_reason, '')), '');
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

  if not public.is_owner() then
    raise exception 'Only the business owner can adjust stock' using errcode = '42501';
  end if;

  if p_product_id is null then
    raise exception 'Product is required';
  end if;

  if p_quantity_delta is null or p_quantity_delta = 0 then
    raise exception 'Stock adjustment quantity cannot be zero';
  end if;

  if p_type not in ('purchase', 'adjustment', 'return', 'damage') then
    raise exception 'Invalid stock movement type: %', p_type;
  end if;

  if p_type in ('adjustment', 'damage') and v_reason is null then
    raise exception 'A reason is required for % movements', p_type;
  end if;

  -- Lock the product row so two simultaneous adjustments cannot overwrite
  -- each other's stock quantity.
  select *
    into v_product
  from public.products
  where id = p_product_id
    and business_id = v_business_id
  for update;

  if not found then
    raise exception 'Product % not found for this business', p_product_id;
  end if;

  update public.products
  set stock_quantity = stock_quantity + p_quantity_delta
  where id = v_product.id
  returning * into v_product;

  insert into public.stock_movements
    (business_id, product_id, type, quantity, reference_id, reason, created_by)
  values
    (
      v_business_id,
      v_product.id,
      p_type,
      p_quantity_delta,
      null,
      coalesce(v_reason, initcap(p_type) || ' stock'),
      v_user_id
    );

  return v_product;
end;
$$;

revoke all on function public.adjust_stock(uuid, integer, text, text) from public;
grant execute on function public.adjust_stock(uuid, integer, text, text) to authenticated;
