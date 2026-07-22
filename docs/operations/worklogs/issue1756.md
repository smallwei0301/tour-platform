# issue1756 — Midao runtime foundation and responsive shell
> 最後更新：2026-07-23 07:52 CST｜負責 session：Canary／2026-07-23

## 目標
依reviewed executable micro-plan建立Midao runtime foundation與第一個responsive shell，所有backend/data變更採strict TDD、staged evidence與local Postgres／Playwright真實驗證。

## 執行錨點
- Issue：https://github.com/smallwei0301/tour-platform/issues/1756
- Branch：`feat/midao-foundation-1756`
- Worktree：`/root/.hermes/worktrees/tour-platform/midao-foundation-1756`
- Base：`origin/main af3963cb48afdf246035bbf746694c7de18cc2ed`
- Reviewed plan anchor：`bcb81b119228dc81fecff7a212fff4017c4a1584`
- Plan：`docs/plans/2026-07-22-midao-package-01-foundation-shell.md`

## AC 清單
- [ ] 五個additive foundation migrations以RED → minimal GREEN完成，clean local Postgres apply/runtime PASS。
- [ ] Durable idempotency、atomic mode switch、audit/outbox與exact RPC ACL/RLS contracts通過。
- [ ] Canonical guide guard、signed impersonation actor、login/logout cookie cleanup與safe redirect contracts通過。
- [ ] `/midao`五route responsive shell與Brand Book tokens完成。
- [ ] Midao＋legacy Playwright真browser gates、focused/full suite、lint、typecheck、build全部有fresh evidence。
- [x] Fresh executable-plan spec與quality/security reviews雙PASS（anchor `bcb81b11`）。

## 已完成（附證據）
- 2026-07-23 建立isolated implementation worktree；branch/base/plan anchor驗證且初始worktree clean。
- 2026-07-23 A1首次tracked `npm install --ignore-scripts`完成368 packages，但npm 11.9.0刪除一筆nested optional-peer lock entry，lock SHA drift gate正確FAIL；未沿用成PASS、未執行`npm audit fix`。
- 2026-07-23 owner原文「用推薦方案」核准改採deterministic `npm ci --ignore-scripts`；已restore original `package-lock.json`，待focused correction review後重跑。

## 下一步
- 聚焦review A1 `npm ci --ignore-scripts` correction；雙PASS後以570秒tracked background從original lock重建dependencies並驗before/after lock SHA、Supabase pin與clean worktree。
- A1綠後執行A2 exact 38-test auth baseline；紅燈立即HOLD，不混入本package。

## 絕不重做（Do-NOT-redo）
- 不重跑或重審完整plan：`bcb81b11`已取得fresh spec＋quality/security雙PASS；本次只聚焦A1 install command correction。
- 不沿用首次`npm install`後再restore lock假裝deterministic；必須由`npm ci`重新建立。
- 不執行`npm audit fix`，避免未review dependency/lock drift。
- 不修改frozen middleware、legacy orders/payments、既有migrations、protected E2E、`CLAUDE.md`或`.claude/**`。
- 未經對應gate不做production SQL/migration apply、deploy、guide mode switch、真付款或LINE通知。

## P0-OVERRIDE 使用紀錄（如有）
- 無。
