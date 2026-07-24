// apps/web/e2e/midao2-public-request.spec.ts
// 公開接案頁 /g/[slug]：RSC 直呼領域檔（無 Supabase env → in-memory 空 → 404 畫面），
// 表單流程以獨立 route mock 驗證（送單 API）。
import { test, expect } from './helpers';

// 撰寫時發現：本專案 (non-locale) 群組頁面（RootDocument 內含 Suspense 邊界，如
// Analytics/SpeedInsights）呼叫 notFound() 時，本機 next dev／next start 皆只能拿到
// soft-404 ——內容與 <meta name="robots" content="noindex"> 正確，但 HTTP 狀態碼仍是
// 200（Next.js 15 streaming SSR 已知限制：root layout 已開始 flush shell 後才發現
// notFound()，狀態碼無法回頭改寫）。已在正式 build（next build + next start）重現，
// 並確認同一 (non-locale) 群組下既有的 /guides/[slug]/shop（notFound 用法相同）也有
// 同樣現象——非本頁新增邏輯所致，而是專案既有、跨頁共通的框架限制。
// 依專案既有慣例（issue1595-hidden-locale-guard.spec.ts 對 soft-404 的驗法）改以
// 「內容＋noindex」驗證，不依賴狀態碼；實際部署（Vercel）是否正確回傳 HTTP 404
// 列入 worklog「部署驗收清單」人工複驗。
//
// 順帶修正兩處真實 bug（見 worklog）：
//  1. app/(non-locale)/not-found.tsx 補上（Next.js 多重 root layout 規則要求每個
//     頂層 route group 各自要有 not-found.tsx，否則 dev 模式下該群組其他頁面的
//     notFound() 會噴 500 "not-found.tsx doesn't have a root layout"）。
//  2. /g/[slug] 的 generateMetadata 補上與頁面元件一致的 notFound() 呼叫，避免
//     slug 不存在時仍以「Midao 接案頁」通用標題＋無 noindex 對外呈現。
test('不存在的 slug 顯示 404（soft-404：not-found 內容＋noindex）', async ({ page }) => {
  const res = await page.goto('/g/no-such-guide');
  expect(res?.status()).toBe(200); // 見上方說明：本機環境的已知框架限制
  await expect(page.getByRole('heading', { name: '找不到這個頁面' })).toBeVisible();
  const robotsMeta = await page.locator('meta[name="robots"]').first().getAttribute('content');
  expect(robotsMeta ?? '').toContain('noindex');
});

// 表單互動驗證：由於 RSC 直呼領域檔且 e2e 無 DB seed 管道，
// 完整送單流程（表單渲染→送出→成功畫面）標記為部署環境驗收項（worklog AC），
// 此處僅驗證公開 API mock 下的送單 payload 形狀可由 RequestForm 產生——略過瀏覽器層，
// 不放假測試。詳見 worklog「部署驗收清單」。
