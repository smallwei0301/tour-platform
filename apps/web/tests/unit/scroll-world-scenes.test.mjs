import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCROLL_WORLD_PRELUDE, SCROLL_WORLD_SCENES, WORLD_MEDIA_ORIGIN } from '../../src/lib/scroll-world/scenes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '../..');
const repoRoot = path.resolve(webRoot, '../..');

// BRAND_BOOK Section 03 八色系統——/world 場景 accent 只允許取自這裡
const BRAND_COLORS = new Set([
  '#1A2E1F', // 山墨綠
  '#F4ECD8', // 米黃
  '#C2542E', // 朝霞橘
  '#5E7A4F', // 次綠
  '#B08D3E', // 黃銅金
  '#A8B09E', // 灰綠
  '#EBE1C7', // 淺米
  '#2A2422', // 深棕
]);

test('場景註冊表：id 唯一、欄位齊備', () => {
  assert.ok(SCROLL_WORLD_SCENES.length >= 5, '至少五景才成立飛行敘事');
  const ids = SCROLL_WORLD_SCENES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'id 不得重複');
  for (const scene of SCROLL_WORLD_SCENES) {
    assert.ok(scene.id && typeof scene.id === 'string');
    assert.ok(scene.still?.startsWith('/'), `${scene.id} 的 still 必須是站內路徑`);
    assert.ok(typeof scene.clip === 'string' && typeof scene.clipWebm === 'string', `${scene.id} 的 clip／clipWebm 需為字串 URL`);
    assert.ok(scene.href?.startsWith('/'), `${scene.id} 的 href 必須是站內路徑`);
  }
});

test('場景 accent 一律取 BRAND_BOOK 八色系統', () => {
  for (const scene of SCROLL_WORLD_SCENES) {
    assert.ok(BRAND_COLORS.has(scene.accent), `${scene.id} 的 accent ${scene.accent} 不在八色系統內`);
  }
});

test('每景 CTA 目的地都是存在的 [locale] 頁面', () => {
  for (const scene of SCROLL_WORLD_SCENES) {
    const pagePath = path.join(webRoot, 'app', '[locale]', ...scene.href.split('/').filter(Boolean), 'page.tsx');
    assert.ok(fs.existsSync(pagePath), `${scene.id} 的 href ${scene.href} 找不到 ${pagePath}`);
  }
});

test('序章設定：still 檔存在、origin/target 為合法百分比座標、zoom > 1', () => {
  const stillPath = path.join(webRoot, 'public', SCROLL_WORLD_PRELUDE.still.replace(/^\//, ''));
  assert.ok(fs.existsSync(stillPath), `序章圖 ${SCROLL_WORLD_PRELUDE.still} 找不到 ${stillPath}`);
  assert.match(SCROLL_WORLD_PRELUDE.origin, /^\d{1,3}% \d{1,3}%$/);
  assert.match(SCROLL_WORLD_PRELUDE.target, /^\d{1,3}% \d{1,3}%$/);
  assert.ok(SCROLL_WORLD_PRELUDE.zoom > 1 && SCROLL_WORLD_PRELUDE.zoom <= 3);
});

test('序章平移不露邊框：拉近＋平移全程畫面覆蓋視窗', () => {
  const pct = (s) => s.split(' ').map((v) => parseFloat(v) / 100);
  const [ox, oy] = pct(SCROLL_WORLD_PRELUDE.origin);
  const [tx, ty] = pct(SCROLL_WORLD_PRELUDE.target);
  const dx = tx - ox;
  const dy = ty - oy;
  const grow = SCROLL_WORLD_PRELUDE.zoom - 1;
  // 任一進度 e ∈ (0,1]：邊界位移與縮放擴張同為 e 的線性函數，檢查 e=1 即可
  assert.ok(ox * grow + dx >= 0, '左邊界外露');
  assert.ok((1 - ox) * grow - dx >= 0, '右邊界外露');
  assert.ok(oy * grow + dy >= 0, '上邊界外露');
  assert.ok((1 - oy) * grow - dy >= 0, '下邊界外露');
});

test('每景 still 圖檔實際存在於 public/', () => {
  for (const scene of SCROLL_WORLD_SCENES) {
    const stillPath = path.join(webRoot, 'public', scene.still.replace(/^\//, ''));
    assert.ok(fs.existsSync(stillPath), `${scene.id} 的 still ${scene.still} 找不到 ${stillPath}`);
  }
});

test('clip／clipWebm 皆為 Blob origin 下的 hash 路徑，且場景 id 與副檔名一致', () => {
  for (const scene of SCROLL_WORLD_SCENES) {
    for (const [field, ext] of [['clip', 'mp4'], ['clipWebm', 'webm']]) {
      const url = new URL(scene[field]);
      assert.equal(url.origin, WORLD_MEDIA_ORIGIN, `${scene.id}.${field} origin 不符`);
      assert.match(
        url.pathname,
        new RegExp(`^/world-media/v1/${scene.id}/[a-f0-9]{64}\\.${ext}$`),
        `${scene.id}.${field} 路徑不符規則`
      );
    }
  }
});

test('Blob URL 內的 hash 等於 media/world-videos 原檔 SHA-256（離線完整性）', () => {
  for (const scene of SCROLL_WORLD_SCENES) {
    for (const field of ['clip', 'clipWebm']) {
      const { pathname } = new URL(scene[field]);
      const [, hash, ext] = pathname.match(/\/([a-f0-9]{64})\.(mp4|webm)$/);
      const file = path.join(repoRoot, 'media', 'world-videos', `${scene.id}.${ext}`);
      assert.ok(fs.existsSync(file), `${scene.id}.${ext} 原檔不存在：${file}`);
      const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      assert.equal(digest, hash, `${scene.id}.${ext} 原檔 SHA-256 與 URL hash 不一致`);
    }
  }
});

test('apps/web/public/videos 不存在（影片不再打包進部署）', () => {
  assert.equal(fs.existsSync(path.join(webRoot, 'public', 'videos')), false);
});

for (const localeFile of ['zh-Hant.json', 'en.json']) {
  test(`i18n ${localeFile}：home3d 文案齊備`, () => {
    const messages = JSON.parse(fs.readFileSync(path.join(webRoot, 'messages', localeFile), 'utf8'));
    const ns = messages.home3d;
    assert.ok(ns, 'home3d namespace 存在');
    for (const key of ['metaTitle', 'metaDescription', 'hint', 'progressLabel']) {
      assert.ok(typeof ns[key] === 'string' && ns[key].length > 0, `缺 home3d.${key}`);
    }
    for (const scene of SCROLL_WORLD_SCENES) {
      const copy = ns.scenes?.[scene.id];
      assert.ok(copy, `缺 home3d.scenes.${scene.id}`);
      for (const key of ['eyebrow', 'title', 'body', 'cta']) {
        assert.ok(typeof copy[key] === 'string' && copy[key].length > 0, `缺 home3d.scenes.${scene.id}.${key}`);
      }
      assert.ok(Array.isArray(copy.tags) && copy.tags.length > 0, `home3d.scenes.${scene.id}.tags 需為非空陣列`);
      for (const tag of copy.tags) {
        assert.ok(typeof tag === 'string' && tag.length > 0);
      }
    }
  });
}
