# Issue #119 — History Rewrite Runbook

> Goal: remove historical secret exposure from git history and publish safe reset instructions.

## 0) Preconditions

- Rotation/cutover completed first (new secrets active, old revoked)
- Branch protection temporarily adjusted for force-push window
- Team notified of maintenance window

## 1) Mirror clone for rewrite (recommended)

```bash
git clone --mirror git@github.com:smallwei0301/tour-platform.git
cd tour-platform.git
```

## 2) Build replacement map (example)

Create `replacements.txt`:

```txt
# format: literal==>replacement
sbp_OLD_EXPOSED_TOKEN==><ROTATED_SUPABASE_ACCESS_TOKEN>
re_OLD_EXPOSED_RESEND_KEY==><ROTATED_RESEND_KEY>
GOCSPX-OLD_SECRET==><ROTATED_GOOGLE_SECRET>
```

> Keep this file local only, never commit.

## 3) Rewrite with git filter-repo

```bash
# Install if needed: pip install git-filter-repo

git filter-repo \
  --path apps/web/.env.local --invert-paths \
  --replace-text replacements.txt
```

Optional additional path cleanup:

```bash
git filter-repo --path-glob '*.env.local' --invert-paths
```

## 4) Verify rewritten history

```bash
# quick checks for known leaked patterns
rg -n "sbp_|re_|GOCSPX-|BEGIN (RSA|EC|OPENSSH) PRIVATE KEY" -S . || true

# run project secret scan
node scripts/scan-secrets.mjs
```

## 5) Force push rewritten history

```bash
# WARNING: destructive to remote history

git push --force --mirror
```

## 6) Team reset instructions (publish immediately)

### Preferred: fresh clone

```bash
mv tour-platform tour-platform.backup.$(date +%s)
git clone git@github.com:smallwei0301/tour-platform.git
```

### Alternative: hard reset existing clone

```bash
git fetch --all --prune
git checkout main
git reset --hard origin/main
# cleanup stale refs
for-each-ref --format='delete %(refname)' refs/original | git update-ref --stdin

git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

## 7) Post-rewrite checklist

- [ ] open PRs rebased/recreated
- [ ] CI green after rewrite
- [ ] secret scan evidence attached to issue #119
- [ ] explicit closure comment posted on #56 and #119
