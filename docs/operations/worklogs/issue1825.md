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

## S2 里程碑（canonical-first list/API entry + publish-result mapping）
- 2026-08-13：新增唯一 `midao_materialize_legacy_service_draft` RPC gateway；materialization flag 預設關閉，且 production 永遠關閉。
- canonical service list 僅在 local/test flag 開啟時，針對呼叫導遊自己 `status='published'`、無 active draft、無 publication version 的活動先 ensure；後續仍使用原 canonical 組裝/filter。
- draft GET 在同一所有權邊界下對相同 eligibility 做 ensure，RPC 失敗回明確 500，不會回傳 null/blank draft；publish gateway 將 `LEGACY_PLAN_LIFECYCLE_UNRESOLVED` 映射為非成功 409。
- focused Node tests：95/95 passed；`run-checks.sh` targeted 64/64 + typecheck passed。

## S2b 里程碑（draft GET provenance 投影）
- 2026-08-13：`guide_service_drafts` 的既有 `materialization_origin`／`materialization_review_state` 已沿 GET 讀取鏈（select → Supabase row mapping → draft view → 原有 route envelope）投影為 `materializationOrigin`／`materializationReviewState`。
- 無 provenance 的既有 in-memory／測試資料維持向後相容：回傳 `materializationOrigin: 'native'` 與 `materializationReviewState: null`；未變更任何 materializer、publish、CAS 或 route envelope 寫入邏輯。
- TDD 證據：新增 GET legacy/native provenance 測試先於實作確認 RED（legacy origin 實際為 `undefined`），實作後目標測試 GREEN，待固定焦點套件與 commit gate 完成後交 Rita 獨立審查。

## S3 里程碑（editor disclosure/type contract）
- 2026-08-13：前端 draft client 以既有 `materializationOrigin`／`materializationReviewState` 型別化回應，未解析或信任任何 raw legacy overlay；legacy literal 已依 S1 migration 確認為 `legacy_activity`。
- 編輯既有活動時，GET 未回傳有效 draft 會進入阻擋錯誤畫面，提供重試與返回服務列表，不會將 `null` 合併成可編輯的空白表單或觸發 autosave；新服務與既有 native draft 維持原流程。
- legacy 草稿明示只帶入既有文字、圖片不在此替換或編輯、既有方案／檔期不變，且在 lifecycle 決策前停用發布；`needs_review` 另顯示未安全套用的通知。server-side 409 gate 仍是唯一權威。
- TDD 證據：新的 focused UI contract test 已先 RED（4/4 failed）、實作後 GREEN（4/4 passed）。窄 Playwright 已啟動受控 local server，但 guide auth fixture lookup 回 `401 INVALID_CREDENTIALS`，未將其宣稱為 browser pass；E2E spec 仍採既有 canonical guide login helper，待 prepared fixture 環境驗證。
