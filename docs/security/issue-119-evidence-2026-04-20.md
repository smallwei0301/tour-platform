# Issue #119 — Live Evidence Update (2026-04-20 UTC)

> Evidence collected for incident closure tracks. No secret values included.

## 1) Provider rotation/revoke evidence (current status)

### Supabase Management Token (suspect token still active)
- Check time: 2026-04-20T00:38:44Z
- Method: `GET https://api.supabase.com/v1/projects/pyoderxmpeyqjwkeliiu` with existing management token
- Result: **HTTP 200 / project metadata returned**
- Evidence meaning: previously exposed management token is still valid; rotation/revocation is still required and not yet closed.

### Resend API Key (scope-limited, still valid credential class)
- Check time: 2026-04-20T00:39Z
- Method: `GET https://api.resend.com/domains` with existing key
- Result: **HTTP 401** with message: key restricted to send-only
- Evidence meaning: key class is active but permission-limited; revoke/rotate still required per incident policy.

### GitHub (Actions Secret API audit access)
- Method: `gh api repos/smallwei0301/tour-platform/actions/secrets`
- Result: **HTTP 403 Resource not accessible by personal access token**
- Additional context: environment names are visible (`Preview`, `Production`), but secrets metadata cannot be read with current token scope.
- Evidence meaning: cutover verification needs owner/admin token scope or dashboard evidence attachment.

## 2) Runtime / deploy / CI cutover evidence (current status)

- GitHub Actions secrets metadata verification is blocked by token scope (403).
- Therefore, no audit-proof evidence yet that CI/deploy/runtime has switched to rotated values.
- Closure requires owner/admin execution evidence in `issue-119-evidence-log-template.md`.

## 3) History rewrite / post-scan / team reset evidence (current status)

### Current repository scan findings (before rewrite)
- Command pattern check originally found exposed token pattern in `AUTO-MIGRATE-ANALYSIS.md`.
- This PR now sanitizes that file in HEAD, but historical exposure still exists by definition.

### Rewrite status
- History rewrite **not executed yet** in this step.
- Execution instructions are documented in:
  - `docs/security/issue-119-history-rewrite-runbook.md`

### Team reset status
- Team re-clone/reset notice not yet published (pending rewrite execution window).

---

## Immediate next actions

1. Execute provider rotation/revoke and fill evidence table.
2. Complete env cutover on GitHub/deploy/runtime and attach screenshots/audit IDs.
3. Run history rewrite + force push + publish team reset message.
4. Re-run secret scan and attach PASS output to #119.
