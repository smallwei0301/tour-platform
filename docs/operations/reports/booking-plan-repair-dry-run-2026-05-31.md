# 訂位方案修復稽核報告（DRY_RUN）
**稽核日期：** 2026-05-31
**模式：** DRY_RUN（唯讀，不修改任何資料）
**Issue：** #893 refs #883

## 摘要

| 分類 | 數量 |
|------|------|
| OK | 8 |
| NEEDS_HUMAN_REVIEW | 1 |
| TEST_FIXTURE | 4 |
| **合計** | **13** |

## 需要處理的項目（1 筆）

| Activity Slug | Plan Key | 問題分類 | 說明 |
|--------------|----------|---------|------|
| activity-1780038051379 | full-day-complete | NEEDS_HUMAN_REVIEW | price public=3000 formal=19 |

## 說明

- **OK** — 正常，formal plan 存在且狀態為 active，無容量或欄位異常
- **MISSING_FORMAL_PLAN** — activity.plans 中的方案 ID/slug 在 activity_plans 表找不到對應記錄
- **INACTIVE_FORMAL_PLAN** — 找到對應記錄但 status != 'active'
- **CAPACITY_MISMATCH** — schedule.capacity > plan.max_participants
- **NEEDS_HUMAN_REVIEW** — price/duration/maxParticipants 在 public 與 formal 之間不一致，需人工確認
- **TEST_FIXTURE** — activity slug 包含 e2e/playwright/test，略過

## 後續行動

若需執行修復，請參閱 issue #883 APPLY 流程，並取得 Wei/Rita 核准後再執行 APPLY 模式。
APPLY 模式目前為 **hard exit(1) stub**，不會寫入任何資料。
