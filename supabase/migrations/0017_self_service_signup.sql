-- JIUZE POS — Migration 17
-- Self-service customer signup provisioning.
--
-- A newly created Supabase Auth user can provision exactly one POS business
-- and owner profile from signup metadata. The database creates the business,
-- default settings, Start trial, and owner profile server-side so the browser
-- never needs permission to insert a tenant or create an owner profile.

create or replace function public.provision_signup_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_name text := nullif(btrim(coalesce(new.raw_user_meta_data->>'business_name', '')), '');
  v_full_name text := nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name', '')), '');
  v_phone text := nullif(btrim(coalesce(new.raw_user_meta_data->>'phone', '')), '');
  v_location text := nullif(btrim(coalesce(new.raw_user_meta_data->>'location', '')), '');
  v_business_id uuid;
begin
  -- Only self-service users with the expected signup marker are provisioned.
  if coalesce(new.raw_user_meta_data->>'signup_source', '') <> 'jiuze_pos' then
    return new;
  end if;

  if v_business_name is null then
    raise exception 'Business name is required for JIUZE POS signup';
  end if;

  if v_full_name is null then
    raise exception 'Owner name is required for JIUZE POS signup';
  end if;

  insert into public.businesses (
    name,
    phone,
    location,
    currency
  )
  values (
    v_business_name,
    v_phone,
    v_location,
    'KES'
  )
  returning id into v_business_id;

  insert into public.profiles (
    id,
    business_id,
    full_name,
    phone,
    role
  )
  values (
    new.id,
    v_business_id,
    v_full_name,
    v_phone,
    'owner'
  );

  return new;
end;
$$;

revoke all on function public.provision_signup_business() from public;

drop trigger if exists on_auth_user_created_jiuze_pos
on auth.users;

create trigger on_auth_user_created_jiuze_pos
after insert on auth.users
for each row
execute function public.provision_signup_business();
