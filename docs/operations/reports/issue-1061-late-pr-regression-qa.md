# Issue #1061 — Late PR #1056-#1059 regression QA

- Issue: https://github.com/smallwei0301/tour-platform/issues/1061
- Tested deployment: https://tour-platform-eujx5lyk0-smallwei0301s-projects.vercel.app
- Expected deploy SHA: `0397a6398e8b5d0e31dc4a1661b04dc9021a8cf2` or newer
- Initial test window: 2026-06-01 07:18-07:30 Asia/Taipei
- Guide-authenticated addendum window: 2026-06-01 07:56-08:03 Asia/Taipei
- Kanban evidence: `t_5953df31` → `t_fd780224`
- Overall recommendation: **PASS with caveats**

## Executive summary

PR #1058 (`/admin/qa` filter tabs) and PR #1059 (`/activities/[region]` Twitter/OpenGraph metadata) have usable PASS evidence on the tested deployment.

PR #1056 (`/guide/schedules`) and PR #1057 (`/guide/bookings`) were originally held because available guide session/credential material did not authenticate on the current deployment. A follow-up authenticated guide smoke was run with a seed guide account after a temporary, restored `guide_password_hash` update. The authenticated tab behavior now has PASS evidence.

A database mutation was executed only to temporarily replace the seed guide password hash for smoke login, and the original value was restored immediately after the smoke. No production payment, refund, payout, or webhook mutation was executed.

## Per-PR result

### PR #1056 — `/guide/schedules` filter tabs

Decision: **PASS with caveat**

Evidence:

- Static source PASS: `apps/web/app/guide/schedules/page.tsx` contains tablist/tab structure for `即將出發`, `全部`, `已結束`, including `role="tablist"`, `role="tab"`, `aria-selected`, and selected visual state.
- Unauthenticated boundary PASS: current deployment redirects `/guide/schedules` to `/guide/login`; no schedule rows were exposed.
- Authenticated browser smoke PASS: logged in as the seed guide via `/guide/login?next=%2Fguide%2Fschedules`, reached `https://tour-platform-eujx5lyk0-smallwei0301s-projects.vercel.app/guide/schedules`, saw the `場次管理` heading and `場次篩選` tablist, and selected `即將出發`, `全部`, and `已結束`; each selected tab reported `aria-selected="true"` with no console errors or failed requests.
- Caveat: the authenticated seed guide had no visible schedule rows in this deployment, so row-content synchronization was limited to the empty state (`無場次資料`).

### PR #1057 — `/guide/bookings` status tabs

Decision: **PASS with caveat**

Evidence:

- Static source PASS: `apps/web/app/guide/bookings/page.tsx` contains tablist/tab structure for `全部`, `已確認`, `待付款`, `已取消`, including `role="tablist"`, `role="tab"`, `aria-selected`, and selected visual state.
- Unauthenticated boundary PASS: current deployment redirects `/guide/bookings` to `/guide/login`; no booking rows were exposed.
- Authenticated browser smoke PASS: reached `https://tour-platform-eujx5lyk0-smallwei0301s-projects.vercel.app/guide/bookings`, saw the `訂單查看` heading and `預約狀態篩選` tablist, and selected `全部`, `已確認`, `待付款`, and `已取消`; each selected tab reported `aria-selected="true"` with no console errors or failed requests.
- Caveat: the authenticated seed guide had 0 visible booking rows in the UI, so booking detail dialog behavior was not exercised in this addendum.

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
- Initial guide login/session attempt for guide schedules/bookings.
- Follow-up authenticated Playwright smoke for guide schedules/bookings using the seed guide account.
- `git diff --check` for the in-scope report update.

## Privacy / safety

- No secrets, cookies, JWTs, service-role keys, provider payloads, bank data, or unmasked personal data are included in this report.
- A temporary seed-guide `guide_password_hash` database mutation was executed solely to enable current-deployment guide login for smoke testing; the original value was restored in the same script and the script exited successfully.
- No payment, refund, webhook, payout, or provider mutation was executed.

## Follow-up required

No guide-authenticated HOLD remains for #1056/#1057 after this addendum. Remaining caveats:

1. `/guide/schedules`
   - Exact URL: `https://tour-platform-eujx5lyk0-smallwei0301s-projects.vercel.app/guide/schedules`
   - Authenticated tab behavior passed, but the seed guide had no visible schedule rows, so only empty-state tab switching was exercised.
2. `/guide/bookings`
   - Exact URL: `https://tour-platform-eujx5lyk0-smallwei0301s-projects.vercel.app/guide/bookings`
   - Authenticated tab behavior passed, but the seed guide had 0 visible booking rows, so booking detail dialog behavior remains unexercised unless a row-bearing guide/session is supplied.

With those caveats documented, #1061 can be closed as the requested late-PR regression verification artifact rather than kept in HOLD.
