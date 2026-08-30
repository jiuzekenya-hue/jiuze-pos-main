-- JIUZE POS — Phase 3, Migration 3
-- Row Level Security. This is the authoritative tenant-isolation and
-- authorization layer — the frontend must never be relied on for this
-- (brief §4, §27).
--
-- General shape:
--   * SELECT policies scope every table to the caller's own business
--     via public.auth_business_id(), with an additional cashier
--     restriction on sales/sale_items/payments to "their own sales"
--     per the role table in brief §5.
--   * INSERT/UPDATE policies on reference data (categories, products,
--     settings, profiles, businesses) are owner-only, matching the
--     "Owner can ... Change prices / Configure business / Manage
--     users" vs "Cashier cannot ..." split in brief §5.
--   * sales, sale_items, payments, and stock_movements have NO
--     client-facing INSERT/UPDATE/DELETE policy at all. Per brief §7
--     and §27, completing a sale is a transactional, multi-table
--     operation that must go through a secure database function
--     (complete_sale, migration 4) — allowing direct table writes here
--     would let a client fabricate a sale, payment, or stock movement
--     without the validation that function performs. This is stricter
--     than "owner can adjust stock" in §5 implies for the UI layer;
--     the UI-level stock-adjustment action (Phase 6) will call its own
--     dedicated function, not write to stock_movements directly.
--   * No table has a DELETE policy for business data rows. Sales,
--     sale_items, payments, and stock_movements must never be deleted
--     (brief §9, §11). Products are deactivated, never deleted (§10).
--     Categories and settings have no deletion requirement in the
--     brief either; omitting DELETE everywhere is the conservative
--     default — it can be relaxed later for categories specifically
--     if a real need appears, without weakening anything already built.

alter table public.businesses      enable row level security;
alter table public.profiles        enable row level security;
alter table public.categories      enable row level security;
alter table public.products        enable row level security;
alter table public.sales           enable row level security;
alter table public.sale_items      enable row level security;
alter table public.payments        enable row level security;
alter table public.stock_movements enable row level security;
alter table public.settings        enable row level security;

-- ---------------------------------------------------------------------
-- businesses
-- No INSERT policy: creating a new tenant (and its first owner profile)
-- is an admin/provisioning action performed with the service role, not
-- a self-service action in V1 — see the Phase 3 report for why.
-- ---------------------------------------------------------------------
create policy businesses_select_own
  on public.businesses for select
  to authenticated
  using (id = public.auth_business_id());

create policy businesses_update_owner
  on public.businesses for update
  to authenticated
  using (id = public.auth_business_id() and public.is_owner())
  with check (id = public.auth_business_id());

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create policy profiles_select_same_business
  on public.profiles for select
  to authenticated
  using (business_id = public.auth_business_id());

-- Owners add cashiers. Owners cannot use this path to create another
-- owner account for themselves or anyone else (brief §23 only lists
-- "Add cashier" under Users).
create policy profiles_insert_owner_adds_cashier
  on public.profiles for insert
  to authenticated
  with check (
    public.is_owner()
    and business_id = public.auth_business_id()
    and role = 'cashier'
  );

create policy profiles_update_owner
  on public.profiles for update
  to authenticated
  using (business_id = public.auth_business_id() and public.is_owner())
  with check (business_id = public.auth_business_id());

-- ---------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------
create policy categories_select_own_business
  on public.categories for select
  to authenticated
  using (business_id = public.auth_business_id());

create policy categories_insert_owner
  on public.categories for insert
  to authenticated
  with check (business_id = public.auth_business_id() and public.is_owner());

create policy categories_update_owner
  on public.categories for update
  to authenticated
  using (business_id = public.auth_business_id() and public.is_owner())
  with check (business_id = public.auth_business_id());

create policy categories_delete_owner
  on public.categories for delete
  to authenticated
  using (business_id = public.auth_business_id() and public.is_owner());

-- ---------------------------------------------------------------------
-- products
-- No delete policy: products with sales history must never be
-- hard-deleted; is_active is used instead (brief §10).
-- ---------------------------------------------------------------------
create policy products_select_own_business
  on public.products for select
  to authenticated
  using (business_id = public.auth_business_id());

create policy products_insert_owner
  on public.products for insert
  to authenticated
  with check (business_id = public.auth_business_id() and public.is_owner());

create policy products_update_owner
  on public.products for update
  to authenticated
  using (business_id = public.auth_business_id() and public.is_owner())
  with check (business_id = public.auth_business_id());

-- ---------------------------------------------------------------------
-- sales
-- Owners see every sale in the business; cashiers see only sales they
-- personally rang up (brief §5: cashier "View their sales").
-- ---------------------------------------------------------------------
create policy sales_select_scoped
  on public.sales for select
  to authenticated
  using (
    business_id = public.auth_business_id()
    and (public.is_owner() or cashier_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- sale_items
-- No direct business_id column (brief §6 schema); scoped by joining to
-- the parent sale, with the same owner/cashier-own-sale restriction.
-- ---------------------------------------------------------------------
create policy sale_items_select_scoped
  on public.sale_items for select
  to authenticated
  using (
    exists (
      select 1 from public.sales s
      where s.id = sale_items.sale_id
        and s.business_id = public.auth_business_id()
        and (public.is_owner() or s.cashier_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------
create policy payments_select_scoped
  on public.payments for select
  to authenticated
  using (
    business_id = public.auth_business_id()
    and (
      public.is_owner()
      or exists (
        select 1 from public.sales s
        where s.id = payments.sale_id and s.cashier_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------
-- stock_movements
-- Inventory history is an owner-only surface (cashier navigation is
-- POS + My Sales only, brief §14).
-- ---------------------------------------------------------------------
create policy stock_movements_select_owner
  on public.stock_movements for select
  to authenticated
  using (business_id = public.auth_business_id() and public.is_owner());

-- ---------------------------------------------------------------------
-- settings
-- Readable by both roles (a cashier's receipt needs receipt_header /
-- receipt_footer at print time); only owners can change it (brief §23).
-- No insert/delete policy: exactly one row per business, created by
-- the create_default_settings trigger.
-- ---------------------------------------------------------------------
create policy settings_select_own_business
  on public.settings for select
  to authenticated
  using (business_id = public.auth_business_id());

create policy settings_update_owner
  on public.settings for update
  to authenticated
  using (business_id = public.auth_business_id() and public.is_owner())
  with check (business_id = public.auth_business_id());

-- ---------------------------------------------------------------------
-- Table-level grants.
--
-- RLS policies restrict *which rows* a statement can touch, but
-- Postgres still requires the base privilege before it will even
-- consider a statement. These grants are deliberately narrower than
-- "all privileges" so that, for sales/sale_items/payments/
-- stock_movements, direct client writes are impossible even if a
-- future policy were added by mistake — there is no INSERT/UPDATE
-- privilege for `authenticated` to invoke in the first place. All
-- writes to those four tables happen inside SECURITY DEFINER
-- functions (migration 4), which run as the function owner and are
-- unaffected by these grants.
--
-- IMPORTANT: a fresh Supabase project grants broad default privileges
-- (effectively ALL on every table in `public`) to `anon` and
-- `authenticated` at project creation, independent of any migration.
-- A plain `grant select on <table> to authenticated` is *additive* —
-- it does not strip that pre-existing broader grant. Discovered via
-- live verification (Phase 3, first pass): direct writes to these four
-- tables were correctly blocked, but by RLS alone rather than by the
-- intended privilege-plus-RLS combination, because the default grant
-- was never revoked. The explicit `revoke all` below removes that
-- default first, so the narrower `grant select` that follows is the
-- *only* privilege authenticated/anon actually hold on these tables —
-- restoring the intended two-layer protection without changing any
-- RLS policy or the complete_sale() security model.
-- ---------------------------------------------------------------------

grant usage on schema public to authenticated;

grant select, update on public.businesses to authenticated;

grant select, insert, update on public.profiles to authenticated;

grant select, insert, update, delete on public.categories to authenticated;

grant select, insert, update on public.products to authenticated;

revoke all on public.sales from authenticated, anon;
revoke all on public.sale_items from authenticated, anon;
revoke all on public.payments from authenticated, anon;
revoke all on public.stock_movements from authenticated, anon;

grant select on public.sales to authenticated;
grant select on public.sale_items to authenticated;
grant select on public.payments to authenticated;
grant select on public.stock_movements to authenticated;

grant select, update on public.settings to authenticated;
