create or replace function public.platform_admin_record_subscription_payment(
  p_subscription_id uuid,
  p_amount_kes numeric,
  p_payment_method text,
  p_transaction_reference text,
  p_paid_at timestamptz,
  p_notes text,
  p_billing_interval text,
  p_recorded_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.subscriptions%rowtype;
  v_payment public.platform_subscription_payments%rowtype;
  v_period_start timestamptz;
  v_period_end timestamptz;
begin
  if p_subscription_id is null or p_amount_kes is null or p_amount_kes <= 0 then
    raise exception 'A subscription and positive payment amount are required';
  end if;
  if p_payment_method not in ('mpesa','bank','cash','card','other') then
    raise exception 'Invalid payment method';
  end if;
  if p_billing_interval not in ('month','year') then
    raise exception 'Billing interval must be month or year';
  end if;
  if p_payment_method = 'mpesa' and nullif(btrim(coalesce(p_transaction_reference,'')), '') is null then
    raise exception 'M-Pesa transaction reference is required';
  end if;
  if p_recorded_by is null then
    raise exception 'Payment recorder is required';
  end if;

  select * into v_subscription
  from public.subscriptions
  where id = p_subscription_id
  for update;

  if not found then
    raise exception 'Subscription not found';
  end if;

  v_period_start := coalesce(p_paid_at, now());
  if v_subscription.status = 'active'
     and v_subscription.current_period_end is not null
     and v_subscription.current_period_end > v_period_start then
    v_period_start := v_subscription.current_period_end;
  end if;
  v_period_end := case
    when p_billing_interval = 'year' then v_period_start + interval '1 year'
    else v_period_start + interval '1 month'
  end;

  insert into public.platform_subscription_payments (
    subscription_id, business_id, amount_kes, payment_method,
    transaction_reference, status, paid_at, recorded_by, notes
  ) values (
    v_subscription.id, v_subscription.business_id, p_amount_kes, p_payment_method,
    nullif(btrim(coalesce(p_transaction_reference,'')), ''), 'confirmed',
    coalesce(p_paid_at, now()), p_recorded_by, nullif(btrim(coalesce(p_notes,'')), '')
  ) returning * into v_payment;

  update public.subscriptions
  set billing_interval = p_billing_interval,
      status = 'active',
      current_period_start = v_period_start,
      current_period_end = v_period_end,
      cancelled_at = null
  where id = v_subscription.id
  returning * into v_subscription;

  return jsonb_build_object('payment', to_jsonb(v_payment), 'subscription', to_jsonb(v_subscription));
end;
$$;

revoke all on function public.platform_admin_record_subscription_payment(uuid,numeric,text,text,timestamptz,text,text,uuid) from public, anon, authenticated;
grant execute on function public.platform_admin_record_subscription_payment(uuid,numeric,text,text,timestamptz,text,text,uuid) to service_role;
