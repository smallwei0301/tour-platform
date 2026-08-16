# issue1760 — Package 5 Slice 2a availability resolver policy/day-override projection
> 最後更新：2026-08-14 15:21:07 CST（Asia/Taipei）｜負責 session：tp-builder-api

## 目標
在既有 `effective-availability-resolver.ts` 建立純 in-memory policy/day-override rule selector，並在 `slot-generator.ts` 保留未啟用時完全沿用既有規則選取的 opt-in `ruleSelector` seam；不變更 route、DB query、HTTP contract、migration 或 scheduled fixed-session 隔離。

## 範圍與基線
- GitHub issue：#1760
- Worktree：`/root/.openclaw/workspace/worktrees/tour-platform/issue-1760-p5-slice2a-resolver-policy-parity`
- Branch：`feat/issue-1760-p5-slice2a-resolver-policy-parity`
- Immutable base／起始 HEAD：`0f8776b4cf4a0da3fea6b1ec29387337690cc2d9`
- 起始 worktree：clean；目前尚有本 slice 的未 commit allowlist 變更，禁止視為已完成或可 merge。
- Slice 1 preflight：`20260814130000_issue1760_availability_scope_contract.sql` 與 `20260814130100_issue1760_atomic_day_availability.sql` 均存在；最新 forward migration 為後者。本 slice 沒有 schema、RPC、RLS 或 migration 變更。

## Allowlist
僅允許以下四檔：
1. `apps/web/src/lib/availability-v2/effective-availability-resolver.ts`
2. `apps/web/src/lib/slot-generator.ts`
3. `apps/web/tests/api/issue1760-effective-availability-policy-resolver.test.mjs`
4. `docs/operations/worklogs/issue1760.md`

## 已完成的 TDD tracer slice
- RED：先新增 `issue1760-effective-availability-policy-resolver.test.mjs`，直接 import 尚不存在的 `createCanonicalAvailabilityRuleSelector`；執行 hook 後如預期因 resolver 未 export 該 symbol 失敗（exit 1）。
- GREEN：新增 `AvailabilityPolicy`、`GuideAvailabilityDayRevision`、`CanonicalAvailabilityRuleContext`、`createCanonicalAvailabilityRuleSelector()`。
  - `closed` 永遠空集合。
  - day revision 精確以 guide/local date/timezone 比對；closed tombstone 回空集合，open revision 只回 active global exact-date ranges。
  - 無 day revision 時，`restrict` 僅回 matching plan rules，`inherit` 回 global 加 matching plan rules。
  - `resolveCanonicalAvailabilityState()` 只在可選 `ruleContext` 存在時用 selector 的當日結果判定 `outside_rule`；沒有 context 時仍使用原 `params.rules`。
- GREEN：`SlotGeneratorDeps` 新增 optional `ruleSelector`，per-date loop 僅在 selector 被提供時採用該日 rules；未提供時仍使用原本 `getAvailabilityRules()` 結果。沒有既有 caller 被遷移或啟用。
- Tests 覆蓋 inherit/restrict/closed、open/closed day revision、timezone mismatch、沒有 revision 時 exact date 的既有行為、resolver no-context state parity，以及 multi-day generator recurring/tombstone/exact-day opt-in。

## 實跑證據

### RED
```bash
./.claude/hooks/run-checks.sh apps/web/tests/api/issue1760-effective-availability-policy-resolver.test.mjs
```
結果：exit `1`；`SyntaxError: ... does not provide an export named 'createCanonicalAvailabilityRuleSelector'`。

### GREEN focused tests
```bash
./.claude/hooks/run-checks.sh apps/web/tests/api/issue1760-effective-availability-policy-resolver.test.mjs apps/web/tests/api/issue1067-canonical-availability-resolver.test.mjs apps/web/tests/api/issue1196-cross-surface-precedence.test.mjs apps/web/tests/api/issue1289-preview-canonical-parity.test.mjs
```
結果：exit `0`；`31` tests passed、`0` failed。

### Typecheck baseline
```bash
./.claude/hooks/run-checks.sh --typecheck apps/web/tests/api/issue1760-effective-availability-policy-resolver.test.mjs apps/web/tests/api/issue1067-canonical-availability-resolver.test.mjs apps/web/tests/api/issue1196-cross-surface-precedence.test.mjs apps/web/tests/api/issue1289-preview-canonical-parity.test.mjs
```
結果：exit `1`；tests 仍為 `31` passed、`0` failed。Ava 已以 `npm ci --no-audit --no-fund` 補齊本 worktree 的依賴，並確認 `package-lock.json`、`package.json`、`apps/web/package.json` 雜湊不變。`tsc --noEmit` 僅重現既有基線缺件：`e2e/login-pixel-alignment.spec.ts` 缺 `pngjs`、`pixelmatch`，以及 `src/components/activity/ReviewPhotos.tsx` 缺 `@types/react-dom`；此結果已由 Ava 在 Slice 1 的乾淨 `e507a0a1` 基線獨立重現，不屬本 slice 變更。

## 目前狀態與下一步
- Ava 已授權把上述 typecheck 標記為環境既有基線問題，非本卡缺陷；本 slice 不得為此修改 dependency、lockfile 或非 allowlist 檔案。
- 將重跑 `git diff --check`，只提交 allowlist 四檔，綁定 immutable `base_sha..head_sha`，然後由 Ava 建立 Rita 的獨立審查卡。

## 風險與禁止事項
- 風險：中。此 slice 僅建立未啟用的 source-level seam；目前沒有 route 或 scheduled path 傳入 selector。typecheck 的三項缺件為既有基線，Rita 仍須對最終 immutable commit 獨立審查。
- 未修改 route、`booking-availability-evaluator.ts`、`effective-booking-availability.ts`、`scheduled-plan-slots.ts`、migration、DB/RPC/RLS、UI、config 或 generated files。
- 未執行 DB/production action、push、PR、merge 或 deployment。

## Handoff
- Status：focused test gate 31/31 通過；typecheck 的 3 項既有缺件已記錄，不是本 slice 變更造成。
- Next role：tp-builder-api 提交 allowlist-only immutable commit；其後由 Ava 建立 tp-reviewer/Rita 的獨立 review card。

## Slice 2b — traveler dynamic canonical selector（續作）
> 最後更新：2026-08-16 18:40:35 CST（Asia/Taipei）｜接手 worker：一次性本機續作

### 接手與 RED 證據
- Base／接手時 HEAD：`cb3958f48a61b651399d86c085408c2780813cb5`。
- Branch：`feat/issue-1760-p5-slice2b-traveler-dynamic-selector`。
- 前 worker 已先建立 focused 測試，透過既有 `node_modules` symlink 實際載入並得到有效 RED（測試本身成功收集，部分通過、部分失敗）；其後才修改 production code。前 worker timeout 前未留下改檔後 GREEN 證據，本節不沿用其未完成結論。

### 本次修復
- `booking-availability-evaluator.ts`：optional `ruleContext` 建立 canonical selector，並把 selector 傳入 slot generator；selected schedule 也以 selector 的當日結果驗證，不讓 raw rules 或 selected schedule 繞過 closed/tombstone。
- `slot-generator.ts`：selector 啟用時保留每個候選 slot 的來源 rule，以該 rule 的 buffer 做衝突判定；未提供 selector 的 legacy 路徑維持原 shared-buffer 行為。
- `route-handler.ts`：dynamic `instant`／`request` 讀取並驗證 `availability_policy`，以 guide/dateFrom/dateTo bounded query 讀取 day revisions，建立 context 傳入 evaluator；缺失或非法 policy fail closed；`scheduled` 不查 day revisions 且維持 fixed-schedule path。
- focused fixture：將 buffer-after 情境調整為 booking 結束後的候選時段，保留 global/plan inverse provenance 的 false-block／false-allow 覆蓋，對齊既有 `slotConflictsWithBooking` buffer contract。

### 實跑證據（均為本次接手後、同一 dirty tree）
```bash
./.claude/hooks/run-checks.sh apps/web/tests/api/issue1760-traveler-dynamic-selector-parity.test.mjs
```
結果：exit `0`；`9` tests、`9` passed、`0` failed、`0` skipped。

```bash
./.claude/hooks/run-checks.sh apps/web/tests/api/issue1760-traveler-dynamic-selector-parity.test.mjs apps/web/tests/api/issue1760-effective-availability-policy-resolver.test.mjs apps/web/tests/api/v2-available-slots.test.mjs apps/web/tests/api/issue1665-available-slots-rls-regression.test.mjs
```
結果：exit `0`；`45` tests、`45` passed、`0` failed、`0` skipped。

```bash
./.claude/hooks/run-checks.sh --typecheck apps/web/tests/api/issue1760-traveler-dynamic-selector-parity.test.mjs apps/web/tests/api/issue1760-effective-availability-policy-resolver.test.mjs apps/web/tests/api/v2-available-slots.test.mjs apps/web/tests/api/issue1665-available-slots-rls-regression.test.mjs
```
結果：exit `0`；先執行的 `45` tests 為 `45` passed、`0` failed，後續 `npm run typecheck`／`tsc --noEmit` exit `0`。

### Scope／副作用封存
- 允許檔最終僅五檔：上述三個 production 檔、`apps/web/tests/api/issue1760-traveler-dynamic-selector-parity.test.mjs`、本 worklog。
- 未修改 lockfile、migration、harness、#1825、P6、pilot、scheduled route、guide preview、calendar、payments/checkout 或 feature flag；既有依賴 symlink 僅供本機測試，未安裝或改寫依賴。
- 無 Kanban mutation、無 GitHub remote mutation、無 push／PR／merge／deploy、無 production DDL/DML、無 credential 操作。
- commit 前 final HEAD 將由本機 Git read-back；禁止推送，並以本節實跑證據作為 commit gate。
