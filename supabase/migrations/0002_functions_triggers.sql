-- JIUZE POS — Phase 3, Migration 2
-- Trigger utilities and the auth helper functions RLS policies rely on.

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create trigger sales_set_updated_at
  before update on public.sales
  for each row execute function public.set_updated_at();

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Auto-create a settings row whenever a business is created, so every
-- business has exactly one settings row (brief §6, §23) without the
-- client needing to remember to create it.
-- ---------------------------------------------------------------------
create function public.create_default_settings()
returns trigger
language plpgsql
as $$
begin
  insert into public.settings (business_id) values (new.id);
  return new;
end;
$$;

create trigger businesses_create_default_settings
  after insert on public.businesses
  for each row execute function public.create_default_settings();

-- ---------------------------------------------------------------------
-- Stock non-negativity, honoring the per-business allow_negative_stock
-- setting (brief §6 settings, §8 stock rules). A CHECK constraint can't
-- reference another table, so this is enforced with a trigger instead.
-- ---------------------------------------------------------------------
create function public.enforce_stock_non_negative()
returns trigger
language plpgsql
as $$
declare
  v_allow_negative boolean;
begin
  if new.stock_quantity < 0 then
    select allow_negative_stock into v_allow_negative
    from public.settings
    where business_id = new.business_id;

    if coalesce(v_allow_negative, false) is false then
      raise exception 'Insufficient stock for product %: cannot go below zero', new.id
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger products_enforce_stock_non_negative
  before insert or update of stock_quantity on public.products
  for each row execute function public.enforce_stock_non_negative();

-- ---------------------------------------------------------------------
-- Tenant/role helpers used throughout RLS policies (migration 3) and
-- the complete_sale function (migration 4).
--
-- SECURITY DEFINER is required here: profiles has its own RLS enabled,
-- and a plain SECURITY INVOKER function would recurse into that same
-- RLS check while trying to resolve the caller's business_id. Running
-- as the (trusted, migration-owned) function owner bypasses that one
-- specific lookup safely, because the function only ever returns data
-- about auth.uid() itself — never arbitrary rows.
-- ---------------------------------------------------------------------
create function public.auth_business_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select business_id from public.profiles where id = auth.uid();
$$;

create function public.auth_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.auth_role() = 'owner';
$$;

revoke all on function public.auth_business_id() from public;
revoke all on function public.auth_role() from public;
revoke all on function public.is_owner() from public;
grant execute on function public.auth_business_id() to authenticated;
grant execute on function public.auth_role() to authenticated;
grant execute on function public.is_owner() to authenticated;
