import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETTLEMENT_CONFIG_PATH = resolve(__dirname, '../../src/lib/settlement-config.ts');
const settlementConfigSrc = readFileSync(SETTLEMENT_CONFIG_PATH, 'utf8');

function src(path) {
  return readFileSync(path, 'utf8');
}

describe('settlement rules alignment', () => {
  it('KPI settings page defaults guide payout rate to 85%', () => {
    const page = src('app/(non-locale)/admin/settings/kpi/page.tsx');
    assert.match(page, /guidePayoutRate \?\? 0\.85/, 'admin KPI guidePayoutRate fallback must be 0.85');
    assert.doesNotMatch(page, /guidePayoutRate \?\? 0\.65/, 'admin KPI page must not fallback to stale 0.65');
  });

  it('migration updates kpi_settings settlement defaults to 15% commission and 85% guide payout', () => {
    const migration = src('../../supabase/migrations/20260519_align_settlement_rules.sql');
    assert.match(migration, /commission_rate\s+SET\s+DEFAULT\s+0\.15/i);
    assert.match(migration, /guide_payout_rate\s+SET\s+DEFAULT\s+0\.85/i);
    assert.match(migration, /UPDATE\s+public\.kpi_settings/i);
    assert.match(migration, /commission_rate\s*=\s*0\.15/i);
    assert.match(migration, /guide_payout_rate\s*=\s*0\.85/i);
  });

  it('guide-facing copy states the full payout policy', () => {
    // 分潤條件的權威呈現處＝嚮導後台（登入後看得到明細與門檻）。
    // 公開招募頁 /guide/apply 於 2026-07-30 依 owner 指示移除分潤三格文案，
    // 故不再納入本斷言；改由下一個 case 鎖「不得偷偷長回來」。
    const dashboard = src('app/(non-locale)/guide/dashboard/page.tsx');
    assert.match(dashboard, /平台抽成\s*15%/);
    // 用語統一（招募改版）：使用者可見文案一律「嚮導」；admin 後台仍為「導遊」。
    assert.match(dashboard, /嚮導實拿\s*85%/);
    assert.match(dashboard, /金流手續費[^。]*平台吸收|平台吸收[^。]*金流手續費/);
    assert.match(dashboard, /旅客實付金額扣除已退款部分後/);
    assert.match(dashboard, /活動完成後第\s*7\s*天|T\+7/);
    assert.match(dashboard, /最低出款門檻：?NT\$5,000|最低出款門檻：?NT\$\{data\.minWithdrawalTwd\.toLocaleString\(\)\}/);
  });

  it('admin KPI settings explains payment fee is platform internal cost only', () => {
    const page = src('app/(non-locale)/admin/settings/kpi/page.tsx');
    assert.match(page, /paymentFeeRate[^\n]*平台內部損益|平台內部損益[^\n]*paymentFeeRate/);
    assert.match(page, /不影響導遊\s*85%\s*實拿/);
  });

  it('guide payout JSON and CSV routes calculate from effective amount after refunds', () => {
    for (const path of ['app/api/v2/guide/payout/monthly/route.ts', 'app/api/v2/guide/payout/monthly/csv/route.ts']) {
      const route = src(path);
      assert.match(route, /refund_amount_twd/, `${path} must query refund amounts`);
      assert.match(route, /effectiveTwd/, `${path} must compute effectiveTwd`);
      // Since GH-1284, routes delegate per-row math to computeGuidePayoutEstimate (canonical helper).
      // refund deduction and commission_rate application live in settlement-config.ts.
      assert.ok(
        route.includes('computeGuidePayoutEstimate'),
        `${path} must delegate row-level payout math to computeGuidePayoutEstimate`
      );
      assert.match(
        settlementConfigSrc,
        /Math\.max\(0,\s*totalTwd\s*-\s*refundAmountTwd\)/,
        'canonical helper must deduct refunds before commission'
      );
      assert.match(
        settlementConfigSrc,
        // #1777 F8：乘法下移到 settlement/money.mjs 的整數基點實作；
        // 不變量不變——commission 仍由 effectiveTwd × DB-backed commission_rate 得出。
        /computeCommissionTwd\(effectiveTwd, config\.commission_rate\)/,
        'canonical helper must calculate commission from effectiveTwd using DB-backed commission_rate'
      );
      assert.doesNotMatch(route, /totalTwd \* settlementConfig\.commission_rate/, `${path} must not calculate commission from gross totalTwd`);
      assert.doesNotMatch(route, /SETTLEMENT_COMMISSION_RATE/, `${path} must not use static SETTLEMENT_COMMISSION_RATE constant`);
    }
  });

  it('guide dashboard payout estimate uses effective GMV after refunds', () => {
    const route = src('app/api/guide/dashboard/route.ts');
    assert.match(route, /refund_amount_twd/, 'dashboard must read refund amounts');
    assert.match(route, /effectiveMonthGmvTwd/, 'dashboard must compute effective monthly GMV');
    assert.match(route, /const monthGmvTwd = \(monthOrders \?\? \[\]\)\.reduce\(/);
    assert.match(route, /const expectedPayoutTwd = \(monthOrders \?\? \[\]\)\.reduce\(/);
    // Since GH-1284, dashboard delegates per-row commission math to computeGuidePayoutEstimate.
    // commissionTwd calculation lives in settlement-config.ts canonical helper.
    assert.ok(
      route.includes('computeGuidePayoutEstimate'),
      'dashboard must delegate per-row commission math to computeGuidePayoutEstimate'
    );
    assert.match(
      settlementConfigSrc,
      /commissionTwd\s*=[\s\S]{1,120}computeCommissionTwd\(effectiveTwd, config\.commission_rate\)/,
      'canonical helper must floor commission using settlementConfig.commission_rate'
      + '（#1777 F8：floor 改由 settlement/money.mjs 的整數基點實作完成，不變量不變）'
    );
  });
});
