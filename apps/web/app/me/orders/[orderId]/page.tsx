'use client';

import { useEffect, useState } from 'react';
import { csrfHeaders } from '../../../../src/lib/csrf-client';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '../../../../src/lib/supabase/client';
import { RefundPreviewBanner } from '../../../../src/components/orders/RefundPreviewBanner';
import { RESCHEDULE_WINDOW_HOURS } from '../../../../src/lib/reschedule.mjs';

type OrderDetail = {
  id: string;
  status: string;
  totalTwd: number;
  title?: string | null;
  peopleCount?: number;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  createdAt?: string | null;
  paidAt?: string | null;
  scheduleId?: string | null;
  scheduleStartAt?: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  pending_payment: '待付款',
  paid: '已付款',
  confirmed: '已確認',
  rejected: '已拒絕',
  cancelled_by_user: '已取消',
  cancelled_by_guide: '導遊取消',
  completed: '已完成',
  refund_pending: '退款申請中',
  refunded: '已退款',
};

const STATUS_COLORS: Record<string, string> = {
  pending_payment: '#f59e0b',
  paid:            '#3b82f6',
  confirmed:       '#10b981',
  rejected:        '#ef4444',
  cancelled_by_user:  '#6b7280',
  cancelled_by_guide: '#6b7280',
  completed:       '#8b5cf6',
  refund_pending:  '#f97316',
  refunded:        '#6b7280',
};

const STATUS_DESCRIPTIONS: Record<string, string> = {
  pending_payment: '⏳ 訂單已建立，請完成付款以確保席位。',
  paid:            '✅ 已收到您的付款，等待導遊確認行程。',
  confirmed:       '🎉 行程已確認！請準時到達集合地點。',
  rejected:        '😔 很遺憾，此行程無法成行，請聯絡客服了解詳情。',
  cancelled_by_user:  '🚫 您已取消此訂單。',
  cancelled_by_guide: '😔 導遊取消了此行程，我們將協助安排退款，請聯絡客服。',
  completed:       '⭐ 行程已完成，感謝您的參與！期待下次再見。',
  refund_pending:  '🔄 退款申請已受理，處理中（通常 3-5 個工作天入帳）。',
  refunded:        '💰 退款已完成，金額將退回原付款工具，通常 3-5 個工作天入帳。',
};

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();

  const orderId = typeof params.orderId === 'string' ? params.orderId : '';

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [authChecking, setAuthChecking] = useState(true);

  // Cancel state
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelErr, setCancelErr] = useState<string | null>(null);

  // Review state
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewErr, setReviewErr] = useState<string | null>(null);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  // #1383 — Reschedule state
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const [rescheduleOptions, setRescheduleOptions] = useState<Array<{ id: string; startAt: string; endAt: string; capacityLeft: number | null }>>([]);
  const [rescheduleTarget, setRescheduleTarget] = useState('');
  const [rescheduleRequestKey] = useState(() => crypto.randomUUID());
  const [activeRescheduleId, setActiveRescheduleId] = useState<string | null>(null);
  const [submittingReschedule, setSubmittingReschedule] = useState(false);
  const [rescheduleErr, setRescheduleErr] = useState<string | null>(null);
  const [rescheduleDone, setRescheduleDone] = useState(false);

  // #1411 — Order messages state
  const [msgThread, setMsgThread] = useState<{
    canView: boolean;
    canPost: boolean;
    messages: Array<{ id: string; senderRole: string; body: string; createdAt: string | null }>;
  } | null>(null);
  const [msgInput, setMsgInput] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [msgErr, setMsgErr] = useState<string | null>(null);

  // Refund state
  const [showRefundForm, setShowRefundForm] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [refundNote, setRefundNote] = useState('');
  const [refundRequestId] = useState(() => crypto.randomUUID());
  const [submittingRefund, setSubmittingRefund] = useState(false);
  const [refundErr, setRefundErr] = useState<string | null>(null);
  const [refundSuccess, setRefundSuccess] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace(`/login?next=${encodeURIComponent(`/me/orders/${orderId}`)}`);
        return;
      }
      setAuthChecking(false);
      void fetch('/api/me/csrf', { cache: 'no-store' });
      loadOrder();
    });
  }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // #1379: 評論邀請信 CTA（/me/orders/{id}?review=1）自動展開評價表單。
  // 用 window.location 而非 useSearchParams，避免 client page 的 Suspense 邊界需求。
  useEffect(() => {
    if (!order || order.status !== 'completed') return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('review') === '1') setShowReviewForm(true);
  }, [order]);

  const loadOrder = async () => {
    if (!orderId) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/me/orders/${encodeURIComponent(orderId)}`, { cache: 'no-store' });
      if (res.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(`/me/orders/${orderId}`)}`);
        return;
      }
      const j = await res.json();
      setOrder(j.data || null);
      if (j.data) void loadMessages();
    } catch {
      setOrder(null);
    } finally {
      setLoading(false);
    }
  };

  // #1411 — 留言串（canView false 時整個區塊隱藏，例如 pending_payment）
  const loadMessages = async () => {
    try {
      const res = await fetch(`/api/me/orders/${encodeURIComponent(orderId)}/messages`, { cache: 'no-store' });
      const j = await res.json();
      setMsgThread(j?.data ?? null);
    } catch {
      setMsgThread(null);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgInput.trim()) return;
    setSendingMsg(true);
    setMsgErr(null);
    try {
      const res = await fetch(`/api/me/orders/${encodeURIComponent(orderId)}/messages`, {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ body: msgInput.trim() }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error?.message || '留言送出失敗');
      setMsgInput('');
      await loadMessages();
    } catch (error) {
      setMsgErr(error instanceof Error ? error.message : '留言送出失敗，請稍後再試');
    } finally {
      setSendingMsg(false);
    }
  };

  // #1383 — 改期
  const openRescheduleForm = async () => {
    setRescheduleErr(null);
    setShowRescheduleForm(true);
    try {
      const res = await fetch(`/api/me/orders/${encodeURIComponent(orderId)}/reschedule-options`, { cache: 'no-store' });
      const j = await res.json();
      setRescheduleOptions(Array.isArray(j?.data) ? j.data : []);
    } catch {
      setRescheduleOptions([]);
    }
  };

  const handleSubmitReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget) return;
    setSubmittingReschedule(true);
    setRescheduleErr(null);
    try {
      const res = await fetch(`/api/me/orders/${encodeURIComponent(orderId)}/reschedule-requests`, {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ requestId: rescheduleRequestKey, toScheduleId: rescheduleTarget }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error?.message || '改期申請失敗');
      setActiveRescheduleId(j.data?.id ?? null);
      setRescheduleDone(true);
      setShowRescheduleForm(false);
      await loadOrder();
    } catch (error) {
      setRescheduleErr(error instanceof Error ? error.message : '改期申請失敗，請稍後再試');
    } finally {
      setSubmittingReschedule(false);
    }
  };

  const handleWithdrawReschedule = async () => {
    if (!activeRescheduleId) return;
    try {
      const res = await fetch(
        `/api/me/orders/${encodeURIComponent(orderId)}/reschedule-requests/${encodeURIComponent(activeRescheduleId)}`,
        { method: 'DELETE', headers: csrfHeaders() }
      );
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error?.message || '撤回失敗');
      setRescheduleDone(false);
      setActiveRescheduleId(null);
      await loadOrder();
    } catch (error) {
      setRescheduleErr(error instanceof Error ? error.message : '撤回失敗，請稍後再試');
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    setCancelErr(null);
    try {
      const res = await fetch(`/api/me/orders/${encodeURIComponent(orderId)}`, {
        method: 'PATCH',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ action: 'cancel' }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error?.message || '取消失敗');
      setShowCancelDialog(false);
      await loadOrder();
    } catch (e) {
      setCancelErr(e instanceof Error ? e.message : '取消失敗，請稍後再試');
    } finally {
      setCancelling(false);
    }
  };

  const handleRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundReason.trim()) return;
    setSubmittingRefund(true);
    setRefundErr(null);
    try {
      const res = await fetch(`/api/me/orders/${encodeURIComponent(orderId)}/refund-requests`, {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ requestId: refundRequestId, reason: refundReason, note: refundNote }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error?.message || '退款申請失敗');
      setRefundSuccess(true);
      setShowRefundForm(false);
      await loadOrder();
    } catch (e) {
      setRefundErr(e instanceof Error ? e.message : '退款申請失敗，請稍後再試');
    } finally {
      setSubmittingRefund(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewText.trim()) return;
    setSubmittingReview(true);
    setReviewErr(null);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          activityId: order?.scheduleId || '',
          bookingId: orderId,
          rating: reviewRating,
          reviewText: reviewText.trim(),
        }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error?.message || '評價送出失敗');
      setReviewSubmitted(true);
      setShowReviewForm(false);
    } catch (e) {
      setReviewErr(e instanceof Error ? e.message : '評價送出失敗，請稍後再試');
    } finally {
      setSubmittingReview(false);
    }
  };

  // Styles
  const containerStyle: React.CSSProperties = { maxWidth: 560, margin: '40px auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' };
  const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 16 };
  const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #f3f4f6', fontSize: 14 };
  const labelStyle: React.CSSProperties = { color: '#6b7280' };
  const valueStyle: React.CSSProperties = { fontWeight: 600, color: '#111827', textAlign: 'right' };
  const btnPrimary: React.CSSProperties = { padding: '11px 20px', background: '#a8511f', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' };
  const btnSecondary: React.CSSProperties = { padding: '11px 20px', background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
  const btnDanger: React.CSSProperties = { padding: '11px 20px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' };

  if (authChecking || loading) {
    return <div style={containerStyle}><p style={{ color: '#9ca3af', textAlign: 'center', marginTop: 60 }}>載入中…</p></div>;
  }

  if (!order) {
    return (
      <div style={containerStyle}>
        <p style={{ color: '#ef4444', textAlign: 'center', marginTop: 60 }}>找不到訂單或您沒有權限查看此訂單。</p>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={() => router.push('/me/orders')} style={btnSecondary}>返回訂單列表</button>
        </div>
      </div>
    );
  }

  const status = order.status;
  const statusColor = STATUS_COLORS[status] || '#6b7280';
  const statusLabel = STATUS_LABELS[status] || status;
  const statusDesc = STATUS_DESCRIPTIONS[status] || '';

  const canCancel = status === 'pending_payment';
  const departureNotPassed = !order.scheduleStartAt || new Date(order.scheduleStartAt) > new Date();
  const canRefund = ['paid', 'confirmed'].includes(status) && departureNotPassed;
  const isTerminal = ['cancelled_by_user', 'cancelled_by_guide', 'rejected', 'completed', 'refunded', 'refund_pending'].includes(status);
  // #1383 — 僅距活動開始 > 168h（7 天）可線上自助改期；否則導向客服。
  const hoursUntilDeparture = order.scheduleStartAt
    ? (new Date(order.scheduleStartAt).getTime() - Date.now()) / 3600_000
    : null;
  const canSelfReschedule = hoursUntilDeparture != null && hoursUntilDeparture >= RESCHEDULE_WINDOW_HOURS;

  return (
    <div style={containerStyle}>
      {/* Back */}
      <button onClick={() => router.push('/me/orders')} style={{ ...btnSecondary, marginBottom: 20, fontSize: 13, padding: '8px 14px' }}>
        ← 返回訂單列表
      </button>

      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 4 }}>訂單詳情</h1>

      {/* Status banner */}
      <div style={{
        background: statusColor + '18',
        borderLeft: `4px solid ${statusColor}`,
        borderRadius: 10,
        padding: '12px 16px',
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ background: statusColor, color: '#fff', borderRadius: 999, padding: '2px 12px', fontSize: 12, fontWeight: 700 }}>
            {statusLabel}
          </span>
        </div>
        <p style={{ fontSize: 13, color: '#374151', margin: 0 }}>{statusDesc}</p>
      </div>

      {/* Order info */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>訂單資訊</h2>
        <div style={rowStyle}>
          <span style={labelStyle}>訂單編號</span>
          <span style={{ ...valueStyle, fontSize: 11, fontFamily: 'monospace', maxWidth: 220, wordBreak: 'break-all' }}>{order.id}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>行程名稱</span>
          <span style={valueStyle}>{order.title || '—'}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>預訂人數</span>
          <span style={valueStyle}>{order.peopleCount ?? '—'} 人</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>出發時間</span>
          <span style={valueStyle}>{order.scheduleStartAt ? new Date(order.scheduleStartAt).toLocaleString('zh-TW') : '—'}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>建立時間</span>
          <span style={valueStyle}>{order.createdAt ? new Date(order.createdAt).toLocaleString('zh-TW') : '—'}</span>
        </div>
        {order.paidAt && (
          <div style={rowStyle}>
            <span style={labelStyle}>付款時間</span>
            <span style={valueStyle}>{new Date(order.paidAt).toLocaleString('zh-TW')}</span>
          </div>
        )}
        <div style={{ ...rowStyle, borderBottom: 'none' }}>
          <span style={{ ...labelStyle, fontWeight: 700, fontSize: 15, color: '#111827' }}>應付金額</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#a8511f' }}>NT$ {(order.totalTwd ?? 0).toLocaleString()}</span>
        </div>
      </div>

      {/* Contact info */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>聯絡資訊</h2>
        <div style={rowStyle}>
          <span style={labelStyle}>姓名</span>
          <span style={valueStyle}>{order.contactName || '—'}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>電話</span>
          <span style={valueStyle}>{order.contactPhone || '—'}</span>
        </div>
        <div style={{ ...rowStyle, borderBottom: 'none' }}>
          <span style={labelStyle}>Email</span>
          <span style={valueStyle}>{order.contactEmail || '—'}</span>
        </div>
      </div>

      {/* Review hint — shown for non-completed, non-terminal orders */}
      {status !== 'completed' && !isTerminal && (
        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: '#0369a1', margin: 0 }}>行程完成後即可撰寫評價</p>
        </div>
      )}

      {/* #1383 — Reschedule section（paid/confirmed 可申請；距活動開始須 > 168h 才能線上自助改期，
          否則導向客服。窗口最終仍由 API 權威把關，這裡僅前端提早提示） */}
      {['paid', 'confirmed'].includes(status) && (
        <div style={{ marginBottom: 16 }}>
          {!canSelfReschedule ? (
            <div
              data-testid="reschedule-contact-support"
              style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '10px 14px' }}
            >
              <p style={{ fontSize: 13, color: '#c2410c', margin: 0 }}>
                距活動開始未滿 {RESCHEDULE_WINDOW_HOURS / 24} 天（{RESCHEDULE_WINDOW_HOURS} 小時），無法線上自助改期。如需改期請聯絡客服協助安排。
              </p>
            </div>
          ) : !showRescheduleForm ? (
            <button
              data-testid="reschedule-open-btn"
              onClick={() => void openRescheduleForm()}
              style={{ ...btnSecondary, width: '100%' }}
            >
              申請改期（同行程改其他場次）
            </button>
          ) : (
            <form onSubmit={handleSubmitReschedule} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
              <label htmlFor="reschedule-target" style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 8 }}>
                選擇新場次（同行程、同方案、金額不變；需嚮導確認）
              </label>
              <select
                id="reschedule-target"
                data-testid="reschedule-target-select"
                value={rescheduleTarget}
                onChange={(e) => setRescheduleTarget(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, marginBottom: 12 }}
              >
                <option value="">請選擇場次</option>
                {rescheduleOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {String(o.startAt).replace('T', ' ').slice(0, 16)}
                    {o.capacityLeft != null ? `（剩 ${o.capacityLeft} 位）` : ''}
                  </option>
                ))}
              </select>
              {rescheduleOptions.length === 0 && (
                <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>目前沒有可改的場次。</p>
              )}
              {rescheduleErr && <p style={{ color: 'crimson', fontSize: 13, marginBottom: 12 }}>{rescheduleErr}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" data-testid="reschedule-submit-btn" style={btnPrimary} disabled={submittingReschedule || !rescheduleTarget}>
                  {submittingReschedule ? '送出中…' : '送出改期申請'}
                </button>
                <button type="button" style={btnSecondary} onClick={() => setShowRescheduleForm(false)}>取消</button>
              </div>
            </form>
          )}
        </div>
      )}
      {status === 'reschedule_requested' && (
        <div data-testid="reschedule-pending" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: '#92400e', margin: 0 }}>
            改期申請處理中 — 等待嚮導確認（72 小時內），期間訂單暫停其他操作。
          </p>
          {rescheduleDone && activeRescheduleId && (
            <button data-testid="reschedule-withdraw-btn" onClick={() => void handleWithdrawReschedule()} style={{ ...btnSecondary, marginTop: 8 }}>
              撤回申請
            </button>
          )}
          {rescheduleErr && <p style={{ color: 'crimson', fontSize: 13, marginTop: 8 }}>{rescheduleErr}</p>}
        </div>
      )}

      {/* #1411 — 聯絡嚮導留言串（付款後～completed+14 天可發言，之後唯讀） */}
      {msgThread?.canView && (
        <div data-testid="order-messages-section" style={cardStyle}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>聯絡嚮導</h2>
          {msgThread.messages.length === 0 ? (
            <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 12px' }}>
              還沒有訊息 — 行前的疑問（集合地點、裝備、天氣備案）都可以直接問嚮導。
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, maxHeight: 320, overflowY: 'auto' }}>
              {msgThread.messages.map((m) => (
                <div
                  key={m.id}
                  data-testid="order-message-item"
                  style={{
                    alignSelf: m.senderRole === 'traveler' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    background: m.senderRole === 'traveler' ? '#fdf2f8' : '#f1f5f9',
                    border: `1px solid ${m.senderRole === 'traveler' ? '#fbcfe8' : '#e2e8f0'}`,
                    borderRadius: 12,
                    padding: '8px 12px',
                  }}
                >
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', margin: '0 0 2px' }}>
                    {m.senderRole === 'traveler' ? '我' : m.senderRole === 'guide' ? '嚮導' : '客服'}
                    <span style={{ fontWeight: 400, marginLeft: 6 }}>
                      {m.createdAt ? new Date(m.createdAt).toLocaleString('zh-TW') : ''}
                    </span>
                  </p>
                  <p style={{ fontSize: 13, color: '#111827', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</p>
                </div>
              ))}
            </div>
          )}
          {msgThread.canPost ? (
            <form onSubmit={handleSendMessage}>
              <textarea
                data-testid="order-message-input"
                value={msgInput}
                onChange={(e) => setMsgInput(e.target.value)}
                placeholder="想問嚮導什麼？（最長 1000 字）"
                rows={2}
                maxLength={1000}
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
              />
              {msgErr && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>{msgErr}</p>}
              <button
                type="submit"
                data-testid="order-message-send"
                style={{ ...btnPrimary, marginTop: 8 }}
                disabled={sendingMsg || !msgInput.trim()}
              >
                {sendingMsg ? '送出中…' : '送出訊息'}
              </button>
            </form>
          ) : (
            <p data-testid="order-messages-readonly" style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>
              此訂單的留言串已轉唯讀（行程結束 14 天後或訂單已取消/退款）。如需協助請聯絡客服。
            </p>
          )}
        </div>
      )}

      {/* Review section — shown for completed orders */}
      {status === 'completed' && (
        <div style={{ marginBottom: 16 }}>
          {reviewSubmitted ? (
            <p style={{ fontSize: 13, color: '#10b981', fontWeight: 600, textAlign: 'center', padding: '12px 0' }}>
              評價已送出，等候審核
            </p>
          ) : !showReviewForm ? (
            <button
              onClick={() => setShowReviewForm(true)}
              style={{ ...btnPrimary, width: '100%' }}
            >
              撰寫評價
            </button>
          ) : (
            <form onSubmit={handleSubmitReview} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 8 }}>
                評分
              </label>
              {/* star-rating: 1-5 rating buttons */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setReviewRating(star)}
                    style={{
                      fontSize: 24, background: 'none', border: 'none',
                      cursor: 'pointer', padding: '2px 4px',
                      color: star <= reviewRating ? '#f59e0b' : '#d1d5db',
                    }}
                    aria-label={`rating ${star}`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <label htmlFor="order-review-text" style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                行程評價
              </label>
              <textarea
                id="order-review-text"
                required
                value={reviewText}
                onChange={e => setReviewText(e.target.value)}
                placeholder="分享您的行程體驗..."
                rows={4}
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
              />
              {reviewErr && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>{reviewErr}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="submit" style={btnPrimary} disabled={submittingReview}>
                  {submittingReview ? '送出中…' : '提交評價'}
                </button>
                <button type="button" onClick={() => { setShowReviewForm(false); setReviewErr(null); }} style={btnSecondary}>
                  取消
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Actions */}
      {!isTerminal && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {status === 'pending_payment' && (
            <button onClick={() => router.push(`/order/pay?orderId=${order.id}`)} style={btnPrimary}>
              前往付款
            </button>
          )}

          {['paid', 'confirmed'].includes(status) && !departureNotPassed && (
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '10px 14px' }}>
              <p style={{ fontSize: 13, color: '#c2410c', margin: 0 }}>行程已開始/結束，無法線上申請退款，請聯絡客服</p>
            </div>
          )}

          {canRefund && (
            <RefundPreviewBanner orderId={orderId} />
          )}

          {canRefund && !refundSuccess && !showRefundForm && (
            <button onClick={() => setShowRefundForm(true)} style={btnSecondary}>申請取消/退款</button>
          )}

          {refundSuccess && (
            <p style={{ fontSize: 13, color: '#10b981', fontWeight: 600, textAlign: 'center' }}>✅ 退款申請已送出，金額將退回原付款工具（通常 3-5 個工作天）</p>
          )}

          {showRefundForm && (
            <form onSubmit={handleRefund} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
              <label htmlFor="order-refund-reason" style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>取消／退款原因</label>
              <select
                id="order-refund-reason"
                required
                value={refundReason}
                onChange={e => setRefundReason(e.target.value)}
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box', marginBottom: 10 }}
              >
                <option value="">請選擇原因</option>
                <option value="schedule_conflict">行程衝突</option>
                <option value="personal_reason">個人因素</option>
                <option value="health_issue">健康因素</option>
                <option value="other">其他</option>
              </select>
              <label htmlFor="order-refund-note" style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>補充說明（選填）</label>
              <textarea
                id="order-refund-note"
                value={refundNote}
                onChange={e => setRefundNote(e.target.value)}
                placeholder="如有其他說明請填寫…"
                rows={2}
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
              />
              {refundErr && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>{refundErr}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="submit" style={btnPrimary} disabled={submittingRefund}>
                  {submittingRefund ? '送出中…' : '送出申請'}
                </button>
                <button type="button" onClick={() => { setShowRefundForm(false); setRefundErr(null); }} style={btnSecondary}>取消</button>
              </div>
            </form>
          )}

          {canCancel && (
            <button onClick={() => setShowCancelDialog(true)} style={{ ...btnSecondary, color: '#ef4444', marginTop: 4 }}>
              取消訂單
            </button>
          )}
        </div>
      )}

      {/* Cancel dialog */}
      {showCancelDialog && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }}>
          <div role="dialog" aria-modal="true" aria-labelledby="cancel-dialog-title" style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 360, width: '90%' }}>
            <h3 id="cancel-dialog-title" style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>確認取消訂單？</h3>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>取消後無法恢復，席位將自動釋出。</p>
            {cancelErr && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 10 }}>{cancelErr}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleCancel} disabled={cancelling} style={btnDanger}>
                {cancelling ? '取消中…' : '確認取消'}
              </button>
              <button onClick={() => { setShowCancelDialog(false); setCancelErr(null); }} style={btnSecondary}>
                返回
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
