# Issue #119 — Closure Comment Template

Use this template when all tasks are complete.

---

## Incident Closure Summary

- Issue #56 and #119 closure scope completed.
- No secret values are disclosed in this comment.

### 1) Rotation / Revocation

- Completed providers: [ECPay, Supabase, Google, Resend, LINE, Sentry, Admin token]
- Evidence log: `docs/security/issue-119-evidence-log-template.md` (filled)
- Old credentials status: [revoked/disabled/expired]

### 2) Environment Cutover

- GitHub Actions secrets: [updated]
- Deploy platform (prod/staging): [updated]
- Runtime env source: [updated]
- Validation summary: [deploy and smoke checks pass]

### 3) History Rewrite

- Tool: [git filter-repo/BFG]
- Rewritten refs: [summary]
- Force push done at: [timestamp]
- Team reset notice posted: [link/ref]
- Post-rewrite scan result: [PASS]

## Final DoD

- [x] all suspect secrets rotated/revoked
- [x] runtime/CI/deploy switched to new values
- [x] old credentials invalidated
- [x] history rewritten and force-pushed
- [x] team reset instructions published
- [x] post-rewrite secret scan passed
