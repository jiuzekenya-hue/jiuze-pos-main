-- TEMPORARY: Disable printed restaurant order content locks.
-- Payment validation and print audit records remain unchanged.
-- Re-enable these triggers when the temporary period ends.

alter table public.restaurant_orders
  disable trigger guard_printed_restaurant_order_update;

alter table public.restaurant_orders
  disable trigger guard_printed_restaurant_order_delete;

alter table public.restaurant_order_items
  disable trigger guard_printed_restaurant_order_items;
