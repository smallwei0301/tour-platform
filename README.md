# Tour Platform

> Last updated: 2026-04-26  
> Scope note: this README is a **docs truth-sync entry** for Phase 12 issue structure (no feature implementation status claims).

## Current execution source of truth (Phase 12 parent)

- Parent issue: [#5](https://github.com/smallwei0301/tour-platform/issues/5)
- Docs sync issue: [#183](https://github.com/smallwei0301/tour-platform/issues/183)

## Phase 12 issue breakdown (canonical)

### P0 — Foundation / Contracts / Verification gates
- [#165](https://github.com/smallwei0301/tour-platform/issues/165) Audit coverage matrix
- [#168](https://github.com/smallwei0301/tour-platform/issues/168) FK rollout runbook / rollback notes
- [#171](https://github.com/smallwei0301/tour-platform/issues/171) Audit verification checklist
- [#221](https://github.com/smallwei0301/tour-platform/issues/221) Parent gate artifact for #171

### P1 — POS / LINE core delivery + docs/ops/qa alignment
- [#175](https://github.com/smallwei0301/tour-platform/issues/175) POS Lite operator SOP
- [#176](https://github.com/smallwei0301/tour-platform/issues/176) Admin POS Lite MVP
- [#177](https://github.com/smallwei0301/tour-platform/issues/177) POS smoke/manual checklist
- [#178](https://github.com/smallwei0301/tour-platform/issues/178) LINE/LIFF audit trail implementation
- [#179](https://github.com/smallwei0301/tour-platform/issues/179) LINE/LIFF staged rollout SOP
- [#180](https://github.com/smallwei0301/tour-platform/issues/180) LIFF booking MVP
- [#181](https://github.com/smallwei0301/tour-platform/issues/181) LINE/LIFF go-no-go metrics
- [#182](https://github.com/smallwei0301/tour-platform/issues/182) Availability snapshot/refresh compatibility
- [#183](https://github.com/smallwei0301/tour-platform/issues/183) Docs truth-sync (this slice)
- [#184](https://github.com/smallwei0301/tour-platform/issues/184) Readiness review / release gate

### P2 — Strictness / hardening follow-ups
- [#185](https://github.com/smallwei0301/tour-platform/issues/185) Strict-mode rollout plan
- [#186](https://github.com/smallwei0301/tour-platform/issues/186) Stricter type checks for booking-critical modules
- [#217](https://github.com/smallwei0301/tour-platform/issues/217) Plan linkage hardening (`activity_availability_daily.plan_id`)
- [#218](https://github.com/smallwei0301/tour-platform/issues/218) KPI lineage hardening / analytics session non-FK contract

## Entry docs

- Docs index: [`docs/README.md`](./docs/README.md)
- Weekly sync summary: [`docs/04-tech/03-dev-timeline/docs-audit-summary-2026-04-20.md`](./docs/04-tech/03-dev-timeline/docs-audit-summary-2026-04-20.md)
- Execution plan (issue-driven): [`docs/04-tech/03-dev-timeline/08-tracy-handoff-booking-pos.md`](./docs/04-tech/03-dev-timeline/08-tracy-handoff-booking-pos.md)

## Guardrails

- This README intentionally avoids stale "open PR" narrative.
- Track implementation reality from GitHub Issues/PRs directly.
- Keep this file aligned with parent #5 child-issue structure only.
