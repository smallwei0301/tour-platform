import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

function src(path) {
  return readFileSync(path, 'utf8');
}

describe('settlement rules alignment', () => {
  it('KPI settings page defaults guide payout rate to 85%', () => {
    const page = src('app/admin/settings/kpi/page.tsx');
    assert.match(page, /guidePayoutRate \?\? 0\.85/, 'admin KPI guidePayoutRate fallback must be 0.85');
    assert.doesNotMatch(page, /guidePayoutRate \?\? 0\.65/, 'admin KPI page must not fallback to stale 0.65');
  });

  it('migration updates kpi_settings default guide_payout_rate to 0.85', () => {
    const migration = src('../../supabase/migrations/20260519_align_settlement_rules.sql');
    assert.match(migration, /guide_payout_rate\s+SET\s+DEFAULT\s+0\.85/i);
    assert.match(migration, /UPDATE\s+public\.kpi_settings/i);
    assert.match(migration, /guide_payout_rate\s*=\s*0\.85/i);
  });

  it('guide-facing copy states the full payout policy', () => {
    const applyPage = src('app/guide/apply/page.tsx');
    const dashboard = src('app/guide/dashboard/page.tsx');
    for (const text of [applyPage, dashboard]) {
      assert.match(text, /平台抽成\s*15%/);
      assert.match(text, /導遊實拿\s*85%/);
      assert.match(text, /金流手續費[^。]*平台吸收|平台吸收[^。]*金流手續費/);
    }
    assert.match(dashboard, /旅客實付金額扣除已退款部分後/);
    assert.match(dashboard, /活動完成後第\s*7\s*天|T\+7/);
    assert.match(dashboard, /最低出款門檻：?NT\$5,000|最低出款門檻：?NT\$\{data\.minWithdrawalTwd\.toLocaleString\(\)\}/);
  });

  it('admin KPI settings explains payment fee is platform internal cost only', () => {
    const page = src('app/admin/settings/kpi/page.tsx');
    assert.match(page, /paymentFeeRate[^\n]*平台內部損益|平台內部損益[^\n]*paymentFeeRate/);
    assert.match(page, /不影響導遊\s*85%\s*實拿/);
  });

  it('guide payout JSON and CSV routes calculate from effective amount after refunds', () => {
    for (const path of ['app/api/guide/payout/monthly/route.ts', 'app/api/guide/payout/monthly/csv/route.ts']) {
      const route = src(path);
      assert.match(route, /refund_amount_twd/, `${path} must query refund amounts`);
      assert.match(route, /effectiveTwd/, `${path} must compute effectiveTwd`);
      assert.match(route, /Math\.max\(0,\s*totalTwd\s*-\s*refundAmountTwd\)/, `${path} must deduct refunds before commission`);
      assert.match(route, /effectiveTwd \* SETTLEMENT_COMMISSION_RATE/, `${path} must calculate commission from effectiveTwd`);
      assert.doesNotMatch(route, /totalTwd \* SETTLEMENT_COMMISSION_RATE/, `${path} must not calculate commission from gross totalTwd`);
    }
  });

  it('guide dashboard payout estimate uses effective GMV after refunds', () => {
    const route = src('app/api/guide/dashboard/route.ts');
    assert.match(route, /refund_amount_twd/, 'dashboard must read refund amounts');
    assert.match(route, /effectiveMonthGmvTwd/, 'dashboard must compute effective monthly GMV');
    assert.match(route, /expectedPayoutTwd\s*=\s*Math\.floor\(effectiveMonthGmvTwd \* \(1 - settlementConfig\.commission_rate\)\)/);
  });
});
