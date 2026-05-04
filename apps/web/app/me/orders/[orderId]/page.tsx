'use client';

import { useEffect, useState } from 'react';
import { csrfHeaders } from '../../../../src/lib/csrf-client';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '../../../../src/lib/supabase/client';

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

const STATUS_DESCRIPTIONS: Record<string, string> = {
  pending_payment: '訂單已建立，請完成付款以保留席位。',
  paid: '我們已收到付款，等待導遊確認。',
  confirmed: '行程已確認，請依照集合資訊準時到場。',
  rejected: '此行程無法成行，請聯絡客服了解後續處理。',
  cancelled_by_user: '你已取消此訂單。',
  cancelled_by_guide: '導遊取消了此行程，平台會協助後續安排。',
  completed: '行程已完成，感謝參與。',
  refund_pending: '退款申請審核中，通常 3-5 個工作天完成。',
  refunded: '退款已完成，款項將於 3-5 個工作天入帳。',
};

function statusClass(status: string) {
  if (['paid', 'confirmed'].includes(status)) return 'success';
  if (['pending_payment', 'refund_pending'].includes(status)) return 'warning';
  if (['rejected', 'cancelled_by_user', 'cancelled_by_guide', 'refunded'].includes(status)) return 'danger';
  return 'neutral';
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = typeof params.orderId === 'string' ? params.orderId : '';

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [authChecking, setAuthChecking] = useState(true);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelErr, setCancelErr] = useState<string | null>(null);
  const [showRefundForm, setShowRefundForm] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [submittingRefund, setSubmittingRefund] = useState(false);
  const [refundErr, setRefundErr] = useState<string | null>(null);
  const [refundSuccess, setRefundSuccess] = useState(false);

  const loadOrder = async () => {
    if (!orderId) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/me/orders/${encodeURIComponent(orderId)}`, { cache: 'no-store' });
      if (res.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(`/me/orders/${orderId}`)}`);
        return;
      }
      const j = await res.json();
      setOrder(j.data || null);
    } catch {
      setOrder(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace(`/login?next=${encodeURIComponent(`/me/orders/${orderId}`)}`);
        return;
      }
      setAuthChecking(false);
      void fetch('/api/me/csrf', { cache: 'no-store' });
      void loadOrder();
    });
  }, [orderId]);

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
        body: JSON.stringify({ requestId: crypto.randomUUID(), reason: refundReason }),
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

  if (authChecking || loading) {
    return <main className="tp-container tp-member-order-detail-page"><div className="tp-member-empty">載入中…</div></main>;
  }

  if (!order) {
    return (
      <main className="tp-container tp-member-order-detail-page">
        <div className="tp-member-panel">
          <div className="tp-member-empty">
            找不到訂單或你沒有權限查看此訂單。
            <div className="tp-member-actions-row" style={{ justifyContent: 'center' }}>
              <button type="button" className="tp-btn tp-btn-ghost" onClick={() => router.push('/me/orders')}>
                返回訂單列表
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const status = order.status;
  const canCancel = status === 'pending_payment';
  const canRefund = ['paid', 'confirmed'].includes(status);
  const isTerminal = ['cancelled_by_user', 'cancelled_by_guide', 'rejected', 'completed', 'refunded'].includes(status);

  return (
    <main className="tp-container tp-member-order-detail-page">
      <section className="tp-member-hero">
        <p className="tp-member-kicker">order detail</p>
        <h1>{order.title || '行程訂單'}</h1>
        <p>{STATUS_DESCRIPTIONS[status] || ''}</p>
        <div className="tp-member-hero-meta">
          <span className={`tp-member-status ${statusClass(status)}`}>{STATUS_LABELS[status] || status}</span>
          <span className="tp-member-chip">訂單編號：{order.id.slice(0, 8)}</span>
        </div>
      </section>

      <div className="tp-member-actions-row" style={{ marginTop: 18 }}>
        <button type="button" className="tp-btn tp-btn-ghost" onClick={() => router.push('/me/orders')}>
          ← 返回訂單列表
        </button>
      </div>

      <section className="tp-member-detail-grid" style={{ marginTop: 18 }}>
        <div className="tp-member-panel">
          <h2>訂單資訊</h2>
          <div className="tp-member-info-list">
            <div className="tp-member-info-row"><span>訂單編號</span><span>{order.id}</span></div>
            <div className="tp-member-info-row"><span>行程名稱</span><span>{order.title || '—'}</span></div>
            <div className="tp-member-info-row"><span>預訂人數</span><span>{order.peopleCount ?? '—'} 人</span></div>
            <div className="tp-member-info-row"><span>建立時間</span><span>{order.createdAt ? new Date(order.createdAt).toLocaleString('zh-TW') : '—'}</span></div>
            {order.paidAt && <div className="tp-member-info-row"><span>付款時間</span><span>{new Date(order.paidAt).toLocaleString('zh-TW')}</span></div>}
            <div className="tp-member-info-row"><span>應付金額</span><span>NT$ {(order.totalTwd ?? 0).toLocaleString()}</span></div>
          </div>
        </div>

        <div className="tp-member-panel">
          <h2>聯絡資訊</h2>
          <div className="tp-member-info-list">
            <div className="tp-member-info-row"><span>姓名</span><span>{order.contactName || '—'}</span></div>
            <div className="tp-member-info-row"><span>電話</span><span>{order.contactPhone || '—'}</span></div>
            <div className="tp-member-info-row"><span>Email</span><span>{order.contactEmail || '—'}</span></div>
          </div>
        </div>
      </section>

      {!isTerminal && (
        <section className="tp-member-panel" style={{ marginTop: 18 }}>
          <h2>下一步操作</h2>
          <div className="tp-member-actions-row">
            {status === 'pending_payment' && (
              <button type="button" className="tp-btn tp-btn-primary" onClick={() => router.push(`/order/pay?orderId=${order.id}`)}>
                前往付款
              </button>
            )}
            {canRefund && !refundSuccess && !showRefundForm && (
              <button type="button" className="tp-btn tp-btn-ghost" onClick={() => setShowRefundForm(true)}>
                申請退款
              </button>
            )}
            {canCancel && (
              <button type="button" className="tp-btn tp-btn-ghost" onClick={() => setShowCancelDialog(true)}>
                取消訂單
              </button>
            )}
          </div>

          {refundSuccess && <div className="tp-member-status success" style={{ marginTop: 16 }}>✅ 退款申請已送出，等待審核中</div>}

          {showRefundForm && (
            <form className="tp-member-form" style={{ marginTop: 18 }} onSubmit={handleRefund}>
              <div className="tp-member-field">
                <label htmlFor="refundReason">退款原因</label>
                <textarea
                  id="refundReason"
                  className="tp-member-textarea"
                  required
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="請說明退款原因…"
                />
              </div>
              {refundErr && <div className="tp-member-status danger">⚠️ {refundErr}</div>}
              <div className="tp-member-actions-row">
                <button type="submit" className="tp-btn tp-btn-primary" disabled={submittingRefund}>
                  {submittingRefund ? '送出中…' : '送出申請'}
                </button>
                <button type="button" className="tp-btn tp-btn-ghost" onClick={() => { setShowRefundForm(false); setRefundErr(null); }}>
                  取消
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {showCancelDialog && (
        <div className="tp-member-overlay" onClick={() => { setShowCancelDialog(false); setCancelErr(null); }}>
          <div className="tp-member-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="tp-member-modal-head">
              <div>
                <p className="tp-member-kicker">cancel order</p>
                <h2 style={{ marginBottom: 6 }}>確認取消訂單？</h2>
                <div className="tp-member-meta">取消後無法恢復，席位將自動釋出。</div>
              </div>
            </div>
            {cancelErr && <div className="tp-member-status danger" style={{ marginBottom: 16 }}>⚠️ {cancelErr}</div>}
            <div className="tp-member-actions-row">
              <button type="button" className="tp-btn tp-btn-primary" onClick={handleCancel} disabled={cancelling}>
                {cancelling ? '取消中…' : '確認取消'}
              </button>
              <button type="button" className="tp-btn tp-btn-ghost" onClick={() => { setShowCancelDialog(false); setCancelErr(null); }}>
                返回
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
