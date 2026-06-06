# Post-merge QA — late-wave PRs after #1236 cutoff — 2026-06-05

**Issue:** #1260 — [QA] Verify late 2026-06-05 merged PRs after #1236 cutoff
**Companion fix:** #1261 — Align Booking V2 payment-method UI with checkout provider contract (remediated in this same branch)
**Author:** AI agent (Claude Code)
**Branch:** `claude/post-merge-qa-verification-kgspK`
**Date / time:** 2026-06-05 22:0x Asia/Taipei (CST)

---

## 1. Environment & deploy coverage

| Item | Value |
|------|-------|
| Production URL | `https://tour-platform-nine.vercel.app` |
| Production deploy SHA | `0b0845bb2ec111149a70d791fc2df2c8b2381a25` (`/api/health` → `version`) |
| Branch HEAD under test | `0b0845b` (identical to production) |
| `origin/main` at audit | `0b0845b` (one commit past the #1260 audit SHA `0dabbf9`, adds the readiness snapshot) |
| Includes #1240–#1255 + #1259? | **YES** — verified by `git log`; all late-wave commits present |

**Conclusion:** production is running the exact commit that contains the full late-wave PR set, so live smokes below are production-equivalent.

Late-wave commits confirmed in the deployed history:

| Commit | PR / Issue | Area |
|--------|-----------|------|
| `4c5c03a` | #1240 (refs #1106) | post-trip payout-eligibility helper |
| `2c706a5` | #1241 (closes #1239) | Booking V2 empty/inactive seasons → fail-open |
| `a90fbbc` | #1242 (closes #1221) | settlement payout hold via `isPayoutOnHold` |
| `7117dfb` / `79defbc` | #1243 / #1253 (closes #1238) | Admin seasons actionable error mapping + missing `name` column |
| `2a635a5` | #1244 (closes #1213) | Admin schedule modal plan-derived fields |
| `e5326e1` | #1245 / #1250 (closes #1212) | canonical zh-TW reason copy wiring |
| `e82d90b` | #1246 | public Booking V2 entry URL recovery |
| `cdde4d8` | #1247 (closes #1233) | ESLint config regression guard |
| (in #1248 cluster) | #1248 | Booking V2 zh-TW `messageZh` inactive/missing plan |
| `dff1854` / `d86f092` | #1251 / #1252 (closes #1249) | public activities Cache-Control / SSR / lazy prefetch |
| (docs) | #1255 | current issue priority routing docs |
| `0dabbf9` | #1259 (refs #1254) | Admin post-trip summary API split-query recovery |

---

## 2. Build/lint/test gates

| Gate | Local (sandbox) | CI on `main` |
|------|-----------------|--------------|
| `npm run lint` | **PASS** (exit 0) | PASS (all late-wave SHAs green) |
| `npm run typecheck` | **PASS** (exit 0) | PASS |
| Targeted QA-area suites (11 files) | **PASS** — 104/104 | PASS |
| Full `npm test` | 2649/2669 pass — **19 env-only failures** (see Finding F1) | **PASS** (all late-wave SHAs green) |
| `npm run build` + preflight | NOT_RUN locally (requires production secrets; CI injects them) | PASS |

CI evidence (GitHub Actions `ci.yml`, branch `main`): every late-wave commit
(`fa80f90`, `0dabbf9`, `50f84d4`, `d86f092`, `79defbc`, `dff1854`, `cdde4d8`,
`e5326e1`, …) shows `conclusion: success`.

---

## 3. Per-area verification

### A. Traveler Booking V2 — PASS
- **#1246 entry recovery:** `GET /booking/test-activity` → **HTTP 200** (no entry-URL regression).
- **#1248 zh-TW plan errors / #1241 seasons fail-open / #1245+#1250 reason copy:** contract suites green —
  `issue839-availability-v2-no-slots-fallback`, `issue1212-canonical-reason-copy`,
  `issue1212-cross-surface-reason-wiring`. Fail-open applies to empty/inactive seasons only; conflict-blocked
  slots remain blocked (covered by availability precedence suites).
- **Note:** the actual user-facing Step 3 payment mismatch is tracked & fixed as #1261 (Section 5).

### B. Admin Booking V2 seasons / schedule — PASS
- **#1243/#1253 actionable errors + `name` column:** `issue1238-activity-plan-seasons-error-mapping` green —
  generic `Failed to create season` is replaced with mapped Supabase/PGRST204 errors; missing-schema cases
  surface actionable messages, not silent success.
- **#1244 schedule modal plan-derived defaults:** covered by `issue1067-activity-plan-seasons-admin-api`
  and the schedule-modal seeding logic (duration → endHH, base_price echo).

### C. Post-trip / payout / settlement — PASS
- **#1259 post-trip summary split-query:** `GET /api/admin/post-trip/summary` (unauthenticated) →
  **HTTP 401** — protected auth failure, **not** PGRST200/500 from the old `guide_trip_reports` embed.
  Suites `issue1254-post-trip-summary-split-query` + `issue1254-post-trip-summary-helper` green.
- **#1240 / #1242 payout hold + eligibility:** `issue1221-settlement-payout-hold` and
  `issue1106-payout-eligibility-helpers` green. Verified with fixtures only — **no real payout mutated.**

### D. Public activities performance / cache — PASS (with note)
- **#1251 Cache-Control:** `GET /api/activities` → **HTTP 200**, `x-vercel-cache: MISS` (edge layer engaged),
  client `cache-control: public`. The route source emits
  `public, s-maxage=60, stale-while-revalidate=300` (`src/lib/public-cache-headers.mjs`) and only on the
  success path (error path stays uncached); `issue1249-public-activities-cache-headers` green. The Vercel
  edge consumes the `s-maxage`/`swr` directives and normalises the client-facing header to `public` — expected
  platform behavior, not a regression.
- **#1252 SSR / region pages:** `GET /activities/taipei` → **HTTP 200**; `activities-region-ssr-contract` green.
  Listing filters intact. (See Finding F2 for an unrelated data-hygiene observation.)

### E. Tooling / docs — PASS
- **#1247 ESLint guard:** local `npm run lint` exit 0 and CI green confirm the circular-config regression
  stays fixed.
- **#1255 routing docs:** current-issue priority docs point at open issues only.

---

## 4. Findings

| ID | Severity | Status | Summary |
|----|----------|--------|---------|
| F1 | P3 (infra) | Open, **not a release blocker** | Local sandbox full-suite shows 19 failures in `csrf-route-scope`, schema-drift/RLS preflight, email-contract, and `issue502` SSR-timeout tests — all `ERR_MODULE_NOT_FOUND: Cannot find package 'next'` from spawned `[eval1]` child processes. **Reproduces identically on a clean `main` tree (0/7 pass on the same files with my changes stashed)** and **CI on `main` is green**, so this is a sandbox module-resolution artifact, not a late-wave regression. Recommend a follow-up to make those child-process specs resolve `next` from the hoisted root `node_modules` (or skip when unresolved) so local `npm test` matches CI. |
| F2 | P3 (data hygiene) | Observation | Production `/api/activities` returns a `TEST ONLY - guide booking dialog` QA fixture (`slug: qa-guide-dialog-fixture-1054`) in the public listing. Pre-existing and outside the late-wave scope, but worth unpublishing test fixtures before public launch. |
| F3 | P2 | **FIXED in this branch** | Booking V2 Step 3 advertised LINE Pay / ATM as selectable, but checkout is ECPay-only (#1261). See Section 5. |

No regression attributable to the #1240–#1259 late-wave PRs was found.

---

## 5. #1261 remediation (shipped with this QA)

**Problem:** `apps/web/app/booking/[activityId]/page.tsx` Step 3 rendered selectable
`LINE Pay` and `ATM 虛擬帳號` radio options, but `handleV2Checkout()` always posts
`{ provider: 'ecpay' }` and `/api/v2/bookings/[bookingId]/checkout` (`VALID_PROVIDERS = ['ecpay']`)
only supports ECPay. The selection was ignored → misleading during soft launch.

**Fix:** removed the LINE Pay / ATM radios (in both the V2-primary Step 3 and the legacy-fallback
render inside `BookingInnerV2FlagShell`), replaced with non-selectable copy:
> 確認後將前往 ECPay 安全付款頁，實際可用付款方式以付款頁顯示為準。

The ECPay-hosted page (`ChoosePayment: 'ALL'`) still offers credit card / ATM etc.; the UI no longer
implies an honored in-app method choice.

**Coverage:**
- New source-contract test `tests/ui/issue1261-payment-method-ecpay-contract.test.mjs` (RED→GREEN) —
  asserts no `name="payment"` radios / LINE Pay / ATM remain, the ECPay hand-off copy is present,
  checkout still posts `provider: 'ecpay'`, and the API still accepts only `ecpay`.
- Updated `tests/ui/booking-page-shell-flag.test.mjs` — dropped the now-removed `LINE Pay` / `ATM 虛擬帳號`
  presentation markers, added a regression guard that no selectable payment radios reappear.
- Browser E2E for Step 3 is `NOT_AUTOMATABLE` here (reaching Step 3 needs resolved availability + a created
  draft booking against live V2 APIs); the source-contract test enforces the visible-copy guarantee.
- 12/12 UI tests green.

---

## 6. Verdict

**Late-wave PRs (#1240–#1259): PASS — release-safe pending Wei sign-off.**
All five QA surfaces (Booking V2, Admin seasons, settlement/payout, post-trip API, activities perf)
verified via green contract suites + read-only production smokes; CI on `main` is green for every
late-wave commit; the one user-visible gap (#1261) is fixed in this branch.

**Operator sign-off still required for:** live ECPay payment/refund/payout smoke (real-credential,
human-only — intentionally not exercised here per the no-real-mutation guardrail).

No secrets, tokens, credentials, service-role keys, full payment payloads, full order IDs, or
unredacted PII appear in this report.
