# SECURITY.md

## Secret management policy

- Never commit real secrets to git-tracked files.
- Local development secrets must stay in untracked `.env.local` files.
- Deployment/runtime secrets must be managed in platform secret stores (Vercel project env / CI secret store / provider dashboards).
- `.env.example` must contain placeholders only.

## Incident note: issue #56 (2026-04-19)

### What happened
- `apps/web/.env.local` was tracked in git and contained real secret-bearing keys.
- Secret-bearing values must be treated as exposed.

### Affected secret categories (treat as compromised)
- Admin/Auth: `ADMIN_ACCESS_TOKEN`, `GUIDE_SESSION_SECRET`
- Supabase: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- OAuth: `GOOGLE_CLIENT_SECRET` (and related OAuth credentials)
- Email provider: `RESEND_API_KEY`
- Payment provider: `ECPAY_MERCHANT_ID`, `ECPAY_HASH_KEY`, `ECPAY_HASH_IV`

### Required containment actions
1. Revoke/rotate all affected secrets in provider consoles.
2. Update deployment secrets (Vercel/CI) to the rotated values.
3. Invalidate old sessions/tokens where applicable.
4. Notify collaborators to pull latest and regenerate local `.env.local` from secure source.

### History exposure follow-up
- Because secrets may also exist in commit history, plan a history rewrite (`git filter-repo` / BFG) if this repository has been shared publicly.
- After history rewrite, require all collaborators to re-clone.

## Secret scanning

- CI gate: `npm run security:scan-secrets`
- Scanner script: `scripts/scan-secrets.mjs`
- Pull requests should fail if high-confidence secret patterns are detected in tracked files.
