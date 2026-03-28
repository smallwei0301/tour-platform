'use client';

import Link from 'next/link';
import { activities, guides } from '../../../src/fixtures/data';
import { useState } from 'react';
import { useParams } from 'next/navigation';

export default function BookingPage() {
  const params = useParams();
  const activityId = params.activityId as string;
  const activity = activities.find((a) => a.slug === activityId);
  const [step, setStep] = useState(1);
  const [guests, setGuests] = useState(2);

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

  return (
    <main className="tp-container" style={{ paddingBottom: 40 }}>
      <div className="tp-breadcrumb" style={{ marginTop: 18 }}>
        <Link href="/activities">全部行程</Link> &gt; {activity.title} &gt; 預約
      </div>

      {/* Progress bar */}
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
                <span style={{ fontWeight: 700, fontSize: 14 }}>📅 選擇日期</span>
                <input type="date" style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
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
                <input type="text" placeholder="請輸入真實姓名" style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
              </label>
              <label style={{ display: 'block', marginBottom: 10 }}>
                電話 *
                <input type="tel" placeholder="0912-345-678" style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
              </label>
              <label style={{ display: 'block', marginBottom: 10 }}>
                電子信箱 *
                <input type="email" placeholder="you@example.com" style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
              </label>
              <label style={{ display: 'block', marginBottom: 16 }}>
                給導遊的備註（選填）
                <textarea placeholder="例：有食物過敏、行動不便、希望多停留某景點等" rows={3}
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4, resize: 'vertical' }} />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 16 }}>
                <input type="checkbox" />
                我已閱讀並同意<Link href="/legal/terms" className="tp-link">服務條款</Link>與<Link href="/legal/refund" className="tp-link">退款政策</Link>
              </label>

              <div style={{ display: 'flex', gap: 12 }}>
                <button className="tp-btn tp-btn-ghost" onClick={() => setStep(1)}>← 上一步</button>
                <button className="tp-btn tp-btn-primary" style={{ flex: 1, padding: '14px 0', fontSize: 16 }} onClick={() => setStep(3)}>
                  下一步：付款 →
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

              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <button className="tp-btn tp-btn-ghost" onClick={() => setStep(2)}>← 上一步</button>
                <Link href="/order/success" className="tp-btn tp-btn-primary" style={{ flex: 1, padding: '14px 0', fontSize: 16, textAlign: 'center' }}>
                  確認付款 NT${total.toLocaleString()}
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Side summary */}
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
