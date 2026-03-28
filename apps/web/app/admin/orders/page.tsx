'use client';

import { useEffect, useMemo, useState } from 'react';

type Row = {
  id: string;
  status: string;
  totalTwd: number;
  costTwd: number;
  marginTwd: number;
};

export default function AdminOrdersPageV2() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    fetch('/api/admin/orders')
      .then((r) => r.json())
      .then((j) => setRows(j.data || []))
      .catch(() => setRows([]));
  }, []);

  const filtered = useMemo(() => {
    if (!status) return rows;
    return rows.filter((r) => r.status === status);
  }, [rows, status]);

  return (
    <main style={{ padding: 24 }}>
      <h1>Admin Orders 2.0</h1>
      <div style={{ margin: '8px 0 12px' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">全部狀態</option>
          {[...new Set(rows.map((r) => r.status))].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <table cellPadding={8} style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ddd' }}>
            <th align="left">Order ID</th>
            <th align="left">Status</th>
            <th align="left">Total</th>
            <th align="left">Cost</th>
            <th align="left">Margin</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <td>{r.id}</td>
              <td>{r.status}</td>
              <td>NT${r.totalTwd.toLocaleString()}</td>
              <td>NT${r.costTwd.toLocaleString()}</td>
              <td style={{ color: r.marginTwd >= 0 ? '#15803d' : '#b91c1c' }}>NT${r.marginTwd.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
