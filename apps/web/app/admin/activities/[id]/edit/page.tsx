'use client';
import Image from 'next/image';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { csrfHeaders } from '../../../../../src/lib/csrf-client';
import { Card, PageHeader, Badge } from '../../../../../src/components/admin/ui';
import { FormGrid } from '../../../../../src/components/admin/responsive';
import { GuideSearch } from '../../../../../src/components/admin/GuideSearch';
import { ImageUpload } from '../../../../../src/components/admin/ImageUpload';
import { buildActivityHref, normalizeRegionSlug } from '../../../../../src/lib/activity-url';
import { normalizeSocialProofQuotes } from '../../../../../src/lib/social-proof-quotes.mjs';
import { REGION_REGISTRY } from '../../../../../src/lib/region-slugs.mjs';
// 四大分類下拉：與 badge／篩選同源（category-tags.mjs），三處編輯器共用不重複定義。
import { CATEGORY_OPTIONS as CATEGORIES } from '../../../../../src/lib/category-tags.mjs';
// #1615 第二批拆檔：場次管理／口碑語錄／FAQ／JSON 匯出樣板拆至 activity-form/，
// 純結構搬移、零行為變更；跨區塊狀態仍在本頁（lift state）以 props 傳遞。
import { ScheduleSection } from '../../../../../src/components/admin/activity-form/ScheduleSection';
import {
  SocialProofQuotesEditor,
  QUOTE_PHOTO_MAX,
  type SocialProofQuoteRow,
} from '../../../../../src/components/admin/activity-form/SocialProofQuotesEditor';
import { FaqEditorCard } from '../../../../../src/components/admin/activity-form/FaqEditorCard';
import { AddonsEditor } from '../../../../../src/components/activity/AddonsEditor';
import { buildActivityExportTemplate } from '../../../../../src/components/admin/activity-form/export-template';
import { fieldStyle, labelStyle, sectionTitle } from '../../../../../src/components/admin/activity-form/form-styles';

// 地區清單與 slug 對照以 region-slugs.mjs 的 REGION_REGISTRY 為單一真實來源，
// 涵蓋全台 18 縣市（過去硬編 8 個且 slug 對照另寫一份，易 drift／漏對應）。
const REGIONS: string[] = Object.values(REGION_REGISTRY).map(r => r.dbValue);
const REGION_SLUG_MAP: Record<string, string> = Object.fromEntries(
  Object.values(REGION_REGISTRY).map(r => [r.dbValue, r.slug]),
);

const STATUS_BADGE: Record<string, { variant: 'success' | 'warning' | 'danger' | 'default'; label: string }> = {
  draft:     { variant: 'warning', label: '草稿' },
  published: { variant: 'success', label: '已發佈' },
  archived:  { variant: 'default', label: '已封存' },
};

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
  // 附加地區（複選）：行程除主要地區外也涵蓋的其他縣市，用於多地區篩選曝光。
  const [additionalRegions,  setAdditionalRegions]  = useState<string[]>([]);
  const [category,           setCategory]           = useState('');
  const [priceTwd,           setPriceTwd]           = useState('');
  const [durationMinutes,    setDurationMinutes]    = useState('');
  // #297 人數限制（最少／最多人數）以「方案」為唯一真實來源（旅客下單與導遊後台
  // 皆讀方案層級），活動層級輸入已移除；改於「方案管理」各方案設定。
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
  const [socialProofQuotes,  setSocialProofQuotes]  = useState<SocialProofQuoteRow[]>([]);
  const [faq,                setFaq]                = useState<Array<{q:string;a:string}>>([]);
  const [status,             setStatus]             = useState('draft');
  // 方案改由「方案管理」(V2) 維護；此頁只在「JSON 匯入」帶入 V2 方案時，暫存一次性
  // insert-only 匯入用（送出後清空）。舊版 activities.plans 已停用（#admin-plan-revert）。
  const [importedPlans,      setImportedPlans]      = useState<Array<Record<string, unknown>> | null>(null);
  const [ratingAvg,          setRatingAvg]          = useState('');
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
        setAdditionalRegions(Array.isArray(d.regions) ? d.regions.filter((r: unknown): r is string => typeof r === 'string' && r.length > 0) : []);
        setCategory(d.category || '');
        setPriceTwd(String(d.priceTwd || ''));
        setDurationMinutes(String(d.durationMinutes || ''));
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
        setSocialProofQuotes(normalizeSocialProofQuotes(d.socialProofQuotes));
        setFaq(d.faq || []);
        setRatingAvg(d.ratingAvg != null ? String(d.ratingAvg) : '');
        setStatus(d.status || 'draft');
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
    if (d.activityPlans != null && !Array.isArray(d.activityPlans)) errors.push('activityPlans 必須是陣列');
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
      ['activityPlans（V2 方案，匯入後於「方案管理」維護）', importedPlans ?? [], Array.isArray(d.activityPlans) ? d.activityPlans : []],
      ['faq', faq, Array.isArray(d.faq) ? d.faq : []],
    ].filter(([, before, after]) => JSON.stringify(before) !== JSON.stringify(after))
     .map(([field, before, after]) => ({ field: String(field), before: summarize(before), after: summarize(after) }));
  }

  function applyImportedActivity(d: any) {
    setTitle(d.title || '');
    setGuideSlug(d.guideSlug || '');
    setRegion(d.region || '');
    setAdditionalRegions(Array.isArray(d.regions) ? d.regions.filter((r: unknown): r is string => typeof r === 'string' && r.length > 0) : []);
    setCategory(d.category || '');
    setPriceTwd(String(d.priceTwd || ''));
    setDurationMinutes(String(d.durationMinutes || ''));
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
    setSocialProofQuotes(normalizeSocialProofQuotes(d.socialProofQuotes));
    setFaq(Array.isArray(d.faq) ? d.faq : []);
    // V2 方案：匯入時只暫存，儲存時 insert-only 建立尚不存在的方案（不覆蓋既有）。
    setImportedPlans(Array.isArray(d.activityPlans) && d.activityPlans.length ? d.activityPlans : null);
    setSuccess('✅ 已從 JSON 匯入內容；方案將於儲存時「只新增不覆蓋」建立，後續請至「方案管理」維護');
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
    // #1531+: 「下載 JSON 樣板」匯出「當前正在編輯的這個行程」的所有文案設定，
    //  而非固定的柴山範例，方便操作者複製、備份或微調後再匯入。
    //  匯出 shape 與 applyImportedActivity 讀取的 shape 一致，確保下載後可原樣重新匯入
    //  （樣板組裝拆至 activity-form/export-template.ts，輸入即本頁即時值）。
    const template = buildActivityExportTemplate({
      title, guideSlug, region, category, priceTwd, durationMinutes,
      meetingPoint, meetingPointMapUrl, coverImageUrl, imageUrls,
      tagline, shortDescription, description, inclusions, exclusions,
      notices, refundRules, safetyNotice, goodFor, socialProofQuotes, faq,
    });
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    // 檔名帶上當前行程 slug／ID，避免不同行程下載後互相覆蓋
    const fileSlug = (activitySlug || activityId || 'activity').replace(/[^a-zA-Z0-9_-]/g, '-');
    a.href = url; a.download = `activity-${fileSlug}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    const toArray = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean);
    try {
      const res = await fetch(`/api/admin/activities/${activityId}`, {
        method: 'PUT',
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          title: title.trim(), guideSlug: guideSlug || undefined,
          region,
          regionSlug: normalizeRegionSlug(region, REGION_SLUG_MAP[region]),
          // 附加地區（複選）：排除與主要地區重複者，後端會再正規化去重一次。
          regions: additionalRegions.filter(r => r !== region),
          category,
          priceTwd: Number(priceTwd),
          durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
          // #297 不再送活動層級人數限制：以方案層級為準（payload 省略時 updateActivityDb 保留既有值）
          meetingPoint, meetingPointMapUrl, coverImageUrl,
          description, shortDescription, tagline,
          inclusions: toArray(inclusions), exclusions: toArray(exclusions),
          notices: toArray(notices), refundRules: toArray(refundRules),
          safetyNotice: safetyNotice.trim() || undefined,
          goodFor: toArray(goodFor),
          // 社群口碑語錄：結構化（人名／星數／內容），空內容項目過濾掉
          socialProofQuotes: socialProofQuotes
            .map(q => ({ author: q.author.trim(), rating: q.rating, text: q.text.trim(), photos: (q.photos ?? []).filter(Boolean).slice(0, QUOTE_PHOTO_MAX) }))
            .filter(q => q.text.length > 0),
          faq,
          imageUrls,
          ratingAvg: ratingAvg !== '' ? Number(ratingAvg) : null,
          // reviewCount 已移除手動輸入：由後端以「口碑語錄 + 已核准評論」自動對齊
          // V2 方案 insert-only 匯入：僅在本次由 JSON 帶入方案時送出，後端只新增不覆蓋
          // 既有方案（活動層級 itinerary 與舊 plans 已停寫；方案唯一來源＝方案管理）。
          ...(importedPlans && importedPlans.length ? { activityPlans: importedPlans } : {}),
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setSuccess('✅ 儲存成功');
        setImportedPlans(null); // 一次性匯入完成即清空，避免重複送
      } else {
        setError(json.error?.message || '更新失敗');
      }
    } catch { setError('網路錯誤'); }
    finally { setSaving(false); }
  }

  // ── 社群口碑語錄（結構化）編輯 ──
  function addQuote() {
    setSocialProofQuotes(prev => [...prev, { author: '', rating: 5, text: '', photos: [] }]);
  }
  function updateQuote(index: number, patch: Partial<SocialProofQuoteRow>) {
    setSocialProofQuotes(prev => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }
  function removeQuote(index: number) {
    setSocialProofQuotes(prev => prev.filter((_, i) => i !== index));
  }

  // 暖場評論照片上傳：與旅客評價照片共用 review-photos 桶（admin upload-image type=review，
  // 不限比例），最多 5 張。上傳後把 public URL append 進該則口碑的 photos。
  const [quotePhotoUploading, setQuotePhotoUploading] = useState<number | null>(null);
  async function uploadQuotePhotos(index: number, startCount: number, files: File[]) {
    if (files.length === 0) return;
    const remaining = QUOTE_PHOTO_MAX - startCount;
    if (remaining <= 0) return;
    setQuotePhotoUploading(index);
    try {
      for (const file of files.slice(0, remaining)) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('type', 'review');
        fd.append('slug', activitySlug || activityId);
        const res = await fetch(`/api/admin/activities/${activityId}/upload-image`, {
          method: 'POST',
          headers: csrfHeaders(),
          body: fd,
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j.error) throw new Error(j.error?.message || '照片上傳失敗');
        setSocialProofQuotes(prev => prev.map((q, i) => {
          if (i !== index) return q;
          const photos = [...(q.photos ?? [])];
          if (photos.length < QUOTE_PHOTO_MAX) photos.push(j.data.url);
          return { ...q, photos };
        }));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : '照片上傳失敗');
    } finally {
      setQuotePhotoUploading(null);
    }
  }
  function removeQuotePhoto(index: number, url: string) {
    setSocialProofQuotes(prev => prev.map((q, i) => (
      i === index ? { ...q, photos: (q.photos ?? []).filter(u => u !== url) } : q
    )));
  }

  async function handleStatusChange(newStatus: string) {
    setStatusBusy(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/admin/activities/${activityId}/status`, {
        method: 'PATCH',
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.ok) {
        setStatus(newStatus);
        setSuccess(`✅ 狀態已更新為「${STATUS_BADGE[newStatus]?.label || newStatus}」`);
      } else if (json.error?.code === 'BOOKING_READINESS_FAILED') {
        const details: Array<{ messageZh?: string; code?: string }> = json.error?.details ?? [];
        const detailLines = details.length > 0
          ? details.map((d: { messageZh?: string; code?: string }) => d.messageZh || d.code || '').filter(Boolean).join('\n')
          : '';
        setError(`${json.error.message}${detailLines ? `\n\n發現以下問題：\n${detailLines}` : ''}`);
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
            <a
              href={`/admin/activities/${activityId}/plans`}
              style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #10b981', padding: '8px 14px', borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: 'none' }}
            >
              📋 方案管理
            </a>
            {status === 'published' && activitySlug && REGION_SLUG_MAP[region] && (
              <a
                href={buildActivityHref({ slug: activitySlug, region, regionSlug: REGION_SLUG_MAP[region] })}
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

      <div className="admin-page" style={{ maxWidth: 800 }}>
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
              <button type="button" onClick={downloadTemplate} title="匯出目前編輯中行程的所有文案設定（含尚未儲存的修改）" style={{ background: '#f9fafb', color: '#374151', border: '1px solid #d1d5db', padding: '8px 14px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
                ⬇️ 下載目前行程 JSON
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
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 140px) 1fr 1fr', gap: 8 }}>
                      <div style={{ fontWeight: 600, wordBreak: 'break-word' }}>{row.field}</div>
                      <div style={{ color: '#6b7280', wordBreak: 'break-word' }}>原：{row.before}</div>
                      <div style={{ color: '#166534', wordBreak: 'break-word' }}>新：{row.after}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <h3 style={sectionTitle}>📝 基本資訊</h3>

            <label htmlFor="activity-edit-title" style={labelStyle}>
              行程名稱 *
              <input id="activity-edit-title" type="text" value={title} onChange={e => setTitle(e.target.value)} style={fieldStyle} required aria-required="true" />
            </label>

            <div style={labelStyle}>
              <span style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 14 }}>導遊</span>
              <GuideSearch
                value={guideSlug}
                onChange={(slug) => setGuideSlug(slug)}
                style={{ marginTop: 0 }}
              />
            </div>

            <FormGrid cols={2} gap={16}>
              <label style={labelStyle}>
                主要地區
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
            </FormGrid>

            {/* 附加地區（複選）：行程也涵蓋的其他縣市；主要地區決定 URL/SEO，附加地區讓行程在多個地區篩選中出現。 */}
            <fieldset style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, margin: 0 }}>
              <legend style={{ ...labelStyle, padding: '0 6px' }}>附加地區（複選）</legend>
              <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px' }}>
                除主要地區外，這個行程還涵蓋哪些縣市？可複選；旅客用任一地區篩選時都會看到此行程。主要地區不需重複勾選。
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 6 }}>
                {REGIONS.filter(r => r !== region).map(r => {
                  const checked = additionalRegions.includes(r);
                  return (
                    <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 400, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        value={r}
                        checked={checked}
                        onChange={e => {
                          setAdditionalRegions(prev =>
                            e.target.checked ? [...prev, r] : prev.filter(x => x !== r),
                          );
                        }}
                      />
                      {r}
                    </label>
                  );
                })}
              </div>
            </fieldset>

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
            <FormGrid cols={2} gap={16}>
              <label style={labelStyle}>
                價格/人 (TWD) *
                <input type="number" value={priceTwd} onChange={e => setPriceTwd(e.target.value)} min={0} style={fieldStyle} required aria-required="true" />
              </label>
              <label style={labelStyle}>
                行程時長（分鐘）
                <input type="number" value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} min={0} style={fieldStyle} />
              </label>
            </FormGrid>
            <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13, lineHeight: 1.6 }}>
              👥 人數限制（最少／最多人數）改於「方案管理」各方案設定 — 旅客下單與導遊後台皆以方案的人數限制為準。
            </p>

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
            {/* CSRF contract: ImageUpload performs FormData POST to upload-image with headers: csrfHeaders() (no content-type). */}
            <label style={{ ...labelStyle, marginBottom: 8 }}>封面圖</label>
            <ImageUpload
              activityId={activityId}
              activitySlug={title.toLowerCase().replace(/\s+/g, '-') || activityId}
              type="cover"
              currentUrl={coverImageUrl}
              onUpload={setCoverImageUrl}
            />
            <div style={{ marginTop: 12, marginBottom: 16 }}>
              <label htmlFor="activity-edit-cover-image-url" style={{ ...labelStyle, marginBottom: 4, fontSize: 12, color: '#6b7280' }}>或直接貼上封面圖 URL</label>
              <input
                id="activity-edit-cover-image-url"
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
              <label htmlFor="activity-edit-gallery-urls" style={{ ...labelStyle, marginBottom: 4, fontSize: 12, color: '#6b7280' }}>或直接貼上活動照片 URL（每行一張）</label>
              <textarea
                id="activity-edit-gallery-urls"
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
                      <Image src={url} alt={`活動圖片 ${i + 1} 預覽`} style={{ width: 96, height: 64, objectFit: 'cover', borderRadius: 6, background: '#f3f4f6' }} width={96} height={64} />
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
              <textarea value={refundRules} onChange={e => setRefundRules(e.target.value)} rows={3} style={fieldStyle} placeholder={'出團 168 小時前（含）取消：100%退款\n出團前 超過 72 小時且少於 168 小時取消：70%退款\n出團前 72 小時內（含）取消：不退款'} />
            </label>
            <label style={labelStyle}>
              安全說明
              <textarea value={safetyNotice} onChange={e => setSafetyNotice(e.target.value)} rows={2} style={fieldStyle} placeholder="請確保攜帶個人藥品，行程含輕度步行" />
            </label>
            <label style={labelStyle}>
              適合對象（每行一項）
              <textarea value={goodFor} onChange={e => setGoodFor(e.target.value)} rows={3} style={fieldStyle} placeholder={'喜愛歷史文化\n家庭親子旅遊\n銀髮族友善'} />
            </label>
            <SocialProofQuotesEditor
              socialProofQuotes={socialProofQuotes}
              quotePhotoUploading={quotePhotoUploading}
              addQuote={addQuote}
              updateQuote={updateQuote}
              removeQuote={removeQuote}
              uploadQuotePhotos={uploadQuotePhotos}
              removeQuotePhoto={removeQuotePhoto}
            />

            <h3 style={sectionTitle}>⭐ 評分信任信號</h3>
            <FormGrid cols={2} gap={16}>
              <label style={labelStyle}>
                初始評分（0–5）
                <input
                  type="number" step="0.1" min="0" max="5"
                  value={ratingAvg}
                  onChange={e => setRatingAvg(e.target.value)}
                  style={fieldStyle}
                  placeholder="例：4.8"
                />
                <span style={{ fontSize: 11, color: '#6b7280', marginTop: 4, display: 'block' }}>留空＝自動以「口碑語錄星數＋已核准旅客評論」平均計算</span>
              </label>
              <div style={labelStyle}>
                目前評論數（自動對齊）
                <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', background: '#f9fafb', color: '#374151' }}>
                  {socialProofQuotes.length} 則口碑語錄＋已核准旅客評論
                </div>
                <span style={{ fontSize: 11, color: '#6b7280', marginTop: 4, display: 'block' }}>評論數已改為自動對齊（口碑語錄＋已核准評論），無需手動輸入</span>
              </div>
            </FormGrid>

            <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
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

        {/* ── 方案一律於「方案管理」(V2) 維護 ── */}
        <Card style={{ marginTop: 24, padding: 20, border: '1px solid #86efac', background: '#f0fdf4' }}>
          <h3 style={{ ...sectionTitle, marginTop: 0, marginBottom: 10 }}>📋 方案管理</h3>
          <p style={{ color: '#166534', margin: '0 0 8px', lineHeight: 1.7 }}>
            方案（計價方式、時長、預約方式、詳細行程等）一律在「方案管理」維護，本頁不再編輯方案。
          </p>
          <p style={{ color: '#166534', margin: '0 0 16px', lineHeight: 1.7 }}>
            前台「詳細行程」由旅客所選方案的行程介紹（方案管理 → 方案詳情 → 行程介紹）呈現。
          </p>
          <a
            href={`/admin/activities/${activityId}/plans`}
            style={{
              display: 'block',
              width: '100%',
              maxWidth: 280,
              boxSizing: 'border-box',
              textAlign: 'center',
              background: '#16a34a',
              color: '#fff',
              textDecoration: 'none',
              padding: '12px 16px',
              borderRadius: 8,
              fontWeight: 700,
            }}
          >
            前往「方案管理」
          </a>
        </Card>

        {/* ── FAQ Editor ── */}
        <FaqEditorCard activityId={activityId} faq={faq} setFaq={setFaq} />

        {/* ── 加購項目 ── */}
        <Card title="加購項目">
          <AddonsEditor endpointBase={`/api/v2/admin/activities/${activityId}/addons`} />
        </Card>

        {/* ── 場次管理 ── */}
        <ScheduleSection activityId={activityId} />
      </div>
    </>
  );
}
