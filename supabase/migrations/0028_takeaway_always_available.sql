-- JIUZE POS — Takeaway is not an occupied location
-- Takeaway can have many open orders at once. Occupancy is only meaningful
-- for physical tables.

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
    case
      when l.location_type = 'takeaway' then false
      else o.id is not null
    end as occupied,
    case
      when l.location_type = 'takeaway' then false
      else (
        o.id is not null
        and (public.is_owner() or o.created_by = auth.uid())
      )
    end as can_manage,
    case
      when l.location_type = 'table'
       and o.id is not null
       and (public.is_owner() or o.created_by = auth.uid())
      then o.order_number
      else null
    end as order_number
  from locations l
  left join public.restaurant_orders o
    on l.location_type = 'table'
   and o.business_id = public.auth_business_id()
   and o.status = 'open'
   and o.location_type = 'table'
   and o.table_number = l.table_number
  order by
    case when l.location_type = 'takeaway' then 0 else 1 end,
    l.table_number;
$$;

revoke all on function public.list_restaurant_location_status() from public, anon;
grant execute on function public.list_restaurant_location_status() to authenticated;

notify pgrst, 'reload schema';
