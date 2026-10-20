-- Custom, per-cashier access grants. Missing row preserves legacy cashier defaults.
create table if not exists public.cashier_permissions (
  cashier_id uuid primary key references public.profiles(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  permissions text[] not null default '{}'::text[],
  updated_at timestamptz not null default now(),
  constraint cashier_permissions_allowed_keys check (
    permissions <@ array[
      'dashboard','pos','products','inventory','sales','reports',
      'settings','userManagement','stockAdjustments','voidReturnSales','mySales'
    ]::text[]
  )
);

create index if not exists cashier_permissions_business_id_idx
  on public.cashier_permissions (business_id);

alter table public.cashier_permissions enable row level security;

drop policy if exists cashier_permissions_select_scoped on public.cashier_permissions;
create policy cashier_permissions_select_scoped
  on public.cashier_permissions for select to authenticated
  using (
    business_id = public.auth_business_id()
    and (public.is_owner() or cashier_id = auth.uid())
  );

drop policy if exists cashier_permissions_insert_owner on public.cashier_permissions;
create policy cashier_permissions_insert_owner
  on public.cashier_permissions for insert to authenticated
  with check (
    business_id = public.auth_business_id()
    and public.is_owner()
    and public.has_subscription_access()
    and exists (
      select 1 from public.profiles p
      where p.id = cashier_id
        and p.business_id = business_id
        and p.role = 'cashier'
    )
  );

drop policy if exists cashier_permissions_update_owner on public.cashier_permissions;
create policy cashier_permissions_update_owner
  on public.cashier_permissions for update to authenticated
  using (
    business_id = public.auth_business_id()
    and public.is_owner()
    and public.has_subscription_access()
  )
  with check (
    business_id = public.auth_business_id()
    and public.is_owner()
    and public.has_subscription_access()
    and exists (
      select 1 from public.profiles p
      where p.id = cashier_id
        and p.business_id = business_id
        and p.role = 'cashier'
    )
  );

drop policy if exists cashier_permissions_delete_owner on public.cashier_permissions;
create policy cashier_permissions_delete_owner
  on public.cashier_permissions for delete to authenticated
  using (
    business_id = public.auth_business_id()
    and public.is_owner()
    and public.has_subscription_access()
  );

grant select, insert, update, delete on public.cashier_permissions to authenticated;

create or replace function public.touch_cashier_permissions_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cashier_permissions_touch_updated_at on public.cashier_permissions;
create trigger cashier_permissions_touch_updated_at
before update on public.cashier_permissions
for each row execute function public.touch_cashier_permissions_updated_at();
