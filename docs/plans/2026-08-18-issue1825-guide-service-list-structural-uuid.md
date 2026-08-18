# #1825 導遊「我的服務」非 v4 UUID 與 native activity 清單修復規格

> 狀態：**OWNER_ACCEPTED — 2026-08-18 木村哥/Ava 已選擇方案 A；可依本文最小範圍交 builder 實作。**
>
> 本文只讀規劃；未變更 production 資料、migration、產品碼或 feature flag。

## 目標

讓 `c0000003-0000-0000-0000-000000000001`、`...0002`、`...0003` 三筆 `status='published'` 的 native activity，在導遊後台「我的服務」的 `fetchServiceList()`／`resolveGuideServiceList()` 結果中穩定出現，狀態與 `activity_plans.base_price` 的 min/max 價格正確，且不改 canonical `activities`／`activity_plans` 資料。

## 已由 source 確認的事實

1. `apps/web/src/lib/midao/service-list-resolver.ts:29,91-94` 的 `UUID_PATTERN` 是 RFC v1–v5 + variant 限制；同一 `normalizeUuid()` 同時驗證 caller guide ID、activity row ID、plan/draft/version foreign key。`resolveInSupabase()` 在 `:362-375` 對 `row.id` normalize 失敗直接回 `null` 並 filter 掉；三筆 version nibble 為 `0` 的 ID 因此在組裝前消失。
2. 將 regex 換成完整 structural hexadecimal UUID（`8-4-4-4-12`）不會改變既有 v4 接受集；v4 仍 match。非 hex、長度錯誤、suffix、空白以外內容仍 fail closed。影響範圍也包含 structural guide ID 的 normalize；這是格式相容而非授權放寬，`activities` 查詢仍以 `.eq('guide_id', guideId)` 限制（resolver `:356-360`）。
3. 即使 activity 已通過 UUID filter，現行 `buildItem()` 仍在沒有 active draft 且沒有 publication version 時於 `:241-247` 回 `null`。因此「只改 UUID regex」不會讓題述三筆無 draft/version 的 activity 出現在清單。
4. `materializationEnabled` 的現行 loop（resolver `:435-449`）在 `status === 'published'`、無 draft、無 version 時的確會呼叫 `ensureLegacyServiceDraftMaterialized()`；它沒有任何 native/legacy source discriminator。
5. 這條 RPC 不會保留 native origin：`supabase/migrations/20260813085910_issue1825_legacy_midao_draft_materialization.sql:142-161` 硬編碼 `materialization_origin = 'legacy_activity'`。而 origin 欄位位於 `guide_service_drafts`（migration `:5-9`），題述三筆又明確沒有 draft，故 source 中不存在可供 resolver 判斷「這筆 activity 是 native」的 marker。
6. 目前 materialization feature gate 的 guide allowlist 也使用 strict RFC UUID（`apps/web/src/config/feature-flags.mjs:125-135`）；所以 structural guide ID 若被用於該實驗 gate，會 fail closed，不會寫 RPC。這是安全結果，但形成另一個分散 validator policy。

## 阻斷結論

不能把「開啟現有 materialization」當成這三筆 native activity 的修復：它會把任何符合條件的 activity 物化成 `legacy_activity` draft，與 native-origin 不變量衝突。反過來，materialization 關閉時，UUID 放寬後仍會由 `buildItem()` 排除，無法達成清單目標。

所以在目前 schema/source contract 下，沒有一個安全、可證實的 native discriminator 可讓 builder 同時保證：

- 三筆無 draft/version 的 native activity 顯示；以及
- 任一 allowlisted guide 的 native activity 不被 legacy materializer 誤寫成 `legacy_activity`。

## 所需 owner 決策（唯一 blocker）

木村哥/Ava 必須選擇 native activity 的清單語意與可授權 discriminator：

- **建議 A（不需 schema/data 寫入）：** 將 `activities.status='published'` 視為 canonical published service fallback。Resolver 只要 activity 已通過 guide ownership query，即使沒有 draft/version 亦以 `status: 'published'` 出現在清單；價格繼續取 `activity_plans.base_price`。同時不得依賴或開啟 legacy materialization 來處理 native activity。此選項直接滿足三筆資料、零 production 寫入，且不改 legacy materialization。
- **選項 B（若產品語意堅持「沒有 draft/version 不得列出」）：** 先由 owner 指定可靠的 native-vs-legacy source discriminator（資料欄位／受控 whitelist／已存在可讀 provenance），並另立 migration/資料契約卡；其後才可修改 materialization eligibility。現有 source 沒有此 discriminator，不能猜測 `pending_changes`、UUID version 或 title 等 proxy。

本規格推薦 **A**。它把 native canonical `published` activity 視為 published service，避免以 legacy RPC 補出錯誤 provenance；B 擴大為 schema/data 變更，違反本卡最小且不碰 canonical data 的邊界。

## Owner decision（2026-08-18）

木村哥/Ava 已明確接受建議 A：對通過 guide ownership query 的 `activities.status='published'`，即使沒有 draft/version，仍以 `status: 'published'` 列入服務清單；價格仍從 `activity_plans.base_price` 聚合，`publishedVersion` 保持 `null`。這是刻意的 native canonical fallback 語意，不是資料修復或 publication version 的替代品。

本決策同時鎖定以下界線：不得啟用或依賴 legacy materialization 處理這三筆 native activity；不得新增 schema/data discriminator；不抽 shared UUID helper，維持各 consumer 的 boundary-specific validator policy。本次只處理 resolver 與其 regression。

## A 獲授權後的 builder handoff（最小實作）

### Owner / workspace / scope

- Assignee：`tp-builder-api`
- Reviewer：`tp-reviewer`（Rita，獨立 final review）
- Repo path：task 指定 Tour Platform repo。
- Worktree：必須建立專屬乾淨 worktree，非 primary checkout；記錄 `base_sha`、`head_sha`。
- 可修改：
  - `apps/web/src/lib/midao/service-list-resolver.ts`
  - `apps/web/tests/api/midao-services-list.test.mjs`
  - `docs/operations/worklogs/issue1825.md`
- 禁止：所有 migration、canonical data/SQL、`activities`/`activity_plans` 寫入、feature-flag 設定、legacy materialization RPC、publication recovery、admin plan routes、public booking/API、t_08d99b02/t_ddb1449b 範圍。

### 已決定的 runtime semantics

1. `normalizeUuid()` 改為 structural `8-4-4-4-12` hexadecimal regex，保留 trim/lowercase 與 `null` fail-closed contract。
2. `buildItem()` 的 published 判斷改為：有 publication version **或** activity source `status === 'published'` 即視為 published；active draft 仍優先顯示 draft，`hasUnpublishedChanges` 只在 active draft + publication version 時為 true。
3. 沒有 draft/version、`status !== 'published'` 的 activity 仍不列入；不要在 Supabase activities query 加 `.eq('status', 'published')`，否則會錯誤排除 active draft services。這是 item assembly filter，不是 query-wide filter。
4. fallback item 的 `publishedVersion` 保持 `null`；`status` 是已發布的 UI display status，不得杜撰 publication version。
5. `materializationEnabled` loop 與 RPC 不變。選項 A 的 implementation/rollout 不得為了這三筆 native activity 開啟該 flag；對 allowlisted legacy guide 的既有行為維持原樣。

### TDD RED → GREEN

1. 先在 `apps/web/tests/api/midao-services-list.test.mjs` 加 Supabase parity regression：
   - 同一 guide 的三個 activity ID 固定使用 `c0000003-...0001/2/3`；row `status: 'published'`，無 drafts、無 versions。
   - 各自給至少兩筆 `activity_plans.base_price`，assert `total === 3`、三個 ID 都出現、`status === 'published'`、`publishedVersion === null`，以及每筆精準 min/max。
   - `materializationEnabled: false`（或 default master-off test environment）並 assert fake client 零 RPC calls；此 regression 只驗證 native fallback，不能把 legacy materialization 寫入包裝成成功。
   - 明確 assert v4 activity 的既有 draft/published/hasUnpublishedChanges 語意不變；non-hex structural-looking ID 仍不出現在資料組裝與 caller validation。
   - 可另加 `__internal.normalizeUuid` source-level/behavior assertion：三個 c-ID 與現有 v4 guide/activity 均接受，`...000g`、suffix 與非 UUID 均拒絕。
2. 先執行 RED：

```bash
cd apps/web && node --test tests/api/midao-services-list.test.mjs
```

預期新增 native fallback assertion 失敗：現行 strict UUID filter 或 no-draft/no-version `buildItem()` gate 導致 `total !== 3`。

3. 只改 `service-list-resolver.ts` 的 pattern 與 `buildItem()` published fallback，不能重寫 query、auth、ownership、price aggregation、pagination、feature flag 或 materialization RPC。
4. 執行 GREEN：同一 command 必須通過；再以以下正式 gate 取得提交證據：

```bash
NODE_OPTIONS='--max-old-space-size=1024' .claude/hooks/run-checks.sh \
  apps/web/tests/api/midao-services-list.test.mjs \
  apps/web/tests/api/midao-legacy-draft-materialization.test.mjs \
  --typecheck
```

### 不變量 / acceptance criteria

- [ ] 三筆 c-ID 均在 `resolveGuideServiceList()` Supabase parity result 出現，且價格區間各自正確。
- [ ] 三筆的 display `status` 為 `published`、`publishedVersion` 為 `null`；不得創建或偽稱 publication version。
- [ ] native fallback path 零 RPC 寫入、零 canonical data 寫入、零 migration。
- [ ] 既有 v4 item 的 list、ownership、draft precedence、pagination 及價格行為不變。
- [ ] malformed UUID 仍在 query/map 前被拒絕；不接受 arbitrary strings。
- [ ] 既有 allowlisted `legacy_activity` materialization regression 維持通過；本卡不改 t_08d99b02/t_ddb1449b 的 atomic RPC/snapshot scope。
- [ ] 必須從導遊預設「我的服務」UI path 另做 browser verification（可重用 Playwright）或明確 `NOT_VERIFIED-live`，不得只用 resolver unit/API response 關閉 #1825。

### Rollback

純 application logic，無 schema/data side effect。若 fallback 造成未預期清單項目，revert 該單一 builder commit；不得以 production SQL、draft 重建或 materialization flag 當 rollback。回退後保留 regression test 與 issue evidence，避免再次遺失 c-ID root-cause coverage。

## UUID helper 決策

**本次不抽 shared helper，維持分散但逐一修正。**

理由：

1. 已合併的 admin plans fix 屬一條 TypeScript 垂直 UI/API path，resolver 是 TS 但其相依 feature flags/materialization gateway 是 `.mjs`，跨 raw TS/MJS helper 會擴大 Node runtime/type-resolution surface。
2. admin publication recovery 有意保留 strict RFC policy；把「所有 UUID」抽成一個 helper 容易錯誤外溢到高風險 recovery boundary。
3. materialization RPC 的 `uuid` input 是 PostgreSQL type gate，JS gateway/feature allowlist 又分別是 RPC contract、rollout scope contract，不能以單一 permissive utility 偷換語意。
4. 目前更重要的是先建立本卡對 structural activity ID + native fallback 的 executable regression。後續若要標準化，應另開低風險 inventory/refactor 卡，先定義具名 policies（`isStructuralUuid` vs `isRfcUuidForRecovery`），再以 consumer matrix 逐處遷移；不得混入 #1825 修復。

## Rita final-review gate

Rita 必須用 fresh worktree 對 immutable `base_sha..head_sha` review，且至少完成：

1. diff 僅含 resolver、list regression、worklog；沒有 migration、data、RPC、flag、admin/public/booking/recovery 變更。
2. 親自確認 structural regex 仍完整 reject malformed inputs，既有 v4 acceptance 未回歸，並確認 fallback 僅以 source `status === 'published'` 補齊，沒有 query-wide status filter。
3. 親跑 builder 的 exact `run-checks.sh ... --typecheck` command，將實際 exit code 與 tested SHA 寫回 handoff。
4. 逐條驗收三個 c-ID、prices、`publishedVersion: null`、zero-RPC native test、legacy materialization regression。
5. UI 是 user-visible bug：review 不得以 API/unit 綠燈 alone PASS；要有預設導遊「我的服務」browser evidence，或留下明確 `NOT_VERIFIED-live` blocker，不能宣稱 issue 已關閉。

PASS 必填 metadata：`approved: true`、`direct_issue_goal_verified: yes`、`changed_files_verified: yes`、`native_fallback_zero_rpc: yes`、`legacy_materialization_regression: pass`、`user_symptom_reverified_from_default_ui_path: yes|no`、`acceptance_criteria_result: pass|inconclusive`。
