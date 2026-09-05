-- JIUZE POS — Migration 11
-- Subscription access enforcement
--
-- Commercial businesses:
--   - Can continue reading their data after subscription expiry.
--   - Cannot create sales, adjust stock, or modify business data
--     while their subscription is inactive.
--
-- Internal JIUZE business:
--   - subscription_exempt = true
--   - Not subject to commercial subscription enforcement.
--
-- Database enforcement is authoritative.
-- Frontend subscription checks are UX only.


-- =====================================================================
-- 1. BUSINESS-LEVEL SUBSCRIPTION EXEMPTION
-- =====================================================================

alter table public.businesses
  add column if not exists subscription_exempt boolean
    not null default false;


-- JIUZE Kenya's internal business is exempt.
-- All other businesses remain false.
update public.businesses
set subscription_exempt = true
where id = 'aaaaaaaa-0000-0000-0000-000000000001';


-- =====================================================================
-- 2. PROTECT subscription_exempt FROM AUTHENTICATED USERS
--
-- The exemption is an internal platform-level setting.
-- A normal business owner must never be able to change their own
-- subscription_exempt flag through the normal application.
--
-- Service-role/backend operations can still change it when necessary.
-- =====================================================================

create or replace function public.prevent_subscription_exemption_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and coalesce(auth.role(), '') <> 'service_role'
     and new.subscription_exempt is distinct from old.subscription_exempt then

    raise exception 'Subscription exemption cannot be changed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_subscription_exemption_change
on public.businesses;

create trigger prevent_subscription_exemption_change
before update on public.businesses
for each row
execute function public.prevent_subscription_exemption_change();


revoke all
on function public.prevent_subscription_exemption_change()
from public;


-- =====================================================================
-- 3. BOOLEAN SUBSCRIPTION ACCESS CHECK
--
-- Returns TRUE when the current authenticated user's business has
-- subscription access.
--
-- This function is intended for RLS policies.
-- It does not raise exceptions.
-- =====================================================================

create or replace function public.has_subscription_access()
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_subscription_exempt boolean;
  v_status text;
  v_trial_end timestamptz;
  v_current_period_end timestamptz;
begin
  if v_user_id is null then
    return false;
  end if;

  select
    p.business_id,
    b.subscription_exempt
  into
    v_business_id,
    v_subscription_exempt
  from public.profiles p
  join public.businesses b
    on b.id = p.business_id
  where p.id = v_user_id;

  if v_business_id is null then
    return false;
  end if;

  if coalesce(v_subscription_exempt, false) then
    return true;
  end if;

  select
    s.status,
    s.trial_end,
    s.current_period_end
  into
    v_status,
    v_trial_end,
    v_current_period_end
  from public.subscriptions s
  where s.business_id = v_business_id
  limit 1;

  if v_status = 'trialing'
     and v_trial_end is not null
     and v_trial_end > now() then
    return true;
  end if;

  if v_status = 'active'
     and v_current_period_end is not null
     and v_current_period_end > now() then
    return true;
  end if;

  return false;
end;
$$;

revoke all
on function public.has_subscription_access()
from public;

grant execute
on function public.has_subscription_access()
to authenticated;


-- =====================================================================
-- 4. RAISING SUBSCRIPTION ACCESS GUARD
--
-- Used by SECURITY DEFINER transactional functions.
-- =====================================================================

create or replace function public.assert_subscription_access()
returns void
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.has_subscription_access() then
    raise exception 'Subscription inactive or expired'
      using errcode = '42501';
  end if;
end;
$$;

revoke all
on function public.assert_subscription_access()
from public;

grant execute
on function public.assert_subscription_access()
to authenticated;


-- =====================================================================
-- 5. PROTECT BUSINESS REFERENCE-DATA WRITES
--
-- Reads remain available.
-- Writes require active subscription/trial or exemption.
-- =====================================================================


-- ---------------------------------------------------------------------
-- BUSINESSES
-- ---------------------------------------------------------------------

drop policy if exists businesses_update_owner
on public.businesses;

create policy businesses_update_owner
on public.businesses
for update
to authenticated
using (
  id = public.auth_business_id()
  and public.is_owner()
  and public.has_subscription_access()
)
with check (
  id = public.auth_business_id()
  and public.is_owner()
  and public.has_subscription_access()
);


-- ---------------------------------------------------------------------
-- CATEGORIES
-- ---------------------------------------------------------------------

drop policy if exists categories_insert_owner
on public.categories;

create policy categories_insert_owner
on public.categories
for insert
to authenticated
with check (
  business_id = public.auth_business_id()
  and public.is_owner()
  and public.has_subscription_access()
);


drop policy if exists categories_update_owner
on public.categories;

create policy categories_update_owner
on public.categories
for update
to authenticated
using (
  business_id = public.auth_business_id()
  and public.is_owner()
  and public.has_subscription_access()
)
with check (
  business_id = public.auth_business_id()
  and public.is_owner()
  and public.has_subscription_access()
);


drop policy if exists categories_delete_owner
on public.categories;

create policy categories_delete_owner
on public.categories
for delete
to authenticated
using (
  business_id = public.auth_business_id()
  and public.is_owner()
  and public.has_subscription_access()
);


-- ---------------------------------------------------------------------
-- PRODUCTS
-- ---------------------------------------------------------------------

drop policy if exists products_insert_owner
on public.products;

create policy products_insert_owner
on public.products
for insert
to authenticated
with check (
  business_id = public.auth_business_id()
  and public.is_owner()
  and public.has_subscription_access()
);


drop policy if exists products_update_owner
on public.products;

create policy products_update_owner
on public.products
for update
to authenticated
using (
  business_id = public.auth_business_id()
  and public.is_owner()
  and public.has_subscription_access()
)
with check (
  business_id = public.auth_business_id()
  and public.is_owner()
  and public.has_subscription_access()
);


-- ---------------------------------------------------------------------
-- PROFILES / CASHIER MANAGEMENT
-- ---------------------------------------------------------------------

drop policy if exists profiles_insert_owner_adds_cashier
on public.profiles;

create policy profiles_insert_owner_adds_cashier
on public.profiles
for insert
to authenticated
with check (
  public.is_owner()
  and business_id = public.auth_business_id()
  and role = 'cashier'::text
  and public.has_subscription_access()
);


drop policy if exists profiles_update_owner
on public.profiles;

create policy profiles_update_owner
on public.profiles
for update
to authenticated
using (
  business_id = public.auth_business_id()
  and public.is_owner()
  and public.has_subscription_access()
)
with check (
  business_id = public.auth_business_id()
  and public.has_subscription_access()
);


-- ---------------------------------------------------------------------
-- SETTINGS
-- ---------------------------------------------------------------------

drop policy if exists settings_update_owner
on public.settings;

create policy settings_update_owner
on public.settings
for update
to authenticated
using (
  business_id = public.auth_business_id()
  and public.is_owner()
  and public.has_subscription_access()
)
with check (
  business_id = public.auth_business_id()
  and public.is_owner()
  and public.has_subscription_access()
);


-- =====================================================================
-- 6. REPLACE complete_sale WITH SUBSCRIPTION GUARD
-- =====================================================================

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
begin
  if v_cashier_id is null then
    raise exception 'Not authenticated'
      using errcode = '28000';
  end if;

  select business_id
    into v_business_id
  from public.profiles
  where id = v_cashier_id;

  if v_business_id is null then
    raise exception 'No business is associated with this user'
      using errcode = '28000';
  end if;

  -- Authoritative subscription check.
  perform public.assert_subscription_access();

  if p_payment_method not in ('cash', 'mpesa', 'card') then
    raise exception 'Invalid payment method: %', p_payment_method;
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  if v_discount < 0 then
    raise exception 'Discount cannot be negative';
  end if;

  select allow_negative_stock
    into v_allow_negative
  from public.settings
  where business_id = v_business_id;

  v_allow_negative := coalesce(v_allow_negative, false);

  v_receipt_number := public.next_receipt_number(v_business_id);

  -- Pass 1: validate every line and lock product rows.
  for v_item in
    select * from jsonb_array_elements(p_items)
  loop
    if not (v_item ? 'product_id')
       or not (v_item ? 'quantity') then
      raise exception 'Each cart item requires product_id and quantity';
    end if;

    v_quantity := (v_item->>'quantity')::integer;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Item quantity must be a positive integer';
    end if;

    v_item_discount :=
      coalesce((v_item->>'discount')::numeric, 0);

    if v_item_discount < 0 then
      raise exception 'Item discount cannot be negative';
    end if;

    select *
      into v_product
    from public.products
    where id = (v_item->>'product_id')::uuid
      and business_id = v_business_id
    for update;

    if not found then
      raise exception
        'Product % not found for this business',
        v_item->>'product_id';
    end if;

    if not v_product.is_active then
      raise exception
        'Product "%" is not active and cannot be sold',
        v_product.name;
    end if;

    if not v_allow_negative
       and v_product.stock_quantity < v_quantity then
      raise exception
        'Insufficient stock for "%": only % available',
        v_product.name,
        v_product.stock_quantity;
    end if;

    v_line_subtotal :=
      (v_product.selling_price * v_quantity) - v_item_discount;

    if v_line_subtotal < 0 then
      raise exception
        'Item discount exceeds item total for "%"',
        v_product.name;
    end if;

    v_subtotal := v_subtotal + v_line_subtotal;
  end loop;

  v_total := v_subtotal - v_discount;

  if v_total < 0 then
    raise exception 'Sale-level discount exceeds subtotal';
  end if;

  if p_payment_method = 'cash'
     and p_payment_amount < v_total then
    raise exception
      'Amount received (%) is less than the total due (%)',
      p_payment_amount,
      v_total;
  end if;

  if p_payment_amount < 0 then
    raise exception 'Payment amount cannot be negative';
  end if;

  -- Pass 2: create the sale and its children.
  insert into public.sales (
    business_id,
    receipt_number,
    cashier_id,
    subtotal,
    discount,
    total,
    status
  )
  values (
    v_business_id,
    v_receipt_number,
    v_cashier_id,
    v_subtotal,
    v_discount,
    v_total,
    'completed'
  )
  returning id into v_sale_id;

  for v_item in
    select * from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item->>'quantity')::integer;

    v_item_discount :=
      coalesce((v_item->>'discount')::numeric, 0);

    select *
      into v_product
    from public.products
    where id = (v_item->>'product_id')::uuid;

    insert into public.sale_items (
      sale_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      cost_price,
      discount,
      subtotal
    )
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

  if p_payment_method = 'cash' then
    v_change := p_payment_amount - v_total;
  end if;

  insert into public.payments (
    business_id,
    sale_id,
    method,
    amount,
    reference
  )
  values (
    v_business_id,
    v_sale_id,
    p_payment_method,
    p_payment_amount,
    p_payment_reference
  );

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

revoke all
on function public.complete_sale(
  jsonb,
  text,
  numeric,
  text,
  numeric
)
from public;

grant execute
on function public.complete_sale(
  jsonb,
  text,
  numeric,
  text,
  numeric
)
to authenticated;


-- =====================================================================
-- 7. REPLACE adjust_stock WITH SUBSCRIPTION GUARD
-- =====================================================================

create or replace function public.adjust_stock(
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
  v_reason       text :=
    nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_user_id is null then
    raise exception 'Not authenticated'
      using errcode = '28000';
  end if;

  select business_id
    into v_business_id
  from public.profiles
  where id = v_user_id;

  if v_business_id is null then
    raise exception 'No business is associated with this user'
      using errcode = '28000';
  end if;

  if not public.is_owner() then
    raise exception
      'Only the business owner can adjust stock'
      using errcode = '42501';
  end if;

  -- Authoritative subscription check.
  perform public.assert_subscription_access();

  if p_product_id is null then
    raise exception 'Product is required';
  end if;

  if p_quantity_delta is null
     or p_quantity_delta = 0 then
    raise exception
      'Stock adjustment quantity cannot be zero';
  end if;

  if p_type not in (
    'purchase',
    'adjustment',
    'return',
    'damage'
  ) then
    raise exception
      'Invalid stock movement type: %',
      p_type;
  end if;

  if p_type in ('adjustment', 'damage')
     and v_reason is null then
    raise exception
      'A reason is required for % movements',
      p_type;
  end if;

  select *
    into v_product
  from public.products
  where id = p_product_id
    and business_id = v_business_id
  for update;

  if not found then
    raise exception
      'Product % not found for this business',
      p_product_id;
  end if;

  update public.products
  set stock_quantity = stock_quantity + p_quantity_delta
  where id = v_product.id
  returning * into v_product;

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
    v_product.id,
    p_type,
    p_quantity_delta,
    null,
    coalesce(
      v_reason,
      initcap(p_type) || ' stock'
    ),
    v_user_id
  );

  return v_product;
end;
$$;

revoke all
on function public.adjust_stock(
  uuid,
  integer,
  text,
  text
)
from public;

grant execute
on function public.adjust_stock(
  uuid,
  integer,
  text,
  text
)
to authenticated;


-- =====================================================================
-- 8. MIGRATION COMPLETE
-- =====================================================================
--
-- Expired businesses:
--   SELECT/read access remains available.
--   Transactional writes are blocked.
--   Reference-data writes are blocked.
--
-- Active/trialing businesses:
--   Existing functionality remains available.
--
-- JIUZE Kenya:
--   subscription_exempt = true.
--
-- TAMZ ENTERPRICES:
--   subscription_exempt remains false.
--   Existing 7-day Start trial remains untouched.
-- =====================================================================