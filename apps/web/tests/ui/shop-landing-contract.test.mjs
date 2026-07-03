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
const shopDir = path.resolve(__dirname, '../../app/guides/[slug]/shop');

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

test('個人化：H1 與 metadata 用「◯◯ 的祕島預約頁」', () => {
  assert.match(pageSource, /\{guide\.displayName\} 的祕島預約頁/, 'H1 應個人化');
  assert.match(pageSource, /的祕島預約頁 \| Midao 祕島/, 'metadata title 應同步');
  assert.match(pageSource, /robots: \{ index: false \}/, '商店頁維持 noindex');
});

test('方案卡：testid＋深連結帶 activityId/planId', () => {
  assert.match(pageSource, /data-testid="shop-landing-plan-card"/);
  assert.match(pageSource, /shop\/book\?activityId=/, '方案卡應深連結預選方案');
  assert.match(pageSource, /planId=/, '深連結需帶 planId');
});

test('信任列與政策區塊存在', () => {
  assert.match(pageSource, /data-testid="shop-trust-row"/);
  assert.match(pageSource, /祕島審核導遊/);
  assert.match(pageSource, /data-testid="shop-policy"/);
  assert.match(pageSource, /\/legal\/refund/, '政策區應連退款政策');
});

test('分享列與瀏覽事件 tracker 掛載', () => {
  assert.match(pageSource, /<ShopShareBar/, '頁面應掛 ShopShareBar');
  assert.match(pageSource, /<ShopViewTracker/, '頁面應掛 ShopViewTracker');
});

test('ShopShareBar：複製／LINE 純連結／QR（qrcode.react），發 shop_share', () => {
  assert.match(shareBarSource, /'use client'/);
  assert.match(shareBarSource, /navigator\.clipboard/, '複製需用 clipboard API');
  assert.match(shareBarSource, /execCommand\('copy'\)/, '複製需有 execCommand 後備');
  assert.match(shareBarSource, /line\.me\/R\/msg\/text\//, 'LINE 分享用純連結，無 SDK');
  assert.match(shareBarSource, /QRCodeSVG/, 'QR 用既有 qrcode.react');
  assert.match(shareBarSource, /event_name: 'shop_share'/);
  assert.match(shareBarSource, /window\.location\.origin/, 'URL 在 client 組，保頁面快取');
});

test('ShopViewTracker：client 端發 shop_view，不渲染內容', () => {
  assert.match(trackerSource, /'use client'/);
  assert.match(trackerSource, /event_name: 'shop_view'/);
  assert.match(trackerSource, /return null/);
});
