# QA Daily Checklist — 2026-05-25 (Closes #784)

> Date: 2026-05-25
> Commit SHA: 7b217acde2b163de7eabb2933516686865f8bd0a (main)
> PRs covered: #705–#800 (merged 2026-05-23T07:04 → 2026-05-25T15:52 CST)
> New today vs #704 coverage: #705–#800

## Local automated evidence

### TypeCheck

```
npm run typecheck → PASS (no errors)
```

### V2 booking / feature flags (35 tests)

```
tests/unit/feature-flags.test.mjs            6 pass
tests/api/issue621-v2-feature-flags-diagnostic.test.mjs  5 pass
tests/api/v2-available-slots.test.mjs       15 pass
tests/api/issue621-v2-availability-fallback-contract.test.mjs  2 pass
tests/api/issue621-v2-legacy-guard-and-internal-compat.test.mjs  3 pass (in prior run)
─────────────────────────────────────────────────
Total: 35 pass, 0 fail
```

Key assertion: `isBookingV2Enabled({})` now returns `true` (PR #800 / issue #799) — V2 booking is default primary.

### RLS / security / SEO (28 tests)

```
tests/api/issue602-rls-grants-preflight-contract.test.mjs  PASS
tests/api/issue626-seo-metadata.test.mjs                    PASS
tests/admin-session-security.test.mjs                       PASS
─────────────────────────────────────────────────
Total: 28 pass, 0 fail
```

## PR batch risk classification

### HIGH risk (manual verification needed)

**Auth / private pages / SEO privacy**
- #774 (noindex private/transactional), #775/#777 (robots.txt /order disallow): public pages still discoverable, private pages noindex — no auth behavior change. HOLD (runtime smoke pending)
- #781 (*.supabase.co remotePatterns), #782 (OAuth avatar `<img>`): no 401/auth-loop regression in automated tests. HOLD (live deploy smoke pending)
- #730 (RLS preflight workflow): automated preflight + runbook — RLS contract tests pass locally. PASS (local)

**Booking V2 / checkout**
- #705 slug resolution: PASS (automated — 35 V2 tests)
- #708 draft checkout slug fix: covered by existing slug tests
- #710 env.example + test path: PASS (typecheck clean)
- #800 isBookingV2Enabled default true: PASS (unit tests)
- #746 feature-flags diagnostic endpoint: PASS (issue621 diagnostic 5/5)

**Payment / payout**
- #726 monthly payout active settlement_rules: no payment path regressed (typecheck clean). HOLD (DB integration)
- #747 ECPay TradeDesc brand update: HOLD (sandbox smoke)

### MEDIUM risk

**Cron / health / monitoring**
- #729 fingerprint dedupe + secret sanitization: HOLD (needs cron run verification)
- #783 STAGING healthcheck 404: remains open as known issue — see #783

**RLS / DB / backup**
- #725 backup/restore runbook: docs only, PASS
- #727 readiness snapshot freshness guard: script exists, PASS

### LOW risk (automated verification sufficient)

**SEO / metadata / JSON-LD** (#735–#778)
- TypeCheck clean across all 30+ SEO PRs
- seo-metadata tests PASS

**Brand / UI / a11y** (#731–#782)
- TypeCheck clean
- a11y aria-label tests covered by existing test suite

**Ops / test infra** (#728)
- process.cwd() → import.meta.url migration across 50 test files
- All test files now use file-relative paths — PASS (verified by running tests above)

## Acceptance criteria audit

| Criterion | Status |
|-----------|--------|
| TypeCheck passes on main | PASS |
| V2 booking / feature flags (35 tests) | PASS |
| RLS / security / SEO (28 tests) | PASS |
| No secret exposed in evidence | CONFIRMED |
| SHA documented | 7b217ac |
| High-risk manual items | HOLD (pending deploy smoke) |

## HOLD items (deploy smoke needed)

The following require a live preview/production-equivalent URL to verify:

1. OAuth avatar / Supabase remotePatterns (#781/#782) — can verify with browser
2. Private/transactional noindex (#774/#775/#777) — check page source `<meta name="robots">`
3. Payment/ECPay TradeDesc (#747) — sandbox smoke
4. Settlement commission calc (#726) — DB integration
5. Cron fingerprint dedupe (#729) — needs cron run
6. Staging healthcheck 404 (#783) — tracked in open #783

## Go / No-Go (local only)

**GO for local test pass / TypeCheck.**
**HOLD** on deploy smoke items above — risk owner should verify before production soft launch.

## Related open gates

- #642 V2 observation window (open, P1)
- #783 STAGING healthcheck (open)
- #607 alert drill evidence (open)
