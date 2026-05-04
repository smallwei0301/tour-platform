# Issue #271 — Strict-mode blocker inventory + bounded rollout slices (docs/contract slice)

Status: Documentation deliverable (bounded planning slice only)
Owner: Tracy
Related issues: #68, #271 (this), #185, #186 (closed)

---

## 1) Scope boundary (authoritative)

### In scope for #271
- Build a **truthful blocker inventory** for strict-mode rollout readiness.
- Capture the **current typecheck stopper(s)** before any strict=true rollout claim.
- Define bounded follow-up execution slices for:
  1. POS
  2. LINE
  3. Shared contracts

### Explicit non-goals for #271
- No repo-wide `strict=true` flip.
- No reuse/reopen of closed child #186.
- No cross-repo refactor or unrelated cleanup.

---

## 2) Inventory evidence (captured on this slice)

Run command:

```bash
npm run typecheck -w @tour/web
```

Observed blocker (first hard stop):

- `apps/web/tsconfig.json(4,27): error TS5103: Invalid value for '--ignoreDeprecations'.`

Interpretation:
- Current baseline fails before strictness-hardening work can be measured meaningfully.
- This is a **config compatibility blocker**, not evidence that strict-mode migration itself is done/undone.

---

## 3) Blocker categories (contract view)

### A. Baseline config blocker (must clear first)
- `TS5103` on `ignoreDeprecations` in `apps/web/tsconfig.json`.
- Gate effect: blocks truthful typecheck-based strictness progress accounting.

### B. Module execution blockers (to be discovered per slice)
- POS module typing gaps (admin POS payload + order/draft flow boundaries).
- LINE module typing gaps (LIFF ingress context + nullability boundaries).
- Shared contract typing drift (cross-module request/response/event contracts).

Note: B-class items are bounded and should be discovered/closed in child slices, not merged into one mega ticket.

---

## 4) Bounded follow-up slices (required by #271)

## Slice A — POS strictness inventory + bounded fixes

Goal:
- Enumerate POS-local strict blockers and fix only POS-bounded type issues.

Expected touched areas:
- `apps/web/app/api/v2/admin/**`
- `apps/web/src/lib/pos/**`
- POS-related test files under `apps/web/tests/**`

Validation contract:

```bash
npm run test:smoke:admin-pos-line -w @tour/web
npm run typecheck -w @tour/web
```

Merge gate:
- No booking/LINE/shared-contract broadening in same PR.
- Include rollback note for POS-only commit range.

---

## Slice B — LINE strictness inventory + bounded fixes

Goal:
- Enumerate LINE/LIFF-local strict blockers and fix only LINE entry/integration typing.

Expected touched areas:
- `apps/web/src/lib/line/**`
- LINE entry points in `apps/web/app/api/v2/**`
- LINE regression tests under `apps/web/tests/**`

Validation contract:

```bash
npm run test:smoke:admin-pos-line -w @tour/web
npm run test:smoke:v2-core -w @tour/web
npm run typecheck -w @tour/web
```

Merge gate:
- No repo-wide strict flip.
- Preserve current channel acceptance behavior unless explicitly approved.

---

## Slice C — Shared contracts convergence

Goal:
- Inventory and remediate shared type-contract drift used by Booking/POS/LINE.

Expected touched areas:
- `packages/**`
- shared type definitions under `apps/web/src/lib/**/types*`
- cross-contract smoke tests under `apps/web/tests/**`

Validation contract:

```bash
npm run test:smoke:v2-core -w @tour/web
npm run test:smoke:admin-pos-line -w @tour/web
npm run typecheck -w @tour/web
```

Merge gate:
- Changes must remain contract-focused; avoid opportunistic refactor expansion.
- Include blast-radius + rollback statement in PR body.

---

## 5) Ordering + governance

Execution order after baseline config blocker is handled:
1. POS slice
2. LINE slice
3. Shared contracts slice

Governance:
- Parent #68 stays tracker.
- #271 remains inventory/contract slice and should not be treated as strict=true implementation ticket.

---

## 6) Done definition for #271 (this doc slice)

- [x] Inventory includes current hard-stop evidence.
- [x] No repo-wide strict=true action taken.
- [x] No reuse of closed #186.
- [x] At least three bounded follow-up slices defined (POS / LINE / Shared contracts).
- [x] Documentation is merge-ready as standalone contract artifact.
