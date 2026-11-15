alter table public.platform_subscription_payments
  add column if not exists subscription_status_before text,
  add column if not exists billing_interval_before text,
  add column if not exists current_period_start_before timestamptz,
  add column if not exists current_period_end_before timestamptz,
  add column if not exists current_period_end_after timestamptz,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid references auth.users(id),
  add column if not exists reversal_reason text;

create or replace function public.platform_admin_record_subscription_payment(
  p_subscription_id uuid,p_amount_kes numeric,p_payment_method text,p_transaction_reference text,
  p_paid_at timestamptz,p_notes text,p_billing_interval text,p_recorded_by uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_subscription public.subscriptions%rowtype;
  v_payment public.platform_subscription_payments%rowtype;
  v_start timestamptz;
  v_end timestamptz;
begin
  if p_subscription_id is null or p_amount_kes is null or p_amount_kes<=0 then raise exception 'A subscription and positive payment amount are required'; end if;
  if p_payment_method not in ('mpesa','bank','cash','card','other') then raise exception 'Invalid payment method'; end if;
  if p_billing_interval not in ('month','year') then raise exception 'Billing interval must be month or year'; end if;
  if p_payment_method='mpesa' and nullif(btrim(coalesce(p_transaction_reference,'')),'') is null then raise exception 'M-Pesa transaction reference is required'; end if;
  if p_recorded_by is null then raise exception 'Payment recorder is required'; end if;
  select * into v_subscription from public.subscriptions where id=p_subscription_id for update;
  if not found then raise exception 'Subscription not found'; end if;
  v_start:=coalesce(p_paid_at,now());
  if v_subscription.status='active' and v_subscription.current_period_end is not null and v_subscription.current_period_end>v_start then v_start:=v_subscription.current_period_end; end if;
  v_end:=case when p_billing_interval='year' then v_start+interval '1 year' else v_start+interval '1 month' end;
  insert into public.platform_subscription_payments(
    subscription_id,business_id,amount_kes,payment_method,transaction_reference,status,paid_at,recorded_by,notes,
    subscription_status_before,billing_interval_before,current_period_start_before,current_period_end_before,current_period_end_after
  ) values (
    v_subscription.id,v_subscription.business_id,p_amount_kes,p_payment_method,
    nullif(btrim(coalesce(p_transaction_reference,'')),''),'confirmed',coalesce(p_paid_at,now()),p_recorded_by,
    nullif(btrim(coalesce(p_notes,'')),''),v_subscription.status,v_subscription.billing_interval,
    v_subscription.current_period_start,v_subscription.current_period_end,v_end
  ) returning * into v_payment;
  update public.subscriptions set billing_interval=p_billing_interval,status='active',
    current_period_start=v_start,current_period_end=v_end,cancelled_at=null
  where id=v_subscription.id returning * into v_subscription;
  return jsonb_build_object('payment',to_jsonb(v_payment),'subscription',to_jsonb(v_subscription));
end; $$;

create or replace function public.platform_admin_change_subscription_plan(
  p_subscription_id uuid,p_plan_id uuid,p_billing_interval text
) returns public.subscriptions language plpgsql security definer set search_path=public as $$
declare v_sub public.subscriptions%rowtype; v_plan public.subscription_plans%rowtype;
begin
  if p_billing_interval not in ('month','year','trial') then raise exception 'Invalid billing interval'; end if;
  select * into v_sub from public.subscriptions where id=p_subscription_id for update;
  if not found then raise exception 'Subscription not found'; end if;
  select * into v_plan from public.subscription_plans where id=p_plan_id and is_active=true;
  if not found then raise exception 'Selected plan is not active'; end if;
  if p_billing_interval in ('month','year') and not exists(select 1 from public.subscription_prices where plan_id=p_plan_id and billing_interval=p_billing_interval and is_active=true) then
    raise exception 'No active price exists for this plan and billing period';
  end if;
  update public.subscriptions set plan_id=p_plan_id,
    billing_interval=case when p_billing_interval='trial' then 'trial' else p_billing_interval end,
    status=case when p_billing_interval='trial' then 'trialing' else status end,
    trial_start=case when p_billing_interval='trial' then now() else trial_start end,
    trial_end=case when p_billing_interval='trial' then now()+make_interval(days=>v_plan.trial_days) else trial_end end,
    updated_at=now()
  where id=p_subscription_id returning * into v_sub;
  return v_sub;
end; $$;

create or replace function public.platform_admin_reverse_subscription_payment(
  p_payment_id uuid,p_reason text,p_reversed_by uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_payment public.platform_subscription_payments%rowtype; v_sub public.subscriptions%rowtype;
begin
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'A reversal reason is required'; end if;
  if p_reversed_by is null then raise exception 'Reversing administrator is required'; end if;
  select * into v_payment from public.platform_subscription_payments where id=p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if v_payment.status<>'confirmed' then raise exception 'Only confirmed payments can be reversed'; end if;
  if v_payment.current_period_end_after is null then raise exception 'This older payment has no activation snapshot and cannot safely roll back subscription access'; end if;
  select * into v_sub from public.subscriptions where id=v_payment.subscription_id for update;
  if not found then raise exception 'Subscription not found'; end if;
  if v_sub.current_period_end is distinct from v_payment.current_period_end_after then
    raise exception 'A later subscription change exists. Reverse the most recent payment or review the subscription manually first';
  end if;
  update public.platform_subscription_payments set status='reversed',reversed_at=now(),reversed_by=p_reversed_by,reversal_reason=btrim(p_reason)
  where id=p_payment_id returning * into v_payment;
  update public.subscriptions set status=v_payment.subscription_status_before,
    billing_interval=v_payment.billing_interval_before,
    current_period_start=v_payment.current_period_start_before,
    current_period_end=v_payment.current_period_end_before,
    cancelled_at=case when v_payment.subscription_status_before='cancelled' then cancelled_at else null end,
    updated_at=now()
  where id=v_payment.subscription_id returning * into v_sub;
  return jsonb_build_object('payment',to_jsonb(v_payment),'subscription',to_jsonb(v_sub));
end; $$;

revoke all on function public.platform_admin_change_subscription_plan(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.platform_admin_reverse_subscription_payment(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.platform_admin_change_subscription_plan(uuid,uuid,text) to service_role;
grant execute on function public.platform_admin_reverse_subscription_payment(uuid,text,uuid) to service_role;
