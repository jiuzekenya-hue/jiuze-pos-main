-- JIUZE POS — Phase 3, Migration 1
-- Core schema: businesses, profiles, categories, products, sales,
-- sale_items, payments, stock_movements, settings.
--
-- Source of truth: JIUZE Retail POS V1 Implementation Brief, §6.

create extension if not exists pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- businesses
-- ---------------------------------------------------------------------
create table public.businesses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (btrim(name) <> ''),
  phone      text,
  location   text,
  logo_url   text,
  currency   text not null default 'KES',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.businesses is
  'One row per JIUZE POS tenant business. Root of all multi-tenant scoping.';

-- ---------------------------------------------------------------------
-- profiles
-- One row per Supabase Auth user, 1:1 with auth.users, scoped to a
-- single business. Role is restricted to the two V1 roles.
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  full_name   text,
  phone       text,
  role        text not null check (role in ('owner', 'cashier')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Links a Supabase Auth user to a business and a V1 role (owner|cashier).';

create index profiles_business_id_idx on public.profiles (business_id);

-- ---------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name        text not null check (btrim(name) <> ''),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index categories_business_id_idx on public.categories (business_id);

-- ---------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------
create table public.products (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  category_id    uuid references public.categories (id) on delete set null,
  name           text not null check (btrim(name) <> ''),
  sku            text,
  barcode        text,
  cost_price     numeric(12, 2) not null default 0 check (cost_price >= 0),
  selling_price  numeric(12, 2) not null check (selling_price >= 0),
  -- V1 explicitly excludes weighted products (brief §28), so stock is
  -- a whole-unit count, not a fractional weight.
  stock_quantity integer not null default 0,
  minimum_stock  integer not null default 0 check (minimum_stock >= 0),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on column public.products.stock_quantity is
  'Fast current-stock read. May be negative only when the owning business''s settings.allow_negative_stock is true (enforced by trigger enforce_stock_non_negative). The authoritative audit trail is stock_movements.';

create index products_business_id_idx on public.products (business_id);
create index products_category_id_idx on public.products (category_id);
create index products_business_active_idx on public.products (business_id, is_active);

-- SKU unique per business, only when present.
create unique index products_business_sku_key
  on public.products (business_id, sku)
  where sku is not null;

-- Barcode unique per business, only when present.
create unique index products_business_barcode_key
  on public.products (business_id, barcode)
  where barcode is not null;

-- ---------------------------------------------------------------------
-- sales
-- ---------------------------------------------------------------------
create table public.sales (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  receipt_number  text not null,
  cashier_id      uuid not null references public.profiles (id),
  subtotal        numeric(12, 2) not null check (subtotal >= 0),
  discount        numeric(12, 2) not null default 0 check (discount >= 0),
  total           numeric(12, 2) not null check (total >= 0),
  status          text not null default 'completed'
                    check (status in ('completed', 'voided', 'returned')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.sales is
  'Sales are never deleted (brief §9). Status transitions record voids and returns without destroying history.';

create index sales_business_id_idx on public.sales (business_id);
create index sales_business_created_idx on public.sales (business_id, created_at desc);
create index sales_cashier_id_idx on public.sales (cashier_id);

-- Receipt number uniqueness per business.
create unique index sales_business_receipt_number_key
  on public.sales (business_id, receipt_number);

-- ---------------------------------------------------------------------
-- sale_items
-- Historical product name/price/cost are captured at time of sale and
-- must never be recomputed from the current product row (brief §6, §12).
-- ---------------------------------------------------------------------
create table public.sale_items (
  id           uuid primary key default gen_random_uuid(),
  sale_id      uuid not null references public.sales (id) on delete cascade,
  -- Products are never hard-deleted (brief §10), but the FK uses
  -- "on delete set null" defensively since sale_items preserves its
  -- own copy of product_name/unit_price/cost_price regardless.
  product_id   uuid references public.products (id) on delete set null,
  product_name text not null,
  quantity     integer not null check (quantity > 0),
  unit_price   numeric(12, 2) not null check (unit_price >= 0),
  cost_price   numeric(12, 2) not null check (cost_price >= 0),
  discount     numeric(12, 2) not null default 0 check (discount >= 0),
  subtotal     numeric(12, 2) not null check (subtotal >= 0),
  created_at   timestamptz not null default now()
);

create index sale_items_sale_id_idx on public.sale_items (sale_id);
create index sale_items_product_id_idx on public.sale_items (product_id);

-- ---------------------------------------------------------------------
-- payments
-- One payment per sale in V1 (no split payments, brief §13), enforced
-- by a unique index on sale_id rather than a payments-count elsewhere.
-- ---------------------------------------------------------------------
create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  sale_id     uuid not null references public.sales (id) on delete cascade,
  method      text not null check (method in ('cash', 'mpesa', 'card')),
  amount      numeric(12, 2) not null check (amount >= 0),
  reference   text,
  created_at  timestamptz not null default now()
);

create index payments_business_id_idx on public.payments (business_id);
create unique index payments_sale_id_key on public.payments (sale_id);

-- ---------------------------------------------------------------------
-- stock_movements
-- Signed quantity audit trail. Never deleted or edited after creation.
-- ---------------------------------------------------------------------
create table public.stock_movements (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  product_id   uuid not null references public.products (id) on delete cascade,
  type         text not null check (type in ('purchase', 'sale', 'adjustment', 'return', 'damage')),
  quantity     integer not null check (quantity <> 0),
  reference_id uuid,
  reason       text,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now()
);

create index stock_movements_business_id_idx on public.stock_movements (business_id);
create index stock_movements_product_id_idx on public.stock_movements (product_id);
create index stock_movements_business_created_idx
  on public.stock_movements (business_id, created_at desc);

-- ---------------------------------------------------------------------
-- settings
-- Exactly one row per business (see migration 2's auto-create trigger).
-- ---------------------------------------------------------------------
create table public.settings (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null unique references public.businesses (id) on delete cascade,
  receipt_header        text,
  receipt_footer        text,
  low_stock_threshold   integer not null default 5 check (low_stock_threshold >= 0),
  allow_negative_stock  boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
