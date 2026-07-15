'use client';

/**
 * /guide/reschedules — 嚮導改期待辦（#1383）。
 * 列出旅客的改期申請，可確認（原子轉移場次）或婉拒；72h 未處理自動失效。
 */
import { useEffect, useState } from 'react';
import { csrfHeaders, ensureCsrfToken } from '../../../../src/lib/csrf-client';

type RescheduleRow = {
  id: string;
  orderId: string;
  status: string;
  fromStartAt: string | null;
  toStartAt: string | null;
  requestedAt: string;
  note?: string;
  activityTitle?: string | null;
  order?: { contactName?: string | null; peopleCount?: number } | null;
};

const STATUS_LABEL: Record<string, string> = {
  requested: '待處理',
  approved: '已改期',
  rejected: '已婉拒',
  withdrawn: '旅客撤回',
  expired: '逾時失效',
};

function fmt(iso?: string | null) {
  return iso ? String(iso).replace('T', ' ').slice(0, 16) : '—';
}

export default function GuideReschedulesPage() {
  const [rows, setRows] = useState<RescheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/v2/guide/reschedule-requests', { cache: 'no-store' });
      if (res.status === 401) {
        setErr('請先登入嚮導帳號');
        return;
      }
      const j = await res.json();
      setRows(Array.isArray(j?.data) ? j.data : []);
    } catch {
      setErr('載入失敗，請重試');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void ensureCsrfToken();
    void load();
  }, []);

  const decide = async (id: string, action: 'approve' | 'reject') => {
    if (action === 'reject' && !confirm('確定婉拒這筆改期申請？訂單將維持原場次。')) return;
    setActing(id);
    setErr(null);
    try {
      const res = await fetch(`/api/v2/guide/reschedule-requests/${encodeURIComponent(id)}/decision`, {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ action }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error?.message || '操作失敗');
      await load();
    } catch (error) {
      setErr(error instanceof Error ? error.message : '操作失敗，請重試');
    } finally {
      setActing(null);
    }
  };

  const pending = rows.filter((r) => r.status === 'requested');
  const resolved = rows.filter((r) => r.status !== 'requested');

  return (
    <main style={{ maxWidth: 720, margin: '32px auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>改期申請</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
        72 小時內未處理的申請會自動失效，訂單維持原場次。確認改期後系統會自動轉移名額並通知旅客。
      </p>

      {err && <p style={{ color: 'crimson', fontSize: 13 }}>{err}</p>}
      {loading ? (
        <p style={{ color: '#6b7280' }}>載入中⋯</p>
      ) : (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '12px 0' }}>待處理（{pending.length}）</h2>
          {pending.length === 0 && <p data-testid="reschedule-empty" style={{ fontSize: 13, color: '#9ca3af' }}>目前沒有待處理的改期申請。</p>}
          {pending.map((r) => (
            <div key={r.id} data-testid={`reschedule-row-${r.id}`} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 6px' }}>{r.activityTitle || '行程'} · {r.order?.contactName || '旅客'}{r.order?.peopleCount ? `（${r.order.peopleCount} 人）` : ''}</p>
              <p style={{ fontSize: 13, color: '#374151', margin: '0 0 2px' }}>原場次：{fmt(r.fromStartAt)}</p>
              <p style={{ fontSize: 13, color: '#374151', margin: '0 0 10px' }}>新場次：{fmt(r.toStartAt)}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  data-testid={`reschedule-approve-${r.id}`}
                  onClick={() => void decide(r.id, 'approve')}
                  disabled={acting === r.id}
                  style={{ padding: '9px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  確認改期
                </button>
                <button
                  data-testid={`reschedule-reject-${r.id}`}
                  onClick={() => void decide(r.id, 'reject')}
                  disabled={acting === r.id}
                  style={{ padding: '9px 16px', background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  婉拒
                </button>
              </div>
            </div>
          ))}

          {resolved.length > 0 && (
            <>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: '20px 0 12px' }}>已處理</h2>
              {resolved.map((r) => (
                <div key={r.id} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: '10px 16px', marginBottom: 8 }}>
                  <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
                    {r.activityTitle || '行程'} · {fmt(r.fromStartAt)} → {fmt(r.toStartAt)} · {STATUS_LABEL[r.status] || r.status}
                  </p>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </main>
  );
}
