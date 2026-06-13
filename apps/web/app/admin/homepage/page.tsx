'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, PageHeader } from '../../../src/components/admin/ui';
import { deriveEditorPickCopy, deriveMoreFeaturedCopy } from '../../../src/lib/homepage-featured-copy.mjs';

interface Choice {
  slug: string;
  title: string;
  tagline: string;
  shortDescription: string;
  region: string;
  price: number;
  durationDisplay: string;
  coverImageUrl: string;
  ratingAvg: number;
  reviewCount: number;
}

interface EditorCopy {
  title: string;
  subtitle: string;
  desc: string;
  tagLabel: string;
  difficulty: string; // select 字串，送出時轉數字
  imageUrl: string;
  ratingScore: string;
  ratingCount: string;
}

interface TourCopy { title: string; tagline: string; imageUrl: string }

interface Settings {
  editorPickSlug: string | null;
  moreFeaturedSlugs: string[];
  editorPickCopy?: Partial<Record<keyof EditorCopy, string | number>>;
  moreFeaturedCopy?: Record<string, Partial<TourCopy>>;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface PageData {
  settings: Settings;
  choices: Choice[];
  defaults: { editorPickSlug: string | null; moreFeaturedLimit: number };
}

const EMPTY_EDITOR_COPY: EditorCopy = { title: '', subtitle: '', desc: '', tagLabel: '', difficulty: '', imageUrl: '', ratingScore: '', ratingCount: '' };

function copyFromSettings(c?: Settings['editorPickCopy']): EditorCopy {
  return {
    title: c?.title != null ? String(c.title) : '',
    subtitle: c?.subtitle != null ? String(c.subtitle) : '',
    desc: c?.desc != null ? String(c.desc) : '',
    tagLabel: c?.tagLabel != null ? String(c.tagLabel) : '',
    difficulty: c?.difficulty != null ? String(c.difficulty) : '',
    imageUrl: c?.imageUrl != null ? String(c.imageUrl) : '',
    ratingScore: c?.ratingScore != null ? String(c.ratingScore) : '',
    ratingCount: c?.ratingCount != null ? String(c.ratingCount) : '',
  };
}

export default function AdminHomepageFeaturedPage() {
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editorPick, setEditorPick] = useState<string>('');
  const [moreFeatured, setMoreFeatured] = useState<string[]>([]);
  const [editorCopy, setEditorCopy] = useState<EditorCopy>(EMPTY_EDITOR_COPY);
  const [moreCopy, setMoreCopy] = useState<Record<string, TourCopy>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  function loadData() {
    setLoading(true);
    setError(null);
    fetch('/api/admin/homepage-featured', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && j?.data) {
          setData(j.data);
          setEditorPick(j.data.settings.editorPickSlug ?? '');
          setMoreFeatured(j.data.settings.moreFeaturedSlugs ?? []);
          setEditorCopy(copyFromSettings(j.data.settings.editorPickCopy));
          const mc: Record<string, TourCopy> = {};
          for (const [slug, v] of Object.entries(j.data.settings.moreFeaturedCopy ?? {})) {
            const o = (v ?? {}) as Partial<TourCopy>;
            mc[slug] = { title: o.title ?? '', tagline: o.tagline ?? '', imageUrl: o.imageUrl ?? '' };
          }
          setMoreCopy(mc);
        } else {
          setError(j?.error?.message || '無法載入首頁精選設定');
        }
      })
      .catch((e) => setError(e?.message || 'Network error'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, []);

  const limit = data?.defaults.moreFeaturedLimit ?? 4;
  const choiceBySlug = useMemo(() => {
    const m = new Map<string, Choice>();
    (data?.choices ?? []).forEach((c) => m.set(c.slug, c));
    return m;
  }, [data]);

  // 編輯精選選定行程的「自動帶入」預設（作為輸入框 placeholder / 一鍵產生來源）
  const editorDerived = useMemo(() => {
    const c = editorPick ? choiceBySlug.get(editorPick) : null;
    return c ? deriveEditorPickCopy(c) : null;
  }, [editorPick, choiceBySlug]);

  function toggleMore(slug: string) {
    setMoreFeatured((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= limit) return prev;
      return [...prev, slug];
    });
  }

  function setEditorField(field: keyof EditorCopy, value: string) {
    setEditorCopy((prev) => ({ ...prev, [field]: value }));
  }

  function generateEditorDefaults() {
    if (!editorDerived) return;
    setEditorCopy({
      title: String(editorDerived.title ?? ''),
      subtitle: String(editorDerived.subtitle ?? ''),
      desc: String(editorDerived.desc ?? ''),
      tagLabel: String(editorDerived.tagLabel ?? ''),
      difficulty: String(editorDerived.difficulty ?? ''),
      imageUrl: String(editorDerived.imageUrl ?? ''),
      ratingScore: String(editorDerived.ratingScore ?? ''),
      ratingCount: String(editorDerived.ratingCount ?? ''),
    });
  }

  function setTourField(slug: string, field: keyof TourCopy, value: string) {
    setMoreCopy((prev) => ({ ...prev, [slug]: { ...(prev[slug] ?? { title: '', tagline: '', imageUrl: '' }), [field]: value } }));
  }

  function generateTourDefaults(slug: string) {
    const c = choiceBySlug.get(slug);
    if (!c) return;
    const d = deriveMoreFeaturedCopy(c);
    setMoreCopy((prev) => ({ ...prev, [slug]: { title: String(d.title ?? ''), tagline: String(d.tagline ?? ''), imageUrl: String(d.imageUrl ?? '') } }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSavedAt(null);
    try {
      const selectedMore = moreFeatured.filter((s) => s !== editorPick);
      const editorPickCopy: Record<string, string | number> = {
        title: editorCopy.title.trim(),
        subtitle: editorCopy.subtitle.trim(),
        desc: editorCopy.desc.trim(),
        tagLabel: editorCopy.tagLabel.trim(),
        imageUrl: editorCopy.imageUrl.trim(),
        ratingScore: editorCopy.ratingScore.trim(),
      };
      if (editorCopy.difficulty.trim()) editorPickCopy.difficulty = Number(editorCopy.difficulty);
      if (editorCopy.ratingCount.trim()) editorPickCopy.ratingCount = Number(editorCopy.ratingCount);

      const moreFeaturedCopy: Record<string, TourCopy> = {};
      for (const slug of selectedMore) {
        const o = moreCopy[slug];
        if (o) moreFeaturedCopy[slug] = { title: o.title.trim(), tagline: o.tagline.trim(), imageUrl: o.imageUrl.trim() };
      }

      const res = await fetch('/api/admin/homepage-featured', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          editorPickSlug: editorPick || null,
          moreFeaturedSlugs: selectedMore,
          editorPickCopy,
          moreFeaturedCopy,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) {
        throw new Error(j?.error?.message || `儲存失敗（HTTP ${res.status}）`);
      }
      setData((prev) => (prev ? { ...prev, settings: j.data.settings } : prev));
      setEditorPick(j.data.settings.editorPickSlug ?? '');
      setMoreFeatured(j.data.settings.moreFeaturedSlugs ?? []);
      setEditorCopy(copyFromSettings(j.data.settings.editorPickCopy));
      setSavedAt(new Date().toLocaleTimeString('zh-TW'));
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 14px', borderBottom: '1px solid #f3f4f6',
  };
  const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 };
  const labelStyle: React.CSSProperties = { fontSize: 12, color: '#6b7280', fontWeight: 600 };
  const inputStyle: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 };

  return (
    <div className="admin-page">
      <PageHeader
        title="首頁精選"
        subtitle="從你的「已發布行程」挑選首頁「編輯精選」大卡與「更多精選行程」，並可手動編輯卡片文案；儲存後首頁約 60 秒內更新。"
      />

      {loading && <Card><p style={{ color: '#6b7280', margin: 0 }}>載入中…</p></Card>}
      {error && (
        <Card>
          <p style={{ color: '#dc2626', margin: '0 0 10px' }} data-testid="homepage-featured-error">{error}</p>
          <button onClick={loadData} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}>重試</button>
        </Card>
      )}

      {data && data.choices.length === 0 && (
        <Card><p style={{ color: '#6b7280', margin: 0 }} data-testid="homepage-featured-empty">目前沒有「已發布」的行程可供挑選。請先發布行程後再回到此頁設定首頁精選。</p></Card>
      )}

      {data && data.choices.length > 0 && (
        <>
          <Card>
            <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>編輯精選（首頁大卡）</h2>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#6b7280' }}>
              選擇要放在首頁大卡的行程。未選擇時預設顯示行程目錄第一筆。
            </p>
            <div role="radiogroup" aria-label="編輯精選行程">
              {data.choices.map((c) => (
                <label key={c.slug} style={{ ...rowStyle, cursor: 'pointer' }} data-testid={`editor-pick-${c.slug}`}>
                  <input
                    type="radio"
                    name="editorPick"
                    checked={editorPick === c.slug}
                    onChange={() => setEditorPick(c.slug)}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>{c.title}</span>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{c.region}{c.durationDisplay ? `・${c.durationDisplay}` : ''}・NT$ {c.price.toLocaleString()}</span>
                  </span>
                </label>
              ))}
              <label style={{ ...rowStyle, cursor: 'pointer', borderBottom: 'none' }}>
                <input type="radio" name="editorPick" checked={editorPick === ''} onChange={() => setEditorPick('')} />
                <span style={{ fontSize: 14, color: '#6b7280' }}>使用預設（行程目錄第一筆）</span>
              </label>
            </div>

            {editorPick && editorDerived && (
              <div style={{ marginTop: 14, padding: '14px', background: '#fafaf9', borderRadius: 10 }} data-testid="editor-copy-panel">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <strong style={{ fontSize: 14 }}>大卡文案（留空則自動帶入行程資料）</strong>
                  <button
                    type="button"
                    onClick={generateEditorDefaults}
                    data-testid="editor-copy-generate"
                    style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #1a2e1f', background: '#fff', color: '#1a2e1f', fontSize: 13, cursor: 'pointer' }}
                  >
                    產生預設簡介
                  </button>
                </div>
                <div style={fieldStyle}>
                  <span style={labelStyle}>標題</span>
                  <input style={inputStyle} data-testid="editor-copy-title" value={editorCopy.title} placeholder={String(editorDerived.title ?? '')} onChange={(e) => setEditorField('title', e.target.value)} />
                </div>
                <div style={fieldStyle}>
                  <span style={labelStyle}>副標</span>
                  <input style={inputStyle} data-testid="editor-copy-subtitle" value={editorCopy.subtitle} placeholder={String(editorDerived.subtitle ?? '')} onChange={(e) => setEditorField('subtitle', e.target.value)} />
                </div>
                <div style={fieldStyle}>
                  <span style={labelStyle}>簡介</span>
                  <textarea style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }} data-testid="editor-copy-desc" value={editorCopy.desc} placeholder={String(editorDerived.desc ?? '')} onChange={(e) => setEditorField('desc', e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={fieldStyle}>
                    <span style={labelStyle}>標籤</span>
                    <input style={inputStyle} data-testid="editor-copy-tagLabel" value={editorCopy.tagLabel} placeholder={String(editorDerived.tagLabel ?? '')} onChange={(e) => setEditorField('tagLabel', e.target.value)} />
                  </div>
                  <div style={fieldStyle}>
                    <span style={labelStyle}>難度（1–5）</span>
                    <select style={inputStyle} data-testid="editor-copy-difficulty" value={editorCopy.difficulty} onChange={(e) => setEditorField('difficulty', e.target.value)}>
                      <option value="">自動（{String(editorDerived.difficulty ?? 2)}）</option>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={String(n)}>{n}</option>)}
                    </select>
                  </div>
                </div>
                <div style={fieldStyle}>
                  <span style={labelStyle}>圖片網址</span>
                  <input style={inputStyle} data-testid="editor-copy-imageUrl" value={editorCopy.imageUrl} placeholder={String(editorDerived.imageUrl ?? '')} onChange={(e) => setEditorField('imageUrl', e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={fieldStyle}>
                    <span style={labelStyle}>評分</span>
                    <input style={inputStyle} data-testid="editor-copy-ratingScore" value={editorCopy.ratingScore} placeholder={String(editorDerived.ratingScore || '5.0')} onChange={(e) => setEditorField('ratingScore', e.target.value)} />
                  </div>
                  <div style={fieldStyle}>
                    <span style={labelStyle}>評價數</span>
                    <input style={inputStyle} type="number" min={0} data-testid="editor-copy-ratingCount" value={editorCopy.ratingCount} placeholder={String(editorDerived.ratingCount ?? 0)} onChange={(e) => setEditorField('ratingCount', e.target.value)} />
                  </div>
                </div>
              </div>
            )}
          </Card>

          <div style={{ height: 16 }} />

          <Card>
            <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>更多精選行程（最多 {limit} 個）</h2>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#6b7280' }}>
              依勾選順序顯示於首頁「更多精選行程」；與編輯精選相同的行程會自動排除。未勾選時預設顯示編輯精選以外的前 2 個行程。每張卡片文案留空則自動帶入行程資料。
            </p>
            {data.choices.map((c) => {
              const isPick = c.slug === editorPick;
              const checked = moreFeatured.includes(c.slug);
              const order = moreFeatured.filter((s) => s !== editorPick).indexOf(c.slug);
              const derived = deriveMoreFeaturedCopy(c);
              const tc = moreCopy[c.slug] ?? { title: '', tagline: '', imageUrl: '' };
              return (
                <div key={c.slug} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <label
                    style={{ ...rowStyle, cursor: isPick ? 'not-allowed' : 'pointer', opacity: isPick ? 0.45 : 1, borderBottom: 'none' }}
                    data-testid={`more-featured-${c.slug}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked && !isPick}
                      disabled={isPick}
                      onChange={() => toggleMore(c.slug)}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>{c.title}</span>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>
                        {c.region}・NT$ {c.price.toLocaleString()}{isPick ? '（目前為編輯精選）' : ''}
                      </span>
                    </span>
                    {checked && !isPick && order >= 0 && (
                      <span style={{ fontSize: 12, color: '#1a7f4f', fontWeight: 700 }}>第 {order + 1} 順位</span>
                    )}
                  </label>
                  {checked && !isPick && (
                    <div style={{ padding: '0 14px 14px 40px', display: 'grid', gap: 8 }} data-testid={`more-copy-panel-${c.slug}`}>
                      <input style={inputStyle} data-testid={`more-copy-title-${c.slug}`} value={tc.title} placeholder={`標題（預設：${derived.title}）`} onChange={(e) => setTourField(c.slug, 'title', e.target.value)} />
                      <input style={inputStyle} data-testid={`more-copy-tagline-${c.slug}`} value={tc.tagline} placeholder={`標語（預設：${derived.tagline || '—'}）`} onChange={(e) => setTourField(c.slug, 'tagline', e.target.value)} />
                      <input style={inputStyle} data-testid={`more-copy-imageUrl-${c.slug}`} value={tc.imageUrl} placeholder="圖片網址（預設：行程封面）" onChange={(e) => setTourField(c.slug, 'imageUrl', e.target.value)} />
                      <button type="button" onClick={() => generateTourDefaults(c.slug)} style={{ justifySelf: 'start', padding: '4px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 12, cursor: 'pointer' }}>產生預設簡介</button>
                    </div>
                  )}
                </div>
              );
            })}
          </Card>

          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={handleSave}
              disabled={saving}
              data-testid="homepage-featured-save"
              style={{
                padding: '10px 24px', borderRadius: 10, border: 'none',
                background: saving ? '#9ca3af' : '#1a2e1f', color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? '儲存中…' : '儲存設定'}
            </button>
            {saveError && <span style={{ color: '#dc2626', fontSize: 13 }} data-testid="homepage-featured-save-error">{saveError}</span>}
            {savedAt && <span style={{ color: '#1a7f4f', fontSize: 13 }} data-testid="homepage-featured-saved">已儲存（{savedAt}）</span>}
            {data.settings.updatedAt && (
              <span style={{ color: '#9ca3af', fontSize: 12 }}>
                上次更新：{new Date(data.settings.updatedAt).toLocaleString('zh-TW')}{data.settings.updatedBy ? `・${data.settings.updatedBy}` : ''}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
