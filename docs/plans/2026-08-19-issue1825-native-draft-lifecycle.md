# #1825 導遊既有 native activity：lazy draft 與統一發佈狀態規格

> 狀態：可交 `tp-builder-api` 實作；本文件為規劃，不包含產品碼或 production 操作。
>
> 基準：`e0a1803badb87a115e66db43394710f0f43eeaf8`
>
> 範圍：僅處理 `c0000003-0000-0000-0000-000000000001`、`...0002`、`...0003` 三筆已知 native activity 的「點編輯 404」與卡片上下狀態矛盾。

## 目標與決策

導遊在「我的服務」按下這三筆卡片的編輯動作時，前端必須先送出明確的 POST ensure；伺服器用 guide session + DB ownership 驗證後，在同一筆 DB transaction 建立或重用一筆 `materialization_origin='native'` 的 active draft，回傳實際 draft view，前端才導入既有 editor。GET 仍是純讀取，絕不因進入頁面而寫入。

這不是 legacy materialization 的替代入口：不呼叫 `midao_materialize_legacy_service_draft`，不寫 `activities`、`activity_plans`、`orders`、`bookings`、`service_publication_versions` 或 outbox，也不偽造 publication version。

發佈顯示的單一真相改為 resolver/API 層輸出的 `lifecycleState`：

| lifecycleState | 條件 | 卡片主標籤與次文案 |
|---|---|---|
| `draft` | 有 active draft，且沒有 version、也不是已知 native published bridge | 草稿；草稿第 N 版／尚未發布 |
| `published_versioned` | 有 publication version 且無 active draft | 已發布；發布第 N 版 |
| `published_unversioned` | 已知 native bridge activity 且 `activities.status='published'`、無 publication version；即使 POST ensure 已建立 native draft 仍保留此 published truth | 已發布；尚未版本化，草稿第 N 版（若有）／尚未版本化（若無） |
| `unpublished` | 沒有 active draft、沒有 version、且不是 native published bridge | 不列入服務清單 |

有 active draft 且已有 publication version 時，`lifecycleState='draft'`、`hasUnpublishedChanges=true`；卡片兩處同時從同一 state object 顯示「草稿」與「已發布第 N 版，尚有未發布變更」。不得由 `status` 與 `publishedVersion` 各自反推文案。

## 已確認現況與 root cause

1. `apps/web/app/api/v2/guide/service-drafts/route.ts:29,51-59` 的 `denyIfNotOwner()` 在真正 ownership query 前以 RFC v1–v5/variant regex 回 404，因此 version nibble 為 `0` 的 c-ID 永遠進不到 `assertActivityBelongsToGuide()`。
2. 相同 strict pattern 仍存在於 activity-scoped draft lifecycle：`db-midao-service-drafts.mjs:32,95-100`、detail discard route `.../[draftId]/route.ts:29,101-105`、publish route `.../commands/publish/route.ts:35,143-148` 與 `db-midao-service-publication.mjs:48,147-150`。只修 index route 會在後續讀取、存檔、discard 或正式重發佈再次失敗。
3. 現有 `GET /service-drafts` 在 `route.ts:132-145` 可因 feature flag 呼叫 legacy RPC；這違反「GET 無寫入」與 native source boundary，必須移除 native bridge candidate 的這個分支，而不能拿 flag 當修復。
4. 現有 generic `upsertServiceDraft()` 雖有 partial unique index 的 23505 conflict handling（`db-midao-service-drafts.mjs:401-447`），卻無法在單一 transaction 讀 canonical source、驗 ownership 並建立 native initial payload；也會把競態者回成 409，而非 ensure 所需的同一 draft 成功結果。因此不能單獨重用它作 ensure。
5. `ServiceWizard` 對既有 activity 在 `ServiceWizard.tsx:62-78,80-106` 只 GET draft，並將 `requireDraft=true`；目前 404／null 無法使 c-ID 進入可存檔 editor。`ServiceCard.tsx:17-35` 的直接 Link 必須改成 explicit ensure-and-navigate UI action。
6. `KNOWN_NATIVE_PUBLISHED_FALLBACK_ACTIVITY_IDS` 是 `service-list-resolver.ts:31-37` 的過渡相容橋樑；它不是 domain truth。它只可在本規格作為三筆已證實 native activity 的 temporary eligibility bridge，且不可擴張為任意 published activity 的隱性寫入資格。

## UUID / ownership 邊界

新增一個窄範圍、具名的 structural UUID helper，例如 `apps/web/src/lib/midao/structural-uuid.mjs`：只接受 trim 後的十六進位 `8-4-4-4-12` 字串、lowercase normalise、其餘回 null；不檢查 UUID version/variant。此 helper 只供本次 guide service-draft activity identity chain 使用。

必改 consumer：

- `service-drafts/route.ts`：`denyIfNotOwner()` 先 structural parse，再執行 `assertActivityBelongsToGuide()`；不存在與非本人仍一律 `NOT_FOUND` 404。
- `db-midao-service-drafts.mjs`：activity ID 正規化改用 helper，讓已驗證 owner 的 c-ID 可讀寫 active draft。
- `service-drafts/[draftId]/route.ts` 與 publish command route：路徑段實際是 activity ID，改用同一 helper，後續仍做 session + ownership + CSRF/mutations gate。
- `db-midao-service-publication.mjs`：activity ID parse 改用 helper，確保首次正式重發佈可走 versioned path。

不改 `feature-flags.mjs` 的 legacy allowlist、legacy materialization gateway、admin publication recovery、booking/payment/availability UUID contracts；它們分別是 rollout、legacy RPC、recovery 或其他資源型別的安全邊界。這次只集中「同一 service-draft activity identity」的重複實作，避免像全域 permissive helper 般外溢。

## POST ensure 契約

### HTTP

新增 `POST /api/v2/guide/service-drafts/ensure`，body 僅接受 `{ "activityId": "<structural UUID>" }`，成功回既有 envelope：`{ success: true, data: { draft } }`。`draft` 必須是實際 active native draft view，包含 activityId、guideId、revision、payload、`materializationOrigin: 'native'`、`materializationReviewState: null`。

順序固定：canonical guide session → CSRF → `MIDAO_BACKEND_MUTATIONS_ENABLED` → strict body shape → structural ID parse → guide ownership query → native eligibility → ensure RPC → response mapping。

錯誤合約：

- 非本人、不存在、非 bridge activity：`404 NOT_FOUND`，不洩漏存在性，零 draft 寫入。
- 缺 session / stale session / mode conflict：沿用 canonical session 的 401/403/409/503。
- CSRF：403；mutations disabled：503。
- malformed body/ID：422；不可合法轉成 native initial payload：422 `NATIVE_DRAFT_SOURCE_INVALID`，零 draft 寫入，前端維持錯誤頁而不開空白 editor。
- 未預期 RPC/DB 錯誤：500，`reportRouteError()` 不記錄 payload 或 session 資訊。

`GET /api/v2/guide/service-drafts` 保持 read-only：僅取得既有 active draft，不能呼叫 legacy materializer、native ensure 或其他 RPC。移除／隔離 `shouldMaterializeLegacyDraft()` 與 GET 的 `ensureLegacyServiceDraftMaterialized()` branch；既有 legacy materialization 僅能由其獨立既有 lane 的明確 command 處理，不能從 read path 偷跑。

### DB transaction 與 native payload

新增 forward-only migration（builder claim 時先依 migration README 與主線重新檢查 timestamp；不得改 `20260813085910_issue1825_legacy_midao_draft_materialization.sql`），建立 `public.midao_ensure_native_service_draft(p_activity_id uuid, p_guide_id uuid)`。

函式必須：

1. `SELECT ... FROM public.activities WHERE id=p_activity_id FOR UPDATE`，驗證 `guide_id=p_guide_id`、`status='published'`，並由函式內固定三筆 transition bridge eligibility；不接受 client 傳入 title、description、plans、origin 或 guide id。
2. 先鎖定／取得 active `guide_service_drafts`；存在即回 `REUSED` 與同一筆 active draft。不存在時只從 canonical native activity 可安全讀取的 title/description 建構 native editor initial payload：`name` 為 trim 後非空 title、`description` 與 `descriptions` 同步、`plans` 為 normal native editor 的單一空白 scheduled plan、`questions=[]`。title 不合法就回 `NATIVE_DRAFT_SOURCE_INVALID`，不得插入空白 draft。
3. 以 `INSERT ... ON CONFLICT (activity_id) WHERE status='active' DO ... RETURNING` 收斂併發，插入 `revision=1`、`status='active'`、`materialization_origin='native'`、review state null。活動列鎖與 partial unique index 必須保證重複／併發 ensure 都回同一 draft，不新增第二筆 active draft。
4. 不更新 canonical tables，不插入 `service_publication_versions`，不觸發 outbox；函式的唯一可見寫入是新的一筆 `guide_service_drafts` active row。

在 `src/lib/midao/` 新增對應 gateway（例如 `db-native-service-draft-ensure.mjs`）：只呼叫上述 RPC、驗證 reply shape，將 CREATED/REUSED 均映成同一 `ok: true` draft-result；未辨識的 SQL/RPC result 只能 throw backend error。不要把它偽裝成 legacy materializer 或復用 legacy origin/payload policy。

## UI 導流與單一狀態消費

1. `service-types.ts` 與 `service-list-resolver.ts` 的 `ServiceListItem` 加入 `lifecycleState`，保留 `draftRevision`、`publishedVersion`、`hasUnpublishedChanges` 作為該 state 的 metadata；`status` 可在同一 diff 移除或僅作相容 alias，但 UI 不得再讀它來推導不同文案。
2. `service-list-resolver.ts` 在純 `buildItem()` 決定 lifecycle state；不要在 activities query 加 status filter，以免排除一般 native active drafts。已知 bridge c-ID 只有在 `activities.status='published'` 且無 publication version 時產生 `published_unversioned`。正常 v4 item 的 draft precedence、pagination、price aggregation 不變。
3. `ServiceCard.tsx` 以一個 pure mapping（推薦 `getServiceLifecycleCopy(item)`）同時產生上方 pill、下方 metadata；`published_unversioned` 必須顯示「已發布」和「尚未版本化」，不得把 `publishedVersion: null` 翻成「尚未發布」。
4. `service-api.ts` 新增 `ensureNativeServiceDraft(activityId)`，使用 `prepareServiceMutations()` 取得 CSRF 後呼叫 explicit POST；`ServiceCard` 改為可存取的 button/action：click 或 Enter/Space 時 pending、POST 成功才 `router.push('/midao/services/<activityId>/edit')`，失敗在卡片旁顯示錯誤且不導頁。非 bridge / 一般 item 可保留既有 Link，或共用同一 action 僅於 API 404 停下；不得讓 GET page-effect 寫入。
5. `ServiceWizard` 的既有 activity load 只讀已 ensure 的 draft。ensure 成功後再導航；使用者直接貼 edit URL 而 draft 尚不存在，顯示既有 safe error/retry/返回清單，不做隱性建立。
6. 當這三筆完成 ensure 後，list state 仍為 `published_unversioned`；第一次真正 publish 成功並有 publication version 後，resolver 自然回 `published_versioned`／`draft` path。移除 bridge whitelist 的條件是三筆都已有 native draft 且至少完成各自首次 versioned publish 的 migration/QA follow-up；在該 follow-up 前不把清單 bridge 當權威資料來源。

## Builder 順序、檔案與 RED → GREEN

### 可改檔案

- 新增：`supabase/migrations/<fresh_timestamp>_issue1825_native_service_draft_ensure.sql`
- 新增：`apps/web/src/lib/midao/structural-uuid.mjs`
- 新增：`apps/web/src/lib/midao/db-native-service-draft-ensure.mjs`
- 修改：`apps/web/app/api/v2/guide/service-drafts/route.ts`
- 新增：`apps/web/app/api/v2/guide/service-drafts/ensure/route.ts`
- 修改：`apps/web/app/api/v2/guide/service-drafts/[draftId]/route.ts`
- 修改：`apps/web/app/api/v2/guide/service-drafts/[draftId]/commands/publish/route.ts`
- 修改：`apps/web/src/lib/midao/db-midao-service-drafts.mjs`
- 修改：`apps/web/src/lib/midao/db-midao-service-publication.mjs`
- 修改：`apps/web/src/lib/midao/service-list-resolver.ts`
- 修改：`apps/web/src/features/midao/services/{service-api.ts,service-types.ts,ServiceCard.tsx,ServiceWizard.tsx}`
- 新增／修改：`apps/web/tests/api/issue1825-native-draft-lifecycle.test.mjs`、既有 `midao-service-drafts*.test.mjs`、`midao-services-list.test.mjs`，以及可重用 Playwright spec。
- 修改：`docs/operations/worklogs/issue1825.md`。

### RED

先新增測試，確認下列測試確實在未實作時失敗：

1. route：三個 c-ID 以正確 guide session POST ensure 成功；其他 guide 對同 ID 仍 404，且 draft table state 不變。
2. gateway/RPC fake：同一 ID 重複 ensure 回相同 draft ID/revision；同時兩個 ensure 收斂為一筆 active draft；`materializationOrigin==='native'`。
3. side-effect ledger fake/local PostgreSQL：ensure 前後只有 `guide_service_drafts` 增一筆；`activities`、`activity_plans`、`orders`、`bookings`、`service_publication_versions`、outbox 均零異動。
4. invalid canonical source 返回 422，沒有 draft；GET 對無 draft 的 c-ID 仍不呼叫 RPC、也不寫入。
5. structural UUID matrix：c-ID + v4 都通過 guide service draft identity chain；non-hex、suffix、空白外字元仍拒絕。另保留 legacy feature allowlist 與 publication recovery strict policy regression。
6. resolver/API/UI contract：三筆皆為 `published_unversioned`，上/下文案一致；一般 v4 draft、versioned published、draft-over-version、unpublished 分別維持預期；`publishedVersion=null` 永不顯示「尚未發布」。
7. browser：由預設「我的服務」頁載入三筆，按其中一張卡後觀察明確 POST ensure、導到 editor、顯示帶入的名稱/說明；修改一欄後 autosave 成功。測另一 guide 不可藉 URL 或 API 進入。無可安全使用的 fixture 時，留下 `NOT_VERIFIED-live` 與所缺 fixture，不得冒稱通過。

### GREEN 與驗收命令

在專屬乾淨 Node 22 worktree 完成最小實作後，builder 必須針對 exact commit 跑：

```bash
.claude/hooks/run-checks.sh \
  apps/web/tests/api/issue1825-native-draft-lifecycle.test.mjs \
  apps/web/tests/api/midao-service-drafts.test.mjs \
  apps/web/tests/api/midao-service-drafts-gateway.test.mjs \
  apps/web/tests/api/midao-services-list.test.mjs \
  apps/web/tests/api/midao-legacy-draft-materialization.test.mjs \
  --typecheck
```

再跑新增的 migration static/local PostgreSQL contract，以及 Playwright default-path spec；migration 只能提交，不得自行 apply production DDL。production apply 仍需 operator 的 SQL-OVERRIDE、migration ledger、CI 綠燈與 redacted schema probe。

## 不變量、禁止範圍與 rollback

- 不補寫、不偽造 `service_publication_versions`；`published_unversioned` 的 version 必為 null。
- 不修改歷史 migration，不直接呼叫 legacy materialization RPC，也不改 #1825 另一條 legacy activity snapshot / atomic batch lane。
- 不寫 canonical `activities`、`activity_plans`、orders、bookings、outbox；不調 feature flag；GET 一律零寫入。
- 不將 UUID version/variant 視為授權。授權只由 session + `assertActivityBelongsToGuide()`／RPC guide check 決定。
- 不以 query-wide `status='published'` filter 解決 list，避免丟失一般 draft。

rollback 分兩層：尚未套用 migration 時 revert builder commit；已套用 migration 時保留 regression 與 forward migration function，但 operator 先停用前端 ensure action／revert application caller，禁止刪 production drafts、禁止回填或偽造 version。任何已建立 native draft 都是使用者可編輯資料，不可用 rollback 腳本刪除。

## Rita final-review gate

Builder 完成後在同一 builder card 呼叫 `kanban_request_review(reviewer="tp-reviewer")`；不得建立 reviewer child。Rita 在 immutable `base_sha..head_sha` fresh worktree 審查，必須確認：

1. migration 為新 timestamp、已做 collision preflight，且尚未聲稱 production apply。
2. function／gateway 僅寫 `guide_service_drafts`，所有 forbidden table write 均無；GET 無 RPC 寫入。
3. 三個 c-ID 的 owner/non-owner、repeat/concurrent ensure、invalid source、no-publication-version 皆有測試證據。
4. `lifecycleState` 是 resolver/API 唯一真相，ServiceCard 上下文案均由它得出；normal v4 與 legacy regressions 皆未退化。
5. 精確重跑上述 `run-checks`、migration contract、可用的 Playwright；缺 browser fixture 則 verdict 為 `INCONCLUSIVE` 或明確 `NOT_VERIFIED-live`，不得宣稱 user symptom 已驗證。

Rita PASS metadata 至少記錄：`base_sha`、`head_sha`、`tested_commit_sha`、`migration_applied_to_production: no|yes`、`owner_c_ids_editable`、`non_owner_404`、`concurrent_ensure_converges`、`publication_versions_written: 0`、`lifecycle_copy_consistent`、`user_symptom_reverified_from_default_ui_path` 與殘餘風險。
