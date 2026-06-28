import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

test('issue621 checkout page shows explicit legacy/deprecation banner and points to V2 booking route', async () => {
  const rel = 'app/checkout/page.tsx';
  const src = await readFile(path.join(ROOT, rel), 'utf8');

  // #multilingual: legacy/deprecation 文案移到 messages/zh-Hant.json 的 checkout namespace；
  // 頁面用 m.legacyNotice* 引用。內容類斷言改讀繁中 catalog。
  const zh = JSON.parse(await readFile(path.join(ROOT, 'messages/zh-Hant.json'), 'utf8'));

  assert.match(
    zh.checkout.legacyNoticeTitle,
    /Legacy 舊版預約流程|舊版預約流程（Legacy）|舊版結帳入口/,
    'checkout.legacyNoticeTitle should clearly label the page as legacy/deprecation path'
  );
  assert.match(src, /m\.legacyNoticeTitle/, 'checkout page must reference m.legacyNoticeTitle');

  assert.match(
    src,
    /\/booking\/\$\{encodeURIComponent\(slug\)\}/,
    'checkout should provide a visible CTA that routes users back to V2 /booking/[slug] entry'
  );

  assert.match(
    `${zh.checkout.legacyNoticeTitle} ${zh.checkout.legacyNoticeBody}`,
    /legacy|deprecated|備援|fallback/i,
    'checkout deprecation copy should explicitly communicate legacy/fallback semantics'
  );
  assert.match(src, /m\.legacyNoticeBody/, 'checkout page must reference m.legacyNoticeBody');
});
