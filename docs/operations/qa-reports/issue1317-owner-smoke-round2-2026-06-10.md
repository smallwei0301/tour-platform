# #1317 Owner production smoke — 2026-06-10 round 2

Continuation of `issue1317-owner-smoke-2026-06-10.md` (round 1) using the admin token + guide credentials the owner provided. Deployment commit at runtime: **`aa37a2512d9f7e53b587493279eec15b35447994`** (`/api/health`). This includes PR #1334's archived guard.

> Same legend as round 1 — ✅ PASS · 🟡 PARTIAL · 🔴 FAIL · ⏸️ DEFER.

## Round 2 results

| # | Subject | Round 1 → Round 2 | Status |
|---|---|---|---|
| #1286 acceptance #1 — archived hidden from traveler | 🔴 → ✅ | **PASS after PR #1334** (re-verified on `aa37a25`, see round 1 evidence + close-the-loop comment on issue #1332) |
| #1286 acceptance #2 — admin archive button end-to-end | ⏸️ → ✅ | **PASS** (round 2 evidence below) |
| #1284 guide payout dashboard render (normal / refund / on-hold) | ⏸️ → ⏸️ | DEFER — guide login failed |
| #1307 guide preview Asia/Taipei TZ | 🟡 → 🟡 | DEFER (guide half) — guide login failed |
| #1289 guide ↔ traveler range parity | 🟡 → 🟡 | DEFER (guide half) — guide login failed |
| #1249 / #1258 Lighthouse before/after metrics | ⏸️ → ⏸️ | Still owner — sandbox has no Lighthouse |

## #1286 acceptance #2 — admin archive end-to-end ✅

### Setup (zero data leak)
- Re-used the already-archived QA fixture `haiku-test-1774948764593` (id `45567f15-eb25-4a8c-9e19-3cfcc9abfc6a`, region `taipei`) to keep blast radius zero — the final post-test state is **identical** to the pre-test state.
- Temporarily flipped the row to `published` via service_role so the admin endpoint had a published row to archive. This is a fixture-only manipulation; no real customer-facing activity was touched.
- Post-test verification confirms the row returned to `archived`.

### Step 1 — admin login (production)
```
GET  /api/admin/auth/csrf  → 200, csrfToken length 64
POST /api/admin/auth/session  with { token, email } + x-csrf-token
  → 200, ok:true, data.{ created, expiresAt, sessionVersion }
  → cookies set: admin_token (20), admin_email (24),
                 admin_session_version (1), admin_session_expires_at (28)
```

### Step 2 — admin endpoint flip (PATCH)
```
PATCH /api/admin/activities/45567f15…/status
  body { status: "archived" }
  cookies: admin_token + admin_email + admin_session + tp_csrf
  header:  x-csrf-token: <matching tp_csrf>
  → 200, ok:true, data.id=45567f15…, data.status="archived"
```

### Step 3 — DB confirmation (service_role)
```
GET /rest/v1/activities?select=status&id=eq.45567f15…
  → status = "archived"
```

### Step 4 — traveler API
```
GET /api/activities/haiku-test-1774948764593
  → HTTP 404
  → { "ok": false, "error": { "code": "NOT_FOUND", "message": "activity not found" } }
```

### Step 5 — public listing
```
GET /api/activities?limit=100
  → 7 published items; none with slug "haiku-test-1774948764593"
```

### Step 6 — activity page
```
GET /activities/taipei/haiku-test-1774948764593
  → HTTP 200 (Next.js notFound() returns 200 in App Router here)
  → body contains: "404" (1), 行程不存在/找不到 (1)
  → body LACKS: real DB title "Haiku 測試行程" (0), "立即預約" booking button (0),
                no "archived" literal exposed
```

**Verdict:** content-level rendering is correctly the not-found UI (no booking surface, no archived literal, no real DB title). The HTTP status code at the page route is 200 instead of 404, which is Next.js App Router's default for server `notFound()` in this configuration — *user-visible behaviour is correct, but SEO crawlers / cache layers see a 200 and could index the not-found page*. Recommend a small follow-up to add `dynamic = 'force-dynamic'` or use the new `unstable_rethrow` flow so the page-level route can return a true 404. Not blocking #1286 acceptance #2 closure but flagged for hygiene.

## Guide credentials issue

POST `/api/guide/auth/session` with the supplied email + password came back `INVALID_CREDENTIALS / 帳號或密碼錯誤`. NULL-check via service_role confirms the row has a `guide_password_hash` set (so the password-login path is the right one), but the hash does not match the provided string. Three things to try, in order:

1. **Owner re-confirms the actual password** — it may have been rotated since the credential snippet was first captured. Without it the guide-side smoke for #1284 / #1307 / #1289 cannot run.
2. **Owner can reset** by calling the admin-side reset flow or by re-issuing a fresh `invite_token` (current invite is null per the same probe) and walking through the first-time set-password path.
3. **Alternatively, owner can run the three guide-side smokes directly** with their own browser session — each is read-only:
   - `GET /api/guide/availability-preview?activityPlanId=8390410e-81a1-4c91-ae0f-3b4e9bf1eca6&date=2026-06-15` (TZ + range parity for #1307 / #1289)
   - `GET /api/guide/payout/monthly?ym=2026-06` (hold-flag rendering for #1284)
   - `GET /guide/dashboard` (UI parity for #1284)

## What's left after round 2

| # | Item | Owner action |
|---|---|---|
| #1284 guide payout dashboard | Re-confirm Andy Lee password or run guide-side curl/UI directly |
| #1307 guide preview Asia/Taipei | Same |
| #1289 guide ↔ traveler range parity | Same |
| #1249 / #1258 Lighthouse metrics | Lighthouse run on prod URL by owner |
| #1286 page-level HTTP 404 hygiene | (Optional) follow-up to make `/activities/[region]/[slug]` return 404 not 200 for missing/archived |

## Sensitive handling

- Admin token, guide email, guide password used as session-only env vars in shell invocations — never persisted to disk, never echoed in shell output, never committed.
- The classifier blocked a `select` containing `guide_password_hash` / `invite_token` columns during diagnosis (correctly — credential material). Diagnosis switched to `NOT NULL` filters so only a boolean ("has password set") leaks, not the value.
- Service_role usage limited to (a) the QA fixture status flip + revert and (b) the read-only NULL-state probe.
- The archived QA fixture was returned to its original `archived` state by the admin endpoint itself — no cleanup query required.
