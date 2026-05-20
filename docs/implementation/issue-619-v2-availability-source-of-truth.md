# Issue 619 — V2 availability source-of-truth contract (phase 1)

Status: contract/skeleton only (no adapter implementation in this slice)
Scope: activity detail day/plan availability read semantics for V2-enabled flows

## Primary source of truth (V2-enabled flows)

For V2-enabled activity availability reads, backend must derive availability from:
1. guide_availability_rules (candidate slots/rules)
2. guide_blackout_dates (hard block windows)
3. bookings (consumption/capacity occupation)
4. activity_plans (eligible active plans and capacity constraints)

Legacy tables are NOT primary V2 sources:
- activity_availability_daily
- activity_schedules

Phase-1 policy:
- Legacy tables remain legacy/fallback only.
- This slice must not introduce a V2 derived snapshot cache.
- If a V2 cache is added later, it must be explicitly V2-derived and invalidated by:
  - guide_availability_rules updates
  - guide_blackout_dates updates
  - bookings state/capacity-impacting transitions
  - future admin override writes

Admin schedule planning policy for phase-1:
- Admin schedule planning remains legacy-only in this phase.
- This contract does not define or invent an admin override schema.
- UI labeling/segmentation is handled in a separate UI task.

## Activity-detail V2 day/plan response semantics

Availability status per day/plan uses:
- open: at least one candidate slot is bookable after blackout + booking consumption checks.
- full: day has candidate slot(s) but remaining capacity is 0 after booking consumption.
- not-open: day has no candidate slot after rule window filtering OR is blocked by blackout/admin-closure policy.

Required response fields (day/plan rows):
- status: one of open/full/not-open
- remaining: integer >= 0
- firstSlotStartAt: nullable ISO timestamp; first bookable slot in request timezone
- timezone: IANA timezone string used for slot/day projection

## Precedence contract

When deriving V2 availability:
1. Blackout blocks first.
2. Future admin closure (if introduced) blocks before capacity/open calculation.
3. Guide rules generate candidate slots.
4. Active bookings consume/occupy slot capacity.
5. Remaining capacity determines open/full.

Rule-to-plan matching:
- rule.activity_plan_id = null -> applies to all eligible active plans.
- rule.activity_plan_id = <plan-id> -> applies only to that plan.

## Forbidden source drift contract

In V2 mode, /api/activities/[slug]/availability must not prefer legacy activity_availability_daily or activity_schedules as the primary read path.

Acceptable transitional shape for next implementation slice:
- explicit V2-mode branch that calls a dedicated V2 availability adapter derived from rules/blackouts/bookings/plans
- explicit legacy/fallback branch kept for non-V2 flows

Unacceptable shape:
- V2 mode still reading snapshot/schedules first and only using V2 sources optionally/indirectly

## Test intent in this task

This task adds contract tests that intentionally fail until the V2 adapter + route wiring exists. The next backend slice must make them pass without changing this contract.