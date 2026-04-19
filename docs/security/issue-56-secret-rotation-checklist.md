# Issue #56 — Exposed Secrets Rotation Checklist

> Incident class: **P0 exposed secrets in version control and history**.
> This document intentionally excludes secret values.

## Suspect secret types (treat as compromised)

- `ECPAY_MERCHANT_ID`
- `ECPAY_HASH_KEY`
- `ECPAY_HASH_IV`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ADMIN_ACCESS_TOKEN`
- `GOOGLE_CLIENT_SECRET`
- `RESEND_API_KEY`
- `LINE_NOTIFY_ACCESS_TOKEN`
- `SENTRY_AUTH_TOKEN`

## Rotation / revocation status

| Secret type | Rotation required | Status | Notes |
|---|---:|---|---|
| ECPay credentials | Yes | Pending (manual) | Rotate in ECPay dashboard; update runtime envs |
| Supabase keys | Yes | Pending (manual) | Rotate keys in Supabase project settings |
| Admin access token | Yes | Pending (manual) | Generate new token + invalidate old |
| Google OAuth secret | Yes | Pending (manual) | Reissue client secret |
| Resend key | Yes | Pending (manual) | Revoke old API key and create new |
| LINE notify token | Yes | Pending (manual) | Reissue token |
| Sentry auth token | Yes | Pending (manual) | Revoke token and reissue |

## Runtime sync checklist

- [ ] GitHub Actions repository secrets updated
- [ ] Production environment secrets updated
- [ ] Staging environment secrets updated
- [ ] Local `.env.local` rehydrated from secure source only
- [ ] Confirm old credentials are revoked/inactive

## Follow-up recommendation

- **History rewrite required** because exposure occurred in past commits.
- Suggested tooling: `git filter-repo` or BFG + force-push + downstream clone reset.
