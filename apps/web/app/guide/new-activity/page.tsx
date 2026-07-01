'use client';

import { useState } from 'react';
import Link from 'next/link';
import { REGION_REGISTRY } from '../../../src/lib/region-slugs.mjs';

// 全台 18 縣市，以 region-slugs.mjs 的 REGION_REGISTRY 為單一真實來源（過去僅硬編 8 個）。
const REGION_OPTIONS: string[] = Object.values(REGION_REGISTRY).map(r => r.dbValue);
const CATEGORY_OPTIONS = [
  { value: 'mountain', label: '山徑' },
  { value: 'river', label: '野溪' },
  { value: 'culture', label: '文化' },
  { value: 'ecology', label: '生態' },
];

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 14,
  fontWeight: 700,
  color: '#2a2422',
  margin: '0 0 6px',
};
const hintStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 400,
  color: '#8a7f74',
  margin: '2px 0 8px',
};
const fieldStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #ddd2b6',
  borderRadius: 10,
  padding: '11px 13px',
  fontSize: 15,
  color: '#2a2422',
  background: '#fffdf7',
  fontFamily: 'inherit',
};
const groupStyle: React.CSSProperties = { margin: '0 0 20px' };
const reqMark = <span style={{ color: '#c2542e' }}> *</span>;

export default function GuideNewActivityPage() {
  const [title, setTitle] = useState('');
  const [region, setRegion] = useState('');
  // 附加地區（複選）：行程除主要地區外也涵蓋的其他縣市。
  const [additionalRegions, setAdditionalRegions] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [priceTwd, setPriceTwd] = useState('');
  const [durationText, setDurationText] = useState('');
  const [meetingPoint, setMeetingPoint] = useState('');
  const [description, setDescription] = useState('');
  const [noticesRaw, setNoticesRaw] = useState('');
  const [plansRaw, setPlansRaw] = useState('');
  const [socialProofRaw, setSocialProofRaw] = useState('');
  const [faqRaw, setFaqRaw] = useState('');
  const [guideName, setGuideName] = useState('');
  const [guideContactEmail, setGuideContactEmail] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/guide-activity-intake', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title, region,
          regions: additionalRegions.filter((r) => r !== region),
          category, priceTwd, durationText, meetingPoint, description,
          noticesRaw, plansRaw, socialProofRaw, faqRaw, guideName, guideContactEmail,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message || '送出失敗，請稍後再試');
      }
      setDone(true);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : '送出失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <main className="tp-light-page" style={{ minHeight: '70vh' }}>
        <div style={{ maxWidth: 620, margin: '0 auto', padding: '64px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1a2e1f', margin: '0 0 12px' }}>收到你的行程內容了！</h1>
          <p style={{ fontSize: 15, color: '#4a4038', lineHeight: 1.7, margin: '0 0 24px' }}>
            我們會用 AI 把你填的內容整理成完整、吸引旅客的版本，並由團隊審核後上架。
            若有需要補充的地方，會透過你留的聯絡方式與你確認。
          </p>
          <Link href="/" className="tp-btn tp-btn-primary" style={{ display: 'inline-block' }}>
            回到首頁
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="tp-light-page" style={{ minHeight: '70vh' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 16px 72px' }}>
        <header style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, color: '#c2542e', margin: '0 0 8px' }}>MIDAO 祕島｜導遊投稿</p>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#1a2e1f', margin: '0 0 12px' }}>投稿一條新行程</h1>
          <p style={{ fontSize: 15, color: '#4a4038', lineHeight: 1.7, margin: 0 }}>
            只要填最少的資訊，剩下的文案（副標、包含項目、注意事項、逐段行程、FAQ…）交給我們用 AI 補完。
            標 <span style={{ color: '#c2542e' }}>*</span> 為必填，其餘有就填、沒有可留空。
          </p>
        </header>

        {error && (
          <div role="alert" style={{ background: '#fde8e1', border: '1px solid #e8b9a8', color: '#9a3412', borderRadius: 10, padding: '12px 16px', fontSize: 14, marginBottom: 20 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <section style={{ marginBottom: 8 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1a2e1f', margin: '0 0 16px', paddingBottom: 8, borderBottom: '2px solid #ece2c8' }}>第一部分：基本資訊</h2>
          </section>

          <div style={groupStyle}>
            <label htmlFor="f-title" style={labelStyle}>行程名稱{reqMark}</label>
            <span style={hintStyle}>例：柴山秘境之旅｜龍谷、小錐麓、金瓜洞全探索</span>
            <input id="f-title" style={fieldStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="取一個能說出地點與亮點的名字" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={groupStyle}>
              <label htmlFor="f-region" style={labelStyle}>主要地區{reqMark}</label>
              <span style={hintStyle}>行程主要發生的縣市</span>
              <select id="f-region" style={fieldStyle} value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="">請選擇</option>
                {REGION_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={groupStyle}>
              <label htmlFor="f-category" style={labelStyle}>類別{reqMark}</label>
              <span style={hintStyle}>最接近的一種</span>
              <select id="f-category" style={fieldStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">請選擇</option>
                {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          {/* 附加地區（複選）：行程也涵蓋的其他縣市；主要地區決定 URL/SEO，附加地區讓行程在多個地區篩選中出現。 */}
          <div style={groupStyle}>
            <label style={labelStyle}>附加地區（複選）</label>
            <span style={hintStyle}>除主要地區外，這個行程還涵蓋哪些縣市？可不選；主要地區不需重複勾選。</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 6, marginTop: 4 }}>
              {REGION_OPTIONS.filter((r) => r !== region).map((r) => {
                const checked = additionalRegions.includes(r);
                return (
                  <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      value={r}
                      checked={checked}
                      onChange={(e) => {
                        setAdditionalRegions((prev) =>
                          e.target.checked ? [...prev, r] : prev.filter((x) => x !== r),
                        );
                      }}
                    />
                    {r}
                  </label>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={groupStyle}>
              <label htmlFor="f-price" style={labelStyle}>每人售價（TWD）{reqMark}</label>
              <span style={hintStyle}>基礎方案每人價格，例：1800</span>
              <input id="f-price" style={fieldStyle} value={priceTwd} onChange={(e) => setPriceTwd(e.target.value)} inputMode="numeric" placeholder="1800" />
            </div>
            <div style={groupStyle}>
              <label htmlFor="f-duration" style={labelStyle}>行程時長{reqMark}</label>
              <span style={hintStyle}>例：4.5 小時 / 一整天</span>
              <input id="f-duration" style={fieldStyle} value={durationText} onChange={(e) => setDurationText(e.target.value)} placeholder="4.5 小時" />
            </div>
          </div>

          <div style={groupStyle}>
            <label htmlFor="f-meeting" style={labelStyle}>集合地點{reqMark}</label>
            <span style={hintStyle}>旅客看得懂的地標或地址，例：柴山壽山動物園停車場旁（龍門亭入口）</span>
            <input id="f-meeting" style={fieldStyle} value={meetingPoint} onChange={(e) => setMeetingPoint(e.target.value)} placeholder="集合的地標或地址" />
          </div>

          <section style={{ margin: '28px 0 8px' }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1a2e1f', margin: '0 0 16px', paddingBottom: 8, borderBottom: '2px solid #ece2c8' }}>第二部分：行程內容</h2>
          </section>

          <div style={groupStyle}>
            <label htmlFor="f-desc" style={labelStyle}>行程內容描述{reqMark}</label>
            <span style={hintStyle}>白話寫即可，AI 會幫你整理：會去哪些地方、做什麼、沿途特色、有什麼只有跟你才體驗得到的。</span>
            <textarea id="f-desc" style={{ ...fieldStyle, minHeight: 160, resize: 'vertical', lineHeight: 1.6 }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={'例：柴山地形是珊瑚礁石灰岩，很特別。我會帶旅客走三個一般人不知道的秘境：龍谷大峽谷、小錐麓窄道、金瓜洞（我有合法探洞許可）。沿途會遇到獼猴，我會解說怎麼相處，最後登稜線看高雄港全景。'} />
          </div>

          <div style={groupStyle}>
            <label htmlFor="f-notices" style={labelStyle}>注意事項</label>
            <span style={hintStyle}>安全提醒、裝備、身體限制等，一行一點即可（留空 AI 會依行程補）。</span>
            <textarea id="f-notices" style={{ ...fieldStyle, minHeight: 100, resize: 'vertical', lineHeight: 1.6 }} value={noticesRaw} onChange={(e) => setNoticesRaw(e.target.value)} placeholder={'例：\n要穿運動鞋或登山鞋\n自備至少 1 公升水\n有鑽洞路段要能彎腰\n嚴重懼高症請事先告知'} />
          </div>

          <section style={{ margin: '28px 0 8px' }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1a2e1f', margin: '0 0 16px', paddingBottom: 8, borderBottom: '2px solid #ece2c8' }}>第三部分：選填（沒有可留空）</h2>
          </section>

          <div style={groupStyle}>
            <label htmlFor="f-plans" style={labelStyle}>方案說明</label>
            <span style={hintStyle}>若有多種方案，描述各方案名稱、時長、價格、每人或每團計價與差異（留空＝單一方案）。方案送出後於後台「方案管理」維護。</span>
            <textarea id="f-plans" style={{ ...fieldStyle, minHeight: 90, resize: 'vertical', lineHeight: 1.6 }} value={plansRaw} onChange={(e) => setPlansRaw(e.target.value)} placeholder={'例：\nA 半日探秘：4.5 小時、1800 元\nB 全日深度：7 小時、3000 元，含在地午餐＋下午北峰砲台'} />
          </div>

          <div style={groupStyle}>
            <label htmlFor="f-social" style={labelStyle}>旅客好評／口碑</label>
            <span style={hintStyle}>旅客說過讓你印象深刻的話，一行一句。</span>
            <textarea id="f-social" style={{ ...fieldStyle, minHeight: 80, resize: 'vertical', lineHeight: 1.6 }} value={socialProofRaw} onChange={(e) => setSocialProofRaw(e.target.value)} placeholder={'例：\n走小錐麓那段腿有點軟，但景色無敵！\n鑽洞穴那段大人小孩都瘋了'} />
          </div>

          <div style={groupStyle}>
            <label htmlFor="f-faq" style={labelStyle}>常見問答</label>
            <span style={hintStyle}>旅客常問的問題＋你的回答，一組一行。</span>
            <textarea id="f-faq" style={{ ...fieldStyle, minHeight: 80, resize: 'vertical', lineHeight: 1.6 }} value={faqRaw} onChange={(e) => setFaqRaw(e.target.value)} placeholder={'例：\nQ：沒登山經驗可以嗎？ A：可以，有基本體能就行\nQ：小朋友能去嗎？ A：10 歲以上、30 公斤以上可以'} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={groupStyle}>
              <label htmlFor="f-gname" style={labelStyle}>你的稱呼</label>
              <span style={hintStyle}>方便我們對應，例：Andy Lee</span>
              <input id="f-gname" style={fieldStyle} value={guideName} onChange={(e) => setGuideName(e.target.value)} placeholder="你的名字或暱稱" />
            </div>
            <div style={groupStyle}>
              <label htmlFor="f-gmail" style={labelStyle}>聯絡 Email</label>
              <span style={hintStyle}>有問題時我們會聯絡你</span>
              <input id="f-gmail" style={fieldStyle} value={guideContactEmail} onChange={(e) => setGuideContactEmail(e.target.value)} type="email" placeholder="you@example.com" />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="tp-btn tp-btn-primary"
            style={{ width: '100%', marginTop: 12, padding: '14px 20px', fontSize: 16, opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}
          >
            {submitting ? '送出中…' : '送出行程內容'}
          </button>
          <p style={{ fontSize: 12, color: '#8a7f74', textAlign: 'center', margin: '12px 0 0' }}>
            送出後，我們會用 AI 整理成完整版本並由團隊審核上架。
          </p>
        </form>
      </div>
    </main>
  );
}
