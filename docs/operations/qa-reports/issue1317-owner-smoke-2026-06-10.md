# #1317 Owner production smoke — 2026-06-10 evidence

**Scope:** the 5 owner-only acceptance verifications listed in #1317, plus #1284 / #1249 / #1258 / #1286-archive cross-checks while the smoke harness was warm. Production deployment commit at runtime: `c80f6079`. All credentials used (Supabase service_role / anon key, Vercel deployment URL) were session-scoped env vars; this report contains zero secrets.

> Status legend: ✅ PASS · 🟡 PARTIAL (one half verified, other half needs guide_token / admin_token) · 🔴 FAIL (acceptance disproved in production) · ⏸️ DEFER (cannot run from this sandbox)

## Summary table

| # | Subject | Status | Evidence |
|---|---|---|---|
| 1 | #1249 `/api/activities` cache HIT | ✅ PASS | curl headers — `x-vercel-cache: MISS → HIT` |
| 2 | #1258 `/api/activities?region=…` cache HIT | ✅ PASS | curl headers — `x-vercel-cache: MISS → HIT` |
| 3 | #1306 traveler multi-slot picker | ✅ PASS | API + Playwright screenshot |
| 4 | #1290 dynamic re-emit OFF path | ✅ PASS | rule table + API shape |
| 5 | #1307 Asia/Taipei TZ — traveler side | 🟡 PARTIAL | traveler API `+08:00`; guide preview side needs `guide_token` |
| 6 | #1289 guide ↔ traveler range parity | 🟡 PARTIAL | traveler API verified; guide preview needs `guide_token` |
| 7 | #1286 archived activity hidden from traveler | 🔴 **FAIL** | archived activity reachable via `/api/activities/{slug}` and `/activities/{slug}` |
| 8 | #1286 admin archive button end-to-end | ⏸️ DEFER | needs `ADMIN_ACCESS_TOKEN` (not provided) |
| 9 | #1284 guide payout dashboard hold-flags rendering | ⏸️ DEFER | needs `guide_token` (not provided) |
| 10 | #1249 / #1258 before-after metrics | ⏸️ DEFER | needs Lighthouse + prior baseline (sandbox limitation) |

A new high-severity follow-up issue was opened for item #7 — see "Action items" below.

---

## 1. #1249 `/api/activities` cache HIT

```
--- request 1 (cold) ---
HTTP/2 200
cache-control: public
x-vercel-cache: MISS
--- request 2 (warm) ---
HTTP/2 200
cache-control: public
x-vercel-cache: HIT
```

Verdict: ✅ Cache layer working as #1249 intended.
Outstanding: before/after Lighthouse metrics (#1249 issue body explicit requirement) still pending. Sandbox cannot run Lighthouse; deferred to owner.

## 2. #1258 `/api/activities?region=kaohsiung` cache HIT

```
--- request 1 ---
HTTP/2 200
cache-control: public
x-vercel-cache: MISS
--- request 2 ---
HTTP/2 200
cache-control: public
x-vercel-cache: HIT
```

Verdict: ✅ Region subroute also cacheable. Same metrics caveat as item 1.

## 3. #1306 traveler multi-slot picker

**Fixture used:** the same activity as the #1306 issue body (`6f8049be…`) but Plan B (`8390410e…`, "A. 早鳥半日探秘") on `2026-06-15` because Plan A (`1d4bd7ee…`, the one in the issue body) currently returns `state=no_slots` for every probed date in 2026-06. Plan B on this date is a clean multi-slot day (2 slots).

### API layer
```
GET /api/v2/activities/6f8049be…/available-slots?planId=8390410e…&dateFrom=2026-06-15&dateTo=2026-06-15&timezone=Asia/Taipei&participants=1
→ slots count: 2
  [0] 2026-06-15T09:00:00+08:00 → 2026-06-15T13:00:00+08:00  capLeft=9 isAvail=true
  [1] 2026-06-15T13:00:00+08:00 → 2026-06-15T17:00:00+08:00  capLeft=9 isAvail=true
  state=available  capLeft=9  firstAvailableStartAt=2026-06-15T09:00:00+08:00
```

### UI layer (Playwright on production)
```
http status: 200
page errors: 0
console errors: 0
traveler-slot-picker: 1   (← #1306 acceptance #1 — picker rendered)
traveler-slot-option: 2   (← all available slots exposed)
  option[0]: 09:00–13:00 | 剩餘 9
  option[1]: 13:00–17:00 | 剩餘 9
```

Screenshot: `docs/operations/qa-reports/evidence/issue1317-1306-multislot-prod-2026-06-10.png`

Verdict: ✅ #1306 acceptance #1 (multi-slot rendered) + #3 (Asia/Taipei rendered as `09:00–13:00`/`13:00–17:00`, not UTC) + #4 (only `isAvailable=true` slots reach the picker — partial cross with #5) all PASS at runtime on `c80f6079`.

Note: #1306 acceptance #2 (picked slot reaches draft POST body) was not exercised here — running it requires filling the contact form + ECPay consent. PR #1315 locks this via source-contract; owner can confirm interactively if desired.

## 4. #1290 dynamic re-emit OFF path

```
guide_availability_rules (production): total = 1
  - active + use_dynamic_reemit=false: 1 rule
  - active + use_dynamic_reemit=true:  0 rules
sample OFF rule: plan=8390410e, weekday=1, 09:00–17:00, buffer_after=15
```

The same `guide_availability_rules` row drives Plan B Monday slots seen in item 3. The API returns a **fixed-grid 2-slot response** with **no buffer-aware re-emission** (no `T09:15` / `T13:15` slot despite `buffer_after_minutes=15`).

Verdict: ✅ OFF path verified — no dynamic re-emit when `use_dynamic_reemit=false`. The ON path was already verified by owner during the original #1290 close-gate (`e748ff3e`).

Caveat: production currently has zero `active + use_dynamic_reemit=true` rules, so an ON-path re-verification cannot run on the same harness today. Re-running ON once a guide flips the toggle on any plan would complete the picture.

## 5. #1307 Asia/Taipei TZ — traveler side

Verifier reused item 3's API response — every `startAt` / `endAt` returned `+08:00`, no `Z`, no UTC drift. Traveler-side acceptance for #1307 partially met.

Outstanding: guide preview side (`/api/guide/availability-preview`) requires a valid `guide_token` cookie. Not provided. ⏸️ DEFER guide side to owner.

## 6. #1289 guide ↔ traveler range parity

Traveler API tested (item 3) returned `09:00–13:00` and `13:00–17:00` as proper start–end ranges (not start-only), matching `formatSlotRangeLabel` shape required by #1289 AC#4. Traveler half ✅.

Guide preview comparison needs `guide_token`. ⏸️ Same defer.

## 7. #1286 archived activity hidden from traveler — 🔴 FAIL

```
Activities status distribution: published=7, draft=6, archived=1
Sample archived: slug = haiku-test-1774948764593, id = 45567f15…

GET /api/activities/haiku-test-1774948764593
→ HTTP 200
→ body returns FULL activity data, including:
   - id: 45567f15…
   - status: archived           ← exposed to traveler
   - title: Haiku 測試行程

GET /activities/haiku-test-1774948764593
→ HTTP 200
→ <title> rendered normally    ← page reachable, no 404
```

**This contradicts #1286 acceptance #1** ("封存按鈕回 success、status=archived、旅客視角隱藏"). The DB-layer constraint smoke that #1286's owner close-gate performed (transaction + ROLLBACK) only verified that the DB accepts `archived`. It did not verify that the public-facing routes filter `status != 'archived'`.

**Action — new follow-up issue opened:** see "Action items" below. Treating as P1 because:
- archived activity titles + descriptions remain SEO-discoverable
- bookings could be attempted against an archived plan if a deep link survives
- the regression slipped past #1286 close-gate, indicating the SQL-only verification pattern is insufficient

## 8. #1286 admin archive button end-to-end — DEFER

Requires `ADMIN_ACCESS_TOKEN`. Not provided in the session credentials. Owner must run the admin UI flow (login → activity detail → click 封存 → reload → confirm DB status + traveler 404 chain).

## 9. #1284 guide payout dashboard rendering — DEFER

Requires `guide_token` cookie. The backend payout helper has full unit + source-contract coverage shipped in PR #1285; what's missing is a live guide-dashboard render against a real on-hold / partial-refund / oversell order. Owner needed.

## 10. #1249 / #1258 before-after metrics — DEFER

Sandbox has no Lighthouse and no pre-#1249 baseline retained. Owner needed to capture the LCP / TTFB before-after pair the original issue requested.

---

## Action items

1. **New P1 issue** — `[GH-1286][prod-bug] archived 活動旅客視角未隱藏 — production smoke disproves #1286 AC#1`
   - Root cause: `/api/activities/[slug]/route.ts` + `app/activities/[slug]/page.tsx` (and likely the listing path too) do not filter `status != 'archived'`.
   - Recommend: TDD fix — add `tests/api/issue1286-archived-traveler-hidden.test.mjs` asserting that `archived` status flips the route to 404 + listing excludes archived rows, then patch the routes.
   - Bonus: lock down with source-contract test so future audits flag any regression in the filter.

2. **Owner follow-up on #1317** — items 8 / 9 / 10 (admin archive UI flow, guide dashboard payout render, Lighthouse metrics) still owner-only.

3. **Owner follow-up on #1307 / #1289** — guide preview side both partially verified; just needs a `guide_token`-cookied curl against the same fixture (Plan B 2026-06-15) and a JSON-shape diff.

4. **#1290** — once any active rule has `use_dynamic_reemit=true` in production, re-run the ON-path smoke against it to refresh evidence on the current deployment commit.

---

## Sensitive handling

- Supabase `service_role` and `anon` keys were set as session env vars only; never persisted to disk, never echoed, never committed.
- `pyoderxmpeyqjwkeliiu` project ref appears in this report because it is the Supabase URL's public hostname (not a secret on its own).
- Production deployment URL `tour-platform-nine.vercel.app` is the public marketing domain.
- The Playwright run launched chromium with `ignoreHTTPSErrors: true` purely because the sandbox lacks the root CA bundle that resolves `*.vercel.app` certificates; this is a sandbox limitation, not a production trust override. Owner-side smoke should validate normally without that flag.
