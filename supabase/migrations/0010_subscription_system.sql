-- JIUZE POS — Migration 10
-- Subscription foundation: plans, business subscriptions, 7-day trials,
-- tenant-scoped reads, and a server-side subscription status function.
--
-- This migration intentionally does NOT change POS access enforcement yet.
-- The next subscription enforcement phase will wire the status guard into
-- transactional/reference-data writes while preserving read-only access
-- for expired businesses.

-- ---------------------------------------------------------------------
-- subscription_plans
-- ---------------------------------------------------------------------
create table public.subscription_plans (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (btrim(name) <> ''),
  code            text not null unique check (code in ('trial', 'monthly', 'annual')),
  billing_interval text not null check (billing_interval in ('trial', 'month', 'year')),
  price_kes       numeric(12, 2) not null default 0 check (price_kes >= 0),
  trial_days      integer not null default 0 check (trial_days >= 0),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.subscription_plans is
  'Commercial subscription plans available to JIUZE POS businesses.';

comment on column public.subscription_plans.price_kes is
  'Plan price in Kenyan shillings. Commercial pricing can be changed without changing subscription records.';

-- ---------------------------------------------------------------------
-- subscriptions
-- One current subscription per business in V1.
-- ---------------------------------------------------------------------
create table public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null unique references public.businesses (id) on delete cascade,
  plan_id               uuid not null references public.subscription_plans (id),
  status                text not null check (status in ('trialing', 'active', 'expired', 'cancelled')),
  trial_start           timestamptz,
  trial_end             timestamptz,
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  cancelled_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (trial_end is null or trial_start is not null),
  check (trial_end is null or trial_end >= trial_start),
  check (current_period_end is null or current_period_start is not null),
  check (current_period_end is null or current_period_end >= current_period_start),
  check (status <> 'cancelled' or cancelled_at is not null)
);

comment on table public.subscriptions is
  'One current JIUZE POS subscription/trial record per business. Business data is retained when access expires.';

create index subscriptions_plan_id_idx
  on public.subscriptions (plan_id);

create index subscriptions_status_period_idx
  on public.subscriptions (status, current_period_end);

-- ---------------------------------------------------------------------
-- Seed the initial plans.
-- Prices are deliberately zero until JIUZE commercial pricing is finalized.
-- ---------------------------------------------------------------------
insert into public.subscription_plans
  (name, code, billing_interval, price_kes, trial_days, is_active)
values
  ('7-Day Trial', 'trial', 'trial', 0, 7, true),
  ('Monthly', 'monthly', 'month', 0, 0, true),
  ('Annual', 'annual', 'year', 0, 0, true);

-- ---------------------------------------------------------------------
-- Existing businesses
-- Give existing tenants a 7-day trial from the moment migration 10 is
-- applied. This makes the feature safe to introduce to the current V1
-- customer base without silently locking them out.
-- ---------------------------------------------------------------------
insert into public.subscriptions
  (business_id, plan_id, status, trial_start, trial_end)
select
  b.id,
  p.id,
  'trialing',
  now(),
  now() + make_interval(days => p.trial_days)
from public.businesses b
cross join public.subscription_plans p
where p.code = 'trial'
  and not exists (
    select 1
    from public.subscriptions s
    where s.business_id = b.id
  );

-- ---------------------------------------------------------------------
-- Automatically provision a 7-day trial for every future business.
-- Businesses are currently provisioned by the service/admin path, so the
-- trigger runs as part of that trusted creation transaction.
-- ---------------------------------------------------------------------
create or replace function public.provision_business_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.subscription_plans%rowtype;
begin
  select * into v_plan
  from public.subscription_plans
  where code = 'trial'
    and is_active = true
  limit 1;

  if not found then
    raise exception 'Active trial subscription plan is not configured';
  end if;

  insert into public.subscriptions
    (business_id, plan_id, status, trial_start, trial_end)
  values (
    new.id,
    v_plan.id,
    'trialing',
    now(),
    now() + make_interval(days => v_plan.trial_days)
  );

  return new;
end;
$$;

revoke all on function public.provision_business_trial() from public;

drop trigger if exists businesses_provision_trial
  on public.businesses;

create trigger businesses_provision_trial
after insert on public.businesses
for each row execute function public.provision_business_trial();

-- ---------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------
create or replace function public.touch_subscription_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.touch_subscription_updated_at() from public;

drop trigger if exists subscriptions_touch_updated_at
  on public.subscriptions;

create trigger subscriptions_touch_updated_at
before update on public.subscriptions
for each row execute function public.touch_subscription_updated_at();

-- ---------------------------------------------------------------------
-- Server-side status resolution
--
-- Stored status is retained for lifecycle/audit purposes, but access status
-- is derived from dates at read time so an expired subscription cannot remain
-- effectively active just because a status field was not updated by a job.
-- ---------------------------------------------------------------------
create or replace function public.get_subscription_status()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id       uuid := auth.uid();
  v_business_id   uuid;
  v_subscription  public.subscriptions%rowtype;
  v_plan          public.subscription_plans%rowtype;
  v_effective     text;
  v_access        boolean;
  v_days_remaining integer := null;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select business_id into v_business_id
  from public.profiles
  where id = v_user_id;

  if v_business_id is null then
    raise exception 'No business is associated with this user' using errcode = '28000';
  end if;

  select * into v_subscription
  from public.subscriptions
  where business_id = v_business_id;

  if not found then
    return jsonb_build_object(
      'business_id', v_business_id,
      'status', 'expired',
      'access', false,
      'days_remaining', 0,
      'subscription_id', null,
      'plan_code', null
    );
  end if;

  select * into v_plan
  from public.subscription_plans
  where id = v_subscription.plan_id;

  if v_subscription.status = 'cancelled' then
    v_effective := 'cancelled';
    v_access := false;
  elsif v_subscription.status = 'trialing' then
    if v_subscription.trial_end is not null and now() < v_subscription.trial_end then
      v_effective := 'trialing';
      v_access := true;
      v_days_remaining := greatest(0, ceil(extract(epoch from (v_subscription.trial_end - now())) / 86400.0)::integer);
    else
      v_effective := 'expired';
      v_access := false;
      v_days_remaining := 0;
    end if;
  elsif v_subscription.status = 'active' then
    if v_subscription.current_period_end is not null and now() < v_subscription.current_period_end then
      v_effective := 'active';
      v_access := true;
      v_days_remaining := greatest(0, ceil(extract(epoch from (v_subscription.current_period_end - now())) / 86400.0)::integer);
    else
      v_effective := 'expired';
      v_access := false;
      v_days_remaining := 0;
    end if;
  else
    v_effective := 'expired';
    v_access := false;
    v_days_remaining := 0;
  end if;

  return jsonb_build_object(
    'business_id', v_business_id,
    'subscription_id', v_subscription.id,
    'plan_code', v_plan.code,
    'plan_name', v_plan.name,
    'billing_interval', v_plan.billing_interval,
    'status', v_effective,
    'access', v_access,
    'days_remaining', v_days_remaining,
    'trial_start', v_subscription.trial_start,
    'trial_end', v_subscription.trial_end,
    'current_period_start', v_subscription.current_period_start,
    'current_period_end', v_subscription.current_period_end,
    'cancelled_at', v_subscription.cancelled_at
  );
end;
$$;

revoke all on function public.get_subscription_status() from public;
grant execute on function public.get_subscription_status() to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- Businesses can see only their own subscription. Client users cannot
-- insert/update/delete subscriptions. Future billing/webhook operations
-- will use a trusted server-side path.
-- ---------------------------------------------------------------------
alter table public.subscription_plans enable row level security;
alter table public.subscriptions enable row level security;

create policy subscription_plans_select_active
  on public.subscription_plans for select
  to authenticated
  using (is_active = true);

create policy subscriptions_select_own_business
  on public.subscriptions for select
  to authenticated
  using (business_id = public.auth_business_id());

revoke all on public.subscription_plans from authenticated, anon;
revoke all on public.subscriptions from authenticated, anon;

grant select on public.subscription_plans to authenticated;
grant select on public.subscriptions to authenticated;

-- ---------------------------------------------------------------------
-- Documentation comments
-- ---------------------------------------------------------------------
comment on function public.get_subscription_status() is
  'Returns the authenticated user business subscription with effective date-derived status and access flag.';
