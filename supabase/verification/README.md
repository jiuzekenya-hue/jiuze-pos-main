# Phase 3 — Live Supabase Verification Guide

This sandbox has no network path to `supabase.co` and no credentials for
your project, so this verification has to be run by you (or in an
environment that can reach your project). Everything below is the exact
set of checks already passed locally — this just re-runs them for real.

Takes about 10 minutes.

## Prerequisites

- Access to the Supabase Dashboard (or CLI) for the JIUZE POS project.
- Nothing named `Verify Business A` / `Verify Business B` already
  exists in that project (the seed script uses those names and fixed
  placeholder IDs — see the safety note below).
- **Run this against a project you're comfortable seeding throwaway
  test data into.** It's safe on an empty/dev project or the pilot
  project before go-live. It is *not* something to run against a
  project already holding a real business's live sales data — the
  checks themselves are read/write-safe and self-contained (test data
  only, fully cleaned up at the end), but there's no reason to mix
  test businesses into a project that has real ones.

## Run order

1. Apply migrations (Step 1)
2. Create 4 real test auth users (Step 2)
3. Seed test data (Step 3)
4. Run verification checks (Step 4)
5. Clean up (Step 5)

Don't skip ahead — each step depends on the one before it.

## Step 1 — Apply the migrations

Using the Supabase CLI (recommended):

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Or manually: open the SQL Editor in your Supabase dashboard and run, **in
order**, the contents of:

1. `supabase/migrations/0001_core_tables.sql`
2. `supabase/migrations/0002_functions_triggers.sql`
3. `supabase/migrations/0003_rls_policies.sql`
4. `supabase/migrations/0004_complete_sale.sql`

Confirm each one completes with no errors before running the next.

## Step 2 — Create 4 real test auth users

Don't `INSERT` directly into `auth.users` — Supabase's Auth system
manages that table (password hashing, required internal fields,
triggers) and raw inserts can leave it in a broken state.

Easiest: **Dashboard → Authentication → Users → Add user**, create 4
users (any password), and copy each user's UUID:

- `owner-a@test.com`
- `cashier-a@test.com`
- `owner-b@test.com`
- `cashier-b@test.com`

(Or use `supabase.auth.admin.createUser()` from a trusted server-side
script with your service-role key, if you'd rather script it.)

Keep the 4 UUIDs handy — you'll paste each one into both `01_seed.sql`
and `02_checks.sql` in the next steps.

## Step 3 — Seed test data

Open `supabase/verification/01_seed.sql`. It contains **4 placeholders**
that must be replaced before running — search for `<` and you'll find
all of them:

| Placeholder | Replace with |
|---|---|
| `<OWNER-A-UUID>` | the `owner-a@test.com` user's UUID from Step 2 |
| `<CASHIER-A-UUID>` | the `cashier-a@test.com` user's UUID |
| `<OWNER-B-UUID>` | the `owner-b@test.com` user's UUID |
| `<CASHIER-B-UUID>` | the `cashier-b@test.com` user's UUID |

If any placeholder is left unreplaced, the script will fail loudly with
`invalid input syntax for type uuid` rather than silently inserting bad
data — that failure is expected and just means a placeholder was missed.

Everything else in the script (business IDs, category IDs, product
IDs) is a fixed, self-contained test value — nothing else needs
editing. Run the completed script in the SQL Editor as `postgres`
(the default connection — seeding is an admin action, same as a real
onboarding flow would use the service role).

## Step 4 — Run the verification checks

Open `supabase/verification/02_checks.sql` and replace the same 4
placeholders (`<OWNER-A-UUID>`, `<CASHIER-A-UUID>`, `<OWNER-B-UUID>`,
`<CASHIER-B-UUID>`) — they appear multiple times throughout the file,
so a find-and-replace across the whole file is easiest.

Then run it **one numbered section at a time** (sections are marked
`-- === N. ... ===`), not all 8 sections in a single execution.
**Sections 5, 6, and 7 contain a statement that is expected to raise an
error** (that's the check passing) — in the Supabase SQL Editor, an
error aborts the rest of that execution, so anything after it in the
same "Run" won't happen. Running section-by-section avoids that.

Each `select '...' as check;` line states what that block verifies and
what result to expect. Together they exercise:

- tenant isolation (Business A can't read/write Business B)
- owner vs. cashier permissions
- `complete_sale()` end-to-end, including the receipt it returns
- insufficient-stock rejection + rollback
- inactive-product rejection
- underpayment rejection
- direct writes to `sales`/`payments`/`stock_movements` still blocked

The script uses Supabase's real `auth.uid()` (via `request.jwt.claims`)
and the real `authenticated` role — this is the standard way to test
RLS from the SQL Editor. Note that the SQL Editor connects as the
`postgres` superuser by default, which **bypasses RLS entirely** — the
`set role authenticated;` line in each block is what makes RLS actually
apply, so don't skip it.

## Step 5 — Clean up

Run `supabase/verification/03_cleanup.sql` (no placeholders — it
targets the two fixed test business IDs directly). It deletes the two
test businesses, which cascades to their profiles/categories/products/
sales/sale_items/payments/stock_movements/settings via foreign keys.
Confirmed locally to leave 0 rows behind.

Then go back to **Dashboard → Authentication → Users** and delete the
4 test users manually (auth users aren't touched by the SQL cleanup,
by design — same reasoning as Step 2).

## Reporting back

Paste me the output of `02_checks.sql` (or just tell me which checks
passed/failed) and I'll mark Phase 3 verified and move to Phase 4.

