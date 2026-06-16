'use client';

/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import { Card, PageHeader, StatusBadge, Select } from '../../../src/components/admin/ui';
import { ResponsiveTable, ResponsiveModal, useIsMobile, type ResponsiveColumn } from '../../../src/components/admin/responsive';
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

// 狀態連動標記（依「後台手動切換狀態」實際觸發的真實 API 連動標註）。
//  💬 影響 LINE／Telegram 通知發送
//      （src/lib/admin-order-event-kind.mjs → adminStatusToTelegramKind；
//       PATCH /api/admin/orders/[orderId] 會 fan-out 旅客＋導遊＋管理群組）
//  💰 觸發自動推進下一步／出帳結算
//      （src/lib/post-trip/payout-eligibility.mjs → 僅 completed 進入 settlement sweep）
// 其他連動以圖標標註，圖例見 STATUS_MARK_LEGEND。
const STATUS_MARK_LEGEND =
  '標記說明： 💬 影響 LINE／Telegram 通知　💰 觸發出帳／結算　🔒 切換後鎖定不可再編輯　💳 連動付款狀態　📊 計入 GMV 統計　💸 退款連動　⭐ 觸發行程後評價邀請';

const STATUS_MARKS: Record<string, string> = {
  pending_payment: '💳',
  paid: '💬 💳 📊',
  confirmed: '📊',
  rejected: '💬',
  cancelled_by_user: '💬 🔒',
  cancelled_by_guide: '💬 🔒',
  completed: '💰 🔒 ⭐',
  refund_pending: '💬 🔒 💸',
  refunded: '💬 🔒 💸',
};

// 每個狀態切換後的真實連動說明（顯示於訂單詳情，協助維運判斷後果）。
const STATUS_EFFECTS: Record<string, string> = {
  pending_payment:
    '訂單初始狀態：占用名額等待付款。💳 切到此狀態會自動重置付款狀態為 pending、清除付款時間戳。無法手動切換到此狀態；若目前是 locked 狀態（已完成、已取消、退款中等）無法編輯。',
  paid:
    '💬 發送 LINE／Telegram「已付款」通知（旅客＋導遊＋管理群組）。💳 同步自動設定付款狀態為 paid 與付款時間戳（系統當前時間）。📊 金額計入 GMV 統計。尚未進入出帳；訂單仍可編輯狀態、備註、聯絡方式、人數。',
  confirmed:
    '已確認名額。📊 計入 GMV 統計，並是「可標記完成」的前置狀態。手動切換不發送通知，不影響付款狀態。訂單仍可編輯（狀態、備註、聯絡方式、人數）。',
  rejected:
    '💬 發送 LINE／Telegram「訂單已取消」通知（旅客＋導遊＋管理群組）。訂單保持可編輯狀態，不發送付款狀態變更。不列入行程後評價邀請。',
  cancelled_by_user:
    '💬 發送 LINE／Telegram「訂單已取消」通知。🔒 切換後訂單立即鎖定，無法再編輯狀態、備註、聯絡資訊、人數等任何欄位。注意：此下拉只改狀態；釋放名額＋自動建立退款請使用「取消＋退款」按鈕或專用 API 處理。',
  cancelled_by_guide:
    '💬 發送 LINE／Telegram「訂單已取消」通知。🔒 切換後訂單立即鎖定，無法再編輯。注意：此下拉只改狀態；釋放名額並自動建立全額退款 entry 由專用「取消＋退款」API 完成。',
  completed:
    '💰 唯一會被結算 sweep 納入「可出帳」的狀態（completed 且無退款／投訴／安全等 hold）。⭐ 觸發行程後評價邀請流程。🔒 切換後訂單立即鎖定，無法再改狀態、備註或聯絡方式。手動切換不發送即時通知。',
  refund_pending:
    '💬 發送 LINE／Telegram「退款申請中」通知。🔒 切換後訂單立即鎖定，無法再編輯。💸 解鎖訂單詳情下方的「執行退款」按鈕，並讓該筆 payout 進入 hold（暫不出帳）。此狀態已排除於出帳候選。',
  refunded:
    '💬 發送 LINE／Telegram「退款完成」通知。🔒 切換後訂單立即鎖定，無法再編輯。💸 payout 以有效金額（總額扣除已退款部分）反向沖銷；全額退款則整筆排除於出帳之外。',
};

export default function AdminOrdersPage() {
  const isMobile = useIsMobile(768);
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

  // 訂單詳情主體：桌機放在右側面板、手機用彈出視窗呈現，共用同一份 JSX。
  // 手機版的標題與關閉鈕由 ResponsiveModal 提供，這裡的標題列只在桌機顯示。
  const detailBody = !detail ? null : (
    <>
      {!isMobile && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>訂單詳情</h3>
          <StatusBadge status={detail.status} />
        </div>
      )}

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
        {ORDER_STATUSES.map(s => (
          <option key={s} value={s}>
            {STATUS_LABELS[s] ?? s}{STATUS_MARKS[s] ? `　${STATUS_MARKS[s]}` : ''}
          </option>
        ))}
      </Select>

      {/* 選定狀態的真實連動說明 — 切換前先看清楚會觸發什麼（通知／出帳／鎖定…）。 */}
      {STATUS_EFFECTS[editStatus] && (
        <div
          data-guide="order-status-effect"
          style={{ marginTop: 8, padding: '8px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, fontSize: 12, color: '#075985', lineHeight: 1.7 }}
        >
          {STATUS_EFFECTS[editStatus]}
        </div>
      )}

      {/* 圖標標記圖例 — #／$／其他連動的統一說明。 */}
      <details data-guide="order-status-legend" style={{ marginTop: 8, border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <summary style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>ℹ️ 狀態標記說明</summary>
        <div style={{ padding: '8px 12px', borderTop: '1px solid #f0f0f0', fontSize: 12, color: '#6b7280', lineHeight: 1.9 }}>
          {STATUS_MARK_LEGEND}
        </div>
      </details>

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
  );

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

          {/* Detail Panel — 桌機在右側並排顯示；手機改用彈出視窗（見下方 ResponsiveModal），
              避免點選訂單後必須滑到頁面最下方才看得到詳情。 */}
          {!isMobile && (
          <Card data-guide="order-detail" style={{ padding: 20 }}>
            {!detail ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: '#9ca3af' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>👆</div>
                <p style={{ margin: 0, fontSize: 14 }}>點選左側訂單查看詳情</p>
              </div>
            ) : (
              detailBody
            )}
          </Card>
          )}
        </div>
      </div>

      {/* 手機版訂單詳情彈出視窗：點擊清單訂單即跳出，無需捲到頁尾 */}
      <ResponsiveModal
        open={isMobile && !!detail}
        onClose={() => setSelectedId('')}
        title={detail ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>訂單詳情 <StatusBadge status={detail.status} /></span> : '訂單詳情'}
        size="lg"
        data-testid="admin-order-detail-modal"
      >
        {detailBody}
      </ResponsiveModal>
    </div>
  );
}
