# JIUZE POS

A simple, reliable, JIUZE-branded point of sale for small retail and grocery
businesses. Built as a reusable multi-tenant product — not a one-off for the
pilot customer.

Core job: sell products → record payment → update inventory → provide
receipts → show useful business information.

## Status

**Phase 1 — Foundation.** Project scaffold only. Authentication, the
database schema, and the POS itself are not yet built (see Phases 2–11 in
the implementation brief).

## Stack

- React + TypeScript + Vite
- Tailwind CSS v4
- PWA (installable app shell, online-first — no offline transaction sync)
- Supabase (Postgres, Auth, RLS) — client wired up, schema not yet created
- Netlify (deploy target)

## Getting started

```bash
npm install
cp .env.example .env   # then fill in your Supabase project URL and anon key
npm run dev
```

Other scripts:

```bash
npm run build     # type-check and build for production
npm run preview   # preview the production build locally
npm run lint       # oxlint
```

## Environment variables

See `.env.example`. Only the Supabase **URL** and **anon key** belong in
frontend environment variables. The anon key is safe to expose — it is
constrained by Row Level Security policies defined in Supabase. The
service-role key must never appear in frontend code or `VITE_`-prefixed
variables.

## Project structure

```
src/
  components/   shared UI components (empty — Phase 4+)
  pages/        route-level views (empty — Phase 2+)
  hooks/        shared React hooks
  lib/          supabase client, small utilities
  types/        shared TypeScript types, generated DB types
```

## Development process

This project is implemented in phases (see the implementation brief).
Each phase is verified before moving to the next — the whole POS is not
built in one pass.
