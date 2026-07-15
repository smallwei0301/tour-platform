'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PublicIcon } from '../../../src/components/ui/PublicIcon';
import { listSearchRegions, resolveSearchRegionKey, expandRegionToDbValues, normalizeRegionToDbValue } from '../../../src/lib/region-slugs.mjs';

interface Guide {
  slug: string;
  displayName: string;
  region?: string;
  languages?: string[];
  specialties?: string[];
  profilePhotoUrl?: string;
  ratingAvg?: number;
  reviewCount?: number;
  headline?: string;
  serviceCount?: number;
}

interface GuidesContentProps {
  guides: any[];
}

export default function GuidesContent({ guides }: GuidesContentProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations('guides');

  // Derive filter options from actual guide data。地區改用「短名搜尋群組」呈現（與
  // footer／行程側欄同源 listSearchRegions），只列出實際有導遊的群組；比對時把導遊
  // 存的全名（高雄市）與群組短名（高雄）經 expandRegionToDbValues 展開後對應。
  const { regions, languages, specialties } = useMemo(() => {
    const regionLabelSet = new Set<string>();
    const languageSet = new Set<string>();
    const specialtySet = new Set<string>();
    for (const g of guides) {
      if (g.region) regionLabelSet.add(resolveSearchRegionKey(g.region) || g.region);
      if (Array.isArray(g.languages)) g.languages.forEach((l: string) => languageSet.add(l));
      if (Array.isArray(g.specialties)) g.specialties.forEach((s: string) => specialtySet.add(s));
    }
    const order = listSearchRegions().map((x) => x.label);
    return {
      regions: Array.from(regionLabelSet).sort((a, b) => order.indexOf(a) - order.indexOf(b)),
      languages: Array.from(languageSet).sort(),
      specialties: Array.from(specialtySet).sort(),
    };
  }, [guides]);

  // Initialize state from URL params。任意輸入正規化成群組短名 label，讓 ?region=高雄
  // 與 ?region=高雄市 都能對上 checkbox 並展開比對。
  const [selectedRegions, setSelectedRegions] = useState<string[]>(
    () => searchParams.getAll('region').map((r) => resolveSearchRegionKey(r) || r)
  );
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(
    () => searchParams.getAll('lang')
  );
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>(
    () => searchParams.getAll('spec')
  );
  const [sort, setSort] = useState<string>(
    () => searchParams.get('sort') ?? 'recommended'
  );
  const [query, setQuery] = useState<string>(
    () => searchParams.get('q') ?? ''
  );

  // Sync URL → state when URL params change (back/forward navigation)
  useEffect(() => {
    setSelectedRegions(searchParams.getAll('region'));
    setSelectedLanguages(searchParams.getAll('lang'));
    setSelectedSpecialties(searchParams.getAll('spec'));
    setSort(searchParams.get('sort') ?? 'recommended');
    setQuery(searchParams.get('q') ?? '');
  }, [searchParams]);

  // Debounced URL update for text query (500ms)
  useEffect(() => {
    const t = setTimeout(() => {
      router.push(buildUrl(selectedRegions, selectedLanguages, selectedSpecialties, sort, query), { scroll: false });
    }, 500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function buildUrl(
    regions: string[],
    langs: string[],
    specs: string[],
    sortVal: string,
    q: string = ''
  ): string {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    regions.forEach((r) => params.append('region', r));
    langs.forEach((l) => params.append('lang', l));
    specs.forEach((s) => params.append('spec', s));
    if (sortVal && sortVal !== 'recommended') params.set('sort', sortVal);
    const qs = params.toString();
    return qs ? `/guides?${qs}` : '/guides';
  }

  function toggleRegion(r: string) {
    const next = selectedRegions.includes(r)
      ? selectedRegions.filter((x) => x !== r)
      : [...selectedRegions, r];
    setSelectedRegions(next);
    router.push(buildUrl(next, selectedLanguages, selectedSpecialties, sort, query), { scroll: false });
  }

  function toggleLanguage(l: string) {
    const next = selectedLanguages.includes(l)
      ? selectedLanguages.filter((x) => x !== l)
      : [...selectedLanguages, l];
    setSelectedLanguages(next);
    router.push(buildUrl(selectedRegions, next, selectedSpecialties, sort, query), { scroll: false });
  }

  function toggleSpecialty(s: string) {
    const next = selectedSpecialties.includes(s)
      ? selectedSpecialties.filter((x) => x !== s)
      : [...selectedSpecialties, s];
    setSelectedSpecialties(next);
    router.push(buildUrl(selectedRegions, selectedLanguages, next, sort, query), { scroll: false });
  }

  function handleSort(s: string) {
    setSort(s);
    router.push(buildUrl(selectedRegions, selectedLanguages, selectedSpecialties, s, query), { scroll: false });
  }

  function clearAll() {
    setSelectedRegions([]);
    setSelectedLanguages([]);
    setSelectedSpecialties([]);
    setSort('recommended');
    setQuery('');
    router.push('/guides');
  }

  // Filter and sort guides in-memory
  const filtered = useMemo(() => {
    let result: Guide[] = [...(guides as Guide[])];
    // Text search across name, headline, region, specialties, languages
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      result = result.filter((g) =>
        g.displayName?.toLowerCase().includes(q) ||
        g.headline?.toLowerCase().includes(q) ||
        g.region?.toLowerCase().includes(q) ||
        g.specialties?.some((s) => s.toLowerCase().includes(q)) ||
        g.languages?.some((l) => l.toLowerCase().includes(q))
      );
    }
    if (selectedRegions.length > 0) {
      // 導遊存全名（高雄市）；選取的群組短名（高雄）展開後比對，嘉義/新竹會涵蓋市+縣。
      result = result.filter((g) =>
        g.region && selectedRegions.some((sel) => expandRegionToDbValues(sel).includes(normalizeRegionToDbValue(g.region)))
      );
    }
    if (selectedLanguages.length > 0) {
      result = result.filter((g) =>
        selectedLanguages.some((l) => g.languages?.includes(l))
      );
    }
    if (selectedSpecialties.length > 0) {
      result = result.filter((g) =>
        selectedSpecialties.some((s) => g.specialties?.includes(s))
      );
    }
    if (sort === 'rating-desc') {
      result.sort((a, b) => (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0));
    } else if (sort === 'reviews-desc') {
      result.sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0));
    }
    return result;
  }, [guides, query, selectedRegions, selectedLanguages, selectedSpecialties, sort]);

  const hasFilters =
    !!query.trim() ||
    selectedRegions.length > 0 ||
    selectedLanguages.length > 0 ||
    selectedSpecialties.length > 0 ||
    sort !== 'recommended';

  return (
    <section className="tp-activities-layout">
      {/* Filter sidebar */}
      <aside className="tp-filter" aria-label={t('filterAria')}>
        <div className="tp-filter-head">
          <h3>{t('filterTitle')}</h3>
          {hasFilters && (
            <button
              onClick={clearAll}
              style={{ color: 'var(--tp-accent)', fontWeight: 600, fontSize: 13 }}
            >
              {t('clearAll')}
            </button>
          )}
        </div>

        {/* Text search */}
        <div style={{ marginBottom: 12 }}>
          <label htmlFor="guide-search" style={{ display: 'none' }}>{t('searchLabel')}</label>
          <input
            id="guide-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchLabel')}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid var(--tp-border)',
              borderRadius: 8,
              fontSize: 13,
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Region */}
        {regions.length > 0 && (
          <details>
            <summary>{t('regionFilter')}</summary>
            {regions.map((r) => (
              <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={selectedRegions.includes(r)}
                  onChange={() => toggleRegion(r)}
                />
                {r}
              </label>
            ))}
          </details>
        )}

        {/* Language */}
        {languages.length > 0 && (
          <details>
            <summary>{t('languageFilter')}</summary>
            {languages.map((l) => (
              <label key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={selectedLanguages.includes(l)}
                  onChange={() => toggleLanguage(l)}
                />
                {l}
              </label>
            ))}
          </details>
        )}

        {/* Specialty */}
        {specialties.length > 0 && (
          <details>
            <summary>{t('specialtyFilter')}</summary>
            {specialties.map((s) => (
              <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={selectedSpecialties.includes(s)}
                  onChange={() => toggleSpecialty(s)}
                />
                {s}
              </label>
            ))}
          </details>
        )}
      </aside>

      {/* Results section */}
      <section>
        {/* aria-live announces filter result count changes to screen readers */}
        <div aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>
          {hasFilters ? t('resultAria', { n: filtered.length }) : ''}
        </div>
        <div className="tp-result-head">
          {/* 頁面唯一 H1 由 server page 輸出（SSR 可見）；這裡是動態結果數，降為 h2（issue1711 S3） */}
          <h2 className="tp-result-title">{t('resultCount', { n: filtered.length })}</h2>
          <select aria-label={t('sortAria')} value={sort} onChange={(e) => handleSort(e.target.value)}>
            <option value="recommended">{t('sortRecommended')}</option>
            <option value="rating-desc">{t('sortRatingDesc')}</option>
            <option value="reviews-desc">{t('sortReviewsDesc')}</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--tp-muted)' }}>
            <div style={{ marginBottom: 12, color: 'var(--tp-gold-strong)' }}><PublicIcon name="search" size={40} /></div>
            <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{t('emptyTitle')}</p>
            <p style={{ fontSize: 14, marginBottom: 20 }}>{t('emptyDesc')}</p>
            <button onClick={clearAll} className="tp-btn tp-btn-primary">
              {t('emptyClear')}
            </button>
          </div>
        ) : (
          <div className="tp-guide-list-grid">
            {filtered.map((g: any, idx: number) => (
              <article className="tp-guide-list-card" key={g.slug}>
                <div className="tp-guide-list-thumb">
                  <Image
                    src={
                      g.profilePhotoUrl ||
                      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&q=80'
                    }
                    alt={g.displayName}
                    priority={idx === 0}
                    loading={idx === 0 ? undefined : 'lazy'}
                    width={224}
                    height={224}
                  />
                  <span className="tp-guide-list-verified">✅ {t('verified')}</span>
                </div>
                <div className="tp-guide-list-body">
                  <h3>{g.displayName}</h3>
                  <p className="tp-guide-list-meta">
                    <span className="tp-guide-list-rating">
                      ⭐ {g.ratingAvg?.toFixed(1) || '5.0'}
                    </span>
                    {t('reviewCount', { n: g.reviewCount || 0 })} · 📍 {g.region ? (resolveSearchRegionKey(g.region) || g.region) : ''}
                  </p>
                  {g.languages?.length > 0 && (
                    <p className="tp-guide-list-meta">🌍 {g.languages.slice(0, 3).join('、')}</p>
                  )}
                  {g.specialties?.length > 0 && (
                    <p className="tp-guide-list-tags">{g.specialties.slice(0, 3).join(' · ')}</p>
                  )}
                  {g.headline && (
                    <p className="tp-guide-list-headline">
                      「{g.headline.length > 40 ? g.headline.slice(0, 40) + '...' : g.headline}」
                    </p>
                  )}
                  <div className="tp-guide-list-foot">
                    <span className="tp-guide-list-count">{t('serviceCount', { n: g.serviceCount || 0 })}</span>
                    <Link className="tp-link" href={`/guides/${g.slug}`}>
                      {t('viewProfile')}
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
