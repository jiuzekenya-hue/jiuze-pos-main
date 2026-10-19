-- Correct cashier ownership checks and enforce saved view permissions in RLS.
drop policy if exists cashier_permissions_insert_owner on public.cashier_permissions;
create policy cashier_permissions_insert_owner on public.cashier_permissions
for insert to authenticated
with check (
  business_id = public.auth_business_id()
  and public.is_owner()
  and public.has_subscription_access()
  and exists (
    select 1 from public.profiles p
    where p.id = cashier_permissions.cashier_id
      and p.business_id = cashier_permissions.business_id
      and p.role = 'cashier'
  )
);

drop policy if exists cashier_permissions_update_owner on public.cashier_permissions;
create policy cashier_permissions_update_owner on public.cashier_permissions
for update to authenticated
using (business_id = public.auth_business_id() and public.is_owner() and public.has_subscription_access())
with check (
  business_id = public.auth_business_id()
  and public.is_owner()
  and public.has_subscription_access()
  and exists (
    select 1 from public.profiles p
    where p.id = cashier_permissions.cashier_id
      and p.business_id = cashier_permissions.business_id
      and p.role = 'cashier'
  )
);

create or replace function public.has_cashier_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_owner() then true
    when not exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.business_id = public.auth_business_id()
        and p.role = 'cashier'
    ) then false
    when exists (
      select 1 from public.cashier_permissions cp
      where cp.cashier_id = auth.uid()
        and cp.business_id = public.auth_business_id()
    ) then exists (
      select 1 from public.cashier_permissions cp
      where cp.cashier_id = auth.uid()
        and cp.business_id = public.auth_business_id()
        and permission_key = any(cp.permissions)
    )
    else permission_key = any(array['pos','mySales']::text[])
  end
$$;

revoke all on function public.has_cashier_permission(text) from public;
grant execute on function public.has_cashier_permission(text) to authenticated;

drop policy if exists products_select_own_business on public.products;
create policy products_select_own_business on public.products
for select to authenticated
using (business_id = public.auth_business_id() and public.has_cashier_permission('products'));

drop policy if exists categories_select_own_business on public.categories;
create policy categories_select_own_business on public.categories
for select to authenticated
using (business_id = public.auth_business_id() and public.has_cashier_permission('products'));

drop policy if exists sales_select_scoped on public.sales;
create policy sales_select_scoped on public.sales
for select to authenticated
using (
  business_id = public.auth_business_id()
  and (
    public.is_owner()
    or (cashier_id = auth.uid() and public.has_cashier_permission('mySales'))
    or public.has_cashier_permission('sales')
  )
);

drop policy if exists sale_items_select_scoped on public.sale_items;
create policy sale_items_select_scoped on public.sale_items
for select to authenticated
using (
  exists (
    select 1 from public.sales s
    where s.id = sale_items.sale_id
      and s.business_id = public.auth_business_id()
      and (
        public.is_owner()
        or (s.cashier_id = auth.uid() and public.has_cashier_permission('mySales'))
        or public.has_cashier_permission('sales')
      )
  )
);

drop policy if exists payments_select_scoped on public.payments;
create policy payments_select_scoped on public.payments
for select to authenticated
using (
  business_id = public.auth_business_id()
  and (
    public.is_owner()
    or (exists (select 1 from public.sales s where s.id = payments.sale_id and s.cashier_id = auth.uid()) and public.has_cashier_permission('mySales'))
    or public.has_cashier_permission('sales')
  )
);

drop policy if exists stock_movements_select_owner on public.stock_movements;
create policy stock_movements_select_owner on public.stock_movements
for select to authenticated
using (business_id = public.auth_business_id() and public.has_cashier_permission('inventory'));
