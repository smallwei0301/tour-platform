'use client';

import { useEffect, useState } from 'react';

type RefundRow = {
  id: string;
  orderId: string;
  reason: string;
  note: string;
  status: string;
  requestedAt: string;
  orderStatus: string | null;
  totalTwd: number;
  contactName: string | null;
  contactEmail: string | null;
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
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
  }, []);

  async function doAction(id: string, action: 'approve' | 'reject' | 'process' | 'complete') {
    try {
      setBusyId(id + action);
      await fetch(`/api/admin/refund-requests/${id}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ adminNote: `admin ${action}` })
      });
      await loadRows();
    } finally {
      setBusyId('');
    }
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Admin Refund Requests</h1>
      <p style={{ color: '#666', marginBottom: 12 }}>MVP 退款管理面板（approve / reject / process / complete）</p>

      {loading ? (
        <p>載入中…</p>
      ) : rows.length === 0 ? (
        <p>目前沒有退款申請。</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table cellPadding={8} style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ddd' }}>
                <th align="left">Refund ID</th>
                <th align="left">Order</th>
                <th align="left">Status</th>
                <th align="left">Reason</th>
                <th align="left">Amount</th>
                <th align="left">Contact</th>
                <th align="left">Requested At</th>
                <th align="left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td>{r.id}</td>
                  <td>{r.orderId}<br /><small style={{ color: '#666' }}>order status: {r.orderStatus || '-'}</small></td>
                  <td>{r.status}</td>
                  <td>{r.reason}{r.note ? <><br /><small style={{ color: '#666' }}>{r.note}</small></> : null}</td>
                  <td>NT${Number(r.totalTwd || 0).toLocaleString()}</td>
                  <td>{r.contactName || '-'}<br /><small style={{ color: '#666' }}>{r.contactEmail || '-'}</small></td>
                  <td>{r.requestedAt ? new Date(r.requestedAt).toLocaleString('zh-TW') : '-'}</td>
                  <td>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <button disabled={!!busyId} onClick={() => doAction(r.id, 'approve')}>Approve</button>
                      <button disabled={!!busyId} onClick={() => doAction(r.id, 'reject')}>Reject</button>
                      <button disabled={!!busyId} onClick={() => doAction(r.id, 'process')}>Process</button>
                      <button disabled={!!busyId} onClick={() => doAction(r.id, 'complete')}>Complete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
