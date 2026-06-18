// #1475 — 導遊後台基本資料頁的「預約商店連結」一鍵複製卡片（source-contract）。
// E2E 無法觸及：卡片以 NEXT_PUBLIC_GUIDE_SHOP_ENABLED（client flag）控管，
// Playwright webServer 未設該 flag → 卡片不渲染。故於 source 層鎖定接線。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGE = join(__dirname, '..', '..', 'app/guide/profile/page.tsx');
const src = readFileSync(PAGE, 'utf8');

test('卡片以 isGuideShopEnabled() + slug 控管渲染', () => {
  assert.match(src, /isGuideShopEnabled\(\)\s*&&\s*profile\.slug\s*&&\s*<ShopLinkCard slug=\{profile\.slug\}\s*\/>/);
});

test('ShopLinkCard 組出 /guides/[slug]/shop 完整網址', () => {
  const i = src.indexOf('function ShopLinkCard');
  assert.ok(i > 0, '應有 ShopLinkCard 元件');
  const body = src.slice(i, i + 2200);
  assert.match(body, /\/guides\/\$\{slug\}\/shop/);
  assert.match(body, /\$\{origin\}\$\{path\}/);
});

test('提供一鍵複製（clipboard + 後備 execCommand）與測試鉤子', () => {
  const i = src.indexOf('function ShopLinkCard');
  const body = src.slice(i, i + 2200);
  assert.match(body, /navigator\.clipboard\?\.writeText/);
  assert.match(body, /execCommand\('copy'\)/);
  assert.match(body, /data-testid="guide-shop-link-copy"/);
  assert.match(body, /data-testid="guide-shop-link-url"/);
  assert.match(body, /已複製/);
});
