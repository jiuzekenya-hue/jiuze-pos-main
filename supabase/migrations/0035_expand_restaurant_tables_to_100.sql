-- Expand restaurant table locations from 1-12 to 1-100.
-- Keep the UI, location status RPC, order validation, and database constraint aligned.

alter table public.restaurant_orders
  drop constraint if exists restaurant_orders_table_number_check;

alter table public.restaurant_orders
  add constraint restaurant_orders_table_number_check
  check (table_number >= 1 and table_number <= 100);

do $$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(
    'public.list_restaurant_location_status()'::regprocedure
  );

  if position('generate_series(1, 12)' in v_definition) = 0 then
    raise exception 'Expected table range was not found in list_restaurant_location_status(). Migration stopped.';
  end if;

  v_definition := replace(
    v_definition,
    'generate_series(1, 12)',
    'generate_series(1, 100)'
  );
  execute v_definition;

  v_definition := pg_get_functiondef(
    'public.save_restaurant_order(uuid, text, integer, jsonb, numeric)'::regprocedure
  );

  if position('p_table_number > 12' in v_definition) = 0 then
    raise exception 'Expected table validation was not found in save_restaurant_order(). Migration stopped.';
  end if;

  v_definition := replace(
    v_definition,
    'p_table_number > 12',
    'p_table_number > 100'
  );
  execute v_definition;
end;
$$;
