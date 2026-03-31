'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, PageHeader, Badge } from '../../../../../src/components/admin/ui';

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

const STATUS_BADGE: Record<string, { variant: 'success' | 'warning' | 'danger' | 'default'; label: string }> = {
  draft:     { variant: 'warning', label: '草稿' },
  published: { variant: 'success', label: '已發佈' },
  archived:  { variant: 'default', label: '已封存' },
};

export default function AdminActivityEditPage() {
  const router = useRouter();
  const params = useParams();
  const activityId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [title, setTitle] = useState('');
  const [guideSlug, setGuideSlug] = useState('');
  const [region, setRegion] = useState('');
  const [category, setCategory] = useState('');
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
  const [status, setStatus] = useState('draft');

  useEffect(() => {
    if (!activityId) return;
    setLoading(true);
    fetch(`/api/admin/activities/${activityId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(json => {
        const d = json.data;
        if (!d) { setError('行程不存在'); setLoading(false); return; }
        setTitle(d.title || '');
        setGuideSlug(d.guideSlug || '');
        setRegion(d.region || '');
        setCategory(d.category || '');
        setPriceTwd(String(d.priceTwd || ''));
        setDurationMinutes(String(d.durationMinutes || ''));
        setMinParticipants(String(d.minParticipants || 1));
        setMaxParticipants(String(d.maxParticipants || 10));
        setMeetingPoint(d.meetingPoint || '');
        setMeetingPointMapUrl(d.meetingPointMapUrl || '');
        setCoverImageUrl(d.coverImageUrl || '');
        setDescription(d.description || '');
        setShortDescription(d.shortDescription || '');
        setTagline(d.tagline || '');
        setInclusions((d.inclusions || []).join('\n'));
        setExclusions((d.exclusions || []).join('\n'));
        setNotices((d.notices || []).join('\n'));
        setRefundRules((d.refundRules || []).join('\n'));
        setStatus(d.status || 'draft');
        setLoading(false);
      })
      .catch(() => { setError('載入失敗'); setLoading(false); });
  }, [activityId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    const toArray = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean);

    try {
      const res = await fetch(`/api/admin/activities/${activityId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          guideSlug: guideSlug || undefined,
          region, category,
          priceTwd: Number(priceTwd),
          durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
          minParticipants: Number(minParticipants) || 1,
          maxParticipants: Number(maxParticipants) || 10,
          meetingPoint, meetingPointMapUrl, coverImageUrl,
          description, shortDescription, tagline,
          inclusions: toArray(inclusions),
          exclusions: toArray(exclusions),
          notices: toArray(notices),
          refundRules: toArray(refundRules),
        }),
      });
      const json = await res.json();
      if (json.ok) setSuccess('✅ 儲存成功');
      else setError(json.error?.message || '更新失敗');
    } catch { setError('網路錯誤'); }
    finally { setSaving(false); }
  }

  async function handleStatusChange(newStatus: string) {
    setStatusBusy(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/admin/activities/${activityId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.ok) {
        setStatus(newStatus);
        setSuccess(`✅ 狀態已更新為「${STATUS_BADGE[newStatus]?.label || newStatus}」`);
      } else {
        setError(json.error?.message || '狀態更新失敗');
      }
    } catch { setError('網路錯誤'); }
    finally { setStatusBusy(false); }
  }

  if (loading) {
    return <><PageHeader title="編輯行程" /><div style={{ padding: 28 }}>載入中⋯</div></>;
  }

  const badge = STATUS_BADGE[status] || { variant: 'default' as const, label: status };

  return (
    <>
      <PageHeader
        title="編輯行程"
        subtitle={title}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Badge variant={badge.variant}>{badge.label}</Badge>
            {status === 'draft' && (
              <button onClick={() => handleStatusChange('published')} disabled={statusBusy}
                style={{ background: '#dcfce7', color: '#166534', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                🚀 發佈
              </button>
            )}
            {status === 'published' && (
              <button onClick={() => handleStatusChange('archived')} disabled={statusBusy}
                style={{ background: '#fee2e2', color: '#991b1b', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                📦 下架
              </button>
            )}
            {status === 'archived' && (
              <button onClick={() => handleStatusChange('draft')} disabled={statusBusy}
                style={{ background: '#dbeafe', color: '#1e40af', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                ✏️ 轉為草稿
              </button>
            )}
          </div>
        }
      />

      <div style={{ padding: '20px 28px', maxWidth: 800 }}>
        {error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>❌ {error}</div>}
        {success && <div style={{ background: '#dcfce7', color: '#166534', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>{success}</div>}

        <Card style={{ padding: 28 }}>
          <form onSubmit={handleSave}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>📝 基本資訊</h3>

            <label style={labelStyle}>
              行程名稱 *
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} style={fieldStyle} required />
            </label>

            <label style={labelStyle}>
              導遊 slug
              <input type="text" value={guideSlug} onChange={e => setGuideSlug(e.target.value)} style={fieldStyle} />
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
                  <option value="">選擇類別</option>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </label>
            </div>

            <label style={labelStyle}>
              Tagline
              <input type="text" value={tagline} onChange={e => setTagline(e.target.value)} style={fieldStyle} />
            </label>

            <label style={labelStyle}>
              短描述
              <textarea value={shortDescription} onChange={e => setShortDescription(e.target.value)} rows={2} style={fieldStyle} />
            </label>

            <label style={labelStyle}>
              完整描述
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5} style={fieldStyle} />
            </label>

            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '24px 0 16px', paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>💰 定價與容量</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <label style={labelStyle}>
                價格/人 (TWD) *
                <input type="number" value={priceTwd} onChange={e => setPriceTwd(e.target.value)} min={0} style={fieldStyle} required />
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
              <input type="number" value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} min={0} style={fieldStyle} />
            </label>

            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '24px 0 16px', paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>📍 集合地點</h3>

            <label style={labelStyle}>
              集合地點
              <input type="text" value={meetingPoint} onChange={e => setMeetingPoint(e.target.value)} style={fieldStyle} />
            </label>
            <label style={labelStyle}>
              地圖 URL
              <input type="url" value={meetingPointMapUrl} onChange={e => setMeetingPointMapUrl(e.target.value)} style={fieldStyle} />
            </label>

            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '24px 0 16px', paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>🖼️ 圖片</h3>

            <label style={labelStyle}>
              封面圖 URL
              <input type="url" value={coverImageUrl} onChange={e => setCoverImageUrl(e.target.value)} style={fieldStyle} />
            </label>
            {coverImageUrl && (
              <div style={{ marginBottom: 16 }}>
                <img src={coverImageUrl} alt="預覽" style={{ maxWidth: 300, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              </div>
            )}

            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '24px 0 16px', paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>📋 行程詳情</h3>

            <label style={labelStyle}>
              包含項目（每行一項）
              <textarea value={inclusions} onChange={e => setInclusions(e.target.value)} rows={4} style={fieldStyle} />
            </label>
            <label style={labelStyle}>
              不包含項目（每行一項）
              <textarea value={exclusions} onChange={e => setExclusions(e.target.value)} rows={3} style={fieldStyle} />
            </label>
            <label style={labelStyle}>
              注意事項（每行一項）
              <textarea value={notices} onChange={e => setNotices(e.target.value)} rows={3} style={fieldStyle} />
            </label>
            <label style={labelStyle}>
              退款規則（每行一項）
              <textarea value={refundRules} onChange={e => setRefundRules(e.target.value)} rows={4} style={fieldStyle} />
            </label>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button type="submit" disabled={saving}
                style={{
                  background: 'var(--tp-primary, #16a34a)', color: '#fff',
                  padding: '12px 28px', borderRadius: 8, border: 'none',
                  fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}>
                {saving ? '儲存中⋯' : '儲存變更'}
              </button>
              <button type="button" onClick={() => router.push('/admin/activities')}
                style={{ background: '#f0f0f0', color: '#333', padding: '12px 28px', borderRadius: 8, border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                返回列表
              </button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
