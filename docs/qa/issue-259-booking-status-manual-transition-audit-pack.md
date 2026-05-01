# Issue #259 — Booking Status Manual Transitions Audit-Readiness Pack (Bounded Slice)

- Parent issue: #171
- Child issue: #259
- Scope: **booking status manual transitions only**
- Explicitly out of scope: payment/refund manual actions, LINE/LIFF transitions, POS writes

## 1) DoD (bounded)

This slice is complete when:
1. We can name the manual transition evidence points required for audit review.
2. We provide at least one grounded, reproducible proof path.
3. Evidence remains narrow to booking status transitions and does not pull in adjacent domains.

## 2) Audit Evidence Contract (manual transition)

For each manual status transition event, audit evidence should include:
- `booking_id` (target booking)
- `from_status`
- `to_status`
- `actor_id` or `operator_id` (who initiated)
- `actor_role` (admin/guide/system where available)
- `reason` / `note` (why transition happened)
- `changed_at` (timestamp)
- `request_id` / trace correlation id (if present)
- `source` (dashboard/admin API/manual action path)

## 3) Grounded Proof Path A (repeatable now)

### Objective
Validate that allowed/blocked manual transitions for booking status are deterministic and test-backed.

### Command
```bash
node --test apps/web/tests/api/booking-state.test.mjs
```

### Expected result
- Exit code: 0
- `pass 60`, `fail 0`
- Includes representative transition assertions such as:
  - `draft → pending_confirmation` valid
  - `pending_confirmation → confirmed` valid
  - `confirmed → completed` valid
  - terminal/backward/unknown transitions invalid

### Captured run summary (2026-05-01)
- `tests 60`
- `pass 60`
- `fail 0`
- `duration_ms 156.447705`

## 4) Repro guidance for audit review packet

When QA prepares audit packet for a specific booking:
1. Select booking id and target manual transition event.
2. Extract corresponding audit log row(s) by `booking_id` + time window.
3. Verify all fields in section 2 exist and are non-empty (except optional `request_id` when unavailable).
4. Cross-check transition legality against state machine rules verified in Proof Path A.
5. Attach this checklist + raw query output/screenshots as immutable evidence.

## 5) Risks / rollback / observability

- Risks:
  - Evidence may be incomplete if operator metadata is not consistently populated upstream.
  - Teams may accidentally mix this slice with payment/refund/POS evidence if scope guard is not enforced.
- Rollback:
  - Documentation-only change. Rollback = revert this file commit.
- Observability:
  - Primary signal = deterministic transition test suite health (`booking-state.test.mjs`).
  - Secondary signal = audit log field completeness checks per booking packet.
