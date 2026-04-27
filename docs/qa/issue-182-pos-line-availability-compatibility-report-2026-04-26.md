# Issue #182 — POS / LINE Entry Compatibility with Availability Snapshot+Refresh (Bounded Validation Slice)

- Date: 2026-04-26 (Asia/Taipei)
- Scope type: **bounded validation-and-evidence slice** (no feature expansion)
- Repo: `smallwei0301/tour-platform`
- Issue: #182

## 1) Scope and non-scope

### In-scope (this artifact validates)
1. Admin POS and LINE shared draft contract compatibility.
2. Admin POS manual payment preserves availability snapshot refresh integration path.
3. Evidence is reviewable with commands, test outputs, and code truth anchors.

### Out-of-scope (explicit)
- No new LINE implementation.
- No parent #15/#16 full scope completion.
- No full E2E / live certification.

---

## 2) Validation commands and results

Run context: `apps/web` directory.

```bash
node --test \
  tests/api/v2-admin-pos-line-regression.test.mjs \
  tests/api/v2-admin-pos-manual-payment-regression.test.mjs \
  tests/ui/activity-availability-intent.test.mjs
```

Observed result (verbatim summary):
- `1..8`
- `# pass 8`
- `# fail 0`

Validated tests:
1. `route contract keeps web/line/admin_pos channels (regression guard)` ✅
2. `Admin POS draft flow keeps create-order envelope shape` ✅
3. `LINE draft flow regression stays mockable without real LINE API` ✅
4. `admin POS manual payment route exists and writes shared primitives only` ✅
5. `manual payment route keeps availability refresh integration through admin order update path` ✅
6. `activity date-plan UI does not trigger mount-time live availability fetch` ✅
7. `live availability refresh is only wired to high-intent actions` ✅
8. `checkout/payment callback still enforce strong-consistency conflict semantics` ✅

---

## 3) Code truth anchors

### A. POS + LINE shared draft contract

- Allowed channels include both POS/LINE:
  - `apps/web/app/api/v2/bookings/draft/route.ts:60`
- Validation gate for `sourceChannel`:
  - `apps/web/app/api/v2/bookings/draft/route.ts:125-137`
- Channel written into booking/order primitives (`source_channel`):
  - booking insert: `apps/web/app/api/v2/bookings/draft/route.ts:392`
  - order insert: `apps/web/app/api/v2/bookings/draft/route.ts:424`

### B. POS manual payment keeps snapshot refresh integration path

- Manual payment route updates order via shared admin update path:
  - `apps/web/app/api/v2/admin/pos/bookings/[bookingId]/manual-payment/route.ts:150-158`
- Shared admin update path triggers snapshot refresh by order:
  - refresh trigger call: `apps/web/src/lib/db.mjs:745`
  - refresh function: `apps/web/src/lib/db.mjs:45-60`
  - RPC anchor (`fn_refresh_activity_availability_daily`): `apps/web/src/lib/db.mjs:55`

### C. Availability refresh behavior remains intent-driven (not mount-driven)

- Intent refresh fetch function:
  - `apps/web/src/components/activity/DatePlanSection.tsx:164-179`
- Triggered by high-intent actions only:
  - date select: `apps/web/src/components/activity/DatePlanSection.tsx:198-201`
  - plan card select: `apps/web/src/components/activity/DatePlanSection.tsx:233-237`
  - primary plan CTA: `apps/web/src/components/activity/DatePlanSection.tsx:328-331`

### D. Conflict semantics for checkout/callback remain strict

- Checkout draft + pending-payment gates:
  - `apps/web/app/api/v2/bookings/[bookingId]/checkout/route.ts:118-126`
  - `apps/web/app/api/v2/bookings/[bookingId]/checkout/route.ts:145-153`
- Callback maps capacity/transition race to conflict class:
  - conflict mapping: `apps/web/app/api/payments/ecpay/callback/route.ts:74-81`
  - 409 -> `BOOKING_CONFLICT`: `apps/web/app/api/payments/ecpay/callback/route.ts:249-251`

---

## 4) Known lag / stale-data risks (truthful)

1. **Refresh is best-effort, not transactional-hard guarantee**
   - `tryRefreshAvailabilitySnapshotByOrderId` swallows refresh errors with warning and returns (`db.mjs:58-60`).
   - Impact: snapshot may remain stale temporarily after order mutation if RPC/network transient fails.

2. **UI intentional lazy-refresh means short stale window before user intent**
   - Availability fetch is intentionally deferred to high-intent actions, not mount (`DatePlanSection.tsx:164-179`, no mount `useEffect` fetch by design).
   - Impact: initial rendered schedule can be older than latest backend snapshot until first high-intent action.

3. **Bounded evidence is source-level + deterministic tests, not live infra certification**
   - This slice does not prove runtime correctness under real Supabase latency, callback retries, or production traffic concurrency.

---

## 5) Readiness verdict (for this bounded slice only)

**Verdict: READY_FOR_REVIEW (bounded slice)**

- Acceptance target (1): POS + LINE shared draft contract compatibility → **met**.
- Acceptance target (2): POS manual payment preserves snapshot refresh integration path → **met**.
- Acceptance target (3): single readiness-reviewable artifact with command/test/code anchors + risks → **met**.

### Not implied by this verdict
- Not a production go-live signoff.
- Not full E2E/live certification.
- Not parent scope completion.

---

## 6) Repro notes

- Execute command block in section 2 from `apps/web`.
- If run from repo root, file-path-based tests using `process.cwd()` may fail; use `apps/web` as cwd.
