'use client';

import { useState } from 'react';

export default function GuideApplyPage() {
  const [step, setStep] = useState(1);

  return (
    <main className="tp-container tp-apply-page">
      <h1>成為我們的導遊</h1>
      <p>佣金 15% · 安全收款 · 後台管理行程</p>

      <div className="tp-stepper">
        <span className={step >= 1 ? 'active' : ''}>1 基本資料</span>
        <span className={step >= 2 ? 'active' : ''}>2 上傳證件</span>
        <span className={step >= 3 ? 'active' : ''}>3 審核送出</span>
      </div>

      {step === 1 && (
        <section className="tp-step-card">
          <label>姓名*<input /></label>
          <label>電話*<input /></label>
          <label>電子信箱*<input type="email" /></label>
          <label>所在縣市*<input placeholder="例如：高雄市" /></label>
          <label>自我介紹*<textarea rows={4} /></label>
          <div className="tp-step-actions">
            <button className="tp-btn tp-btn-primary" onClick={() => setStep(2)}>下一步：上傳證件</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="tp-step-card">
          <label>身分證件上傳*<input type="file" /></label>
          <label>個人照片上傳*<input type="file" /></label>
          <div className="tp-step-actions">
            <button className="tp-btn tp-btn-ghost" onClick={() => setStep(1)}>上一步</button>
            <button className="tp-btn tp-btn-primary" onClick={() => setStep(3)}>下一步：審核送出</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="tp-step-card">
          <h2>申請資料已完成</h2>
          <p>送出後 1-3 個工作天內會由審核團隊與你聯繫。</p>
          <div className="tp-step-actions">
            <button className="tp-btn tp-btn-ghost" onClick={() => setStep(2)}>返回修改</button>
            <button className="tp-btn tp-btn-primary">送出申請</button>
          </div>
        </section>
      )}
    </main>
  );
}
