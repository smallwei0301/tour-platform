'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { buildActivityHref } from '../../src/lib/activity-url';
import { isActivityTypeMatch, isActivityTypeKeywordMatch, resolveCanonicalType } from '../../src/lib/activity-type-filter.mjs';
import WishlistToggle from '../../src/components/WishlistToggle';
import { PublicIcon } from '../../src/components/ui/PublicIcon';
import { resolveCoverSrc, CARD_IMAGE_SIZES } from './cover-image';

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

interface ActivitiesContentProps {
  initialRegion?: string;
  // Issue #1249 — server-side initial payload so the listing page paints
  // cards immediately instead of flashing a `loading=true` placeholder
  // for ~1–2s while the client-only fetch round-trips Supabase.
  initialActivities?: Activity[];
}

export default function ActivitiesContent({ initialRegion, initialActivities }: ActivitiesContentProps = {}) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [selectedRegions, setSelectedRegions] = useState<string[]>(
    searchParams.get('region')
      ? [searchParams.get('region')!]
      : initialRegion
        ? [initialRegion]
        : []
  );
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    searchParams.get('type') ? [resolveCanonicalType(TYPES, searchParams.get('type')!)] : []
  );
  const [sort, setSort] = useState('recommended');
  // Server-rendered initial data lets the cards render on first paint;
  // the client-side fetch below still runs whenever the search query
  // changes, so filters / search remain responsive.
  const [activities, setActivities] = useState<Activity[]>(initialActivities ?? []);
  const [loading, setLoading] = useState(initialActivities === undefined);
  const [wishlistedIds, setWishlistedIds] = useState<Set<string>>(new Set());

  // Issue #1345 — when SSR already hydrated the card list via
  // `initialActivities`, the first run of the fetch effect below would
  // otherwise re-request `/api/activities` and call `setActivities` with
  // a (possibly differently-ordered) result, re-rendering every card.
  // That layout pass is what drove CLS to 0.76–1.43 in #1317 round-4
  // Lighthouse. Skip the initial fetch when SSR data is fresh; let any
  // query change after mount fall through normally.
  const skipInitialFetch = useRef(initialActivities !== undefined);

  // Sync URL → state on mount
  useEffect(() => {
    setQuery(searchParams.get('q') || '');
    const r = searchParams.get('region');
    if (r) setSelectedRegions([r]);
    else if (initialRegion) setSelectedRegions([initialRegion]);
    else setSelectedRegions([]);
    const t = searchParams.get('type');
    if (t) setSelectedTypes([resolveCanonicalType(TYPES, t)]);
    else setSelectedTypes([]);
  }, [searchParams, initialRegion]);

  // Update URL when text query changes (debounced 500ms for shareability)
  useEffect(() => {
    const t = setTimeout(() => updateUrl(query, selectedRegions, selectedTypes), 500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Fetch from API
  useEffect(() => {
    // Issue #1345 — skip the mount-time fetch when SSR already shipped
    // the cards. Filter/search interactions after mount still fall
    // through and re-fetch normally.
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
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

  // Fetch wishlisted activity IDs for hydration.
  //
  // Issue #1249 — short-circuit anonymous visitors so we don't pay the
  // ~500–800ms supabase.auth.getUser() round-trip just to confirm there's
  // no session. The wishlist API itself already returns `{ data: [] }`
  // for logged-out users; this just avoids the request. The default
  // empty `wishlistedIds` Set already renders the "unhearted" UI state
  // correctly.
  //
  // This effect is intentionally non-blocking — `loading` is owned by
  // the activities fetch effect above, so wishlist hydration can never
  // delay the first useful render of the cards.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const hasSupabaseSession = /(^|;\s*)sb-[^=]+-auth-token=/.test(document.cookie);
    if (!hasSupabaseSession) return;
    fetch('/api/me/wishlist/ids')
      .then(r => r.json())
      .then(({ data }) => setWishlistedIds(new Set(data ?? [])))
      .catch(() => {}); // Silently handle — user will see unhearted state
  }, []);

  function updateUrl(q: string, regions: string[], types: string[]) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (regions.length === 1) params.set('region', regions[0]);
    if (types.length === 1) params.set('type', types[0]);
    const qs = params.toString();
    router.replace(qs ? `/activities?${qs}` : '/activities');
  }
  function toggleRegion(r: string) {
    const next = selectedRegions.includes(r) ? selectedRegions.filter((x) => x !== r) : [...selectedRegions, r];
    setSelectedRegions(next);
    updateUrl(query, next, selectedTypes);
  }
  function toggleType(t: string) {
    const next = selectedTypes.includes(t) ? selectedTypes.filter((x) => x !== t) : [...selectedTypes, t];
    setSelectedTypes(next);
    updateUrl(query, selectedRegions, next);
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
        selectedTypes.some((t) =>
          isActivityTypeMatch(a.category, t) || isActivityTypeKeywordMatch(a, t)
        )
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
      <div className="tp-breadcrumb"><Link href="/">首頁</Link> &gt; <Link href="/activities">探索行程</Link>{query ? ` &gt; 搜尋：${query}` : ''}</div>

      <section className="tp-activities-layout">
        {/* 篩選側欄 */}
        <aside className="tp-filter" aria-label="篩選條件">
          <div className="tp-filter-head">
            <h3>篩選條件</h3>
            {hasFilters && <button onClick={clearAll} style={{ color: 'var(--tp-accent)', fontWeight: 600, fontSize: 13 }}>清除全部</button>}
          </div>

          {/* 關鍵字搜尋 */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="activities-search" style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>關鍵字搜尋</label>
            <input
              id="activities-search"
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
        </aside>

        {/* 結果區 */}
        <section>
          {/* aria-live announces result count changes to screen readers */}
          <div aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>
            {hasFilters ? resultLabel : ''}
          </div>
          <div className="tp-result-head">
            <h1>{resultLabel}</h1>
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
              <div style={{ marginBottom: 12, color: 'var(--tp-primary)' }}><PublicIcon name="search" size={40} /></div>
              <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>找不到符合條件的行程</p>
              <p style={{ fontSize: 14, marginBottom: 20 }}>試試看其他關鍵字，或清除篩選條件</p>
              <button onClick={clearAll} className="tp-btn tp-btn-primary">清除所有篩選</button>
            </div>
          ) : (
            <div className="tp-card-grid tp-card-grid-activities">
              {filtered.map((a, idx) => {
                const href = buildActivityHref({ slug: a.slug, region: a.region, regionSlug: a.regionSlug });
                const durationDisplay = a.durationMinutes
                  ? a.durationMinutes >= 60
                    ? `${Math.floor(a.durationMinutes / 60)}${a.durationMinutes % 60 ? ` 小時 ${a.durationMinutes % 60} 分` : ' 小時'}`
                    : `${a.durationMinutes} 分鐘`
                  : '';
                return (
                  <article className="tp-card" key={a.slug} data-testid="activity-card" data-activity-slug={a.slug}>
                    <div style={{ position: 'relative' }}>
                      <Image
                        // Issue #1344 — src fallback 與 sizes 抽到
                        // cover-image.ts 共用常數,跟 page 層 SSR preload
                        // 的 imagesrcset / imagesizes 保證一致,否則
                        // preload 的 URL 對不上 srcset → double download。
                        src={resolveCoverSrc(a.coverImageUrl)}
                        alt={a.title}
                        className="tp-card-img"
                        style={{ background: 'none' }}
                        // `.tp-card-grid-activities` renders 2 cols by
                        // default and 1 col under 768px → first 2 cards
                        // are above-the-fold on desktop AND the first
                        // alone on mobile.
                        priority={idx < 2}
                        loading={idx < 2 ? 'eager' : 'lazy'}
                        sizes={CARD_IMAGE_SIZES}
                        width={1200} height={675} />
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
                          <Image src={a.guideAvatarUrl} alt={a.guideName} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} width={28} height={28} />
                        )}
                        <span style={{ fontSize: 13, color: 'var(--tp-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{a.guideName} <PublicIcon name="badgeCheck" size={14} /></span>
                      </div>
                    )}
                    <h3 style={{ fontSize: 15, margin: '4px 0 6px', lineHeight: 1.4 }}>{a.title}</h3>
                    <div data-testid="activity-card-rating" style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '0 0 2px', fontSize: 13 }}>
                      {a.ratingAvg != null ? (
                        <>
                          <span style={{ color: '#f59e0b', display: 'inline-flex' }}><PublicIcon name="star" size={14} /></span>
                          <span>{a.ratingAvg.toFixed(1)}</span>
                          <span style={{ color: 'var(--tp-muted)' }}>({a.reviewCount ?? 0}則)</span>
                          <span style={{ color: 'var(--tp-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>· <PublicIcon name="pin" size={13} /> {a.region}</span>
                        </>
                      ) : (
                        <>
                          <span style={{ color: 'var(--tp-muted)' }} className="text-xs">尚無評價</span>
                          <span style={{ color: 'var(--tp-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>· <PublicIcon name="pin" size={13} /> {a.region}</span>
                        </>
                      )}
                    </div>
                    {durationDisplay && (
                      <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--tp-muted)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><PublicIcon name="clock" size={13} /> {durationDisplay}</span> · <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><PublicIcon name="users" size={13} /> {a.minParticipants}~{a.maxParticipants} 人</span>
                      </p>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ color: 'var(--tp-primary)' }}>NT${a.priceTwd?.toLocaleString()} / 人</strong>
                      <Link
                        className="tp-btn tp-btn-primary"
                        href={href}
                        // Issue #1249 — Next.js Link already does
                        // viewport-based prefetch automatically; the
                        // onMouseEnter `router.prefetch(href)` we used to
                        // call here was redundant and flooded the network
                        // with parallel _rsc requests during initial load.
                        prefetch
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
