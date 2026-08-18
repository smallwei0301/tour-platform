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

## 2026-08-17 — production materialization feature flag（方案 B）
- 將 legacy draft materialization 由 production hard-disabled 改為 server-only master gate + strict UUID guide allowlist；缺失、空白、含 malformed token 或未包含 caller 的 allowlist 一律 fail-closed，且不會發出 materialization RPC。
- resolver 以已 normalize 的 guideId 計算 production default，保留顯式 `materializationEnabled` DI override；GET route 以 canonical session guideId 在 eligibility query 前做同一 scoped gate。關閉 master gate 時只停止新的 materialization，既有 legacy-origin draft 維持原有讀取結果。
- TDD：resolver/feature-flag RED（7 tests 內 2 failed）→ GREEN 7/7；GET route RED（21 tests 內 1 failed）→ GREEN 21/21。正式 gate：`NODE_OPTIONS='--max-old-space-size=1024' .claude/hooks/run-checks.sh apps/web/tests/api/midao-legacy-draft-materialization.test.mjs apps/web/tests/api/midao-service-drafts.test.mjs apps/web/tests/api/midao-services-list.test.mjs --typecheck`，42/42 pass + typecheck pass。
- Worktree 缺 dev dependencies 時，依 integrity procedure 以隔離 HOME/npmrc 執行 `npm ci --include=dev --ignore-scripts --no-audit --no-fund`；package.json、package-lock.json、yarn.lock SHA-256 均在前後一致，未變更 lockfile。

## 2026-08-18 — admin plan 非 v4 UUID validator 規格（t_069ed17b）
- 目標限定為 native activity 的 admin plans page flow：collection list/create、single plan GET/PUT/DELETE 與同頁 seasons 子路徑；不重做既有 legacy draft materialization／data backfill。
- source inventory：collection route 與 single-item route 各自有 RFC v1–v5／variant 限制 regex；`src/lib/activity-plan-seasons.ts` 的 `isUuid()` 同樣 strict，會讓 plans page 的 seasons panel 對相同 non-v4 `activityId` 留下 400 dead end。
- 已確認相鄰 schedules/readiness route 已採 structural 8-4-4-4-12 regex；publication-versions、restore-publication 維持 strict pattern，因屬獨立高風險 publication recovery，明確排除於本次變更。
- 可執行規格：`docs/plans/2026-08-18-issue1825-admin-plan-non-v4-uuid-validator.md`。要求先 RED 新增 issue1825 regression contract test，再只改三個 plans-flow validator；GREEN 後以 run-checks + typecheck 驗證，最後交 Rita fresh independent review。
- 規格 commit：`2de8c3fd0642d69e1320ec3dd3669a6c9ce03d95`（後續 amend 以最終 SHA 為準）。`git diff --check` 已通過；既有 admin safety + plan revalidation tests 為 13/13 pass。此 planner worktree 僅有 Node 24.14.0、未找到 Node 22 runtime，因此這是文件/既有測試的輔助證據，非 implementation 的 Node 22 acceptance 替代；builder 仍須依計畫在 Node 22 重跑 run-checks + typecheck。

## 下一步（更新）
- 交 `tp-builder-api` 依 `docs/plans/2026-08-18-issue1825-admin-plan-non-v4-uuid-validator.md` 在專屬乾淨 worktree 實作；完成後由 `tp-reviewer`／Rita 以 immutable commit range 重跑指定 checks。

## 2026-08-18 — admin plan 非 v4 UUID validator 實作（t_1acfd2ad）
- TDD RED：新增 `issue1825-admin-plan-non-v4-uuid-validator.test.mjs` 後，`node --test tests/api/issue1825-admin-plan-non-v4-uuid-validator.test.mjs` 實測 4/6 pass、2/6 fail；失敗明確指出 collection route 拒絕 native structural UUID，且仍保留 RFC version／variant 限制。
- 最小 GREEN：只將 collection plans route、single-plan route 與 `activity-plan-seasons.ts` 的既有 `UUID_REGEX` 改為 structural 8-4-4-4-12 hexadecimal pattern；auth、CSRF、pre-DB guards、ownership query、revalidation 與 publication recovery 均未改。
- GREEN：同一 regression test 實測 6/6 pass；包含 native sample acceptance、non-hex rejection、collection GET／single GET/PUT pre-DB gate、seasons `isUuid` continuity 與 publication recovery strict policy guard。
- 正式 gate：以 `npx --package=node@22` 提供的 Node v22.23.2 執行 `NODE_OPTIONS='--max-old-space-size=1024' .claude/hooks/run-checks.sh apps/web/tests/api/issue1825-admin-plan-non-v4-uuid-validator.test.mjs apps/web/tests/api/issue862-admin-v2-plan-crud-auth.test.mjs apps/web/tests/api/plan-write-revalidates-activity.test.mjs --typecheck`，19/19 pass 且 `tsc --noEmit` pass，exit 0。
- 依賴 bootstrap：隔離 HOME/npmrc 下 `npm ci --include=dev --ignore-scripts --no-audit --no-fund` exit 0（661 packages）；`package.json`、`apps/web/package.json`、`package-lock.json`、`yarn.lock` SHA-256 前後相同，並確認 `tsc`、`pngjs`、`pixelmatch`、`@types/react-dom` 可用。
- 待完成：diff hygiene、單一 commit 與 Rita independent review。

## 絕不重做（新增）
- t_71104d93 已完成的 native activity rich plan 資料補齊及其 production/read-only 驗證，不是本 validator 規格的範圍。
- t_08d99b02／t_ddb1449b 的 legacy_activity materialization、atomic batch RPC 與 plan snapshot 規格，與 native admin direct-edit UUID gate 分離，不得混入此 implementation commit。

## 2026-08-18 — 導遊「我的服務」非 v4 UUID／native fallback 規格（t_b610c3b5）
- 新規格：`docs/plans/2026-08-18-issue1825-guide-service-list-structural-uuid.md`；本輪只讀規劃、未改產品碼/production 資料/migration/feature flag。
- source 證實第一層 root cause：`service-list-resolver.ts` 的 strict RFC UUID regex 會在 `resolveInSupabase()` 將 `c0000003-...-0001/2/3` filter 掉；即使改成 structural UUID，現行 `buildItem()` 在無 active draft 與 publication version 時仍排除，因此只改 regex 不足。
- source 亦證實 card 前提衝突：現行 materialization loop 對 published + no-draft/version 會呼叫 legacy RPC，但 migration 將新 draft 的 `materialization_origin` 硬編碼為 `legacy_activity`；origin 只存在 draft table，而題述三筆沒有 draft，resolver 無 native discriminator。不得把開 flag 當作 native 修復。
- 建議 owner 選擇 canonical `activities.status='published'` fallback（零寫入、保留 publishedVersion=null）並禁止用 legacy materializer 處理 native activity；若堅持 no-draft/version 不列出，需另由 owner 指定可靠 native-vs-legacy source discriminator，不能猜 proxy。
- UUID helper 決策：本卡不抽 shared helper；admin plan、resolver、feature gate/RPC/recovery 的 boundary policy 不同，先用精準 regression 固定行為，日後另卡處理具名 policy helper/inventory。

## 2026-08-18 — 導遊「我的服務」native fallback owner 決策（t_b610c3b5）
- 木村哥/Ava 已選擇方案 A：通過 guide ownership query 的 `activities.status='published'`，即使沒有 draft/version，也視為 canonical published service fallback 並出現在「我的服務」清單；價格繼續以 `activity_plans.base_price` 聚合，`publishedVersion` 固定為 `null`。
- 決策刻意禁止以 legacy materialization flag/RPC 處理三筆 native c-ID activity，故零 production 寫入、零 schema/data 變更，且不修改既有 `legacy_activity` 路徑、atomic RPC/snapshot 規格或 PR #1849 admin plans scope。
- UUID policy：本次不抽 shared helper；僅修正 resolver 的 structural UUID compatibility，保留各高風險 consumer 的獨立 policy。
- Builder 必須依 `docs/plans/2026-08-18-issue1825-guide-service-list-structural-uuid.md` 先 RED 後 GREEN，完成 immutable commit + focused run-checks/typecheck 後建立 Rita review card，交付 default guide「我的服務」UI path 的 browser evidence 或明確 `NOT_VERIFIED-live` blocker。

## 下一步（更新）
- 建立 `tp-builder-api` 專屬乾淨 worktree 施工卡；builder 完成後建立以 exact `base_sha..head_sha` 綁定的 `tp-reviewer`／Rita 獨立 review card。

## 2026-08-18 — 導遊「我的服務」native fallback 實作（t_dc903eb6）
- Owner 縮限決策：不採全域 `status='published'` fallback；在 resolver 以 `KNOWN_NATIVE_PUBLISHED_FALLBACK_ACTIVITY_IDS` 精準列出 `c0000003-...0001/2/3`。這三筆 `status='published'`、無 draft/version 的 native activity 顯示為 published，`publishedVersion` 保持 `null`，價格仍由 `activity_plans.base_price` 聚合。
- Structural UUID：resolver 的 format validator 改為 `8-4-4-4-12` hexadecimal；保留 trim/lowercase 與 malformed、suffix、non-UUID fail-closed。既有 v4/draft precedence 行為未變。
- Native 白名單在 materialization gate 為 true 時亦跳過 legacy materializer；白名單外 activity 維持既有 materialization 行為。無 production SQL/data/schema/migration/RPC 寫入。
- TDD RED：新增 Supabase parity regression 後執行 `cd apps/web && node --test tests/api/midao-services-list.test.mjs`，14/15 pass；新 assertion 實際為 `total: 0 !== 3`。
- GREEN：Node v22.23.2 執行 list 15/15、legacy materialization 7/7；正式 `NODE_OPTIONS='--max-old-space-size=1024' .claude/hooks/run-checks.sh apps/web/tests/api/midao-services-list.test.mjs apps/web/tests/api/midao-legacy-draft-materialization.test.mjs --typecheck` 為 22/22 pass + typecheck pass。
- UI：`NOT_VERIFIED-live`；本 worktree 沒有可安全重用、已驗證對應三筆 native c-ID 的 guide browser fixture，不能以 resolver/API tests 宣稱預設「我的服務」UI 已實測。交 Rita review 時保留此 blocker。
