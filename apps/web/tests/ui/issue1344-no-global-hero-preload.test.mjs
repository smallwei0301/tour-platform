/**
 * Issue #1344 round 2 — 全站洩漏的首頁 hero preload。
 *
 * 實測 production（部署版 729ac8e）發現每一頁（/login、/guides、/blog、
 * /activities、/activities/kaohsiung…）的 SSR head 都帶著：
 *
 *   <link rel="preload" as="image"
 *         href="https://images.unsplash.com/photo-1528164344705-…?w=1600&q=80"
 *         fetchPriority="high"/>
 *
 * 這條是首頁 hero 背景圖的 preload，卻放在 **root layout** 的 <head>，
 * 導致全站每個訪客每一頁都先下載一張 ~數百 KB 的 w=1600 大圖，
 * 在 slow 4G 上直接跟當頁 LCP 圖搶頻寬 — /activities mobile LCP
 * 8.8s 的元兇之一。
 *
 * 首頁自己在 app/page.tsx 內已有同一條 preload（React 19 會 hoist 到
 * head），所以從 root layout 移除不影響首頁 LCP。
 *
 * 此測試鎖：
 *   1. root layout 不再含任何 rel="preload" as="image"。
 *   2. preconnect（無害且有益）保留。
 *   3. 首頁 page.tsx 自己的 hero preload 保留（首頁 LCP 不回歸）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');

async function readSrc(rel) {
  return readFile(path.join(WEB_ROOT, rel), 'utf8');
}

test('root layout 不再有 image preload（首頁 hero 大圖不得全站洩漏）', async () => {
  const src = await readSrc('app/layout.tsx');
  assert.doesNotMatch(
    src,
    /rel=["']preload["'][\s\S]{0,200}?as=["']image["']/,
    'root layout 不可有任何 <link rel="preload" as="image"> — 它會讓每一頁都下載該圖,#1344 實測是 mobile LCP 元兇之一',
  );
  // 也防反向屬性順序寫法。
  assert.doesNotMatch(
    src,
    /as=["']image["'][\s\S]{0,200}?rel=["']preload["']/,
    'root layout 不可有任何 image preload(反向屬性順序)',
  );
});

test('root layout 保留 image CDN 的 preconnect（無害且加速 TLS 握手）', async () => {
  const src = await readSrc('app/layout.tsx');
  assert.match(
    src,
    /rel=["']preconnect["']\s+href=["']https:\/\/images\.unsplash\.com["']/,
    'preconnect to unsplash 應保留',
  );
});

test('首頁 page.tsx 自己的 hero preload 保留（首頁 LCP 不回歸）', async () => {
  const src = await readSrc('app/page.tsx');
  // 祕島 LP hero 為雙層視差：去背洞穴前景（webp）＋遠景山谷（jpg），兩張皆需 preload
  assert.match(
    src,
    /rel=["']preload["'][\s\S]{0,300}?\/images\/lp\/hero-cave-fg\.webp/,
    '首頁的 hero 前景 preload 必須留在 app/page.tsx — root layout 移除後它是唯一的首頁 LCP 加速來源',
  );
  assert.match(
    src,
    /rel=["']preload["'][\s\S]{0,300}?\/images\/lp\/hero-mountains\.jpg/,
    '首頁的 hero 遠景 preload 必須留在 app/page.tsx',
  );
});
