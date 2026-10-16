-- JIUZE POS: List printed, locked restaurant orders for the current business.
-- Read-only helper; existing database locking rules remain unchanged.

create or replace function public.list_locked_restaurant_orders()
returns table (
  order_id uuid
)
language sql
security definer
set search_path = public
stable
as $$
  select distinct o.id
  from public.restaurant_orders o
  where o.business_id = public.auth_business_id()
    and o.status = 'open'
    and (
      exists (
        select 1
        from public.restaurant_order_print_locks l
        where l.order_id = o.id
      )
      or exists (
        select 1
        from public.restaurant_order_prints p
        where p.order_id = o.id
          and p.print_type = 'order_slip'
      )
    )
    and (
      public.is_owner()
      or o.created_by = auth.uid()
    );
$$;

revoke all on function public.list_locked_restaurant_orders() from public, anon;
grant execute on function public.list_locked_restaurant_orders() to authenticated;
