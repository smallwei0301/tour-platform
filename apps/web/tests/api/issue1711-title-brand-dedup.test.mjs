// issue1711 後續 S2：<title> 品牌後綴去重契約。
// 品牌字串統一由 layout 的 title.template（seo.titleTemplate）附加；
// 任何流入 Metadata.title 的 i18n 字串不得再自帶品牌，否則 <title> 會出現
// 兩次品牌（例：「認識導遊 | Midao 祕島 | Midao 祕島 — 台灣在地導遊」）。
// 注意：metaTitleShort／ogTitle 只餵 og/twitter（不套 template），品牌保留是刻意的。
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const LOCALES = ['zh-Hant', 'en'];
// 這些 key 會流入 Metadata.title（經 title.template 加品牌），不得自帶「品牌後綴」。
// 只擋後綴樣式（「… | Midao …」結尾）：品牌出現在主題位置（如「Midao World | …」）
// 是合法命名，不會被 template 疊成兩次後綴。
const TITLE_KEY_NAMES = new Set(['metaTitle', 'metaTitleSuffix']);
const BRAND_SUFFIX_RE = /\|\s*Midao[^|]*$/;

function collectViolations(obj, path = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = path ? `${path}.${k}` : k;
    if (typeof v === 'string') {
      if (TITLE_KEY_NAMES.has(k) && BRAND_SUFFIX_RE.test(v)) out.push(`${p} = ${v}`);
    } else if (v && typeof v === 'object') {
      out.push(...collectViolations(v, p));
    }
  }
  return out;
}

describe('issue1711 S2: title 品牌後綴去重', () => {
  for (const locale of LOCALES) {
    it(`${locale}: metaTitle 類 key 不得自帶品牌字串`, () => {
      const messages = JSON.parse(
        readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), 'utf8')
      );
      const violations = collectViolations(messages);
      assert.deepEqual(violations, [], `以下 key 仍自帶品牌（會被 titleTemplate 重複附加）：\n${violations.join('\n')}`);
    });

    it(`${locale}: seo.activitiesCollectionName 不得自帶品牌`, () => {
      const messages = JSON.parse(
        readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), 'utf8')
      );
      assert.ok(!messages.seo.activitiesCollectionName.includes('Midao'));
    });

    it(`${locale}: titleTemplate 仍存在（品牌附加的唯一來源）`, () => {
      const messages = JSON.parse(
        readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), 'utf8')
      );
      assert.match(messages.seo.titleTemplate, /^%s \| Midao/);
    });
  }

  it('首頁 title 用 absolute 跳過 template（主題即品牌，不重複）', () => {
    const src = readFileSync(new URL('../../app/[locale]/page.tsx', import.meta.url), 'utf8');
    assert.match(src, /title:\s*\{\s*absolute:/, '首頁 Metadata.title 應為 { absolute: … }');
  });

  it('blog 文章頁不再用 metaTitleSuffix 自加品牌', () => {
    const src = readFileSync(new URL('../../app/[locale]/blog/[slug]/page.tsx', import.meta.url), 'utf8');
    assert.ok(!src.includes("metaTitleSuffix"), 'blog/[slug] 不應再引用 metaTitleSuffix');
  });
});
