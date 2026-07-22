# admin-csrf-impersonate-403 — 管理後台「進入導遊後台」出現 CSRF token required
> 最後更新：2026-07-22 12:20（Asia/Taipei）｜負責 session：claude-fable-5／2026-07-22（branch `claude/admin-coach-backend-error-dutaau`）

## 目標
修復管理後台導遊詳情頁點「進入導遊後台」回 403「CSRF token required」（owner 於行動裝置生產環境截圖回報，導遊：小野教練）。

## 根因（已確認，非推測）
1. `AdminShell.tsx` 的 `window.fetch` patch 只自動附 `x-csrf-token` 給 `/api/admin/**`，**漏掉 `/api/v2/admin/**`**——但 `middleware.ts` 的 `shouldRequireCsrf` 兩者都守；導遊代入 route 是 `/api/v2/admin/guides/[guideId]/impersonate`。
2. `tp_csrf` cookie `Max-Age=86400`（24h），只在 admin 登入與 AdminShell mount 時 prime；行動瀏覽器從記憶體還原分頁**不會**重跑 mount effect，cookie 過期後 `csrfHeaders()` 默默回空 header → middleware 403。

## AC 清單
- [x] AC1 AdminShell fetch patch 涵蓋 `/api/v2/admin/`，且 mutation 當下 cookie 失效會就地補發（`/api/admin/auth/csrf`）再附 header
- [x] AC2 導遊詳情頁 `handleEnterGuideBackend` 送出前 `await ensureCsrfToken()`
- [x] AC3 回歸測試鎖住上述行為；`run-checks.sh --typecheck` 綠燈
- [ ] AC4 PR 開出、CI success、merge
- [ ] AC5 生產驗證：admin 點「進入導遊後台」成功導向 `/guide/dashboard`（NOT_VERIFIED-live，需部署後由 owner 或 session 實測）

## 已完成（附證據）
- 2026-07-22 修 `apps/web/src/components/admin/AdminShell.tsx`（patch 涵蓋 v2＋cookie 失效就地補發）、`apps/web/app/(non-locale)/admin/guides/[guideId]/page.tsx`（`ensureCsrfToken` 前置）
- 2026-07-22 新增 `apps/web/tests/api/admin-shell-csrf-autoattach.test.mjs`；擴充 `apps/web/tests/api/admin-guide-impersonation.test.mjs`（+1 條 ensure 順序鎖）
- 2026-07-22 `.claude/hooks/run-checks.sh --typecheck <兩測試檔>` → 19 pass / 0 fail、tsc 無錯、exit 0

## 下一步
- commit → push `claude/admin-coach-backend-error-dutaau` → 開 PR → 盯 CI

## 絕不重做（Do-NOT-redo）
- 不要把 CSRF 檢查從 middleware 移到 route 內解決本問題——middleware 是唯一前門（凍結檔），且雙提交設計正確；問題在前端 header 附掛，已修。
- 不要改 `csrfHeaders()` 為 async——全 repo 同步呼叫點太多；失效補發放在 AdminShell patch 與呼叫端 `ensureCsrfToken()`。
- Edit 探針判 hooks 未武裝是已知假陰性（lessons.md 2026-07-06 條），本 session 已用 Write-identical 探針確認 hooks 武裝中。

## P0-OVERRIDE 使用紀錄（如有）
- 無（未觸碰凍結區）
