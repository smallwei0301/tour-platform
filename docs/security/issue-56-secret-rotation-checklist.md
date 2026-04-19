# Issue #56 Secret Rotation Checklist (Execution Record)

> Purpose: track provider-side rotation/revoke status after secrets exposure in git history.
> 
> ⚠️ Do not paste secret values in this file.

## Status Legend
- `DONE`: completed with evidence
- `IN_PROGRESS`: being executed
- `BLOCKED_MANUAL`: requires human/provider-console action
- `NOT_APPLICABLE`: not used in this environment

## Provider Matrix

| Provider | Secret Scope | Status | Rotated At (Asia/Taipei) | Actor | Evidence |
|---|---|---|---|---|---|
| ECPay | `ECPAY_MERCHANT_ID`, `ECPAY_HASH_KEY`, `ECPAY_HASH_IV` | BLOCKED_MANUAL | - | - | Pending provider console rotation + callback re-test |
| Supabase | `SUPABASE_SERVICE_ROLE_KEY`, anon key set | BLOCKED_MANUAL | - | - | Pending Project Settings → API key rotation |
| Google OAuth | `GOOGLE_CLIENT_SECRET` | BLOCKED_MANUAL | - | - | Pending Google Cloud Console credential rotation |
| Resend | `RESEND_API_KEY` | BLOCKED_MANUAL | - | - | Pending API key revoke + create new |
| Guide/Admin Auth | `GUIDE_SESSION_SECRET`, `ADMIN_ACCESS_TOKEN` | BLOCKED_MANUAL | - | - | Pending secret regeneration in runtime stores |
| LINE / Sentry / other integrations | related tokens/secrets | BLOCKED_MANUAL | - | - | Pending integration-by-integration audit |

## Required Evidence Per Provider
For each provider rotation, record:
1. provider/scope
2. rotate timestamp
3. actor
4. where new secret was set (GitHub Actions / Vercel / runtime)
5. validation result (service still works with new creds)
6. old credential revoked/inactive confirmation

## Notes
- All secret categories listed above are treated as compromised due to tracked `.env.local` and history exposure.
- Rotation must be completed before incident closure.
