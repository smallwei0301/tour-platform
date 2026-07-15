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
  'app/(non-locale)/admin/activities/[id]/edit/page.tsx',
  'app/(non-locale)/guide/activities/[id]/edit/page.tsx',
  'app/(non-locale)/guide/new-activity/page.tsx',
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

test('導遊申請「專長領域」選項同步為四大分類（取自 CATEGORY_OPTIONS）', () => {
  const src = read('app/(non-locale)/guide/apply/page.tsx');
  assert.match(
    src,
    /import\s*\{\s*CATEGORY_OPTIONS\s*\}\s*from\s*['"][^'"]*category-tags\.mjs['"]/,
    '應從 category-tags.mjs 匯入 CATEGORY_OPTIONS',
  );
  // specialtyOptions 由四大分類的 label 推導，非本地硬編清單。
  assert.match(src, /specialtyOptions\s*=\s*CATEGORY_OPTIONS\.map\(/);
  // 舊的專長字面清單不應殘留。
  for (const legacy of ['文化走讀', '美食導覽', '山林健行', '水上活動', '單車行程']) {
    assert.doesNotMatch(src, new RegExp(legacy), `不應殘留舊專長選項「${legacy}」`);
  }
});
