'use client';

import { useEffect, useState } from 'react';

type GuideApp = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  status: string;
  bio: string;
  createdAt: string;
  adminNote?: string | null;
};

export default function AdminGuidesPage() {
  const [rows, setRows] = useState<GuideApp[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const q = status ? `?status=${encodeURIComponent(status)}` : '';
      const res = await fetch(`/api/admin/guide-applications${q}`, { cache: 'no-store' });
      const json = await res.json();
      setRows(json?.data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [status]);

  async function action(id: string, kind: 'approve' | 'reject' | 'suspend') {
    const url = kind === 'suspend' ? `/api/admin/guides/${id}/suspend` : `/api/admin/guide-applications/${id}/${kind}`;
    await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ adminNote: `admin ${kind}` }) });
    await load();
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Admin Guide Applications</h1>
      <div style={{ margin: '8px 0 12px' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">全部狀態</option>
          <option value="pending">pending</option>
          <option value="approved">approved</option>
          <option value="rejected">rejected</option>
          <option value="suspended">suspended</option>
        </select>
      </div>

      {loading ? (
        <p>載入中…</p>
      ) : rows.length === 0 ? (
        <p>沒有申請資料。</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table cellPadding={8} style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ddd' }}>
                <th align="left">ID</th>
                <th align="left">姓名</th>
                <th align="left">聯絡</th>
                <th align="left">城市</th>
                <th align="left">狀態</th>
                <th align="left">建立時間</th>
                <th align="left">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td>{r.id}</td>
                  <td><strong>{r.fullName}</strong><br /><small style={{ color: '#666' }}>{r.bio?.slice(0, 40) || ''}</small></td>
                  <td>{r.email}<br />{r.phone}</td>
                  <td>{r.city}</td>
                  <td>{r.status}</td>
                  <td>{r.createdAt ? new Date(r.createdAt).toLocaleString('zh-TW') : '-'}</td>
                  <td>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <button onClick={() => action(r.id, 'approve')}>Approve</button>
                      <button onClick={() => action(r.id, 'reject')}>Reject</button>
                      <button onClick={() => action(r.id, 'suspend')}>Suspend</button>
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
