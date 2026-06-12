'use client';

import { useEffect, useState } from 'react';
import { Card, PageHeader } from '../../../src/components/admin/ui';

interface Choice {
  slug: string;
  title: string;
  region: string;
  price: number;
  durationDisplay: string;
}

interface Settings {
  editorPickSlug: string | null;
  moreFeaturedSlugs: string[];
  updatedAt: string | null;
  updatedBy: string | null;
}

interface PageData {
  settings: Settings;
  choices: Choice[];
  defaults: { editorPickSlug: string; moreFeaturedLimit: number };
}

export default function AdminHomepageFeaturedPage() {
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editorPick, setEditorPick] = useState<string>('');
  const [moreFeatured, setMoreFeatured] = useState<string[]>([]);
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
        } else {
          setError(j?.error?.message || '無法載入首頁精選設定');
        }
      })
      .catch((e) => setError(e?.message || 'Network error'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, []);

  const limit = data?.defaults.moreFeaturedLimit ?? 4;

  function toggleMore(slug: string) {
    setMoreFeatured((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= limit) return prev;
      return [...prev, slug];
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSavedAt(null);
    try {
      const res = await fetch('/api/admin/homepage-featured', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          editorPickSlug: editorPick || null,
          // 衝突防呆：編輯精選自動從更多精選排除（後端 normalize 也會再做一次）
          moreFeaturedSlugs: moreFeatured.filter((s) => s !== editorPick),
        }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) {
        throw new Error(j?.error?.message || `儲存失敗（HTTP ${res.status}）`);
      }
      setData((prev) => (prev ? { ...prev, settings: j.data.settings } : prev));
      setEditorPick(j.data.settings.editorPickSlug ?? '');
      setMoreFeatured(j.data.settings.moreFeaturedSlugs ?? []);
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

  return (
    <div className="admin-page">
      <PageHeader
        title="首頁精選"
        subtitle="選擇首頁「編輯精選」大卡與「更多精選行程」清單；儲存後首頁約 60 秒內更新。"
      />

      {loading && <Card><p style={{ color: '#6b7280', margin: 0 }}>載入中…</p></Card>}
      {error && (
        <Card>
          <p style={{ color: '#dc2626', margin: '0 0 10px' }} data-testid="homepage-featured-error">{error}</p>
          <button onClick={loadData} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}>重試</button>
        </Card>
      )}

      {data && (
        <>
          <Card>
            <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>編輯精選（首頁大卡）</h2>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#6b7280' }}>
              未選擇時預設顯示「{data.choices.find((c) => c.slug === data.defaults.editorPickSlug)?.title ?? data.defaults.editorPickSlug}」。
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
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{c.region}・{c.durationDisplay}・NT$ {c.price.toLocaleString()}</span>
                  </span>
                </label>
              ))}
              <label style={{ ...rowStyle, cursor: 'pointer', borderBottom: 'none' }}>
                <input type="radio" name="editorPick" checked={editorPick === ''} onChange={() => setEditorPick('')} />
                <span style={{ fontSize: 14, color: '#6b7280' }}>使用預設（柴山探洞）</span>
              </label>
            </div>
          </Card>

          <div style={{ height: 16 }} />

          <Card>
            <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>更多精選行程（最多 {limit} 個）</h2>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#6b7280' }}>
              依勾選順序顯示於首頁「更多精選行程」；與編輯精選相同的行程會自動排除。未勾選時預設顯示編輯精選以外的前 2 個行程。
            </p>
            {data.choices.map((c) => {
              const isPick = c.slug === editorPick;
              const checked = moreFeatured.includes(c.slug);
              return (
                <label
                  key={c.slug}
                  style={{ ...rowStyle, cursor: isPick ? 'not-allowed' : 'pointer', opacity: isPick ? 0.45 : 1 }}
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
                  {checked && !isPick && (
                    <span style={{ fontSize: 12, color: '#1a7f4f', fontWeight: 700 }}>
                      第 {moreFeatured.filter((s) => s !== editorPick).indexOf(c.slug) + 1} 順位
                    </span>
                  )}
                </label>
              );
            })}
          </Card>

          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
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
