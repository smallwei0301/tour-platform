'use client';

/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import { Card, PageHeader, StatusBadge, Select } from '../../../src/components/admin/ui';
import { ResponsiveTable, type ResponsiveColumn } from '../../../src/components/admin/responsive';
import { csrfHeaders } from '../../../src/lib/csrf-client';

type Row = {
  id: string; status: string; totalTwd: number; costTwd: number; marginTwd: number;
  title?: string | null; peopleCount?: number; contactName?: string | null;
  contactEmail?: string | null; createdAt?: string | null; paidAt?: string | null; adminNote?: string | null;
  trade_no?: string | null;
};

const ORDER_STATUSES = ['pending_payment','paid','confirmed','rejected','cancelled_by_user','cancelled_by_guide','completed','refund_pending','refunded'];

const STATUS_LABELS: Record<string, string> = {
  pending_payment: '待付款',
  paid: '已付款',
  confirmed: '已確認',
  rejected: '已拒絕',
  cancelled_by_user: '用戶取消',
  cancelled_by_guide: '導遊取消',
  completed: '已完成',
  refund_pending: '退款中',
  refunded: '已退款',
};

export default function AdminOrdersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<Row | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editNote, setEditNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [exceptionAction, setExceptionAction] = useState<'reschedule'|'adjust_capacity'|'oversell_fix'>('reschedule');
  const [targetScheduleId, setTargetScheduleId] = useState('');
  const [newCapacity, setNewCapacity] = useState('');
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [exceptionBusy, setExceptionBusy] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [isExecutingRefund, setIsExecutingRefund] = useState(false);
  const [refundExecuted, setRefundExecuted] = useState(false);
  const [refundError, setRefundError] = useState('');
  // #1411 — 訂單留言串（admin 第一期唯讀）
  const [orderMessages, setOrderMessages] = useState<any[]>([]);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const q = status ? `?status=${encodeURIComponent(status)}` : '';
      const res = await fetch(`/api/admin/orders${q}`, { cache: 'no-store' });
      const j = await res.json().catch(() => null);
      // 「讀取失敗」與「沒有訂單」必須可分辨：失敗時不得靜默渲染空表，
      // 否則會被誤讀為訂單全部消失。
      if (!res.ok || !j?.ok || !Array.isArray(j?.data)) {
        const code = j?.error?.code ? `（${j.error.code}）` : `（HTTP ${res.status}）`;
        setRows([]);
        setLoadError(`訂單資料載入失敗${code}，目前清單非即時狀態，請重試或稍後再試。`);
        return;
      }
      setRows(j.data);
    } catch {
      setRows([]);
      setLoadError('訂單資料載入失敗（網路錯誤），請重試或稍後再試。');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [status]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); setTimeline([]); return; }
    setRefundReason('');
    setRefundExecuted(false);
    setRefundError('');
    fetch(`/api/admin/orders/${encodeURIComponent(selectedId)}`, { cache: 'no-store' })
      .then(r => r.json()).then(j => { setDetail(j.data||null); setEditStatus(j.data?.status||''); setEditNote(j.data?.adminNote||''); }).catch(() => setDetail(null));
    fetch(`/api/admin/orders/${encodeURIComponent(selectedId)}/audit-logs`, { cache: 'no-store' })
      .then(r => r.json()).then(j => setAuditLogs(j.data||[])).catch(() => setAuditLogs([]));
    fetch(`/api/admin/orders/${encodeURIComponent(selectedId)}/timeline`, { cache: 'no-store' })
      .then(r => r.json()).then(j => setTimeline(j.data?.timeline||[])).catch(() => setTimeline([]));
    fetch(`/api/admin/orders/${encodeURIComponent(selectedId)}/messages`, { cache: 'no-store' })
      .then(r => r.json()).then(j => setOrderMessages(j.data?.messages||[])).catch(() => setOrderMessages([]));
  }, [selectedId]);

  const filtered = useMemo(() => rows, [rows]);

  async function executeRefund(orderId: string) {
    setIsExecutingRefund(true);
    setRefundError('');
    try {
      const body = detail?.trade_no ? {} : { reason: refundReason };
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/refund-execute`, {
        method: 'POST',
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setRefundExecuted(true);
        await load();
        const dr = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, { cache: 'no-store' });
        setDetail((await dr.json()).data || null);
      } else {
        setRefundError('退款執行失敗');
      }
    } catch {
      setRefundError('退款執行失敗');
    } finally {
      setIsExecutingRefund(false);
    }
  }

  async function applyException() {
    if (!selectedId) return;
    setExceptionBusy(true);
    try {
      await fetch(`/api/admin/orders/${encodeURIComponent(selectedId)}/exceptions`, {
        method: 'POST', headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ action: exceptionAction, targetScheduleId: targetScheduleId||undefined, newCapacity: newCapacity?Number(newCapacity):undefined, adminNote: editNote }),
      });
      await load();
      const [dr, lr] = await Promise.all([
        fetch(`/api/admin/orders/${encodeURIComponent(selectedId)}`, { cache: 'no-store' }),
        fetch(`/api/admin/orders/${encodeURIComponent(selectedId)}/audit-logs`, { cache: 'no-store' }),
      ]);
      setDetail((await dr.json()).data||null);
      setAuditLogs((await lr.json()).data||[]);
    } finally { setExceptionBusy(false); }
  }

  async function saveDetail() {
    if (!selectedId) return;
    setSaving(true);
    try {
      await fetch(`/api/admin/orders/${encodeURIComponent(selectedId)}`, {
        method: 'PATCH', headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ status: editStatus, adminNote: editNote }),
      });
      await load();
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(selectedId)}`, { cache: 'no-store' });
      setDetail((await res.json()).data||null);
    } finally { setSaving(false); }
  }

  const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', fontSize: 13, marginTop: 4, outline: 'none', boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 14 };
  const btnStyle = (variant: 'primary'|'secondary'|'danger' = 'primary'): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    background: variant === 'primary' ? 'var(--tp-primary)' : variant === 'danger' ? '#ef4444' : '#f1f5f9',
    color: variant === 'secondary' ? '#374151' : '#fff',
  });

  const orderColumns: ResponsiveColumn<Row>[] = [
    {
      key: 'id', header: 'Order ID', mobilePriority: 'hidden',
      cell: (r) => <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#6b7280' }}>{r.id.slice(0, 12)}…</span>,
    },
    {
      key: 'status', header: '狀態', mobilePriority: 'subtitle',
      cell: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'title', header: '行程', mobilePriority: 'title',
      cell: (r) => <span style={{ fontSize: 13 }}>{r.title || '-'}</span>,
    },
    {
      key: 'total', header: '金額', align: 'right', mobileLabel: '金額',
      cell: (r) => <strong>NT${r.totalTwd.toLocaleString()}</strong>,
    },
    {
      key: 'margin', header: '毛利', align: 'right', mobileLabel: '毛利',
      cell: (r) => <span style={{ color: r.marginTwd >= 0 ? '#15803d' : '#dc2626', fontWeight: 600 }}>NT${r.marginTwd.toLocaleString()}</span>,
    },
  ];

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader title="訂單管理" subtitle="查看、篩選、修改訂單狀態與備註" />

      <div className="admin-page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Filter */}
        <Card className="admin-toolbar" style={{ padding: '14px 18px' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>篩選狀態</span>
          <Select data-guide="order-filter" value={status} onChange={setStatus} style={{ minWidth: 160 }}>
            <option value="">全部狀態</option>
            {ORDER_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>)}
          </Select>
          <span className="admin-toolbar-meta" style={{ fontSize: 13, color: '#9ca3af' }}>共 {filtered.length} 筆</span>
        </Card>

        {/* 讀取失敗：明確告知並提供重試，避免被誤讀為「沒有訂單」 */}
        {!loading && loadError && (
          <Card
            data-testid="admin-orders-load-error"
            style={{ padding: '14px 18px', border: '1px solid #fecaca', background: '#fef2f2' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ color: '#b91c1c', fontSize: 14, fontWeight: 600 }}>{loadError}</div>
              <button
                onClick={() => { void load(); }}
                style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: '#b91c1c', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                重試
              </button>
            </div>
          </Card>
        )}

        <div className="admin-split-grid">
          {/* Table */}
          <Card data-guide="order-table">
            <ResponsiveTable
              columns={orderColumns}
              rows={filtered}
              getRowKey={(r) => r.id}
              onRowClick={(r) => setSelectedId(r.id)}
              selectedKey={selectedId}
              loading={loading}
              loadingRows={8}
              emptyMessage={loadError ? '載入失敗，訂單資料暫時無法顯示，請點上方「重試」' : '沒有訂單資料'}
            />
          </Card>

          {/* Detail Panel */}
          <Card data-guide="order-detail" style={{ padding: 20 }}>
            {!detail ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: '#9ca3af' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>👆</div>
                <p style={{ margin: 0, fontSize: 14 }}>點選左側訂單查看詳情</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>訂單詳情</h3>
                  <StatusBadge status={detail.status} />
                </div>

                <div style={{ fontSize: 13, color: '#374151', lineHeight: 2, background: '#f9fafb', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                  <div><strong>ID：</strong><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{detail.id}</span></div>
                  <div><strong>行程：</strong>{detail.title || '-'}</div>
                  <div><strong>聯絡人：</strong>{detail.contactName || '-'}（{detail.contactEmail || '-'}）</div>
                  <div><strong>人數：</strong>{detail.peopleCount || 1} 人</div>
                  <div><strong>總額：</strong>NT${Number(detail.totalTwd||0).toLocaleString()}</div>
                  <div><strong>建立：</strong>{detail.createdAt ? new Date(detail.createdAt).toLocaleString('zh-TW') : '-'}</div>
                  <div><strong>付款：</strong>{detail.paidAt ? new Date(detail.paidAt).toLocaleString('zh-TW') : '-'}</div>
                </div>

                <label htmlFor="admin-order-status" style={labelStyle}>狀態</label>
                <Select id="admin-order-status" value={editStatus} onChange={setEditStatus}>
                  {ORDER_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>)}
                </Select>

                <label htmlFor="admin-order-note" style={labelStyle}>Admin Note</label>
                <textarea id="admin-order-note" value={editNote} onChange={e => setEditNote(e.target.value)} rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }} />

                <details data-guide="exception-panel" style={{ marginTop: 16, border: '1px solid #e5e7eb', borderRadius: 8 }}>
                  <summary style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>🔧 例外處理</summary>
                  <div style={{ padding: '10px 14px', borderTop: '1px solid #f0f0f0' }}>
                    <label htmlFor="admin-order-exception-action" style={labelStyle}>Action</label>
                    <Select id="admin-order-exception-action" value={exceptionAction} onChange={v => setExceptionAction(v as any)}>
                      <option value="reschedule">reschedule（改期）</option>
                      <option value="adjust_capacity">adjust_capacity（名額修正）</option>
                      <option value="oversell_fix">oversell_fix（超賣修正）</option>
                    </Select>
                    <label htmlFor="admin-order-target-schedule-id" style={labelStyle}>targetScheduleId（可選）</label>
                    <input id="admin-order-target-schedule-id" value={targetScheduleId} onChange={e => setTargetScheduleId(e.target.value)} style={inputStyle} placeholder="例如 sch_chaishan_0401" />
                    <label htmlFor="admin-order-new-capacity" style={labelStyle}>newCapacity（adjust_capacity 時使用）</label>
                    <input id="admin-order-new-capacity" value={newCapacity} onChange={e => setNewCapacity(e.target.value)} style={inputStyle} placeholder="例如 12" />
                    <button onClick={applyException} disabled={exceptionBusy} style={{ ...btnStyle('secondary'), marginTop: 10 }}>
                      {exceptionBusy ? '套用中…' : '套用例外處理'}
                    </button>
                  </div>
                </details>

                {/* #1411 — 留言串唯讀檢視（admin 第一期不發言） */}
                {orderMessages.length > 0 && (
                  <details data-guide="order-messages" style={{ marginTop: 14, border: '1px solid #e5e7eb', borderRadius: 8 }}>
                    <summary style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>
                      💬 旅客 ↔ 嚮導留言（{orderMessages.length}）
                    </summary>
                    <ul style={{ margin: 0, padding: '8px 14px 12px', listStyle: 'none' }}>
                      {orderMessages.map((m: any) => (
                        <li key={m.id} data-guide="order-message-row" style={{ fontSize: 12, color: '#374151', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                          <strong style={{ color: m.senderRole === 'guide' ? '#7c3aed' : '#0f766e' }}>
                            {m.senderRole === 'guide' ? '嚮導' : m.senderRole === 'traveler' ? '旅客' : '客服'}
                          </strong>
                          <span style={{ marginLeft: 6, color: '#9ca3af' }}>
                            {m.createdAt ? new Date(m.createdAt).toLocaleString('zh-TW') : '-'}
                          </span>
                          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 2 }}>{m.body}</div>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                <button onClick={saveDetail} disabled={saving} style={{ ...btnStyle('primary'), marginTop: 14, width: '100%' }}>
                  {saving ? '儲存中…' : '儲存變更'}
                </button>

                {/* Refund Timeline — AC1/AC2/AC5 */}
                {timeline.filter((e: any) => /refund/.test(e.type || '')).length > 0 && (
                  <details data-guide="refund-timeline" open style={{ marginTop: 14, border: '1px solid #fde68a', borderRadius: 8, background: '#fffbeb' }}>
                    <summary style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#92400e' }}>
                      🔄 退款時間軸 ({timeline.filter((e: any) => /refund/.test(e.type || '')).length})
                    </summary>
                    <ul style={{ margin: 0, padding: '8px 14px 12px', listStyle: 'none' }}>
                      {timeline
                        .filter((e: any) => /refund/.test(e.type || ''))
                        .map((e: any, idx: number) => (
                          <li key={e.at + idx} style={{ fontSize: 12, color: '#6b7280', padding: '6px 0', borderBottom: '1px solid #fde68a' }}>
                            <strong style={{ color: '#374151' }}>{e.title}</strong>
                            <span style={{ marginLeft: 6, color: '#9ca3af' }}>
                              {e.at ? new Date(e.at).toLocaleString('zh-TW') : '-'}
                            </span>
                            {e.detail?.trade_no && (
                              <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 11, background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>
                                ECPay: {String(e.detail.trade_no)}
                              </span>
                            )}
                            {e.detail?.tradeNo && !e.detail?.trade_no && (
                              <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 11, background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>
                                ECPay: {String(e.detail.tradeNo)}
                              </span>
                            )}
                          </li>
                        ))}
                    </ul>
                  </details>
                )}

                {/* Payment Timeline — shows trade_no for all payment events */}
                {timeline.filter((e: any) => /payment/.test(e.type || '') && (e.detail?.trade_no || e.detail?.tradeNo)).length > 0 && (
                  <details data-guide="payment-timeline" style={{ marginTop: 10, border: '1px solid #e5e7eb', borderRadius: 8 }}>
                    <summary style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>
                      💳 付款紀錄 trade_no
                    </summary>
                    <ul style={{ margin: 0, padding: '8px 14px 12px', listStyle: 'none' }}>
                      {timeline
                        .filter((e: any) => /payment/.test(e.type || '') && (e.detail?.trade_no || e.detail?.tradeNo))
                        .map((e: any, idx: number) => (
                          <li key={e.at + idx} style={{ fontSize: 12, color: '#6b7280', padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                            <strong style={{ color: '#374151' }}>{e.title}</strong>
                            <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 11, background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>
                              trade_no: {String(e.detail?.trade_no || e.detail?.tradeNo)}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </details>
                )}

                {/* AC1/AC2/AC3 — 執行退款 button for refund_pending orders */}
                {detail.status === 'refund_pending' && !refundExecuted && (
                  <div data-guide="refund-execute-section" style={{ marginTop: 14, padding: '12px 14px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#9a3412', marginBottom: 8 }}>退款執行</div>
                    {/* AC3: cash orders (no trade_no) require reason textarea */}
                    {!detail.trade_no && (
                      <textarea
                        data-guide="refund-reason-input"
                        value={refundReason}
                        onChange={e => setRefundReason(e.target.value)}
                        placeholder="退款原因（現金訂單必填）"
                        rows={3}
                        style={{ ...inputStyle, resize: 'vertical', marginBottom: 8 }}
                      />
                    )}
                    <button
                      data-guide="refund-execute-btn"
                      onClick={() => executeRefund(detail.id)}
                      disabled={isExecutingRefund || (!detail.trade_no && !refundReason.trim())}
                      style={{ ...btnStyle('danger'), width: '100%', opacity: (isExecutingRefund || (!detail.trade_no && !refundReason.trim())) ? 0.5 : 1, cursor: (isExecutingRefund || (!detail.trade_no && !refundReason.trim())) ? 'not-allowed' : 'pointer' }}
                    >
                      {isExecutingRefund ? '退款執行中…' : '執行退款'}
                    </button>
                    {refundError && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#dc2626' }}>{refundError}</p>}
                  </div>
                )}

                {/* AC2: success message after execution */}
                {refundExecuted && (
                  <div data-guide="refund-executed-msg" style={{ marginTop: 14, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, color: '#15803d', fontWeight: 600 }}>
                    退款已執行
                  </div>
                )}

                {/* AC4: already-refunded state */}
                {detail.status === 'refunded' && (
                  <div data-guide="refund-completed-banner" style={{ marginTop: 14, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, color: '#15803d', fontWeight: 600 }}>
                    已完成退款 ✓
                  </div>
                )}

                {auditLogs.length > 0 && (
                  <details data-guide="audit-logs" style={{ marginTop: 14, border: '1px solid #e5e7eb', borderRadius: 8 }}>
                    <summary style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>📋 Audit Logs ({auditLogs.length})</summary>
                    <ul style={{ margin: 0, padding: '8px 14px 12px', listStyle: 'none' }}>
                      {auditLogs.map((l: any) => (
                        <li key={l.id} style={{ fontSize: 12, color: '#6b7280', padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                          <strong style={{ color: '#374151' }}>{l.action}</strong> · {l.createdAt ? new Date(l.createdAt).toLocaleString('zh-TW') : '-'}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
