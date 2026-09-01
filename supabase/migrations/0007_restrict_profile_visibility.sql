-- JIUZE POS — Phase 4, Migration 7
-- Profiles contain staff contact details. Cashiers should only be able
-- to read their own profile; owners may read profiles in their business.

drop policy if exists profiles_select_same_business on public.profiles;

create policy profiles_select_scoped
  on public.profiles for select
  to authenticated
  using (
    business_id = public.auth_business_id()
    and (public.is_owner() or id = auth.uid())
  );
