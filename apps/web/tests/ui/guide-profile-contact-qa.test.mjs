/**
 * 「詢問導遊」按鈕修復 — 認識導遊頁（/guides/[slug]）的傳訊息按鈕原為死按鈕
 * （無 handler，且 server component 無法掛 onClick）。站上訂單前的諮詢管道＝
 * 行程詳情頁的旅客問答（activity_qa / ActivityQASection / /api/qa），綁定單一行程。
 *
 * 本測試鎖定 wiring：
 *  1. 導遊頁按鈕改為 <Link>，導向導遊主行程的問答區塊（#section-qa）。
 *  2. href 由真實 fixture 導遊資料 + buildActivityHref 計算，驗證可解析的行程 URL。
 *  3. 行程詳情頁的「詢問導遊」改為錨點連結 #section-qa（同一機制的入口）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getActivitiesByGuide } from '../../src/fixtures/data.ts';
import { buildActivityHref } from '../../src/lib/activity-url.ts';

const here = dirname(fileURLToPath(import.meta.url));
const guidePageSrc = readFileSync(resolve(here, '../../app/guides/[slug]/page.tsx'), 'utf8');
const activityPageSrc = readFileSync(
  resolve(here, '../../app/activities/[region]/[slug]/page.tsx'),
  'utf8',
);

test('導遊頁不再有死的「傳訊息給導遊」按鈕', () => {
  // 舊版：<button ...>傳訊息給導遊</button>，無 onClick，按下去沒反應。
  assert.ok(
    !/<button[^>]*>\s*傳訊息給導遊/.test(guidePageSrc),
    '不應再有死的 <button>傳訊息給導遊',
  );
});

test('導遊頁「詢問導遊」是導向 #section-qa 的 Link', () => {
  // 計算出 contactGuideHref 並用在 primary CTA 的 <Link href={...}>。
  assert.match(
    guidePageSrc,
    /const contactGuideHref =/,
    '應計算 contactGuideHref',
  );
  assert.match(
    guidePageSrc,
    /#section-qa/,
    'href 應錨定到旅客問答區塊 #section-qa',
  );
  assert.match(
    guidePageSrc,
    /<Link[^>]*href=\{contactGuideHref\}[^>]*>[^<]*詢問導遊/,
    'primary CTA 應是 href={contactGuideHref} 的 Link',
  );
});

test('contactGuideHref 由真實 fixture 導遊資料解析為有效行程問答 URL', () => {
  // andy-lee 在 fixtures 有一筆上架行程（kaohsiung-chaishan-cave-experience）。
  // 對應 getGuideBySlugDb fixture 分支：activities = getActivitiesByGuide(slug)。
  const primary = getActivitiesByGuide('andy-lee')[0];
  assert.ok(primary, '導遊應至少有一筆行程');

  const expected = `${buildActivityHref({
    slug: primary.slug,
    region: primary.region,
    regionSlug: primary.regionSlug,
  })}#section-qa`;

  // 形狀：/activities/<region>/<slug>#section-qa
  assert.match(expected, /^\/activities\/[^/]+\/[^/#]+#section-qa$/);
  assert.ok(expected.includes(primary.slug), 'URL 應含行程 slug');
});

test('導遊無上架行程時 fallback 到 /activities（仍非死按鈕）', () => {
  assert.match(
    guidePageSrc,
    /primaryActivity\s*\?[\s\S]*?:\s*'\/activities'/,
    '無 primaryActivity 時應退回 /activities',
  );
});

test('行程詳情頁「詢問導遊」是錨定 #section-qa 的連結（非死按鈕）', () => {
  assert.ok(
    !/<button[^>]*>\s*✉️ 詢問導遊\s*<\/button>/.test(activityPageSrc),
    '不應再有死的 <button>✉️ 詢問導遊',
  );
  assert.match(
    activityPageSrc,
    /<a[^>]*href="#section-qa"[\s\S]*?詢問導遊/,
    '應改為 <a href="#section-qa"> 的錨點連結',
  );
});
