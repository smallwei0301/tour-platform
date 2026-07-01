'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { buildActivityHref } from '../../../src/lib/activity-url';
import { resolveCanonicalType } from '../../../src/lib/activity-type-filter.mjs';
import { listSearchRegions, resolveSearchRegionKey } from '../../../src/lib/region-slugs.mjs';
import { activityMatchesRegion } from '../../../src/lib/activity-regions.mjs';
import { ACTIVITY_THEMES, ACTIVITY_THEME_LABELS, isActivityInTheme } from '../../../src/lib/activity-themes.mjs';
import { classifyActivityCategoryTag } from '../../../src/lib/category-tags.mjs';
import { resolveActivityReviewStats } from '../../../src/lib/activity-review-stats.mjs';
import { useTravelerAuth } from '../../../src/lib/use-traveler-auth';
import WishlistToggle from '../../../src/components/WishlistToggle';
import { PublicIcon } from '../../../src/components/ui/PublicIcon';
import { resolveCoverSrc, CARD_IMAGE_SIZES } from './cover-image';

// 地區篩選：改由 region-slugs.mjs 的 SEARCH_REGIONS 衍生（全 20 短名群組、單一真實
// 來源，不再硬編）。每個 checkbox 對應一個短名群組；勾「嘉義」「新竹」會一併搜到市＋縣
// （展開見 expandRegionToDbValues）。顯示用短名 label（與 footer 一致）。
const REGIONS = listSearchRegions();
// #mobile-categories：行程主題與 footer／各主題介紹頁統一為五大主題（單一來源）。
// value＝theme label（isActivityInTheme/resolveCanonicalType 用），slug＝顯示 i18n key。
const TYPES = ACTIVITY_THEME_LABELS;
const TYPE_ITEMS = ACTIVITY_THEMES.map((th: { label: string; slug: string }) => ({ value: th.label, slug: th.slug }));

interface Activity {
  id: string;
  slug: string;
  title: string;
  tagline?: string;
  shortDescription?: string;
  region: string;
  regionSlug?: string;
  regions?: string[];
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
  // #收藏星數：與詳情頁共用 resolveActivityReviewStats 的輸入（真實評論 + 社群口碑語錄），
  // 讓列表卡顯示與詳情頁一致的真實星數／評論數。
  reviews?: Array<{ rating?: number }>;
  socialProofQuotes?: Array<string | { author?: string; rating?: number; text?: string }>;
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
  const t = useTranslations('activities');

  const [query, setQuery] = useState(searchParams.get('q') || '');
  // 地區一律正規化成 DB 規範值（'高雄' / 'kaohsiung' → '高雄市'），讓 footer／熱門目的地
  // 用短名連結（?region=高雄）也能與以全名儲存的資料、側欄全名 checkbox 對得上（#footer 高雄篩選）。
  // 存「原始地區輸入」（footer 短名 '高雄'、slug 頁 dbValue '嘉義市' 皆可）。比對時經
  // activityMatchesRegion→expandRegionToDbValues 展開，與 SSR 篩選（listPublished-
  // ActivitiesDb 同一展開）一致，避免 client 重篩結果與首屏不符。
  const [selectedRegions, setSelectedRegions] = useState<string[]>(() => {
    const raw = (searchParams.get('region') || initialRegion || '').trim();
    return raw ? [raw] : [];
  });
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    searchParams.get('type') ? [resolveCanonicalType(TYPES, searchParams.get('type')!)] : []
  );
  const [sort, setSort] = useState('recommended');
  // #1380: 日期可訂 + 價格區間（server-side 過濾，狀態同步 URL 可分享）
  const [dateFilter, setDateFilter] = useState(searchParams.get('date') || '');
  const [priceMin, setPriceMin] = useState(searchParams.get('priceMin') || '');
  const [priceMax, setPriceMax] = useState(searchParams.get('priceMax') || '');
  // Server-rendered initial data lets the cards render on first paint;
  // the client-side fetch below still runs whenever the search query
  // changes, so filters / search remain responsive.
  const [activities, setActivities] = useState<Activity[]>(initialActivities ?? []);
  const [loading, setLoading] = useState(initialActivities === undefined);
  const [wishlistedIds, setWishlistedIds] = useState<Set<string>>(new Set());
  // 登入判斷以 supabase.auth.getUser() 為準（取代 cookie sniff，後者對 httpOnly／
  // 分段 cookie 會誤判未登入，導致收藏愛心一律跳登入頁）。
  const { authed } = useTravelerAuth();
  const isLoggedIn = authed === true;

  // Issue #1345 — when SSR already hydrated the card list via
  // `initialActivities`, the first run of the fetch effect below would
  // otherwise re-request `/api/activities` and call `setActivities` with
  // a (possibly differently-ordered) result, re-rendering every card.
  // That layout pass is what drove CLS to 0.76–1.43 in #1317 round-4
  // Lighthouse. Skip the initial fetch when SSR data is fresh; let any
  // query change after mount fall through normally.
  // #1380: SSR initialActivities 不含 date/price 過濾 — URL 帶這些參數時首載必須重抓
  const skipInitialFetch = useRef(
    initialActivities !== undefined
    && !searchParams.get('date')
    && !searchParams.get('priceMin')
    && !searchParams.get('priceMax')
  );

  // Sync URL → state on mount
  useEffect(() => {
    setQuery(searchParams.get('q') || '');
    const r = (searchParams.get('region') || initialRegion || '').trim();
    if (r) setSelectedRegions([r]);
    else setSelectedRegions([]);
    const t = searchParams.get('type');
    if (t) setSelectedTypes([resolveCanonicalType(TYPES, t)]);
    else setSelectedTypes([]);
    setDateFilter(searchParams.get('date') || '');
    setPriceMin(searchParams.get('priceMin') || '');
    setPriceMax(searchParams.get('priceMax') || '');
  }, [searchParams, initialRegion]);

  // Update URL when text query / date / price inputs change (debounced 500ms for
  // shareability). 所有輸入走同一條 debounce 管線 — 個別 onChange 不得直接
  // router.replace，否則 mount 時排程的這顆 timer 會用舊 closure 把參數洗掉（#1380）。
  useEffect(() => {
    const t = setTimeout(() => updateUrl(query, selectedRegions, selectedTypes), 500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, dateFilter, priceMin, priceMax]);

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
    if (dateFilter) params.set('date', dateFilter);
    if (priceMin) params.set('priceMin', priceMin);
    if (priceMax) params.set('priceMax', priceMax);
    fetch(`/api/activities${params.toString() ? '?' + params.toString() : ''}`)
      .then(r => r.json())
      .then(json => {
        if (json.ok) setActivities(json.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [query, dateFilter, priceMin, priceMax]);

  // Fetch wishlisted activity IDs for hydration once we know the visitor is
  // logged in (authed === true). 登入判斷由 useTravelerAuth（getUser）提供，取代
  // 先前 cookie sniff（對 httpOnly／分段 cookie 會誤判，連帶讓愛心點擊跳登入頁）。
  // 非阻塞：`loading` 由上面的 activities fetch 擁有，收藏 hydration 不會延後首屏。
  useEffect(() => {
    if (!authed) return;
    fetch('/api/me/wishlist/ids')
      .then(r => r.json())
      .then(({ data }) => setWishlistedIds(new Set(data ?? [])))
      .catch(() => {}); // Silently handle — user will see unhearted state
  }, [authed]);

  function updateUrl(q: string, regions: string[], types: string[]) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (regions.length === 1) params.set('region', regions[0]);
    if (types.length === 1) params.set('type', types[0]);
    if (dateFilter) params.set('date', dateFilter);
    if (priceMin) params.set('priceMin', priceMin);
    if (priceMax) params.set('priceMax', priceMax);
    const qs = params.toString();
    router.replace(qs ? `/activities?${qs}` : '/activities');
  }
  // 以「搜尋群組 label」為單位切換：不論已選的是短名/全名/slug，只要屬於同一群組即視為
  // 已勾（resolveSearchRegionKey 正規化到群組 label 比對）；勾選時加入群組 label（廣義）。
  function toggleRegion(label: string) {
    const isOn = selectedRegions.some((sel) => resolveSearchRegionKey(sel) === label);
    const next = isOn
      ? selectedRegions.filter((sel) => resolveSearchRegionKey(sel) !== label)
      : [...selectedRegions, label];
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
    setDateFilter('');
    setPriceMin('');
    setPriceMax('');
    router.push('/activities');
  }

  const filtered = useMemo(() => {
    let result = [...activities];
    if (selectedRegions.length > 0) {
      // 主要地區或附加地區（複選）任一命中即保留；activityMatchesRegion 會把兩端
      // 正規化成 DB 規範值，涵蓋資料端混用短名／全名的情況。
      result = result.filter((a) => selectedRegions.some((sel) => activityMatchesRegion(a, sel)));
    }
    if (selectedTypes.length > 0) {
      result = result.filter((a) =>
        selectedTypes.some((t) => isActivityInTheme(a, t))
      );
    }
    if (sort === 'price-asc') result.sort((a, b) => a.priceTwd - b.priceTwd);
    if (sort === 'price-desc') result.sort((a, b) => b.priceTwd - a.priceTwd);
    return result;
  }, [activities, selectedRegions, selectedTypes, sort]);

  const hasFilters = query || selectedRegions.length > 0 || selectedTypes.length > 0 || dateFilter || priceMin || priceMax;
  const resultLabel = query
    ? t('resultSearch', { q: query, n: filtered.length })
    : t('resultAll', { n: filtered.length });

  return (
    <main className="tp-container tp-activities" style={{ paddingBottom: 40 }}>
      <div className="tp-breadcrumb"><Link href="/">{t('breadcrumbHome')}</Link> &gt; <Link href="/activities">{t('breadcrumbActivities')}</Link>{query ? ` > ${t('breadcrumbSearch', { q: query })}` : ''}</div>

      <section className="tp-activities-layout">
        {/* 篩選側欄 */}
        <aside className="tp-filter" aria-label={t('filterAria')}>
          <div className="tp-filter-head">
            <h3>{t('filterTitle')}</h3>
            {hasFilters && <button onClick={clearAll} style={{ color: 'var(--tp-accent)', fontWeight: 600, fontSize: 13 }}>{t('clearAll')}</button>}
          </div>

          {/* 關鍵字搜尋 */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="activities-search" style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>{t('keyword')}</label>
            <input
              id="activities-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('keywordPlaceholder')}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--tp-border)', borderRadius: 8, fontSize: 13 }}
            />
          </div>

          {/* #1380: 日期可訂 */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="activities-date-filter" style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>{t('dateLabel')}</label>
            <input
              id="activities-date-filter"
              data-testid="activities-date-filter"
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--tp-border)', borderRadius: 8, fontSize: 13 }}
            />
          </div>

          {/* #1380: 價格區間 */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>{t('priceLabel')}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                aria-label={t('priceMinAria')}
                data-testid="activities-price-min"
                type="number"
                min={0}
                inputMode="numeric"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
                placeholder={t('priceMin')}
                style={{ width: '50%', padding: '8px 10px', border: '1px solid var(--tp-border)', borderRadius: 8, fontSize: 13 }}
              />
              <span style={{ color: 'var(--tp-muted)' }}>–</span>
              <input
                aria-label={t('priceMaxAria')}
                data-testid="activities-price-max"
                type="number"
                min={0}
                inputMode="numeric"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
                placeholder={t('priceMax')}
                style={{ width: '50%', padding: '8px 10px', border: '1px solid var(--tp-border)', borderRadius: 8, fontSize: 13 }}
              />
            </div>
          </div>

          <details>
            <summary>{t('regionFilter')}</summary>
            {REGIONS.map((g) => {
              const checked = selectedRegions.some((sel) => resolveSearchRegionKey(sel) === g.label);
              return (
                <label key={g.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleRegion(g.label)} />
                  {g.label}
                </label>
              );
            })}
          </details>
          <details>
            <summary>{t('themeFilter')}</summary>
            {TYPE_ITEMS.map((item) => (
              <label key={item.value} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={selectedTypes.includes(item.value)} onChange={() => toggleType(item.value)} />
                {t(`theme.${item.slug}`)}
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
            <select aria-label={t('sortAria')} value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="recommended">{t('sortRecommended')}</option>
              <option value="price-asc">{t('sortPriceAsc')}</option>
              <option value="price-desc">{t('sortPriceDesc')}</option>
            </select>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--tp-muted)' }}>
              <p style={{ fontSize: 14 }}>{t('loading')}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--tp-muted)' }}>
              <div style={{ marginBottom: 12, color: 'var(--tp-gold-strong)' }}><PublicIcon name="search" size={40} /></div>
              <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{t('emptyTitle')}</p>
              <p style={{ fontSize: 14, marginBottom: 20 }}>{t('emptyDesc')}</p>
              <button onClick={clearAll} className="tp-btn tp-btn-primary">{t('emptyClear')}</button>
            </div>
          ) : (
            <div className="tp-card-grid tp-card-grid-activities">
              {filtered.map((a, idx) => {
                const href = buildActivityHref({ slug: a.slug, region: a.region, regionSlug: a.regionSlug });
                const durationDisplay = a.durationMinutes
                  ? a.durationMinutes >= 60
                    ? a.durationMinutes % 60
                      ? t('durHoursMinutes', { h: Math.floor(a.durationMinutes / 60), m: a.durationMinutes % 60 })
                      : t('durHours', { h: Math.floor(a.durationMinutes / 60) })
                    : t('durMinutes', { m: a.durationMinutes })
                  : '';
                return (
                  <article className="tp-card" key={a.slug} data-testid="activity-card" data-activity-slug={a.slug}>
                    <div style={{ position: 'relative' }}>
                      <Image
                        // Issue #1344 — src fallback 與 sizes 抽到
                        // cover-image.ts 共用常數,跟 page 層 SSR preload
                        // 的 imagesrcset / imagesizes 保證一致,否則
                        // preload 的 URL 對不上 srcset → double download。
                        // quality=60 對應 buildCardImageSrcSet 的 q=60;
                        // Next 15 next.config 不支援 images.quality 全域
                        // 設定,必須在這裡跟著 preload URL 設值。
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
                        quality={60}
                        width={1200} height={675} />
                      <WishlistToggle activityId={a.id} initialWishlisted={wishlistedIds.has(a.id)} isLoggedIn={isLoggedIn} />
                      <span style={{
                        position: 'absolute', top: 10, left: 10,
                        background: 'var(--tp-accent)', color: '#fff',
                        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                      }}>{t(`categoryTag.${classifyActivityCategoryTag(a)}`)}</span>
                    </div>
                    {a.guideName && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 4px' }}>
                        {a.guideAvatarUrl && (
                          <Image src={a.guideAvatarUrl} alt={a.guideName} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} width={28} height={28} />
                        )}
                        <span style={{ fontSize: 13, color: 'var(--tp-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{a.guideName} <span style={{ color: 'var(--tp-brass)', display: 'inline-flex' }}><PublicIcon name="badgeCheck" size={14} /></span></span>
                      </div>
                    )}
                    <h3 style={{ fontSize: 15, margin: '4px 0 6px', lineHeight: 1.4 }}>{a.title}</h3>
                    {(() => {
                      // 與詳情頁同一真實來源（resolveActivityReviewStats）：count>0 才顯示星數/則數，
                      // 否則顯示「尚無評價」，避免出現「5.0 (0則)」這種與詳情頁不一致的假數據。
                      const stats = resolveActivityReviewStats(a);
                      return (
                        <div data-testid="activity-card-rating" style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '0 0 2px', fontSize: 13 }}>
                          {stats.count > 0 ? (
                            <>
                              <span style={{ color: '#f59e0b', display: 'inline-flex' }}><PublicIcon name="star" size={14} /></span>
                              <span>{stats.score.toFixed(1)}</span>
                              <span style={{ color: 'var(--tp-muted)' }}>{t('reviewCount', { n: stats.count })}</span>
                              <span style={{ color: 'var(--tp-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>· <PublicIcon name="pin" size={13} /> {a.region}</span>
                            </>
                          ) : (
                            <>
                              <span style={{ color: 'var(--tp-muted)' }} className="text-xs">{t('noRating')}</span>
                              <span style={{ color: 'var(--tp-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>· <PublicIcon name="pin" size={13} /> {a.region}</span>
                            </>
                          )}
                        </div>
                      );
                    })()}
                    {durationDisplay && (
                      <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--tp-muted)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><PublicIcon name="clock" size={13} /> {durationDisplay}</span> · <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><PublicIcon name="users" size={13} /> {t('people', { min: a.minParticipants ?? 0, max: a.maxParticipants ?? 0 })}</span>
                      </p>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ color: 'var(--tp-gold-strong)' }}>{t('perPerson', { price: a.priceTwd?.toLocaleString() ?? '0' })}</strong>
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
                        {t('viewActivity')}
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
