# Issue #119 — Live Evidence Update (2026-04-20 UTC)

> Evidence collected for incident closure tracks. No secret values included.

## 1) Provider rotation/revoke evidence

### Supabase (partial complete)

**Operations performed**
- Platform: Supabase Management API
- Time window: 2026-04-20T00:44:13Z ~ 00:47:38Z
- Actions:
  1. Created new API keys
     - `rot119_publishable_20260420004413` (publishable)
     - `rot119_secret_20260420004413` (secret)
  2. Revoked old default keys
     - old default publishable key id: `fbc03ce9-877e-4e4f-a404-2c53485acf6f` (deleted)
     - old default secret key id: `2cef1ad2-a7cc-44b0-a0b0-ea50b06ee83d` (deleted)

**Proof of new value active / old invalid baseline**
- New publishable key can access `GET /auth/v1/settings` (HTTP 200)
- Invalid key returns HTTP 401 (`Invalid API key`)
- Current key inventory at 00:47:38Z shows only:
  - legacy `anon` / `service_role`
  - new `rot119_*` publishable/secret keys
  - old default keys absent

**Remaining blocker**
- Legacy `anon` and `service_role` keys remain in project (not rotated in this step).
- Incident policy still requires explicit legacy key rotation/revocation decision + evidence.

---

### Resend (blocked by permission)

**Attempted operations**
- Platform: Resend API
- Time: ~2026-04-20T00:47Z
- `GET /api-keys` -> HTTP 401 (`restricted_api_key`)
- `POST /api-keys` -> HTTP 401 (`restricted_api_key`)

**Blocker**
- Current key is send-only and cannot manage key lifecycle.

**Next step**
- Use Resend owner/admin key from dashboard to rotate/revoke and attach audit evidence.

---

### GitHub (blocked by token scope)

**Attempted operations**
- Platform: GitHub Actions Secrets API / `gh secret set`
- Time: ~2026-04-20T00:39Z ~ 00:40Z
- List repo secrets -> HTTP 403 (`Resource not accessible by personal access token`)
- Set repo secret -> HTTP 403 (public key endpoint inaccessible)

**Blocker**
- Current PAT lacks required Actions secrets admin scope.

**Next step**
- Use owner PAT/app token with actions secrets write scope, then export secrets metadata timestamps.

---

### Google OAuth

**Blocker**
- No Google Cloud credential with secret-manager / OAuth client admin scope available in this session.

**Next step**
- Rotate OAuth client secret via Google Cloud Console/API and record:
  - rotatedAt
  - actor
  - new secret rollout target (Vercel/GitHub/runtime)

---

## 2) Runtime / deploy / CI env cutover evidence

### Deploy platform (Vercel) — completed for selected keys

**Operations performed**
- Platform: Vercel Project Env API + CLI
- Project: `tour-platform` (`prj_KrrA4UrpyZtEfsQZeSHUJ5zaw4Re`)
- Time window: 2026-04-20T00:45:54Z ~ 00:46:56Z

**Cutover executed**
1. `ADMIN_ACCESS_TOKEN`
   - updated in production/development
   - added for preview (explicit target)
2. `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - updated in production/development
   - added for preview (explicit target)

**Proof (env metadata)**
- API query `GET /v10/projects/{projectId}/env` shows updatedAt timestamps:
  - `ADMIN_ACCESS_TOKEN`
    - production: 2026-04-20T00:45:54.590Z
    - development: 2026-04-20T00:45:58.407Z
    - preview: 2026-04-20T00:46:56.290Z
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
    - production: 2026-04-20T00:46:08.217Z
    - development: 2026-04-20T00:46:12.362Z
    - preview: 2026-04-20T00:46:56.863Z

**Remaining blocker**
- GitHub Actions secrets cutover cannot be verified with current token scope (403).

---

## 3) History rewrite / post-rewrite scan / force-push evidence

### Current state
- Runbook exists: `docs/security/issue-119-history-rewrite-runbook.md`
- Historical exposure still requires destructive rewrite on remote default history.

### Blockers
1. `git-filter-repo` is not installed in current environment.
2. Force-push rewrite requires maintenance window + repo owner approval and team broadcast coordination.

### Next executable step
- Install `git-filter-repo`, perform mirror rewrite in maintenance window, then:
  1. force-push rewritten refs
  2. publish team re-clone/reset notice
  3. rerun secret scan and attach PASS evidence

---

## Immediate next actions (ordered)

1. Complete remaining provider rotations (Google/Resend/GitHub secrets scope owner token).
2. Rotate legacy Supabase anon/service_role path (or explicitly deprecate with replacement plan) and attach evidence.
3. Execute history rewrite window and publish post-rewrite evidence pack.
