# Issue #181 — LINE / LIFF Go-No-Go Readiness Contract (Docs-only)

Status: Draft for implementation readiness review  
Owner: Tracy  
Issue: #181  
Depends on: #178, #179, #180, #184  
Related references: #96 rollout contract, #103 metrics contract, #170 audit field contract

---

## 1) Scope and Truthfulness Guardrails

This artifact defines **readiness gates**, not production completion claims.

- In-scope: LINE / LIFF rollout decision contract (GO / HOLD / ROLLBACK WATCH), staged checkpoints, observability/data-quality requirements.
- Out-of-scope: LIFF auth implementation, booking flow implementation, telemetry pipeline coding, notification audit implementation.
- No unsupported production/SLA guarantees are made in this document.
- This document does **not replace #184**; it defines the gate contract that #184 and related slices can execute against.

---

## 2) Staged Rollout Checkpoints (Readiness)

Use shared Booking V2 vocabulary and enforce LINE / LIFF-specific checks.

### Stage A — Preflight (0% rollout)
- Preconditions:
  - #178 / #179 / #180 / #184 have explicit status notes and known owner path.
  - Decision sheet template is available for daily/shift review.
  - Rollback communication path is identified.
- Required output:
  - Readiness packet with this contract attached.
- Exit to next stage only if all preconditions are explicitly checked.

### Stage B — Canary WATCH (low exposure)
- Objective: verify instrumentation and data quality under real but bounded traffic.
- Required checks:
  - `source_channel=line` appears in tracked records used for gate metrics.
  - Correlation/transaction identifiers are present for decision-critical samples.
  - Unknown/missing dimension rate is within acceptable range (see Data Quality Gate).
- Typical decision at this stage: HOLD or WATCH-first GO for next checkpoint only.

### Stage C — Controlled Expansion
- Objective: confirm stable trend across at least one observation window.
- Required checks:
  - GO/HOLD/ROLLBACK WATCH semantics are applied with written evidence.
  - No unresolved data-quality HOLD trigger remains open.
  - Risks and rollback owner are explicitly named in checkpoint notes.

### Stage D — Full-readiness Recommendation
- Objective: produce recommendation packet for release owner review.
- Required checks:
  - Stage history is complete and auditable.
  - Dependency status (#178/#179/#180/#184) is re-validated.
  - Recommendation includes explicit fallback/rollback posture.

---

## 3) Operational Decision Semantics

### GO
Use only when:
- Required metrics fields are present with usable coverage.
- `source_channel=line` alignment is verified for decision scope.
- No active data-quality HOLD trigger exists.
- Risk posture is documented and accepted by checkpoint owner.

### HOLD
Use when any of the following is true:
- Missing/unknown dimensions reduce decision reliability.
- `source_channel` is missing, mixed incorrectly, or not provably `line` for scoped samples.
- Correlation/transaction identifiers are missing for material portions of critical events.
- Dependency ambiguity (#178/#179/#180/#184) prevents safe interpretation.

### ROLLBACK WATCH
Use when:
- Signals are degrading or inconsistent and need active rollback readiness.
- A checkpoint cannot assert stable behavior and risk is increasing.
- Team must keep rollback path hot while continuing bounded validation.

> Note: ROLLBACK WATCH is a heightened readiness state, not an automatic rollback action. Trigger and owner must be explicit in checkpoint record.

---

## 4) Observability Contract (Minimum for #181 gate)

Required gate fields (minimum):
- `source_channel` (mandatory; for this gate, must align to `line`)
- `correlation_id` (or equivalent cross-event correlation identifier)
- `transaction_id` (or equivalent payment/booking transaction identifier)
- `event_name`
- `event_time`
- `rollout_variant` (reuse booking-v2 vocabulary where applicable)

Required interpretation rules:
- If `source_channel` is not `line` (or missing), sample cannot be used as positive gate evidence.
- If correlation/transaction identifiers are missing in critical-path samples, decision defaults to **HOLD**.
- Unknown bucket must be measured and reported; unknown is never silently treated as healthy.

---

## 5) Data Quality Gate (Explicit HOLD Behavior)

Any of the following forces **HOLD**:
1. `source_channel` missing/unknown for decision-critical records.
2. `source_channel` not aligned to `line` for LINE / LIFF scoped checkpoint.
3. Correlation or transaction identifiers absent for material critical-path samples.
4. Unknown dimension rate above agreed tolerance and no mitigation note.
5. Dependency status uncertainty on #178/#179/#180/#184 that invalidates interpretation.

Minimum HOLD note format:
- Trigger condition
- Affected checkpoint stage
- Immediate containment action
- Owner + ETA for re-evaluation

---

## 6) Dependency Mapping (Required references)

- **#178**: dependency for readiness context; must be reviewed before GO recommendation.
- **#179**: dependency for readiness context; unresolved ambiguity can force HOLD.
- **#180**: dependency for readiness context; unresolved data path can force HOLD.
- **#184**: remains the execution/implementation partner slice; this #181 artifact defines gate criteria and does not replace it.

---

## 7) Rollback / Risks / Review Use

### Rollback posture
- Docs-level rollback: revert this artifact and index links.
- Operational rollback posture: keep rollback owner and trigger conditions attached to each checkpoint packet.

### Risks
- Overclaiming telemetry readiness before full instrumentation is complete.
- Misclassification if `source_channel` is inconsistent or absent.
- False confidence when unknown dimensions are silently ignored.
- Dependency drift across #178/#179/#180/#184 leading to invalid gate conclusions.

### Direct readiness review usage
This artifact is intended to be used directly in readiness review meetings as:
1. stage checklist,
2. decision semantic reference,
3. data-quality HOLD policy,
4. dependency sanity checklist.

---

## 8) Acceptance Checklist (Issue #181)

- [x] Repo docs artifact exists for LINE / LIFF go/no-go metrics readiness (#181).
- [x] Staged rollout checkpoints are explicitly defined.
- [x] GO / HOLD / ROLLBACK WATCH have operational meaning.
- [x] Required fields include `source_channel` and correlation/transaction identifiers.
- [x] `source_channel=line` alignment is mandatory.
- [x] Data-quality gate is explicit; missing/unknown dimensions can force HOLD.
- [x] Dependencies #178 / #179 / #180 / #184 are called out.
- [x] No unsupported production / SLA guarantees.
- [x] Artifact is directly usable for readiness review.
