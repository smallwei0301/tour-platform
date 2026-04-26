# Issue #217 — Option-B Plan Linkage Decision (Non-FK Slice)

## Decision (explicit)
`activity_availability_daily.plan_id` **不建立 FK**。它維持為 snapshot 層的語意 key（`text`），來源語義對齊 `activity_schedules.plan_id`。

## Canonical model boundary
- Booking domain canonical plan entity: `activity_plans.id` (`uuid`)
- Availability snapshot semantic key: `activity_availability_daily.plan_id` (`text`, nullable)
- 本議題範圍內不把兩者強行合併，也不新增 `activity_availability_daily.plan_id -> activity_plans.id` FK。

## Rationale
1. 目前資料語義已顯示 snapshot `plan_id` 是排程聚合鍵，不是 booking UUID FK。
2. 直接加 FK 需要 deterministic text->uuid mapping 與回補策略，超出本次 bounded slice。
3. 先補齊 guardrails（cardinality/null/mismatch/refresh safety）可快速降低風險，且可重跑。

## What is implemented in this slice
1. **Rerunnable SQL prechecks / guardrails**
   - `supabase/scripts/phase12/issue-217-plan-linkage-guardrails.sql`
   - 檢查：
     - 欄位型別事實（snapshot text vs canonical uuid）
     - snapshot / schedules 的 cardinality、null、blank
     - semantic key set mismatch（雙向）
     - optional diagnostic: snapshot `plan_id` 對 `activity_plans.slug` 映射覆蓋率（僅診斷）
2. **Refresh safety verification**
   - SQL pack 內確認 `fn_refresh_activity_availability_daily(uuid,date,date)` 存在
   - 用 transaction + `ROLLBACK` 執行 refresh probe，驗證函式可執行且避免持久副作用
3. **Executable wrapper**
   - `scripts/phase12/run-issue-217-plan-linkage-guardrails.sh`
   - 產出報告到 `reports/issue-217/<timestamp>/`

## Rollback
本 slice 沒有 schema mutation；若要回退，移除 guardrail SQL + wrapper script 即可。

## Observability / artifacts
- 主要輸出：
  - `reports/issue-217/<ts>/issue-217-plan-linkage-guardrails-output.txt`
  - `reports/issue-217/<ts>/summary.md`
- 關鍵指標：
  - `snapshot_plan_ids_not_in_schedules`
  - `schedule_plan_ids_not_in_snapshot`
  - `snapshot_plan_id_without_activity_plans_slug_match_count`
  - `issue_217_guardrail_pack_completed`

## Deferred (explicitly out of scope)
- `activity_availability_daily` 新增 `activity_plan_id uuid`
- text->uuid deterministic backfill + dual-write migration
- FK enforcement from snapshot to canonical booking plan table
