# Booking V2 Rollback Runbook (Issue #104)

Version: v2
Owner: Rollout Owner (#96)
Scope: Booking route V2 cutover safety rollback
Last updated: 2026-05-23 (Issue #641 — production operator details + permission matrix)

---

## 0) Production Operator Permission Matrix

| Role | Can change NEXT_PUBLIC_BOOKING_V2_ENABLED | Can trigger production redeploy |
|---|---|---|
| Release Owner (Primary) | YES — Vercel Project Settings > Environment Variables | YES |
| Engineering Lead (Backup) | YES — same path | YES |
| On-call Ops | No — escalate to Release Owner | No |

Escalation: If Release Owner unavailable → Engineering Lead → [urgent: repo owner]

> If the operator reaching this runbook does not have Vercel env/deploy access, stop and escalate immediately. Do not attempt workarounds.

---

## 1) Trigger Conditions (when to rollback)

Trigger rollback immediately if any of these occur:
1. callback success rate drops beyond configured threshold
2. oversell invariants breach (`insufficient_capacity` / `schedule_not_open` semantic anomalies)
3. sustained booking API 5xx spike
4. fallback click rate spikes above threshold

---

## 2) Rollback Precedence (deterministic)

1. **Global hard override** (highest priority)
   - set `NEXT_PUBLIC_BOOKING_V2_ENABLED=false`
2. **Stage rollback**
   - reduce rollout stage (100 -> 50 -> 25 -> canary)
3. **Local fallback**
   - user-triggered fallback CTA in V2 path

> Note: local fallback is UX safety; it is NOT a substitute for global rollback.

---

## 3) Operator Checklist (5-minute target)

### Step A — Execute rollback

Choose method based on urgency and confidence:

**Method A — Env var flip + redeploy (preferred):**
1. Vercel Dashboard > Project > Settings > Environment Variables
2. Find `NEXT_PUBLIC_BOOKING_V2_ENABLED`, set to `0` or remove, select Production scope
3. Trigger redeploy: Deployments > latest deploy > Redeploy (or `git push` to main)
4. Wait for deployment to complete (watch Vercel Deployments list)

**Method B — Instant rollback to prior deployment (use if Method A risks misconfiguration under pressure):**
1. Vercel Dashboard > Deployments > find last-known-good deployment
2. Click `•••` > Promote to Production
3. Verify deployment SHA changed in `/api/health` response

- [ ] Record rollback start timestamp (ISO8601 Asia/Taipei)
- [ ] Record current Vercel deployment ID before rollback (Vercel Dashboard > Deployments, first row)

### Step B — Verify rollback effect
- [ ] Run: `curl -s https://<prod-url>/api/health` — confirm response and deployment SHA changed
- [ ] Confirm legacy CTA visible on at least one activity page (V2 booking path should not appear)
- [ ] Booking page resolves to legacy behavior contract
- [ ] No persistent loading/error loop in booking flow
- [ ] Record rollback complete timestamp (ISO8601 Asia/Taipei)
- [ ] **Deadline rule**: verification must complete within 5 minutes after rollback apply
- [ ] If deadline missed, keep state at `ROLLBACK WATCH` and escalate immediately

### Step C — Post-rollback verification (must pass)
- [ ] Order creation still works
- [ ] Payment callback writeback path still works
- [ ] No callback/oversell invariant regression

### Step D — Incident record
- [ ] Fill incident template (see `docs/operations/templates/booking-v2-incident-template.md`)
- [ ] Attach metrics snapshot + validation evidence

---

## 4) Verification Checklist (required)

1. Booking UI path returns to legacy
   - Minimum executable check:
     - Open `/booking/[activityId]?plan=...` with production flag-off state
     - confirm V2 marker is absent and legacy CTA/path is present
2. Order creation path healthy
3. Callback writeback healthy
4. Invariant checks clean

If any check fails, escalate immediately and keep rollout state at HOLD/ROLLBACK WATCH.

## 4.1 Escalation owner
- Primary escalation: Rollout Owner (#96)
- Secondary escalation: On-call backend owner
- If operator lacks env/deploy permission, escalate to Release Owner immediately (no waiting)

---

## 5) Required Rollback Proof (all four must be captured)

A rollback event is not considered complete unless ALL of the following are captured:

1. **Vercel Deployment ID**: found at Vercel Dashboard > Deployments > copy deployment URL hash (both pre-rollback and post-rollback)
2. **Config-change record**: screenshot of Vercel Project Settings > Environment Variables showing `NEXT_PUBLIC_BOOKING_V2_ENABLED=0` (must show variable name + value + production scope)
3. **Timestamps**: rollback-start ISO8601 Asia/Taipei + rollback-complete ISO8601 Asia/Taipei
4. **Verification result**: output of `curl -s https://<prod-url>/api/health` + confirmation legacy CTA visible on one activity page
5. **Incident link**: link to filled `docs/operations/templates/booking-v2-incident-template.md` (required if incident triggered rollback)

> Partial evidence (e.g. only a timestamp with no deployment proof) does not satisfy this requirement.

---

## 6) Production-Specific Steps

### Pre-rollback (capture before touching anything)
1. Capture current deployment ID from Vercel Dashboard > Deployments (first row = current production deployment)
2. Note current `NEXT_PUBLIC_BOOKING_V2_ENABLED` value in Project Settings > Environment Variables

### Rollback method A (env var flip + redeploy)
1. Vercel Dashboard > Project > Settings > Environment Variables
2. Find `NEXT_PUBLIC_BOOKING_V2_ENABLED`, set to `0` or remove, select Production scope only
3. Trigger redeploy: Deployments > latest deploy > Redeploy (or `git push` to main)
4. Verify: `curl -s https://<prod-url>/api/health`; confirm V2 path disabled

### Rollback method B (instant rollback to prior deployment)
1. Vercel Dashboard > Deployments > find last-known-good deployment
2. Click `•••` > Promote to Production
3. Verify deployment SHA changed in `/api/health` response

> Choose Method B if env var approach risks misconfiguration under pressure.

---

## 7) 5-Minute Drill Mode (no production mutation)

Tabletop rehearsal: narrate each step aloud without executing. Confirm:

- [ ] You can navigate to Vercel Project Settings in < 60 seconds
- [ ] You know where `NEXT_PUBLIC_BOOKING_V2_ENABLED` lives
- [ ] You can identify the prior stable deployment in the Deployments list
- [ ] You can describe verification steps without looking at this runbook

**Target**: complete narration in < 5 minutes. If > 5 minutes, add the blocker to the operator-handoff issues.
