'use client';

import { useEffect, useMemo, useState } from 'react';

type Row = {
  id: string;
  status: string;
  totalTwd: number;
  costTwd: number;
  marginTwd: number;
  title?: string | null;
  peopleCount?: number;
  contactName?: string | null;
  contactEmail?: string | null;
  createdAt?: string | null;
  paidAt?: string | null;
  adminNote?: string | null;
};

const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'confirmed',
  'rejected',
  'cancelled_by_user',
  'cancelled_by_guide',
  'completed',
  'refund_pending',
  'refunded'
];

export default function AdminOrdersPageV2() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<Row | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editNote, setEditNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [exceptionAction, setExceptionAction] = useState<'reschedule' | 'adjust_capacity' | 'oversell_fix'>('reschedule');
  const [targetScheduleId, setTargetScheduleId] = useState('');
  const [newCapacity, setNewCapacity] = useState('');
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [exceptionBusy, setExceptionBusy] = useState(false);

  async function load() {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    const res = await fetch(`/api/admin/orders${q}`, { cache: 'no-store' });
    const j = await res.json();
    setRows(j.data || []);
  }

  useEffect(() => {
    load().catch(() => setRows([]));
  }, [status]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    fetch(`/api/admin/orders/${encodeURIComponent(selectedId)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        setDetail(j.data || null);
        setEditStatus(j.data?.status || '');
        setEditNote(j.data?.adminNote || '');
      })
      .catch(() => setDetail(null));

    fetch(`/api/admin/orders/${encodeURIComponent(selectedId)}/audit-logs`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setAuditLogs(j.data || []))
      .catch(() => setAuditLogs([]));
  }, [selectedId]);

  const filtered = useMemo(() => rows, [rows]);

  async function applyException() {
    if (!selectedId) return;
    try {
      setExceptionBusy(true);
      await fetch(`/api/admin/orders/${encodeURIComponent(selectedId)}/exceptions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: exceptionAction,
          targetScheduleId: targetScheduleId || undefined,
          newCapacity: newCapacity ? Number(newCapacity) : undefined,
          adminNote: editNote
        })
      });

      await load();
      const [detailRes, logsRes] = await Promise.all([
        fetch(`/api/admin/orders/${encodeURIComponent(selectedId)}`, { cache: 'no-store' }),
        fetch(`/api/admin/orders/${encodeURIComponent(selectedId)}/audit-logs`, { cache: 'no-store' })
      ]);
      const d = await detailRes.json();
      const l = await logsRes.json();
      setDetail(d.data || null);
      setAuditLogs(l.data || []);
    } finally {
      setExceptionBusy(false);
    }
  }

  async function saveDetail() {
    if (!selectedId) return;
    try {
      setSaving(true);
      await fetch(`/api/admin/orders/${encodeURIComponent(selectedId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: editStatus, adminNote: editNote })
      });
      await load();
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(selectedId)}`, { cache: 'no-store' });
      const j = await res.json();
      setDetail(j.data || null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Admin Orders 2.1</h1>
      <p style={{ color: '#666', margin: '6px 0 12px' }}>支援訂單詳情、狀態手動修正、Admin Note。</p>

      <div style={{ margin: '8px 0 12px' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">全部狀態</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
        <div style={{ overflowX: 'auto' }}>
          <table cellPadding={8} style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ddd' }}>
                <th align="left">Order ID</th>
                <th align="left">Status</th>
                <th align="left">Title</th>
                <th align="left">Total</th>
                <th align="left">Margin</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer', background: selectedId === r.id ? '#f5fbf7' : 'transparent' }} onClick={() => setSelectedId(r.id)}>
                  <td>{r.id}</td>
                  <td>{r.status}</td>
                  <td>{r.title || '-'}</td>
                  <td>NT${r.totalTwd.toLocaleString()}</td>
                  <td style={{ color: r.marginTwd >= 0 ? '#15803d' : '#b91c1c' }}>NT${r.marginTwd.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
          {!detail ? (
            <p style={{ color: '#666' }}>請從左側選一筆訂單查看詳情。</p>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>訂單詳情</h3>
              <p><strong>Order:</strong> {detail.id}</p>
              <p><strong>Title:</strong> {detail.title || '-'}</p>
              <p><strong>Contact:</strong> {detail.contactName || '-'}（{detail.contactEmail || '-'}）</p>
              <p><strong>People:</strong> {detail.peopleCount || 1}</p>
              <p><strong>Total:</strong> NT${Number(detail.totalTwd || 0).toLocaleString()}</p>
              <p><strong>Created:</strong> {detail.createdAt ? new Date(detail.createdAt).toLocaleString('zh-TW') : '-'}</p>
              <p><strong>Paid:</strong> {detail.paidAt ? new Date(detail.paidAt).toLocaleString('zh-TW') : '-'}</p>

              <label style={{ display: 'block', marginTop: 10 }}>
                狀態
                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} style={{ width: '100%', marginTop: 4 }}>
                  {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>

              <label style={{ display: 'block', marginTop: 10 }}>
                Admin Note
                <textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} rows={4} style={{ width: '100%', marginTop: 4 }} />
              </label>

              <div style={{ marginTop: 12, borderTop: '1px dashed #ddd', paddingTop: 10 }}>
                <h4 style={{ margin: '0 0 8px' }}>例外處理（Sprint 2.2）</h4>
                <label style={{ display: 'block', marginBottom: 8 }}>
                  Action
                  <select value={exceptionAction} onChange={(e) => setExceptionAction(e.target.value as any)} style={{ width: '100%', marginTop: 4 }}>
                    <option value="reschedule">reschedule（手動改期）</option>
                    <option value="adjust_capacity">adjust_capacity（名額修正）</option>
                    <option value="oversell_fix">oversell_fix（超賣修正）</option>
                  </select>
                </label>
                <label style={{ display: 'block', marginBottom: 8 }}>
                  targetScheduleId（可選）
                  <input value={targetScheduleId} onChange={(e) => setTargetScheduleId(e.target.value)} style={{ width: '100%', marginTop: 4 }} placeholder="例如 sch_chaishan_0401" />
                </label>
                <label style={{ display: 'block', marginBottom: 8 }}>
                  newCapacity（adjust_capacity 時使用）
                  <input value={newCapacity} onChange={(e) => setNewCapacity(e.target.value)} style={{ width: '100%', marginTop: 4 }} placeholder="例如 12" />
                </label>
                <button onClick={applyException} disabled={exceptionBusy}>
                  {exceptionBusy ? '套用中…' : '套用例外處理'}
                </button>
              </div>

              <button onClick={saveDetail} disabled={saving} style={{ marginTop: 10 }}>
                {saving ? '儲存中…' : '儲存變更'}
              </button>

              <div style={{ marginTop: 12, borderTop: '1px dashed #ddd', paddingTop: 10 }}>
                <h4 style={{ margin: '0 0 8px' }}>Audit Logs</h4>
                {auditLogs.length === 0 ? (
                  <p style={{ color: '#666', margin: 0 }}>目前無紀錄</p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {auditLogs.map((l: any) => (
                      <li key={l.id} style={{ marginBottom: 6 }}>
                        <strong>{l.action}</strong> · {l.createdAt ? new Date(l.createdAt).toLocaleString('zh-TW') : '-'}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
