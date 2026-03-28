'use client';

import Link from 'next/link';
import { activities, guides } from '../../../src/fixtures/data';
import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createOrder, submitEcpayCallback } from '../../../src/lib/client-api';

export default function BookingPage() {
  const params = useParams();
  const router = useRouter();
  const activityId = params.activityId as string;
  const activity = activities.find((a) => a.slug === activityId);
  const [step, setStep] = useState(1);
  const [guests, setGuests] = useState(2);
  const [selectedScheduleId, setSelectedScheduleId] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [note, setNote] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [createdOrderId, setCreatedOrderId] = useState('');

  if (!activity) {
    return (
      <main className="tp-container" style={{ padding: '60px 0', textAlign: 'center' }}>
        <h1>找不到此行程</h1>
        <Link href="/activities" className="tp-link">返回行程列表</Link>
      </main>
    );
  }

  const guide = guides.find((g) => g.slug === activity.guideSlug);
  const total = activity.price * guests;

  const openSchedules = useMemo(
    () => activity.schedules.filter((s) => s.status === 'open' && s.bookedCount < s.capacity),
    [activity.schedules]
  );

  const scheduleOptions = useMemo(() => {
    const chaishanMap: Record<string, string> = {
      '2026-04-01T09:00:00+08:00': 'sch_chaishan_0401',
      '2026-04-03T09:00:00+08:00': 'sch_chaishan_0403',
      '2026-04-10T09:00:00+08:00': 'sch_chaishan_0410'
    };
    const dadaochengMap: Record<string, string> = {
      '2026-04-02T09:00:00+08:00': 'sch_dadaocheng_0402'
    };

    return openSchedules.map((s, idx) => {
      let scheduleId = '';
      if (activity.slug === 'kaohsiung-chaishan-cave-experience') {
        scheduleId = chaishanMap[s.startAt] || '';
      } else if (activity.slug === 'dadadaocheng-walk') {
        scheduleId = dadaochengMap[s.startAt] || '';
      }
      return { ...s, scheduleId, localKey: `${s.startAt}-${idx}` };
    }).filter((s) => !!s.scheduleId);
  }, [activity.slug, openSchedules]);

  const canGoStep3 = Boolean(contactName && contactPhone && contactEmail && agreed && selectedScheduleId);

  async function handleCreateOrderAndGoPayment() {
    if (!canGoStep3) {
      setErrorMessage('請先填完整聯絡資訊、選擇可預約場次，並同意條款。');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');

      const order = await createOrder({
        experienceSlug: activity.slug,
        scheduleId: selectedScheduleId,
        peopleCount: guests,
        contactName,
        contactPhone,
        contactEmail
      });

      setCreatedOrderId(order.id);
      setStep(3);
    } catch (err) {
      const message = err instanceof Error ? err.message : '建立訂單失敗';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleMockPaymentSuccess() {
    if (!createdOrderId) {
      setErrorMessage('尚未建立訂單，請回上一步先建立訂單。');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');

      await submitEcpayCallback({
        orderId: createdOrderId,
        tradeNo: `MOCK-${Date.now()}`
      });

      router.push(`/order/success?orderId=${encodeURIComponent(createdOrderId)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '付款回調失敗';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="tp-container" style={{ paddingBottom: 40 }}>
      <div className="tp-breadcrumb" style={{ marginTop: 18 }}>
        <Link href="/activities">全部行程</Link> &gt; {activity.title} &gt; 預約
      </div>

      <div className="tp-booking-progress" style={{ display: 'flex', alignItems: 'center', gap: 0, margin: '20px 0 30px', maxWidth: 500 }}>
        {['行程確認', '旅客資訊', '付款'].map((label, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: step > i ? 'var(--tp-primary)' : step === i + 1 ? 'var(--tp-primary)' : '#e5e5e5',
              color: step >= i + 1 ? '#fff' : '#999', fontWeight: 700, fontSize: 14,
            }}>
              {i + 1}
            </div>
            <span style={{ marginLeft: 6, fontSize: 14, fontWeight: step === i + 1 ? 700 : 400, color: step === i + 1 ? 'var(--tp-text)' : 'var(--tp-muted)' }}>
              {label}
            </span>
            {i < 2 && <div style={{ flex: 1, height: 2, background: step > i + 1 ? 'var(--tp-primary)' : '#e5e5e5', margin: '0 8px' }} />}
          </div>
        ))}
      </div>

      {errorMessage && (
        <div style={{ marginBottom: 16, background: '#fff4f4', border: '1px solid #f5c2c2', color: '#b42318', borderRadius: 10, padding: '10px 14px', fontSize: 14 }}>
          ⚠️ {errorMessage}
        </div>
      )}

      <div className="tp-booking-layout" style={{ display: 'grid', gap: 24 }}>
        <div>
          {step === 1 && (
            <div style={{ border: '1px solid var(--tp-border)', borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
                <img src={activity.imageUrl} alt={activity.title} style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 8 }} />
                <div>
                  <h3 style={{ margin: 0 }}>{activity.title}</h3>
                  <p style={{ margin: '4px 0', color: 'var(--tp-muted)', fontSize: 14 }}>📍 {activity.region} · 🕐 {activity.durationDisplay} · 導遊：{guide?.displayName}</p>
                </div>
              </div>

              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>📅 選擇可預約場次</span>
                <select
                  value={selectedScheduleId}
                  onChange={(e) => setSelectedScheduleId(e.target.value)}
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }}
                >
                  <option value="">請選擇場次</option>
                  {scheduleOptions.map((s) => {
                    const d = new Date(s.startAt);
                    const remaining = s.capacity - s.bookedCount;
                    return (
                      <option key={s.localKey} value={s.scheduleId}>
                        {d.toLocaleDateString('zh-TW')} {d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}（剩 {remaining} 位）
                      </option>
                    );
                  })}
                </select>
                {scheduleOptions.length === 0 && (
                  <p style={{ marginTop: 6, fontSize: 13, color: '#b42318' }}>目前沒有可預約場次，請稍後再試。</p>
                )}
              </label>

              <label style={{ display: 'block', marginBottom: 16 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>👥 參加人數</span>
                <input type="number" value={guests} onChange={(e) => setGuests(Math.max(1, parseInt(e.target.value) || 1))} min={1} max={activity.maxParticipants}
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
              </label>

              <div style={{ borderTop: '1px solid var(--tp-border)', paddingTop: 14, marginTop: 14 }}>
                <h4>費用明細</h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>{activity.priceLabel} × {guests} 人</span>
                  <span>NT${total.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--tp-muted)' }}>
                  <span>平台服務費</span>
                  <span>NT$0</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 18, borderTop: '1px solid var(--tp-border)', paddingTop: 8, marginTop: 8 }}>
                  <span>總計</span>
                  <span>NT${total.toLocaleString()}</span>
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <h4>取消政策</h4>
                <ul style={{ paddingLeft: 18, lineHeight: 2, fontSize: 14, color: 'var(--tp-muted)' }}>
                  {activity.refundRules.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>

              <button className="tp-btn tp-btn-primary" style={{ width: '100%', marginTop: 16, padding: '14px 0', fontSize: 16 }} onClick={() => setStep(2)}>
                下一步：填寫資訊 →
              </button>
            </div>
          )}

          {step === 2 && (
            <div style={{ border: '1px solid var(--tp-border)', borderRadius: 12, padding: 20 }}>
              <h3>聯絡人資訊</h3>
              <label style={{ display: 'block', marginBottom: 10 }}>
                姓名 *
                <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="請輸入真實姓名" style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
              </label>
              <label style={{ display: 'block', marginBottom: 10 }}>
                電話 *
                <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="0912-345-678" style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
              </label>
              <label style={{ display: 'block', marginBottom: 10 }}>
                電子信箱 *
                <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="you@example.com" style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
              </label>
              <label style={{ display: 'block', marginBottom: 16 }}>
                給導遊的備註（選填）
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：有食物過敏、行動不便、希望多停留某景點等" rows={3}
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4, resize: 'vertical' }} />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 16 }}>
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                我已閱讀並同意<Link href="/legal/terms" className="tp-link">服務條款</Link>與<Link href="/legal/refund" className="tp-link">退款政策</Link>
              </label>

              <div style={{ display: 'flex', gap: 12 }}>
                <button className="tp-btn tp-btn-ghost" onClick={() => setStep(1)} disabled={loading}>← 上一步</button>
                <button
                  className="tp-btn tp-btn-primary"
                  style={{ flex: 1, padding: '14px 0', fontSize: 16, opacity: loading ? 0.7 : 1 }}
                  onClick={handleCreateOrderAndGoPayment}
                  disabled={loading}
                >
                  {loading ? '建立訂單中…' : '建立訂單並前往付款 →'}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ border: '1px solid var(--tp-border)', borderRadius: 12, padding: 20 }}>
              <h3>選擇付款方式</h3>
              <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, border: '2px solid var(--tp-primary)', borderRadius: 10, padding: 12 }}>
                  <input type="radio" name="payment" defaultChecked /> 💳 信用卡（Visa / Mastercard / JCB）
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--tp-border)', borderRadius: 10, padding: 12 }}>
                  <input type="radio" name="payment" /> LINE Pay
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--tp-border)', borderRadius: 10, padding: 12 }}>
                  <input type="radio" name="payment" /> ATM 虛擬帳號
                </label>
              </div>

              <p style={{ fontSize: 18, fontWeight: 700 }}>總計：NT${total.toLocaleString()}</p>
              <p style={{ fontSize: 13, color: 'var(--tp-muted)' }}>🔒 付款由 ECPay 加密處理，資料不經本站</p>
              <p style={{ fontSize: 13, color: 'var(--tp-muted)' }}>訂單編號：{createdOrderId || '尚未建立'}</p>

              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <button className="tp-btn tp-btn-ghost" onClick={() => setStep(2)} disabled={loading}>← 上一步</button>
                <button
                  className="tp-btn tp-btn-primary"
                  style={{ flex: 1, padding: '14px 0', fontSize: 16, textAlign: 'center', opacity: loading ? 0.7 : 1 }}
                  onClick={handleMockPaymentSuccess}
                  disabled={loading}
                >
                  {loading ? '付款處理中…' : `確認付款 NT$${total.toLocaleString()}`}
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ position: 'sticky', top: 80, height: 'fit-content', border: '1px solid var(--tp-border)', borderRadius: 12, padding: 16 }}>
          <img src={activity.imageUrl} alt={activity.title} style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 10, marginBottom: 10 }} />
          <h4 style={{ margin: '0 0 4px' }}>{activity.title}</h4>
          <p style={{ color: 'var(--tp-muted)', fontSize: 13 }}>📍 {activity.region} · 🕐 {activity.durationDisplay}</p>
          <p style={{ color: 'var(--tp-muted)', fontSize: 13 }}>導遊：{guide?.displayName}</p>
          <div style={{ borderTop: '1px solid var(--tp-border)', marginTop: 10, paddingTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
              <span>總計</span>
              <span>NT${total.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
