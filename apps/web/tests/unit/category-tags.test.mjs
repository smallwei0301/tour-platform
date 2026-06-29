import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY_TAGS,
  CATEGORY_TAG_SLUGS,
  CATEGORY_TAG_LABELS_ZH,
  classifyActivityCategoryTag,
} from '../../src/lib/category-tags.mjs';

test('四大分類：數量、順序與 slug', () => {
  assert.equal(CATEGORY_TAGS.length, 4);
  assert.deepEqual(CATEGORY_TAG_SLUGS, ['mountain', 'river', 'culture', 'ecology']);
});

test('每個 slug 都有對應的中文 badge 標籤', () => {
  assert.deepEqual(CATEGORY_TAG_LABELS_ZH, {
    mountain: '山徑',
    river: '野溪',
    culture: '文化',
    ecology: '生態',
  });
});

test('柴山探洞（outdoor）→ mountain', () => {
  assert.equal(
    classifyActivityCategoryTag({
      category: 'outdoor',
      title: '高雄柴山探洞體驗｜走進城市邊緣的地形秘境',
      tagline: '由熟悉地形的人帶你走進柴山探洞路線。',
    }),
    'mountain',
  );
});

test('溯溪（outdoor）→ river（river 優先於 mountain）', () => {
  assert.equal(
    classifyActivityCategoryTag({
      category: 'outdoor',
      title: '花蓮秀姑巒溪溯溪全日冒險',
      tagline: '走進台灣最純淨的野溪，森林環繞。',
    }),
    'river',
  );
});

test('老街文化（culture）→ culture', () => {
  assert.equal(
    classifyActivityCategoryTag({ category: 'culture', title: '大稻埕百年老街深度漫步' }),
    'culture',
  );
});

test('夜市美食（food）→ culture（美食併入文化）', () => {
  assert.equal(
    classifyActivityCategoryTag({ category: 'food', title: '台北夜市美食文化探索' }),
    'culture',
  );
});

test('生態賞鳥（nature）→ ecology', () => {
  assert.equal(
    classifyActivityCategoryTag({ category: 'nature', title: '關渡濕地賞鳥生態導覽' }),
    'ecology',
  );
});

test('legacy category 值單獨也能映射', () => {
  assert.equal(classifyActivityCategoryTag({ category: 'outdoor' }), 'mountain');
  assert.equal(classifyActivityCategoryTag({ category: 'culture' }), 'culture');
  assert.equal(classifyActivityCategoryTag({ category: 'food' }), 'culture');
  assert.equal(classifyActivityCategoryTag({ category: 'nature' }), 'ecology');
});

test('中文 category 標籤也能映射', () => {
  assert.equal(classifyActivityCategoryTag({ category: '自然生態', title: '夜觀導覽' }), 'ecology');
  assert.equal(classifyActivityCategoryTag({ category: '戶外冒險', title: '登山健行' }), 'mountain');
});

test('無命中 / 空輸入 → 預設 culture', () => {
  assert.equal(classifyActivityCategoryTag({ title: '神秘體驗' }), 'culture');
  assert.equal(classifyActivityCategoryTag({}), 'culture');
  assert.equal(classifyActivityCategoryTag(null), 'culture');
});
