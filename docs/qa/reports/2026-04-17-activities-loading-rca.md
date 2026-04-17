# RCA Report — /activities stuck at "載入中⋯"

- Date: 2026-04-17
- Scope: `GET /api/activities` and activities listing page
- Environment: production (`tour-platform-nine.vercel.app`) + local repro (`localhost:3005`)

## 1) Symptom
`/activities` page displayed:
- "全台灣 0 個私人導遊行程"
- persistent "載入中⋯"

## 2) Root Cause
Not DB join latency.

Vercel runtime logs show repeated serverless errors for `/api/activities`:

- `You cannot use different slug names for the same dynamic path ('activityId' !== 'id')`
- response status: `504`
- accompanied by `INTERNAL_FUNCTION_INVOCATION_TIMEOUT`

This causes frontend fetch to fail/close and stay in loading UX.

## 3) Why this happened
Repo had duplicate dynamic route trees under the same path depth:

- `app/api/v2/admin/activities/[activityId]/plans/...`
- `app/api/v2/admin/activities/[id]/plans/...`

Next.js app router rejects mixed slug names for same dynamic segment and can break route initialization.

## 4) Fix Applied
1. Remove duplicate conflicting route tree:
   - deleted `app/api/v2/admin/activities/[id]/plans/**`
   - kept canonical `app/api/v2/admin/activities/[activityId]/plans/**`
2. Add request-id observability in `app/api/activities/route.ts`:
   - generate `x-request-id`
   - structured error log includes `requestId`, elapsed time, query params, message
   - response error body includes requestId for correlation

## 5) Validation
- `npm test`: PASS (135/135)
- `next build`: PASS
- local API smoke:
  - `GET http://localhost:3005/api/activities` returns `ok:true` with data

## 6) Step-4 Decision (simplified query fallback)
Not applied.
Reason: logs prove failure occurs before SQL query execution (router init conflict), so DB query simplification is not the primary fix.

## 7) Lesson Learned
Manual testing must include all three layers before concluding PASS:
1. UI render check (not only HTML 200)
2. browser console + network request status
3. backend function logs (Vercel) for route initialization/runtime errors

Added operational rule:
- Any "載入中⋯" stuck issue is NOT PASS until API request status + server log checks are both clean.
