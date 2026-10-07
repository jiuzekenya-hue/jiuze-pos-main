-- JIUZE POS — Restaurant location occupancy
-- Exposes only location occupancy metadata to authenticated users.
-- Order contents remain protected by the ownership RLS policy in 0024.

create or replace function public.list_restaurant_location_status()
returns table (
  location_type text,
  table_number integer,
  occupied boolean,
  can_manage boolean,
  order_number text
)
language sql
security definer
stable
set search_path = ''
as $$
  with locations as (
    select 'table'::text as location_type, g.table_number
    from pg_catalog.generate_series(1, 12) as g(table_number)
    union all
    select 'takeaway'::text, null::integer
  )
  select
    l.location_type,
    l.table_number,
    (o.id is not null) as occupied,
    (
      o.id is not null
      and (public.is_owner() or o.created_by = auth.uid())
    ) as can_manage,
    case
      when o.id is not null
       and (public.is_owner() or o.created_by = auth.uid())
      then o.order_number
      else null
    end as order_number
  from locations l
  left join public.restaurant_orders o
    on o.business_id = public.auth_business_id()
   and o.status = 'open'
   and o.location_type = l.location_type
   and coalesce(o.table_number, 0) = coalesce(l.table_number, 0)
  order by
    case when l.location_type = 'takeaway' then 0 else 1 end,
    l.table_number;
$$;

revoke all on function public.list_restaurant_location_status() from public, anon;
grant execute on function public.list_restaurant_location_status() to authenticated;

notify pgrst, 'reload schema';
