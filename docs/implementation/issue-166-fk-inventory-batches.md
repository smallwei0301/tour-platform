# Issue #166 — Remaining FK inventory and batch plan (discovery slice)

> Scope: **inventory + execution planning only**. No schema mutation in this slice.

## 0) Definition of Done (DoD)

- [x] Build a complete inventory of **remaining relational columns without enforced FK constraints** from current repo migrations.
- [x] Explicitly exclude constraints already landed via #172 / #173 and other already-enforced relationships.
- [x] Classify remaining items into Batch 1 / 2 / 3 by risk and booking criticality.
- [x] Provide per-item data/risk/dependency fields so follow-up rollout issues can execute directly.
- [x] Provide follow-up issue drafts with SQL precheck/rollback/observability expectations.

## 1) Plan / Risks / Rollback / Observability

### Plan
1. Parse migration-defined relational columns and currently enforced FK constraints.
2. Subtract already-enforced FKs (including #172 / #173 landing set).
3. For remaining columns, classify by:
   - booking criticality
   - data-shape ambiguity (nullable/polymorphic/free-text)
   - blast radius if hard-enforced
4. Produce bounded implementation-ready issue drafts by batch.

### Key risks
- **False-positive FK candidate**: columns intentionally non-FK (session_id, free-text plan_id, polymorphic ref_id).
- **Data-shape mismatch**: text identifiers or polymorphic refs cannot be enforced by a single FK.
- **Migration-order coupling**: some rollouts require pre-normalization/backfill before constraint add.

### Rollback strategy (for follow-up rollout tickets)
- Every FK rollout ticket must include:
  - orphan precheck SQL
  - idempotent add/drop constraint blocks
  - explicit `DROP CONSTRAINT IF EXISTS ...` rollback sequence
- Keep rollout per-batch and per-constraint bounded to reduce blast radius.

### Observability contract (for follow-up rollout tickets)
- Before/after checks for:
  - orphan counts
  - null-rate / invalid-format rate
  - affected write-path error logs (`23503` foreign_key_violation)
- Add verification SQL artifact per rollout issue under `supabase/scripts/verify_issueXXX_*.sql`.

---

## 2) Ground truth baseline used in this inventory

### Already enforced / excluded from remaining scope
The following are treated as already landed and **excluded** from missing inventory:

- `bookings.order_id -> orders.id` (#172 / #161 hardening path)
- `payments.booking_id -> bookings.id` (#172 / #161 hardening path)
- `orders.booking_id -> bookings.id` (#173)
- `orders.handled_by -> users.id` (#173)
- Other constraints already declared/enforced in current migrations (activities/orders/bookings/payments/events/etc.).

---

## 3) Remaining missing-FK inventory (execution-ready)

| item_key | table.column | intended_parent | current_type | booking_criticality | data_volume_note | risk_level | migration_dependencies | recommendation |
|---|---|---|---|---|---|---|---|---|
| FK166-001 | `order_items.ref_id` | polymorphic (`bookings.id` when `item_type='activity_booking'`, otherwise none/other) | `uuid` nullable | **High** (order reconciliation / booking linkage) | likely medium-high (line-item table grows with orders) | **High** | requires model normalization (split typed FK columns or reference table) before safe FK | **Batch 1 discovery+design** then rollout |
| FK166-002 | `activity_availability_daily.plan_id` | maybe `activity_schedules.plan_id` semantic domain (not PK table FK) | `text` nullable | Medium (availability aggregation correctness) | medium (daily snapshot rows) | Medium | needs domain decision: keep free-text, enum, or normalized `activity_plans` mapping key | **Batch 2** after schema decision |
| FK166-003 | `kpi_settings_history.source_version_id` | `kpi_settings_history.version_id` (self-reference) | `text` nullable | Low (admin audit chain) | low | Low | ensure historical backfill doesn’t create broken links before FK/self-FK | **Batch 3** |
| FK166-004 | `events.session_id` | none (anonymous client session token) | `text` nullable | Low (analytics only) | high write volume possible | Low | no parent table exists; should remain non-FK unless session table introduced | **Batch 3 explicitly no-FK** |

### Excluded non-actionable candidate
- `kpi_settings_history.version_id` is the table PK itself, not a missing FK target.

---

## 4) Batch ordering

## Batch 1 (booking-critical earliest)
1. `order_items.ref_id` design-hardening slice
   - Why earliest: directly impacts booking/order line integrity and downstream reconciliation.
   - Constraint cannot be safely added as-is due to polymorphic semantics.

## Batch 2 (operational correctness)
1. `activity_availability_daily.plan_id`
   - Availability snapshot integrity matters, but dependency is schema/domain normalization first.

## Batch 3 (audit/analytics and explicit non-FK decisions)
1. `kpi_settings_history.source_version_id` self-FK (optional hardening)
2. `events.session_id` explicitly documented as non-FK unless a dedicated session entity is introduced.

---

## 5) Follow-up implementation issue map (bounded, directly executable)

- Batch 1 rollout issue draft: `docs/implementation/issue-166-followup-201-order-items-ref-hardening.md`
- Batch 2 rollout issue draft: `docs/implementation/issue-166-followup-202-availability-plan-link-hardening.md`
- Batch 3 rollout issue draft: `docs/implementation/issue-166-followup-203-admin-analytics-fk-decisions.md`

Each draft includes: scope, precheck SQL contract, migration path, rollback, observability, and acceptance targets.

---

## 6) Evidence method

Inventory derivation used repo migration corpus under `supabase/migrations/` and relational-column vs FK subtraction logic, then manually verified intended semantics from:
- `20260409000000_v2_booking_pos_foundation.sql`
- `20260421151000_issue85_availability_snapshot.sql`
- `008_events.sql`
- `002_activities_admin.sql`
- FK hardening slices `#172`, `#161`, `#173`

This keeps issue #166 as a bounded discovery artifact and leaves follow-up rollout tickets implementation-ready.
