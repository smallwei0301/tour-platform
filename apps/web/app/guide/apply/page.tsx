'use client';

import { useState } from 'react';

export default function GuideApplyPage() {
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [bio, setBio] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [doneId, setDoneId] = useState('');
  const [error, setError] = useState('');

  async function submitApplication() {
    try {
      setSubmitting(true);
      setError('');
      const res = await fetch('/api/guide-applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fullName, phone, email, city, bio })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json?.error?.message || '申請失敗');
      setDoneId(json.data.id || '');
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : '申請失敗');
    } finally {
      setSubmitting(false);
    }
  }

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
          <label>姓名*<input value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
          <label>電話*<input value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
          <label>電子信箱*<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>所在縣市*<input placeholder="例如：高雄市" value={city} onChange={(e) => setCity(e.target.value)} /></label>
          <label>自我介紹*<textarea rows={4} value={bio} onChange={(e) => setBio(e.target.value)} /></label>
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
          <h2>申請資料確認</h2>
          <p>姓名：{fullName || '—'}</p>
          <p>Email：{email || '—'}</p>
          <p>城市：{city || '—'}</p>
          {error && <p style={{ color: '#b42318' }}>⚠️ {error}</p>}
          <div className="tp-step-actions">
            <button className="tp-btn tp-btn-ghost" onClick={() => setStep(2)}>返回修改</button>
            <button className="tp-btn tp-btn-primary" disabled={submitting} onClick={submitApplication}>{submitting ? '送出中…' : '送出申請'}</button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="tp-step-card">
          <h2>申請已送出 ✅</h2>
          <p>申請編號：{doneId || '—'}</p>
          <p>審核結果將以 Email 通知。</p>
        </section>
      )}
    </main>
  );
}
