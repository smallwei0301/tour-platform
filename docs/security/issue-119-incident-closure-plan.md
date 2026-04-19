# Issue #119 — Incident Closure Plan (Issue #56 Follow-up)

## Scope
This is an **incident closure execution** task, not feature delivery.

Closure requires 3 tracks:
1. Provider-side **secret rotation / revocation**
2. **Environment cutover** (CI / deploy / runtime) to new values
3. **History rewrite** for past secret exposure + team reset

---

## Suspect Secret Inventory (Treat as compromised)

- ECPay: `ECPAY_MERCHANT_ID`, `ECPAY_HASH_KEY`, `ECPAY_HASH_IV`
- Supabase: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Admin/Auth: `ADMIN_ACCESS_TOKEN`, `GOOGLE_CLIENT_SECRET`
- Integrations: `RESEND_API_KEY`, `LINE_NOTIFY_ACCESS_TOKEN`, `SENTRY_AUTH_TOKEN`

> Never paste secret values into issue/PR/comments/logs.

---

## Track A — Rotation / Revocation (Provider-side)

For each provider secret:
- rotate/reissue new credential
- revoke or disable old credential
- record evidence: actor, timestamp, scope, source console/API

Required evidence fields:
- provider
- secret name (type)
- rotatedAt (ISO8601)
- rotatedBy
- revokeStatus (revoked/disabled/not-applicable)
- evidenceRef (screenshot path / audit event id / ticket id)

---

## Track B — Environment Cutover

Cutover targets:
- GitHub Actions secrets (repo + environment level)
- Deploy platform secrets (prod/staging)
- Runtime secret source (host/.env vault/secret manager)

Validation requirements:
- deployment succeeds with new values
- smoke path succeeds (payment/auth/admin critical paths)
- old secret no longer works or explicitly revoked

Evidence required:
- cutover timestamp
- platform + target environment
- validation command/output summary
- old-secret invalidation proof

---

## Track C — History Rewrite

- Use `git filter-repo` (preferred) or BFG
- remove/replace exposed values and sensitive tracked files from all history
- force-push rewritten refs
- publish team reclone/reset instructions
- rerun secret scan on rewritten history

See detailed runbook:
- `docs/security/issue-119-history-rewrite-runbook.md`

---

## Definition of Done

- [ ] All suspect secrets have rotation/revocation status recorded
- [ ] CI/deploy/runtime env switched to new values
- [ ] old credentials are revoked/invalidated (or explicitly N/A)
- [ ] history rewrite completed and force-pushed
- [ ] team reclone/reset instructions published
- [ ] post-rewrite secret scan passes
- [ ] closure evidence complete and attached

---

## Execution order (recommended)

1. Rotate/revoke provider secrets
2. Cut over CI/deploy/runtime to new values
3. Validate functionality with new values
4. Execute history rewrite + force push
5. Publish team reset notice
6. Run post-rewrite secret scan and attach evidence
