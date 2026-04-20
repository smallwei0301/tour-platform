# Booking V2 Rollback Runbook (Issue #104)

Version: v1
Owner: Rollout Owner (#96)
Scope: Booking route V2 cutover safety rollback

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
- [ ] Set `NEXT_PUBLIC_BOOKING_V2_ENABLED=false`
- [ ] Apply via **single source of action**:
  - Vercel Project Settings -> Environment Variables -> Production -> `NEXT_PUBLIC_BOOKING_V2_ENABLED=false`
  - Redeploy latest production deployment (or trigger production redeploy pipeline)
- [ ] Record rollback start timestamp
- [ ] Record rollback action proof (at least one):
  - Vercel deployment ID
  - config change screenshot
  - command/deploy transcript

### Step B — Verify rollback effect
- [ ] Booking page resolves to legacy behavior contract
- [ ] No persistent loading/error loop in booking flow
- [ ] Record rollback complete timestamp
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

## 5) Evidence Requirements

A rollback event is not considered complete unless evidence includes:
- trigger reason
- rollback start/end times
- verification results
- incident template filled
