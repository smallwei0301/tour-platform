/**
 * Issue #1595 — 未開站 locale（ja/ko）guard 的 source-contract。
 *
 * 真實 noindex 行為由 e2e/issue1595-hidden-locale-guard.spec.ts 對 dev server 驗證；
 * 本檔鎖定「不會漂移」的三件事：
 *  1. [locale]/layout 對「未開站 locale」以 generateMetadata 回 noindex（非法 locale 才 notFound）；
 *     且只預建可見 locale（generateStaticParams = VISIBLE_LOCALES）
 *  2. sitemap／hreflang 的 locale 清單與 VISIBLE_LOCALES 同源（單一常數，非硬編 ja/ko）
 *  3. VISIBLE_LOCALES 目前不含 ja/ko（開站前的實際狀態）
 *
 * 註：本區段經 middleware(next-intl) rewrite 進入，rewrite 下游 notFound() 只能 soft-404
 * （HTTP 200），且 middleware.ts 為凍結區——故採 noindex（不依賴狀態碼）為可靠解。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VISIBLE_LOCALES, routing } from '../../src/i18n/routing.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

test('T1595.1 — [locale]/layout：未開站 locale 回 noindex、非法 locale notFound、只預建可見 locale', () => {
  const src = read('app/[locale]/layout.tsx');
  assert.match(src, /VISIBLE_LOCALES/, 'layout 應 import VISIBLE_LOCALES');
  // generateMetadata 依 VISIBLE_LOCALES 決定 robots：可見 locale 可索引，未開站 locale noindex
  assert.match(src, /export async function generateMetadata/, '應有 generateMetadata');
  assert.match(
    src,
    /VISIBLE_LOCALES[^\n]*\.includes\(locale\)/,
    'generateMetadata 應以 VISIBLE_LOCALES 判定是否可見'
  );
  assert.match(
    src,
    /robots:\s*\{\s*index:\s*visible,\s*follow:\s*visible\s*\}/,
    'robots 必須直接受 visible 控制，未開站 locale 才會 index:false/follow:false'
  );
  // 非法 locale（不在四語系）仍走真 404
  assert.match(src, /!hasLocale\(routing\.locales,\s*locale\)/, '非法 locale 應 notFound');
  assert.match(src, /notFound\(\)/, '非法 locale 應 notFound');
  // generateStaticParams 只預建可見 locale（不預建 ja/ko）
  assert.match(
    src,
    /generateStaticParams[\s\S]*VISIBLE_LOCALES\.map/,
    'generateStaticParams 應只映射 VISIBLE_LOCALES'
  );
});

test('T1595.2 — sitemap／hreflang 的 locale 清單與 VISIBLE_LOCALES 同源', () => {
  const alt = read('src/lib/seo-alternates.ts');
  // 逐 locale 迭代必須來自 VISIBLE_LOCALES，不得硬編 ja/ko 進 languages
  assert.match(alt, /for\s*\(const\s+l\s+of\s+VISIBLE_LOCALES\)/, 'languages 應迭代 VISIBLE_LOCALES');
  assert.ok(
    !/languages\[['"]ja['"]\]|languages\[['"]ko['"]\]/.test(alt),
    'hreflang languages 不得硬編 ja/ko（同源於 VISIBLE_LOCALES 才對）'
  );
});

test('T1595.3 — 開站前狀態：VISIBLE_LOCALES 為 zh-Hant/en，ja/ko config-ready 但未開', () => {
  assert.deepEqual([...VISIBLE_LOCALES].sort(), ['en', 'zh-Hant']);
  // routing 仍保留四語系（config-ready）
  assert.ok(routing.locales.includes('ja') && routing.locales.includes('ko'), 'ja/ko 仍 config-ready');
});
