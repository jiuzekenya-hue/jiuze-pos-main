-- JIUZE POS — Business interface modes
-- Keeps one POS product while allowing industry-specific workflows.

alter table public.businesses
  add column if not exists business_mode text not null default 'retail'
  check (business_mode in ('retail', 'bar_restaurant'));

comment on column public.businesses.business_mode is
  'Primary POS interface/workflow: retail or bar_restaurant.';

update public.businesses
set business_mode = 'retail'
where business_mode is null;
