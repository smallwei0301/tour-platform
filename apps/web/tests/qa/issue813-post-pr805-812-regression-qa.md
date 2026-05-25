# QA Evidence: Post-PR #805–#812 Soft-launch / Maintenance / SEO-a11y Regression Pass

**Issue:** #813  
**Date:** 2026-05-26  
**PRs covered:** #807 (public_paused middleware), #809 (maintenance page), #810 (SEO+a11y labels), #811 (qa evidence backfill), #812 (qa evidence), #817 (a11y DatePicker+guide apply form)  
**Risk level:** LOW (no payment/auth/DB-migration changes)

## Automated Test Results

### Lint
PASS — `npm run lint -w @tour/web` exited 0, no errors (deprecation warning for eslintrc v10 migration only — pre-existing, non-blocking).

### Typecheck
PASS — `npm run typecheck -w @tour/web` (`tsc --noEmit`) exited 0, no errors.

### Middleware / Soft-launch Tests
`issue805-public-paused-middleware.test.mjs`: 14/14 passed — all ACs (AC1 block, AC2 whitelist bypass, AC3 fail-open, AC4 admin exempt, guard placement) pass.  
`issue551-soft-launch-guards.test.mjs`: 14/14 passed — draft route, checkout route, refund-callback route guards all pass.

### V2 Core Smoke
PASS — 131/131 tests passed across `v2-available-slots`, `v2-booking-draft-checkout`, `booking-state`, `ecpay-callback`, `v2-route-contract-smoke`. No failures, no cancellations.

### CI (main branch)
PASS — Latest CI run on main (`a2ffeb4`) concluded `success` for both `ci` and `secret-scan` workflows. Periodic jobs (refund-reconcile, synthetic-health-probe, pre-tour-reminder-sweep) also `success`.

## Manual / Static Verification

### #807 — public_paused middleware

- [x] Public routes redirect to /maintenance when public_paused=true — covered by issue805 test suite (14/14 pass)
- [x] API routes return 503 when paused — covered by issue805 test suite (AC1: returns 503 or maintenance redirect)
- [x] Admin/guide/auth routes exempt — covered by issue805 test suite (AC4: guard skips /admin/*, /api/admin/*, auth routes)
- [x] Fail-open on getControls() error — covered by issue805 test suite (AC3: try/catch, defaults to false)

### #809 — /maintenance page

- [x] Branded Midao page renders (山墨 #1A2E1F / 朝霞 #C2542E / 苔綠 #5E7A4F palette, wrench SVG icon) — confirmed in `app/maintenance/page.tsx` (inline color values match brand book)
- [x] Zero API/Supabase calls — confirmed: `page.tsx` is a pure server component with no `fetch`, `createClient`, or data calls
- [x] robots: { index: false } — confirmed: `export const metadata = { ..., robots: { index: false } }` at line 7

### #810/#817 — SEO + a11y

- [x] aggregateRating JSON-LD emits only when ratingAvg != null && ratingCount > 0 — confirmed in `app/experiences/[slug]/page.tsx` line 88: `...(experience.ratingAvg != null && experience.ratingCount && experience.ratingCount > 0 ? { aggregateRating: ... } : {})`
- [x] Form label associations (htmlFor+id) — admin login (`admin-token`, `admin-email`), contact form (`contact-name`, `contact-email`, `contact-subject`, `contact-message`), checkout schedule select (`schedule-select`) and contact fields (`contact-field-${index}`) — all confirmed with explicit `htmlFor`+`id` pairings
- [x] Guide apply form label associations steps 1 & 2 — confirmed in `app/guide/apply/page.tsx`: step 1 (`apply-fullname`, `apply-phone`, `apply-email`, `apply-city`, `apply-bio`) and step 2 (`apply-id-doc`, `apply-photo`) all have `htmlFor`+`id` with `aria-required="true"`
- [x] DatePicker aria-labelledby="calendar-title" — confirmed in `src/components/activity/DatePicker.tsx` line 135: `role="dialog" aria-modal="true" aria-labelledby="calendar-title"` and matching `id="calendar-title"` span on line 138

## Verdict

PASS

All ACs verified across automated tests (159/159 total: 14+14+131) and static code inspection. CI is green on main. No regressions found in v2 booking core, middleware guards, maintenance page, SEO JSON-LD, or a11y label associations. PRs #807, #809, #810, #811, #812, #817 collectively introduce no payment/auth/DB-migration risk.
