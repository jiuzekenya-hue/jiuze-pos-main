-- JIUZE POS — Migration 20
-- Restrict sales returns/refunds to business owners.
--
-- The return RPC is SECURITY DEFINER, so authorization must also be enforced
-- inside the database mutation path. This trigger blocks cashier-created
-- return transactions even if the frontend is bypassed.

create or replace function public.prevent_cashier_sales_return()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
begin
  select role
  into v_role
  from public.profiles
  where id = auth.uid()
    and business_id = new.business_id;

  if v_role <> 'owner' then
    raise exception 'Only the business owner can process returns'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_owner_sales_return
on public.sales_returns;

create trigger enforce_owner_sales_return
before insert on public.sales_returns
for each row
execute function public.prevent_cashier_sales_return();

revoke all on function public.prevent_cashier_sales_return() from public;
grant execute on function public.prevent_cashier_sales_return() to authenticated;
