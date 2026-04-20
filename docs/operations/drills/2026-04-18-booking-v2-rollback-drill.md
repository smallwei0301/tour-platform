# Non-Prod Rollback Drill Evidence — 2026-04-18

Issue: #104
Environment: local non-prod simulation
Owner: Tracy

---

## Drill Objective
Validate that rollback procedure can deterministically return booking flow to legacy path and preserve order/callback core safety.

## Drill Timeline (Asia/Taipei)
- Start: 2026-04-18 01:33
- Rollback applied: 2026-04-18 01:35
- Verification completed: 2026-04-18 01:40
- Verification SLA target: <= 5 minutes after rollback apply
- SLA result: PASS (5 minutes)

---

## Execution Summary

### 1) Baseline setup
- Installed deps and started non-prod local runtime
- Verified booking route responds 200

### 2) Rollback action simulation
- Applied global rollback override model:
  - `NEXT_PUBLIC_BOOKING_V2_ENABLED=false`
- Restarted runtime under rollback state

### 2.1 Rollback action proof
- Local drill command trace: env override + process restart captured in shell transcript
- Production-equivalent proof requirement (for real run):
  - deploy ID or config-change screenshot must be attached

### 3) Verification evidence
- Legacy path indicator check (rollback state):
  - `FLAG_OFF_V2_MARKER=PASS`
  - (No V2 marker found in booking response)
- Order/callback regression checks:
  - `ORDER_CALLBACK_TESTS=PASS`
  - command: `node --test apps/web/tests/api/orders.test.mjs apps/web/tests/api/ecpay-callback.test.mjs`

---

## Notes / Limitations
1. Booking V2 visible marker is client-rendered; raw HTML curl is not sufficient to prove ON-path visual state.
2. This drill validates rollback determinism and safety checks in non-prod/local context; production drill should additionally include metrics snapshot and operator-run timestamp evidence.

---

## Pass/Fail
- Drill verdict: **PASS** (non-prod simulation)

## Attached runbook/template references
- `docs/operations/booking-v2-rollback-runbook.md`
- `docs/operations/templates/booking-v2-incident-template.md`
