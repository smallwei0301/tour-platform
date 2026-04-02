'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, PageHeader, Badge } from '../../../../../src/components/admin/ui';
import { GuideSearch } from '../../../../../src/components/admin/GuideSearch';
import { ImageUpload } from '../../../../../src/components/admin/ImageUpload';

// ── 方案型別 ──────────────────────────────────────────────
interface PlanConfig {
  id: string;
  label: string;
  duration: string;
  priceMultiplier: number;
  price?: number;
  highlights: string[];
  detailsLinkText: string;
  bookingBtnText: string;
  // 方案詳情
  language?: string;
  earliestDeparture?: string;
  confirmByDays?: number;
  freeCancelDays?: number;
  planInclusions?: string[];
  planExclusions?: string[];
  planItinerary?: Array<{ text: string; imageUrl?: string }>;
  meetingPointName?: string;
  meetingAddress?: string;
  experiencePointName?: string;
  experienceAddress?: string;
  planNotices?: string[];
  planRefundRules?: string[];
}

const DEFAULT_PLANS: PlanConfig[] = [
  {
    id: 'half-day',
    label: 'A. 半日行程',
    duration: '約 4 小時',
    priceMultiplier: 1,
    highlights: ['最早出發前 1 天可預訂', '免費取消（72 小時前）', '實名認證導遊帶領', '電子憑證，出發前確認即可'],
    detailsLinkText: '查看方案詳情 ›',
    bookingBtnText: '立即預約',
  },
  {
    id: 'full-day',
    label: 'B. 全日行程',
    duration: '約 8 小時',
    priceMultiplier: 1.6,
    highlights: ['午餐含餐（在地餐廳）', '免費取消（72 小時前）', '實名認證導遊帶領', '電子憑證，出發前確認即可'],
    detailsLinkText: '查看方案詳情 ›',
    bookingBtnText: '立即預約',
  },
];

// ── 行程項目圖片上傳（輕量版，不需拖放） ────────────────
function ItineraryImageUpload({ activityId, activitySlug, onUploaded }: {
  activityId: string; activitySlug: string; onUploaded: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file) return;
    setUploading(true); setErr('');
    try {
      // 壓縮
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve(); img.onerror = reject; img.src = objectUrl;
      });
      URL.revokeObjectURL(objectUrl);
      const MAX = 1200;
      let { width, height } = img;
      if (width > MAX) { height = Math.round(height * MAX / width); width = MAX; }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/webp', 0.85));
      if (!blob) throw new Error('壓縮失敗');
      const compressed = new File([blob], 'itinerary.webp', { type: 'image/webp' });

      const fd = new FormData();
      fd.append('file', compressed);
      fd.append('slug', activitySlug || activityId);
      fd.append('type', 'gallery');
      const res = await fetch(`/api/admin/activities/${activityId}/upload-image`, { method: 'POST', body: fd });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || '上傳失敗');
      onUploaded(json.data.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '上傳失敗');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ marginTop: 6 }}>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
        style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, background: '#eff6ff', color: '#2563eb',
          border: '1px dashed #93c5fd', cursor: uploading ? 'not-allowed' : 'pointer' }}>
        {uploading ? '上傳中⋯' : '📷 上傳圖片（選填）'}
      </button>
      {err && <span style={{ fontSize: 12, color: '#dc2626', marginLeft: 8 }}>{err}</span>}
    </div>
  );
}

// ── 單一方案編輯 ──────────────────────────────────────────
function PlanEditor({
  plan,
  index,
  onChange,
  onRemove,
  activityId,
  activitySlug,
}: {
  plan: PlanConfig;
  index: number;
  onChange: (updated: PlanConfig) => void;
  onRemove: () => void;
  activityId: string;
  activitySlug: string;
}) {
  const update = (patch: Partial<PlanConfig>) => onChange({ ...plan, ...patch });

  return (
    <div style={{
      border: '1px solid #e5e7eb', borderRadius: 10, padding: 20, marginBottom: 16,
      background: '#fafafa',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>方案 {index + 1}</span>
        <button
          type="button"
          onClick={onRemove}
          style={{
            background: '#fee2e2', color: '#991b1b', border: 'none',
            padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          刪除方案
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={labelStyle}>
          方案 ID（唯一識別，英文）
          <input
            type="text" value={plan.id}
            onChange={e => update({ id: e.target.value })}
            style={fieldStyle} placeholder="half-day"
          />
        </label>
        <label style={labelStyle}>
          方案名稱
          <input
            type="text" value={plan.label}
            onChange={e => update({ label: e.target.value })}
            style={fieldStyle} placeholder="A. 半日行程"
          />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={labelStyle}>
          時長文字
          <input
            type="text" value={plan.duration}
            onChange={e => update({ duration: e.target.value })}
            style={fieldStyle} placeholder="約 4 小時"
          />
        </label>
        <label style={labelStyle}>
          價格倍數（相對基礎價格）
          <input
            type="number" value={plan.priceMultiplier}
            onChange={e => update({ priceMultiplier: parseFloat(e.target.value) || 1 })}
            min={0.1} step={0.1} style={fieldStyle}
          />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={labelStyle}>
          「查看詳情」連結文字
          <input
            type="text" value={plan.detailsLinkText}
            onChange={e => update({ detailsLinkText: e.target.value })}
            style={fieldStyle} placeholder="查看方案詳情 ›"
          />
        </label>
        <label style={labelStyle}>
          預約按鈕文字
          <input
            type="text" value={plan.bookingBtnText}
            onChange={e => update({ bookingBtnText: e.target.value })}
            style={fieldStyle} placeholder="立即預約"
          />
        </label>
      </div>

      <label style={labelStyle}>
        亮點列表（每行一項）
        <textarea
          value={plan.highlights.join('\n')}
          onChange={e => update({ highlights: e.target.value.split('\n') })}
          rows={4} style={fieldStyle}
          placeholder={'最早出發前 1 天可預訂\n免費取消（72 小時前）\n實名認證導遊帶領'}
        />
      </label>

      {/* ── 方案詳情欄位 ── */}
      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#2563eb', marginBottom: 8 }}>
          ▸ 方案詳情內容（點擊展開）
        </summary>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
          這一區就是 JSON `plans[]` 裡的詳細欄位：語言 / 固定售價 / 出發日 / 費用資訊 / 方案行程圖片 / 集合地點 / 體驗地點 / 購買須知 / 取消政策
        </div>
        <div style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={labelStyle}>
              語言導覽
              <input type="text" value={plan.language ?? ''} onChange={e => update({ language: e.target.value })}
                style={fieldStyle} placeholder="English / 中文 導覽" />
            </label>
            <label style={labelStyle}>
              方案固定售價（NT$，留空用倍數計算）
              <input type="number" value={plan.price ?? ''} onChange={e => update({ price: e.target.value ? Number(e.target.value) : undefined })}
                style={fieldStyle} placeholder="1500" min={0} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <label style={labelStyle}>
              最早可出發日
              <input type="date" value={plan.earliestDeparture ?? ''} onChange={e => update({ earliestDeparture: e.target.value })}
                style={fieldStyle} />
            </label>
            <label style={labelStyle}>
              最晚N天前回覆
              <input type="number" value={plan.confirmByDays ?? ''} onChange={e => update({ confirmByDays: e.target.value ? Number(e.target.value) : undefined })}
                style={fieldStyle} placeholder="2" min={0} />
            </label>
            <label style={labelStyle}>
              N天前可免費取消
              <input type="number" value={plan.freeCancelDays ?? ''} onChange={e => update({ freeCancelDays: e.target.value ? Number(e.target.value) : undefined })}
                style={fieldStyle} placeholder="6" min={0} />
            </label>
          </div>

          <label style={labelStyle}>
            費用包含（每行一項）
            <textarea value={(plan.planInclusions ?? []).join('\n')} rows={3}
              onChange={e => update({ planInclusions: e.target.value.split('\n').map(x=>x.trim()).filter(Boolean) })}
              style={fieldStyle} placeholder={'保險\n頭盔\n照明頭燈\n手套\n專業講師'} />
          </label>

          <label style={labelStyle}>
            費用不包含（每行一項）
            <textarea value={(plan.planExclusions ?? []).join('\n')} rows={2}
              onChange={e => update({ planExclusions: e.target.value.split('\n').map(x=>x.trim()).filter(Boolean) })}
              style={fieldStyle} placeholder="個人消費" />
          </label>

          {/* 行程介紹（含圖片） */}
          <div>
            <span style={{ ...labelStyle as any, display: 'block', marginBottom: 6 }}>行程介紹（可含圖片）</span>
            {(plan.planItinerary ?? []).map((item, i) => (
              <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, marginBottom: 8, background: '#fff' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <textarea value={item.text} rows={2}
                    onChange={e => { const arr = [...(plan.planItinerary ?? [])]; arr[i] = { ...arr[i], text: e.target.value }; update({ planItinerary: arr }); }}
                    style={{ ...fieldStyle, flex: 1 }} placeholder="帶您來場地心探險" />
                  <button type="button" onClick={() => update({ planItinerary: (plan.planItinerary ?? []).filter((_,j) => j !== i) })}
                    style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontWeight: 700, alignSelf: 'flex-start' }}>✕</button>
                </div>
                {/* 圖片上傳 or 預覽 */}
                {item.imageUrl ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <img src={item.imageUrl} alt="" style={{ width: 80, height: 54, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb' }} />
                    <button type="button"
                      onClick={() => { const arr = [...(plan.planItinerary ?? [])]; arr[i] = { ...arr[i], imageUrl: undefined }; update({ planItinerary: arr }); }}
                      style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: '#fee2e2', color: '#dc2626', border: 'none', cursor: 'pointer' }}>
                      移除圖片
                    </button>
                  </div>
                ) : (
                  <>
                    <ItineraryImageUpload
                      activityId={activityId}
                      activitySlug={activitySlug}
                      onUploaded={url => { const arr = [...(plan.planItinerary ?? [])]; arr[i] = { ...arr[i], imageUrl: url }; update({ planItinerary: arr }); }}
                    />
                    <input
                      type="url"
                      value={item.imageUrl ?? ''}
                      placeholder="或直接貼上圖片 URL"
                      onChange={e => { const arr = [...(plan.planItinerary ?? [])]; arr[i] = { ...arr[i], imageUrl: e.target.value || undefined }; update({ planItinerary: arr }); }}
                      style={{ ...fieldStyle, fontSize: 12, padding: '6px 10px', marginTop: 6 }}
                    />
                  </>
                )}
              </div>
            ))}
            <button type="button" onClick={() => update({ planItinerary: [...(plan.planItinerary ?? []), { text: '', imageUrl: undefined }] })}
              style={{ background: '#eff6ff', color: '#2563eb', border: '1px dashed #93c5fd', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, width: '100%' }}>
              + 新增行程項目
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <span style={{ ...labelStyle as any, display: 'block', marginBottom: 4 }}>集合地點</span>
              <input type="text" value={plan.meetingPointName ?? ''} onChange={e => update({ meetingPointName: e.target.value })}
                style={{ ...fieldStyle, marginBottom: 6 }} placeholder="地點名稱" />
              <input type="text" value={plan.meetingAddress ?? ''} onChange={e => update({ meetingAddress: e.target.value })}
                style={fieldStyle} placeholder="完整地址" />
            </div>
            <div>
              <span style={{ ...labelStyle as any, display: 'block', marginBottom: 4 }}>體驗地點</span>
              <input type="text" value={plan.experiencePointName ?? ''} onChange={e => update({ experiencePointName: e.target.value })}
                style={{ ...fieldStyle, marginBottom: 6 }} placeholder="地點名稱" />
              <input type="text" value={plan.experienceAddress ?? ''} onChange={e => update({ experienceAddress: e.target.value })}
                style={fieldStyle} placeholder="完整地址" />
            </div>
          </div>

          <label style={labelStyle}>
            購買須知（每行一項）
            <textarea value={(plan.planNotices ?? []).join('\n')} rows={3}
              onChange={e => update({ planNotices: e.target.value.split('\n').map(x=>x.trim()).filter(Boolean) })}
              style={fieldStyle} placeholder={'建議 7~65 歲旅客報名\n訂購時務必提供姓名、身分證號'} />
          </label>

          <label style={labelStyle}>
            取消政策（每行一條）
            <textarea value={(plan.planRefundRules ?? []).join('\n')} rows={3}
              onChange={e => update({ planRefundRules: e.target.value.split('\n').map(x=>x.trim()).filter(Boolean) })}
              style={fieldStyle} placeholder={'6天前可免費取消\n4~5天取消收50%手續費\n0~3天不可取消'} />
          </label>

        </div>
      </details>
    </div>
  );
}

// ── 方案管理 Section ──────────────────────────────────────
function PlansSection({
  plans,
  activityId,
  activitySlug,
  onChange,
}: {
  plans: PlanConfig[];
  activityId: string;
  activitySlug: string;
  onChange: (plans: PlanConfig[]) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  async function savePlans() {
    setSaving(true); setSaveMsg('');
    try {
      const res = await fetch(`/api/admin/activities/${activityId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plans }),
      });
      const json = await res.json();
      if (json.ok) { setSaveMsg('✅ 方案已儲存'); setTimeout(() => setSaveMsg(''), 3000); }
      else setSaveMsg('❌ ' + (json.error?.message || '儲存失敗'));
    } catch { setSaveMsg('❌ 網路錯誤'); }
    finally { setSaving(false); }
  }
  function addPlan() {
    onChange([...plans, {
      id: `plan-${Date.now()}`,
      label: '',
      duration: '',
      priceMultiplier: 1,
      highlights: [],
      detailsLinkText: '查看方案詳情 ›',
      bookingBtnText: '立即預約',
    }]);
  }

  function updatePlan(index: number, updated: PlanConfig) {
    const next = [...plans];
    next[index] = updated;
    onChange(next);
  }

  function removePlan(index: number) {
    onChange(plans.filter((_, i) => i !== index));
  }

  function resetToDefault() {
    if (confirm('確定要重置為預設方案嗎？這會覆蓋目前的設定。')) {
      onChange(DEFAULT_PLANS);
    }
  }

  return (
    <Card style={{ padding: 28, marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
            📋 方案管理
            <span style={{ fontSize: 13, fontWeight: 400, color: '#6b7280', marginLeft: 8 }}>
              {plans.length} 個方案
            </span>
          </h3>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>
            管理 Activities 頁面中的「選擇方案」區塊文案
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={resetToDefault}
            style={{
              background: '#f3f4f6', color: '#374151', border: 'none',
              padding: '8px 14px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}
          >
            重置預設
          </button>
          <button
            type="button"
            onClick={addPlan}
            style={{
              background: 'var(--tp-primary, #16a34a)', color: '#fff', border: 'none',
              padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}
          >
            + 新增方案
          </button>
        </div>
      </div>

      {plans.length === 0 ? (
        <div style={{
          textAlign: 'center', color: '#9ca3af', padding: 32,
          border: '2px dashed #e5e7eb', borderRadius: 8,
        }}>
          目前無方案設定，點擊「+ 新增方案」或「重置預設」。
        </div>
      ) : (
        plans.map((plan, i) => (
          <PlanEditor
            key={plan.id + i}
            plan={plan}
            index={i}
            onChange={updated => updatePlan(i, updated)}
            onRemove={() => removePlan(i)}
            activityId={activityId}
            activitySlug={activitySlug}
          />
        ))
      )}

      {/* 儲存方案 */}
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={savePlans}
          disabled={saving}
          style={{
            background: '#1e40af', color: '#fff', border: 'none',
            padding: '10px 24px', borderRadius: 8, fontWeight: 700, fontSize: 14,
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? '儲存中⋯' : '💾 儲存方案設定'}
        </button>
        {saveMsg && (
          <span style={{ fontSize: 13, color: saveMsg.startsWith('✅') ? '#166534' : '#991b1b' }}>
            {saveMsg}
          </span>
        )}
      </div>
    </Card>
  );
}

const REGIONS = ['台北市', '高雄市', '花蓮縣', '台南市', '台中市', '南投縣', '宜蘭縣', '屏東縣'];
const REGION_SLUG_MAP: Record<string, string> = {
  '台北市': 'taipei', '高雄市': 'kaohsiung', '花蓮縣': 'hualien',
  '台南市': 'tainan', '台中市': 'taichung', '南投縣': 'nantou',
  '宜蘭縣': 'yilan',  '屏東縣': 'pingtung',
};
const CATEGORIES = [
  { value: 'outdoor', label: '戶外冒險' },
  { value: 'culture', label: '文化歷史' },
  { value: 'food',    label: '美食體驗' },
  { value: 'nature',  label: '自然生態' },
];

const fieldStyle: React.CSSProperties = {
  display: 'block', width: '100%', padding: '10px 12px',
  border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, marginTop: 4,
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 16,
};
const sectionTitle: React.CSSProperties = {
  fontSize: 16, fontWeight: 700, margin: '24px 0 16px',
  paddingBottom: 8, borderBottom: '1px solid #f0f0f0',
};

const STATUS_BADGE: Record<string, { variant: 'success' | 'warning' | 'danger' | 'default'; label: string }> = {
  draft:     { variant: 'warning', label: '草稿' },
  published: { variant: 'success', label: '已發佈' },
  archived:  { variant: 'default', label: '已封存' },
};

const SCHEDULE_STATUS_LABEL: Record<string, { bg: string; color: string; label: string }> = {
  open:      { bg: '#dcfce7', color: '#166534', label: '開放' },
  full:      { bg: '#fef9c3', color: '#854d0e', label: '額滿' },
  cancelled: { bg: '#fee2e2', color: '#991b1b', label: '關閉' },
};

interface Schedule {
  id: string;
  startAt: string;
  endAt: string;
  capacity: number;
  bookedCount: number;
  status: string;
  planId?: string | null;
  minParticipants?: number;
  guideNote?: string | null;
}

// ── 新增場次 Modal ──────────────────────────────────────
function AddScheduleModal({
  onClose, onAdded, activityId, availablePlans,
}: { onClose: () => void; onAdded: () => void; activityId: string; availablePlans: PlanConfig[] }) {
  const [selectedDates,   setSelectedDates]   = useState<string[]>([]);
  const [startHH,         setStartHH]         = useState('09:00');
  const [endHH,           setEndHH]           = useState('13:00');
  const [capacity,        setCapacity]        = useState('10');
  const [minParticipants, setMinParticipants] = useState('1');
  const [planId,          setPlanId]          = useState('');  // '' = 全部方案
  const [saving,          setSaving]          = useState(false);
  const [progress,        setProgress]        = useState('');
  const [err,             setErr]             = useState('');

  const today = new Date().toISOString().split('T')[0];

  function toggleDate(date: string) {
    setSelectedDates(prev =>
      prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date].sort()
    );
  }

  // Generate next 60 days as grid
  function buildDateGrid() {
    const days = [];
    const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
    for (let i = 0; i < 60; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      const mm = d.getMonth() + 1;
      const dd = d.getDate();
      const wd = WEEKDAYS[d.getDay()];
      const isSun = d.getDay() === 0;
      const isSat = d.getDay() === 6;
      days.push({ key, mm, dd, wd, isSun, isSat });
    }
    return days;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedDates.length === 0) return setErr('請選擇至少一個日期');
    setSaving(true); setErr(''); setProgress('');

    let ok = 0; let fail = 0;
    for (let i = 0; i < selectedDates.length; i++) {
      const date = selectedDates[i];
      setProgress(`新增中 ${i + 1}/${selectedDates.length}⋯`);
      try {
        const startAt = `${date}T${startHH}:00+08:00`;
        const endAt   = `${date}T${endHH}:00+08:00`;
        const res = await fetch(`/api/admin/activities/${activityId}/schedules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startAt, endAt,
            capacity: Number(capacity),
            minParticipants: Number(minParticipants) || 1,
            planId: planId || null,
            status: 'open',
          }),
        });
        const json = await res.json();
        if (json.ok) ok++; else fail++;
      } catch { fail++; }
    }

    setSaving(false); setProgress('');
    if (fail > 0) setErr(`⚠️ ${ok} 筆成功，${fail} 筆失敗（可能重複）`);
    onAdded();
    if (fail === 0) onClose();
  }

  const days = buildDateGrid();

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 28, width: 560,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>📅 批次新增場次</h3>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          可同時選擇多個日期，一次建立多筆場次
        </p>

        {err && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
            {err}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* 日期批次選擇 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>
                選擇日期
                {selectedDates.length > 0 && (
                  <span style={{ marginLeft: 8, background: '#16a34a', color: '#fff', padding: '1px 8px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                    已選 {selectedDates.length} 天
                  </span>
                )}
              </span>
              {selectedDates.length > 0 && (
                <button type="button" onClick={() => setSelectedDates([])}
                  style={{ fontSize: 12, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>
                  清除全部
                </button>
              )}
            </div>

            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3,
              border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, maxHeight: 260, overflowY: 'auto',
            }}>
              {/* Week header */}
              {['日','一','二','三','四','五','六'].map(w => (
                <div key={w} style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', padding: '2px 0', fontWeight: 600 }}>{w}</div>
              ))}
              {/* Empty cells for first week offset */}
              {(() => {
                const firstDay = new Date(days[0].key).getDay();
                return Array(firstDay).fill(null).map((_, i) => <div key={`empty-${i}`} />);
              })()}
              {days.map(d => {
                const isSelected = selectedDates.includes(d.key);
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => toggleDate(d.key)}
                    style={{
                      padding: '4px 2px', borderRadius: 5, border: 'none',
                      background: isSelected ? '#16a34a' : 'transparent',
                      color: isSelected ? '#fff' : d.isSun ? '#ef4444' : d.isSat ? '#3b82f6' : '#374151',
                      cursor: 'pointer', fontSize: 12, fontWeight: isSelected ? 700 : 400,
                      outline: 'none',
                    }}
                  >
                    <div>{d.mm}/{d.dd}</div>
                    <div style={{ fontSize: 10, opacity: 0.7 }}>週{d.wd}</div>
                  </button>
                );
              })}
            </div>

            {selectedDates.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#374151', lineHeight: 1.8 }}>
                已選：{selectedDates.map(d => d.slice(5).replace('-', '/')).join('、')}
              </div>
            )}
          </div>

          {/* 方案選擇 */}
          <label style={labelStyle}>
            適用方案
            <select value={planId} onChange={e => setPlanId(e.target.value)} style={fieldStyle}>
              <option value="">全部方案</option>
              {availablePlans.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={labelStyle}>
              開始時間
              <input type="time" value={startHH} onChange={e => setStartHH(e.target.value)} style={fieldStyle} />
            </label>
            <label style={labelStyle}>
              結束時間
              <input type="time" value={endHH} onChange={e => setEndHH(e.target.value)} style={fieldStyle} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={labelStyle}>
              最大容量（人數）
              <input
                type="number" value={capacity} onChange={e => setCapacity(e.target.value)}
                min={1} max={100} style={fieldStyle}
              />
            </label>
            <label style={labelStyle}>
              最低成團人數
              <input
                type="number" value={minParticipants} onChange={e => setMinParticipants(e.target.value)}
                min={1} max={50} style={fieldStyle}
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end', alignItems: 'center' }}>
            {progress && <span style={{ fontSize: 13, color: '#16a34a' }}>{progress}</span>}
            <button type="button" onClick={onClose}
              style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 14 }}>
              取消
            </button>
            <button type="submit" disabled={saving || selectedDates.length === 0}
              style={{
                padding: '9px 20px', borderRadius: 8, border: 'none',
                background: 'var(--tp-primary, #16a34a)', color: '#fff',
                fontWeight: 700, fontSize: 14,
                cursor: (saving || selectedDates.length === 0) ? 'not-allowed' : 'pointer',
                opacity: (saving || selectedDates.length === 0) ? 0.6 : 1,
              }}>
              {saving ? progress || '新增中⋯' : `確認新增 ${selectedDates.length > 0 ? `(${selectedDates.length} 天)` : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── 場次管理 Section ─────────────────────────────────────
function ScheduleSection({ activityId, availablePlans }: { activityId: string; availablePlans: PlanConfig[] }) {
  const [schedules, setSchedules]       = useState<Schedule[]>([]);
  const [loading,   setLoading]         = useState(true);
  const [showModal, setShowModal]       = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editCap,   setEditCap]         = useState('');
  const [editSt,    setEditSt]          = useState('');
  const [schedErr,  setSchedErr]        = useState('');
  const [schedOk,   setSchedOk]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/activities/${activityId}/schedules`);
      const json = await res.json();
      setSchedules(json.data || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [activityId]);

  useEffect(() => { load(); }, [load]);

  function fmtDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric', weekday: 'short' });
  }
  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  async function handleUpdate(id: string) {
    setSchedErr(''); setSchedOk('');
    try {
      const res = await fetch(`/api/admin/schedules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capacity: Number(editCap), status: editSt }),
      });
      const json = await res.json();
      if (json.ok) { setSchedOk('✅ 已更新'); setEditingId(null); load(); }
      else setSchedErr(json.error?.message || '更新失敗');
    } catch { setSchedErr('網路錯誤'); }
  }

  async function handleDelete(id: string, bookedCount: number) {
    if (bookedCount > 0) {
      setSchedErr(`❌ 此場次已有 ${bookedCount} 筆訂單，無法刪除`);
      return;
    }
    if (!confirm('確認刪除此場次？')) return;
    setSchedErr(''); setSchedOk('');
    try {
      const res = await fetch(`/api/admin/schedules/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.ok) { setSchedOk('✅ 場次已刪除'); load(); }
      else setSchedErr(json.error?.message || '刪除失敗');
    } catch { setSchedErr('網路錯誤'); }
  }

  function startEdit(s: Schedule) {
    setEditingId(s.id);
    setEditCap(String(s.capacity));
    setEditSt(s.status);
    setSchedErr(''); setSchedOk('');
  }

  return (
    <Card style={{ padding: 28, marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
          📅 場次管理
          <span style={{ fontSize: 13, fontWeight: 400, color: '#6b7280', marginLeft: 8 }}>
            {schedules.length} 場
          </span>
        </h3>
        <button
          onClick={() => setShowModal(true)}
          style={{
            background: 'var(--tp-primary, #16a34a)', color: '#fff',
            padding: '8px 16px', borderRadius: 8, border: 'none',
            fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}>
          + 新增場次
        </button>
      </div>

      {schedErr && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 10 }}>{schedErr}</div>}
      {schedOk  && <div style={{ background: '#dcfce7', color: '#166534', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 10 }}>{schedOk}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>載入中⋯</div>
      ) : schedules.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 32, border: '2px dashed #e5e7eb', borderRadius: 8 }}>
          尚無場次。點擊「+ 新增場次」建立第一個場次。
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {['方案', '日期', '時段', '容量', '已訂 / 剩餘', '狀態', '操作'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedules.map(s => {
                const st = SCHEDULE_STATUS_LABEL[s.status] || SCHEDULE_STATUS_LABEL.open;
                const isEditing = editingId === s.id;
                const remaining = s.capacity - s.bookedCount;
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px', whiteSpace: 'nowrap', fontSize: 13 }}>
                      {s.planId
                        ? (availablePlans.find(p => p.id === s.planId)?.label || s.planId)
                        : <span style={{ color: '#9ca3af' }}>全部</span>}
                    </td>
                    <td style={{ padding: '12px', whiteSpace: 'nowrap', fontWeight: 600 }}>{fmtDate(s.startAt)}</td>
                    <td style={{ padding: '12px', whiteSpace: 'nowrap', color: '#6b7280' }}>
                      {fmtTime(s.startAt)} – {fmtTime(s.endAt)}
                    </td>

                    {/* 容量（inline 編輯） */}
                    <td style={{ padding: '12px' }}>
                      {isEditing ? (
                        <input
                          type="number" value={editCap} onChange={e => setEditCap(e.target.value)}
                          min={s.bookedCount} style={{ width: 64, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
                        />
                      ) : s.capacity}
                    </td>

                    {/* 已訂 / 剩餘 */}
                    <td style={{ padding: '12px', color: remaining === 0 ? '#ef4444' : remaining <= 2 ? '#f59e0b' : '#16a34a', fontWeight: 600 }}>
                      {s.bookedCount} / {remaining}
                    </td>

                    {/* 狀態（inline 編輯） */}
                    <td style={{ padding: '12px' }}>
                      {isEditing ? (
                        <select value={editSt} onChange={e => setEditSt(e.target.value)}
                          style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
                          <option value="open">開放</option>
                          <option value="cancelled">關閉</option>
                        </select>
                      ) : (
                        <span style={{ background: st.bg, color: st.color, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                          {st.label}
                        </span>
                      )}
                    </td>

                    {/* 操作 */}
                    <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => handleUpdate(s.id)}
                            style={{ padding: '4px 12px', background: '#dcfce7', color: '#166534', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                            儲存
                          </button>
                          <button onClick={() => setEditingId(null)}
                            style={{ padding: '4px 10px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
                            取消
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => startEdit(s)}
                            style={{ padding: '4px 12px', background: '#dbeafe', color: '#1e40af', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            編輯
                          </button>
                          <button
                            onClick={() => handleDelete(s.id, s.bookedCount)}
                            title={s.bookedCount > 0 ? `已有 ${s.bookedCount} 筆訂單，無法刪除` : '刪除此場次'}
                            style={{
                              padding: '4px 12px', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                              background: s.bookedCount > 0 ? '#f3f4f6' : '#fee2e2',
                              color: s.bookedCount > 0 ? '#9ca3af' : '#991b1b',
                            }}>
                            刪除
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <AddScheduleModal
          activityId={activityId}
          availablePlans={availablePlans}
          onClose={() => setShowModal(false)}
          onAdded={() => { load(); setSchedOk('✅ 場次新增成功'); }}
        />
      )}
    </Card>
  );
}

// ── 主頁面 ────────────────────────────────────────────────
export default function AdminActivityEditPage() {
  const router = useRouter();
  const params = useParams();
  const activityId = params.id as string;

  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState('');

  // Form state
  const [title,              setTitle]              = useState('');
  const [guideSlug,          setGuideSlug]          = useState('');
  const [region,             setRegion]             = useState('');
  const [category,           setCategory]           = useState('');
  const [priceTwd,           setPriceTwd]           = useState('');
  const [durationMinutes,    setDurationMinutes]    = useState('');
  const [minParticipants,    setMinParticipants]    = useState('1');
  const [maxParticipants,    setMaxParticipants]    = useState('10');
  const [meetingPoint,       setMeetingPoint]       = useState('');
  const [meetingPointMapUrl, setMeetingPointMapUrl] = useState('');
  const [coverImageUrl,      setCoverImageUrl]      = useState('');
  const [imageUrls,          setImageUrls]          = useState<string[]>([]);
  const [description,        setDescription]        = useState('');
  const [shortDescription,   setShortDescription]   = useState('');
  const [tagline,            setTagline]            = useState('');
  const [inclusions,         setInclusions]         = useState('');
  const [exclusions,         setExclusions]         = useState('');
  const [notices,            setNotices]            = useState('');
  const [refundRules,        setRefundRules]        = useState('');
  const [safetyNotice,       setSafetyNotice]       = useState('');
  const [goodFor,            setGoodFor]            = useState('');
  const [socialProofQuotes,  setSocialProofQuotes]  = useState('');
  const [faq,                setFaq]                = useState<Array<{q:string;a:string}>>([]);
  const [itinerary,          setItinerary]          = useState<Array<{step:number;title:string;description:string;duration:string;icon:string}>>([]);
  const [status,             setStatus]             = useState('draft');
  const [plans,              setPlans]              = useState<PlanConfig[]>(DEFAULT_PLANS);
  const [activitySlug,       setActivitySlug]       = useState('');
  const [importErrors,       setImportErrors]       = useState<string[]>([]);
  const [importDiff,         setImportDiff]         = useState<Array<{field:string;before:string;after:string}>>([]);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!activityId) return;
    setLoading(true);
    fetch(`/api/admin/activities/${activityId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(json => {
        const d = json.data;
        if (!d) { setError('行程不存在'); setLoading(false); return; }
        setTitle(d.title || '');
        setActivitySlug(d.slug || activityId);
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
        setImageUrls(d.imageUrls || []);
        setDescription(d.description || '');
        setShortDescription(d.shortDescription || '');
        setTagline(d.tagline || '');
        setInclusions((d.inclusions || []).join('\n'));
        setExclusions((d.exclusions || []).join('\n'));
        setNotices((d.notices || []).join('\n'));
        setRefundRules((d.refundRules || []).join('\n'));
        setSafetyNotice(d.safetyNotice || '');
        setGoodFor((d.goodFor || []).join('\n'));
        setSocialProofQuotes((d.socialProofQuotes || []).join('\n'));
        setFaq(d.faq || []);
        setItinerary(d.itinerary || []);
        setStatus(d.status || 'draft');
        // plans: use DB value if exists, otherwise default
        if (d.plans && Array.isArray(d.plans) && d.plans.length > 0) {
          setPlans(d.plans);
        } else {
          setPlans(DEFAULT_PLANS);
        }
        setLoading(false);
      })
      .catch(() => { setError('載入失敗'); setLoading(false); });
  }, [activityId]);

  function summarize(v: any) {
    if (Array.isArray(v)) return `${v.length} 項`;
    if (v == null || v === '') return '（空）';
    return String(v).slice(0, 50);
  }

  function validateImport(d: any) {
    const errors: string[] = [];
    if (!d || typeof d !== 'object' || Array.isArray(d)) errors.push('根層必須是 JSON 物件');
    if (!d.title || typeof d.title !== 'string') errors.push('title 必填，且必須是字串');
    if (!d.region || typeof d.region !== 'string') errors.push('region 必填，且必須是字串');
    if (!d.category || typeof d.category !== 'string') errors.push('category 必填，且必須是字串');
    if (d.priceTwd == null || Number.isNaN(Number(d.priceTwd))) errors.push('priceTwd 必填，且必須是數字');
    if (d.guideSlug != null && typeof d.guideSlug !== 'string') errors.push('guideSlug 必須是字串');
    for (const key of ['imageUrls','inclusions','exclusions','notices','refundRules','goodFor','socialProofQuotes']) {
      if (d[key] != null && !Array.isArray(d[key])) errors.push(`${key} 必須是陣列`);
    }
    if (d.faq != null && !Array.isArray(d.faq)) errors.push('faq 必須是陣列');
    if (d.itinerary != null && !Array.isArray(d.itinerary)) errors.push('itinerary 必須是陣列');
    if (d.plans != null && !Array.isArray(d.plans)) errors.push('plans 必須是陣列');
    return errors;
  }

  function buildImportDiff(d: any) {
    return [
      ['title', title, d.title || ''],
      ['guideSlug', guideSlug, d.guideSlug || ''],
      ['region', region, d.region || ''],
      ['category', category, d.category || ''],
      ['priceTwd', priceTwd, String(d.priceTwd || '')],
      ['tagline', tagline, d.tagline || ''],
      ['shortDescription', shortDescription, d.shortDescription || ''],
      ['coverImageUrl', coverImageUrl, d.coverImageUrl || ''],
      ['imageUrls', imageUrls, Array.isArray(d.imageUrls) ? d.imageUrls : []],
      ['plans', plans, Array.isArray(d.plans) ? d.plans : []],
      ['faq', faq, Array.isArray(d.faq) ? d.faq : []],
      ['itinerary', itinerary, Array.isArray(d.itinerary) ? d.itinerary : []],
    ].filter(([, before, after]) => JSON.stringify(before) !== JSON.stringify(after))
     .map(([field, before, after]) => ({ field: String(field), before: summarize(before), after: summarize(after) }));
  }

  function applyImportedActivity(d: any) {
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
    setImageUrls(Array.isArray(d.imageUrls) ? d.imageUrls : []);
    setDescription(d.description || '');
    setShortDescription(d.shortDescription || '');
    setTagline(d.tagline || '');
    setInclusions((d.inclusions || []).join('\n'));
    setExclusions((d.exclusions || []).join('\n'));
    setNotices((d.notices || []).join('\n'));
    setRefundRules((d.refundRules || []).join('\n'));
    setSafetyNotice(d.safetyNotice || '');
    setGoodFor((d.goodFor || []).join('\n'));
    setSocialProofQuotes((d.socialProofQuotes || []).join('\n'));
    setFaq(Array.isArray(d.faq) ? d.faq : []);
    setItinerary(Array.isArray(d.itinerary) ? d.itinerary : []);
    setPlans(Array.isArray(d.plans) && d.plans.length ? d.plans : DEFAULT_PLANS);
    setSuccess('✅ 已從 JSON 樣板匯入內容，請確認後再儲存');
  }

  function handleImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result || '{}'));
        const errors = validateImport(json);
        setImportErrors(errors);
        setImportDiff(errors.length ? [] : buildImportDiff(json));
        if (errors.length) {
          setError('匯入失敗：JSON 欄位格式不正確');
          return;
        }
        applyImportedActivity(json);
      } catch {
        setImportErrors(['檔案不是有效 JSON，請重新檢查逗號、括號與引號']);
        setImportDiff([]);
        setError('匯入失敗：請上傳有效的 JSON 樣板');
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  function downloadTemplate() {
    const template = {
      _instructions: {
        version: 'B - 說明版 JSON 樣板（內容豐富版）',
        note: '此檔可直接匯入。_instructions 只做欄位說明，不會寫入資料庫。',
        how_to_use: [
          '1. 複製這份檔案後修改內容',
          '2. 保留欄位名稱不變，只改值',
          '3. 圖片欄位可填真實 URL，也可留空後改用後台上傳',
          '4. plans[] 對應後台「📋 方案管理」，展開「▸ 方案詳情內容」即可編輯',
          '5. planItinerary[].imageUrl 是方案介紹步驟的圖片，可填 URL 或後台上傳',
          '6. 匯入後請檢查 diff 預覽，確認後再按儲存'
        ],
        title: '行程名稱。對應後台「行程名稱」。',
        guideSlug: '導遊 slug。對應後台「導遊」，例如 andy-lee。',
        region: '中文地區名稱。對應後台「地區」，例如 高雄市。',
        category: '類別代碼：outdoor / culture / food / nature。',
        priceTwd: '基礎售價（每人 TWD）。對應後台「價格/人」。',
        durationMinutes: '整體活動分鐘數。對應後台「行程時長（分鐘）」。',
        minParticipants: '最少成團人數。',
        maxParticipants: '最多可報名人數。',
        meetingPoint: '集合地點文字。',
        meetingPointMapUrl: 'Google Maps 或其他地圖 URL。',
        coverImageUrl: '封面圖片 URL。也可改用後台上傳。',
        imageUrls: '活動照片 URL 陣列。每個元素一張圖，對應 Gallery，可改用後台上傳。',
        tagline: '一句話副標。',
        shortDescription: '短描述。',
        description: '完整描述。',
        inclusions: '包含項目陣列。',
        exclusions: '不包含項目陣列。',
        notices: '注意事項陣列。',
        refundRules: '退款規則陣列。',
        safetyNotice: '安全說明。',
        goodFor: '適合對象陣列。',
        socialProofQuotes: '社群口碑語錄陣列。',
        faq: 'FAQ 陣列，格式 [{ q, a }]。',
        itinerary: '詳細行程時間表陣列，格式 [{ step, title, description, duration, icon }]。',
        plans: '方案管理陣列；對應後台「📋 方案管理」與其中的「方案詳情內容」。',
        plans_fields: {
          id: '方案唯一 ID，例如 half-day。',
          label: '方案名稱。',
          duration: '方案顯示時長文字。',
          priceMultiplier: '相對基礎價格倍數。',
          price: '方案固定售價（選填，若填寫則優先顯示）。',
          highlights: '方案亮點陣列。',
          detailsLinkText: '查看詳情連結文字。',
          bookingBtnText: '預約按鈕文字。',
          language: '導覽語言。',
          earliestDeparture: '最早可出發日 YYYY-MM-DD。',
          confirmByDays: '最晚幾天前回覆訂單結果。',
          freeCancelDays: '幾天前可免費取消。',
          planInclusions: '方案費用包含項目。',
          planExclusions: '方案費用不包含項目。',
          planItinerary: '方案介紹陣列，格式 [{ text, imageUrl? }]，每一步可附圖片 URL。',
          meetingPointName: '集合地點名稱。',
          meetingAddress: '集合地點地址。',
          experiencePointName: '體驗地點名稱。',
          experienceAddress: '體驗地點地址。',
          planNotices: '方案購買須知陣列。',
          planRefundRules: '方案取消政策陣列。'
        }
      },
      title: '柴山秘境之旅｜龍谷、小錐麓、金瓜洞全探索',
      guideSlug: 'andy-lee',
      region: '高雄市',
      category: 'outdoor',
      priceTwd: 1800,
      durationMinutes: 270,
      minParticipants: 4,
      maxParticipants: 10,
      meetingPoint: '柴山壽山動物園停車場旁（龍門亭入口）',
      meetingPointMapUrl: 'https://www.google.com/maps/search/?api=1&query=%E9%AB%98%E9%9B%84%E5%B8%82%E9%BC%93%E5%B1%B1%E5%8D%80%E8%BF%B4%E9%BE%8D%E8%B7%AF+%E6%9F%B4%E5%B1%B1',
      coverImageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80',
      imageUrls: [
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1520116468816-95b69f847357?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1200&q=80'
      ],
      tagline: '市區旁的秘境冒險，攀岩穿石、走懸崖古道、鑽洞穴，跟著 Andy Lee 探索高雄的地形秘境',
      shortDescription: '高雄柴山是臺灣唯一的市區國家自然公園，珊瑚礁石灰岩地形造就了龍谷大峽谷、小錐麓懸崖古道與金瓜洞等絕景。這趟秘境之旅由認證嚮導帶領，親身穿越一般人不知道的路線。',
      description: '柴山，高雄人的後山，也是臺灣唯一位於都會區中的國家自然公園。這裡的地質由高位珊瑚礁石灰岩組成，億萬年前的海底世界被抬升成陸地，歷經風化侵蝕後形成嶙峋石壁、峽谷與神秘洞穴。\n\n本行程由擁有豐富山野經驗的 Andy Lee 導覽，帶領你穿越龍谷大峽谷深邃的 U 字型地形，挑戰高度刺激的小錐麓懸崖古道（全長 30 公尺，路寬僅 30 公分，架設在峭壁上，宛如花蓮錐麓古道的縮小版），並進入罕見對外開放的石灰岩溶洞探索鐘乳石與石筍奇景。\n\n沿途不只地形壯觀，還有機會近距離觀察柴山獼猴群落、熱帶植被生態，以及遠眺高雄港與西子灣的絕美海港天際線。這是一段讓你在城市邊緣感受真實探險的旅程。',
      inclusions: ['認證嚮導全程帶領', '專業頭燈（洞穴探索用）', '安全帽', '手套', '洞穴探索保險', '行前安全說明與裝備指導', '電子行程確認憑證'],
      exclusions: ['個人交通（請自行抵達集合點）', '個人餐飲', '個人意外險升級（建議自行投保）'],
      notices: [
        '請穿著止滑運動鞋或登山鞋，禁止穿涼鞋或拖鞋',
        '請自備至少 1 公升飲水',
        '行程含輕度攀岩與鑽洞，需彎腰匍匐前進',
        '小錐麓路段需走懸崖岩壁，有懼高症者請事先告知',
        '雨天或土石潮濕時可能調整或取消路線，以安全為優先',
        '柴山洞穴探索需持合法申請許可，本行程已代辦申請'
      ],
      refundRules: [
        '出發 6 天（含）以前取消：100% 退款',
        '出發 4-5 天前取消：退款 50%',
        '出發 3 天以內或當天取消：不退款',
        '因惡劣天氣或安全因素由主辦取消：全額退款或改期'
      ],
      safetyNotice: '部分路段地形陡峭濕滑，全程請依嚮導指示行進，禁止脫隊。洞穴內光線昏暗，請確保頭燈電量充足。心臟病、嚴重膝傷、孕婦請勿參加。',
      goodFor: ['7-65 歲，有基本體能者', '喜愛地形探索與地質奇景', '想在城市近郊體驗真實探險', '攝影愛好者（石灰岩地形光影極具特色）', '熱愛自然生態觀察者'],
      socialProofQuotes: [
        '走小錐麓那段腿真的有點軟，但景色無敵！',
        '從沒想過高雄市區旁邊藏著這種峽谷地形，太衝擊了',
        'Andy 很懂柴山的每一塊石頭，解說超有深度',
        '鑽洞穴那段是整個行程的高潮，大人小孩都瘋了',
        '這種體驗 KKday 找不到，真的是隱藏版路線',
        '早上出發中午回來，CP 值超高，值得再來一次'
      ],
      faq: [
        { q: '完全沒有登山經驗的人可以參加嗎？', a: '可以，但需要有基本體能。行程有部分攀岩路段（難度低，有輔助繩），以及需要彎腰鑽過岩縫的路段。建議有基本步行能力、膝蓋健康的旅客參加，報名時如有疑慮請先告知嚮導。' },
        { q: '小朋友可以參加嗎？', a: '建議 10 歲以上、體重 30 公斤以上的孩童參加。部分洞穴路段空間較窄，小朋友通過反而更輕鬆！請家長陪同並全程配合嚮導指示。' },
        { q: '怕高或幽閉恐懼症可以參加嗎？', a: '小錐麓路段走在岩壁峭道上，有輕微懼高症者建議先告知嚮導，可依現場狀況評估跳過。洞穴路段空間寬敞，一般幽閉恐懼不會有太大影響，但嚴重者建議事先告知。' },
        { q: '柴山洞穴探索需要申請許可嗎？', a: '是的，依據壽山國家自然公園規定，進入洞穴探勘需事先申請許可。本行程已代辦所有申請手續，旅客只需跟隨嚮導，不需自行辦理。' },
        { q: '行程會遇到猴子嗎？', a: '柴山台灣獼猴族群數量龐大，沿途幾乎必定遇到！嚮導會說明如何與猴子和平共處。請勿餵食、勿直視、背包拉緊，猴子通常不會主動靠近。' },
        { q: '如果下雨或天氣不好還能出發嗎？', a: '一般下雨仍可出發（石灰岩濕潤後風化紋路更美），但大雨或颱風警報時將取消。地形濕滑時嚮導會調整路線。出發前 24 小時內會再次確認天氣狀況。' }
      ],
      itinerary: [
        { step: 1, title: '集合 & 裝備確認', description: '在壽山動物園停車場旁的龍門亭入口集合，嚮導進行裝備分發與安全說明，說明柴山地質生態背景知識，並確認每位旅客的體能與禁忌狀況。', duration: '20 分', icon: '📍' },
        { step: 2, title: '珊瑚礁岩步道入口', description: '進入柴山林道，踏上由億萬年前海底珊瑚礁抬升形成的石灰岩步道。嚮導沿途解說地質構造與柴山獼猴生態，第一個轉角通常就能見到猴群出沒。', duration: '30 分', icon: '🌿' },
        { step: 3, title: '龍谷大峽谷', description: '抵達柴山最壯觀的地形奇景「龍谷大峽谷」。兩側高聳的珊瑚礁岩壁形成深邃 U 字型峽谷，站在谷底往上看天光穿透岩縫，光影效果震撼。嚮導講解水蝕與溶蝕作用如何塑造這片地形。', duration: '30 分', icon: '🪨' },
        { step: 4, title: '小錐麓懸崖古道', description: '本行程最刺激的路段！小錐麓是龍谷末端一段建造在岩壁上的古道，全長僅 30 公尺，路寬不到 30 公分，一側是峭壁，一側是深谷。如同縮小版的花蓮錐麓古道，考驗膽量的同時也能俯瞰整個峽谷。', duration: '20 分', icon: '🧗' },
        { step: 5, title: '金瓜洞石灰岩溶洞', description: '穿越岩縫進入柴山著名的「金瓜洞」秘境。洞內由碳酸鈣長期沉澱形成的鐘乳石與石筍造型奇特，頭燈照射下金光閃閃，是柴山最神秘也最少人知道的地點。本行程已取得合法探洞許可。', duration: '35 分', icon: '🔦' },
        { step: 6, title: '山頂稜線 & 高雄港景觀台', description: '從洞穴出口沿稜線步道登上柴山頂，眺望高雄港、西子灣、旗津半島，以及晴天下延伸至台灣海峽的壯闊天際線。嚮導分享高雄城市地理與港口歷史。', duration: '30 分', icon: '🌄' },
        { step: 7, title: '木棧道回程 & 生態觀察', description: '沿著柴山木棧道緩步下山，嚮導帶領觀察熱帶海岸林植被、石灰岩地貌細節，以及再次與獼猴群落近距離觀察。行程在龍門亭解散，交通方便。', duration: '25 分', icon: '🐒' }
      ],
      plans: [
        {
          id: 'half-day-morning',
          label: 'A. 早鳥半日探秘',
          duration: '約 4.5 小時（08:00–12:30）',
          priceMultiplier: 1,
          price: 1800,
          highlights: ['晨光穿透峽谷，光影最美時段', '猴群活動最頻繁，最容易近距離觀察', '涼爽舒適，無日曬困擾', '最早出發前 1 天可預訂', '免費取消（出發 72 小時前）', '每場最多 10 人小團，品質有保障'],
          detailsLinkText: '查看方案詳情 ›',
          bookingBtnText: '立即預約',
          language: '中文主導 / English available',
          earliestDeparture: '2026-04-10',
          confirmByDays: 2,
          freeCancelDays: 3,
          planInclusions: ['認證嚮導全程帶領', '頭燈（洞穴探索用）', '安全帽', '手套', '洞穴探索保險', '電子憑證'],
          planExclusions: ['個人交通', '餐飲', '個人意外險升級'],
          planItinerary: [
            { text: '🔆 08:00 龍門亭入口集合，裝備分發與安全說明。嚮導介紹柴山地質歷史，解說億萬年前珊瑚礁抬升成陸地的故事。', imageUrl: 'https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=1200&q=80' },
            { text: '🌿 08:20 進入珊瑚礁岩步道，首段林道嚮導帶領觀察熱帶植被與石灰岩地貌，幾乎必定遇到獼猴群落（請背好包包）。', imageUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1200&q=80' },
            { text: '🪨 08:50 龍谷大峽谷。兩側十公尺高珊瑚礁岩壁夾出 U 字型深谷，晨光穿透岩縫形成絕美光柱。這是柴山最壯觀的地形秘境。', imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80' },
            { text: '🧗 09:20 小錐麓懸崖古道挑戰！全長 30 公尺、路寬 30 公分的岩壁棧道，一側峭壁一側深谷，是本行程膽量挑戰最高的路段。嚮導全程陪同保護。', imageUrl: 'https://images.unsplash.com/photo-1522163182402-834f871fd851?auto=format&fit=crop&w=1200&q=80' },
            { text: '🔦 09:40 進入金瓜洞石灰岩溶洞！穿越岩縫，頭燈照亮洞內億年鐘乳石與石筍奇景。本行程已取得合法探洞申請許可，帶你看一般遊客進不去的秘境。', imageUrl: 'https://images.unsplash.com/photo-1520116468816-95b69f847357?auto=format&fit=crop&w=1200&q=80' },
            { text: '🌄 10:15 登上稜線展望台，遠眺高雄港、西子灣與旗津全景。天氣晴朗時甚至能看到台灣海峽。嚮導說明高雄地理與港口歷史。', imageUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80' },
            { text: '🐒 10:45 沿木棧道緩步下山，沿途再觀察柴山獼猴生態與植被，嚮導分享保育知識。12:30 抵達龍門亭，行程結束。', imageUrl: 'https://images.unsplash.com/photo-1540573133985-87b6da6d54a9?auto=format&fit=crop&w=1200&q=80' }
          ],
          meetingPointName: '龍門亭入口（壽山動物園停車場旁）',
          meetingAddress: '804 高雄市鼓山區萬壽路 350 號旁',
          experiencePointName: '柴山龍谷、小錐麓、金瓜洞',
          experienceAddress: '高雄市鼓山區柴山（壽山國家自然公園）',
          planNotices: ['請穿著止滑鞋', '請自備至少 1 公升飲水', '行程含輕度攀岩與鑽洞，需彎腰匍匐前進', '請勿餵食或挑釁柴山獼猴', '小錐麓有輕微高度，嚴重懼高症者請事先告知'],
          planRefundRules: ['出發 3 天（含）以前取消：全額退款', '出發 2 天前取消：退款 50%', '出發當天或 1 天前取消：不退款', '因天氣或安全取消：全額退款或免費改期']
        },
        {
          id: 'full-day-complete',
          label: 'B. 全日深度探秘（含午餐）',
          duration: '約 7 小時（08:00–15:00）',
          priceMultiplier: 1.7,
          price: 3000,
          highlights: ['半日行程 + 下午延伸至北峰古砲台與隱谷秘境', '探訪日治時期砲台遺址與神秘地下空間', '含嚮導帶領的在地午餐（前金鴨肉飯）', '行程最完整，適合想深度探索柴山者', '每場最多 8 人精緻小團', '贈送個人行程紀念照片 5 張'],
          detailsLinkText: '查看方案詳情 ›',
          bookingBtnText: '立即預約',
          language: '中文主導 / English available',
          earliestDeparture: '2026-04-10',
          confirmByDays: 2,
          freeCancelDays: 6,
          planInclusions: ['認證嚮導全程帶領', '頭燈（洞穴探索用）', '安全帽', '手套', '洞穴探索保險', '在地午餐（鴨肉飯 + 湯品）', '嚮導拍攝紀念照片 5 張', '電子憑證'],
          planExclusions: ['個人交通', '個人額外飲品', '個人意外險升級'],
          planItinerary: [
            { text: '🔆 08:00 龍門亭入口集合，裝備分發與安全說明。嚮導深入介紹柴山地質歷史，並帶領暖身活動。', imageUrl: 'https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=1200&q=80' },
            { text: '🌿 08:20 珊瑚礁岩步道，首段觀察獼猴群落與熱帶海岸林生態，嚮導解說保育現況。', imageUrl: 'https://images.unsplash.com/photo-1540573133985-87b6da6d54a9?auto=format&fit=crop&w=1200&q=80' },
            { text: '🪨 08:50 龍谷大峽谷。兩側十公尺高的珊瑚礁岩壁，U 字型峽谷空間感震撼，嚮導解說溶蝕與水蝕地形作用機制。', imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80' },
            { text: '🧗 09:20 小錐麓懸崖古道挑戰。30公尺窄道俯瞰深谷，嚮導全程保護，完成後拍下大合照紀念。', imageUrl: 'https://images.unsplash.com/photo-1522163182402-834f871fd851?auto=format&fit=crop&w=1200&q=80' },
            { text: '🔦 09:45 金瓜洞石灰岩溶洞探索，合法取得許可入洞，頭燈照射下鐘乳石與石筍閃閃發亮，嚮導講解碳酸鈣沉澱機制。', imageUrl: 'https://images.unsplash.com/photo-1520116468816-95b69f847357?auto=format&fit=crop&w=1200&q=80' },
            { text: '🌄 10:30 登上柴山主稜線展望台，眺望高雄港、西子灣、旗津、海峽全景，嚮導介紹高雄城市地理發展。', imageUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80' },
            { text: '🍖 12:00 下山享用嚮導精選在地午餐：前金市場鴨肉飯 + 冬瓜湯，是柴山登山者的傳統補給，也是在地味道的最佳代表。', imageUrl: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80' },
            { text: '🏰 13:15 午餐後前往柴山北峰，探訪日治時期遺留的砲台遺址，嚮導講解二戰防禦工事歷史背景。砲台石拱門與地下彈藥庫都保存完整。', imageUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1200&q=80' },
            { text: '🔦 14:00 北峰隱谷秘境，另一處鮮為人知的岩縫通道與小型溶洞，是早鳥行程不包含的獨家路線，全程嚮導帶領。', imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80' },
            { text: '✅ 15:00 回到集合點，嚮導分享行程紀念照片，行程圓滿結束。', imageUrl: 'https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=1200&q=80' }
          ],
          meetingPointName: '龍門亭入口（壽山動物園停車場旁）',
          meetingAddress: '804 高雄市鼓山區萬壽路 350 號旁',
          experiencePointName: '柴山龍谷、小錐麓、金瓜洞、北峰砲台、隱谷秘境',
          experienceAddress: '高雄市鼓山區柴山（壽山國家自然公園）',
          planNotices: ['請穿著止滑運動鞋或登山鞋，禁止穿涼鞋', '請自備至少 1.5 公升飲水', '午餐有葷食（鴨肉），素食者請報名時告知，可安排替代餐食', '行程含攀岩、鑽洞與下午北峰路線，體力需求高於半日'],
          planRefundRules: ['出發 6 天（含）以前取消：全額退款', '出發 4-5 天前取消：退款 50%', '出發 3 天以內或當天取消：不退款', '因天氣或安全取消：全額退款或免費改期']
        }
      ]
    };
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'activity-chaishan-sample.json'; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    const toArray = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean);
    try {
      const res = await fetch(`/api/admin/activities/${activityId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(), guideSlug: guideSlug || undefined,
          region,
          regionSlug: REGION_SLUG_MAP[region] || region.toLowerCase().replace(/[^\w]+/g, '-') || undefined,
          category,
          priceTwd: Number(priceTwd),
          durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
          minParticipants: Number(minParticipants) || 1,
          maxParticipants: Number(maxParticipants) || 10,
          meetingPoint, meetingPointMapUrl, coverImageUrl,
          description, shortDescription, tagline,
          inclusions: toArray(inclusions), exclusions: toArray(exclusions),
          notices: toArray(notices), refundRules: toArray(refundRules),
          safetyNotice: safetyNotice.trim() || undefined,
          goodFor: toArray(goodFor),
          socialProofQuotes: toArray(socialProofQuotes),
          faq, itinerary,
          plans, imageUrls,
        }),
      });
      const json = await res.json();
      if (json.ok) setSuccess('✅ 儲存成功');
      else setError(json.error?.message || '更新失敗');
    } catch { setError('網路錯誤'); }
    finally { setSaving(false); }
  }

  async function handleStatusChange(newStatus: string) {
    setStatusBusy(true); setError(''); setSuccess('');
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
            {status === 'published' && activitySlug && REGION_SLUG_MAP[region] && (
              <a
                href={`/activities/${REGION_SLUG_MAP[region]}/${activitySlug}`}
                target="_blank"
                rel="noreferrer"
                style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '8px 14px', borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: 'none' }}
              >
                🔗 查看前台
              </a>
            )}
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
        {error   && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>❌ {error}</div>}
        {success && <div style={{ background: '#dcfce7', color: '#166534', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>{success}</div>}

        {/* ── 基本資料表單 ── */}
        <Card style={{ padding: 28 }}>
          <form onSubmit={handleSave}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={e => e.target.files?.[0] && handleImportFile(e.target.files[0])}
              />
              <button type="button" onClick={() => importInputRef.current?.click()} style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '8px 14px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
                ⬆️ 匯入 JSON 建立內容
              </button>
              <button type="button" onClick={downloadTemplate} style={{ background: '#f9fafb', color: '#374151', border: '1px solid #d1d5db', padding: '8px 14px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
                ⬇️ 下載 JSON 樣板
              </button>
            </div>
            {importErrors.length > 0 && (
              <div style={{ background: '#fff7ed', color: '#9a3412', border: '1px solid #fdba74', padding: '12px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>JSON 驗證錯誤</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {importErrors.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </div>
            )}
            {importDiff.length > 0 && (
              <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', padding: '12px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>匯入預覽 diff</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {importDiff.map((row, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: 8 }}>
                      <div style={{ fontWeight: 600 }}>{row.field}</div>
                      <div style={{ color: '#6b7280' }}>原：{row.before}</div>
                      <div style={{ color: '#166534' }}>新：{row.after}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <h3 style={sectionTitle}>📝 基本資訊</h3>

            <label style={labelStyle}>
              行程名稱 *
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} style={fieldStyle} required />
            </label>

            <div style={labelStyle}>
              <span style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 14 }}>導遊</span>
              <GuideSearch
                value={guideSlug}
                onChange={(slug) => setGuideSlug(slug)}
                style={{ marginTop: 0 }}
              />
            </div>

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

            <h3 style={sectionTitle}>💰 定價與容量</h3>
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

            <h3 style={sectionTitle}>📍 集合地點</h3>
            <label style={labelStyle}>
              集合地點
              <input type="text" value={meetingPoint} onChange={e => setMeetingPoint(e.target.value)} style={fieldStyle} />
            </label>
            <label style={labelStyle}>
              地圖 URL
              <input type="url" value={meetingPointMapUrl} onChange={e => setMeetingPointMapUrl(e.target.value)} style={fieldStyle} />
            </label>

            <h3 style={sectionTitle}>🖼️ 圖片</h3>
            <label style={{ ...labelStyle, marginBottom: 8 }}>封面圖</label>
            <ImageUpload
              activityId={activityId}
              activitySlug={title.toLowerCase().replace(/\s+/g, '-') || activityId}
              type="cover"
              currentUrl={coverImageUrl}
              onUpload={setCoverImageUrl}
            />
            <div style={{ marginTop: 12, marginBottom: 16 }}>
              <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12, color: '#6b7280' }}>或直接貼上封面圖 URL</label>
              <input
                type="url"
                value={coverImageUrl}
                onChange={e => setCoverImageUrl(e.target.value)}
                style={{ ...fieldStyle, fontSize: 13 }}
                placeholder="https://..."
              />
            </div>

            <label style={{ ...labelStyle, marginBottom: 8 }}>活動照片（Gallery）</label>
            <ImageUpload
              activityId={activityId}
              activitySlug={title.toLowerCase().replace(/\s+/g, '-') || activityId}
              type="gallery"
              currentUrls={imageUrls}
              onUpload={() => {}}
              onGalleryUpdate={setImageUrls}
            />
            <div style={{ marginTop: 12, marginBottom: 16 }}>
              <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12, color: '#6b7280' }}>或直接貼上活動照片 URL（每行一張）</label>
              <textarea
                value={imageUrls.join('\n')}
                onChange={e => setImageUrls(e.target.value.split('\n').map(x => x.trim()).filter(Boolean))}
                rows={3}
                style={{ ...fieldStyle, fontSize: 13 }}
                placeholder={'https://example.com/a.webp\nhttps://example.com/b.webp'}
              />
              {imageUrls.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                  {imageUrls.map((url, i) => (
                    <div key={url + i} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, background: '#fff' }}>
                      <img src={url} alt="" style={{ width: 96, height: 64, objectFit: 'cover', borderRadius: 6, background: '#f3f4f6' }} />
                      <div style={{ flex: 1, fontSize: 12, color: '#4b5563', wordBreak: 'break-all' }}>{url}</div>
                      <button type="button" onClick={() => setImageUrls(imageUrls.filter((_, idx) => idx !== i))} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}>移除</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <h3 style={sectionTitle}>📋 行程詳情</h3>
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
              <textarea value={refundRules} onChange={e => setRefundRules(e.target.value)} rows={3} style={fieldStyle} placeholder={'出發72小時前免費取消\n出發24小時內不退款'} />
            </label>
            <label style={labelStyle}>
              安全說明
              <textarea value={safetyNotice} onChange={e => setSafetyNotice(e.target.value)} rows={2} style={fieldStyle} placeholder="請確保攜帶個人藥品，行程含輕度步行" />
            </label>
            <label style={labelStyle}>
              適合對象（每行一項）
              <textarea value={goodFor} onChange={e => setGoodFor(e.target.value)} rows={3} style={fieldStyle} placeholder={'喜愛歷史文化\n家庭親子旅遊\n銀髮族友善'} />
            </label>
            <label style={labelStyle}>
              社群口碑語錄（每行一句）
              <textarea value={socialProofQuotes} onChange={e => setSocialProofQuotes(e.target.value)} rows={3} style={fieldStyle} placeholder={'超值行程，CP值超高！\n導遊非常專業親切'} />
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

        {/* ── 方案管理 ── */}
        <PlansSection plans={plans} activityId={activityId} activitySlug={activitySlug || activityId} onChange={setPlans} />

        {/* ── 行程時間表 Editor ── */}
        <Card style={{ marginTop: 24 }}>
          <h3 style={sectionTitle}>🗺 詳細行程時間表</h3>
          {itinerary.map((step, i) => (
            <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 12, background: '#f9fafb' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input value={step.icon} onChange={e => { const s=[...itinerary]; s[i]={...s[i],icon:e.target.value}; setItinerary(s); }}
                  style={{ width: 48, border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 8px', textAlign: 'center', fontSize: 20 }} placeholder="📍" />
                <input value={step.title} onChange={e => { const s=[...itinerary]; s[i]={...s[i],title:e.target.value}; setItinerary(s); }}
                  style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px' }} placeholder="地點名稱" />
                <input value={step.duration} onChange={e => { const s=[...itinerary]; s[i]={...s[i],duration:e.target.value}; setItinerary(s); }}
                  style={{ width: 90, border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 8px' }} placeholder="60分鐘" />
                <button type="button" onClick={() => setItinerary(itinerary.filter((_,j)=>j!==i))}
                  style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
              </div>
              <textarea value={step.description} onChange={e => { const s=[...itinerary]; s[i]={...s[i],description:e.target.value}; setItinerary(s); }}
                rows={2} style={{ ...fieldStyle, width: '100%' }} placeholder="景點描述（選填）" />
            </div>
          ))}
          <button type="button" onClick={() => setItinerary([...itinerary, { step: itinerary.length+1, title:'', description:'', duration:'', icon:'📍' }])}
            style={{ background: '#eff6ff', color: '#2563eb', border: '1px dashed #93c5fd', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', width: '100%', marginBottom: 16 }}>
            + 新增行程點
          </button>
          {itinerary.length > 0 && (
            <button type="button" onClick={async () => {
              const res = await fetch(`/api/admin/activities/${activityId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itinerary }),
              });
              const json = await res.json();
              if (json.ok) alert('✅ 行程時間表已儲存');
              else alert('❌ 儲存失敗');
            }} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
              💾 儲存行程時間表
            </button>
          )}
        </Card>

        {/* ── FAQ Editor ── */}
        <Card style={{ marginTop: 24 }}>
          <h3 style={sectionTitle}>❓ 常見問題</h3>
          {faq.map((item, i) => (
            <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 12, background: '#f9fafb' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input value={item.q} onChange={e => { const f=[...faq]; f[i]={...f[i],q:e.target.value}; setFaq(f); }}
                  style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px' }} placeholder="問題" />
                <button type="button" onClick={() => setFaq(faq.filter((_,j)=>j!==i))}
                  style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
              </div>
              <textarea value={item.a} onChange={e => { const f=[...faq]; f[i]={...f[i],a:e.target.value}; setFaq(f); }}
                rows={2} style={{ ...fieldStyle, width: '100%' }} placeholder="回答" />
            </div>
          ))}
          <button type="button" onClick={() => setFaq([...faq, { q:'', a:'' }])}
            style={{ background: '#eff6ff', color: '#2563eb', border: '1px dashed #93c5fd', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', width: '100%', marginBottom: 16 }}>
            + 新增 FAQ
          </button>
          {faq.length > 0 && (
            <button type="button" onClick={async () => {
              const res = await fetch(`/api/admin/activities/${activityId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ faq }),
              });
              const json = await res.json();
              if (json.ok) alert('✅ FAQ 已儲存');
              else alert('❌ 儲存失敗');
            }} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
              💾 儲存 FAQ
            </button>
          )}
        </Card>

        {/* ── 場次管理 ── */}
        <ScheduleSection activityId={activityId} availablePlans={plans} />
      </div>
    </>
  );
}
