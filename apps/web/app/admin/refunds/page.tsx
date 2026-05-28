'use client';

import { useEffect, useState } from 'react';
import { Card, PageHeader, StatusBadge } from '../../../src/components/admin/ui';
import { ResponsiveTable, type ResponsiveColumn } from '../../../src/components/admin/responsive';
import { csrfHeaders } from '../../../src/lib/csrf-client';

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
      const res = await fetch('/api/admin/refund-requests', { cache: 'no-store' });
      const json = await res.json();
      setRows(json?.data || []);
    } finally { setLoading(false); }
  }

  useEffect(() => { loadRows(); }, []);

  async function doAction(id: string, action: 'approve' | 'reject' | 'process' | 'complete') {
    setBusyId(id + action);
    try {
      await fetch(`/api/admin/refund-requests/${id}/${action}`, {
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
