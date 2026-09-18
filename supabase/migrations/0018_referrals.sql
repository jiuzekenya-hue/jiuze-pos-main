-- JIUZE POS — Migration 18
-- Referral links and signup attribution.

alter table public.businesses
  add column if not exists referral_code text;

alter table public.businesses
  alter column referral_code set default ('JZ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)));

update public.businesses
set referral_code = 'JZ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
where referral_code is null;

alter table public.businesses
  alter column referral_code set not null;

create unique index if not exists businesses_referral_code_key
  on public.businesses (referral_code);

create table if not exists public.business_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_business_id uuid not null references public.businesses(id) on delete cascade,
  referred_business_id uuid not null references public.businesses(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint business_referrals_not_self check (referrer_business_id <> referred_business_id),
  constraint business_referrals_referred_unique unique (referred_business_id)
);

create index if not exists business_referrals_referrer_idx
  on public.business_referrals (referrer_business_id, created_at desc);

alter table public.business_referrals enable row level security;

revoke all on public.business_referrals from anon, authenticated;
grant select on public.business_referrals to authenticated;

create policy business_referrals_select_own
  on public.business_referrals
  for select
  to authenticated
  using (
    referrer_business_id = public.auth_business_id()
    or referred_business_id = public.auth_business_id()
  );

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
  v_referral_code text := nullif(btrim(coalesce(new.raw_user_meta_data->>'referral_code', '')), '');
  v_referrer_business_id uuid;
  v_business_id uuid;
begin
  if coalesce(new.raw_user_meta_data->>'signup_source', '') <> 'jiuze_pos' then
    return new;
  end if;

  if v_business_name is null then
    raise exception 'Business name is required for JIUZE POS signup';
  end if;

  if v_full_name is null then
    raise exception 'Owner name is required for JIUZE POS signup';
  end if;

  if v_referral_code is not null then
    select id into v_referrer_business_id
    from public.businesses
    where referral_code = upper(v_referral_code)
    limit 1;
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

  if v_referrer_business_id is not null and v_referrer_business_id <> v_business_id then
    insert into public.business_referrals (referrer_business_id, referred_business_id)
    values (v_referrer_business_id, v_business_id)
    on conflict (referred_business_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.provision_signup_business() from public;
