# Issue #1061 — Late PR #1056-#1059 regression QA

- Issue: https://github.com/smallwei0301/tour-platform/issues/1061
- Tested deployment: https://tour-platform-eujx5lyk0-smallwei0301s-projects.vercel.app
- Expected deploy SHA: `0397a6398e8b5d0e31dc4a1661b04dc9021a8cf2` or newer
- Test window: 2026-06-01 07:18-07:30 Asia/Taipei
- Kanban evidence: `t_5953df31` → `t_fd780224`
- Overall recommendation: **HOLD**

## Executive summary

PR #1058 (`/admin/qa` filter tabs) and PR #1059 (`/activities/[region]` Twitter/OpenGraph metadata) have usable PASS evidence on the tested deployment.

PR #1056 (`/guide/schedules`) and PR #1057 (`/guide/bookings`) are **HOLD**, not FAIL: static source and unauthenticated access-boundary checks passed, but available guide session/credential material did not authenticate on the current deployment. Therefore authenticated guide tab behavior cannot be honestly declared PASS in this round.

No production payment, refund, payout, webhook, or database mutation was executed.

## Per-PR result

### PR #1056 — `/guide/schedules` filter tabs

Decision: **HOLD**

Evidence:

- Static source PASS: `apps/web/app/guide/schedules/page.tsx` contains tablist/tab structure for `即將出發`, `全部`, `已結束`, including `role="tablist"`, `role="tab"`, `aria-selected`, and selected visual state.
- Unauthenticated boundary PASS: current deployment redirects `/guide/schedules` to `/guide/login`; no schedule rows were exposed.
- Authenticated browser smoke HOLD: available guide storageState / saved guide credential did not authenticate on the current deployment, so tab interaction and result synchronization could not be exercised.

### PR #1057 — `/guide/bookings` status tabs

Decision: **HOLD**

Evidence:

- Static source PASS: `apps/web/app/guide/bookings/page.tsx` contains tablist/tab structure for `全部`, `已確認`, `待付款`, `已取消`, including `role="tablist"`, `role="tab"`, `aria-selected`, and selected visual state.
- Unauthenticated boundary PASS: current deployment redirects `/guide/bookings` to `/guide/login`; no booking rows were exposed.
- Authenticated browser smoke HOLD: available guide session/credential did not authenticate on current deployment, so tab interaction and booking-detail dialog checks could not be exercised.

### PR #1058 — `/admin/qa` status tabs

Decision: **PASS with caveat**

Evidence:

- Static source PASS: `apps/web/app/admin/qa/page.tsx` contains status filter tablist/tab structure and `/api/admin/qa?status=...` contract.
- Desktop and mobile authenticated smoke PASS: all four tabs (`待審核`, `已核准`, `已拒絕`, `全部`) were activated and `aria-selected=true` was observed.
- Unauthenticated boundary PASS: `/admin/qa` redirects to `/admin/login?next=%2Fadmin%2Fqa`; admin-only rows were not exposed.

Caveat:

- The tested live QA dataset had 0 rows for all filters, so non-empty row-content coherence was not exercised.

### PR #1059 — `/activities/[region]` Twitter card metadata

Decision: **PASS**

Evidence:

- Static source PASS: `apps/web/app/activities/[region]/page.tsx` includes `generateMetadata` with Twitter `summary_large_image`, title, description, and images.
- Deployment curl PASS: `/activities/kaohsiung` and `/activities/taipei` returned region-correct Twitter/OpenGraph metadata.
- Metadata did not expose private admin/guide-only data in observed output.

## Checks run

- Git path-limited source inspection for four in-scope files.
- `gh pr view` for PR #1056-#1059 status / merge context.
- Static source inspection:
  - `apps/web/app/guide/schedules/page.tsx`
  - `apps/web/app/guide/bookings/page.tsx`
  - `apps/web/app/admin/qa/page.tsx`
  - `apps/web/app/activities/[region]/page.tsx`
- Current deployment checks against `https://tour-platform-eujx5lyk0-smallwei0301s-projects.vercel.app`.
- Desktop/mobile browser smoke for admin QA tabs.
- Guide login/session attempt for guide schedules/bookings.
- `git diff --check` for the four in-scope files.

## Privacy / safety

- No secrets, cookies, JWTs, service-role keys, provider payloads, bank data, or unmasked personal data are included in this report.
- No payment, refund, webhook, payout, or production database mutation was executed.

## Follow-up required

To close #1061 as GO, run a fresh guide-authenticated smoke on a deployment where a valid guide session exists, covering:

1. `/guide/schedules`
   - Exact URL: `https://tour-platform-eujx5lyk0-smallwei0301s-projects.vercel.app/guide/schedules`
   - Expected: authenticated guide sees the schedule page, filter tabs are exposed as tabs, selecting `即將出發` / `全部` / `已結束` updates visible state and results without runtime errors.
2. `/guide/bookings`
   - Exact URL: `https://tour-platform-eujx5lyk0-smallwei0301s-projects.vercel.app/guide/bookings`
   - Expected: authenticated guide sees the bookings page, selecting `全部` / `已確認` / `待付款` / `已取消` updates visible state and results; booking detail dialog remains usable if rows exist.

If valid guide auth remains unavailable, keep #1061 open with HOLD status rather than closing it as completed.
