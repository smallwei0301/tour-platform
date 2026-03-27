'use client';

import { useState } from 'react';

type Step = 1 | 2 | 3;

export default function BookingFlowPage() {
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [agree, setAgree] = useState(false);

  return (
    <main className="tp-container tp-booking-page">
      <div className="tp-breadcrumb">首頁 &gt; 預約流程</div>

      <div className="tp-stepper" aria-label="預約步驟">
        <span className={step >= 1 ? 'active' : ''}>1 行程確認</span>
        <span className={step >= 2 ? 'active' : ''}>2 旅客資訊</span>
        <span className={step >= 3 ? 'active' : ''}>3 付款</span>
      </div>

      {step === 1 && (
        <section className="tp-step-card">
          <h1>Step 1 — 行程確認</h1>
          <p>大稻埕百年老街深度漫步 · 2026/04/01（三）· 成人 2 位</p>
          <div className="tp-price-lines">
            <p>成人 NT$1,500 × 2 = NT$3,000</p>
            <p>平台服務費 NT$0</p>
            <strong>總計 NT$3,000</strong>
          </div>
          <p>取消政策：48 小時前取消可全額退款。</p>
          <div className="tp-step-actions">
            <button className="tp-btn tp-btn-primary" onClick={() => setStep(2)}>下一步：填寫資訊</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="tp-step-card">
          <h1>Step 2 — 旅客資訊</h1>
          <label>姓名*
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>電話*
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label>電子信箱*
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="tp-checkline">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            我已閱讀並同意服務條款與退款政策
          </label>
          <div className="tp-step-actions">
            <button className="tp-btn tp-btn-ghost" onClick={() => setStep(1)}>上一步</button>
            <button className="tp-btn tp-btn-primary" disabled={!name || !phone || !email || !agree} onClick={() => setStep(3)}>
              下一步：付款
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="tp-step-card">
          <h1>Step 3 — 付款</h1>
          <p>付款方式：信用卡（ECPay）</p>
          <label>卡號
            <input placeholder="**** **** **** ****" />
          </label>
          <div className="tp-inline-2">
            <label>MM/YY<input placeholder="04/30" /></label>
            <label>CVV<input placeholder="123" /></label>
          </div>
          <p className="tp-payment-note">🔒 付款由 ECPay 加密處理，資料不經本站。</p>
          <div className="tp-step-actions">
            <button className="tp-btn tp-btn-ghost" onClick={() => setStep(2)}>上一步</button>
            <button className="tp-btn tp-btn-primary">確認付款 NT$3,000</button>
          </div>
        </section>
      )}
    </main>
  );
}
