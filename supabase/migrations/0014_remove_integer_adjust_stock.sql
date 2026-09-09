-- JIUZE POS — Migration 14
-- Remove the obsolete integer adjust_stock() overload.
--
-- Migration 9 introduced numeric quantities for variable-unit products.
-- Migration 11 recreated the older integer overload while adding the
-- subscription guard. PostgREST cannot resolve overloaded RPC functions
-- that share the same argument names but differ only by numeric type.
-- Keep only the numeric implementation from migration 12.

revoke all
on function public.adjust_stock(uuid, integer, text, text)
from public;

drop function if exists public.adjust_stock(uuid, integer, text, text);
