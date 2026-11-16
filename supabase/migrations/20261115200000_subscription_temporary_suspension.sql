alter table public.subscriptions
  add column if not exists status_before_suspension text,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspension_reason text;

alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('trialing','active','expired','cancelled','suspended'));

create or replace function public.platform_admin_set_subscription_suspension(
  p_subscription_id uuid,
  p_suspend boolean,
  p_reason text default null
)
returns public.subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.subscriptions%rowtype;
begin
  select * into v_subscription
  from public.subscriptions
  where id = p_subscription_id
  for update;

  if not found then
    raise exception 'Subscription not found';
  end if;

  if p_suspend then
    if v_subscription.status = 'suspended' then
      return v_subscription;
    end if;
    if v_subscription.status = 'cancelled' then
      raise exception 'Cancelled subscriptions cannot be temporarily suspended';
    end if;
    update public.subscriptions
    set status_before_suspension = v_subscription.status,
        status = 'suspended',
        suspended_at = now(),
        suspension_reason = nullif(btrim(coalesce(p_reason,'')), '')
    where id = p_subscription_id
    returning * into v_subscription;
  else
    if v_subscription.status <> 'suspended' then
      return v_subscription;
    end if;
    update public.subscriptions
    set status = coalesce(status_before_suspension, 'expired'),
        status_before_suspension = null,
        suspended_at = null,
        suspension_reason = null
    where id = p_subscription_id
    returning * into v_subscription;
  end if;

  return v_subscription;
end;
$$;

revoke all on function public.platform_admin_set_subscription_suspension(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.platform_admin_set_subscription_suspension(uuid,boolean,text) to service_role;

create or replace function public.get_subscription_status()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_subscription public.subscriptions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_price public.subscription_prices%rowtype;
  v_effective text;
  v_access boolean;
  v_days_remaining integer := null;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  select business_id into v_business_id from public.profiles where id = v_user_id;
  if v_business_id is null then
    raise exception 'No business is associated with this user' using errcode = '28000';
  end if;
  select * into v_subscription from public.subscriptions where business_id = v_business_id;
  if not found then
    return jsonb_build_object('business_id',v_business_id,'status','expired','access',false,'days_remaining',0,'subscription_id',null,'plan_code',null,'plan_name',null,'billing_interval',null,'price_kes',null);
  end if;
  select * into v_plan from public.subscription_plans where id = v_subscription.plan_id;
  if v_subscription.billing_interval in ('month','year') then
    select * into v_price from public.subscription_prices
    where plan_id=v_subscription.plan_id and billing_interval=v_subscription.billing_interval and is_active=true
    order by created_at desc limit 1;
  end if;
  if v_subscription.status = 'suspended' then
    v_effective := 'suspended'; v_access := false; v_days_remaining := 0;
  elsif v_subscription.status = 'cancelled' then
    v_effective := 'cancelled'; v_access := false;
  elsif v_subscription.status = 'trialing' then
    if v_subscription.trial_end is not null and now() < v_subscription.trial_end then
      v_effective := 'trialing'; v_access := true;
      v_days_remaining := greatest(0,ceil(extract(epoch from (v_subscription.trial_end-now()))/86400.0)::integer);
    else v_effective := 'expired'; v_access := false; v_days_remaining := 0; end if;
  elsif v_subscription.status = 'active' then
    if v_subscription.current_period_end is not null and now() < v_subscription.current_period_end then
      v_effective := 'active'; v_access := true;
      v_days_remaining := greatest(0,ceil(extract(epoch from (v_subscription.current_period_end-now()))/86400.0)::integer);
    else v_effective := 'expired'; v_access := false; v_days_remaining := 0; end if;
  else v_effective := 'expired'; v_access := false; v_days_remaining := 0;
  end if;
  return jsonb_build_object(
    'business_id',v_business_id,'subscription_id',v_subscription.id,'plan_code',v_plan.code,
    'plan_name',v_plan.name,'billing_interval',v_subscription.billing_interval,
    'price_kes',case when v_price.id is null then null else v_price.price_kes end,
    'status',v_effective,'access',v_access,'days_remaining',v_days_remaining,
    'trial_start',v_subscription.trial_start,'trial_end',v_subscription.trial_end,
    'current_period_start',v_subscription.current_period_start,'current_period_end',v_subscription.current_period_end,
    'cancelled_at',v_subscription.cancelled_at,'suspended_at',v_subscription.suspended_at,
    'suspension_reason',v_subscription.suspension_reason
  );
end;
$$;
