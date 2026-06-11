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
const LIST_PAGE = join(APP_ROOT, 'app/guides/page.tsx');
const DETAIL_PAGE = join(APP_ROOT, 'app/guides/[slug]/page.tsx');
const PROFILE_ROUTE = join(APP_ROOT, 'app/api/guide/profile/route.ts');

test('/guides 與 /guides/[slug] 不再用定時 ISR（改 on-demand）', () => {
  const list = readFileSync(LIST_PAGE, 'utf8');
  const detail = readFileSync(DETAIL_PAGE, 'utf8');
  assert.doesNotMatch(list, /export const revalidate\s*=\s*\d/, '列表頁不應再有定時 revalidate');
  assert.doesNotMatch(detail, /export const revalidate\s*=\s*\d/, '詳情頁不應再有定時 revalidate');
});

test('導遊存檔／發佈時 on-demand 失效公開頁，旅客刷新即見最新資料', () => {
  const src = readFileSync(PROFILE_ROUTE, 'utf8');
  assert.match(src, /from\s+['"]next\/cache['"]/, '需 import next/cache');
  assert.match(src, /revalidatePath\(\s*['"]\/guides['"]\s*\)/, '需失效認識導遊列表 /guides');
  assert.match(src, /revalidatePath\(\s*[`'"]\/guides\/\$\{?/, '需一併失效該導遊詳情頁 /guides/<slug>');
});
