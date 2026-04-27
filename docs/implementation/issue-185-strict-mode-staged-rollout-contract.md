# Issue #185 — Strict-mode staged rollout contract (planning slice)

Status: Planning deliverable (merge-ready documentation slice)
Owner: Tracy
Related issues: #68, #185, #186, #15, #16

---

## 1) Scope boundary (what #185 is / is not)

### #185 is
- A **staged execution contract** for strict-mode hardening order.
- A planning artifact that defines per-batch:
  - touched areas
  - validation commands
  - risk / rollback expectations
  - handoff gates

### #185 is not (explicit non-goals, preserved)
- Not a repo-wide strict-mode flip in a single PR.
- Not an all-module TypeScript strictness migration in this ticket.
- Not a replacement for child execution issues.
- Not permission to merge batches without QA evidence.

---

## 2) Enforced module order (must follow exactly)

1. **Booking** (first bounded execution slice via child issue **#186**)
2. **POS**
3. **LINE**
4. **Shared contracts** (cross-module type contracts + utilities convergence)

No out-of-order implementation unless a blocker is documented in issue comments and approved as re-plan.

---

## 3) Batch plan (impact / touched areas / validation / risks / rollback)

## Batch 1 — Booking (child issue #186, first executable slice)

**Execution issue**: #186 (bounded child)

**Impact area**
- Booking API routes, booking state transitions, booking validation boundaries.

**Touched areas (expected)**
- `apps/web/app/api/v2/**`
- `apps/web/src/lib/booking/**`
- `apps/web/tests/api/v2-*.test.mjs`
- `apps/web/tests/api/booking-state.test.mjs`

**Validation expectations (exact commands)**
```bash
npm run test:smoke:v2-core -w @tour/web
npm run typecheck
```

**Risk notes**
- Callback / state-transition regressions can break paid flow and reconciliation.
- Existing baseline typecheck config drift can mask true strictness progress.

**Rollback notes**
- Revert Booking strictness commit set as a single batch rollback unit.
- Keep previous runtime behavior as source of truth if strict-only refactor causes contract drift.

---

## Batch 2 — POS

**Execution issue**: follow-up child issue (after #186 completion gate)

**Impact area**
- Admin POS order/draft flow typing and payload/channel contracts.

**Touched areas (expected)**
- `apps/web/app/api/v2/admin/**`
- `apps/web/src/lib/pos/**`
- `apps/web/tests/api/v2-admin-pos-line-regression.test.mjs`

**Validation expectations (exact commands)**
```bash
npm run test:smoke:admin-pos-line -w @tour/web
npm run typecheck
```

**Risk notes**
- POS channel-specific payload shape drift can silently break admin operators.
- Channel enum strictness may expose legacy loose typing assumptions.

**Rollback notes**
- Revert POS-only strictness commits without touching Booking-established contract.
- Keep channel acceptance behavior (`web` / `line` / `admin_pos`) unchanged during rollback.

---

## Batch 3 — LINE

**Execution issue**: follow-up child issue (after POS gate pass)

**Impact area**
- LINE/LIFF ingress and booking draft integration typing boundary.

**Touched areas (expected)**
- `apps/web/src/lib/line/**`
- `apps/web/app/api/v2/**` (LINE entry points only)
- `apps/web/tests/api/v2-admin-pos-line-regression.test.mjs`

**Validation expectations (exact commands)**
```bash
npm run test:smoke:admin-pos-line -w @tour/web
npm run test:smoke:v2-core -w @tour/web
npm run typecheck
```

**Risk notes**
- LIFF context assumptions may break if strict nullability is enforced without guard clauses.
- Cross-channel fallback behavior can regress if union types are narrowed incorrectly.

**Rollback notes**
- Revert LINE batch independently; do not roll back Booking/POS unless shared contract breakage is proven.
- Preserve current mockable non-real-LINE dependency pattern for smoke tests.

---

## Batch 4 — Shared contracts

**Execution issue**: final convergence child issue (after module-specific batches are green)

**Impact area**
- Shared request/response/event contract types used across Booking/POS/LINE.

**Touched areas (expected)**
- `packages/**`
- `apps/web/src/lib/**/types*`
- `apps/web/tests/api/v2-route-contract-smoke.test.mjs`
- `apps/web/tests/api/v2-admin-pos-line-regression.test.mjs`

**Validation expectations (exact commands)**
```bash
npm run test:smoke:v2-core -w @tour/web
npm run test:smoke:admin-pos-line -w @tour/web
npm run typecheck
```

**Risk notes**
- Shared contract centralization can create wide blast radius for minor type changes.
- Over-eager refactor may accidentally expand beyond strictness scope.

**Rollback notes**
- Revert shared-contract convergence as a dedicated batch rollback.
- If rollback occurs, keep module-local types temporarily to protect delivery continuity.

---

## 4) Per-batch merge gate (merge-ready-only + qa_gate required)

A batch is merge-ready only when all are true:
1. Batch issue scope remains bounded (no cross-batch expansion).
2. Required smoke commands for that batch are green.
3. `npm run typecheck` result is attached; if baseline blocker exists, must be explicitly classified and linked.
4. Risk + rollback note updates are included in PR description.
5. Judy QA verdict is attached (`qa_gate required`).

If any item is missing => batch cannot merge.

---

## 5) Evidence expectations (for reviewer checklist)

For each batch PR, include:
- changed files list mapped to touched areas above
- command transcript snippets (smoke + typecheck)
- explicit statement: non-goals preserved
- explicit statement: no repo-wide strict-mode claim
- rollback command/path summary

---

## 6) Why child issue #186 is first

- #186 is the smallest bounded unit with high contract value (booking core routes + state transitions).
- Booking-first reduces uncertainty before POS/LINE channel-specific strictness work.
- This avoids pretending #185 itself flips strict mode globally; #185 is governance + execution sequencing.

---

## 7) Current known baseline blocker (tracking only, not a #185 repo blocker)

At planning time, root `npm run typecheck` currently fails due to TypeScript option compatibility in `apps/web/tsconfig.json` (`--ignoreDeprecations` value). This does **not** invalidate #185 planning artifact, but must be carried as per-batch validation context until resolved in execution slices.
