'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';

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
  refund_pending:  '🔄 退款申請處理中，請耐心等候（通常 3-5 個工作天）。',
  refunded:        '💰 退款已完成，款項將於 3-5 個工作天入帳。',
};

export default function OrderDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const orderId = typeof params.orderId === 'string' ? params.orderId : '';
  const email = searchParams.get('email') || '';

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Cancel state
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelErr, setCancelErr] = useState<string | null>(null);

  // Refund state
  const [showRefundForm, setShowRefundForm] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [submittingRefund, setSubmittingRefund] = useState(false);
  const [refundErr, setRefundErr] = useState<string | null>(null);
  const [refundSuccess, setRefundSuccess] = useState(false);

  const loadOrder = async () => {
    if (!orderId) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/me/orders/${encodeURIComponent(orderId)}?contactEmail=${encodeURIComponent(email)}`, { cache: 'no-store' });
      const j = await res.json();
      setOrder(j.data || null);
    } catch {
      setOrder(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOrder(); }, [orderId, email]);

  const handleCancel = async () => {
    setCancelling(true);
    setCancelErr(null);
    try {
      const res = await fetch(`/api/me/orders/${encodeURIComponent(orderId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', contactEmail: email }),
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
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: refundReason, contactEmail: email }),
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

  // Styles
  const containerStyle: React.CSSProperties = { maxWidth: 560, margin: '40px auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' };
  const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 16 };
  const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #f3f4f6', fontSize: 14 };
  const labelStyle: React.CSSProperties = { color: '#6b7280' };
  const valueStyle: React.CSSProperties = { fontWeight: 600, color: '#111827', textAlign: 'right' };
  const btnPrimary: React.CSSProperties = { padding: '11px 20px', background: '#ec4899', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' };
  const btnSecondary: React.CSSProperties = { padding: '11px 20px', background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
  const btnDanger: React.CSSProperties = { padding: '11px 20px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' };

  if (loading) return <div style={containerStyle}><p style={{ color: '#9ca3af', textAlign: 'center', marginTop: 60 }}>載入中…</p></div>;
  if (!order) return (
    <div style={containerStyle}>
      <p style={{ color: '#ef4444', textAlign: 'center', marginTop: 60 }}>找不到訂單，請確認 Email 是否正確。</p>
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <button onClick={() => router.push(`/me/orders?email=${encodeURIComponent(email)}`)} style={btnSecondary}>返回訂單列表</button>
      </div>
    </div>
  );

  const status = order.status;
  const statusColor = STATUS_COLORS[status] || '#6b7280';
  const statusLabel = STATUS_LABELS[status] || status;
  const statusDesc = STATUS_DESCRIPTIONS[status] || '';

  const canCancel = status === 'pending_payment';
  const canRefund = ['paid', 'confirmed'].includes(status);
  const isTerminal = ['cancelled_by_user', 'cancelled_by_guide', 'rejected', 'completed', 'refunded'].includes(status);

  return (
    <div style={containerStyle}>
      {/* Back */}
      <button onClick={() => router.push(`/me/orders?email=${encodeURIComponent(email)}`)} style={{ ...btnSecondary, marginBottom: 20, fontSize: 13, padding: '8px 14px' }}>
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
          <span style={{ fontSize: 18, fontWeight: 800, color: '#ec4899' }}>NT$ {(order.totalTwd ?? 0).toLocaleString()}</span>
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

      {/* Actions */}
      {!isTerminal && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Pay again if still pending */}
          {status === 'pending_payment' && (
            <button onClick={() => router.push(`/order/pay?orderId=${order.id}&email=${encodeURIComponent(email)}`)} style={btnPrimary}>
              前往付款
            </button>
          )}

          {/* Refund */}
          {canRefund && !refundSuccess && !showRefundForm && (
            <button onClick={() => setShowRefundForm(true)} style={btnSecondary}>
              申請退款
            </button>
          )}

          {refundSuccess && (
            <p style={{ fontSize: 13, color: '#10b981', fontWeight: 600, textAlign: 'center' }}>✅ 退款申請已送出，等待審核中</p>
          )}

          {/* Refund form */}
          {showRefundForm && (
            <form onSubmit={handleRefund} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>退款原因</label>
              <textarea
                required
                value={refundReason}
                onChange={e => setRefundReason(e.target.value)}
                placeholder="請說明退款原因…"
                rows={3}
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

          {/* Cancel */}
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
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 360, width: '90%' }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>確認取消訂單？</h3>
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
