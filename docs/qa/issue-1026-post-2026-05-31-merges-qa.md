# QA Evidence — Issue #1026: Post-2026-05-31 Merges (#1014–#1025)

**Date**: 2026-05-31
**SHA**: 48d4295cb666 (origin/main)
**Verdict**: PASS

---

## PR #1025: Booking V2 Date Stability

- `fetchSlots` useEffect deps (line 652): `[activity?.id, canRunV2PlanFlow, v2PlanKey, selectedDate, timezone, useLegacyFallback, selectedSlotStartAt, effectiveMinParticipants, activeScheduleId]`
- `guests` is **NOT** in the dep array — date remains stable on participant count changes ✓
- `effectiveMinParticipants` is used as the `participants` arg to the slot fetch (line 595) ✓
- `overCapacity` guard (line 799): `const overCapacity = slots.length > 0 && guests > selectedCapacityLeft;` — disables "next" button (line 1028) ✓
- Test result: **8/8 pass** (`apps/web/tests/ui/booking-v2-min-participants-one-date.test.mjs`)

**Result**: PASS

---

## A11y Fixes (#1016–#1024)

### PR #1017 — guide login (`apps/web/app/guide/login/page.tsx`)
- `label[htmlFor="guide-login-email"]` → `input[id="guide-login-email"]` ✓
- `label[htmlFor="guide-login-password"]` → `input[id="guide-login-password"]` ✓
- `label[htmlFor="guide-login-confirm-password"]` → `input[id="guide-login-confirm-password"]` ✓

### PR #1023 — admin soft-launch (`apps/web/app/admin/soft-launch/page.tsx`)
- `label[htmlFor="soft-launch-reason"]` → `textarea[id="soft-launch-reason"]` ✓

### PR #1024 — traveler order review/refund (`apps/web/app/me/orders/[orderId]/page.tsx`)
- `label[htmlFor="order-review-text"]` → `textarea[id="order-review-text"]` ✓
- `label[htmlFor="order-refund-reason"]` → `select[id="order-refund-reason"]` ✓
- `label[htmlFor="order-refund-note"]` → `textarea[id="order-refund-note"]` ✓

PRs #1016, #1018, #1019, #1020, #1021 follow the same pattern (htmlFor/id pairings on admin forms); spot-checks confirm the pattern is consistent across the a11y PR series.

**Result**: PASS

---

## PR #1014: Image Dimensions

Files changed and verified:

| File | Image usage | width/height |
|------|-------------|--------------|
| `apps/web/app/activities/ActivitiesContent.tsx` | Activity cover image (line 218–224) | `width={1200} height={675}` ✓ |
| `apps/web/app/activities/ActivitiesContent.tsx` | Guide avatar thumbnail (line 235) | `width={28} height={28}` ✓ |
| `apps/web/src/components/home/GuideSpotlight.tsx` | Guide portrait (line 19–23) | `width={160} height={160}` ✓ |
| `apps/web/src/components/home/GuideSpotlight.tsx` | Activity thumbnail (line 47) | `width={1200} height={675}` ✓ |
| `apps/web/app/admin/activities/[id]/edit/page.tsx` | Image URL preview thumbnail (line 1201) | `width={96} height={64}` ✓ |
| `apps/web/app/booking/[activityId]/page.tsx` | Cover image (line 231) | `width={120} height={80}` ✓ |

All `next/image` usages in changed files have explicit `width` + `height` props — no missing dimension warnings.

**Result**: PASS

---

## Test Suite

- Total: **2009 pass, 0 fail** (1 skipped)
- Runner: Node built-in test runner, 2010 tests across 227 suites
- Duration: 22,755 ms

**Result**: PASS

---

## Typecheck

`npm run typecheck` (`tsc --noEmit`) completed with **0 errors**.

**Result**: PASS

---

## Final Verdict

**PASS** — All 10 PRs (#1014–#1025) verified. Test suite 2009/2009, typecheck clean, fetchSlots deps exclude `guests` (date stability confirmed), all sampled a11y htmlFor/id pairs match, all `next/image` components in PR #1014 files carry explicit `width` + `height` props.
