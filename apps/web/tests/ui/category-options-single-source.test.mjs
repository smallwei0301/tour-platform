import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Source-contract：三處編輯器（後台編輯／導遊編輯／導遊投稿）的四大分類下拉，
// 一律從 category-tags.mjs 匯入 CATEGORY_OPTIONS，不再各自複製 [{value,label}...]
// 陣列，避免 slug／中文標籤日後漂移（與行程卡 badge、主題篩選同一真實來源）。

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoWebRoot = join(__dirname, '..', '..');
const read = (rel) => readFileSync(join(repoWebRoot, rel), 'utf8');

const EDITORS = [
  'app/admin/activities/[id]/edit/page.tsx',
  'app/guide/activities/[id]/edit/page.tsx',
  'app/guide/new-activity/page.tsx',
];

for (const rel of EDITORS) {
  test(`${rel} 由 category-tags.mjs 匯入 CATEGORY_OPTIONS`, () => {
    const src = read(rel);
    // 匯入共用常數（允許 `as CATEGORIES` 別名）。
    assert.match(
      src,
      /import\s*\{\s*CATEGORY_OPTIONS(?:\s+as\s+\w+)?\s*\}\s*from\s*['"][^'"]*category-tags\.mjs['"]/,
      '應從 category-tags.mjs 匯入 CATEGORY_OPTIONS',
    );
    // 不再有本地硬編四大分類陣列（以中文標籤字面值為指標，這些標籤只應存在於 category-tags.mjs）。
    assert.doesNotMatch(src, /label:\s*['"]山徑['"]/, '不應再本地複製分類陣列');
  });
}
