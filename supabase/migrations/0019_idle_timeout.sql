-- JIUZE POS — Migration 19
-- Configurable inactivity timeout.

alter table public.settings
  add column if not exists idle_timeout_minutes integer not null default 30;

alter table public.settings
  add constraint settings_idle_timeout_minutes_check
  check (idle_timeout_minutes in (0, 5, 15, 30));
