-- Platform subscription collections are separate from POS sales payments.
create table if not exists public.platform_subscription_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete restrict,
  amount_kes numeric(12,2) not null check (amount_kes > 0),
  payment_method text not null check (payment_method in ('mpesa','bank','cash','card','other')),
  transaction_reference text,
  status text not null default 'confirmed' check (status in ('confirmed','reversed')),
  paid_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id),
  notes text,
  created_at timestamptz not null default now(),
  constraint platform_subscription_payments_reference_unique unique (payment_method, transaction_reference)
);

create index if not exists idx_platform_subscription_payments_paid_at
  on public.platform_subscription_payments (paid_at desc);
create index if not exists idx_platform_subscription_payments_business
  on public.platform_subscription_payments (business_id, paid_at desc);
create index if not exists idx_platform_subscription_payments_subscription
  on public.platform_subscription_payments (subscription_id, paid_at desc);

alter table public.platform_subscription_payments enable row level security;
revoke all on public.platform_subscription_payments from anon, authenticated;
