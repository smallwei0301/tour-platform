# Phase 12 Mainline Owner / Status / Artifact Matrix (Issue #163)

> Last truth-check: 2026-04-25 (GitHub issues/comments + repository docs)
> Scope only: #161 / #72 / #73 / #15 / #16 / #5 / #68

## Matrix

| Issue | Owner | Current status | Blocker | Expected artifact | Source of truth |
|---|---|---|---|---|---|
| #161 | Unassigned | **Closed**. Child FK hardening slice completed and merged via PR #189. | None (closed). | Migration-safe FK hardening notes + verification SQL for bookings/payments. | GitHub issue #161 state/comments; `docs/implementation/issue-161-fk-hardening-notes.md`; `docs/implementation/issue-161-fk-hardening-upgraded-db-notes.md`; `docs/implementation/issue-161-fk-hardening-verification.sql` |
| #72 | Unassigned | **Open (parent tracker)**. Latest update confirms child #216 merged (PR #219), parent remains open for remaining FK slices. | Remaining FK scope not yet fully landed (next bounded slice after #216, likely Batch2/#217). | Parent-level FK hardening tracker with bounded child slice progress and rollout evidence. | GitHub issue #72 latest comment (2026-04-25); `docs/implementation/issue-166-fk-inventory-batches.md`; `docs/implementation/issue-166-followup-202-availability-plan-link-hardening.md` |
| #73 | Unassigned | **Open (parent tracker)**. Latest update confirms child #170 merged (PR #214), parent remains open for follow-up audit slices. | Remaining audit scope follow-up not yet completed. | Shared audit contract + troubleshooting baseline consumed by next child slices. | GitHub issue #73 latest comment (2026-04-25); `docs/implementation/issue-170-audit-field-contract-and-troubleshooting.md` |
| #15 | Unassigned | **Open**. No assignee; implementation status not explicitly updated in recent issue comments. | To confirm (no current blocker statement in issue discussion). | Admin POS Lite implementation against listed required architecture/docs references. | GitHub issue #15 state/body; `docs/04-tech/04-tech-architecture/08-booking-pos-improvement-plan.md`; `docs/04-tech/04-tech-architecture/09-booking-pos-migration-plan.md`; `docs/04-tech/04-tech-architecture/10-api-spec-v2-booking-pos.md` |
| #16 | Unassigned | **Open**. No assignee; implementation status not explicitly updated in recent issue comments. | To confirm (no current blocker statement in issue discussion). | LINE / LIFF booking flow implementation aligned with Booking/POS v2 architecture docs. | GitHub issue #16 state/body; `docs/04-tech/04-tech-architecture/08-booking-pos-improvement-plan.md`; `docs/04-tech/04-tech-architecture/09-booking-pos-migration-plan.md`; `docs/04-tech/04-tech-architecture/10-api-spec-v2-booking-pos.md` |
| #5 | Unassigned | **Open (umbrella / coordination parent)**. Explicitly kept as Phase 12 master tracker, not direct execution slot. | Direct implementation intentionally blocked by governance rule (work must flow through child issues). | Phase 12 umbrella coordination: child-issue orchestration, progress tracking, release coordination. | GitHub issue #5 latest comment (2026-04-24); repo root `README.md`; `docs/README.md` |
| #68 | Unassigned | **Open (parent/source tracker)**. Explicitly moved out of direct execution queue; to be advanced via child strict-mode issues. | Direct execution on #68 intentionally blocked; child issues required (e.g. #185/#186 per tracker comment). | Strict-mode program coordination and child-slice tracking (not standalone implementation ticket). | GitHub issue #68 latest comment (2026-04-24); GitHub issue #185/#186 references in #68 comment |

## Rollback / Observability / Risks (for this matrix artifact)

### Rollback
- Docs-only change. Rollback path is revert of this file plus index link change.
- If truth drifts, prefer a focused follow-up docs commit (do not rewrite issue history in matrix text).

### Observability
- Primary signal: GitHub issue state + latest tracker comments for each scoped issue.
- Secondary signal: matching implementation docs under `docs/implementation/` and phase architecture docs under `docs/04-tech/04-tech-architecture/`.
- Recommended refresh trigger: whenever any scoped issue changes state, assignee, or receives a progress-summary comment.

### Risks
- Ownership may become stale quickly because all scoped issues are currently unassigned.
- Parent tracker issues (#72/#73/#5/#68) can be misread as executable slots without explicit wording.
- #15/#16 blocker status is currently under-specified; requires explicit owner/status update to avoid ambiguity.
