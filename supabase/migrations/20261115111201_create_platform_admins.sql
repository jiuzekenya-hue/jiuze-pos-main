-- JIUZE POS — Platform Super Admin registry
-- This migration was applied to production on 2026-11-15 before the dashboard branch.
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'super_admin' check (role = 'super_admin'),
  created_at timestamptz not null default now()
);

comment on table public.platform_admins is
  'JIUZE POS platform-level administrators. Access is managed server-side; this table is not exposed to ordinary authenticated clients.';

alter table public.platform_admins enable row level security;
revoke all on table public.platform_admins from anon, authenticated;
grant all on table public.platform_admins to service_role;
