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
  const [profilePhotoUrl, setProfilePhotoUrl] = useState('');
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [uploadingKind, setUploadingKind] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [doneId, setDoneId] = useState('');
  const [error, setError] = useState('');

  function toggleList(value: string, list: string[], setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';
  const GALLERY_MAX = 6;

  async function uploadPhoto(kind: 'avatar' | 'hero' | 'gallery', file: File): Promise<string> {
    const fd = new FormData();
    fd.append('kind', kind);
    fd.append('file', file);
    const res = await fetch('/api/guide-applications/upload', { method: 'POST', body: fd });
    const json = await res.json().catch(() => null);
    if (!json?.ok) throw new Error(json?.error?.message || '照片上傳失敗，請稍後再試');
    return String(json.data?.url || '');
  }

  async function handlePhotoChange(kind: 'avatar' | 'hero' | 'gallery', files: FileList | null) {
    if (!files || files.length === 0) return;
    try {
      setUploadError('');
      setUploadingKind(kind);
      if (kind === 'gallery') {
        const room = Math.max(0, GALLERY_MAX - galleryUrls.length);
        const picked = Array.from(files).slice(0, room);
        if (picked.length === 0) throw new Error(`活動照片最多 ${GALLERY_MAX} 張`);
        const urls: string[] = [];
        for (const file of picked) urls.push(await uploadPhoto('gallery', file));
        setGalleryUrls((prev) => [...prev, ...urls].slice(0, GALLERY_MAX));
      } else {
        const url = await uploadPhoto(kind, files[0]);
        if (kind === 'avatar') setProfilePhotoUrl(url);
        else setHeroImageUrl(url);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '照片上傳失敗，請稍後再試');
    } finally {
      setUploadingKind('');
    }
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
          profilePhotoUrl,
          heroImageUrl: heroImageUrl || null,
          galleryUrls,
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
          {/* 證件屬敏感個資，不在公開表單收檔案（人工核驗）；
              照片在此真上傳（/api/guide-applications/upload），
              申請通過上線時自動帶入導遊檔案。 */}
          <h2 style={{ marginTop: 0 }}>證件與照片</h2>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '14px 16px', fontSize: 14, lineHeight: 1.8, color: '#166534' }}>
            <p style={{ margin: 0, fontWeight: 700 }}>身分證件核驗</p>
            <p style={{ margin: '4px 0 0' }}>送出申請後，審核人員將以您留下的 Email／電話與您聯繫，進行身分證件與證照核驗。請勿在表單中提供證件影本。</p>
          </div>

          <div style={{ display: 'grid', gap: 20, marginTop: 18 }}>
            <div>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>個人照片*（必填）</p>
              <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 8px' }}>
                審核人員與旅客都會看到這張照片，請使用清晰的個人正面照（JPG／PNG／WebP，5MB 以內）。
                申請通過上線後會自動成為您的導遊頭像，之後可在「導遊後台 → 個人檔案」隨時更換。
              </p>
              {profilePhotoUrl && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img data-testid="apply-avatar-preview" src={profilePhotoUrl} alt="個人照片預覽" style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', border: '2px solid #d1fae5' }} />
                  <button type="button" className="tp-btn tp-btn-ghost" onClick={() => setProfilePhotoUrl('')}>移除</button>
                </div>
              )}
              <input
                id="apply-photo-avatar"
                type="file"
                accept={PHOTO_ACCEPT}
                aria-label="上傳個人照片"
                disabled={uploadingKind !== ''}
                onChange={(e) => { void handlePhotoChange('avatar', e.target.files); e.target.value = ''; }}
              />
            </div>

            <div>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>個人封面（選填）</p>
              <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 8px' }}>導遊頁頂部的橫幅照片，建議 16:9 橫式構圖（10MB 以內）。</p>
              {heroImageUrl && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img data-testid="apply-hero-preview" src={heroImageUrl} alt="個人封面預覽" style={{ width: 200, height: 112, borderRadius: 8, objectFit: 'cover', border: '1px solid #e5e7eb' }} />
                  <button type="button" className="tp-btn tp-btn-ghost" onClick={() => setHeroImageUrl('')}>移除</button>
                </div>
              )}
              <input
                id="apply-photo-hero"
                type="file"
                accept={PHOTO_ACCEPT}
                aria-label="上傳個人封面"
                disabled={uploadingKind !== ''}
                onChange={(e) => { void handlePhotoChange('hero', e.target.files); e.target.value = ''; }}
              />
            </div>

            <div>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>活動照片（選填，最多 {GALLERY_MAX} 張）</p>
              <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 8px' }}>過往帶團或活動的照片，幫助審核人員與旅客認識您的服務（每張 5MB 以內）。</p>
              {galleryUrls.length > 0 && (
                <div data-testid="apply-gallery-preview" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  {galleryUrls.map((url, i) => (
                    <div key={url} style={{ position: 'relative' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`活動照片 ${i + 1}`} style={{ width: 96, height: 64, borderRadius: 6, objectFit: 'cover', border: '1px solid #e5e7eb' }} />
                      <button
                        type="button"
                        aria-label={`移除活動照片 ${i + 1}`}
                        onClick={() => setGalleryUrls((prev) => prev.filter((u) => u !== url))}
                        style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#111827', color: '#fff', fontSize: 11, cursor: 'pointer', lineHeight: 1 }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input
                id="apply-photo-gallery"
                type="file"
                accept={PHOTO_ACCEPT}
                multiple
                aria-label="上傳活動照片"
                disabled={uploadingKind !== '' || galleryUrls.length >= GALLERY_MAX}
                onChange={(e) => { void handlePhotoChange('gallery', e.target.files); e.target.value = ''; }}
              />
            </div>
          </div>

          {uploadingKind && <p style={{ color: '#6b7280', marginTop: 12 }}>照片上傳中…</p>}
          {uploadError && <p style={{ color: '#b42318', marginTop: 12 }}>⚠️ {uploadError}</p>}
          {!profilePhotoUrl && (
            <p style={{ color: '#92400e', fontSize: 13, marginTop: 12 }}>請先上傳個人照片，才能進入下一步。</p>
          )}

          <div className="tp-step-actions">
            <button className="tp-btn tp-btn-ghost" onClick={() => setStep(1)}>上一步</button>
            <button
              className="tp-btn tp-btn-primary"
              disabled={!profilePhotoUrl || uploadingKind !== ''}
              onClick={() => setStep(3)}
            >
              下一步：審核送出
            </button>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>個人照片：</span>
            {profilePhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profilePhotoUrl} alt="個人照片" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} />
            ) : '—'}
          </div>
          <p>個人封面：{heroImageUrl ? '已上傳' : '未提供'}</p>
          <p>活動照片：{galleryUrls.length ? `${galleryUrls.length} 張` : '未提供'}</p>
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
