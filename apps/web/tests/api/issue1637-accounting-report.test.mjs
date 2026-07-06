// #1637 每月會計報帳報表 — 純計算層 runtime 測試
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidReportMonth,
  taipeiMonthRangeUtc,
  formatTaipeiDateTime,
  buildMonthlyAccountingReport,
  renderMonthlyAccountingCsv,
} from '../../src/lib/accounting/report.mjs';

describe('isValidReportMonth', () => {
  it('接受 YYYY-MM、拒絕其他格式', () => {
    assert.equal(isValidReportMonth('2026-06'), true);
    assert.equal(isValidReportMonth('2026-12'), true);
    for (const bad of ['2026-13', '2026-0', '2026-00', '202606', '2026-6', '', null, undefined, '2026-06-01']) {
      assert.equal(isValidReportMonth(bad), false, `should reject ${bad}`);
    }
  });
});

describe('taipeiMonthRangeUtc', () => {
  it('台北月界線轉 UTC（半開區間）', () => {
    const { startIso, endIso } = taipeiMonthRangeUtc('2026-06');
    assert.equal(startIso, '2026-05-31T16:00:00.000Z');
    assert.equal(endIso, '2026-06-30T16:00:00.000Z');
  });

  it('跨年月（1 月）界線正確', () => {
    const { startIso, endIso } = taipeiMonthRangeUtc('2026-01');
    assert.equal(startIso, '2025-12-31T16:00:00.000Z');
    assert.equal(endIso, '2026-01-31T16:00:00.000Z');
  });

  it('12 月的 end 落在次年', () => {
    const { endIso } = taipeiMonthRangeUtc('2026-12');
    assert.equal(endIso, '2026-12-31T16:00:00.000Z');
  });

  it('非法月份拋錯', () => {
    assert.throws(() => taipeiMonthRangeUtc('2026-13'));
  });
});

describe('formatTaipeiDateTime', () => {
  it('UTC → 台北 +8', () => {
    assert.equal(formatTaipeiDateTime('2026-06-30T16:30:00.000Z'), '2026-07-01 00:30');
  });
  it('空值回空字串', () => {
    assert.equal(formatTaipeiDateTime(null), '');
    assert.equal(formatTaipeiDateTime('not-a-date'), '');
  });
});

function sampleInput() {
  return {
    month: '2026-06',
    generatedAt: '2026-07-06T09:00:00.000Z',
    collections: [
      { orderId: 'o1', paidAt: '2026-06-03T02:00:00Z', totalTwd: 3000, activityTitle: '夜釣小管', guideName: '阿海' },
      { orderId: 'o2', paidAt: '2026-06-15T02:00:00Z', totalTwd: 4500, activityTitle: '山線導覽, 含"午餐"', guideName: '阿山' },
    ],
    refunds: [
      { orderId: 'o3', refundedAt: '2026-06-20T05:00:00Z', refundedAmountTwd: 500 },
    ],
    settlements: [
      { orderId: 'o1', guideId: 'g1', guideName: '阿海', settledAt: '2026-06-11T10:00:00Z', gmvTwd: 3000, commissionTwd: 450, netTwd: 2550, settlementKind: 'settlement' },
      { orderId: 'o4', guideId: 'g1', guideName: '阿海', settledAt: '2026-06-12T10:00:00Z', gmvTwd: -1000, commissionTwd: -150, netTwd: -850, settlementKind: 'reversal' },
    ],
    payoutsPaid: [
      { payoutId: 'p1', guideId: 'g1', guideName: '阿海', confirmedAt: '2026-06-25T08:00:00Z', totalTwd: 7168, transferRef: 'TX-001' },
    ],
    guideBalances: [
      { guideId: 'g1', guideName: '阿海', balanceTwd: 21814 },
    ],
    pendingPayouts: [
      { payoutId: 'p2', guideId: 'g1', guideName: '阿海', totalTwd: 7168, createdAt: '2026-06-11T10:07:00Z' },
    ],
    anomalies: { paidUnsettledCount: 14, paidUnsettledTwd: 23838, completedWithoutPaidAtCount: 1 },
  };
}

describe('buildMonthlyAccountingReport', () => {
  it('收款/退款/淨收款加總正確', () => {
    const r = buildMonthlyAccountingReport(sampleInput());
    assert.equal(r.revenue.collectedTwd, 7500);
    assert.equal(r.revenue.collectedCount, 2);
    assert.equal(r.revenue.refundedTwd, 500);
    assert.equal(r.revenue.refundedCount, 1);
    assert.equal(r.revenue.netCollectedTwd, 7000);
  });

  it('結算含紅沖：金額直接加總、筆數分開計', () => {
    const r = buildMonthlyAccountingReport(sampleInput());
    assert.equal(r.settlement.gmvTwd, 2000);
    assert.equal(r.settlement.commissionTwd, 300);
    assert.equal(r.settlement.netTwd, 1700);
    assert.equal(r.settlement.itemCount, 1);
    assert.equal(r.settlement.reversalCount, 1);
  });

  it('出帳與負債快照加總正確', () => {
    const r = buildMonthlyAccountingReport(sampleInput());
    assert.equal(r.payouts.paidTwd, 7168);
    assert.equal(r.payouts.paidCount, 1);
    assert.equal(r.liabilities.guideBalanceTwd, 21814);
    assert.equal(r.liabilities.pendingPayoutTwd, 7168);
    assert.equal(r.liabilities.pendingPayoutCount, 1);
  });

  it('anomalies 透傳並正規化為整數', () => {
    const r = buildMonthlyAccountingReport(sampleInput());
    assert.equal(r.anomalies.paidUnsettledCount, 14);
    assert.equal(r.anomalies.paidUnsettledTwd, 23838);
    assert.equal(r.anomalies.completedWithoutPaidAtCount, 1);
  });

  it('空輸入產出全零報表（env-fallback 路徑）', () => {
    const r = buildMonthlyAccountingReport({ month: '2026-06', generatedAt: '2026-07-06T09:00:00.000Z' });
    assert.equal(r.revenue.collectedTwd, 0);
    assert.equal(r.revenue.netCollectedTwd, 0);
    assert.equal(r.settlement.gmvTwd, 0);
    assert.equal(r.payouts.paidTwd, 0);
    assert.equal(r.liabilities.guideBalanceTwd, 0);
    assert.deepEqual(r.details.collections, []);
  });

  it('非法 month 拋錯', () => {
    assert.throws(() => buildMonthlyAccountingReport({ month: 'x', generatedAt: '' }));
  });
});

describe('renderMonthlyAccountingCsv', () => {
  it('BOM 開頭 + CRLF + 摘要與明細列齊全', () => {
    const csv = renderMonthlyAccountingCsv(buildMonthlyAccountingReport(sampleInput()));
    assert.equal(csv.charCodeAt(0), 0xfeff, 'CSV 必須以 UTF-8 BOM 開頭');
    assert.match(csv, /祕島 Midao 月結會計報表,2026-06/);
    assert.match(csv, /本月實收（訂單收款，依 paid_at 歸月）,7500,2/);
    assert.match(csv, /本月退款（依 refunded_at 歸月）,-500,1/);
    assert.match(csv, /本月淨收款,7000,/);
    assert.match(csv, /平台抽成收入,300,/);
    assert.match(csv, /本月已出帳（付導遊，依 confirmed_at 歸月）,7168,1/);
    assert.match(csv, /已付款未結算訂單（status=paid，全期累計）,23838,14/);
    // 明細列
    assert.match(csv, /收款,2026-06-03 10:00,o1,夜釣小管,3000/);
    assert.match(csv, /退款,2026-06-20 13:00,o3,,-500/);
    assert.match(csv, /結算紅沖,.*,o4,阿海,-1000,-150,-850/);
    assert.match(csv, /出帳,.*,p1,阿海,7168,,,TX-001/);
    assert.ok(csv.includes('\r\n'));
  });

  it('含逗號/引號欄位正確跳脫', () => {
    const csv = renderMonthlyAccountingCsv(buildMonthlyAccountingReport(sampleInput()));
    assert.ok(csv.includes('"山線導覽, 含""午餐"""'), 'CSV 欄位含逗號與引號必須以雙引號跳脫');
  });
});
