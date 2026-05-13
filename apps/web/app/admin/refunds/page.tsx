'use client';

import { useEffect, useState } from 'react';
import { Card, PageHeader, StatusBadge, TableWrapper, Th, Td, LoadingSkeleton, EmptyState } from '../../../src/components/admin/ui';
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

  const actionBtn = (id: string, action: 'approve'|'reject'|'process'|'complete', label: string, color: string) => (
    <button
      disabled={!!busyId}
      onClick={() => doAction(id, action)}
      style={{
        padding: '4px 10px', borderRadius: 6, border: 'none', fontSize: 12,
        fontWeight: 600, cursor: busyId ? 'not-allowed' : 'pointer',
        background: busyId ? '#f1f5f9' : color, color: '#fff', opacity: busyId ? 0.6 : 1,
      }}
    >
      {busyId === id + action ? '…' : label}
    </button>
  );

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader title="退款管理" subtitle="審核退款申請、追蹤退款進度" />

      <div style={{ padding: '20px 28px' }}>
        <Card data-guide="refund-list">
          {loading ? <LoadingSkeleton rows={6} /> : rows.length === 0 ? <EmptyState message="目前沒有退款申請 🎉" /> : (
            <TableWrapper>
              <thead>
                <tr>
                  <Th>Refund ID</Th><Th>訂單</Th><Th>狀態</Th><Th>原因</Th>
                  <Th align="right">金額</Th><Th>聯絡人</Th><Th>申請時間</Th><Th>操作</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <Td><span style={{ fontFamily: 'monospace', fontSize: 11, color: '#9ca3af' }}>{r.id.slice(0,10)}…</span></Td>
                    <Td>
                      <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.orderId.slice(0,10)}…</span>
                      {r.orderStatus && <div style={{ marginTop: 2 }}><StatusBadge status={r.orderStatus} /></div>}
                    </Td>
                    <Td><StatusBadge status={r.status} /></Td>
                    <Td>
                      <span style={{ fontSize: 13 }}>{r.reason}</span>
                      {r.note && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{r.note}</div>}
                    </Td>
                    <Td align="right"><strong>NT${Number(r.totalTwd||0).toLocaleString()}</strong></Td>
                    <Td>
                      <span style={{ fontSize: 13 }}>{r.contactName || '-'}</span>
                      {r.contactEmail && <div style={{ fontSize: 12, color: '#9ca3af' }}>{r.contactEmail}</div>}
                    </Td>
                    <Td><span style={{ fontSize: 12, color: '#6b7280' }}>{r.requestedAt ? new Date(r.requestedAt).toLocaleDateString('zh-TW') : '-'}</span></Td>
                    <Td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span data-guide="refund-approve">{actionBtn(r.id, 'approve', '通過', '#1B6B4A')}</span>
                        <span data-guide="refund-reject">{actionBtn(r.id, 'reject', '拒絕', '#dc2626')}</span>
                        {actionBtn(r.id, 'process', '處理中', '#d97706')}
                        {actionBtn(r.id, 'complete', '完成', '#6b7280')}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrapper>
          )}
        </Card>
      </div>
    </div>
  );
}
