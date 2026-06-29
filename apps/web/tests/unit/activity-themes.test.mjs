import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITY_THEMES,
  ACTIVITY_THEME_LABELS,
  getThemeByLabel,
  isActivityInTheme,
} from '../../src/lib/activity-themes.mjs';

const CAVE = {
  category: 'outdoor',
  title: '高雄柴山探洞體驗｜跟著 Andy Lee 走進城市邊緣的地形秘境',
  tagline: '不是一般健行路線，而是由熟悉地形的人帶你走進平常不會自己到達的柴山探洞路線。',
  shortDescription: '探索城市邊緣最有記憶點的地形秘境。',
};
const CULTURE = {
  category: 'culture',
  title: '大稻埕百年老街深度漫步',
  tagline: '不是走馬看花，而是真正認識一個活了百年的街區。',
};
const ECOLOGY = {
  category: 'nature',
  title: '關渡濕地賞鳥生態導覽',
  tagline: '走進潮間帶，認識台灣的自然生態。',
};
const RIVER = {
  category: 'outdoor',
  title: '花蓮秀姑巒溪溯溪全日冒險',
  tagline: '走進台灣最純淨的野溪，用雙腳感受花蓮的力量。',
};

test('五大主題標籤與順序一致', () => {
  assert.deepEqual(ACTIVITY_THEME_LABELS, [
    '柴山探洞',
    '野外溪流',
    '文化歷史',
    '自然生態',
    '山野秘境',
  ]);
  assert.equal(ACTIVITY_THEMES.length, 5);
});

test('每個主題都有對應的 theme slug', () => {
  assert.deepEqual(
    ACTIVITY_THEMES.map((t) => t.slug),
    ['cave-exploration', 'river-trekking', 'culture-history', 'ecology', 'mountain-wilderness'],
  );
});

test('getThemeByLabel 容忍 emoji 與編碼差異', () => {
  assert.equal(getThemeByLabel('柴山探洞 🔦')?.slug, 'cave-exploration');
  assert.equal(getThemeByLabel('野外溪流')?.slug, 'river-trekking');
  assert.equal(getThemeByLabel('不存在'), undefined);
});

test('柴山活動歸入「柴山探洞」', () => {
  assert.equal(isActivityInTheme(CAVE, '柴山探洞'), true);
});

test('溯溪活動歸入「野外溪流」（標題／標語關鍵字命中）', () => {
  assert.equal(isActivityInTheme(RIVER, '野外溪流'), true);
});

test('老街活動歸入「文化歷史」', () => {
  assert.equal(isActivityInTheme(CULTURE, '文化歷史'), true);
});

test('賞鳥濕地活動歸入「自然生態」', () => {
  assert.equal(isActivityInTheme(ECOLOGY, '自然生態'), true);
});

test('中文 category 標籤也能比對（自然生態／文化歷史）', () => {
  assert.equal(isActivityInTheme({ category: '自然生態', title: '夜觀生態之旅' }, '自然生態'), true);
  assert.equal(isActivityInTheme({ category: '文化歷史', title: '鹿港古蹟導覽' }, '文化歷史'), true);
});

test('不相關主題不誤判', () => {
  assert.equal(isActivityInTheme(CULTURE, '自然生態'), false);
  assert.equal(isActivityInTheme(ECOLOGY, '柴山探洞'), false);
});
