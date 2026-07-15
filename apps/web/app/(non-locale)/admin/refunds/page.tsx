'use client';

import { useEffect, useState } from 'react';
import { Card, PageHeader, StatusBadge } from '../../../../src/components/admin/ui';
import { ResponsiveTable, type ResponsiveColumn } from '../../../../src/components/admin/responsive';
import { csrfHeaders } from '../../../../src/lib/csrf-client';

type RefundRow = {
  id: string; orderId: string; reason: string; note: string; status: string;
  requestedAt: string; orderStatus: string | null; totalTwd: number;
  contactName: string | null; contactEmail: string | null;
};

export default function AdminRefundsPage() {
  const [rows, setRows] = useState<RefundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  async function loadRows() {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/admin/refund-requests', { cache: 'no-store' });
      const json = await res.json();
      setRows(json?.data || []);
    } finally { setLoading(false); }
  }

  useEffect(() => { loadRows(); }, []);

  async function doAction(id: string, action: 'approve' | 'reject' | 'process' | 'complete') {
    setBusyId(id + action);
    try {
      await fetch(`/api/v2/admin/refund-requests/${id}/${action}`, {
        method: 'POST', headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ adminNote: `admin ${action}` }),
      });
      await loadRows();
    } finally { setBusyId(''); }
  }

  const actionBtn = (id: string, action: 'approve'|'reject'|'process'|'complete', label: string, color: string, dataGuide?: string) => (
    <button
      disabled={!!busyId}
      onClick={() => doAction(id, action)}
      data-guide={dataGuide}
      style={{
        padding: '4px 10px', borderRadius: 6, border: 'none', fontSize: 12,
        fontWeight: 600, cursor: busyId ? 'not-allowed' : 'pointer',
        background: busyId ? '#f1f5f9' : color, color: '#fff', opacity: busyId ? 0.6 : 1,
        width: '100%', minWidth: 64, boxSizing: 'border-box',
      }}
    >
      {busyId === id + action ? '…' : label}
    </button>
  );

  const refundColumns: ResponsiveColumn<RefundRow>[] = [
    {
      key: 'id', header: 'Refund ID', mobilePriority: 'hidden',
      cell: (r) => <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#9ca3af' }}>{r.id.slice(0, 10)}…</span>,
    },
    {
      key: 'order', header: '訂單', mobilePriority: 'title',
      cell: (r) => (
        <>
          <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.orderId.slice(0, 10)}…</span>
          {r.orderStatus && <div style={{ marginTop: 2 }}><StatusBadge status={r.orderStatus} /></div>}
        </>
      ),
    },
    {
      key: 'status', header: '狀態', mobilePriority: 'subtitle',
      cell: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'reason', header: '原因', mobileLabel: '原因',
      cell: (r) => (
        <>
          <span style={{ fontSize: 13 }}>{r.reason}</span>
          {r.note && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{r.note}</div>}
        </>
      ),
    },
    {
      key: 'amount', header: '金額', align: 'right', mobileLabel: '金額',
      cell: (r) => <strong>NT${Number(r.totalTwd || 0).toLocaleString()}</strong>,
    },
    {
      key: 'contact', header: '聯絡人', mobileLabel: '聯絡人',
      cell: (r) => (
        <>
          <span style={{ fontSize: 13 }}>{r.contactName || '-'}</span>
          {r.contactEmail && <div style={{ fontSize: 12, color: '#9ca3af' }}>{r.contactEmail}</div>}
        </>
      ),
    },
    {
      key: 'requestedAt', header: '申請時間', mobileLabel: '申請',
      cell: (r) => <span style={{ fontSize: 12, color: '#6b7280' }}>{r.requestedAt ? new Date(r.requestedAt).toLocaleDateString('zh-TW') : '-'}</span>,
    },
    {
      key: 'actions', header: '操作', mobileLabel: '操作',
      cell: (r) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 4, maxWidth: 120 }}>
          {actionBtn(r.id, 'approve',  '通過',   '#1B6B4A', 'refund-approve')}
          {actionBtn(r.id, 'reject',   '拒絕',   '#dc2626', 'refund-reject')}
          {actionBtn(r.id, 'process',  '處理中', '#d97706')}
          {actionBtn(r.id, 'complete', '完成',   '#6b7280')}
        </div>
      ),
    },
  ];

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader title="退款管理" subtitle="審核退款申請、追蹤退款進度" />

      <div className="admin-page">
        {/* ECPay vs 現金 退款流程說明（維運速查；完整說明見金流／退款處理說明頁） */}
        <details data-guide="refund-flow-help" style={{ marginBottom: 16, border: '1px solid #bae6fd', borderRadius: 10, background: '#f0f9ff' }}>
          <summary style={{ padding: '12px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#075985' }}>
            ℹ️ ECPay 與現金的退款管理流程說明（點開）
          </summary>
          <div style={{ padding: '4px 16px 16px', fontSize: 13, color: '#0c4a6e', lineHeight: 1.85 }}>
            <p style={{ margin: '0 0 8px' }}>
              本頁列出的是<strong>退款申請（refund_requests）</strong>。每筆申請走「<strong>通過 → 處理中 → 完成</strong>」（或「拒絕」）。
              「完成」後系統會把訂單設為 <strong>已退款</strong>、付款狀態設為 refunded，並補上退款付款事件。
            </p>

            <p style={{ margin: '10px 0 4px', fontWeight: 700 }}>💳 ECPay 線上付款訂單（有 trade_no）</p>
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              <li>退款金流需向 ECPay 沖銷／退刷（全額）。建議在<strong>訂單詳情</strong>用「執行退款」按鈕，系統會自動呼叫 ECPay 全額沖銷後結案。</li>
              <li>若在本頁直接按「完成」：僅標記訂單／申請為已退款並補事件，<strong>不會</strong>實際呼叫 ECPay。請確認 ECPay 端的退刷已另行完成，避免帳務不一致。</li>
            </ol>

            <p style={{ margin: '10px 0 4px', fontWeight: 700 }}>💵 現金／線下訂單（無 trade_no）</p>
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              <li>金錢於線下退還。線下退款後，在本頁按「完成」把申請與訂單結案為已退款（系統只記錄狀態）。</li>
              <li>或於訂單詳情用「執行退款」按鈕（現金需填退款原因）標記為已退款。</li>
            </ol>

            <p style={{ margin: '10px 0 4px', fontWeight: 700 }}>💠 部分退款</p>
            <p style={{ margin: 0 }}>
              需部分退款時，請到<strong>訂單詳情</strong>、退款中訂單的「執行退款」區塊，於「退款金額（NT$）」欄填入金額（留空＝全額）：
              ECPay 訂單會以該金額實際向 ECPay 退刷、現金訂單記錄為實退金額。
              （本頁「完成」與「取消＋退款」按鈕仍為全額；授權未請款只能全額取消授權。）詳見下方說明頁。
            </p>

            <p style={{ margin: '12px 0 0' }}>
              <a href="/admin/help/payments-refunds" target="_blank" rel="noopener noreferrer" style={{ color: '#1d4ed8', fontWeight: 600, textDecoration: 'none' }}>
                📖 開啟完整「金流／退款處理說明」
              </a>
            </p>
          </div>
        </details>

        <Card data-guide="refund-list">
          <ResponsiveTable
            columns={refundColumns}
            rows={rows}
            getRowKey={(r) => r.id}
            loading={loading}
            loadingRows={6}
            emptyMessage="目前沒有退款申請 🎉"
          />
        </Card>
      </div>
    </div>
  );
}
