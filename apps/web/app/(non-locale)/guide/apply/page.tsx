'use client';


import { useState } from 'react';
import Link from 'next/link';
import { listAllDivisions } from '../../../../src/lib/region-slugs.mjs';
import { GUIDE_PAYMENT_OPTIONS } from '../../../../src/lib/guide-payment-options.mjs';
import { compressImage } from '../../../../src/lib/client-image-compress';
// 專長領域同步為平台四大分類（山徑／野溪／文化／生態），與行程卡 badge、
// 主題篩選、活動編輯下拉同源（category-tags.mjs），避免各處標籤漂移。
// 海報上的美食／攝影／親子／在地生活由「其他想帶的旅程類型」自由填寫欄承接。
import { CATEGORY_OPTIONS } from '../../../../src/lib/category-tags.mjs';
// 補充說明留空時的佔位文案與後台／通知信同源（勿在此硬編字面值）。
import { BIO_UNFILLED_PLACEHOLDER } from '../../../../src/lib/guide-application/summary';
// JSON-LD 需要絕對網址；走 SITE_URL 才會跟著自訂網域走（勿硬編網域）。
import { SITE_URL } from '../../../../src/lib/seo/site-metadata';

/* ── 海報四大優點的圖示（inline SVG，線條風，顏色由 CSS 的 stroke 決定）──
   共用 viewBox 32×32；fill/stroke 一律交給 .lp-apply-perk-icon svg 統一設定，
   避免各圖示各自硬編顏色而在深淺背景下失控。 */
function PerkIconProfile() {
  // 個人頁：視窗卡片 + 人像 + 右側資料列
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="3" y="6" width="26" height="20" rx="3" />
      <path d="M3 11.5h26" />
      <circle cx="11.5" cy="17" r="2.8" />
      <path d="M7 23.5c0-2.3 2-3.8 4.5-3.8s4.5 1.5 4.5 3.8" />
      <path d="M20 16.5h5.5M20 20.5h5.5" />
    </svg>
  );
}

function PerkIconRoute() {
  // 在地特色行程：山稜線 + 定位標記
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M2.5 27h27" />
      <path d="M5 27l6-8.5 4.2 5.8" />
      <path d="M13 27l6.2-8.2L25.5 27" />
      <path d="M22 4c2.2 0 4 1.8 4 4 0 2.9-4 7.2-4 7.2S18 10.9 18 8c0-2.2 1.8-4 4-4z" />
      <circle cx="22" cy="8" r="1.4" />
    </svg>
  );
}

function PerkIconPeople() {
  // 更多旅客：三人群像
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="10.5" r="4" />
      <path d="M9 25.5c0-3.9 3.1-7 7-7s7 3.1 7 7" />
      <circle cx="6" cy="13.5" r="2.8" />
      <path d="M1.5 24.5c0-2.6 2-4.7 4.5-4.7" />
      <circle cx="26" cy="13.5" r="2.8" />
      <path d="M30.5 24.5c0-2.6-2-4.7-4.5-4.7" />
    </svg>
  );
}

function PerkIconIncome() {
  // 創造收入：$ + 循環箭頭
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M27 13.5A11.5 11.5 0 0 0 8.8 7.6" />
      <path d="M8.4 3.2v4.6h4.6" />
      <path d="M5 18.5A11.5 11.5 0 0 0 23.2 24.4" />
      <path d="M23.6 28.8v-4.6H19" />
      <path d="M16 9.8v12.4" />
      <path d="M19.3 13.4c0-1.7-1.5-2.7-3.3-2.7s-3.3 1-3.3 2.7c0 3.5 6.6 1.8 6.6 5.3 0 1.7-1.5 2.7-3.3 2.7s-3.3-1-3.3-2.7" />
    </svg>
  );
}

export default function GuideApplyPage() {
  // 單頁流程（招募海報改版）：原三步驟（基本資料／證件與照片／審核送出）合併為一頁，
  // 送出後切到 done 畫面。證件核驗不在公開表單處理，改為審核人員後續聯繫。
  const [done, setDone] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [lineId, setLineId] = useState('');
  const [city, setCity] = useState('');
  const [intro, setIntro] = useState('');
  const [recommendedSpot, setRecommendedSpot] = useState('');
  const [experience, setExperience] = useState('');
  const [otherTripTypes, setOtherTripTypes] = useState('');
  const [contactTime, setContactTime] = useState('');
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
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
    // 先在瀏覽器壓成小張 WebP 再上傳：手機原圖常 3–12MB，會撞到 Vercel function
    // 約 4.5MB 的 request body 上限（FUNCTION_PAYLOAD_TOO_LARGE），導致「上傳失敗」。
    const compressed = await compressImage(file, kind);
    const fd = new FormData();
    fd.append('kind', kind);
    fd.append('file', compressed);
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

  const specialtyOptions = CATEGORY_OPTIONS.map((c) => c.label);
  const languageOptions = ['中文', '英文', '日文', '韓文', '泰文'];
  // 全台地區（含嘉義、屏東等）統一取自平台正規地區清單，與活動地區同源。
  // 熟悉區域：顯示短名（displayName）、儲存全名（dbValue），與行程地區格式一致。
  const regionOptions = listAllDivisions();
  const paymentOptions = GUIDE_PAYMENT_OPTIONS;
  const experienceOptions = ['有', '沒有，但有興趣'];

  // 海報「加入祕島，你可以」四格（圖示比照海報：個人頁卡片／山景定位／人群／收入循環）。
  const perks = [
    { strong: '建立自己的嚮導個人頁', label: '專屬頁面，展現你的特色', icon: <PerkIconProfile /> },
    { strong: '分享自己的在地特色行程', label: '設計行程，自由接案', icon: <PerkIconRoute /> },
    { strong: '接觸更多喜歡深度旅行的旅客', label: '讓更多人看見你的價值', icon: <PerkIconPeople /> },
    { strong: '用自己的專長創造收入', label: '熱愛的事，變成收入來源', icon: <PerkIconIncome /> },
  ];

  // 必填只留聯絡得上人所需的四欄；補充說明與照片一律選填。
  const requiredMissing = !fullName.trim() || !phone.trim() || !email.trim() || !city.trim();

  async function submitApplication() {
    try {
      setSubmitting(true);
      setError('');
      // 海報新增欄位（推薦祕境／帶團經驗／其他旅程類型／LINE ID／方便聯絡時間）
      // 不另開 DB 欄位，統一組進既有 bio，管理者後台讀 bio 即可看到全部補充資訊。
      // 補充說明改選填後，全部留空時 bio 會是空字串，而 createGuideApplicationDb
      // 硬要求 bio 非空 —— 補一句佔位文案，避免「什麼都沒填」被後端當成錯誤擋掉。
      const bio = [
        intro.trim(),
        recommendedSpot.trim() && `推薦祕境／特色體驗：${recommendedSpot.trim()}`,
        experience && `帶團或導覽經驗：${experience}`,
        otherTripTypes.trim() && `其他想帶的旅程類型：${otherTripTypes.trim()}`,
        lineId.trim() && `LINE ID：${lineId.trim()}`,
        contactTime.trim() && `方便聯絡時間：${contactTime.trim()}`,
      ]
        .filter(Boolean)
        .join('\n') || BIO_UNFILLED_PLACEHOLDER;

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
          certs: [],
          payments,
          profilePhotoUrl: profilePhotoUrl || null,
          heroImageUrl: heroImageUrl || null,
          galleryUrls,
        })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json?.error?.message || '申請失敗');
      setDoneId(json.data.id || '');
      setDone(true);
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
      { '@type': 'ListItem', position: 1, name: '首頁', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: '成為嚮導', item: `${SITE_URL}/guide/apply` },
    ],
  };

  return (
    <main className="lp-apply">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      {/* ── Hero（招募海報文案：山墨風標頭） ── */}
      <header className="lp-apply-hero">
        <nav className="lp-apply-breadcrumb" aria-label="麵包屑">
          <Link href="/">首頁</Link> <span aria-hidden>›</span> 成為嚮導
        </nav>
        <p className="lp-apply-eyebrow">BECOME A GUIDE・找到真正懂路的人，帶你走進台灣</p>
        <h1 className="lp-apply-title">在地嚮導招募中！</h1>
        <p className="lp-apply-lead">
          你熟悉一個地方，知道一般旅客找不到的風景、故事、美食或文化嗎？
          我們正在尋找熱愛分享在地生活的人，一起帶更多旅客認識真正的台灣。
        </p>
        <p className="lp-apply-quote">你的在地故事，就是旅人的祕境指南。</p>
      </header>

      <div className="lp-apply-body">
        {!done && (
          <section className="lp-apply-card">
            <h2 className="lp-apply-section-title">請填寫以下資訊</h2>
            <p className="lp-apply-hint">
              只有一頁、大約三分鐘。標記 <strong>*</strong> 為必填，其餘都可以選填——
              先留下聯絡方式就好，其他的我們聯繫時再一起聊。
            </p>

            <label className="lp-apply-field" htmlFor="apply-fullname"><span>姓名*</span><input id="apply-fullname" value={fullName} onChange={(e) => setFullName(e.target.value)} required aria-required="true" /></label>
            <label className="lp-apply-field" htmlFor="apply-phone"><span>聯絡電話*</span><input id="apply-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required aria-required="true" autoComplete="tel" /></label>
            <label className="lp-apply-field" htmlFor="apply-email"><span>電子信箱*</span><input id="apply-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required aria-required="true" autoComplete="email" /></label>
            <label className="lp-apply-field" htmlFor="apply-line"><span>LINE ID（選填）</span><input id="apply-line" value={lineId} onChange={(e) => setLineId(e.target.value)} placeholder="方便我們用 LINE 與你聯繫" /></label>
            <label className="lp-apply-field" htmlFor="apply-city"><span>居住縣市*</span><input id="apply-city" placeholder="例如：高雄市" value={city} onChange={(e) => setCity(e.target.value)} required aria-required="true" /></label>

            <div>
              <p className="lp-apply-group-label">熟悉的地區／區域（選填，可複選）</p>
              <p className="lp-apply-hint">例如：阿里山、墾丁、台南中西區、東港、小琉球、大武山…先勾選所屬縣市即可，細節可寫在下方欄位。</p>
              <div className="lp-apply-chips">
                {regionOptions.map((d) => (
                  <label key={d.dbValue} className="lp-apply-chip">
                    <input
                      type="checkbox"
                      checked={regions.includes(d.dbValue)}
                      onChange={() => toggleList(d.dbValue, regions, setRegions)}
                    />
                    {d.displayName}
                  </label>
                ))}
              </div>
            </div>

            <label className="lp-apply-field" htmlFor="apply-spot">
              <span>你最推薦的祕境或特色體驗（選填）</span>
              <textarea id="apply-spot" rows={2} value={recommendedSpot} onChange={(e) => setRecommendedSpot(e.target.value)} placeholder="例如：柴山裡少有人知的石灰岩洞、只有在地人會走的溪谷路線…" />
            </label>

            <div>
              <p className="lp-apply-group-label">是否曾帶團或導覽？（選填）</p>
              <div className="lp-apply-chips">
                {experienceOptions.map((item) => (
                  <label key={item} className="lp-apply-chip">
                    <input
                      type="radio"
                      name="apply-experience"
                      checked={experience === item}
                      onChange={() => setExperience(item)}
                    />
                    {item}
                  </label>
                ))}
              </div>
              <p className="lp-apply-hint">沒帶過也沒關係，我們會協助你把想法變成可以上架的行程。</p>
            </div>

            <div>
              <p className="lp-apply-group-label">想帶哪些類型的旅程？（選填，可複選）</p>
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
              <label className="lp-apply-field" htmlFor="apply-other-trip" style={{ marginTop: 12 }}>
                <span>其他想帶的旅程類型（選填）</span>
                <input id="apply-other-trip" value={otherTripTypes} onChange={(e) => setOtherTripTypes(e.target.value)} placeholder="例如：美食、攝影、親子、在地生活…" />
              </label>
            </div>

            <div>
              <p className="lp-apply-group-label">可帶語言（選填，可複選）</p>
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
              <p className="lp-apply-group-label">希望的收款方式（選填，可複選）</p>
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

            <label className="lp-apply-field" htmlFor="apply-contact-time">
              <span>方便聯絡時間（選填）</span>
              <input id="apply-contact-time" value={contactTime} onChange={(e) => setContactTime(e.target.value)} placeholder="例如：平日晚上 7 點後、週末全天" />
            </label>

            <label className="lp-apply-field" htmlFor="apply-bio">
              <span>其他想分享的內容（選填）</span>
              <textarea id="apply-bio" rows={4} value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="自我介紹／特長／想帶旅客體驗的亮點…" />
            </label>

            {/* ── 照片：全部選填（個人照／封面／活動照） ── */}
            <div>
              <h3 className="lp-apply-group-label" style={{ fontSize: 15 }}>照片（全部選填）</h3>
              <p className="lp-apply-hint">
                現在不方便準備也沒問題，之後都能在「嚮導後台 → 個人檔案」隨時補上或更換。
                為保護你的個人資料，請勿在表單中提供證件影本。
              </p>

              <div style={{ display: 'grid', gap: 22, marginTop: 12 }}>
                <div>
                  <p className="lp-apply-group-label">個人照（選填）</p>
                  <p className="lp-apply-hint">清晰的個人正面照，通過申請後會成為你的嚮導頭像（JPG／PNG／WebP）。</p>
                  {profilePhotoUrl && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img data-testid="apply-avatar-preview" src={profilePhotoUrl} alt="個人照預覽" style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(176,141,62,0.5)' }} />
                      <button type="button" className="lp-apply-btn lp-apply-btn-ghost" onClick={() => setProfilePhotoUrl('')}>移除</button>
                    </div>
                  )}
                  <input
                    className="lp-apply-file"
                    id="apply-photo-avatar"
                    type="file"
                    accept={PHOTO_ACCEPT}
                    aria-label="上傳個人照"
                    disabled={uploadingKind !== ''}
                    onChange={(e) => { void handlePhotoChange('avatar', e.target.files); e.target.value = ''; }}
                  />
                </div>

                <div>
                  <p className="lp-apply-group-label">個人封面（選填）</p>
                  <p className="lp-apply-hint">嚮導頁頂部的橫幅照片，建議 16:9 橫式構圖。</p>
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
                  <p className="lp-apply-group-label">活動照（選填，最多 {GALLERY_MAX} 張）</p>
                  <p className="lp-apply-hint">過往帶團或活動的照片，幫助我們與旅客認識你的風格。</p>
                  {galleryUrls.length > 0 && (
                    <div data-testid="apply-gallery-preview" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '8px 0' }}>
                      {galleryUrls.map((url, i) => (
                        <div key={url} style={{ position: 'relative' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`活動照 ${i + 1}`} style={{ width: 96, height: 64, borderRadius: 6, objectFit: 'cover', border: '1px solid rgba(190,178,137,0.4)' }} />
                          <button
                            type="button"
                            aria-label={`移除活動照 ${i + 1}`}
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
                    aria-label="上傳活動照"
                    disabled={uploadingKind !== '' || galleryUrls.length >= GALLERY_MAX}
                    onChange={(e) => { void handlePhotoChange('gallery', e.target.files); e.target.value = ''; }}
                  />
                </div>
              </div>

              {uploadingKind && <p className="lp-apply-hint" style={{ marginTop: 4 }}>照片上傳中…</p>}
              {uploadError && <p style={{ color: '#f0a3a3', margin: '4px 0 0' }}>⚠️ {uploadError}</p>}
            </div>

            <div className="lp-apply-note">
              <p style={{ margin: 0 }}>
                送出後我們會以 Email 或電話與你聯繫，一起確認你想帶的行程內容並完成審核，
                通常在 3–5 個工作天內。這一頁不需要準備任何證件。
              </p>
            </div>

            {error && <p style={{ color: '#f0a3a3', margin: 0 }}>⚠️ {error}</p>}
            {requiredMissing && (
              <p className="lp-apply-hint" style={{ margin: 0 }}>請先填寫姓名、聯絡電話、電子信箱與居住縣市。</p>
            )}

            <div className="lp-apply-actions">
              <button
                className="lp-apply-btn lp-apply-btn-primary"
                disabled={submitting || requiredMissing || uploadingKind !== ''}
                onClick={submitApplication}
              >
                {submitting ? '送出中…' : '送出申請'}
              </button>
            </div>
          </section>
        )}

        {done && (
          <section className="lp-apply-card lp-apply-success">
            <div className="lp-apply-check" aria-hidden>✅</div>
            <h2>申請已送出</h2>
            <p className="lp-apply-hint">申請編號：{doneId || '—'}</p>
            <p className="lp-apply-hint">我們會以 Email 或電話與你聯繫，通常在 3–5 個工作天內。</p>
            <div className="lp-apply-actions" style={{ justifyContent: 'center' }}>
              <Link href="/" className="lp-apply-btn lp-apply-btn-primary">回到首頁</Link>
            </div>
          </section>
        )}

        {/* ── 海報「加入祕島，你可以」 ── */}
        <section className="lp-apply-perks-block" aria-labelledby="apply-perks-title">
          <h2 id="apply-perks-title" className="lp-apply-section-title">加入祕島，你可以</h2>
          <div className="lp-apply-perks">
            {perks.map((perk) => (
              <div key={perk.strong} className="lp-apply-perk lp-apply-perk-iconed">
                <span className="lp-apply-perk-icon">{perk.icon}</span>
                <strong>{perk.strong}</strong>
                <span>{perk.label}</span>
              </div>
            ))}
          </div>
          <p className="lp-apply-outro">
            如果你身邊有很會帶路、很懂地方故事的朋友，也歡迎幫忙分享或標記他，一起加入祕島！
          </p>
        </section>
      </div>
    </main>
  );
}
