# QA Regression Report — PRs merged 2026-05-12-14 — 2026-05-23

**Issue:** #500 ([QA] Verify manual regression checklist for PRs merged May 12-14)
**Risk treatment:** HIGH_RISK — contract tests only; manual browser/ECPay smoke deferred per HIGH_RISK policy.

## Deploy SHA
`bf657702033b91beca8985387b9ef772f21e65b9` (from /api/health, 2026-05-23)

## Contract Test Results (14 test files)

| Test file | PRs covered | Pass | Fail |
|---|---|---|---|
| issue449-refund-reversal | #449/#453 settlement reversal | 21 | 0 |
| issue455-go-no-go.contract | #499 Go/No-Go dashboard | 7 | 0 |
| issue457-wishlist-slug-uuid-rescue | #464/#462 wishlist slug | 4 | 0 |
| issue457-wishlist-slug | #462/#444 wishlist | 6 | 0 |
| issue458-guide-qa-csrf | #464 guide Q&A CSRF | 4 | 0 |
| issue459-refund-success-copy | #460/#483/#435 refund copy | 3 | 0 |
| issue461a-csrf-me-guide | #473 guide/traveler CSRF | 6 | 0 |
| issue461b-csrf-admin | #476/#482/#487 admin CSRF | 24 | 0 |
| issue475-guide-dashboard-pending-settlement | #486 guide dashboard | 11 | 0 |
| issue479-refund-reconcile | #492 refund reconcile cron | 21 | 0 |
| issue480-backfill-refund-status | #493 refund backfill | 12 | 0 |
| issue489-guide-owned-plans | #496 guide plan controls | 5 | 0 |
| v497-availability-plan-scoped | #498 plan-scoped availability | 16 | 0 |
| v497-plan-status-contract | #498 plan status | 10 | 0 |

**Total: 150/150 PASS, 0 FAIL**

## Deferred (HIGH_RISK policy + requires browser/live)
- Live ECPay refund callback smoke (#491): requires ECPay sandbox + staging env
- Admin Go/No-Go dashboard browser UI: requires admin session + staging URL
- Guide dashboard live session (payout/balance): requires guide account
- Manual CSRF header verification in live browser: human + browser devtools
- Wishlist slug migration verification on live DB: requires Supabase access

## Verdict: PARTIAL_PASS
All 150 automated contract tests pass. Manual browser/ECPay smoke deferred to human operator with staging access.

## Evidence sanitization
No secrets, tokens, credentials, trade numbers, or PII in this report.

## Cross-references
- issue449-refund-reversal also verified in #645 daily QA (PR #689)
- CSRF headers also covered in individual CSRF contracts (issue461a/b, issue458)
- Go/No-Go dashboard verified by issue455 (7/7)
