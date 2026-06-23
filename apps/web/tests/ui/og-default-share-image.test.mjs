/**
 * 分享縮圖（IG／私訊／FB 連結預覽）改用站內 og-default 圖。
 *
 * 過去全站的 OG／Twitter 預設分享圖指向外部 Unsplash 圖
 * （photo-1528164344705-…），連結被貼到 IG／私訊／FB 時顯示的縮圖
 * 即是這張外部圖。本輪改為站內品牌圖 public/images/og-default.png。
 *
 * 此測試鎖：
 *   1. 站內資產 public/images/og-default.png 確實存在。
 *   2. 共用的 DEFAULT_ACTIVITY_OG_IMAGE 為「絕對 URL」且指向 og-default
 *      （部分爬蟲不解析 metadataBase、JSON-LD 亦需絕對路徑）。
 *   3. root layout 及各靜態頁的 openGraph／twitter 預設分享圖都改用
 *      /images/og-default.png，且不再殘留舊的 Unsplash OG 圖（w=1200 變體）。
 *   4. 內容圖（首頁 hero、各文章封面）不受影響 — 不在本測試範圍硬鎖，
 *      但舊 OG 變體不應再出現在「分享圖」用途的檔案中。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { constants as FS } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');

const OG_ASSET = '/images/og-default.png';
const OLD_OG_URL = 'https://images.unsplash.com/photo-1528164344705-47542687000d?w=1200&q=80';

// 預設分享縮圖落地的檔案（openGraph／twitter metadata）。
const SHARE_THUMBNAIL_FILES = [
  'app/layout.tsx',
  'app/[locale]/page.tsx',
  'app/[locale]/about/page.tsx',
  'app/[locale]/why-choose-us/page.tsx',
  'app/[locale]/faq/page.tsx',
  'app/[locale]/guides/page.tsx',
  'app/guides/[slug]/page.tsx',
  'app/[locale]/contact/page.tsx',
  'app/[locale]/activities/page.tsx',
  'app/experiences/[slug]/page.tsx',
  'app/guide/apply/layout.tsx',
  'app/blog/page.tsx',
];

async function readSrc(rel) {
  return readFile(path.join(WEB_ROOT, rel), 'utf8');
}

test('站內資產 public/images/og-default.png 存在', async () => {
  await assert.doesNotReject(
    access(path.join(WEB_ROOT, 'public/images/og-default.png'), FS.R_OK),
    'og-default 分享縮圖資產應存在於 public/images/',
  );
});

test('DEFAULT_ACTIVITY_OG_IMAGE 為絕對 URL 並指向 og-default', async () => {
  const src = await readSrc('src/lib/activity-jsonld.mjs');
  const m = src.match(/DEFAULT_ACTIVITY_OG_IMAGE\s*=\s*`([^`]+)`/);
  assert.ok(m, '應以 template literal 組出絕對 URL');
  assert.match(m[1], /\$\{[^}]*NEXT_PUBLIC_APP_URL[^}]*\}\/images\/og-default\.png$/);
  assert.ok(!src.includes(OLD_OG_URL), '不應殘留舊 Unsplash OG 圖');
});

test('各分享圖檔案改用 og-default、不殘留舊 Unsplash OG 圖', async () => {
  for (const rel of SHARE_THUMBNAIL_FILES) {
    const src = await readSrc(rel);
    assert.ok(src.includes(OG_ASSET), `${rel} 應引用 ${OG_ASSET}`);
    assert.ok(!src.includes(OLD_OG_URL), `${rel} 不應殘留舊 Unsplash OG 圖（w=1200 變體）`);
  }
});

test('root layout 的 openGraph 與 twitter 分享圖皆為 og-default', async () => {
  const src = await readSrc('app/layout.tsx');
  // openGraph.images 物件 + twitter.images 字串陣列各一
  const refs = src.split(OG_ASSET).length - 1;
  assert.ok(refs >= 2, 'openGraph 與 twitter 都應指向 og-default');
});
