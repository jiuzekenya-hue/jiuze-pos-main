# JIUZE POS — Supabase migrations

Apply in order via the Supabase CLI (`supabase db push`) or by pasting
each file into the SQL editor in order:

1. `migrations/0001_core_tables.sql` — the 9 approved V1 tables
2. `migrations/0002_functions_triggers.sql` — updated_at triggers,
   default-settings auto-creation, stock non-negativity trigger, and
   the `auth_business_id()` / `auth_role()` / `is_owner()` helpers
3. `migrations/0003_rls_policies.sql` — RLS enablement, policies, and
   table-level grants
4. `migrations/0004_complete_sale.sql` — the atomic checkout function

## What was verified locally, and what wasn't

These migrations were applied and exercised against a local PostgreSQL
16 instance with a minimal stand-in for Supabase's `auth` schema (see
the Phase 3 report for the full test log). They were **not** run
against a real Supabase project — this sandbox has no network path to
supabase.co. Before going live:

- Apply these migrations to your actual Supabase project (CLI or SQL
  editor) and re-run at least the tenant-isolation and `complete_sale`
  checks from the report against it.
- Confirm `auth.uid()` and the `authenticated`/`anon` roles behave as
  expected in your project (they're a core, stable part of Supabase,
  but the local stand-in used here is necessarily a simplification).
- Create your first real business + owner profile (see the "business
  bootstrapping" note in the Phase 3 report — this is intentionally
  not self-service in V1).
