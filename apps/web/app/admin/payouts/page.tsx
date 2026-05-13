'use client';

import { useEffect, useState } from 'react';
import { Card, PageHeader, StatusBadge, TableWrapper, Th, Td, LoadingSkeleton, EmptyState } from '../../../src/components/admin/ui';

type PayoutRow = {
  id: string;
  guide_id: string;
  total_twd: number;
  state: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  transfer_ref: string | null;
  notes: string | null;
  created_at: string;
  guide_profiles: { display_name: string | null; email: string | null } | null;
};

export default function AdminPayoutsPage() {
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [transferRef, setTransferRef] = useState<Record<string, string>>({});

  async function loadRows() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/payouts', { cache: 'no-store' });
      const json = await res.json();
      setRows(json?.data || []);
    } finally { setLoading(false); }
  }

  useEffect(() => { loadRows(); }, []);

  async function confirmPayout(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/admin/payouts/${id}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmed_by: 'admin', transfer_ref: transferRef[id] || null }),
      });
      await loadRows();
    } finally { setBusyId(''); }
  }

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader title="出款管理" subtitle="審核並確認導遊出款申請" />

      <div style={{ padding: '20px 28px' }}>
        <Card data-guide="payout-list">
          {loading ? <LoadingSkeleton rows={6} /> : rows.length === 0 ? <EmptyState message="目前沒有待出款紀錄 🎉" /> : (
            <TableWrapper>
              <thead>
                <tr>
                  <Th>Payout ID</Th>
                  <Th>導遊</Th>
                  <Th align="right">金額</Th>
                  <Th>狀態</Th>
                  <Th>轉帳備註</Th>
                  <Th>建立時間</Th>
                  <Th>操作</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <Td>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#9ca3af' }}>
                        {r.id.slice(0, 10)}…
                      </span>
                    </Td>
                    <Td>
                      <span style={{ fontSize: 13 }}>{r.guide_profiles?.display_name || '-'}</span>
                      {r.guide_profiles?.email && (
                        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{r.guide_profiles.email}</div>
                      )}
                    </Td>
                    <Td align="right">
                      <strong>NT${Number(r.total_twd || 0).toLocaleString()}</strong>
                    </Td>
                    <Td><StatusBadge status={r.state} /></Td>
                    <Td>
                      {r.state === 'pending' ? (
                        <input
                          type="text"
                          placeholder="轉帳流水號"
                          value={transferRef[r.id] || ''}
                          onChange={e => setTransferRef(prev => ({ ...prev, [r.id]: e.target.value }))}
                          style={{
                            padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6,
                            fontSize: 12, width: 130,
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: 12, color: '#6b7280' }}>{r.transfer_ref || '-'}</span>
                      )}
                    </Td>
                    <Td>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>
                        {r.created_at ? new Date(r.created_at).toLocaleDateString('zh-TW') : '-'}
                      </span>
                    </Td>
                    <Td>
                      {r.state === 'pending' && (
                        <button
                          disabled={!!busyId}
                          onClick={() => confirmPayout(r.id)}
                          data-guide="payout-confirm"
                          style={{
                            padding: '4px 12px', borderRadius: 6, border: 'none', fontSize: 12,
                            fontWeight: 600, cursor: busyId ? 'not-allowed' : 'pointer',
                            background: busyId ? '#f1f5f9' : '#1B6B4A', color: '#fff',
                            opacity: busyId ? 0.6 : 1,
                          }}
                        >
                          {busyId === r.id ? '…' : '確認出款'}
                        </button>
                      )}
                      {r.state === 'paid' && (
                        <div style={{ fontSize: 12, color: '#6b7280' }}>
                          <div>已出款</div>
                          {r.confirmed_at && <div>{new Date(r.confirmed_at).toLocaleDateString('zh-TW')}</div>}
                        </div>
                      )}
                      {r.state === 'cancelled' && (
                        <span style={{ fontSize: 12, color: '#9ca3af' }}>已取消</span>
                      )}
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
