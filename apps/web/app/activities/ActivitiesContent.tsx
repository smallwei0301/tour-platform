'use client';
import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { buildActivityHref } from '../../src/lib/activity-url';
import WishlistToggle from '../../src/components/WishlistToggle';

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

export default function ActivitiesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [selectedRegions, setSelectedRegions] = useState<string[]>(
    searchParams.get('region') ? [searchParams.get('region')!] : []
  );
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    searchParams.get('type') ? [searchParams.get('type')!] : []
  );
  const [sort, setSort] = useState('recommended');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [wishlistedIds, setWishlistedIds] = useState<Set<string>>(new Set());

  // Sync URL → state on mount
  useEffect(() => {
    setQuery(searchParams.get('q') || '');
    const r = searchParams.get('region');
    if (r) setSelectedRegions([r]);
    const t = searchParams.get('type');
    if (t) setSelectedTypes([t]);
  }, [searchParams]);

  // Fetch from API
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    fetch(`/api/activities${params.toString() ? '?' + params.toString() : ''}`)
      .then(r => r.json())
      .then(json => {
        if (json.ok) setActivities(json.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [query]);

  // Fetch wishlisted activity IDs for hydration
  useEffect(() => {
    fetch('/api/me/wishlist/ids')
      .then(r => r.json())
      .then(({ data }) => setWishlistedIds(new Set(data ?? [])))
      .catch(() => {}); // Silently handle — user will see unhearted state
  }, []);

  function toggleRegion(r: string) {
    setSelectedRegions((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);
  }
  function toggleType(t: string) {
    setSelectedTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  }
  function clearAll() {
    setQuery('');
    setSelectedRegions([]);
    setSelectedTypes([]);
    router.push('/activities');
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

  const hasFilters = query || selectedRegions.length > 0 || selectedTypes.length > 0;
  const resultLabel = query
    ? `「${query}」的搜尋結果（${filtered.length} 筆）`
    : `全台灣 ${filtered.length} 個私人導遊行程`;

  return (
    <main className="tp-container tp-activities" style={{ paddingBottom: 40 }}>
      <div className="tp-breadcrumb">首頁 &gt; 全部行程{query ? ` &gt; 搜尋：${query}` : ''}</div>

      <section className="tp-activities-layout">
        {/* 篩選側欄 */}
        <aside className="tp-filter">
          <div className="tp-filter-head">
            <h3>篩選條件</h3>
            {hasFilters && <button onClick={clearAll} style={{ color: 'var(--tp-accent)', fontWeight: 600, fontSize: 13 }}>清除全部</button>}
          </div>

          {/* 關鍵字搜尋 */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>關鍵字搜尋</label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="行程名稱、地區⋯"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--tp-border)', borderRadius: 8, fontSize: 13 }}
            />
          </div>

          <details open>
            <summary>地區</summary>
            {REGIONS.map((r) => (
              <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={selectedRegions.includes(r)} onChange={() => toggleRegion(r)} />
                {r}
              </label>
            ))}
          </details>
          <details open>
            <summary>行程主題</summary>
            {TYPES.map((t) => (
              <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={selectedTypes.includes(t)} onChange={() => toggleType(t)} />
                {t}
              </label>
            ))}
          </details>
          <details>
            <summary>行程時長</summary>
            <label><input type="checkbox" /> 2 小時以內</label>
            <label><input type="checkbox" /> 2～4 小時</label>
            <label><input type="checkbox" /> 4～8 小時（半天）</label>
            <label><input type="checkbox" /> 8 小時以上（全天）</label>
          </details>
          <details>
            <summary>語言</summary>
            <label><input type="checkbox" /> 中文</label>
            <label><input type="checkbox" /> 英語</label>
          </details>
        </aside>

        {/* 結果區 */}
        <section>
          <div className="tp-result-head">
            <h2>{resultLabel}</h2>
            <select aria-label="排序" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="recommended">推薦排序</option>
              <option value="price-asc">價格：低到高</option>
              <option value="price-desc">價格：高到低</option>
            </select>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--tp-muted)' }}>
              <p style={{ fontSize: 14 }}>載入中⋯</p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--tp-muted)' }}>
              <p style={{ fontSize: 40, marginBottom: 12 }}>🔍</p>
              <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>找不到符合條件的行程</p>
              <p style={{ fontSize: 14, marginBottom: 20 }}>試試看其他關鍵字，或清除篩選條件</p>
              <button onClick={clearAll} className="tp-btn tp-btn-primary">清除所有篩選</button>
            </div>
          ) : (
            <div className="tp-card-grid tp-card-grid-activities">
              {filtered.map((a) => {
                const href = buildActivityHref({ slug: a.slug, region: a.region, regionSlug: a.regionSlug });
                const durationDisplay = a.durationMinutes
                  ? a.durationMinutes >= 60
                    ? `${Math.floor(a.durationMinutes / 60)}${a.durationMinutes % 60 ? ` 小時 ${a.durationMinutes % 60} 分` : ' 小時'}`
                    : `${a.durationMinutes} 分鐘`
                  : '';
                return (
                  <article className="tp-card" key={a.slug} data-testid="activity-card" data-activity-slug={a.slug}>
                    <div style={{ position: 'relative' }}>
                      <img
                        src={a.coverImageUrl || 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80'}
                        alt={a.title}
                        className="tp-card-img"
                        style={{ background: 'none' }}
                        loading="lazy"
                      />
                      <WishlistToggle activityId={a.id} initialWishlisted={wishlistedIds.has(a.id)} />
                      <span style={{
                        position: 'absolute', top: 10, left: 10,
                        background: 'var(--tp-accent)', color: '#fff',
                        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                      }}>{a.category}</span>
                    </div>
                    {a.guideName && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 4px' }}>
                        {a.guideAvatarUrl && (
                          <img src={a.guideAvatarUrl} alt={a.guideName} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                        )}
                        <span style={{ fontSize: 13, color: 'var(--tp-muted)' }}>{a.guideName} ✅</span>
                      </div>
                    )}
                    <h3 style={{ fontSize: 15, margin: '4px 0 6px', lineHeight: 1.4 }}>{a.title}</h3>
                    <div data-testid="activity-card-rating" style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '0 0 2px', fontSize: 13 }}>
                      {a.ratingAvg != null ? (
                        <>
                          <span style={{ color: '#f59e0b' }}>⭐</span>
                          <span>{a.ratingAvg.toFixed(1)}</span>
                          <span style={{ color: 'var(--tp-muted)' }}>({a.reviewCount ?? 0}則)</span>
                          <span style={{ color: 'var(--tp-muted)' }}>· 📍 {a.region}</span>
                        </>
                      ) : (
                        <>
                          <span style={{ color: 'var(--tp-muted)' }} className="text-xs">尚無評價</span>
                          <span style={{ color: 'var(--tp-muted)' }}>· 📍 {a.region}</span>
                        </>
                      )}
                    </div>
                    {durationDisplay && (
                      <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--tp-muted)' }}>
                        🕐 {durationDisplay} · 👥 {a.minParticipants}~{a.maxParticipants} 人
                      </p>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ color: 'var(--tp-primary)' }}>NT${a.priceTwd?.toLocaleString()} / 人</strong>
                      <Link
                        className="tp-btn tp-btn-primary"
                        href={href}
                        prefetch
                        onMouseEnter={() => router.prefetch(href)}
                        data-testid="activity-card-link"
                        style={{ fontSize: 13, padding: '6px 14px' }}
                      >
                        查看行程
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
