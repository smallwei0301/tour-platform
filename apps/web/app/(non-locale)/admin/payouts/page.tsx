'use client';

import { useEffect, useState } from 'react';
import { csrfHeaders } from '../../../../src/lib/csrf-client';
import { Card, PageHeader, StatusBadge } from '../../../../src/components/admin/ui';
import { ResponsiveTable, type ResponsiveColumn } from '../../../../src/components/admin/responsive';

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

type BalanceRow = {
  guide_id: string;
  balance_twd: number;
  last_settled_at: string | null;
  display_name: string | null;
  email: string | null;
  has_pending_payout: boolean;
};

export default function AdminPayoutsPage() {
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [minWithdrawal, setMinWithdrawal] = useState(5000);
  const [loading, setLoading] = useState(true);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [transferRef, setTransferRef] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState('');

  async function loadRows() {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/admin/payouts', { cache: 'no-store' });
      const json = await res.json();
      setRows(json?.data || []);
    } finally { setLoading(false); }
  }

  async function loadBalances() {
    setBalancesLoading(true);
    try {
      const res = await fetch('/api/v2/admin/payouts/balances', { cache: 'no-store' });
      const json = await res.json();
      setBalances(json?.data?.balances || []);
      if (json?.data?.min_withdrawal_twd) setMinWithdrawal(json.data.min_withdrawal_twd);
    } finally { setBalancesLoading(false); }
  }

  useEffect(() => { loadRows(); loadBalances(); }, []);

  async function confirmPayout(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/v2/admin/payouts/${id}/confirm`, {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ confirmed_by: 'admin', transfer_ref: transferRef[id] || null }),
      });
      await Promise.all([loadRows(), loadBalances()]);
    } finally { setBusyId(''); }
  }

  async function cancelPayout(id: string) {
    setBusyId(id);
    setActionError('');
    try {
      const res = await fetch(`/api/v2/admin/payouts/${id}/cancel`, {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ cancelled_by: 'admin' }),
      });
      const json = await res.json();
      if (!json?.ok) setActionError(json?.error || '取消失敗');
      await Promise.all([loadRows(), loadBalances()]);
    } finally { setBusyId(''); }
  }

  async function generatePayout(guideId: string) {
    setBusyId(guideId);
    setActionError('');
    try {
      const res = await fetch('/api/v2/admin/payouts/generate', {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ guide_id: guideId, actor: 'admin' }),
      });
      const json = await res.json();
      if (!json?.ok) setActionError(json?.error || '產生出款單失敗');
      await Promise.all([loadRows(), loadBalances()]);
    } finally { setBusyId(''); }
  }

  const payoutColumns: ResponsiveColumn<PayoutRow>[] = [
    {
      key: 'id', header: 'Payout ID', mobilePriority: 'hidden',
      cell: (r) => <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#9ca3af' }}>{r.id.slice(0, 10)}…</span>,
    },
    {
      key: 'guide', header: '導遊', mobilePriority: 'title',
      cell: (r) => (
        <>
          <span style={{ fontSize: 13 }}>{r.guide_profiles?.display_name || '-'}</span>
          {r.guide_profiles?.email && (
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{r.guide_profiles.email}</div>
          )}
        </>
      ),
    },
    {
      key: 'amount', header: '金額', align: 'right', mobileLabel: '金額',
      cell: (r) => <strong>NT${Number(r.total_twd || 0).toLocaleString()}</strong>,
    },
    {
      key: 'state', header: '狀態', mobilePriority: 'subtitle',
      cell: (r) => <StatusBadge status={r.state} />,
    },
    {
      key: 'ref', header: '轉帳備註', mobileLabel: '備註',
      cell: (r) => (
        r.state === 'pending' ? (
          <input
            type="text"
            placeholder="轉帳流水號"
            value={transferRef[r.id] || ''}
            onChange={e => setTransferRef(prev => ({ ...prev, [r.id]: e.target.value }))}
            style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, width: '100%', maxWidth: 160, boxSizing: 'border-box' }}
          />
        ) : (
          <span style={{ fontSize: 12, color: '#6b7280' }}>{r.transfer_ref || '-'}</span>
        )
      ),
    },
    {
      key: 'created', header: '建立時間', mobileLabel: '建立',
      cell: (r) => <span style={{ fontSize: 12, color: '#6b7280' }}>{r.created_at ? new Date(r.created_at).toLocaleDateString('zh-TW') : '-'}</span>,
    },
    {
      key: 'actions', header: '操作', mobileLabel: '操作',
      cell: (r) => (
        <>
          {r.state === 'pending' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
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
              <button
                disabled={!!busyId}
                onClick={() => cancelPayout(r.id)}
                data-guide="payout-cancel"
                style={{
                  padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  cursor: busyId ? 'not-allowed' : 'pointer',
                  background: '#fff', color: '#b91c1c', border: '1px solid #fecaca',
                  opacity: busyId ? 0.6 : 1,
                }}
              >
                取消
              </button>
            </div>
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
        </>
      ),
    },
  ];

  const balanceColumns: ResponsiveColumn<BalanceRow>[] = [
    {
      key: 'guide', header: '導遊', mobilePriority: 'title',
      cell: (r) => (
        <>
          <span style={{ fontSize: 13 }}>{r.display_name || '-'}</span>
          {r.email && (
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{r.email}</div>
          )}
        </>
      ),
    },
    {
      key: 'balance', header: '累積餘額', align: 'right', mobileLabel: '餘額',
      cell: (r) => <strong>NT${Number(r.balance_twd || 0).toLocaleString()}</strong>,
    },
    {
      key: 'threshold', header: '門檻', mobilePriority: 'subtitle',
      cell: (r) => (
        r.balance_twd >= minWithdrawal ? (
          <span style={{ fontSize: 12, fontWeight: 600, color: '#1B6B4A' }}>達門檻</span>
        ) : (
          <span style={{ fontSize: 12, color: '#b45309' }}>
            未達門檻（NT${minWithdrawal.toLocaleString()}）
          </span>
        )
      ),
    },
    {
      key: 'settled', header: '最後結算', mobileLabel: '結算',
      cell: (r) => (
        <span style={{ fontSize: 12, color: '#6b7280' }}>
          {r.last_settled_at ? new Date(r.last_settled_at).toLocaleDateString('zh-TW') : '-'}
        </span>
      ),
    },
    {
      key: 'actions', header: '操作', mobileLabel: '操作',
      cell: (r) => (
        r.has_pending_payout ? (
          <span style={{ fontSize: 12, color: '#9ca3af' }}>已有待出款單</span>
        ) : (
          <button
            disabled={!!busyId}
            onClick={() => generatePayout(r.guide_id)}
            data-guide="payout-generate"
            style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              cursor: busyId ? 'not-allowed' : 'pointer',
              background: '#fff', color: '#1B6B4A', border: '1px solid #1B6B4A',
              opacity: busyId ? 0.6 : 1,
            }}
          >
            {busyId === r.guide_id ? '…' : '手動產生出款單'}
          </button>
        )
      ),
    },
  ];

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader title="出款管理" subtitle="審核並確認導遊出款申請" />

      <div className="admin-page">
        {actionError && (
          <div
            role="alert"
            style={{
              marginBottom: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13,
              background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca',
            }}
          >
            {actionError}
          </div>
        )}

        <Card data-guide="payout-list">
          <ResponsiveTable
            columns={payoutColumns}
            rows={rows}
            getRowKey={(r) => r.id}
            loading={loading}
            loadingRows={6}
            emptyMessage="目前沒有待出款紀錄 🎉"
          />
        </Card>

        <div style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>導遊結算餘額</h2>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>
            已結算但尚未產生出款單的導遊餘額（含未達出款門檻者）。結算排程未啟用時，可在此手動產生出款單。
          </p>
          <Card data-guide="payout-balances">
            <ResponsiveTable
              columns={balanceColumns}
              rows={balances}
              getRowKey={(r) => r.guide_id}
              loading={balancesLoading}
              loadingRows={3}
              emptyMessage="目前沒有累積中的導遊餘額"
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
