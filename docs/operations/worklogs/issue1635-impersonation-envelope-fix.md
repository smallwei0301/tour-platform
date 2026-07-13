# issue1635 追蹤修復 — 管理員「進入導遊後台」永遠顯示進入失敗
> 最後更新：2026-07-13（Asia/Taipei）｜負責 session：Claude（branch `claude/admin-guide-backend-access-9dpv78`）

## 目標
修復使用者回報：從管理者後台導遊詳情頁按「進入導遊後台」（#1635 加入的 admin → guide 代入功能），一律顯示「進入導遊後台失敗」且不導頁。

## 根因
- 代入 API `POST /api/v2/admin/guides/[guideId]/impersonate` 是 v2 route，成功回應走 `jsonOk` → V2 envelope **`{ success: true, data }`**（`src/lib/api-response.ts`）。
- 前端 `app/admin/guides/[guideId]/page.tsx` 的 `handleEnterGuideBackend` 卻檢查 v1 envelope 的 **`json?.ok`**（本頁其他呼叫都是 v1 route `{ ok: true }`，只有這顆按鈕打 v2）。
- V2 回應沒有 `ok` 欄位 → 即使 HTTP 200、guide session cookie 已成功簽發，前端仍判定失敗，顯示 fallback 文案「進入導遊後台失敗」並停留原頁。

## 修正
- `apps/web/app/admin/guides/[guideId]/page.tsx`：成功判斷改為 `json?.success !== true`（V2 envelope），錯誤訊息取用 `json?.error?.message` 與 `errorV2` 形狀相容、不變。
- `apps/web/tests/api/admin-guide-impersonation.test.mjs`：新增回歸鎖測試——`handleEnterGuideBackend` 必須以 `json?.success` 判斷、不得再用 `json?.ok`。

## 已完成（附證據）
- GREEN：`.claude/hooks/run-checks.sh apps/web/tests/api/admin-guide-impersonation.test.mjs` → 15/15 pass（Node 22）。
- GREEN：`.claude/hooks/run-checks.sh --typecheck apps/web/tests/api/admin-guide-impersonation.test.mjs` → `tsc --noEmit` 通過。
- `yarn.lock` 安裝殘留已 `git checkout --` 丟棄（鐵律 10）。
- Vercel production runtime errors（近 24h）查無此 route exception——符合「非 exception、是前端誤判 200 回應」的根因。

## 下一步
- push 至 `claude/admin-guide-backend-access-9dpv78`，開 PR → CI 綠 → merge → 生產實測按鈕可導入 `/guide/dashboard` 並顯示代入橫幅。

## 絕不重做（Do-NOT-redo）
- 不動代入 route 本身（安全邊界、envelope 均正確）；不把 v2 route 改回 v1 envelope（#1614 ratchet 鎖 `jsonOk/jsonError`）。
- 不動 middleware 三 realm 守門與 CSRF 邏輯（凍結區）。

## P0-OVERRIDE 使用紀錄（如有）
- 無。
