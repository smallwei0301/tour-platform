/**
 * 健檢 v2 SEO-1/3（docs/operations/reports/repo-health-audit-20260702.md）：
 * canonical＋hreflang helper 與關鍵頁面／sitemap wiring。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const { localizePath, buildAlternates, sitemapLanguageAlternates } = await import(
  '../../src/lib/seo-alternates.ts'
);

describe('localizePath', () => {
  it('zh-Hant（預設）不加前綴', () => {
    assert.equal(localizePath('/activities', 'zh-Hant'), '/activities');
    assert.equal(localizePath('/', 'zh-Hant'), '/');
  });

  it('en 加 /en 前綴', () => {
    assert.equal(localizePath('/activities', 'en'), '/en/activities');
    assert.equal(localizePath('/', 'en'), '/en');
  });

  it('正規化多餘斜線', () => {
    assert.equal(localizePath('activities/', 'en'), '/en/activities');
  });
});

describe('buildAlternates', () => {
  it('zh-Hant 頁 canonical 指自己、languages 含 zh-Hant/en/x-default', () => {
    const alt = buildAlternates('/activities/kaohsiung/chaishan-cave', 'zh-Hant');
    assert.equal(alt.canonical, '/activities/kaohsiung/chaishan-cave');
    assert.equal(alt.languages['zh-Hant'], '/activities/kaohsiung/chaishan-cave');
    assert.equal(alt.languages['en'], '/en/activities/kaohsiung/chaishan-cave');
    assert.equal(alt.languages['x-default'], '/activities/kaohsiung/chaishan-cave');
  });

  it('en 頁 canonical 指 /en 版', () => {
    const alt = buildAlternates('/guides', 'en');
    assert.equal(alt.canonical, '/en/guides');
  });

  it('未開站 locale（ja）canonical 退回預設繁中，且 hreflang 不宣告 ja', () => {
    const alt = buildAlternates('/activities', 'ja');
    assert.equal(alt.canonical, '/activities');
    assert.equal(alt.languages['ja'], undefined);
  });
});

describe('sitemapLanguageAlternates', () => {
  it('回傳絕對 URL 的語系變體', () => {
    const { languages } = sitemapLanguageAlternates('/activities', 'https://example.com');
    assert.equal(languages['zh-Hant'], 'https://example.com/activities');
    assert.equal(languages['en'], 'https://example.com/en/activities');
  });

  it('根路徑不留尾斜線', () => {
    const { languages } = sitemapLanguageAlternates('/', 'https://example.com/');
    assert.equal(languages['zh-Hant'], 'https://example.com');
    assert.equal(languages['en'], 'https://example.com/en');
  });
});

describe('source contract — 關鍵頁面與 sitemap wiring', () => {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

  const pages = [
    ['app/[locale]/page.tsx', '首頁'],
    ['app/[locale]/activities/page.tsx', '行程列表'],
    ['app/[locale]/activities/[region]/page.tsx', '地區列表'],
    ['app/[locale]/activities/[region]/[slug]/page.tsx', '行程詳情'],
    ['app/[locale]/guides/page.tsx', '導遊列表'],
    ['app/[locale]/guides/[slug]/page.tsx', '導遊詳情'],
  ];

  for (const [rel, name] of pages) {
    it(`${name}（${rel}）metadata 帶 alternates（buildAlternates）`, () => {
      const src = read(rel);
      assert.match(src, /buildAlternates\(/, `${name} 必須呼叫 buildAlternates`);
      assert.match(src, /alternates/, `${name} metadata 必須含 alternates`);
    });
  }

  it('sitemap.ts explicitly emits every public visible-locale URL with reciprocal alternates', () => {
    const src = read('app/sitemap.ts');
    assert.match(src, /localizedSitemapUrls\(/, 'sitemap 必須用共用 locale URL helper');
    assert.match(src, /alternates/, 'sitemap entries 必須含 alternates');
  });
});
