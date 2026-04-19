# History Rewrite Playbook (Secrets Incident)

> Use this playbook to purge previously committed secret-bearing files.

## Preconditions
1. Freeze merges temporarily.
2. Confirm all exposed secrets are rotated/revoked first.
3. Ensure a clean mirror clone (no unstaged/staged changes).
4. Ensure maintainer has force-push permission.

## Recommended Flow (mirror clone)
```bash
git clone --mirror git@github.com:smallwei0301/tour-platform.git tour-platform-mirror.git
cd tour-platform-mirror.git

# Optional backup tag/branch in separate safe location before rewrite

FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --force \
  --index-filter "git rm --cached --ignore-unmatch apps/web/.env.local" \
  --prune-empty --tag-name-filter cat -- --all

# Cleanup rewrite backups
git for-each-ref --format='delete %(refname)' refs/original | git update-ref --stdin
rm -rf .git/logs
git gc --prune=now --aggressive

# Force-push rewritten history
git push --force --all origin
git push --force --tags origin
```

## Validation
1. Run repository scanner:
```bash
npm run security:scan-secrets
```
2. Run history checks for known patterns:
```bash
git rev-list --all | while read c; do git grep -nE 'github_pat_|GOCSPX|\bre_[A-Za-z0-9]{12,}|\bsbp_[A-Za-z0-9]{20,}|SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^ ]+' "$c" || true; done
```
3. Confirm target file is absent from history:
```bash
git log --all -- apps/web/.env.local
# expected: no commits
```

## Post-steps
- Broadcast collaborator re-clone/reset instructions.
- Re-run CI and deploy smoke checks with rotated credentials.
- Record timestamps, actor, and evidence links in closure doc.
