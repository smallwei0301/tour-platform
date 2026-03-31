'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, PageHeader } from '../../../../src/components/admin/ui';

type Guide = { id: string; slug: string; displayName: string };

const REGIONS = ['台北市', '高雄市', '花蓮縣', '台南市', '台中市', '南投縣', '宜蘭縣', '屏東縣'];
const CATEGORIES = [
  { value: 'outdoor', label: '戶外冒險' },
  { value: 'culture', label: '文化歷史' },
  { value: 'food', label: '美食體驗' },
  { value: 'nature', label: '自然生態' },
];

const fieldStyle: React.CSSProperties = {
  display: 'block', width: '100%', padding: '10px 12px',
  border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, marginTop: 4,
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 16,
};

export default function AdminActivityNewPage() {
  const router = useRouter();
  const [guides, setGuides] = useState<Guide[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [title, setTitle] = useState('');
  const [guideSlug, setGuideSlug] = useState('');
  const [region, setRegion] = useState('');
  const [category, setCategory] = useState('outdoor');
  const [priceTwd, setPriceTwd] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [minParticipants, setMinParticipants] = useState('1');
  const [maxParticipants, setMaxParticipants] = useState('10');
  const [meetingPoint, setMeetingPoint] = useState('');
  const [meetingPointMapUrl, setMeetingPointMapUrl] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [tagline, setTagline] = useState('');
  const [inclusions, setInclusions] = useState('');
  const [exclusions, setExclusions] = useState('');
  const [notices, setNotices] = useState('');
  const [refundRules, setRefundRules] = useState('');

  useEffect(() => {
    fetch('/api/admin/activities?_guides=1')
      .catch(() => null);
    // Load guides list
    fetch('/api/admin/activities')
      .then(r => r.json())
      .then(() => {
        // We need a separate guides endpoint; for now, use the guide-applications or hardcode
      })
      .catch(() => {});
    // Fetch guide list from a simple approach
    fetchGuides();
  }, []);

  async function fetchGuides() {
    try {
      const res = await fetch('/api/admin/guide-applications?status=approved');
      const json = await res.json();
      // If guide applications returns data, map it
      if (json.data?.length > 0) {
        setGuides(json.data.map((g: any) => ({
          id: g.id, slug: g.fullName?.toLowerCase().replace(/\s+/g, '-') || g.id,
          displayName: g.fullName || 'Unknown'
        })));
      }
    } catch {
      // Fallback: we'll just allow manual slug entry
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('行程名稱為必填'); return; }
    if (!priceTwd || Number(priceTwd) <= 0) { setError('價格必須大於 0'); return; }

    setSaving(true);
    setError('');

    const toArray = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean);

    try {
      const res = await fetch('/api/admin/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          guideSlug: guideSlug || undefined,
          region,
          category,
          priceTwd: Number(priceTwd),
          durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
          minParticipants: Number(minParticipants) || 1,
          maxParticipants: Number(maxParticipants) || 10,
          meetingPoint: meetingPoint || undefined,
          meetingPointMapUrl: meetingPointMapUrl || undefined,
          coverImageUrl: coverImageUrl || undefined,
          description: description || undefined,
          shortDescription: shortDescription || undefined,
          tagline: tagline || undefined,
          inclusions: toArray(inclusions),
          exclusions: toArray(exclusions),
          notices: toArray(notices),
          refundRules: toArray(refundRules),
        }),
      });
      const json = await res.json();
      if (json.ok) {
        router.push('/admin/activities');
      } else {
        setError(json.error?.message || '建立失敗');
      }
    } catch (err) {
      setError('網路錯誤');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="新增行程" subtitle="建立新的活動行程（預設為草稿狀態）" />

      <div style={{ padding: '20px 28px', maxWidth: 800 }}>
        <Card style={{ padding: 28 }}>
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
                ❌ {error}
              </div>
            )}

            {/* 基本資訊 */}
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>📝 基本資訊</h3>

            <label style={labelStyle}>
              行程名稱 *
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="例：高雄柴山探洞體驗" style={fieldStyle} required />
            </label>

            <label style={labelStyle}>
              導遊 slug
              <input type="text" value={guideSlug} onChange={e => setGuideSlug(e.target.value)} placeholder="例：andy-lee" style={fieldStyle} />
              <span style={{ fontSize: 12, color: '#888' }}>輸入導遊的 slug（例如 andy-lee）</span>
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <label style={labelStyle}>
                地區
                <select value={region} onChange={e => setRegion(e.target.value)} style={fieldStyle}>
                  <option value="">選擇地區</option>
                  {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                類別
                <select value={category} onChange={e => setCategory(e.target.value)} style={fieldStyle}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </label>
            </div>

            <label style={labelStyle}>
              一句話描述（tagline）
              <input type="text" value={tagline} onChange={e => setTagline(e.target.value)} placeholder="行程的亮點一句話" style={fieldStyle} />
            </label>

            <label style={labelStyle}>
              短描述
              <textarea value={shortDescription} onChange={e => setShortDescription(e.target.value)} placeholder="2-3 句說明行程特色" rows={2} style={fieldStyle} />
            </label>

            <label style={labelStyle}>
              完整描述
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="完整的行程介紹" rows={5} style={fieldStyle} />
            </label>

            {/* 定價與容量 */}
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '24px 0 16px', paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>💰 定價與容量</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <label style={labelStyle}>
                價格/人 (TWD) *
                <input type="number" value={priceTwd} onChange={e => setPriceTwd(e.target.value)} placeholder="2000" min={0} style={fieldStyle} required />
              </label>
              <label style={labelStyle}>
                最少人數
                <input type="number" value={minParticipants} onChange={e => setMinParticipants(e.target.value)} min={1} style={fieldStyle} />
              </label>
              <label style={labelStyle}>
                最多人數
                <input type="number" value={maxParticipants} onChange={e => setMaxParticipants(e.target.value)} min={1} style={fieldStyle} />
              </label>
            </div>

            <label style={labelStyle}>
              行程時長（分鐘）
              <input type="number" value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} placeholder="240" min={0} style={fieldStyle} />
            </label>

            {/* 集合地點 */}
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '24px 0 16px', paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>📍 集合地點</h3>

            <label style={labelStyle}>
              集合地點
              <input type="text" value={meetingPoint} onChange={e => setMeetingPoint(e.target.value)} placeholder="壽山國家自然公園遊客中心停車場" style={fieldStyle} />
            </label>
            <label style={labelStyle}>
              地圖連結 (URL)
              <input type="url" value={meetingPointMapUrl} onChange={e => setMeetingPointMapUrl(e.target.value)} placeholder="https://maps.google.com/..." style={fieldStyle} />
            </label>

            {/* 圖片 */}
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '24px 0 16px', paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>🖼️ 圖片</h3>

            <label style={labelStyle}>
              封面圖 URL
              <input type="url" value={coverImageUrl} onChange={e => setCoverImageUrl(e.target.value)} placeholder="https://..." style={fieldStyle} />
            </label>

            {/* 行程詳情 */}
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '24px 0 16px', paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>📋 行程詳情</h3>

            <label style={labelStyle}>
              包含項目（每行一項）
              <textarea value={inclusions} onChange={e => setInclusions(e.target.value)} placeholder="導覽服務&#10;基本裝備&#10;活動紀錄照" rows={4} style={fieldStyle} />
            </label>

            <label style={labelStyle}>
              不包含項目（每行一項）
              <textarea value={exclusions} onChange={e => setExclusions(e.target.value)} placeholder="個人保險&#10;個人交通費" rows={3} style={fieldStyle} />
            </label>

            <label style={labelStyle}>
              注意事項（每行一項）
              <textarea value={notices} onChange={e => setNotices(e.target.value)} placeholder="請穿著適合活動的服裝&#10;請依現場導遊指示行動" rows={3} style={fieldStyle} />
            </label>

            <label style={labelStyle}>
              退款規則（每行一項）
              <textarea value={refundRules} onChange={e => setRefundRules(e.target.value)} placeholder="活動 7 天前取消：100% 退款&#10;活動 24 小時內取消：不退款" rows={4} style={fieldStyle} />
            </label>

            {/* Submit */}
            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  background: 'var(--tp-primary, #16a34a)', color: '#fff',
                  padding: '12px 28px', borderRadius: 8, border: 'none',
                  fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? '建立中⋯' : '建立行程（草稿）'}
              </button>
              <button
                type="button"
                onClick={() => router.push('/admin/activities')}
                style={{
                  background: '#f0f0f0', color: '#333',
                  padding: '12px 28px', borderRadius: 8, border: 'none',
                  fontWeight: 600, fontSize: 14, cursor: 'pointer',
                }}
              >
                取消
              </button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
