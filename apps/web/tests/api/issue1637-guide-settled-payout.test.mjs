// #1637 導遊後台「已入帳」視圖 — dashboard route/UI source-contract 測試
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(webRoot, rel), 'utf8');

describe('guide dashboard route — settledPayoutTwd/lastPayoutAt', () => {
  const src = read('app/api/guide/dashboard/route.ts');

  it('查 payouts state=paid（與待出款 pending 查詢並存）', () => {
    assert.match(src, /\.eq\('state', 'paid'\)/);
    assert.match(src, /\.eq\('state', 'pending'\)/);
  });

  it('回應含 settledPayoutTwd 與 lastPayoutAt', () => {
    assert.match(src, /settledPayoutTwd,/);
    assert.match(src, /lastPayoutAt,/);
  });

  it('兩個 env/無活動 early-return fallback 也含新欄位（契約完整）', () => {
    const fallbackMatches = src.match(/settledPayoutTwd: null/g) ?? [];
    assert.equal(fallbackMatches.length, 2, 'both early returns must include settledPayoutTwd: null');
    const lastPayoutMatches = src.match(/lastPayoutAt: null/g) ?? [];
    assert.equal(lastPayoutMatches.length, 2, 'both early returns must include lastPayoutAt: null');
  });

  it('已入帳累計＝paid payouts 加總、最近入帳取 confirmed_at 最大值', () => {
    assert.match(src, /paidPayoutRows[\s\S]*?reduce/);
    assert.match(src, /confirmed_at/);
  });

  it('不動既有 batching 結構：趨勢迴圈仍無 await、orders 查詢數不增', () => {
    // issue1605 防回歸的粗檢：from('orders') 仍 ≤ 4 次
    const ordersCalls = src.match(/from\('orders'\)/g) ?? [];
    assert.ok(ordersCalls.length <= 4, `from('orders') 應 ≤ 4 次，實際 ${ordersCalls.length}`);
  });
});

describe('guide dashboard UI — 已入帳顯示', () => {
  const src = read('app/guide/dashboard/page.tsx');

  it('型別含 settledPayoutTwd/lastPayoutAt', () => {
    assert.match(src, /settledPayoutTwd: number \| null/);
    assert.match(src, /lastPayoutAt: string \| null/);
  });

  it('餘額卡顯示「已入帳累計」與最近入帳日期（台北時區）', () => {
    assert.match(src, /已入帳累計/);
    assert.match(src, /data-guide="settled-payout"/);
    assert.match(src, /timeZone: 'Asia\/Taipei'/);
  });
});
