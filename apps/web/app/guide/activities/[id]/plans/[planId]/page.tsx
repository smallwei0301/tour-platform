'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { csrfHeaders } from '../../../../../../src/lib/csrf-client';
import { ImageUpload } from '../../../../../../src/components/admin/ImageUpload';

type ItineraryStep = { icon: string; title: string; duration: string; description: string; imageUrl: string };

function createEmptyStep(): ItineraryStep {
  return { icon: '', title: '', duration: '', description: '', imageUrl: '' };
}
function toItinerary(value: unknown): ItineraryStep[] {
  if (!Array.isArray(value)) return [];
  return value.map((s: Record<string, unknown>) => ({
    icon: String(s?.icon ?? ''),
    // 相容舊版單行 { text } → 映射為 title
    title: String(s?.title ?? s?.text ?? ''),
    duration: String(s?.duration ?? ''),
    description: String(s?.description ?? ''),
    imageUrl: String(s?.imageUrl ?? s?.image_url ?? ''),
  }));
}
function itineraryForPayload(steps: ItineraryStep[]) {
  return steps
    .map((s) => ({
      icon: s.icon.trim(), title: s.title.trim(), duration: s.duration.trim(),
      description: s.description.trim(), imageUrl: s.imageUrl.trim(),
    }))
    // 完全空白的站點丟棄（至少要有 title / description / imageUrl 其一）
    .filter((s) => s.title || s.description || s.imageUrl);
}

const PRICE_TYPES = [
  { value: 'per_person', label: '每人計價' },
  { value: 'per_group', label: '每團計價' },
];
const BOOKING_TYPES = [
  { value: 'scheduled', label: '依場次預約' },
  { value: 'request', label: '需導遊確認' },
  { value: 'instant', label: '即時確認' },
];

type PlanForm = {
  name: string;
  description: string;
  price_type: string;
  base_price: string;
  duration_minutes: string;
  min_participants: string;
  max_participants: string;
  booking_type: string;
  highlights: string;
  plan_inclusions: string;
  plan_exclusions: string;
  plan_notices: string;
  plan_refund_rules: string;
  plan_itinerary: ItineraryStep[];
};

const EMPTY: PlanForm = {
  name: '', description: '', price_type: 'per_person', base_price: '', duration_minutes: '',
  min_participants: '1', max_participants: '10', booking_type: 'scheduled',
  highlights: '', plan_inclusions: '', plan_exclusions: '', plan_notices: '', plan_refund_rules: '',
  plan_itinerary: [],
};

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#334155' };
const fieldStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' };
const sectionStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 16 };
const sectionTitle: React.CSSProperties = { fontSize: 16, fontWeight: 700, marginBottom: 16 };

function toLines(arr: unknown): string {
  return Array.isArray(arr) ? arr.join('\n') : '';
}
function fromLines(text: string): string[] {
  return text.split('\n').map((s) => s.trim()).filter(Boolean);
}

export default function GuidePlanEditPage() {
  const params = useParams();
  const router = useRouter();
  const activityId = String(params?.id || '');
  const planId = String(params?.planId || '');
  const isNew = planId === 'new';

  const [form, setForm] = useState<PlanForm>(EMPTY);
  const [reviewState, setReviewState] = useState<'pending' | 'changes_requested' | null>(null);
  const [reviewAdminNote, setReviewAdminNote] = useState<string | null>(null);
  const [status, setStatus] = useState('inactive');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const set = useCallback(<K extends keyof PlanForm>(key: K, value: PlanForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  useEffect(() => {
    void fetch('/api/guide/auth/csrf', { cache: 'no-store' });
    if (isNew) return;
    fetch(`/api/guide/activities/${activityId}/plans/${planId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) { setError(j.error?.message || '載入失敗'); return; }
        const d = j.data;
        setStatus(d.status || 'inactive');
        setReviewState(d.reviewState || null);
        setReviewAdminNote(d.reviewAdminNote || null);
        setForm({
          name: d.name || '', description: d.description || '',
          price_type: d.price_type || 'per_person',
          base_price: d.base_price != null ? String(d.base_price) : '',
          duration_minutes: d.duration_minutes != null ? String(d.duration_minutes) : '',
          min_participants: d.min_participants != null ? String(d.min_participants) : '1',
          max_participants: d.max_participants != null ? String(d.max_participants) : '10',
          booking_type: d.booking_type || 'scheduled',
          highlights: toLines(d.highlights),
          plan_inclusions: toLines(d.plan_inclusions),
          plan_exclusions: toLines(d.plan_exclusions),
          plan_notices: toLines(d.plan_notices),
          plan_refund_rules: toLines(d.plan_refund_rules),
          plan_itinerary: toItinerary(d.plan_itinerary),
        });
      })
      .catch(() => setError('載入失敗'))
      .finally(() => setLoading(false));
  }, [activityId, planId, isNew]);

  function buildPayload() {
    return {
      name: form.name,
      description: form.description,
      price_type: form.price_type,
      base_price: form.base_price === '' ? 0 : Number(form.base_price),
      duration_minutes: form.duration_minutes === '' ? 0 : Number(form.duration_minutes),
      min_participants: form.min_participants === '' ? 1 : Number(form.min_participants),
      max_participants: form.max_participants === '' ? 1 : Number(form.max_participants),
      booking_type: form.booking_type,
      highlights: fromLines(form.highlights),
      plan_inclusions: fromLines(form.plan_inclusions),
      plan_exclusions: fromLines(form.plan_exclusions),
      plan_notices: fromLines(form.plan_notices),
      plan_refund_rules: fromLines(form.plan_refund_rules),
      plan_itinerary: itineraryForPayload(form.plan_itinerary),
    };
  }

  async function handleCreate() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/guide/activities/${activityId}/plans`, {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify(buildPayload()),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || '建立失敗');
      // 建立後導向新方案的編輯頁，導遊可接著「送出審核」。
      router.push(`/guide/activities/${activityId}/plans/${json.data.plan.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '建立失敗');
      setSaving(false);
    }
  }

  async function handleSave(): Promise<boolean> {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/guide/activities/${activityId}/plans/${planId}`, {
        method: 'PUT',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify(buildPayload()),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || '儲存失敗');
      setNotice('已儲存（尚未送審）');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '儲存失敗');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    const saved = await handleSave();
    if (!saved) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/guide/activities/${activityId}/plans/${planId}/submit`, {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || '送審失敗');
      setReviewState('pending');
      setNotice('已送出審核，請等待管理者核准上架。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '送審失敗');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p style={{ color: '#64748b' }}>載入中…</p>;

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <button onClick={() => router.push(`/guide/activities/${activityId}/plans`)} style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', marginBottom: 12, fontSize: 14 }}>
        ‹ 返回方案管理
      </button>

      {reviewState === 'pending' && (
        <div style={{ background: '#dbeafe', color: '#1e40af', padding: 14, borderRadius: 10, marginBottom: 16 }}>
          🔍 此方案修訂正在審核中。{status === 'active' ? '前台仍以原方案內容售票。' : ''}審核期間仍可繼續編輯，送審後的最新內容會一併交由管理者檢視。
        </div>
      )}
      {reviewState === 'changes_requested' && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: 14, borderRadius: 10, marginBottom: 16 }}>
          ↩️ 管理者已退回此方案，請修改後重新送審。{reviewAdminNote ? `退回原因：${reviewAdminNote}` : ''}
        </div>
      )}

      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{isNew ? '新增方案' : '編輯方案'}</h1>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>
        {isNew
          ? '建立後方案會以「草稿」狀態存放（不對外售票），按「送出審核」交管理者核准才會上架。'
          : '儲存只會存成待審內容；按「送出審核」後交由管理者核准才會生效。'}
      </p>

      {error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 8, marginBottom: 16 }} role="alert">{error}</div>}
      {notice && <div style={{ background: '#dcfce7', color: '#166534', padding: 12, borderRadius: 8, marginBottom: 16 }}>{notice}</div>}

      {/* 基本與定價 */}
      <section style={sectionStyle}>
        <div style={sectionTitle}>基本與定價</div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>方案名稱</label>
          <input style={fieldStyle} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="例：包船賞鯨升級方案" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>計價方式</label>
            <select style={fieldStyle} value={form.price_type} onChange={(e) => set('price_type', e.target.value)}>
              {PRICE_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>價格（TWD）</label>
            <input type="number" style={fieldStyle} value={form.base_price} onChange={(e) => set('base_price', e.target.value)} placeholder="1800" />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>時長（分鐘）</label>
            <input type="number" style={fieldStyle} value={form.duration_minutes} onChange={(e) => set('duration_minutes', e.target.value)} placeholder="240" />
          </div>
          <div>
            <label style={labelStyle}>最少人數</label>
            <input type="number" style={fieldStyle} value={form.min_participants} onChange={(e) => set('min_participants', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>最多人數</label>
            <input type="number" style={fieldStyle} value={form.max_participants} onChange={(e) => set('max_participants', e.target.value)} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>預約方式</label>
          <select style={fieldStyle} value={form.booking_type} onChange={(e) => set('booking_type', e.target.value)}>
            {BOOKING_TYPES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </div>
      </section>

      {/* 方案內容 */}
      <section style={sectionStyle}>
        <div style={sectionTitle}>方案內容</div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>方案描述</label>
          <textarea style={{ ...fieldStyle, minHeight: 80 }} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </div>
        {([
          ['highlights', '方案亮點'],
          ['plan_inclusions', '包含項目'],
          ['plan_exclusions', '不包含項目'],
          ['plan_notices', '注意事項'],
          ['plan_refund_rules', '退款規則'],
        ] as Array<[keyof PlanForm, string]>).map(([key, label]) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{label}（每行一項）</label>
            <textarea style={{ ...fieldStyle, minHeight: 70 }} value={form[key] as string} onChange={(e) => set(key, e.target.value as never)} />
          </div>
        ))}
      </section>

      {/* 站點時間表（隨方案送審；新方案存草稿後可編） */}
      {!isNew && (
        <section style={sectionStyle}>
          <div style={sectionTitle}>站點時間表</div>
          <p style={{ color: '#64748b', fontSize: 13, marginTop: -8, marginBottom: 14 }}>
            一站一張卡，可填圖示、站名、停留時間、說明與照片。與方案內容一起送審。
          </p>
          {form.plan_itinerary.map((step, i) => (
            <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  style={{ ...fieldStyle, width: 56, textAlign: 'center' }}
                  placeholder="📍"
                  value={step.icon}
                  onChange={(e) => set('plan_itinerary', form.plan_itinerary.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x)))}
                />
                <input
                  style={{ ...fieldStyle, flex: 1 }}
                  placeholder="站名（例：烏石港集合）"
                  value={step.title}
                  onChange={(e) => set('plan_itinerary', form.plan_itinerary.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                />
                <input
                  style={{ ...fieldStyle, width: 110 }}
                  placeholder="60分鐘"
                  value={step.duration}
                  onChange={(e) => set('plan_itinerary', form.plan_itinerary.map((x, j) => (j === i ? { ...x, duration: e.target.value } : x)))}
                />
                <button
                  onClick={() => set('plan_itinerary', form.plan_itinerary.filter((_, j) => j !== i))}
                  aria-label="刪除站點"
                  style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontSize: 18 }}
                >
                  ✕
                </button>
              </div>
              <textarea
                style={{ ...fieldStyle, minHeight: 56, marginBottom: 8 }}
                placeholder="站點說明"
                value={step.description}
                onChange={(e) => set('plan_itinerary', form.plan_itinerary.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
              />
              {step.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- 站點縮圖預覽，尺寸不固定，用原生 img 即可
                <img src={step.imageUrl} alt="站點照片" style={{ maxWidth: 240, aspectRatio: '3 / 2', objectFit: 'cover', borderRadius: 6, display: 'block', marginBottom: 8 }} />
              )}
              <ImageUpload
                activityId={activityId}
                activitySlug={activityId}
                type="gallery"
                uploadApiBase="/api/guide/activities"
                onUploaded={(url) => set('plan_itinerary', form.plan_itinerary.map((x, j) => (j === i ? { ...x, imageUrl: url } : x)))}
              />
            </div>
          ))}
          <button
            onClick={() => set('plan_itinerary', [...form.plan_itinerary, createEmptyStep()])}
            style={{ width: '100%', background: '#f5f3ff', border: '1px dashed #c4b5fd', borderRadius: 8, padding: '10px', color: '#7c3aed', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
          >
            ＋ 新增站點
          </button>
        </section>
      )}
      {!isNew && (
        <section style={{ ...sectionStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>季節供應</div>
            <div style={{ color: '#64748b', fontSize: 13 }}>設定方案在一年中可預約的日期（即時生效，不需審核）。</div>
          </div>
          <button
            onClick={() => router.push(`/guide/activities/${activityId}/plans/${planId}/seasons`)}
            style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', color: '#7c3aed', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 14, whiteSpace: 'nowrap' }}
          >
            📅 管理季節供應 ›
          </button>
        </section>
      )}

      {/* 動作列 */}
      <div style={{ display: 'flex', gap: 12, position: 'sticky', bottom: 0, background: '#f9fafb', padding: '16px 0' }}>
        {isNew ? (
          <button
            onClick={handleCreate}
            disabled={saving}
            style={{ flex: 1, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '12px', fontWeight: 600, cursor: saving ? 'default' : 'pointer' }}
          >
            {saving ? '建立中…' : '建立方案（草稿）'}
          </button>
        ) : (
          <>
            <button
              onClick={handleSave}
              disabled={saving || submitting}
              style={{ flex: 1, background: '#fff', border: '1px solid #7c3aed', color: '#7c3aed', borderRadius: 8, padding: '12px', fontWeight: 600, cursor: saving ? 'default' : 'pointer' }}
            >
              {saving ? '儲存中…' : '儲存'}
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || submitting}
              style={{ flex: 1, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '12px', fontWeight: 600, cursor: submitting ? 'default' : 'pointer' }}
            >
              {submitting ? '送審中…' : '送出審核'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
