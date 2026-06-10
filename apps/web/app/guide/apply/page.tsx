'use client';

import { useState } from 'react';
import Link from 'next/link';

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

  const specialtyOptions = ['文化走讀', '美食導覽', '山林健行', '水上活動', '單車行程'];
  const languageOptions = ['中文', '英文', '日文', '韓文', '泰文'];
  const regionOptions = ['台北', '桃園', '台中', '台南', '高雄', '花蓮', '台東'];
  const certOptions = ['急救證照', '登山證照', '潛水證照', '導遊證', '領隊證'];
  const paymentOptions = [
    { id: 'bank', label: '銀行轉帳' },
    { id: 'linepay', label: 'LINE Pay' },
    { id: 'transfer', label: '第三方金流' },
  ];

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
        })
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

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首頁', item: 'https://tour-platform-nine.vercel.app' },
      { '@type': 'ListItem', position: 2, name: '成為導遊', item: 'https://tour-platform-nine.vercel.app/guide/apply' },
    ],
  };

  return (
    <main className="tp-container tp-apply-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="tp-breadcrumb" style={{ marginTop: 18 }}>
        <Link href="/">首頁</Link> &gt; 成為導遊
      </div>
      <h1>成為我們的導遊</h1>
      <p>平台抽成 15%，導遊實拿 85% · 金流手續費平台吸收 · 後台管理行程</p>

      <ol className="tp-stepper" aria-label="申請步驟">
        <li className={step >= 1 ? 'active' : ''} aria-current={step === 1 ? 'step' : undefined}>1 基本資料</li>
        <li className={step >= 2 ? 'active' : ''} aria-current={step === 2 ? 'step' : undefined}>2 證件與照片</li>
        <li className={step >= 3 ? 'active' : ''} aria-current={step === 3 ? 'step' : undefined}>3 審核送出</li>
      </ol>

      {step === 1 && (
        <section className="tp-step-card">
          <label htmlFor="apply-fullname">姓名*<input id="apply-fullname" value={fullName} onChange={(e) => setFullName(e.target.value)} required aria-required="true" /></label>
          <label htmlFor="apply-phone">電話*<input id="apply-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required aria-required="true" autoComplete="tel" /></label>
          <label htmlFor="apply-email">電子信箱*<input id="apply-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required aria-required="true" autoComplete="email" /></label>
          <label htmlFor="apply-city">所在縣市*<input id="apply-city" placeholder="例如：高雄市" value={city} onChange={(e) => setCity(e.target.value)} required aria-required="true" /></label>
          <label htmlFor="apply-bio">自我介紹*<textarea id="apply-bio" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} required aria-required="true" /></label>

          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <p style={{ fontWeight: 600, marginBottom: 6 }}>專長領域*</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {specialtyOptions.map((item) => (
                  <label key={item} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={specialties.includes(item)}
                      onChange={() => toggleList(item, specialties, setSpecialties)}
                    />
                    {item}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p style={{ fontWeight: 600, marginBottom: 6 }}>可帶語言*</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {languageOptions.map((item) => (
                  <label key={item} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={languages.includes(item)}
                      onChange={() => toggleList(item, languages, setLanguages)}
                    />
                    {item}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p style={{ fontWeight: 600, marginBottom: 6 }}>熟悉區域*</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {regionOptions.map((item) => (
                  <label key={item} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={regions.includes(item)}
                      onChange={() => toggleList(item, regions, setRegions)}
                    />
                    {item}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p style={{ fontWeight: 600, marginBottom: 6 }}>相關證照</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {certOptions.map((item) => (
                  <label key={item} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={certs.includes(item)}
                      onChange={() => toggleList(item, certs, setCerts)}
                    />
                    {item}
                  </label>
                ))}
                <input
                  placeholder="其他證照"
                  value={otherCert}
                  onChange={(e) => setOtherCert(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #d1d5db' }}
                />
              </div>
            </div>

            <div>
              <p style={{ fontWeight: 600, marginBottom: 6 }}>收款方式*</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {paymentOptions.map((option) => (
                  <label key={option.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="radio"
                      name="payment"
                      checked={payment === option.id}
                      onChange={() => setPayment(option.id)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="tp-step-actions">
            <button className="tp-btn tp-btn-primary" onClick={() => setStep(2)}>下一步：證件與照片</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="tp-step-card">
          {/* 證件屬敏感個資，不在公開表單收檔案；照片於上線後由導遊後台上傳。
              先前此處的 file input 並未真正上傳（submit 不含檔案），屬誤導 UI。 */}
          <h2 style={{ marginTop: 0 }}>證件與照片</h2>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '14px 16px', fontSize: 14, lineHeight: 1.8, color: '#166534' }}>
            <p style={{ margin: 0, fontWeight: 700 }}>身分證件核驗</p>
            <p style={{ margin: '4px 0 12px' }}>送出申請後，審核人員將以您留下的 Email／電話與您聯繫，進行身分證件與證照核驗。請勿在表單中提供證件影本。</p>
            <p style={{ margin: 0, fontWeight: 700 }}>個人照片</p>
            <p style={{ margin: '4px 0 0' }}>申請通過並開通帳號後，您可以在「導遊後台 → 個人檔案」自行上傳個人照片與相簿，旅客將在您的導遊頁面看到這些內容。</p>
          </div>
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
          <p>專長：{specialties.length ? specialties.join('、') : '—'}</p>
          <p>語言：{languages.length ? languages.join('、') : '—'}</p>
          <p>區域：{regions.length ? regions.join('、') : '—'}</p>
          <p>證照：{[...certs, otherCert].filter(Boolean).length ? [...certs, otherCert].filter(Boolean).join('、') : '—'}</p>
          <p>收款方式：{paymentOptions.find((item) => item.id === payment)?.label || '—'}</p>
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
