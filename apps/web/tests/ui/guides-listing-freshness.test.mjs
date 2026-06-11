/**
 * 認識導遊頁即時性：新核可（promote）的導遊必須在合理時間內出現在
 * /guides 列表，不能等到下次 deploy。
 *
 * 事故：admin 核可導遊、導遊以驗證碼登入後，/guides 仍看不到該導遊。
 * 根因是 Next.js 15 App Router 的靜態渲染：/guides 與 /guides/[slug]
 * 透過 listPublishedGuidesDb / getGuideBySlugDb 直接讀 Supabase（非
 * fetch()），Next 無法追蹤其資料來源，整頁在 build/deploy 當下即靜態
 * 定型並無限期供應同一份 HTML —— 新資料要等下次 deploy 才會更新。
 *
 * 修法：兩頁宣告 ISR revalidate（與 activities/page.tsx 的 60s 慣例
 * 一致），讓列表與詳情在 ≤60s 內反映最新核可的導遊。
 *
 * 此為 Next 渲染指令（export const）的 source-contract，dev server 永遠
 * 即時 SSR，無法以 E2E 重現 production 靜態定型，故以原始碼契約鎖定。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, '..', '..');
const LIST_PAGE = join(APP_ROOT, 'app/guides/page.tsx');
const DETAIL_PAGE = join(APP_ROOT, 'app/guides/[slug]/page.tsx');

// 接受 ISR（revalidate 數字）或 force-dynamic（每次 SSR）任一，
// 只要頁面不是無限期靜態定型即可。
const FRESHNESS = /export const (revalidate\s*=\s*\d+|dynamic\s*=\s*['"]force-dynamic['"])/;

test('/guides 列表頁宣告 freshness（revalidate 或 force-dynamic）', () => {
  const src = readFileSync(LIST_PAGE, 'utf8');
  assert.match(src, FRESHNESS, '認識導遊列表不得無限期靜態定型，否則新核可導遊不會出現');
});

test('/guides 列表頁 revalidate 不過長（≤300s，確保「馬上看到」體感）', () => {
  const src = readFileSync(LIST_PAGE, 'utf8');
  const m = src.match(/export const revalidate\s*=\s*(\d+)/);
  if (m) assert.ok(Number(m[1]) <= 300, `revalidate=${m[1]} 過長，新導遊上架體感不及時`);
});

test('/guides/[slug] 詳情頁宣告 freshness（revalidate 或 force-dynamic）', () => {
  const src = readFileSync(DETAIL_PAGE, 'utf8');
  assert.match(src, FRESHNESS, '導遊詳情頁不得無限期靜態定型，否則剛上架導遊頁資料會落後');
});
