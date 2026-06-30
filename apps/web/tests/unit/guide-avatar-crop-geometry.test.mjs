// 導遊大頭照互動式裁切的純幾何運算單元測試。
// 對應 src/lib/avatar-crop-geometry.ts（UI 元件 ImageCropModal 共用）。

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  coverBaseScale,
  clampOffset,
  sourceRect,
  zoomAboutCenter,
} from '../../src/lib/avatar-crop-geometry.ts';

test('coverBaseScale: 橫圖以高度為準填滿正方形 viewport', () => {
  // 1000x500 原圖、300x300 viewport → 須放大到高度 300，倍率 = 300/500 = 0.6
  assert.equal(coverBaseScale(1000, 500, 300, 300), 0.6);
});

test('coverBaseScale: 直圖以寬度為準填滿正方形 viewport', () => {
  // 500x1000 → 倍率 = 300/500 = 0.6
  assert.equal(coverBaseScale(500, 1000, 300, 300), 0.6);
});

test('coverBaseScale: 防呆，非正尺寸回傳 1', () => {
  assert.equal(coverBaseScale(0, 100, 300, 300), 1);
  assert.equal(coverBaseScale(100, 0, 300, 300), 1);
});

test('clampOffset: 影像恰好覆蓋時位移收斂到 0', () => {
  // disp 600x600、view 300x300 → 合法 x/y 區間 [-300, 0]
  assert.deepEqual(clampOffset(50, 50, 600, 600, 300, 300), { x: 0, y: 0 });
  assert.deepEqual(clampOffset(-500, -500, 600, 600, 300, 300), { x: -300, y: -300 });
  assert.deepEqual(clampOffset(-100, -200, 600, 600, 300, 300), { x: -100, y: -200 });
});

test('clampOffset: disp 等於 view 時只能是 0（不可露出底色）', () => {
  assert.deepEqual(clampOffset(20, -20, 300, 300, 300, 300), { x: 0, y: 0 });
});

test('sourceRect: 位移為 0、倍率 0.6 時取整張覆蓋區', () => {
  // sw = sh = 300/0.6 = 500；對應 cover 後的 500x500 來源方塊
  const r = sourceRect(0, 0, 0.6, 300, 300);
  assert.equal(Math.round(r.sx) + 0, 0);
  assert.equal(Math.round(r.sy) + 0, 0);
  assert.equal(Math.round(r.sw), 500);
  assert.equal(Math.round(r.sh), 500);
});

test('sourceRect: 負位移換算成正的來源起點', () => {
  // offset.x = -150、scale = 0.6 → sx = 150/0.6 = 250
  const r = sourceRect(-150, -60, 0.6, 300, 300);
  assert.equal(r.sx, 250);
  assert.equal(r.sy, 100);
});

test('sourceRect: scale 非正時退回 1 不除零', () => {
  const r = sourceRect(-30, -30, 0, 300, 300);
  assert.equal(r.sx, 30);
  assert.equal(r.sw, 300);
});

test('zoomAboutCenter: 維持 viewport 中心對準的影像點不動', () => {
  // 起始置中、scale 0.6 → 中心對準的來源點 = (150 - offset)/0.6
  const prev = { x: -100, y: -100 };
  const prevScale = 0.6;
  const nextScale = 1.2;
  const centerSrcX = (150 - prev.x) / prevScale;
  const centerSrcY = (150 - prev.y) / prevScale;
  const next = zoomAboutCenter(prev, prevScale, nextScale, 300, 300);
  // 放大後同一來源點仍應映射回 viewport 中心 150。
  assert.ok(Math.abs(next.x + centerSrcX * nextScale - 150) < 1e-9);
  assert.ok(Math.abs(next.y + centerSrcY * nextScale - 150) < 1e-9);
});

test('zoomAboutCenter: 放大讓影像更大，位移更負（往左上移以維持中心）', () => {
  const next = zoomAboutCenter({ x: 0, y: 0 }, 0.6, 1.2, 300, 300);
  assert.ok(next.x < 0);
  assert.ok(next.y < 0);
});
