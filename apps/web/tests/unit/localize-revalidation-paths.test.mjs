import { test } from 'node:test';
import assert from 'node:assert/strict';

import { localizeRevalidationPaths } from '../../src/lib/region-slug.mjs';
import { routing } from '../../src/i18n/routing.ts';

// #1488 多語言搬遷後，公開頁都在 app/[locale]/，as-needed 內部 rewrite 讓快取鍵帶
// locale。revalidatePath 若只給無 locale 路徑會打不到 → admin 改完前台不即時更新。
// localizeRevalidationPaths 把每條路徑展開成「原路徑 + 各 locale 前綴版本」。

test('每條路徑都展開成原路徑 + 各 locale 前綴（/ 特例）', () => {
  const out = localizeRevalidationPaths(['/', '/activities', '/activities/kaohsiung/x']);

  // 原路徑（相容）仍在
  for (const p of ['/', '/activities', '/activities/kaohsiung/x']) {
    assert.ok(out.includes(p), `缺原路徑 ${p}`);
  }
  // 每個 locale 版本都有；'/' → '/<locale>'（不是 '//locale'）
  for (const locale of routing.locales) {
    assert.ok(out.includes(`/${locale}`), `缺 ${locale} 首頁`);
    assert.ok(out.includes(`/${locale}/activities`), `缺 ${locale} 列表`);
    assert.ok(out.includes(`/${locale}/activities/kaohsiung/x`), `缺 ${locale} 詳情`);
  }
  assert.ok(!out.some((p) => p.startsWith('//')), '不得出現 // 壞路徑');
});

test('去重、忽略空值', () => {
  const out = localizeRevalidationPaths(['/activities', '/activities', '', null, undefined, '  ']);
  const activitiesCount = out.filter((p) => p === '/activities').length;
  assert.equal(activitiesCount, 1, '重複路徑需去重');
  assert.ok(!out.includes(''), '不得含空字串');
});

test('非陣列輸入回空陣列（不 throw）', () => {
  assert.deepEqual(localizeRevalidationPaths(null), []);
  assert.deepEqual(localizeRevalidationPaths(undefined), []);
});
