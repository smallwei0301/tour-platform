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
- [ ] Trigger deployment / config apply
- [ ] Record rollback start timestamp

### Step B — Verify rollback effect
- [ ] Booking page resolves to legacy behavior contract
- [ ] No persistent loading/error loop in booking flow
- [ ] Record rollback complete timestamp

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
2. Order creation path healthy
3. Callback writeback healthy
4. Invariant checks clean

If any check fails, escalate immediately and keep rollout state at HOLD/ROLLBACK WATCH.

---

## 5) Evidence Requirements

A rollback event is not considered complete unless evidence includes:
- trigger reason
- rollback start/end times
- verification results
- incident template filled
