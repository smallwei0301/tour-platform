'use client';

/**
 * #1637 管理者後台 — 每月會計報帳報表。
 * 手動選月產出：摘要（收款/退款/結算/出帳/負債）＋明細表＋CSV 下載。
 */
import { useEffect, useState } from 'react';
import { Card, PageHeader } from '../../../../src/components/admin/ui';
import { ResponsiveTable, type ResponsiveColumn } from '../../../../src/components/admin/responsive';

type ReportRow = {
  orderId?: string;
  payoutId?: string;
  paidAt?: string | null;
  refundedAt?: string | null;
  settledAt?: string | null;
  confirmedAt?: string | null;
  createdAt?: string | null;
  totalTwd?: number;
  refundedAmountTwd?: number;
  gmvTwd?: number;
  commissionTwd?: number;
  netTwd?: number;
  balanceTwd?: number;
  activityTitle?: string | null;
  guideId?: string | null;
  guideName?: string | null;
  transferRef?: string | null;
  settlementKind?: string | null;
};

type Report = {
  month: string;
  generatedAt: string;
  revenue: { collectedTwd: number; collectedCount: number; refundedTwd: number; refundedCount: number; netCollectedTwd: number };
  settlement: { gmvTwd: number; commissionTwd: number; netTwd: number; itemCount: number; reversalCount: number };
  payouts: { paidTwd: number; paidCount: number };
  liabilities: { guideBalanceTwd: number; pendingPayoutTwd: number; pendingPayoutCount: number };
  anomalies: { paidUnsettledCount: number; paidUnsettledTwd: number; completedWithoutPaidAtCount: number };
  details: {
    collections: ReportRow[];
    refunds: ReportRow[];
    settlements: ReportRow[];
    payoutsPaid: ReportRow[];
    guideBalances: ReportRow[];
    pendingPayouts: ReportRow[];
  };
};

function defaultReportMonth(): string {
  // 預設上個月（月結通常做上月帳）
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nt(n: number | undefined | null): string {
  return `NT$${Number(n ?? 0).toLocaleString()}`;
}

function taipeiDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
}

export default function AdminMonthlyReportPage() {
  const [month, setMonth] = useState(defaultReportMonth());
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadReport(m: string) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v2/admin/reports/monthly?month=${encodeURIComponent(m)}`, { cache: 'no-store' });
      const json = await res.json();
      if (!json?.success) {
        setReport(null);
        setError(json?.error?.message || '報表產出失敗');
        return;
      }
      setReport(json.data);
    } catch {
      setReport(null);
      setError('報表產出失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadReport(month); /* 初載預設上月 */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summaryItems = report ? [
    { label: '本月實收', value: nt(report.revenue.collectedTwd), sub: `${report.revenue.collectedCount} 筆（依付款時間歸月）`, color: '#1B6B4A' },
    { label: '本月退款', value: `-${nt(report.revenue.refundedTwd)}`, sub: `${report.revenue.refundedCount} 筆（依退款時間歸月）`, color: '#b91c1c' },
    { label: '本月淨收款', value: nt(report.revenue.netCollectedTwd), sub: '實收 − 退款', color: '#111827' },
    { label: '本月結算 GMV', value: nt(report.settlement.gmvTwd), sub: `${report.settlement.itemCount} 筆結算、${report.settlement.reversalCount} 筆紅沖`, color: '#111827' },
    { label: '平台抽成收入', value: nt(report.settlement.commissionTwd), sub: '結算分錄加總（含紅沖）', color: '#1B6B4A' },
    { label: '導遊分潤（本月新增應付）', value: nt(report.settlement.netTwd), sub: '結算入導遊餘額', color: '#111827' },
    { label: '本月已出帳', value: nt(report.payouts.paidTwd), sub: `${report.payouts.paidCount} 筆（依確認出款時間歸月）`, color: '#1d4ed8' },
    { label: '期末導遊餘額（負債）', value: nt(report.liabilities.guideBalanceTwd), sub: '即時快照', color: '#b45309' },
    { label: '期末待出款單', value: nt(report.liabilities.pendingPayoutTwd), sub: `${report.liabilities.pendingPayoutCount} 筆 pending（即時快照）`, color: '#b45309' },
  ] : [];

  const collectionColumns: ResponsiveColumn<ReportRow>[] = [
    { key: 'date', header: '付款時間', mobilePriority: 'subtitle', cell: (r) => <span style={{ fontSize: 12 }}>{taipeiDate(r.paidAt)}</span> },
    { key: 'order', header: '訂單', mobilePriority: 'title', cell: (r) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{(r.orderId || '').slice(0, 8)}…</span> },
    { key: 'activity', header: '活動', cell: (r) => <span style={{ fontSize: 12 }}>{r.activityTitle || '-'}</span> },
    { key: 'guide', header: '導遊', cell: (r) => <span style={{ fontSize: 12 }}>{r.guideName || '-'}</span> },
    { key: 'amount', header: '金額', align: 'right', mobileLabel: '金額', cell: (r) => <strong>{nt(r.totalTwd)}</strong> },
  ];

  const refundColumns: ResponsiveColumn<ReportRow>[] = [
    { key: 'date', header: '退款時間', mobilePriority: 'subtitle', cell: (r) => <span style={{ fontSize: 12 }}>{taipeiDate(r.refundedAt)}</span> },
    { key: 'order', header: '訂單', mobilePriority: 'title', cell: (r) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{(r.orderId || '').slice(0, 8)}…</span> },
    { key: 'amount', header: '退款金額', align: 'right', mobileLabel: '金額', cell: (r) => <strong style={{ color: '#b91c1c' }}>-{nt(r.refundedAmountTwd)}</strong> },
  ];

  const settlementColumns: ResponsiveColumn<ReportRow>[] = [
    { key: 'date', header: '結算時間', mobilePriority: 'subtitle', cell: (r) => <span style={{ fontSize: 12 }}>{taipeiDate(r.settledAt)}</span> },
    { key: 'order', header: '訂單', mobilePriority: 'title', cell: (r) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{(r.orderId || '').slice(0, 8)}…</span> },
    { key: 'guide', header: '導遊', cell: (r) => <span style={{ fontSize: 12 }}>{r.guideName || '-'}</span> },
    { key: 'kind', header: '類別', cell: (r) => (
      r.settlementKind === 'reversal'
        ? <span style={{ fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>紅沖</span>
        : <span style={{ fontSize: 12, color: '#1B6B4A' }}>結算</span>
    ) },
    { key: 'gmv', header: 'GMV', align: 'right', cell: (r) => <span style={{ fontSize: 12 }}>{nt(r.gmvTwd)}</span> },
    { key: 'commission', header: '抽成', align: 'right', cell: (r) => <span style={{ fontSize: 12 }}>{nt(r.commissionTwd)}</span> },
    { key: 'net', header: '導遊淨額', align: 'right', mobileLabel: '淨額', cell: (r) => <strong>{nt(r.netTwd)}</strong> },
  ];

  const payoutColumns: ResponsiveColumn<ReportRow>[] = [
    { key: 'date', header: '出款時間', mobilePriority: 'subtitle', cell: (r) => <span style={{ fontSize: 12 }}>{taipeiDate(r.confirmedAt)}</span> },
    { key: 'payout', header: '出款單', mobilePriority: 'title', cell: (r) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{(r.payoutId || '').slice(0, 8)}…</span> },
    { key: 'guide', header: '導遊', cell: (r) => <span style={{ fontSize: 12 }}>{r.guideName || '-'}</span> },
    { key: 'amount', header: '金額', align: 'right', mobileLabel: '金額', cell: (r) => <strong>{nt(r.totalTwd)}</strong> },
    { key: 'ref', header: '轉帳備註', cell: (r) => <span style={{ fontSize: 12, color: '#6b7280' }}>{r.transferRef || '-'}</span> },
  ];

  const hasAnomalies = !!report && (
    report.anomalies.paidUnsettledCount > 0 || report.anomalies.completedWithoutPaidAtCount > 0
  );

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader title="月結報表" subtitle="每月會計報帳報表：收款、退款、結算分潤、出帳與期末負債" />

      <div className="admin-page">
        <Card data-guide="monthly-report-controls">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>
              報表月份：
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                style={{ marginLeft: 8, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
              />
            </label>
            <button
              disabled={loading}
              onClick={() => loadReport(month)}
              data-guide="monthly-report-generate"
              style={{
                padding: '6px 16px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer', background: loading ? '#f1f5f9' : '#1B6B4A',
                color: loading ? '#94a3b8' : '#fff',
              }}
            >
              {loading ? '產出中…' : '產出報表'}
            </button>
            <a
              href={`/api/v2/admin/reports/monthly/csv?month=${encodeURIComponent(month)}`}
              data-guide="monthly-report-csv"
              style={{
                padding: '6px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: 'none',
                background: '#fff', color: '#1B6B4A', border: '1px solid #1B6B4A',
              }}
            >
              下載 CSV
            </a>
          </div>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '10px 0 0' }}>
            歸月依 Asia/Taipei 時區：收款依付款時間、退款依退款時間、結算依入帳時間、出帳依確認出款時間；導遊餘額與待出款為產出當下即時快照。
          </p>
        </Card>

        {error && (
          <div role="alert" style={{ margin: '12px 0', padding: '10px 14px', borderRadius: 8, fontSize: 13, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
            {error}
          </div>
        )}

        {report && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, margin: '16px 0' }} data-guide="monthly-report-summary">
              {summaryItems.map((item) => (
                <Card key={item.label}>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: item.color }}>{item.value}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{item.sub}</div>
                </Card>
              ))}
            </div>

            {hasAnomalies && (
              <div role="alert" data-guide="monthly-report-anomalies" style={{ margin: '0 0 16px', padding: '12px 16px', borderRadius: 8, fontSize: 13, background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
                <strong>對帳異常提醒：</strong>
                {report.anomalies.paidUnsettledCount > 0 && (
                  <span>已付款但從未結算的訂單 {report.anomalies.paidUnsettledCount} 筆（累計 {nt(report.anomalies.paidUnsettledTwd)}，通常是訂單卡在 paid 未進入 completed）。</span>
                )}
                {report.anomalies.completedWithoutPaidAtCount > 0 && (
                  <span> 已完成但無付款時間（不會被結算）的訂單 {report.anomalies.completedWithoutPaidAtCount} 筆。</span>
                )}
                <span> 請於出帳前人工覆核。</span>
              </div>
            )}

            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '20px 0 8px' }}>收款明細（{report.details.collections.length} 筆）</h2>
            <Card data-guide="monthly-report-collections">
              <ResponsiveTable columns={collectionColumns} rows={report.details.collections} getRowKey={(r) => `c-${r.orderId}`} emptyMessage="本月沒有收款紀錄" />
            </Card>

            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '20px 0 8px' }}>退款明細（{report.details.refunds.length} 筆）</h2>
            <Card data-guide="monthly-report-refunds">
              <ResponsiveTable columns={refundColumns} rows={report.details.refunds} getRowKey={(r) => `r-${r.orderId}`} emptyMessage="本月沒有退款紀錄" />
            </Card>

            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '20px 0 8px' }}>結算分潤明細（{report.details.settlements.length} 筆）</h2>
            <Card data-guide="monthly-report-settlements">
              <ResponsiveTable columns={settlementColumns} rows={report.details.settlements} getRowKey={(r) => `s-${r.orderId}-${r.settlementKind}`} emptyMessage="本月沒有結算分錄" />
            </Card>

            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '20px 0 8px' }}>出帳明細（{report.details.payoutsPaid.length} 筆）</h2>
            <Card data-guide="monthly-report-payouts">
              <ResponsiveTable columns={payoutColumns} rows={report.details.payoutsPaid} getRowKey={(r) => `p-${r.payoutId}`} emptyMessage="本月沒有出帳紀錄" />
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
