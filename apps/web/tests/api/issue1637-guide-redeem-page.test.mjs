/**
 * #1637 導遊端核銷頁 — 短碼核銷 runtime 測試（in-memory）＋route/UI/help 接線 source-contract。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 強制 in-memory path
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

import { normalizeVoucherShortCode, redeemVoucherByShortCodeDb } from '../../src/lib/db-redeem.mjs';
import { shortCodeForOrder } from '../../src/lib/voucher-token.mjs';
import { orders as memOrders } from '../../src/lib/store.mjs';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = path.resolve(webRoot, '..', '..');
const read = (rel) => readFileSync(path.join(webRoot, rel), 'utf8');

describe('normalizeVoucherShortCode', () => {
  it('大小寫不拘、可省略 MID- 前綴、容忍空白', () => {
    const canonical = shortCodeForOrder('ord_mock_002'); // MID-XXXXXX
    const body = canonical.slice(4);
    assert.equal(normalizeVoucherShortCode(canonical), canonical);
    assert.equal(normalizeVoucherShortCode(canonical.toLowerCase()), canonical);
    assert.equal(normalizeVoucherShortCode(body), canonical);
    assert.equal(normalizeVoucherShortCode(` mid-${body.toLowerCase()} `), canonical);
  });

  it('非法輸入回 null（含易混字元 0/O/1/I 與長度不符）', () => {
    for (const bad of ['', null, undefined, 'MID-000000', 'MID-ABC', 'MID-ABCDEFG', 'XYZ-234567']) {
      assert.equal(normalizeVoucherShortCode(bad), null, `should reject ${bad}`);
    }
  });
});

describe('redeemVoucherByShortCodeDb（in-memory）', () => {
  it('confirmed 訂單以短碼核銷 → completed，回附 orderId', async () => {
    const order = memOrders.find((o) => o.id === 'ord_mock_002');
    assert.equal(order.status, 'confirmed', 'fixture 前置：ord_mock_002 應為 confirmed');
    const code = shortCodeForOrder(order.id);

    const result = await redeemVoucherByShortCodeDb({ code, guideId: 'guide_mock_001' });
    assert.equal(result.redeemed, true);
    assert.equal(result.alreadyRedeemed, false);
    assert.equal(result.status, 'completed');
    assert.equal(result.orderId, order.id);
    assert.equal(order.status, 'completed');
  });

  it('重複輸碼 → alreadyRedeemed（冪等，非錯誤）', async () => {
    const code = shortCodeForOrder('ord_mock_002');
    const result = await redeemVoucherByShortCodeDb({ code, guideId: 'guide_mock_001' });
    assert.equal(result.redeemed, false);
    assert.equal(result.alreadyRedeemed, true);
    assert.equal(result.status, 'completed');
  });

  it('無匹配短碼 → not_found；非法短碼 → invalid_code', async () => {
    const miss = await redeemVoucherByShortCodeDb({ code: 'MID-ZZZZZZ', guideId: 'guide_mock_001' });
    assert.equal(miss.reason, 'not_found');
    const bad = await redeemVoucherByShortCodeDb({ code: 'oops', guideId: 'guide_mock_001' });
    assert.equal(bad.reason, 'invalid_code');
  });
});

describe('source contract — by-code route', () => {
  const src = read('app/api/v2/guide/redeem/by-code/route.ts');

  it('CSRF＋guide session＋zod parseBody（#1600）', () => {
    assert.match(src, /validateCsrf\(request\)/);
    assert.match(src, /verifyGuideSession\(request\)/);
    assert.match(src, /parseBody\(request, RedeemByCodeBodySchema\)/);
  });

  it('#1614 jsonOk/jsonError＋#1598 handleRouteError 標準骨架', () => {
    assert.match(src, /jsonOk\(\{/);
    assert.match(src, /jsonError\('NOT_FOUND'/);
    assert.match(src, /handleRouteError\(err, \{\s*route: 'v2\/guide\/redeem\/by-code'/);
  });

  it('核銷走 db-redeem 領域檔（strangler）', () => {
    assert.match(src, /redeemVoucherByShortCodeDb/);
    assert.doesNotMatch(src, /from ['"].*\/db\.mjs['"]/);
  });
});

describe('source contract — 導遊核銷頁與導航', () => {
  it('頁面雙模式：掃 QR（token redeem）＋短碼（by-code），皆帶 CSRF', () => {
    const src = read('app/guide/redeem/page.tsx');
    assert.match(src, /\/api\/v2\/guide\/orders\/\$\{orderId\}\/redeem/);
    assert.match(src, /\/api\/v2\/guide\/redeem\/by-code/);
    assert.match(src, /csrfHeaders\(/);
    assert.match(src, /BarcodeDetector/);
    assert.match(src, /redeem-code-input/);
    assert.match(src, /redeem-scan-start/);
    assert.match(src, /redeem-result/);
  });

  it('guide 導航有「憑證核銷」入口', () => {
    const src = read('app/guide/layout.tsx');
    assert.match(src, /\/guide\/redeem/);
    assert.match(src, /憑證核銷/);
  });
});

describe('source contract — 金流說明頁全鏈流程（admin help 與 ops doc 兩處同步）', () => {
  it('/admin/help/payments-refunds 有全鏈流程總覽（9 步＋唯一純手動步驟）', () => {
    const src = read('app/admin/help/payments-refunds/page.tsx');
    assert.match(src, /全鏈流程總覽/);
    assert.match(src, /確認出帳\(唯一純手動步驟\)/);
    assert.match(src, /月結報表\(手動產出\)/);
    assert.match(src, /出團後滿 48 小時/);
    // ② 正常流程不再宣稱「callback → 自動轉 paid」的過時說法
    assert.doesNotMatch(src, /callback → 自動轉 <StatusBadge status="paid"/);
  });

  it('docs/operations/admin-payments-refunds-guide.md 已同步全鏈流程', () => {
    const doc = readFileSync(path.join(repoRoot, 'docs/operations/admin-payments-refunds-guide.md'), 'utf8');
    assert.match(doc, /全鏈流程總覽/);
    assert.match(doc, /確認出帳\(唯一純手動步驟\)/);
    assert.match(doc, /order-to-payout-flow-map\.md/);
  });
});
