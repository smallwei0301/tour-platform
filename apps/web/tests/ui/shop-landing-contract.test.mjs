/**
 * 商店首頁（/guides/[slug]/shop）source-contract
 *
 * 商店頁受 NEXT_PUBLIC_GUIDE_SHOP_ENABLED（預設 OFF）閘控，CI 的 e2e 打不到，
 * 故比照 tests/ui/issue1475-guide-shop-link.test.mjs 以 source-contract 鎖接線：
 *  - 資料源改用 getGuideShopDb（一次拿 guide＋方案，方案卡才有資料）
 *  - time-based ISR 兜底（revalidatePath 打不到 /shop 的既有缺口）
 *  - 個人化 H1／metadata
 *  - 方案卡、信任列、政策區、分享列、瀏覽事件 tracker 都掛在頁上
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shopDir = path.resolve(__dirname, '../../app/(non-locale)/guides/[slug]/shop');

const pageSource = readFileSync(path.join(shopDir, 'page.tsx'), 'utf8');
const shareBarSource = readFileSync(path.join(shopDir, 'ShopShareBar.tsx'), 'utf8');
const trackerSource = readFileSync(path.join(shopDir, 'ShopViewTracker.tsx'), 'utf8');

test('資料源：頁面主體用 getGuideShopDb（含方案），flag gate 保留', () => {
  assert.match(pageSource, /getGuideShopDb/, '頁面應改用 getGuideShopDb 取得方案');
  assert.match(pageSource, /await getGuideShopDb\(slug\)/, '頁面主體應 await getGuideShopDb(slug)');
  assert.match(pageSource, /if \(!isGuideShopEnabled\(\)\) return notFound\(\)/, 'flag gate 不得移除');
});

test('快取：revalidate = 60 兜底（revalidatePath 打不到 /shop）', () => {
  assert.match(pageSource, /export const revalidate = 60/);
});

test('標題：H1「線上預約」（對齊 Midao mockup），metadata 仍個人化', () => {
  assert.match(pageSource, /線上預約/, 'H1 應為「線上預約」（mockup 版面）');
  // 品牌後綴由 layout title.template 附加（issue1711 S2），頁面 title 不再自帶品牌
  assert.match(pageSource, /的祕島預約頁/, 'metadata title 仍個人化');
  assert.match(pageSource, /robots: \{ index: false \}/, '商店頁維持 noindex');
});

test('版面（對齊 Midao mockup 圖3）：hero＋引路人卡＋預約三步驟＋CTA', () => {
  assert.match(pageSource, /data-testid="shop-hero"/, 'hero 區塊');
  assert.match(pageSource, /祕島引路人/, '引路人徽章');
  assert.match(pageSource, /sib-guide-badge/, '徽章用 sib 樣式');
  assert.match(pageSource, /預約三步驟/, '三步驟區塊');
  assert.match(pageSource, /sib-steps/, '三步驟卡');
  assert.match(pageSource, /替我留一個位置/, 'CTA 文案對齊 mockup');
});

test('三步驟圖示使用附件真實資產（step-trip/date/contact）', () => {
  const iconsSource = readFileSync(path.join(shopDir, 'sib-icons.tsx'), 'utf8');
  assert.match(iconsSource, /step-trip\.png/);
  assert.match(iconsSource, /step-date\.png/);
  assert.match(iconsSource, /step-contact\.png/);
});

test('瀏覽事件 tracker 掛載（保留分析）', () => {
  assert.match(pageSource, /<ShopViewTracker/, '頁面應掛 ShopViewTracker');
});

test('ShopShareBar 元件契約仍有效（供後台重用）', () => {
  assert.match(shareBarSource, /'use client'/);
  assert.match(shareBarSource, /line\.me\/R\/msg\/text\//, 'LINE 分享用純連結，無 SDK');
  assert.match(shareBarSource, /QRCodeSVG/, 'QR 用既有 qrcode.react');
  assert.match(shareBarSource, /event_name: 'shop_share'/);
});

test('ShopViewTracker：client 端發 shop_view，不渲染內容', () => {
  assert.match(trackerSource, /'use client'/);
  assert.match(trackerSource, /event_name: 'shop_view'/);
  assert.match(trackerSource, /return null/);
});
