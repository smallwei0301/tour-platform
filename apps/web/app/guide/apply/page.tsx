'use client';

import { useState } from 'react';

const specialtyOptions = ['文化走讀', '美食導覽', '山林健行', '水上活動', '單車行程'];
const languageOptions = ['中文', '英文', '日文', '韓文', '泰文'];
const regionOptions = ['台北', '桃園', '台中', '台南', '高雄', '花蓮', '台東'];
const certOptions = ['急救證照', '登山證照', '潛水證照', '導遊證', '領隊證'];
const paymentOptions = [
  { id: 'bank', label: '銀行轉帳' },
  { id: 'linepay', label: 'LINE Pay' },
  { id: 'transfer', label: '第三方金流' },
];

export default function GuideApplyPage() {
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [bio, setBio] = useState('');
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [certs, setCerts] = useState<string[]>([]);
  const [otherCert, setOtherCert] = useState('');
  const [payment, setPayment] = useState('bank');
  const [submitting, setSubmitting] = useState(false);
  const [doneId, setDoneId] = useState('');
  const [error, setError] = useState('');

  function toggleList(value: string, list: string[], setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  async function submitApplication() {
    try {
      setSubmitting(true);
      setError('');
      const res = await fetch('/api/guide-applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName,
          phone,
          email,
          city,
          bio,
          specialties,
          languages,
          regions,
          certs: otherCert ? [...certs, otherCert] : certs,
          payment,
        }),
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
    <main className="tp-container tp-static-editorial-page">
      <section className="tp-guide-hero" style={{ marginBottom: 18 }}>
        <p className="tp-guide-kicker">guide apply</p>
        <h1>把你的在地帶路能力，變成一套可被預約的體驗。</h1>
        <p>
          我們保留原本 `/api/guide-applications` 的送件流程，只把申請體驗改成 MIDAO onboarding。
          你可以一次填好專長、語言、熟悉區域、相關證照與收款方式，交由平台審核。
        </p>
        <div className="tp-guide-hero-meta">
          <span className="tp-guide-chip">🧾 線上申請</span>
          <span className="tp-guide-chip">🪪 證照審核</span>
          <span className="tp-guide-chip">💳 收款設定</span>
        </div>
      </section>

      <section className="tp-guide-stepper">
        <div className={`tp-guide-step${step >= 1 ? ' is-active' : ''}${step > 1 ? ' is-done' : ''}`}>
          <strong>1. 基本資料</strong>
          <span>姓名、電話、城市、自我介紹與帶團主題。</span>
        </div>
        <div className={`tp-guide-step${step >= 2 ? ' is-active' : ''}${step > 2 ? ' is-done' : ''}`}>
          <strong>2. 上傳資料</strong>
          <span>證件與形象照，讓審核更快完成。</span>
        </div>
        <div className={`tp-guide-step${step >= 3 ? ' is-active' : ''}${step > 3 ? ' is-done' : ''}`}>
          <strong>3. 最後確認</strong>
          <span>再次確認專長、區域、語言與收款方式。</span>
        </div>
        <div className={`tp-guide-step${step >= 4 ? ' is-active is-done' : ''}`}>
          <strong>4. 送出完成</strong>
          <span>建立申請編號，等待 MIDAO 團隊聯繫。</span>
        </div>
      </section>

      {step === 1 && (
        <section className="tp-guide-grid cols-2" style={{ alignItems: 'start' }}>
          <div className="tp-guide-panel">
            <h2>基本資料</h2>
            <p className="tp-guide-meta">請先填寫導遊介紹與可帶領主題。這些資料會用於審核與後續建檔。</p>

            <div className="tp-guide-form">
              <div className="tp-guide-form-row">
                <div className="tp-guide-field">
                  <label htmlFor="fullName">姓名 *</label>
                  <input id="fullName" className="tp-guide-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="tp-guide-field">
                  <label htmlFor="phone">電話 *</label>
                  <input id="phone" className="tp-guide-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>

              <div className="tp-guide-form-row">
                <div className="tp-guide-field">
                  <label htmlFor="email">電子信箱 *</label>
                  <input id="email" className="tp-guide-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="tp-guide-field">
                  <label htmlFor="city">所在縣市 *</label>
                  <input id="city" className="tp-guide-input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="例如：高雄市" />
                </div>
              </div>

              <div className="tp-guide-field">
                <label htmlFor="bio">自我介紹 *</label>
                <textarea id="bio" className="tp-guide-textarea" value={bio} onChange={(e) => setBio(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="tp-guide-panel">
            <h2>專長與語言</h2>
            <div className="tp-guide-field" style={{ marginBottom: 16 }}>
              <span className="tp-guide-fieldset-title">專長領域 *</span>
              <div className="tp-guide-option-grid">
                {specialtyOptions.map((item) => (
                  <label key={item} className="tp-guide-choice">
                    <input type="checkbox" checked={specialties.includes(item)} onChange={() => toggleList(item, specialties, setSpecialties)} />
                    {item}
                  </label>
                ))}
              </div>
            </div>

            <div className="tp-guide-field" style={{ marginBottom: 16 }}>
              <span className="tp-guide-fieldset-title">可帶語言 *</span>
              <div className="tp-guide-option-grid">
                {languageOptions.map((item) => (
                  <label key={item} className="tp-guide-choice">
                    <input type="checkbox" checked={languages.includes(item)} onChange={() => toggleList(item, languages, setLanguages)} />
                    {item}
                  </label>
                ))}
              </div>
            </div>

            <div className="tp-guide-field">
              <span className="tp-guide-fieldset-title">熟悉區域 *</span>
              <div className="tp-guide-option-grid">
                {regionOptions.map((item) => (
                  <label key={item} className="tp-guide-choice">
                    <input type="checkbox" checked={regions.includes(item)} onChange={() => toggleList(item, regions, setRegions)} />
                    {item}
                  </label>
                ))}
              </div>
            </div>

            <div className="tp-guide-actions-row">
              <button type="button" className="tp-btn tp-btn-primary" onClick={() => setStep(2)}>
                下一步：上傳資料
              </button>
            </div>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="tp-guide-grid cols-2" style={{ alignItems: 'start' }}>
          <div className="tp-guide-panel">
            <h2>上傳證件與照片</h2>
            <p className="tp-guide-meta">這一段保留原本上傳欄位形式，先收資料，審核通過後再建立正式導遊帳號。</p>
            <div className="tp-guide-form">
              <div className="tp-guide-field">
                <label htmlFor="identity-file">身分證件上傳 *</label>
                <input id="identity-file" className="tp-guide-input" type="file" />
              </div>
              <div className="tp-guide-field">
                <label htmlFor="portrait-file">個人照片上傳 *</label>
                <input id="portrait-file" className="tp-guide-input" type="file" />
              </div>
            </div>
          </div>

          <div className="tp-guide-panel">
            <h2>證照與收款方式</h2>
            <div className="tp-guide-field" style={{ marginBottom: 16 }}>
              <span className="tp-guide-fieldset-title">相關證照</span>
              <div className="tp-guide-option-grid">
                {certOptions.map((item) => (
                  <label key={item} className="tp-guide-choice">
                    <input type="checkbox" checked={certs.includes(item)} onChange={() => toggleList(item, certs, setCerts)} />
                    {item}
                  </label>
                ))}
              </div>
              <input className="tp-guide-input" placeholder="其他證照" value={otherCert} onChange={(e) => setOtherCert(e.target.value)} />
            </div>

            <div className="tp-guide-field">
              <span className="tp-guide-fieldset-title">收款方式 *</span>
              <div className="tp-guide-option-grid">
                {paymentOptions.map((option) => (
                  <label key={option.id} className="tp-guide-choice">
                    <input type="radio" name="payment" checked={payment === option.id} onChange={() => setPayment(option.id)} />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="tp-guide-actions-row">
              <button type="button" className="tp-btn tp-btn-ghost" onClick={() => setStep(1)}>
                上一步
              </button>
              <button type="button" className="tp-btn tp-btn-primary" onClick={() => setStep(3)}>
                下一步：最後確認
              </button>
            </div>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="tp-guide-grid cols-2" style={{ alignItems: 'start' }}>
          <div className="tp-guide-panel">
            <h2>最後確認</h2>
            <div className="tp-guide-card-list">
              <div className="tp-guide-data-card"><strong>姓名</strong><div className="tp-guide-meta">{fullName || '—'}</div></div>
              <div className="tp-guide-data-card"><strong>Email</strong><div className="tp-guide-meta">{email || '—'}</div></div>
              <div className="tp-guide-data-card"><strong>城市</strong><div className="tp-guide-meta">{city || '—'}</div></div>
              <div className="tp-guide-data-card"><strong>專長</strong><div className="tp-guide-meta">{specialties.length ? specialties.join('、') : '—'}</div></div>
              <div className="tp-guide-data-card"><strong>語言</strong><div className="tp-guide-meta">{languages.length ? languages.join('、') : '—'}</div></div>
              <div className="tp-guide-data-card"><strong>區域</strong><div className="tp-guide-meta">{regions.length ? regions.join('、') : '—'}</div></div>
              <div className="tp-guide-data-card"><strong>證照</strong><div className="tp-guide-meta">{[...certs, otherCert].filter(Boolean).length ? [...certs, otherCert].filter(Boolean).join('、') : '—'}</div></div>
              <div className="tp-guide-data-card"><strong>收款方式</strong><div className="tp-guide-meta">{paymentOptions.find((item) => item.id === payment)?.label || '—'}</div></div>
            </div>
          </div>

          <div className="tp-guide-panel">
            <h2>送件前提醒</h2>
            <div className="tp-guide-banner">
              平台會依照你填寫的專長、區域與證照進行人工審核。若需要補件，會透過 Email 與電話聯繫你。
            </div>
            {error && <div className="tp-guide-status danger" style={{ marginTop: 16 }}>⚠️ {error}</div>}
            <div className="tp-guide-actions-row">
              <button type="button" className="tp-btn tp-btn-ghost" onClick={() => setStep(2)}>
                返回修改
              </button>
              <button type="button" className="tp-btn tp-btn-primary" disabled={submitting} onClick={submitApplication}>
                {submitting ? '送出中…' : '送出申請'}
              </button>
            </div>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="tp-guide-panel">
          <p className="tp-guide-kicker">application submitted</p>
          <h2>申請已送出 ✅</h2>
          <p className="tp-guide-meta">申請編號：{doneId || '—'}</p>
          <p className="tp-guide-meta">審核結果將以 Email 通知，通過後會發送導遊工作台邀請連結。</p>
        </section>
      )}
    </main>
  );
}
