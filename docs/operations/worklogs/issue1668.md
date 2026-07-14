# issue1668 — fix(points): 抑制匿名 Booking V2 `/api/me/points` 401 噪音
> 最後更新：2026-07-08（Asia/Taipei）｜負責 session：tp-builder-ui / t_2186b6e9

## 目標
在公開未登入的 Booking V2 step 2，不要再主動打 `/api/me/points` 造成 401 console/API noise；同時保留已登入旅客的點數餘額與折抵流程。

## AC 清單
- [x] AC1 匿名公開 Booking V2 flow 不再主動打 `/api/me/points` 造成 401 噪音（source fix：`CheckoutPointsRedeem` 改為 `authed === true` 才 fetch）
- [x] AC2 已登入旅客仍可讀取點數餘額／折抵 UI（`CheckoutPointsRedeem` / `PointsBalanceChip` 仍保留登入後 fetch `/api/me/points`）
- [x] AC3 補上聚焦 regression evidence（新增 `apps/web/tests/api/issue1668-points-auth-gating.test.mjs`，Node 22 實跑 3/3 綠）
- [x] AC4 不改 booking / order / payment semantics（僅收斂 points request path，未動 booking/order/payment route）

## 進度
- 2026-07-08 開始接手 corrected worktree `fix/gh-1668-points-401-noise`（HEAD 74c90422）。
- 已確認噪音來源在 `CheckoutPointsRedeem.tsx` mount 時無條件 fetch `/api/me/points`；`PointsBalanceChip.tsx` 亦為無條件 fetch，但出現在會員頁。
- 已確認 repo 既有 `useTravelerAuth()` 可用 `supabase.auth.getUser()` 作為 client 端登入單一真實來源，適合用來 gate points fetch，避免匿名公開頁面先打 401。
- 2026-07-08 已實作：`CheckoutPointsRedeem` / `PointsBalanceChip` 改為只有 `authed === true` 才 fetch `/api/me/points`；匿名或 auth 未解析時直接不打 request、維持 UI 隱藏。
- 2026-07-08 focused regression：`npx -y node@22 --test apps/web/tests/api/issue1668-points-auth-gating.test.mjs` → 3/3 pass，覆蓋匿名 gating + member chip gating + `/api/me/points` 401/餘額契約。
- 2026-07-08 補充檢查：`npx -y node@22 node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json` 失敗，但錯誤落在 pre-existing / environment dependency drift：`apps/web/e2e/login-pixel-alignment.spec.ts` 缺 `pngjs`、`pixelmatch`，以及 `ReviewPhotos.tsx` 缺 `@types/react-dom`；非本次變更引入。

## 風險 / 備註
- 修正應維持最小範圍，只收斂 points request path，不動 booking/order/payment API。
- `useTravelerAuth()` 依賴 client-side getUser；未登入時會延後 points UI 顯示到 auth 狀態解析後，屬預期。

## 待補證據
- reviewer independent diff + verification
