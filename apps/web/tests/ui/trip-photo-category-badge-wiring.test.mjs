import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Source-contract：鎖住行程卡片「分類 badge」的 render 接線。
// bug（行程照片上的分類與編輯器選擇不一致，例：選山徑卻顯示生態）的根因在
// classifyActivityCategoryTag——badge 必須由它推導，且該函式已修為「明確
// category 優先」。這裡確保前台兩個渲染 badge 的元件都接到同一函式，避免日後
// 有人把 badge 改回吃 region 或 raw category 而讓修正失效。

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoWebRoot = join(__dirname, '..', '..');
const read = (rel) => readFileSync(join(repoWebRoot, rel), 'utf8');

test('ActivitiesContent badge 由 classifyActivityCategoryTag 推導', () => {
  const src = read('app/[locale]/activities/ActivityCard.tsx');
  assert.match(src, /import\s*\{\s*classifyActivityCategoryTag\s*\}\s*from\s*['"][^'"]*category-tags\.mjs['"]/);
  // badge span 直接以 classifyActivityCategoryTag(a) 取得分類 slug
  assert.match(src, /categoryTag\.\$\{classifyActivityCategoryTag\(a\)\}/);
});

test('FeaturedTours badge 由 classifyActivityCategoryTag 推導', () => {
  const src = read('src/components/home/FeaturedTours.tsx');
  assert.match(src, /import\s*\{[^}]*classifyActivityCategoryTag[^}]*\}\s*from\s*['"][^'"]*category-tags\.mjs['"]/);
  assert.match(src, /CATEGORY_TAG_LABELS_ZH\[classifyActivityCategoryTag\(a\)\]/);
});
