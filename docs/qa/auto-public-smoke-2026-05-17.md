# Production Public Smoke Evidence (Auto)

Issue: https://github.com/smallwei0301/tour-platform/issues/591
Task: t_46bd2270
Worktree: /root/.openclaw/workspace/worktrees/tour-platform/issue-591-auto-public-smoke
Branch: qa/issue-591-auto-public-smoke
Operator: tp-builder-fix
Production URL: https://tour-platform-nine.vercel.app
Evidence time (Asia/Taipei): 2026-05-17T23:42:51.119162+08:00

## In-scope checks performed
- Read-only HTTP smoke for required public endpoints
- Public activity detail page check
- Read-only deployment evidence via response headers
- GitHub main branch commit evidence
- Optional public pages (extra if reachable)

## Evidence source
- GitHub main commit (via gh CLI):
  - date: 2026-05-17T12:54:21Z
  - sha: e3d47865cf6c07fef009631c665f84e7cb54f5d2
  - message: docs(qa): reconcile evidence pack live state

- Production response headers (x-vercel-id / x-vercel-cache):
  - GET / => x-vercel-id: hkg1::9gslc-1779032564479-55d1cbee1e86, x-vercel-cache: HIT
  - GET /faq => x-vercel-id: hkg1::4cxs7-1779032564628-f2c3cf5a5a1e, x-vercel-cache: HIT
  - GET /legal/refund => x-vercel-id: hkg1::kct6r-1779032564813-cf5989f2cd12, x-vercel-cache: HIT
  - GET /activities => x-vercel-id: hkg1::bcjp7-1779032564990-ea79fed99f78, x-vercel-cache: HIT
  - GET /api/activities => x-vercel-id: hkg1::iad1::ftczh-1779032565157-4193018d82eb, x-vercel-cache: MISS

- Vercel deployment status endpoint was not used in this pass due GH token scope constraints on deployment APIs not required when live production headers are available.

## Required endpoint results
- GET / -> status 200, content-type text/html; charset=utf-8, 5xx: false
- GET /faq -> status 200, content-type text/html; charset=utf-8, 5xx: false
- GET /legal/refund -> status 200, content-type text/html; charset=utf-8, 5xx: false
- GET /activities -> status 200, content-type text/html; charset=utf-8, 5xx: false
- GET /api/activities -> status 200, content-type application/json, 5xx: false
  - short result: JSON starts with `{\"ok\":true,\"data\":[{...` and is publicly readable.

- activity detail page: /activities/taipei/dadadaocheng-walk
  - selection method: 預設路徑 /api/activities 可映射（regionSlug=taipei, slug=dadadaocheng-walk）
  - GET status 200, content-type text/html; charset=utf-8, 5xx: false
  - x-vercel-id: hkg1::iad1::4cxs7-1779032570811-8385a498ddea, x-vercel-cache: MISS

## Optional endpoint results
- GET /about -> status 200, content-type text/html; charset=utf-8, 5xx: false
- GET /legal/terms -> status 200, content-type text/html; charset=utf-8, 5xx: false
- GET /legal/privacy -> status 200, content-type text/html; charset=utf-8, 5xx: false

## Scope / restrictions confirmation
- In-scope (completed): public HTTP smoke checks, main commit evidence, response header evidence, docs evidence file.
- Out-of-scope (not performed): payment/refund/ECPay/payout/settlement mutation, login/account/session usage, production mutation, issue comment/close, PR/merge/deploy.
- Statement: No auth/private account usage, no mutation, no credentials/tokens submitted, no private session/cookie actions.

## Direct issue-goal verification
- 是否直接驗證 Issue 591 目標：yes
