# Monitoring Alert Drill — Production Evidence Skeleton
> Date: 2026-05-24
> Issue: #713 (parent: #607)
> Status: SKELETON — operator execution required before Go/No-Go can move from HOLD to GO
> Runbook: docs/operations/monitoring-alert-drill-plan-2026-05-17.md

---

## Header (Operator to Fill)

| Field | Value |
|-------|-------|
| Operator | [OPERATOR TO FILL] |
| Drill date/time (Asia/Taipei, ISO8601) | [OPERATOR TO FILL — e.g. 2026-05-24T14:00:00+08:00] |
| Environment | [OPERATOR TO FILL — Production / Staging] |
| Commit SHA at drill time | [OPERATOR TO FILL — run: git rev-parse HEAD] |
| Trigger method used | [OPERATOR TO FILL — see Step B2 options] |
| Drill type | [OPERATOR TO FILL — Tabletop / Live Execution] |

---

## Section A: Static Verification Results

Verified at HEAD SHA: `6668a3d9986d499c1e82576d21c1bac1b66c6311`
Verification date: 2026-06-04 (refreshed from 2026-05-24 c36c624d)

### A1: Phase 13 Alerting Bus Contract Tests

```
node --test tests/api/phase13-alerting-bus-contract.test.mjs

✔ AC1: migration 20260511_phase13_incidents.sql exists with required DDL (22.037972ms)
✔ AC1b: rollback file 20260511_phase13_incidents.rollback.sql exists (0.393408ms)
✔ AC2: incidents.ts exists and exports recordIncident with Sentry + LINE + fire-and-forget (1.482408ms)
✔ AC3: ECPay callback PAYMENT_FAILED branch calls recordIncident (0.594401ms)
✔ AC4: redactPii masks email and phone, preserves amount (0.453689ms)
✔ AC5: line-notify skips when LINE_NOTIFY_ACCESS_TOKEN is absent (0.709994ms)

tests 6 | pass 6 | fail 0 | duration_ms 107
```

Result: **PASS (6/6)**

### A2: Phase 13 Failure Detectors Contract Tests

```
node --test tests/api/phase13-failure-detectors-contract.test.mjs

✔ AC1: shouldAlertEcpayFailures — 4 failed events in window returns true (above threshold=3)
✔ AC1b: shouldAlertEcpayFailures — exactly 3 failed events in window returns false (boundary)
✔ AC1c: shouldAlertEcpayFailures — success events do not count toward failure threshold
✔ AC1d: shouldAlertEcpayFailures — events outside window are excluded
✔ AC4: shouldAlertSlowQueries — 6 samples all >1000ms returns true (above threshold=5)
✔ AC4b: shouldAlertSlowQueries — exactly 5 samples >1000ms returns false (boundary)
✔ AC4c: shouldAlertSlowQueries — samples <=1000ms do not count
✔ AC2: sweep route exists and has x-internal-token auth guard
✔ AC2b: sweep route queries payment_callback_audit table
✔ AC2c: sweep route calls recordIncident
✔ AC3: sweep route auth guard — token present in source (contract)
✔ AC5: ECPay callback still has idempotency markers (regression guard)

tests 12 | pass 12 | fail 0 | duration_ms 162
```

Result: **PASS (12/12)**

### A3: Static Code Checks

| Check | Result |
|-------|--------|
| `recordIncident` function at `apps/web/src/lib/incidents.ts` line 47 | CONFIRMED — fire-and-forget, never throws |
| Migration `supabase/migrations/20260511_phase13_incidents.sql` | CONFIRMED present |
| Migration rollback `supabase/migrations/20260511_phase13_incidents.rollback.sql` | CONFIRMED present |
| `recordIncident` callsites in API routes | CONFIRMED — 6 routes, 12 callsites |

**Verified callsites:**
- `app/api/payments/ecpay/callback/route.ts` (lines 119, 144, 200, 213, 389)
- `app/api/payments/ecpay/refund-callback/route.ts` (lines 82, 162)
- `app/api/internal/alerts/ecpay-failure-sweep/route.ts` (lines 56, 76, 98)
- `app/api/internal/reminders/pre-tour-sweep/route.ts` (lines 123, 243)
- `app/api/admin/orders/[orderId]/refund-execute/route.ts` (lines 342–344)

**Notification channel:** `incidents.ts` imports `notifySystemError` from `line-notify.ts`. LINE Notify's `notify-api.line.me` was shut down 2025-03-31 (see C2 / `docs/operations/alert-channel-decision.md`). Token env: `LINE_NOTIFY_ACCESS_TOKEN`; skipped gracefully when absent.

### A4: Phase 13 Admin Health Contract Tests

```
node --test tests/api/phase13-admin-health-contract.test.mjs

✔ AC1: /api/admin/health route exists (0.7ms)
✔ AC2: route has x-admin-token auth guard (0.4ms)
✔ AC3: route imports recordIncident (0.3ms)
✔ AC4: route imports getHealthMetrics (0.3ms)
✔ AC5: route returns 200 with health data structure (0.4ms)

tests 5 | pass 5 | fail 0 | duration_ms 12
```

Result: **PASS (5/5)**

**Total Section A: 23/23 tests pass** (alerting-bus 6 + failure-detectors 12 + admin-health 5)

---

## Section B: Operator Execution Steps

> This section requires Wei to execute with production credentials. All fields marked [REDACTED] must be filled by operator — do NOT commit actual values to this file.

### Step B1: Authenticate Admin Session

1. Navigate to `https://midao.co/admin/login` (or staging equivalent)
2. Enter admin credentials (stored in `.qa-secrets/` — owner: Wei)
3. Confirm redirect to `/admin` dashboard
4. Record session start time: `[OPERATOR TO FILL]`

### Step B2: Trigger Controlled Incident

**Option A — Soft-launch control toggle (recommended, zero side-effects):**
1. Navigate to `/admin/soft-launch`
2. Toggle `new_booking_paused` ON — set reason: `"alert-drill-2026-05-24"`
3. Confirm API returns 200 and audit row is written
4. Toggle `new_booking_paused` OFF — set reason: `"alert-drill-complete"`
5. Confirm `soft_launch_control_audit` table has 2 new rows

**Option B — Direct ECPay callback simulation (advanced):**
1. Use Admin session with `x-admin-token: [REDACTED]` header
2. Call internal sweep endpoint or simulate PAYMENT_FAILED branch
3. Verify `recordIncident` fires in logs

Trigger method actually used: `[OPERATOR TO FILL]`
Trigger timestamp (ISO8601 Asia/Taipei): `[OPERATOR TO FILL]`

### Step B3: Verify incidents Table Row

Run in Supabase dashboard SQL editor (Production project):

```sql
SELECT id, severity, source, created_at
FROM incidents
ORDER BY created_at DESC
LIMIT 5;
```

Expected: at least one row with `created_at` matching drill timestamp.

| Field | Expected | Actual |
|-------|----------|--------|
| Row exists | YES | [OPERATOR TO FILL] |
| `severity` | WARNING or ERROR | [OPERATOR TO FILL] |
| `source` | matches trigger route | [OPERATOR TO FILL] |
| No PII in metadata | YES (redacted by `redactPii`) | [OPERATOR TO FILL] |

Partial row ID (first 8 chars only): `[OPERATOR TO FILL — e.g. a3f7b2e1...]`

### Step B4: Verify Sentry Event

1. Open Sentry dashboard: `https://sentry.io/organizations/[REDACTED]/issues/`
2. Filter by: Project = tour-platform, Time = Last 1 hour
3. Look for issue matching drill trigger source/message

| Field | Value |
|-------|-------|
| Sentry event received | [OPERATOR TO FILL — YES / NO / SKIPPED (no DSN)] |
| Sentry issue ID (first 8 chars) | [OPERATOR TO FILL — [REDACTED] or N/A] |
| Sentry project name | [OPERATOR TO FILL] |

Note: If `SENTRY_DSN` is not yet provisioned on Vercel production, this step is SKIPPED and recorded as a HOLD blocker.

### Step B5: Verify Notification Channel Delivered

| Channel | Expected | Actual |
|---------|----------|--------|
| LINE Notify (notify-api.line.me) | Message received in configured LINE group/DM | [OPERATOR TO FILL — YES / NO / SKIPPED] |
| Telegram (if configured as alternative) | Message received | [OPERATOR TO FILL — YES / NO / N/A] |

If LINE Notify skipped (no token), record: `LINE_NOTIFY_ACCESS_TOKEN absent — notification skipped (expected behavior per AC5)`

---

## Section C: HOLD Blocker Register

All items below are HOLD until resolved. Go/No-Go cannot move to GO until each item is checked off by owner.

| # | Blocker | Owner | Status | Resolution |
|---|---------|-------|--------|------------|
| C1 | `SENTRY_DSN` must be provisioned on Vercel production | Wei | HOLD | Repo-observable: code path reads `SENTRY_DSN` correctly in `@sentry/nextjs` init. **Operator action required:** confirm it is set in Vercel Project Settings → Environment Variables. If absent, Step B4 will be SKIPPED. |
| C2 | Canonical alert notification channel | AI | **RESOLVED** | LINE Notify (`notify-api.line.me`) was shut down 2025-03-31 and is non-functional in production. Decision: **Telegram is the canonical alerting channel**. See `docs/operations/alert-channel-decision.md` for the full decision record and code-change surface. Implementation of the Telegram migration is a separate follow-up. |
| C3 | `incidents` migration applied to production Supabase | Wei | HOLD | Repo-observable: `supabase/migrations/20260511_phase13_incidents.sql` and rollback file exist and are idempotent. **Operator verification SQL (run on prod):** `SELECT table_name FROM information_schema.tables WHERE table_name = 'incidents';` or `SELECT id, severity, source, created_at FROM incidents LIMIT 1;` |
| C4 | `ADMIN_ACCESS_TOKEN` custody for Step B1 | Wei | HOLD | Repo-observable: env var is read by admin middleware (`isAdminAuthorized`). **Operator action required:** confirm the production value is accessible from `.qa-secrets/` or Vercel env. Do not expose the value in this doc. |

---

## Section E: Drill Execution Checklist (Wei — copy-pasteable runbook)

> This checklist consolidates the Section B steps into an ordered, copy-pasteable format.
> All `[REDACTED]` items require operator to supply the value (never commit to this file).

### Pre-drill prerequisites (confirm before starting)
- [ ] C1: Vercel → `SENTRY_DSN` confirmed set for production
- [ ] C3: Supabase prod → run `SELECT table_name FROM information_schema.tables WHERE table_name = 'incidents';` → returns 1 row
- [ ] C4: `ADMIN_ACCESS_TOKEN` accessible (from `.qa-secrets/` or Vercel env)
- [ ] Notification channel ready per `docs/operations/alert-channel-decision.md` (Telegram bot token configured, or LINE Notify noted as SKIPPED)

### Step 1 — Admin session
1. Navigate to: `https://midao.co/admin/login`
2. Login with admin credentials
3. Confirm redirect to `/admin` dashboard
4. Record session start time (Asia/Taipei ISO8601): ________________

### Step 2 — Trigger controlled incident
1. Navigate to: `https://midao.co/admin/soft-launch`
2. Toggle `new_booking_paused` **ON** — set reason: `alert-drill-2026-05-24`
3. Confirm API returns 200
4. Toggle `new_booking_paused` **OFF** — set reason: `alert-drill-complete`
5. Confirm `soft_launch_control_audit` has 2 new rows
6. Record trigger timestamp (ISO8601): ________________

### Step 3 — Verify incidents table row
Run in Supabase dashboard SQL editor (production project):
```sql
SELECT id, severity, source, created_at
FROM incidents
ORDER BY created_at DESC
LIMIT 5;
```
- [ ] Row exists with `created_at` matching drill timestamp
- [ ] `severity`: WARNING or ERROR
- [ ] No PII in metadata column
- Partial row ID (first 8 chars only): ________________

### Step 4 — Verify Sentry event
1. Open: `https://sentry.io/organizations/[REDACTED]/issues/`
2. Filter: Project = tour-platform, Time = Last 1 hour
3. Confirm: event matching drill trigger source/message
- [ ] Sentry event received: YES / NO / SKIPPED (no DSN)
- Sentry issue ID (first 8 chars only): ________________

### Step 5 — Verify notification channel
Per `docs/operations/alert-channel-decision.md`:
- If **Telegram** is configured: confirm message received in Telegram ops channel
- If LINE Notify tokens absent: record as SKIPPED (expected per AC5)
- [ ] Channel delivered: YES / NO / SKIPPED

### Step 6 — Complete evidence file
1. Fill all `[OPERATOR TO FILL]` fields in Sections A–C above with actual values
2. Attach redacted artifacts (Sentry screenshot, Telegram/LINE message screenshot)
3. Record drill type: Tabletop / Live Execution

### Step 7 — Update Go/No-Go
1. Comment on issue #505 (Go/No-Go framework): mark alert drill as PASS
2. Comment on issue #320: confirm C2 RESOLVED, C1/C3 confirmed
3. Close issue #714 when all blockers are cleared

---

## Section D: Cross-links

| Issue / Doc | Description |
|-------------|-------------|
| #713 | This issue — static verification refresh + evidence skeleton |
| #714 | Operator execution — live drill Go/No-Go |
| #607 | Parent issue — alert infrastructure phase |
| #685 | LINE Notify sunset risk — channel migration decision |
| #559 | Original monitoring drill plan |
| #529 | Incident response runbook |
| #505 | Go/No-Go framework |
| #504 | Evidence pack index |
| #320 | Phase 13 alerting bus foundation |
| docs/operations/monitoring-alert-drill-plan-2026-05-17.md | Drill plan and static verification (original) |
| docs/operations/drills/2026-05-23-booking-v2-rollback-production-dry-run.md | Prior dry-run evidence format reference |
| docs/operations/alert-channel-decision.md | C2 resolution: LINE-vs-Telegram channel decision record |
| #1201 | AI leaf: readiness verification + channel decision (this file's refresh) |

---

## Footer

AI-generated skeleton. Human operator (Wei) must execute Section B, fill Section C, and run Section E checklist before Go/No-Go can move from HOLD to GO.

Static verification (Section A) refreshed by automated agent (issue #1201) at HEAD SHA `6668a3d9986d499c1e82576d21c1bac1b66c6311` on 2026-06-04. All Phase 13 contract tests pass (23/23 across alerting-bus, failure-detectors, and admin-health suites).
