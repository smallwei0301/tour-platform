'use client';
import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { buildActivityHref } from '../../src/lib/activity-url';

const REGIONS = ['台北市', '高雄市', '花蓮縣', '台南市'];
const TYPES = ['文化歷史', '美食體驗', '戶外冒險', '柴山探洞 🔦', '溯溪 🌊'];

interface Activity {
  id: string;
  slug: string;
  title: string;
  tagline?: string;
  shortDescription?: string;
  region: string;
  regionSlug?: string;
  category: string;
  priceTwd: number;
  durationMinutes?: number;
  minParticipants?: number;
  maxParticipants?: number;
  coverImageUrl?: string;
  status: string;
  guideName?: string;
  guideSlug?: string;
  guideAvatarUrl?: string;
  ratingAvg?: number;
  reviewCount?: number;
}

function parseMultiParam(value: string | null): string[] {
  if (!value) return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export default function ActivitiesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const searchParamString = searchParams.toString();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [selectedRegions, setSelectedRegions] = useState<string[]>(parseMultiParam(searchParams.get('region')));
  const [selectedTypes, setSelectedTypes] = useState<string[]>(parseMultiParam(searchParams.get('type')));
  const [sort, setSort] = useState(searchParams.get('sort') || 'recommended');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'error'>('idle');

  useEffect(() => {
    setQuery(searchParams.get('q') || '');
    setSelectedRegions(parseMultiParam(searchParams.get('region')));
    setSelectedTypes(parseMultiParam(searchParams.get('type')));
    setSort(searchParams.get('sort') || 'recommended');
  }, [searchParams]);

  useEffect(() => {
    const params = new URLSearchParams();
    const trimmed = query.trim();
    if (trimmed) params.set('q', trimmed);
    if (selectedRegions.length > 0) params.set('region', selectedRegions.join(','));
    if (selectedTypes.length > 0) params.set('type', selectedTypes.join(','));
    if (sort !== 'recommended') params.set('sort', sort);

    const next = params.toString();
    if (next !== searchParamString) {
      router.replace(`/activities${next ? `?${next}` : ''}`, { scroll: false });
    }
  }, [query, selectedRegions, selectedTypes, sort, searchParamString, router]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());

    fetch(`/api/activities${params.toString() ? `?${params.toString()}` : ''}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) setActivities(json.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [query]);

  function toggleRegion(r: string) {
    setSelectedRegions((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  function toggleType(t: string) {
    setSelectedTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  function clearAll() {
    setQuery('');
    setSelectedRegions([]);
    setSelectedTypes([]);
    setSort('recommended');
  }

  async function copyShareLink() {
    try {
      const shareUrl = `${window.location.origin}/activities${searchParamString ? `?${searchParamString}` : ''}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopyState('done');
      setTimeout(() => setCopyState('idle'), 1800);
    } catch {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 1800);
    }
  }

  const filtered = useMemo(() => {
    let result = [...activities];

    if (selectedRegions.length > 0) {
      result = result.filter((a) => selectedRegions.includes(a.region));
    }

    if (selectedTypes.length > 0) {
      result = result.filter((a) =>
        selectedTypes.some((t) => a.category?.includes(t.replace(' 🔦', '').replace(' 🌊', '')))
      );
    }

    if (sort === 'price-asc') result.sort((a, b) => a.priceTwd - b.priceTwd);
    if (sort === 'price-desc') result.sort((a, b) => b.priceTwd - a.priceTwd);

    return result;
  }, [activities, selectedRegions, selectedTypes, sort]);

  const hasFilters = query || selectedRegions.length > 0 || selectedTypes.length > 0 || sort !== 'recommended';
  const activeTokens = [...selectedRegions, ...selectedTypes];

  return (
    <main className="midao-activities-page">
      <section className="midao-activities-hero">
        <div className="midao-activities-hero-overlay" />
        <div className="midao-shell midao-activities-hero-content">
          <div className="midao-activities-hero-top-actions">
            <button type="button" onClick={copyShareLink} className="midao-share-btn" aria-label="複製此頁連結">
              {copyState === 'done' ? '已複製連結 ✓' : copyState === 'error' ? '複製失敗' : '分享此頁 ↗'}
            </button>
          </div>

          <p className="midao-eyebrow">Field Guide to Hidden Taiwan</p>
          <h1>找到一條你的徑</h1>
          <p className="midao-subcopy">
            不是景點清單，而是依照你的步調，把台灣的地形、城市紋理與在地故事拼成一段真正會記住的路線。
          </p>
        </div>
      </section>

      <section className="midao-search-wrap midao-activities-search-wrap">
        <div className="midao-shell">
          <div className="midao-search-card midao-activities-search-card">
            <label htmlFor="midao-activities-search" className="midao-search-label">你今天想往哪裡走？</label>
            <div className="midao-search-row">
              <input
                id="midao-activities-search"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="輸入地區、主題或行程名稱…"
                className="midao-search-input"
              />
              <button type="button" className="midao-search-submit" onClick={() => setQuery((prev) => prev.trim())}>⌕</button>
            </div>

            {activeTokens.length > 0 ? (
              <div className="midao-chip-row" aria-label="已選篩選條件">
                {activeTokens.map((token) => (
                  <span key={token} className="midao-chip">{token}</span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="midao-activities-content">
        <div className="midao-shell midao-activities-layout">
          <aside className="midao-filter-panel">
            <div className="midao-filter-head">
              <h2>篩選條件</h2>
              {hasFilters ? (
                <button type="button" onClick={clearAll} className="midao-clear-btn">清除</button>
              ) : null}
            </div>

            <details open>
              <summary>地區</summary>
              <div className="midao-check-group">
                {REGIONS.map((r) => (
                  <label key={r}>
                    <input type="checkbox" checked={selectedRegions.includes(r)} onChange={() => toggleRegion(r)} />
                    <span>{r}</span>
                  </label>
                ))}
              </div>
            </details>

            <details open>
              <summary>主題</summary>
              <div className="midao-check-group">
                {TYPES.map((t) => (
                  <label key={t}>
                    <input type="checkbox" checked={selectedTypes.includes(t)} onChange={() => toggleType(t)} />
                    <span>{t}</span>
                  </label>
                ))}
              </div>
            </details>

            <details>
              <summary>行程時長</summary>
              <div className="midao-check-group is-disabled">
                <label><input type="checkbox" disabled /> <span>2 小時以內</span></label>
                <label><input type="checkbox" disabled /> <span>2～4 小時</span></label>
                <label><input type="checkbox" disabled /> <span>4～8 小時（半天）</span></label>
                <label><input type="checkbox" disabled /> <span>8 小時以上（全天）</span></label>
              </div>
            </details>

            <details>
              <summary>語言</summary>
              <div className="midao-check-group is-disabled">
                <label><input type="checkbox" disabled /> <span>中文</span></label>
                <label><input type="checkbox" disabled /> <span>英語</span></label>
              </div>
            </details>
          </aside>

          <section>
            <div className="midao-result-head">
              <div>
                <p className="midao-kicker">Routes Matching Your Pace</p>
                <h2>{query ? `「${query}」的搜尋結果` : '全台在地導覽路線'}</h2>
                <p>{filtered.length} 條路線可探索</p>
              </div>
              <select aria-label="排序" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="recommended">推薦排序</option>
                <option value="price-asc">價格：低到高</option>
                <option value="price-desc">價格：高到低</option>
              </select>
            </div>

            {loading ? (
              <div className="midao-activities-empty">載入中⋯</div>
            ) : filtered.length === 0 ? (
              <div className="midao-activities-empty">
                <p>🔍 找不到符合條件的行程</p>
                <button type="button" onClick={clearAll} className="midao-btn midao-btn-primary">清除所有篩選</button>
              </div>
            ) : (
              <div className="midao-activity-grid">
                {filtered.map((a) => {
                  const href = buildActivityHref({ slug: a.slug, region: a.region, regionSlug: a.regionSlug });
                  const durationDisplay = a.durationMinutes
                    ? a.durationMinutes >= 60
                      ? `${Math.floor(a.durationMinutes / 60)}${a.durationMinutes % 60 ? ` 小時 ${a.durationMinutes % 60} 分` : ' 小時'}`
                      : `${a.durationMinutes} 分鐘`
                    : '';

                  return (
                    <article className="midao-activity-card" key={a.slug} data-testid="activity-card" data-activity-slug={a.slug}>
                      <div className="midao-activity-thumb" style={{ backgroundImage: `linear-gradient(180deg, rgba(28, 24, 19, 0.08) 0%, rgba(28, 24, 19, 0.30) 100%), url(${a.coverImageUrl || 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80'})` }}>
                        <span className="midao-activity-badge">{a.category}</span>
                      </div>

                      <div className="midao-activity-body">
                        {a.guideName ? (
                          <p className="midao-activity-guide">由 {a.guideName} 帶路</p>
                        ) : null}

                        <h3>{a.title}</h3>
                        <p className="midao-activity-meta">⭐ {a.ratingAvg?.toFixed(1) || '5.0'} · 📍 {a.region}{durationDisplay ? ` · 🕐 ${durationDisplay}` : ''}</p>

                        <div className="midao-activity-footer">
                          <span className="midao-activity-price">NT${a.priceTwd?.toLocaleString()} / 人</span>
                          <Link
                            className="midao-inline-link"
                            href={href}
                            prefetch
                            onMouseEnter={() => router.prefetch(href)}
                            data-testid="activity-card-link"
                          >
                            查看行程 →
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
