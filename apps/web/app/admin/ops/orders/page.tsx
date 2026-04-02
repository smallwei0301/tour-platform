'use client';

import { useEffect, useState } from 'react';

type Row = {
  id: string;
  status: string;
  totalTwd: number;
  costTwd: number;
  marginTwd: number;
};

export default function AdminOrdersPage() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    fetch('/api/admin/orders')
      .then((r) => r.json())
      .then((j) => setRows(j.data || []))
      .catch(() => setRows([]));
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <h1>Admin Orders</h1>
      <table cellPadding={8}>
        <thead>
          <tr>
            <th>Order ID</th>
            <th>Status</th>
            <th>Total</th>
            <th>Cost</th>
            <th>Margin</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>{r.status}</td>
              <td>{r.totalTwd}</td>
              <td>{r.costTwd}</td>
              <td>{r.marginTwd}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
