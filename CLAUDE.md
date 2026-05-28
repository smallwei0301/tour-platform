# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Communication language

When responding to the user in chat (explanations, summaries, status updates, questions), always reply in Traditional Chinese (繁體中文 / zh-Hant). Keep code, identifiers, file paths, and Conventional-Commit message prefixes (`feat:`/`fix:` …) in their existing English form.

## What this is

Tour Platform (brand: **Midao / 祕島**) — a Taiwan local-guide tour marketplace. Travelers browse activities, book slots, pay (ECPay), and manage orders; guides manage availability and bookings; admins run a back-office POS/order/refund console. Most product/operations docs and code comments are in Traditional Chinese.

All web copy, colors, and tone are governed by `BRAND_BOOK.md` — consult it before writing user-facing strings.

## Commands

Node 22 is required and pinned (`.nvmrc` + `engines`). Run `npm install` once at the repo root (npm workspaces).

Root scripts proxy to the `@tour/web` workspace:

- `npm run dev` — Next.js dev server
- `npm run build` — production build (CI also runs this)
- `npm run lint` — ESLint (flat config disabled via `ESLINT_USE_FLAT_CONFIG=false`)
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — unit/integration tests

Tests use the **Node built-in test runner** on `.mjs` files (not Jest/Vitest):

- All tests: `npm test` → `node --test tests/**/*.test.mjs`
- Single file: `node --test apps/web/tests/api/booking-state.test.mjs`
- By name: `node --test --test-name-pattern='Blackout' apps/web/tests/slot-generator.test.mjs`
- Targeted smoke suites are defined as scripts in `apps/web/package.json` (e.g. `test:smoke:v2-core`, `test:smoke:guide-blackout`, `test:smoke:admin-pos-line`).
- E2E (Playwright): `npm run test:e2e -w @tour/web` (also `:ui`, `:headed`).

CI (`.github/workflows/ci.yml`) runs, in order: lint → typecheck → test → build → `scripts/preflight-check.sh`. The build runs with `NODE_ENV=production`, so security-env guards require strong non-default secrets (CI injects `GUIDE_SESSION_SECRET` / `ADMIN_ACCESS_TOKEN`).

`npm run readiness:snapshot` regenerates `docs/operations/reports/readiness-live-state-latest.md` (live issue/PR state is intentionally NOT hand-written into the README — it auto-refreshes every 6h via CI).

## Architecture

**Monorepo:** npm workspaces — `apps/web` (the entire Next.js app), `packages/config`, `packages/ui`. Almost all real code lives in `apps/web`.

**Stack:** Next.js 15 (App Router) + React 19, TypeScript, Supabase (Postgres) backend, Sentry, deployed on Vercel.

### Data layer with in-memory fallback
`apps/web/src/lib/db.mjs` is the data gateway. `hasSupabaseEnv()` checks for `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; when absent (local dev / tests) it falls back to an in-memory store (`store.mjs`, `services.mjs`, `admin.mjs`). This is why much code is written so it works with no database — tests rely on the fallback. The service-role Supabase client is for server/admin work; traveler-facing auth uses the SSR anon client (`src/lib/supabase/{server,client}.ts`).

### Three auth realms (see `apps/web/middleware.ts`)
Edge middleware is the single front door and routes by path prefix:
- **Traveler** — Supabase auth cookies; middleware refreshes the session (with a timeout, fail-open). Marketing/activity pages stay public and cacheable.
- **Guide** — `guide_token` HMAC cookie. Middleware does a *lightweight format check only* (edge has no Node crypto); full HMAC verification happens in API routes via `verifyGuideSession()`.
- **Admin** — token + email allowlist + session-version check (`isAdminAuthorized`). Credentials are never read from URL query params.

CSRF: double-submit token (`tp_csrf` cookie vs `x-csrf-token` header) is enforced in middleware for cookie-authenticated mutations on `/api/{admin,guide,me,orders,reviews}` (issuance/login endpoints exempt).

### Soft-launch / kill-switch
Middleware's `applyPublicPausedGuard` reads `soft_launch_controls` (via anon client). When `public_paused` is set, non-exempt requests get a 503 (API) or redirect to `/maintenance` (pages), unless whitelisted. Fail-open on any error. Admin/guide/auth routes are always exempt.

### Booking V2 vs legacy
The platform is mid-migration from a static-schedule model to an availability/slots **Booking V2** engine (Phase 12, issue #621). Feature flags live in `apps/web/src/config/feature-flags.mjs`; `NEXT_PUBLIC_BOOKING_V2_ENABLED` **defaults ON** and `=0` rolls back to legacy. V2 API routes live under `apps/web/app/api/v2/**`; availability logic under `src/lib/availability-v2/` and `slot-generator.ts`. Booking-state and order/payment chains span three layers (booking → order → payment) that must stay consistent; ECPay callbacks must be idempotent (`checkout-idempotency.ts`, `payment-reconciliation.ts`).

### `.ts` vs `.mjs` in `src/lib`
Logic that must be importable by edge middleware or run without TS compilation (auth, sessions, soft-launch, store) is authored as `.mjs`; the rest is `.ts`. TypeScript `strict` is on but full strictness is still being expanded across booking-critical modules (issue #68) — match the style of the file you are editing.

### Database migrations
`supabase/migrations/` — early ones are numbered (`001_…`–`022_…`), newer ones are timestamped (`20260409…`). Migrations are applied via the scripts at the repo root (`apply_migrations.sh`, `execute-migrations.*`) — see `MIGRATION-*-GUIDE.md`.

## Conventions

- New API work should target the `v2` routes/contracts unless fixing legacy behavior; check `docs/04-tech/04-tech-architecture/10-api-spec-v2-booking-pos.md` for the V2 contract.
- Keep readiness/ops docs in sync with real state via `npm run readiness:snapshot` rather than editing live counts by hand.
- Secrets are guarded at startup (`src/config/security-env.mjs`, `startup-env.mjs`) and by a CI secret-scan workflow — never commit real secrets or weaken these guards.
