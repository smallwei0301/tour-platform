# Issue #164 — Precheck/Data-Quality Alignment Notes

## Objective
Align precheck/verification/docs to actual production schema:
- bookings.order_id -> orders.id
- orders.booking_id -> bookings.id
- payments.order_id -> orders.id
- payments.booking_id is not part of current production precheck artifacts

## Inventory summary (repo scope)
### In-scope aligned in this slice
- `supabase/scripts/verify_issue161_fk_hardening.sql` (legacy filename, updated logic)
- `supabase/scripts/precheck_issue164_schema_alignment.sql` (new canonical precheck)
- `docs/implementation/issue-161-fk-hardening-verification.sql` (updated verification SQL)
- `docs/issue-172-fk-rollout-notes.md` (historical note + pointer to #164 aligned checks)
- `docs/implementation/issue-161-fk-hardening-notes.md` (historical note + #164 contract)
- `docs/implementation/issue-161-fk-hardening-upgraded-db-notes.md` (historical note + #164 contract)

### Out-of-scope references retained intentionally
- historical migrations under `supabase/migrations/*` referencing old rollout assumptions
- generated helper scripts like `apply_migrations.sh`
- nested legacy snapshot folder `tour-platform/**`

These are retained for migration history traceability and are not treated as active precheck artifacts in #164.

## Validation checklist
- No active precheck query validates `payments.booking_id -> bookings.id`.
- Active precheck validates only canonical links.
- Docs explicitly mark historical files and point to issue #164 aligned checks.
