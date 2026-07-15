'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useClientLocale } from '../../../../src/i18n/use-client-locale';
import { getClientNamespace } from '../../../../src/i18n/client-nav-messages';

type OrderDetail = {
  id: string;
  status: string;
  totalTwd: number;
  title?: string | null;
  peopleCount?: number;
  contactName?: string | null;
  contactEmail?: string | null;
  scheduleId?: string | null;
};

type ECPayFormData = {
  endpoint: string;
  params: Record<string, string>;
};

export default function OrderPayPage() {
  const params = useSearchParams();
  const router = useRouter();
  const locale = useClientLocale();
  const m = getClientNamespace(locale, 'orderPay');
  const statusLabels = getClientNamespace(locale, 'orders').status as Record<string, string>;
  const orderId = params.get('orderId') || '';
  const email = params.get('email') || '';

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ecpayData, setEcpayData] = useState<ECPayFormData | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }
    fetch(`/api/v2/orders/${encodeURIComponent(orderId)}?contactEmail=${encodeURIComponent(email)}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j?.error) {
          if (r.status === 401 || j?.error?.code === 'UNAUTHORIZED') {
            setAuthRequired(true);
            setErr(m.loginRequiredError);
            setOrder(null);
            return;
          }
          setOrder(null);
          return;
        }
        setOrder(j.data || null);
      })
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [orderId, email, m.loginRequiredError]);

  // 當收到 ECPay 表單資料時自動提交
  useEffect(() => {
    if (ecpayData && formRef.current) {
      formRef.current.submit();
    }
  }, [ecpayData]);

  const handlePay = async () => {
    if (!orderId) return;
    setPaying(true);
    setErr(null);

    try {
      // 呼叫 ECPay 付款建立 API
      const res = await fetch('/api/v2/payments/ecpay/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      const j = await res.json();

      if (!res.ok || j.error) {
        throw new Error(j.error?.message || m.createPaymentFailed);
      }

      // 設置 ECPay 表單資料，觸發自動提交
      setEcpayData({
        endpoint: j.data.endpoint,
        params: j.data.params,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : m.payFailedRetry);
      setPaying(false);
    }
  };


  const containerStyle: React.CSSProperties = {
    maxWidth: 480,
    margin: '48px auto',
    padding: '0 16px',
    fontFamily: 'system-ui, sans-serif',
  };

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 16,
    padding: 24,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid #f3f4f6',
  };

  const labelStyle: React.CSSProperties = { fontSize: 13, color: '#6b7280' };
  const valueStyle: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: '#111827' };

  const btnStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px 0',
    borderRadius: 12,
    border: 'none',
    background: paying ? '#d1d5db' : '#a8511f',
    color: '#fff',
    fontSize: 16,
    fontWeight: 700,
    cursor: paying ? 'not-allowed' : 'pointer',
    marginTop: 24,
    letterSpacing: '0.02em',
  };


  if (loading) {
    return <div style={containerStyle}><p style={{ color: '#9ca3af', textAlign: 'center' }}>{m.loading}</p></div>;
  }

  if (!orderId || !order) {
    if (authRequired) {
      return (
        <div style={containerStyle}>
          <div style={cardStyle}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{m.authRequiredHeading}</h2>
            <p style={{ color: '#6b7280', fontSize: 14 }}>{m.authRequiredBody}</p>
            <button
              onClick={() => router.push(`/login?redirectTo=${encodeURIComponent(`/order/pay?orderId=${orderId}${email ? `&email=${encodeURIComponent(email)}` : ''}`)}`)}
              style={{ ...btnStyle, marginTop: 16 }}
            >
              {m.goToLogin}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div style={containerStyle}>
        <p style={{ color: '#ef4444', textAlign: 'center' }}>{m.notFound}</p>
      </div>
    );
  }

  if (order.status !== 'pending_payment') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{m.cannotPayHeading}</h2>
          <p style={{ color: '#6b7280', fontSize: 14 }}>
            {m.currentStatusPrefix}<strong>{statusLabels[order.status] || order.status}</strong>
          </p>
          <button onClick={() => router.push(`/me/orders`)} style={{ ...btnStyle, marginTop: 16, background: '#6b7280' }}>
            {m.viewOrders}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 24, color: '#111827' }}>{m.confirmPayment}</h1>

      <div style={cardStyle}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#374151', marginBottom: 16 }}>{m.orderSummary}</h2>

        <div style={rowStyle}>
          <span style={labelStyle}>{m.trip}</span>
          <span style={valueStyle}>{order.title || '—'}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>{m.people}</span>
          <span style={valueStyle}>{m.peopleUnit.replace('{n}', String(order.peopleCount ?? '—'))}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>{m.contactName}</span>
          <span style={valueStyle}>{order.contactName || '—'}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>{m.contactEmail}</span>
          <span style={valueStyle}>{order.contactEmail || '—'}</span>
        </div>
        <div style={{ ...rowStyle, borderBottom: 'none' }}>
          <span style={{ ...labelStyle, fontWeight: 700, color: '#111827', fontSize: 15 }}>{m.amountDue}</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#a8511f' }}>
            NT$ {(order.totalTwd ?? 0).toLocaleString()}
          </span>
        </div>
      </div>

      {err && (
        <p style={{ color: '#ef4444', fontSize: 13, marginTop: 12, textAlign: 'center' }}>{err}</p>
      )}

      {/* ECPay 正式付款 */}
      <button onClick={handlePay} disabled={paying} style={btnStyle} data-testid="ecpay-pay-btn">
        {paying ? m.paying : m.payWithEcpay}
      </button>

      <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 12 }}>
        {m.ecpayNotice}
      </p>

      {/* ECPay 隱藏表單（用於跳轉） */}
      {ecpayData && (
        <form
          ref={formRef}
          method="POST"
          action={ecpayData.endpoint}
          style={{ display: 'none' }}
        >
          {Object.entries(ecpayData.params).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
        </form>
      )}
    </div>
  );
}
