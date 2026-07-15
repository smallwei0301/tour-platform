'use client';

import { useEffect, useState } from 'react';
import { csrfHeaders } from '../../../../../src/lib/csrf-client';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '../../../../../src/lib/supabase/client';
import { RefundPreviewBanner } from '../../../../../src/components/orders/RefundPreviewBanner';
import { RESCHEDULE_WINDOW_HOURS } from '../../../../../src/lib/reschedule.mjs';
import { useClientLocale } from '../../../../../src/i18n/use-client-locale';
import { getClientNamespace } from '../../../../../src/i18n/client-nav-messages';
import { QRCodeSVG } from 'qrcode.react';

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
  // #1565 電子憑證（server 於 confirmed 訂單簽發）
  voucherToken?: string | null;
  voucherShortCode?: string | null;
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

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const locale = useClientLocale();
  const m = getClientNamespace(locale, 'orderDetail');
  const statusLabels = getClientNamespace(locale, 'orders').status as Record<string, string>;
  const statusDescs = m.statusDesc as Record<string, string>;
  const dateLocale = locale === 'zh-Hant' ? 'zh-TW' : 'en-US';

  const orderId = typeof params.orderId === 'string' ? params.orderId : '';

  const [order, setOrder] = useState<OrderDetail | null>(null);
  // #1596 行前導遊聯絡：僅出發前 24h＋導遊同意時，API 才回非 null。
  const [guideContact, setGuideContact] = useState<{ name: string; phone: string } | null>(null);
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
  // 評價照片（選填，最多 5 張）
  const [reviewPhotos, setReviewPhotos] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const REVIEW_PHOTO_MAX = 5;

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

  // #1596：confirmed 訂單才嘗試取行前聯絡；資格外或導遊未同意時 API 回 null，不顯示卡片。
  useEffect(() => {
    if (!order || order.status !== 'confirmed' || !orderId) { setGuideContact(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v2/orders/${encodeURIComponent(orderId)}/guide-contact`, { cache: 'no-store' });
        if (!res.ok) return;
        const j = await res.json();
        if (!cancelled) setGuideContact(j?.data?.guideContact ?? null);
      } catch {
        /* 靜默：聯絡卡不是關鍵資訊 */
      }
    })();
    return () => { cancelled = true; };
  }, [order, orderId]);

  const loadOrder = async () => {
    if (!orderId) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/v2/orders/${encodeURIComponent(orderId)}`, { cache: 'no-store' });
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
      const res = await fetch(`/api/v2/orders/${encodeURIComponent(orderId)}/messages`, { cache: 'no-store' });
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
      const res = await fetch(`/api/v2/orders/${encodeURIComponent(orderId)}/messages`, {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ body: msgInput.trim() }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error?.message || m.messageSendFailed);
      setMsgInput('');
      await loadMessages();
    } catch (error) {
      setMsgErr(error instanceof Error ? error.message : m.messageSendFailedRetry);
    } finally {
      setSendingMsg(false);
    }
  };

  // #1383 — 改期
  const openRescheduleForm = async () => {
    setRescheduleErr(null);
    setShowRescheduleForm(true);
    try {
      const res = await fetch(`/api/v2/orders/${encodeURIComponent(orderId)}/reschedule-options`, { cache: 'no-store' });
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
      const res = await fetch(`/api/v2/orders/${encodeURIComponent(orderId)}/reschedule-requests`, {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ requestId: rescheduleRequestKey, toScheduleId: rescheduleTarget }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error?.message || m.rescheduleFailed);
      setActiveRescheduleId(j.data?.id ?? null);
      setRescheduleDone(true);
      setShowRescheduleForm(false);
      await loadOrder();
    } catch (error) {
      setRescheduleErr(error instanceof Error ? error.message : m.rescheduleFailedRetry);
    } finally {
      setSubmittingReschedule(false);
    }
  };

  const handleWithdrawReschedule = async () => {
    if (!activeRescheduleId) return;
    try {
      const res = await fetch(
        `/api/v2/orders/${encodeURIComponent(orderId)}/reschedule-requests/${encodeURIComponent(activeRescheduleId)}`,
        { method: 'DELETE', headers: csrfHeaders() }
      );
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error?.message || m.withdrawFailed);
      setRescheduleDone(false);
      setActiveRescheduleId(null);
      await loadOrder();
    } catch (error) {
      setRescheduleErr(error instanceof Error ? error.message : m.withdrawFailedRetry);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    setCancelErr(null);
    try {
      const res = await fetch(`/api/v2/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error?.message || m.cancelFailed);
      setShowCancelDialog(false);
      await loadOrder();
    } catch (e) {
      setCancelErr(e instanceof Error ? e.message : m.cancelFailedRetry);
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
      const res = await fetch(`/api/v2/orders/${encodeURIComponent(orderId)}/refund-requests`, {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ requestId: refundRequestId, reason: refundReason, note: refundNote }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error?.message || m.refundFailed);
      setRefundSuccess(true);
      setShowRefundForm(false);
      await loadOrder();
    } catch (e) {
      setRefundErr(e instanceof Error ? e.message : m.refundFailedRetry);
    } finally {
      setSubmittingRefund(false);
    }
  };

  const handleReviewPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // input 允許重複挑同一張，清空 value 讓 onChange 能再次觸發。
    e.target.value = '';
    if (files.length === 0) return;
    setReviewErr(null);

    const remaining = REVIEW_PHOTO_MAX - reviewPhotos.length;
    if (remaining <= 0) {
      setReviewErr(m.reviewPhotoMaxError.replace('{max}', String(REVIEW_PHOTO_MAX)));
      return;
    }

    setPhotoUploading(true);
    try {
      for (const file of files.slice(0, remaining)) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/reviews/upload-photo', {
          method: 'POST',
          headers: csrfHeaders(),
          body: fd,
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j.error) {
          throw new Error(j.error?.message || m.reviewPhotoUploadFailed);
        }
        setReviewPhotos((prev) => (prev.length < REVIEW_PHOTO_MAX ? [...prev, j.data.url] : prev));
      }
    } catch (err) {
      setReviewErr(err instanceof Error ? err.message : m.reviewPhotoUploadFailedRetry);
    } finally {
      setPhotoUploading(false);
    }
  };

  const removeReviewPhoto = (url: string) => {
    setReviewPhotos((prev) => prev.filter((u) => u !== url));
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
          photoUrls: reviewPhotos,
        }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error?.message || m.reviewSubmitFailed);
      setReviewSubmitted(true);
      setShowReviewForm(false);
      setReviewPhotos([]);
    } catch (e) {
      setReviewErr(e instanceof Error ? e.message : m.reviewSubmitFailedRetry);
    } finally {
      setSubmittingReview(false);
    }
  };

  // Styles — 深綠主題（與主站一致）
  const containerStyle: React.CSSProperties = { maxWidth: 600, margin: '0 auto', padding: '32px 16px 56px', minHeight: '70vh' };
  const cardStyle: React.CSSProperties = { background: 'var(--tp-card-bg)', border: '1px solid var(--tp-border)', borderRadius: 16, padding: 24, marginBottom: 16 };
  const formCardStyle: React.CSSProperties = { background: 'var(--tp-card-bg)', border: '1px solid var(--tp-border)', borderRadius: 12, padding: 16 };
  const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--tp-border)', fontSize: 14 };
  const labelStyle: React.CSSProperties = { color: 'var(--tp-muted)' };
  const valueStyle: React.CSSProperties = { fontWeight: 600, color: 'var(--tp-text)', textAlign: 'right' };
  const btnPrimary: React.CSSProperties = { padding: '11px 20px', background: '#a8511f', color: '#f8efdc', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' };
  const btnSecondary: React.CSSProperties = { padding: '11px 20px', background: 'rgba(244,236,216,0.08)', color: 'var(--tp-text)', border: '1px solid var(--tp-border)', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
  const btnDanger: React.CSSProperties = { padding: '11px 20px', background: '#b3402f', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' };

  if (authChecking || loading) {
    return <div style={containerStyle}><p style={{ color: 'var(--tp-muted)', textAlign: 'center', marginTop: 60 }}>{m.loading}</p></div>;
  }

  if (!order) {
    return (
      <div style={containerStyle}>
        <p style={{ color: '#ef4444', textAlign: 'center', marginTop: 60 }}>{m.notFound}</p>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={() => router.push('/me/orders')} style={btnSecondary}>{m.backToList}</button>
        </div>
      </div>
    );
  }

  const status = order.status;
  const statusColor = STATUS_COLORS[status] || '#6b7280';
  const statusLabel = statusLabels[status] || status;
  const statusDesc = statusDescs[status] || '';

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
        {m.backToListArrow}
      </button>

      <h1 style={{ fontFamily: 'var(--tp-serif)', fontSize: 'clamp(22px, 5vw, 26px)', fontWeight: 700, color: 'var(--tp-text)', letterSpacing: '0.02em', margin: '0 0 12px' }}>{m.pageTitle}</h1>

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
        <p style={{ fontSize: 13, color: 'var(--tp-text)', margin: 0 }}>{statusDesc}</p>
      </div>

      {/* #1565 電子憑證：confirmed 訂單顯示 QR＋短碼供出發當日出示/導遊核銷 */}
      {status === 'confirmed' && order.voucherToken && (
        <div data-testid="voucher-card" style={{ ...cardStyle, textAlign: 'center' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--tp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>電子憑證</h2>
          <div style={{ display: 'inline-block', background: '#fff', padding: 12, borderRadius: 12 }}>
            <QRCodeSVG value={order.voucherToken} size={168} level="M" data-testid="voucher-qr" />
          </div>
          {order.voucherShortCode && (
            <p style={{ marginTop: 12, fontSize: 20, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--tp-text)' }} data-testid="voucher-shortcode">
              {order.voucherShortCode}
            </p>
          )}
          <p style={{ fontSize: 12, color: 'var(--tp-muted)', margin: '6px 0 0' }}>
            出發當日向導遊出示此 QR 或短碼；無法掃描時，導遊可用短碼＋姓名於名冊核對。
          </p>
        </div>
      )}

      {/* #1596 行前聯絡：僅出發前 24h＋導遊同意揭露時顯示（API 資格外回 null） */}
      {guideContact && (
        <div data-testid="pre-tour-contact-card" style={cardStyle}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--tp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>行前聯絡</h2>
          <div style={rowStyle}>
            <span style={labelStyle}>導遊</span>
            <span style={valueStyle}>{guideContact.name}</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>聯絡電話</span>
            <a href={`tel:${guideContact.phone}`} style={{ ...valueStyle, color: 'var(--tp-primary, #b45309)', fontWeight: 700 }} data-testid="pre-tour-contact-phone">
              {guideContact.phone}
            </a>
          </div>
          <p style={{ fontSize: 12, color: 'var(--tp-muted)', margin: '6px 0 0' }}>
            此聯絡方式僅在出發前 24 小時內顯示，供臨時狀況（如集合點確認）聯繫導遊。
          </p>
        </div>
      )}

      {/* Order info */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--tp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>{m.orderInfoHeading}</h2>
        <div style={rowStyle}>
          <span style={labelStyle}>{m.orderNumber}</span>
          <span style={{ ...valueStyle, fontSize: 11, fontFamily: 'monospace', maxWidth: 220, wordBreak: 'break-all' }}>{order.id}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>{m.tripName}</span>
          <span style={valueStyle}>{order.title || '—'}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>{m.peopleCount}</span>
          <span style={valueStyle}>{order.peopleCount != null ? m.peopleUnit.replace('{n}', String(order.peopleCount)) : '—'}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>{m.departureTime}</span>
          <span style={valueStyle}>{order.scheduleStartAt ? new Date(order.scheduleStartAt).toLocaleString(dateLocale) : '—'}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>{m.createdTime}</span>
          <span style={valueStyle}>{order.createdAt ? new Date(order.createdAt).toLocaleString(dateLocale) : '—'}</span>
        </div>
        {order.paidAt && (
          <div style={rowStyle}>
            <span style={labelStyle}>{m.paidTime}</span>
            <span style={valueStyle}>{new Date(order.paidAt).toLocaleString(dateLocale)}</span>
          </div>
        )}
        <div style={{ ...rowStyle, borderBottom: 'none' }}>
          <span style={{ ...labelStyle, fontWeight: 700, fontSize: 15, color: 'var(--tp-text)' }}>{m.amountDue}</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--tp-gold-strong)' }}>NT$ {(order.totalTwd ?? 0).toLocaleString()}</span>
        </div>
      </div>

      {/* Contact info */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--tp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>{m.contactHeading}</h2>
        <div style={rowStyle}>
          <span style={labelStyle}>{m.contactName}</span>
          <span style={valueStyle}>{order.contactName || '—'}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>{m.contactPhone}</span>
          <span style={valueStyle}>{order.contactPhone || '—'}</span>
        </div>
        <div style={{ ...rowStyle, borderBottom: 'none' }}>
          <span style={labelStyle}>{m.contactEmail}</span>
          <span style={valueStyle}>{order.contactEmail || '—'}</span>
        </div>
      </div>

      {/* Review hint — shown for non-completed, non-terminal orders */}
      {status !== 'completed' && !isTerminal && (
        <div style={{ background: 'rgba(86,116,76,0.16)', border: '1px solid var(--tp-border)', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--tp-text)', margin: 0 }}>{m.reviewHint}</p>
        </div>
      )}

      {/* #1383 — Reschedule section（paid/confirmed 可申請；距活動開始須 > 168h 才能線上自助改期，
          否則導向客服。窗口最終仍由 API 權威把關，這裡僅前端提早提示） */}
      {['paid', 'confirmed'].includes(status) && (
        <div style={{ marginBottom: 16 }}>
          {!canSelfReschedule ? (
            <div
              data-testid="reschedule-contact-support"
              style={{ background: 'rgba(194,84,46,0.14)', border: '1px solid rgba(194,84,46,0.4)', borderRadius: 10, padding: '10px 14px' }}
            >
              <p style={{ fontSize: 13, color: '#e3a07f', margin: 0 }}>
                {m.rescheduleContactSupport.replace('{days}', String(RESCHEDULE_WINDOW_HOURS / 24)).replace('{hours}', String(RESCHEDULE_WINDOW_HOURS))}
              </p>
            </div>
          ) : !showRescheduleForm ? (
            <button
              data-testid="reschedule-open-btn"
              onClick={() => void openRescheduleForm()}
              style={{ ...btnSecondary, width: '100%' }}
            >
              {m.rescheduleOpenBtn}
            </button>
          ) : (
            <form onSubmit={handleSubmitReschedule} style={formCardStyle}>
              <label htmlFor="reschedule-target" style={{ fontSize: 13, fontWeight: 700, color: 'var(--tp-text)', display: 'block', marginBottom: 8 }}>
                {m.rescheduleSelectLabel}
              </label>
              <select
                id="reschedule-target"
                data-testid="reschedule-target-select"
                value={rescheduleTarget}
                onChange={(e) => setRescheduleTarget(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--tp-border)', background: 'rgba(244,236,216,0.06)', color: 'var(--tp-text)', borderRadius: 8, fontSize: 14, marginBottom: 12 }}
              >
                <option value="">{m.rescheduleSelectPlaceholder}</option>
                {rescheduleOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {String(o.startAt).replace('T', ' ').slice(0, 16)}
                    {o.capacityLeft != null ? m.rescheduleCapacityLeft.replace('{n}', String(o.capacityLeft)) : ''}
                  </option>
                ))}
              </select>
              {rescheduleOptions.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--tp-muted)', marginBottom: 12 }}>{m.rescheduleNoOptions}</p>
              )}
              {rescheduleErr && <p style={{ color: 'crimson', fontSize: 13, marginBottom: 12 }}>{rescheduleErr}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" data-testid="reschedule-submit-btn" style={btnPrimary} disabled={submittingReschedule || !rescheduleTarget}>
                  {submittingReschedule ? m.rescheduleSubmitting : m.rescheduleSubmit}
                </button>
                <button type="button" style={btnSecondary} onClick={() => setShowRescheduleForm(false)}>{m.rescheduleCancel}</button>
              </div>
            </form>
          )}
        </div>
      )}
      {status === 'reschedule_requested' && (
        <div data-testid="reschedule-pending" style={{ background: 'rgba(176,141,62,0.16)', border: '1px solid rgba(176,141,62,0.45)', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--tp-gold-strong)', margin: 0 }}>
            {m.reschedulePending}
          </p>
          {rescheduleDone && activeRescheduleId && (
            <button data-testid="reschedule-withdraw-btn" onClick={() => void handleWithdrawReschedule()} style={{ ...btnSecondary, marginTop: 8 }}>
              {m.rescheduleWithdraw}
            </button>
          )}
          {rescheduleErr && <p style={{ color: 'crimson', fontSize: 13, marginTop: 8 }}>{rescheduleErr}</p>}
        </div>
      )}

      {/* #1411 — 聯絡嚮導留言串（付款後～completed+14 天可發言，之後唯讀） */}
      {msgThread?.canView && (
        <div data-testid="order-messages-section" style={cardStyle}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--tp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>{m.messagesHeading}</h2>
          {msgThread.messages.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--tp-muted)', margin: '0 0 12px' }}>
              {m.messagesEmpty}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, maxHeight: 320, overflowY: 'auto' }}>
              {msgThread.messages.map((msg) => (
                <div
                  key={msg.id}
                  data-testid="order-message-item"
                  style={{
                    alignSelf: msg.senderRole === 'traveler' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    background: msg.senderRole === 'traveler' ? 'var(--tp-tint)' : 'rgba(244,236,216,0.06)',
                    border: '1px solid var(--tp-border)',
                    borderRadius: 12,
                    padding: '8px 12px',
                  }}
                >
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--tp-muted)', margin: '0 0 2px' }}>
                    {msg.senderRole === 'traveler' ? m.senderMe : msg.senderRole === 'guide' ? m.senderGuide : m.senderSupport}
                    <span style={{ fontWeight: 400, marginLeft: 6 }}>
                      {msg.createdAt ? new Date(msg.createdAt).toLocaleString(dateLocale) : ''}
                    </span>
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--tp-text)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.body}</p>
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
                placeholder={m.messageInputPlaceholder}
                rows={2}
                maxLength={1000}
                style={{ width: '100%', border: '1px solid var(--tp-border)', background: 'rgba(244,236,216,0.06)', color: 'var(--tp-text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
              />
              {msgErr && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>{msgErr}</p>}
              <button
                type="submit"
                data-testid="order-message-send"
                style={{ ...btnPrimary, marginTop: 8 }}
                disabled={sendingMsg || !msgInput.trim()}
              >
                {sendingMsg ? m.messageSending : m.messageSend}
              </button>
            </form>
          ) : (
            <p data-testid="order-messages-readonly" style={{ fontSize: 12, color: 'var(--tp-muted)', margin: 0 }}>
              {m.messagesReadonly}
            </p>
          )}
        </div>
      )}

      {/* Review section — shown for completed orders */}
      {status === 'completed' && (
        <div style={{ marginBottom: 16 }}>
          {reviewSubmitted ? (
            <p style={{ fontSize: 13, color: '#10b981', fontWeight: 600, textAlign: 'center', padding: '12px 0' }}>
              {m.reviewSubmitted}
            </p>
          ) : !showReviewForm ? (
            <button
              onClick={() => setShowReviewForm(true)}
              style={{ ...btnPrimary, width: '100%' }}
            >
              {m.reviewOpenBtn}
            </button>
          ) : (
            <form onSubmit={handleSubmitReview} style={formCardStyle}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--tp-text)', display: 'block', marginBottom: 8 }}>
                {m.reviewRatingLabel}
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
                    aria-label={m.reviewRatingAria.replace('{n}', String(star))}
                  >
                    ★
                  </button>
                ))}
              </div>
              <label htmlFor="order-review-text" style={{ fontSize: 13, fontWeight: 600, color: 'var(--tp-text)', display: 'block', marginBottom: 6 }}>
                {m.reviewTextLabel}
              </label>
              <textarea
                id="order-review-text"
                required
                value={reviewText}
                onChange={e => setReviewText(e.target.value)}
                placeholder={m.reviewTextPlaceholder}
                rows={4}
                style={{ width: '100%', border: '1px solid var(--tp-border)', background: 'rgba(244,236,216,0.06)', color: 'var(--tp-text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
              />

              {/* 評價照片上傳（選填，最多 5 張，手機可左右滑動瀏覽） */}
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--tp-text)', display: 'block', margin: '12px 0 6px' }}>
                {m.reviewPhotoLabel.replace('{max}', String(REVIEW_PHOTO_MAX))}
              </label>
              <div
                data-testid="review-photo-strip"
                style={{
                  display: 'flex', gap: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch',
                  scrollSnapType: 'x mandatory', paddingBottom: 4,
                }}
              >
                {reviewPhotos.map((url) => (
                  <div key={url} style={{ position: 'relative', flex: '0 0 auto', scrollSnapAlign: 'start' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={m.reviewPhotoAlt} style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5e7eb', display: 'block' }} />
                    <button
                      type="button"
                      onClick={() => removeReviewPhoto(url)}
                      aria-label={m.reviewPhotoRemoveAria}
                      style={{
                        position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%',
                        border: 'none', background: 'rgba(17,24,39,0.85)', color: '#fff', cursor: 'pointer',
                        fontSize: 13, lineHeight: '22px', padding: 0,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {reviewPhotos.length < REVIEW_PHOTO_MAX && (
                  <label
                    style={{
                      flex: '0 0 auto', width: 88, height: 88, borderRadius: 8, border: '1px dashed var(--tp-border)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      cursor: photoUploading ? 'default' : 'pointer', color: 'var(--tp-muted)', fontSize: 12, gap: 2,
                      scrollSnapAlign: 'start',
                    }}
                  >
                    <span style={{ fontSize: 20, lineHeight: 1 }}>{photoUploading ? '…' : '+'}</span>
                    <span>{photoUploading ? m.reviewPhotoUploading : m.reviewPhotoAdd}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      onChange={handleReviewPhotoChange}
                      disabled={photoUploading}
                      style={{ display: 'none' }}
                    />
                  </label>
                )}
              </div>

              {reviewErr && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>{reviewErr}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="submit" style={btnPrimary} disabled={submittingReview || photoUploading}>
                  {submittingReview ? m.reviewSubmitting : m.reviewSubmit}
                </button>
                <button type="button" onClick={() => { setShowReviewForm(false); setReviewErr(null); }} style={btnSecondary}>
                  {m.reviewCancel}
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
              {m.goToPay}
            </button>
          )}

          {['paid', 'confirmed'].includes(status) && !departureNotPassed && (
            <div style={{ background: 'rgba(194,84,46,0.14)', border: '1px solid rgba(194,84,46,0.4)', borderRadius: 10, padding: '10px 14px' }}>
              <p style={{ fontSize: 13, color: '#e3a07f', margin: 0 }}>{m.departurePassedNoRefund}</p>
            </div>
          )}

          {canRefund && (
            <RefundPreviewBanner orderId={orderId} />
          )}

          {canRefund && !refundSuccess && !showRefundForm && (
            <button onClick={() => setShowRefundForm(true)} style={btnSecondary}>{m.applyRefund}</button>
          )}

          {refundSuccess && (
            <p style={{ fontSize: 13, color: '#10b981', fontWeight: 600, textAlign: 'center' }}>{m.refundSuccess}</p>
          )}

          {showRefundForm && (
            <form onSubmit={handleRefund} style={formCardStyle}>
              <label htmlFor="order-refund-reason" style={{ fontSize: 13, fontWeight: 600, color: 'var(--tp-text)', display: 'block', marginBottom: 6 }}>{m.refundReasonLabel}</label>
              <select
                id="order-refund-reason"
                required
                value={refundReason}
                onChange={e => setRefundReason(e.target.value)}
                style={{ width: '100%', border: '1px solid var(--tp-border)', background: 'rgba(244,236,216,0.06)', color: 'var(--tp-text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box', marginBottom: 10 }}
              >
                <option value="">{m.refundReasonPlaceholder}</option>
                <option value="schedule_conflict">{m.refundReasonScheduleConflict}</option>
                <option value="personal_reason">{m.refundReasonPersonalReason}</option>
                <option value="health_issue">{m.refundReasonHealthIssue}</option>
                <option value="other">{m.refundReasonOther}</option>
              </select>
              <label htmlFor="order-refund-note" style={{ fontSize: 13, fontWeight: 600, color: 'var(--tp-text)', display: 'block', marginBottom: 6 }}>{m.refundNoteLabel}</label>
              <textarea
                id="order-refund-note"
                value={refundNote}
                onChange={e => setRefundNote(e.target.value)}
                placeholder={m.refundNotePlaceholder}
                rows={2}
                style={{ width: '100%', border: '1px solid var(--tp-border)', background: 'rgba(244,236,216,0.06)', color: 'var(--tp-text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
              />
              {refundErr && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>{refundErr}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="submit" style={btnPrimary} disabled={submittingRefund}>
                  {submittingRefund ? m.refundSubmitting : m.refundSubmit}
                </button>
                <button type="button" onClick={() => { setShowRefundForm(false); setRefundErr(null); }} style={btnSecondary}>{m.refundCancel}</button>
              </div>
            </form>
          )}

          {canCancel && (
            <button onClick={() => setShowCancelDialog(true)} style={{ ...btnSecondary, color: '#ef4444', marginTop: 4 }}>
              {m.cancelOrder}
            </button>
          )}
        </div>
      )}

      {/* Cancel dialog */}
      {showCancelDialog && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16,
        }}>
          <div role="dialog" aria-modal="true" aria-labelledby="cancel-dialog-title" style={{ background: 'var(--tp-bg-soft)', border: '1px solid var(--tp-border)', color: 'var(--tp-text)', borderRadius: 16, padding: 28, maxWidth: 360, width: '90%' }}>
            <h3 id="cancel-dialog-title" style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>{m.cancelDialogTitle}</h3>
            <p style={{ fontSize: 13, color: 'var(--tp-muted)', marginBottom: 20 }}>{m.cancelDialogBody}</p>
            {cancelErr && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 10 }}>{cancelErr}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleCancel} disabled={cancelling} style={btnDanger}>
                {cancelling ? m.cancelDialogCancelling : m.cancelDialogConfirm}
              </button>
              <button onClick={() => { setShowCancelDialog(false); setCancelErr(null); }} style={btnSecondary}>
                {m.cancelDialogBack}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
