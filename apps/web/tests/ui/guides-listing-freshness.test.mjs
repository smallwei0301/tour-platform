/**
 * 認識導遊頁即時性 — 改用 on-demand revalidation（事件觸發，非定時 ISR）。
 *
 * 演進：先前以 export const revalidate = 60（定時 ISR）讓新核可導遊在
 * 一分鐘內出現。導入導遊自主發佈（is_published）後改為更省資源、更貼近
 * 「導遊儲存後才更新」的事件觸發模型：
 *   - /guides 與 /guides/[slug] 不再宣告定時 revalidate，平時維持靜態
 *     快取、零背景運算。
 *   - 導遊在後台「儲存並公開」時，/api/guide/profile 以
 *     revalidatePath('/guides') 與 revalidatePath(`/guides/<slug>`) 精準
 *     失效公開頁，旅客下次刷新即見最新資料。
 *
 * 此為 Next 渲染／快取契約（export 與 revalidatePath 呼叫）的
 * source-contract；dev server 永遠即時 SSR，無法以 E2E 重現 production
 * 快取行為。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, '..', '..');
const LIST_PAGE = join(APP_ROOT, 'app/[locale]/guides/page.tsx');
const DETAIL_PAGE = join(APP_ROOT, 'app/[locale]/guides/[slug]/page.tsx');
const PROFILE_ROUTE = join(APP_ROOT, 'app/api/guide/profile/route.ts');

test('/guides 與 /guides/[slug] 不再用定時 ISR（改 on-demand）', () => {
  const list = readFileSync(LIST_PAGE, 'utf8');
  const detail = readFileSync(DETAIL_PAGE, 'utf8');
  assert.doesNotMatch(list, /export const revalidate\s*=\s*\d/, '列表頁不應再有定時 revalidate');
  assert.doesNotMatch(detail, /export const revalidate\s*=\s*\d/, '詳情頁不應再有定時 revalidate');
});

test('/guides/[slug] 詳情頁須真正進 on-demand ISR 快取（否則退回 dynamic、每次重 SSR 變慢）', () => {
  // 動態 segment 沒有 generateStaticParams 時 Next 預設走 dynamic（線上實測
  // x-vercel-cache: MISS、TTFB ~1.2-1.5s）。下列設定缺一就會悄悄退回 dynamic，
  // 鎖住以防回歸：generateStaticParams()→[] 開啟 on-demand ISR、fetchCache 讓
  // Supabase 查詢可被快取；仍維持「不宣告數字 revalidate」的純 on-demand 模型。
  const detail = readFileSync(DETAIL_PAGE, 'utf8');
  assert.match(detail, /generateStaticParams\s*\(/, '需 generateStaticParams()→[] 才會啟用 on-demand ISR 快取');
  assert.match(detail, /fetchCache\s*=\s*['"]force-cache['"]/, '需 fetchCache=force-cache 讓查詢結果可被 ISR 快取');
  assert.doesNotMatch(detail, /dynamic\s*=\s*['"]force-dynamic['"]/, 'force-dynamic 會關掉快取，不得出現');
});

test('導遊存檔／發佈時 on-demand 失效公開頁，旅客刷新即見最新資料', () => {
  const src = readFileSync(PROFILE_ROUTE, 'utf8');
  assert.match(src, /from\s+['"]next\/cache['"]/, '需 import next/cache');
  // #1488：/guides 在 app/[locale]/，需以 localizeRevalidationPaths 展開各 locale 前綴才命中快取。
  assert.match(src, /localizeRevalidationPaths/, '需以 localizeRevalidationPaths 展開各 locale');
  assert.match(src, /['"]\/guides['"]/, '需失效認識導遊列表 /guides');
  assert.match(src, /[`'"]\/guides\/\$\{?/, '需一併失效該導遊詳情頁 /guides/<slug>');
  assert.match(src, /revalidatePath\(p\)/, '需對每個 locale 版本 revalidatePath');
});
