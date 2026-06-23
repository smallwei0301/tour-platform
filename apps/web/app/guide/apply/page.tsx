'use client';

import { useState } from 'react';
import Link from 'next/link';
import { listRegionOptions } from '../../../src/lib/region-slugs.mjs';
import { GUIDE_PAYMENT_OPTIONS } from '../../../src/lib/guide-payment-options.mjs';

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
  const [payments, setPayments] = useState<string[]>(['bank']);
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
  // 全台地區（含嘉義、屏東等）統一取自平台正規地區清單，與活動地區同源。
  const regionOptions = listRegionOptions().map((r) => r.displayName);
  const certOptions = ['急救證照', '登山證照', '潛水證照', '導遊證', '領隊證'];
  const paymentOptions = GUIDE_PAYMENT_OPTIONS;

  const perks = [
    { strong: '導遊實拿 85%', label: '平台抽成 15%' },
    { strong: '金流手續費', label: '平台吸收' },
    { strong: '後台一站式', label: '行程與訂單管理' },
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
          payments,
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

  const steps = ['基本資料', '證件與照片', '審核送出'];

  return (
    <main className="lp-apply">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      {/* ── Hero（山墨風招募標頭，沿用首頁視覺語言） ── */}
      <header className="lp-apply-hero">
        <nav className="lp-apply-breadcrumb" aria-label="麵包屑">
          <Link href="/">首頁</Link> <span aria-hidden>›</span> 成為導遊
        </nav>
        <p className="lp-apply-eyebrow">BECOME A GUIDE・在地嚮導招募</p>
        <h1 className="lp-apply-title">成為我們的導遊</h1>
        <p className="lp-apply-lead">
          把你最熟悉的山徑、海岸、巷弄與故事，分享給遠道而來的旅人。
          通過審核後即可在祕島上架行程，與旅客真實相遇。
        </p>
        <div className="lp-apply-perks">
          {perks.map((perk) => (
            <div key={perk.strong} className="lp-apply-perk">
              <strong>{perk.strong}</strong>
              <span>{perk.label}</span>
            </div>
          ))}
        </div>
      </header>

      <div className="lp-apply-body">
        {/* ── 步驟指示 ── */}
        <ol className="lp-apply-steps" aria-label="申請步驟">
          {steps.map((label, i) => {
            const n = i + 1;
            return (
              <li
                key={label}
                className={step >= n ? 'active' : ''}
                aria-current={step === n ? 'step' : undefined}
              >
                <span className="lp-apply-step-num">{n}</span>
                <span>{label}</span>
              </li>
            );
          })}
        </ol>

        {step === 1 && (
          <section className="lp-apply-card">
            <label className="lp-apply-field" htmlFor="apply-fullname"><span>姓名*</span><input id="apply-fullname" value={fullName} onChange={(e) => setFullName(e.target.value)} required aria-required="true" /></label>
            <label className="lp-apply-field" htmlFor="apply-phone"><span>電話*</span><input id="apply-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required aria-required="true" autoComplete="tel" /></label>
            <label className="lp-apply-field" htmlFor="apply-email"><span>電子信箱*</span><input id="apply-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required aria-required="true" autoComplete="email" /></label>
            <label className="lp-apply-field" htmlFor="apply-city"><span>所在縣市*</span><input id="apply-city" placeholder="例如：高雄市" value={city} onChange={(e) => setCity(e.target.value)} required aria-required="true" /></label>
            <label className="lp-apply-field" htmlFor="apply-bio"><span>自我介紹*</span><textarea id="apply-bio" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} required aria-required="true" /></label>

            <div>
              <p className="lp-apply-group-label">專長領域*</p>
              <div className="lp-apply-chips">
                {specialtyOptions.map((item) => (
                  <label key={item} className="lp-apply-chip">
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
              <p className="lp-apply-group-label">可帶語言*</p>
              <div className="lp-apply-chips">
                {languageOptions.map((item) => (
                  <label key={item} className="lp-apply-chip">
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
              <p className="lp-apply-group-label">熟悉區域*</p>
              <div className="lp-apply-chips">
                {regionOptions.map((item) => (
                  <label key={item} className="lp-apply-chip">
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
              <p className="lp-apply-group-label">相關證照</p>
              <div className="lp-apply-chips">
                {certOptions.map((item) => (
                  <label key={item} className="lp-apply-chip">
                    <input
                      type="checkbox"
                      checked={certs.includes(item)}
                      onChange={() => toggleList(item, certs, setCerts)}
                    />
                    {item}
                  </label>
                ))}
                <input
                  className="lp-apply-inline-input"
                  placeholder="其他證照"
                  value={otherCert}
                  onChange={(e) => setOtherCert(e.target.value)}
                />
              </div>
            </div>

            <div>
              <p className="lp-apply-group-label">收款方式*（可複選）</p>
              <div className="lp-apply-chips">
                {paymentOptions.map((option) => (
                  <label key={option.id} className="lp-apply-chip">
                    <input
                      type="checkbox"
                      checked={payments.includes(option.id)}
                      onChange={() => toggleList(option.id, payments, setPayments)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="lp-apply-actions">
              <button className="lp-apply-btn lp-apply-btn-primary" onClick={() => setStep(2)}>下一步：證件與照片</button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="lp-apply-card">
            {/* 證件屬敏感個資，不在公開表單收檔案（人工核驗）；
                照片在此真上傳（/api/guide-applications/upload），
                申請通過上線時自動帶入導遊檔案。 */}
            <h2>證件與照片</h2>
            <div className="lp-apply-note">
              <p style={{ margin: 0, fontWeight: 700 }}><strong>身分證件核驗</strong></p>
              <p style={{ margin: '4px 0 0' }}>送出申請後，審核人員將以您留下的 Email／電話與您聯繫，進行身分證件與證照核驗。請勿在表單中提供證件影本。</p>
            </div>

            <div style={{ display: 'grid', gap: 22 }}>
              <div>
                <p className="lp-apply-group-label">個人照片*（必填）</p>
                <p className="lp-apply-hint">
                  審核人員與旅客都會看到這張照片，請使用清晰的個人正面照（JPG／PNG／WebP，5MB 以內）。
                  申請通過上線後會自動成為您的導遊頭像，之後可在「導遊後台 → 個人檔案」隨時更換。
                </p>
                {profilePhotoUrl && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img data-testid="apply-avatar-preview" src={profilePhotoUrl} alt="個人照片預覽" style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(176,141,62,0.5)' }} />
                    <button type="button" className="lp-apply-btn lp-apply-btn-ghost" onClick={() => setProfilePhotoUrl('')}>移除</button>
                  </div>
                )}
                <input
                  className="lp-apply-file"
                  id="apply-photo-avatar"
                  type="file"
                  accept={PHOTO_ACCEPT}
                  aria-label="上傳個人照片"
                  disabled={uploadingKind !== ''}
                  onChange={(e) => { void handlePhotoChange('avatar', e.target.files); e.target.value = ''; }}
                />
              </div>

              <div>
                <p className="lp-apply-group-label">個人封面（選填）</p>
                <p className="lp-apply-hint">導遊頁頂部的橫幅照片，建議 16:9 橫式構圖（10MB 以內）。</p>
                {heroImageUrl && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img data-testid="apply-hero-preview" src={heroImageUrl} alt="個人封面預覽" style={{ width: 200, height: 112, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(190,178,137,0.4)' }} />
                    <button type="button" className="lp-apply-btn lp-apply-btn-ghost" onClick={() => setHeroImageUrl('')}>移除</button>
                  </div>
                )}
                <input
                  className="lp-apply-file"
                  id="apply-photo-hero"
                  type="file"
                  accept={PHOTO_ACCEPT}
                  aria-label="上傳個人封面"
                  disabled={uploadingKind !== ''}
                  onChange={(e) => { void handlePhotoChange('hero', e.target.files); e.target.value = ''; }}
                />
              </div>

              <div>
                <p className="lp-apply-group-label">活動照片（選填，最多 {GALLERY_MAX} 張）</p>
                <p className="lp-apply-hint">過往帶團或活動的照片，幫助審核人員與旅客認識您的服務（每張 5MB 以內）。</p>
                {galleryUrls.length > 0 && (
                  <div data-testid="apply-gallery-preview" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '8px 0' }}>
                    {galleryUrls.map((url, i) => (
                      <div key={url} style={{ position: 'relative' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`活動照片 ${i + 1}`} style={{ width: 96, height: 64, borderRadius: 6, objectFit: 'cover', border: '1px solid rgba(190,178,137,0.4)' }} />
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
                  className="lp-apply-file"
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

            {uploadingKind && <p className="lp-apply-hint" style={{ marginTop: 4 }}>照片上傳中…</p>}
            {uploadError && <p style={{ color: '#f0a3a3', margin: '4px 0 0' }}>⚠️ {uploadError}</p>}
            {!profilePhotoUrl && (
              <p style={{ color: '#e0c478', fontSize: 13, margin: '4px 0 0' }}>請先上傳個人照片，才能進入下一步。</p>
            )}

            <div className="lp-apply-actions">
              <button className="lp-apply-btn lp-apply-btn-ghost" onClick={() => setStep(1)}>上一步</button>
              <button
                className="lp-apply-btn lp-apply-btn-primary"
                disabled={!profilePhotoUrl || uploadingKind !== ''}
                onClick={() => setStep(3)}
              >
                下一步：審核送出
              </button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="lp-apply-card">
            <h2>申請資料確認</h2>
            <div className="lp-apply-summary">
              <p>姓名：{fullName || '—'}</p>
              <p>Email：{email || '—'}</p>
              <p>城市：{city || '—'}</p>
              <p>專長：{specialties.length ? specialties.join('、') : '—'}</p>
              <p>語言：{languages.length ? languages.join('、') : '—'}</p>
              <p>區域：{regions.length ? regions.join('、') : '—'}</p>
              <p>證照：{[...certs, otherCert].filter(Boolean).length ? [...certs, otherCert].filter(Boolean).join('、') : '—'}</p>
              <p>收款方式：{payments.length ? payments.map((id) => paymentOptions.find((item) => item.id === id)?.label || id).join('、') : '—'}</p>
              <div className="lp-apply-summary-photo">
                <span>個人照片：</span>
                {profilePhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profilePhotoUrl} alt="個人照片" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} />
                ) : '—'}
              </div>
              <p>個人封面：{heroImageUrl ? '已上傳' : '未提供'}</p>
              <p>活動照片：{galleryUrls.length ? `${galleryUrls.length} 張` : '未提供'}</p>
            </div>
            {error && <p style={{ color: '#f0a3a3', margin: 0 }}>⚠️ {error}</p>}
            <div className="lp-apply-actions">
              <button className="lp-apply-btn lp-apply-btn-ghost" onClick={() => setStep(2)}>返回修改</button>
              <button className="lp-apply-btn lp-apply-btn-primary" disabled={submitting} onClick={submitApplication}>{submitting ? '送出中…' : '送出申請'}</button>
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="lp-apply-card lp-apply-success">
            <div className="lp-apply-check" aria-hidden>✅</div>
            <h2>申請已送出</h2>
            <p className="lp-apply-hint">申請編號：{doneId || '—'}</p>
            <p className="lp-apply-hint">審核結果將以 Email 通知，我們將在 3–5 個工作天內與您聯繫。</p>
            <div className="lp-apply-actions" style={{ justifyContent: 'center' }}>
              <Link href="/" className="lp-apply-btn lp-apply-btn-primary">回到首頁</Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
