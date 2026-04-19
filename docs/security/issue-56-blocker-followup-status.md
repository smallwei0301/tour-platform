# Issue #56 — QA Blocker Follow-up Status

Updated: 2026-04-19

## Repo-side verification evidence

- `git ls-files apps/web/.env.local` → no output (not tracked)
- `node scripts/scan-secrets.mjs` → pass
- `gh api repos/smallwei0301/tour-platform/actions/secrets --jq '.total_count'` → `0`

## Remaining blockers (manual ops required)

1. Provider rotation/revocation evidence
   - ECPay / Supabase / Google OAuth / Resend / LINE / Sentry / Admin token
   - Status: Pending external execution

2. Runtime env cutover evidence
   - Production/staging/CI secret sources switched to new values
   - Status: Pending external execution

3. History rewrite execution
   - Rewrite past commits containing exposed secrets and force-push
   - Status: Pending execution

## Tracking

- Follow-up issue: #119
- Scope: external rotation/cutover proof + history rewrite runbook execution and closure evidence.
