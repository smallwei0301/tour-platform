# Issue #119 — Evidence Log Template

> Fill this template during execution. Do not include raw secret values.

## A) Rotation / Revocation Log

| Provider | Secret Type | Rotated At (UTC) | Rotated By | Old Secret Revoked? | Evidence Ref |
|---|---|---|---|---|---|
| ECPay | ECPAY_HASH_KEY |  |  |  |  |
| ECPay | ECPAY_HASH_IV |  |  |  |  |
| Supabase | SUPABASE_SERVICE_ROLE_KEY |  |  |  |  |
| Google | GOOGLE_CLIENT_SECRET |  |  |  |  |
| Resend | RESEND_API_KEY |  |  |  |  |
| LINE | LINE_NOTIFY_ACCESS_TOKEN |  |  |  |  |
| Sentry | SENTRY_AUTH_TOKEN |  |  |  |  |
| Internal | ADMIN_ACCESS_TOKEN |  |  |  |  |

## B) Environment Cutover Log

| Platform | Environment | Updated At (UTC) | Updated By | Validation Result | Evidence Ref |
|---|---|---|---|---|---|
| GitHub Actions Secrets | repo/env |  |  |  |  |
| Deploy Platform | production |  |  |  |  |
| Deploy Platform | staging |  |  |  |  |
| Runtime Secret Source | production host |  |  |  |  |

## C) Old Secret Invalidation Checks

| Secret Type | Check Method | Result | Timestamp (UTC) | Evidence Ref |
|---|---|---|---|---|
| ECPay | callback/create API with old key (expected fail) |  |  |  |
| Supabase SRK | admin query with old key (expected fail) |  |  |  |
| Resend API | send test with old key (expected fail) |  |  |  |

## D) History Rewrite Evidence

- Rewrite tool: `git filter-repo` / BFG
- Executed by:
- Executed at (UTC):
- Rewritten refs:
- Force-push command summary:
- Post-rewrite scan output ref:

## E) Team Reset Notice

- Announcement channel:
- Posted at (UTC):
- Message link/reference:
- Includes reclone/reset instructions: Yes / No
