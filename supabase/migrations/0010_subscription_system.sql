-- JIUZE POS — Migration 10
-- Subscription foundation: commercial tiers, billing intervals,
-- feature entitlements, 7-day trials, tenant-scoped reads, and
-- server-side subscription status resolution.
--
-- This migration intentionally does NOT enforce subscription access yet.
-- The next subscription enforcement phase will wire the status guard into
-- transactional/reference-data writes while preserving read-only access
-- for expired businesses.

-- ---------------------------------------------------------------------
-- subscription_plans
-- One row per commercial product tier.
-- Billing prices live separately so each tier can have monthly + annual
-- pricing without duplicating the plan itself.
-- ---------------------------------------------------------------------
create table public.subscription_plans (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (btrim(name) <> ''),
  code            text not null unique check (code in ('start', 'grow', 'pro')),
  description     text,
  trial_days      integer not null default 7 check (trial_days >= 0),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.subscription_plans is
  'Commercial JIUZE POS product tiers: Start, Grow and Pro.';

-- ---------------------------------------------------------------------
-- subscription_prices
-- Monthly and annual prices are separate from the tier so pricing can be
-- changed without changing the subscription plan identity.
-- ---------------------------------------------------------------------
create table public.subscription_prices (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid not null references public.subscription_plans (id) on delete cascade,
  billing_interval text not null check (billing_interval in ('month', 'year')),
  price_kes       numeric(12, 2) not null check (price_kes >= 0),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (plan_id, billing_interval)
);

comment on table public.subscription_prices is
  'Current JIUZE POS pricing per commercial tier and billing interval.';

comment on column public.subscription_prices.price_kes is
  'Subscription price in Kenyan shillings.';

create index subscription_prices_plan_id_idx
  on public.subscription_prices (plan_id);

-- ---------------------------------------------------------------------
-- subscription_features
-- A feature/limit catalog. Values are stored as JSON so the model supports
-- both booleans (enabled/disabled) and numeric/string limits without adding
-- columns every time the product grows.
-- ---------------------------------------------------------------------
create table public.subscription_features (
  id              uuid primary key default gen_random_uuid(),
  feature_key     text not null unique check (btrim(feature_key) <> ''),
  name            text not null check (btrim(name) <> ''),
  description     text,
  value_type      text not null check (value_type in ('boolean', 'number', 'text')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.subscription_features is
  'Feature and entitlement catalog used to control JIUZE POS plan capabilities.';

-- ---------------------------------------------------------------------
-- plan_features
-- Maps a tier to an entitlement value.
-- Examples: checkout=true, max_products=500, max_cashiers=5.
-- ---------------------------------------------------------------------
create table public.plan_features (
  plan_id           uuid not null references public.subscription_plans (id) on delete cascade,
  feature_id        uuid not null references public.subscription_features (id) on delete cascade,
  entitlement_value jsonb not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (plan_id, feature_id)
);

comment on table public.plan_features is
  'Entitlements granted to each JIUZE POS subscription tier.';

create index plan_features_feature_id_idx
  on public.plan_features (feature_id);

-- ---------------------------------------------------------------------
-- subscriptions
-- One current subscription per business in V1.
-- Trial subscriptions use the Start tier and billing_interval='trial'.
-- ---------------------------------------------------------------------
create table public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null unique references public.businesses (id) on delete cascade,
  plan_id               uuid not null references public.subscription_plans (id),
  billing_interval      text not null check (billing_interval in ('trial', 'month', 'year')),
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
  check (status <> 'cancelled' or cancelled_at is not null),
  check (status <> 'active' or billing_interval in ('month', 'year')),
  check (status <> 'trialing' or billing_interval = 'trial')
);

comment on table public.subscriptions is
  'One current JIUZE POS subscription/trial record per business. Business data is retained when access expires.';

create index subscriptions_plan_id_idx
  on public.subscriptions (plan_id);

create index subscriptions_status_period_idx
  on public.subscriptions (status, current_period_end);

-- ---------------------------------------------------------------------
-- Seed the commercial tiers.
-- Pricing is finalized at launch pricing discussed for JIUZE POS:
-- Start  KES 1,500/month or 15,000/year
-- Grow   KES 3,000/month or 30,000/year
-- Pro    KES 6,000/month or 60,000/year
-- All tiers receive a 7-day trial. New trials start on Start.
-- ---------------------------------------------------------------------
insert into public.subscription_plans
  (name, code, description, trial_days, is_active)
values
  ('JIUZE Start', 'start', 'Core tools for small retailers.', 7, true),
  ('JIUZE Grow', 'grow', 'Advanced tools for retailers ready to understand and grow the business.', 7, true),
  ('JIUZE Pro', 'pro', 'Advanced operations for growing retailers and multi-branch businesses.', 7, true);

insert into public.subscription_prices
  (plan_id, billing_interval, price_kes, is_active)
select p.id, v.billing_interval, v.price_kes, true
from public.subscription_plans p
join (values
  ('start', 'month', 1500.00::numeric),
  ('start', 'year', 15000.00::numeric),
  ('grow',  'month', 3000.00::numeric),
  ('grow',  'year', 30000.00::numeric),
  ('pro',   'month', 6000.00::numeric),
  ('pro',   'year', 60000.00::numeric)
) as v(code, billing_interval, price_kes)
  on v.code = p.code;

-- ---------------------------------------------------------------------
-- Seed the feature catalog.
-- ---------------------------------------------------------------------
insert into public.subscription_features
  (feature_key, name, description, value_type)
values
  ('checkout', 'Checkout', 'Process retail sales through POS checkout.', 'boolean'),
  ('inventory', 'Inventory', 'Track products and stock quantities.', 'boolean'),
  ('sales_history', 'Sales History', 'Review completed sales and transactions.', 'boolean'),
  ('basic_reports', 'Basic Reports', 'View core sales and inventory reporting.', 'boolean'),
  ('receipts', 'Receipts', 'Print customer receipts.', 'boolean'),
  ('max_products', 'Product Limit', 'Maximum number of active products.', 'number'),
  ('max_cashiers', 'Cashier Limit', 'Maximum number of cashier accounts.', 'number'),
  ('analytics', 'Analytics', 'Business performance analytics.', 'boolean'),
  ('pnl', 'Profit & Loss', 'View profit and loss analysis.', 'boolean'),
  ('projections', 'Projections', 'View weekly and monthly business projections.', 'boolean'),
  ('product_performance', 'Product Performance', 'Identify products performing well or poorly.', 'boolean'),
  ('cashier_management', 'Cashier Management', 'Create and manage cashier accounts.', 'boolean'),
  ('exports', 'Data Exports', 'Export supported business reports/data.', 'boolean'),
  ('advanced_inventory', 'Advanced Inventory', 'Use advanced inventory controls and analysis.', 'boolean'),
  ('multi_branch', 'Multiple Branches', 'Operate more than one business location.', 'boolean'),
  ('max_branches', 'Branch Limit', 'Maximum number of branches.', 'number'),
  ('advanced_permissions', 'Advanced Permissions', 'Use advanced staff and role permissions.', 'boolean'),
  ('advanced_analytics', 'Advanced Analytics', 'Use advanced analytics across the business.', 'boolean'),
  ('consolidated_reporting', 'Consolidated Reporting', 'View combined reporting across branches.', 'boolean'),
  ('api_access', 'API Access', 'Use future supported API/integration capabilities.', 'boolean');

-- ---------------------------------------------------------------------
-- Seed plan entitlements.
-- ---------------------------------------------------------------------
insert into public.plan_features (plan_id, feature_id, entitlement_value)
select p.id, f.id, v.entitlement_value
from public.subscription_plans p
join public.subscription_features f on true
join (values
  -- Start
  ('start', 'checkout', 'true'::jsonb),
  ('start', 'inventory', 'true'::jsonb),
  ('start', 'sales_history', 'true'::jsonb),
  ('start', 'basic_reports', 'true'::jsonb),
  ('start', 'receipts', 'true'::jsonb),
  ('start', 'max_products', '500'::jsonb),
  ('start', 'max_cashiers', '1'::jsonb),
  ('start', 'analytics', 'false'::jsonb),
  ('start', 'pnl', 'false'::jsonb),
  ('start', 'projections', 'false'::jsonb),
  ('start', 'product_performance', 'false'::jsonb),
  ('start', 'cashier_management', 'false'::jsonb),
  ('start', 'exports', 'false'::jsonb),
  ('start', 'advanced_inventory', 'false'::jsonb),
  ('start', 'multi_branch', 'false'::jsonb),
  ('start', 'max_branches', '1'::jsonb),
  ('start', 'advanced_permissions', 'false'::jsonb),
  ('start', 'advanced_analytics', 'false'::jsonb),
  ('start', 'consolidated_reporting', 'false'::jsonb),
  ('start', 'api_access', 'false'::jsonb),

  -- Grow
  ('grow', 'checkout', 'true'::jsonb),
  ('grow', 'inventory', 'true'::jsonb),
  ('grow', 'sales_history', 'true'::jsonb),
  ('grow', 'basic_reports', 'true'::jsonb),
  ('grow', 'receipts', 'true'::jsonb),
  ('grow', 'max_products', '999999'::jsonb),
  ('grow', 'max_cashiers', '5'::jsonb),
  ('grow', 'analytics', 'true'::jsonb),
  ('grow', 'pnl', 'true'::jsonb),
  ('grow', 'projections', 'true'::jsonb),
  ('grow', 'product_performance', 'true'::jsonb),
  ('grow', 'cashier_management', 'true'::jsonb),
  ('grow', 'exports', 'true'::jsonb),
  ('grow', 'advanced_inventory', 'true'::jsonb),
  ('grow', 'multi_branch', 'false'::jsonb),
  ('grow', 'max_branches', '1'::jsonb),
  ('grow', 'advanced_permissions', 'false'::jsonb),
  ('grow', 'advanced_analytics', 'true'::jsonb),
  ('grow', 'consolidated_reporting', 'false'::jsonb),
  ('grow', 'api_access', 'false'::jsonb),

  -- Pro
  ('pro', 'checkout', 'true'::jsonb),
  ('pro', 'inventory', 'true'::jsonb),
  ('pro', 'sales_history', 'true'::jsonb),
  ('pro', 'basic_reports', 'true'::jsonb),
  ('pro', 'receipts', 'true'::jsonb),
  ('pro', 'max_products', '999999'::jsonb),
  ('pro', 'max_cashiers', '15'::jsonb),
  ('pro', 'analytics', 'true'::jsonb),
  ('pro', 'pnl', 'true'::jsonb),
  ('pro', 'projections', 'true'::jsonb),
  ('pro', 'product_performance', 'true'::jsonb),
  ('pro', 'cashier_management', 'true'::jsonb),
  ('pro', 'exports', 'true'::jsonb),
  ('pro', 'advanced_inventory', 'true'::jsonb),
  ('pro', 'multi_branch', 'true'::jsonb),
  ('pro', 'max_branches', '999999'::jsonb),
  ('pro', 'advanced_permissions', 'true'::jsonb),
  ('pro', 'advanced_analytics', 'true'::jsonb),
  ('pro', 'consolidated_reporting', 'true'::jsonb),
  ('pro', 'api_access', 'true'::jsonb)
) as v(code, feature_key, entitlement_value)
  on v.code = p.code
 and v.feature_key = f.feature_key;

-- ---------------------------------------------------------------------
-- Existing businesses
-- Give existing tenants a 7-day Start trial from the moment migration 10
-- is applied. This avoids silently locking existing V1 customers out.
-- ---------------------------------------------------------------------
insert into public.subscriptions
  (business_id, plan_id, billing_interval, status, trial_start, trial_end)
select
  b.id,
  p.id,
  'trial',
  'trialing',
  now(),
  now() + make_interval(days => p.trial_days)
from public.businesses b
cross join public.subscription_plans p
where p.code = 'start'
  and not exists (
    select 1
    from public.subscriptions s
    where s.business_id = b.id
  );

-- ---------------------------------------------------------------------
-- Automatically provision a 7-day Start trial for every future business.
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
  where code = 'start'
    and is_active = true
  limit 1;

  if not found then
    raise exception 'Active Start subscription plan is not configured';
  end if;

  insert into public.subscriptions
    (business_id, plan_id, billing_interval, status, trial_start, trial_end)
  values (
    new.id,
    v_plan.id,
    'trial',
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
-- updated_at helpers
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

drop trigger if exists subscription_prices_touch_updated_at
  on public.subscription_prices;
drop trigger if exists subscription_features_touch_updated_at
  on public.subscription_features;
drop trigger if exists plan_features_touch_updated_at
  on public.plan_features;

drop trigger if exists subscription_plans_touch_updated_at
  on public.subscription_plans;

create trigger subscription_plans_touch_updated_at
before update on public.subscription_plans
for each row execute function public.touch_subscription_updated_at();

create trigger subscription_prices_touch_updated_at
before update on public.subscription_prices
for each row execute function public.touch_subscription_updated_at();

create trigger subscription_features_touch_updated_at
before update on public.subscription_features
for each row execute function public.touch_subscription_updated_at();

create trigger plan_features_touch_updated_at
before update on public.plan_features
for each row execute function public.touch_subscription_updated_at();

create trigger subscriptions_touch_updated_at
before update on public.subscriptions
for each row execute function public.touch_subscription_updated_at();

-- ---------------------------------------------------------------------
-- Server-side status resolution
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
  v_user_id         uuid := auth.uid();
  v_business_id     uuid;
  v_subscription    public.subscriptions%rowtype;
  v_plan            public.subscription_plans%rowtype;
  v_price           public.subscription_prices%rowtype;
  v_effective       text;
  v_access          boolean;
  v_days_remaining  integer := null;
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
      'plan_code', null,
      'plan_name', null,
      'billing_interval', null,
      'price_kes', null
    );
  end if;

  select * into v_plan
  from public.subscription_plans
  where id = v_subscription.plan_id;

  if v_subscription.billing_interval in ('month', 'year') then
    select * into v_price
    from public.subscription_prices
    where plan_id = v_subscription.plan_id
      and billing_interval = v_subscription.billing_interval
      and is_active = true
    order by created_at desc
    limit 1;
  end if;

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
    'billing_interval', v_subscription.billing_interval,
    'price_kes', case when v_price.id is null then null else v_price.price_kes end,
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
-- Businesses can see their own subscription and the active plan/catalog
-- data needed to render pricing/features. Client users cannot mutate any
-- subscription configuration. Future billing/webhook operations will use
-- a trusted server-side path.
-- ---------------------------------------------------------------------
alter table public.subscription_plans enable row level security;
alter table public.subscription_prices enable row level security;
alter table public.subscription_features enable row level security;
alter table public.plan_features enable row level security;
alter table public.subscriptions enable row level security;

create policy subscription_plans_select_active
  on public.subscription_plans for select
  to authenticated
  using (is_active = true);

create policy subscription_prices_select_active
  on public.subscription_prices for select
  to authenticated
  using (is_active = true);

create policy subscription_features_select
  on public.subscription_features for select
  to authenticated
  using (true);

create policy plan_features_select
  on public.plan_features for select
  to authenticated
  using (
    exists (
      select 1
      from public.subscription_plans p
      where p.id = plan_features.plan_id
        and p.is_active = true
    )
  );

create policy subscriptions_select_own_business
  on public.subscriptions for select
  to authenticated
  using (business_id = public.auth_business_id());

revoke all on public.subscription_plans from authenticated, anon;
revoke all on public.subscription_prices from authenticated, anon;
revoke all on public.subscription_features from authenticated, anon;
revoke all on public.plan_features from authenticated, anon;
revoke all on public.subscriptions from authenticated, anon;

grant select on public.subscription_plans to authenticated;
grant select on public.subscription_prices to authenticated;
grant select on public.subscription_features to authenticated;
grant select on public.plan_features to authenticated;
grant select on public.subscriptions to authenticated;

-- ---------------------------------------------------------------------
-- Documentation comments
-- ---------------------------------------------------------------------
comment on function public.get_subscription_status() is
  'Returns the authenticated user business subscription, effective date-derived status, access flag, plan and current price.';
