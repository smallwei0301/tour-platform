# issue1825 — 受控 legacy draft 物化與 DB server guard（S1）
> 最後更新：2026-08-13 18:15 CST｜負責 session：tp-builder-api / 2026-08-13

## 目標
以一個前向 migration 將 legacy activity 安全物化為可編輯草稿，並在發布 RPC 阻擋其觸及 canonical plans。

## AC 清單
- [ ] legacy materializer 僅建立或重用一筆 active draft，且不寫 canonical activity、images、plans、versions 或 outbox。
- [ ] pending_changes 僅接受 title/description 的全有或全無白名單 overlay；無效 overlay 僅產生 base payload 與 needs_review provenance。
- [ ] materialized legacy draft 的發布 RPC 回傳 LEGACY_PLAN_LIFECYCLE_UNRESOLVED 且零 canonical side effects。
- [ ] local PostgreSQL integration proof、靜態 migration contract、typecheck evidence 已實跑。
- [ ] 一個 S1 commit 且由 Rita 獨立審查。

## 已完成（附證據）
- 2026-08-13 已確認 worktree base/head 為 d5d49be4a331144d7ab04bd518ffe8c6ea3b57bb，branch 為 issue-1825-s1-materializer-802e3899-d5d49be4，開工時 tree clean。

## 下一步
- 先新增 focused static 與 local PostgreSQL integration RED tests，記錄缺少 migration/function 的預期失敗，再實作最小 migration。

## 絕不重做（Do-NOT-redo）
- 不改任何歷史 migration、S2/S3 consumer/UI 檔案或 production state；本 S1 只允許新增指定 migration/tests 與本 worklog。

## P0-OVERRIDE 使用紀錄（如有）
- 無。
