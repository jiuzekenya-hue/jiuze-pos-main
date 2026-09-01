-- JIUZE POS — Phase 4, Migration 6
-- Restrict owner profile updates so the client cannot promote any profile
-- to owner. V1 owners may create and manage cashier profiles only.

drop policy if exists profiles_update_owner on public.profiles;

create policy profiles_update_owner
  on public.profiles for update
  to authenticated
  using (
    business_id = public.auth_business_id()
    and public.is_owner()
    and role = 'cashier'
  )
  with check (
    business_id = public.auth_business_id()
    and role = 'cashier'
  );
