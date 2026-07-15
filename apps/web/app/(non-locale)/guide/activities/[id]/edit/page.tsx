'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { csrfHeaders } from '../../../../../../src/lib/csrf-client';
import { ImageUpload } from '../../../../../../src/components/admin/ImageUpload';
import { AddonsEditor } from '../../../../../../src/components/activity/AddonsEditor';
// 四大分類下拉：與 badge／篩選同源（category-tags.mjs），三處編輯器共用不重複定義。
import { CATEGORY_OPTIONS as CATEGORIES } from '../../../../../../src/lib/category-tags.mjs';
// 地區下拉：與後台/投稿同源（region-slugs.mjs 全 22 縣市），不再各自硬編舊 8 個。
import { listAllDivisions } from '../../../../../../src/lib/region-slugs.mjs';
import { normalizeRegionForActivityPath } from '../../../../../../src/lib/region-slug.mjs';

const REGIONS: string[] = listAllDivisions().map((d) => d.dbValue);

type Faq = { question: string; answer: string };

type EditorForm = {
  title: string;
  tagline: string;
  shortDescription: string;
  description: string;
  region: string;
  category: string;
  priceTwd: string;
  durationMinutes: string;
  meetingPoint: string;
  meetingPointMapUrl: string;
  coverImageUrl: string;
  imageUrls: string[];
  inclusions: string;
  exclusions: string;
  notices: string;
  refundRules: string;
  goodFor: string;
  safetyNotice: string;
  faq: Faq[];
};

const EMPTY: EditorForm = {
  title: '', tagline: '', shortDescription: '', description: '', region: '', category: '',
  priceTwd: '', durationMinutes: '', meetingPoint: '', meetingPointMapUrl: '',
  coverImageUrl: '', imageUrls: [], inclusions: '', exclusions: '', notices: '',
  refundRules: '', goodFor: '', safetyNotice: '', faq: [],
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

export default function GuideActivityEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || '');

  const [form, setForm] = useState<EditorForm>(EMPTY);
  const [slug, setSlug] = useState('');
  const [reviewState, setReviewState] = useState<'pending' | 'changes_requested' | null>(null);
  const [reviewAdminNote, setReviewAdminNote] = useState<string | null>(null);
  const [status, setStatus] = useState('draft');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const set = useCallback(<K extends keyof EditorForm>(key: K, value: EditorForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  useEffect(() => {
    void fetch('/api/guide/auth/csrf', { cache: 'no-store' });
    fetch(`/api/guide/activities/${id}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) { setError(j.error?.message || '載入失敗'); return; }
        const d = j.data;
        setSlug(d.slug || '');
        setStatus(d.status || 'draft');
        setReviewState(d.reviewState || null);
        setReviewAdminNote(d.reviewAdminNote || null);
        setForm({
          title: d.title || '', tagline: d.tagline || '', shortDescription: d.shortDescription || '',
          description: d.description || '', region: d.region || '', category: d.category || '',
          priceTwd: d.priceTwd != null ? String(d.priceTwd) : '',
          durationMinutes: d.durationMinutes != null ? String(d.durationMinutes) : '',
          meetingPoint: d.meetingPoint || '', meetingPointMapUrl: d.meetingPointMapUrl || '',
          coverImageUrl: d.coverImageUrl || '', imageUrls: Array.isArray(d.imageUrls) ? d.imageUrls : [],
          inclusions: toLines(d.inclusions), exclusions: toLines(d.exclusions),
          notices: toLines(d.notices), refundRules: toLines(d.refundRules), goodFor: toLines(d.goodFor),
          safetyNotice: d.safetyNotice || '',
          faq: Array.isArray(d.faq) ? d.faq.map((x: any) => ({ question: x.question || x.q || '', answer: x.answer || x.a || '' })) : [],
        });
      })
      .catch(() => setError('載入失敗'))
      .finally(() => setLoading(false));
  }, [id]);

  function buildPayload() {
    return {
      title: form.title,
      tagline: form.tagline,
      shortDescription: form.shortDescription,
      description: form.description,
      region: form.region,
      regionSlug: form.region ? normalizeRegionForActivityPath(form.region) : undefined,
      category: form.category,
      priceTwd: form.priceTwd === '' ? 0 : Number(form.priceTwd),
      durationMinutes: form.durationMinutes === '' ? null : Number(form.durationMinutes),
      meetingPoint: form.meetingPoint,
      meetingPointMapUrl: form.meetingPointMapUrl,
      coverImageUrl: form.coverImageUrl,
      imageUrls: form.imageUrls,
      inclusions: fromLines(form.inclusions),
      exclusions: fromLines(form.exclusions),
      notices: fromLines(form.notices),
      refundRules: fromLines(form.refundRules),
      goodFor: fromLines(form.goodFor),
      safetyNotice: form.safetyNotice,
      faq: form.faq.filter((f) => f.question.trim() || f.answer.trim()),
    };
  }

  async function handleSave(): Promise<boolean> {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/guide/activities/${id}`, {
        method: 'PUT',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify(buildPayload()),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || '儲存失敗');
      setNotice('已儲存草稿（尚未送審）');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '儲存失敗');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    // 先存檔再送審，確保最新內容進入 pending_changes。
    const saved = await handleSave();
    if (!saved) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/guide/activities/${id}/submit`, {
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
      <button onClick={() => router.push('/guide/activities')} style={{ background: 'none', border: 'none', color: '#0f766e', cursor: 'pointer', marginBottom: 12, fontSize: 14 }}>
        ‹ 返回我的行程
      </button>

      {/* 審核狀態橫幅 */}
      {reviewState === 'pending' && (
        <div style={{ background: '#dbeafe', color: '#1e40af', padding: 14, borderRadius: 10, marginBottom: 16 }}>
          🔍 此行程修訂正在審核中。{status === 'published' ? '前台仍顯示原本已上架的內容。' : ''}審核期間仍可繼續編輯，送審後的最新內容會一併交由管理者檢視。
        </div>
      )}
      {reviewState === 'changes_requested' && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: 14, borderRadius: 10, marginBottom: 16 }}>
          ↩️ 管理者已退回此修訂，請修改後重新送審。{reviewAdminNote ? `退回原因：${reviewAdminNote}` : ''}
        </div>
      )}

      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>編輯行程</h1>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>
        儲存只會存成草稿；按「送出審核」後交由管理者核准。方案與每方案價格請至「方案管理」編輯（同樣經審核生效）；場次與可預約時段請至「時間管理」設定。
      </p>
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => router.push(`/guide/activities/${id}/plans`)}
          style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', color: '#7c3aed', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
        >
          🧩 管理方案與價格 ›
        </button>
      </div>

      {error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 8, marginBottom: 16 }} role="alert">{error}</div>}
      {notice && <div style={{ background: '#dcfce7', color: '#166534', padding: 12, borderRadius: 8, marginBottom: 16 }}>{notice}</div>}

      {/* 基本資訊 */}
      <section style={sectionStyle}>
        <div style={sectionTitle}>基本資訊</div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>行程名稱</label>
          <input style={fieldStyle} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="例：龜山島賞鯨一日遊" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>地區</label>
            <select style={fieldStyle} value={form.region} onChange={(e) => set('region', e.target.value)}>
              <option value="">請選擇</option>
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>類別</label>
            <select style={fieldStyle} value={form.category} onChange={(e) => set('category', e.target.value)}>
              <option value="">請選擇</option>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>一句話標語（tagline）</label>
          <input style={fieldStyle} value={form.tagline} onChange={(e) => set('tagline', e.target.value)} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>短描述</label>
          <textarea style={{ ...fieldStyle, minHeight: 60 }} value={form.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>完整描述</label>
          <textarea style={{ ...fieldStyle, minHeight: 140 }} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </div>
      </section>

      {/* 定價與集合 */}
      <section style={sectionStyle}>
        <div style={sectionTitle}>定價與集合</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>每人價格（TWD）</label>
            <input type="number" style={fieldStyle} value={form.priceTwd} onChange={(e) => set('priceTwd', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>行程時長（分鐘）</label>
            <input type="number" style={fieldStyle} value={form.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value)} />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>集合地點</label>
          <input style={fieldStyle} value={form.meetingPoint} onChange={(e) => set('meetingPoint', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>集合地點地圖連結</label>
          <input style={fieldStyle} value={form.meetingPointMapUrl} onChange={(e) => set('meetingPointMapUrl', e.target.value)} />
        </div>
      </section>

      {/* 圖片（共用 admin ImageUpload，端點指向 guide 路由） */}
      <section style={sectionStyle}>
        <div style={sectionTitle}>圖片</div>
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>封面圖（16:9）</label>
          <ImageUpload
            activityId={id}
            activitySlug={slug || id}
            type="cover"
            uploadApiBase="/api/guide/activities"
            currentUrl={form.coverImageUrl}
            onUpload={(url) => set('coverImageUrl', url)}
          />
        </div>
        <div>
          <label style={labelStyle}>相簿照片（3:2）</label>
          <ImageUpload
            activityId={id}
            activitySlug={slug || id}
            type="gallery"
            uploadApiBase="/api/guide/activities"
            currentUrls={form.imageUrls}
            onGalleryUpdate={(urls) => set('imageUrls', urls)}
          />
        </div>
      </section>

      {/* 行程詳情 */}
      <section style={sectionStyle}>
        <div style={sectionTitle}>行程詳情（每行一項）</div>
        {([
          ['inclusions', '包含項目'],
          ['exclusions', '不包含項目'],
          ['notices', '注意事項'],
          ['refundRules', '退款規則'],
          ['goodFor', '適合對象'],
        ] as Array<[keyof EditorForm, string]>).map(([key, label]) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{label}</label>
            <textarea style={{ ...fieldStyle, minHeight: 80 }} value={form[key] as string} onChange={(e) => set(key, e.target.value as never)} />
          </div>
        ))}
        <div>
          <label style={labelStyle}>安全說明</label>
          <textarea style={{ ...fieldStyle, minHeight: 60 }} value={form.safetyNotice} onChange={(e) => set('safetyNotice', e.target.value)} />
        </div>
      </section>

      {/* 常見問題 FAQ */}
      <section style={sectionStyle}>
        <div style={sectionTitle}>常見問題（FAQ）</div>
        {form.faq.map((f, i) => (
          <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 10 }}>
            <input
              style={{ ...fieldStyle, marginBottom: 8 }}
              placeholder="問題"
              value={f.question}
              onChange={(e) => set('faq', form.faq.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))}
            />
            <textarea
              style={{ ...fieldStyle, minHeight: 56 }}
              placeholder="答案"
              value={f.answer}
              onChange={(e) => set('faq', form.faq.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
            />
            <button
              onClick={() => set('faq', form.faq.filter((_, j) => j !== i))}
              style={{ marginTop: 8, background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontSize: 13 }}
            >
              刪除這題
            </button>
          </div>
        ))}
        <button
          onClick={() => set('faq', [...form.faq, { question: '', answer: '' }])}
          style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 14 }}
        >
          ＋ 新增問題
        </button>
      </section>

      {/* 加購項目（即時生效，不經審核；未設定則結帳頁隱藏） */}
      <section style={sectionStyle}>
        <div style={sectionTitle}>加購項目</div>
        <AddonsEditor endpointBase={`/api/v2/guide/activities/${id}/addons`} />
      </section>

      {/* 動作列 */}
      <div style={{ display: 'flex', gap: 12, position: 'sticky', bottom: 0, background: '#f8fafc', padding: '16px 0' }}>
        <button
          onClick={handleSave}
          disabled={saving || submitting}
          style={{ flex: 1, background: '#fff', border: '1px solid #0f766e', color: '#0f766e', borderRadius: 8, padding: '12px', fontWeight: 600, cursor: saving ? 'default' : 'pointer' }}
        >
          {saving ? '儲存中…' : '儲存草稿'}
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving || submitting}
          style={{ flex: 1, background: '#0f766e', color: '#fff', border: 'none', borderRadius: 8, padding: '12px', fontWeight: 600, cursor: submitting ? 'default' : 'pointer' }}
        >
          {submitting ? '送審中…' : '送出審核'}
        </button>
      </div>
    </div>
  );
}
