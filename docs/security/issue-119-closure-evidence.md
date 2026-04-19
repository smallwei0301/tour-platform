# Issue #119 Closure Evidence — Security Incident Follow-up

## Scope
Issue #119 closes the remaining incident actions after #56/#118 containment:
1. provider-side rotate/revoke
2. runtime/CI/deploy cutover
3. git history rewrite + post-rewrite scans

## A) Provider Rotation / Revoke Evidence
Reference checklist: `docs/security/issue-56-secret-rotation-checklist.md`

Current status: **PARTIAL (manual-provider steps pending)**

## B) Runtime / CI / Deploy Cutover Evidence

### CI Gate
- Added secrets scan job in GitHub Actions workflow: `.github/workflows/ci.yml`
- Command: `npm run security:scan-secrets`
- Local run output: PASS

### Runtime verification helper
- Added script: `scripts/verify-runtime-secrets.mjs`
- Verifies required env keys are present without printing values.

Run example:
```bash
node scripts/verify-runtime-secrets.mjs --profile=web-runtime
```

Current status: **PARTIAL (platform env update requires manual console access)**

## C) History Rewrite Evidence

### Execution summary
- Strategy: remove `apps/web/.env.local` from all history.
- Command set (documented in playbook):
  - `git filter-branch --index-filter 'git rm --cached --ignore-unmatch apps/web/.env.local' --prune-empty --tag-name-filter cat -- --all`
  - cleanup refs + gc

### Local runtime result (this workspace)
- Rewrite attempt in working repo blocked by unstaged changes.
- Action taken: prepared formal playbook + recovery instructions to execute in clean mirror clone.

Current status: **BLOCKED_MANUAL (needs clean mirror clone + force-push permissions)**

## D) Post-Rewrite / Post-Cutover Validation

Required checks:
1. `npm run security:scan-secrets` = PASS
2. history grep for known high-risk patterns = no hits in rewritten history
3. old credentials confirmed revoked/inactive
4. collaborators receive reset/re-clone instructions

Current status: **PARTIAL**

## Team Re-clone / Reset Instructions (after rewrite)
```bash
# Safe path: re-clone
mv tour-platform tour-platform.bak.$(date +%Y%m%d)
git clone git@github.com:smallwei0301/tour-platform.git

# If keeping local clone:
git fetch origin
# replace <default-branch> with main if needed
git checkout <default-branch>
git reset --hard origin/<default-branch>
git for-each-ref --format='delete %(refname)' refs/original | git update-ref --stdin
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

## Closure Verdict
- **Not yet fully closable** until provider-side rotation/revoke + runtime cutover + clean history rewrite force-push are completed and evidenced.
