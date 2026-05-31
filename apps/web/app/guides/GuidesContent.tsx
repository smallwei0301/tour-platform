'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { PublicIcon } from '../../src/components/ui/PublicIcon';

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

  // Derive filter options from actual guide data
  const { regions, languages, specialties } = useMemo(() => {
    const regionSet = new Set<string>();
    const languageSet = new Set<string>();
    const specialtySet = new Set<string>();
    for (const g of guides) {
      if (g.region) regionSet.add(g.region);
      if (Array.isArray(g.languages)) g.languages.forEach((l: string) => languageSet.add(l));
      if (Array.isArray(g.specialties)) g.specialties.forEach((s: string) => specialtySet.add(s));
    }
    return {
      regions: Array.from(regionSet).sort(),
      languages: Array.from(languageSet).sort(),
      specialties: Array.from(specialtySet).sort(),
    };
  }, [guides]);

  // Initialize state from URL params
  const [selectedRegions, setSelectedRegions] = useState<string[]>(
    () => searchParams.getAll('region')
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
      result = result.filter((g) => g.region && selectedRegions.includes(g.region));
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
      <aside className="tp-filter" aria-label="篩選條件">
        <div className="tp-filter-head">
          <h3>導遊篩選</h3>
          {hasFilters && (
            <button
              onClick={clearAll}
              style={{ color: 'var(--tp-accent)', fontWeight: 600, fontSize: 13 }}
            >
              清除全部
            </button>
          )}
        </div>

        {/* Text search */}
        <div style={{ marginBottom: 12 }}>
          <label htmlFor="guide-search" style={{ display: 'none' }}>搜尋導遊</label>
          <input
            id="guide-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋導遊名稱、地區、專長…"
            aria-label="搜尋導遊"
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
          <details open>
            <summary>縣市</summary>
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
          <details open>
            <summary>語言</summary>
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
          <details open>
            <summary>主題專長</summary>
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
        <div className="tp-result-head">
          <h1>全台灣 {filtered.length} 位在地導遊</h1>
          <select aria-label="排序" value={sort} onChange={(e) => handleSort(e.target.value)}>
            <option value="recommended">推薦排序</option>
            <option value="rating-desc">評分高到低</option>
            <option value="reviews-desc">評價多到少</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--tp-muted)' }}>
            <div style={{ marginBottom: 12, color: 'var(--tp-primary)' }}><PublicIcon name="search" size={40} /></div>
            <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>找不到符合條件的導遊</p>
            <p style={{ fontSize: 14, marginBottom: 20 }}>試試看其他篩選條件，或清除現有篩選</p>
            <button onClick={clearAll} className="tp-btn tp-btn-primary">
              清除所有篩選
            </button>
          </div>
        ) : (
          <div className="tp-card-grid tp-card-grid-activities">
            {filtered.map((g: any, idx: number) => (
              <article className="tp-card" key={g.slug}>
                <div style={{ position: 'relative' }}>
                  <Image
                    src={
                      g.profilePhotoUrl ||
                      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&q=80'
                    }
                    alt={g.displayName}
                    style={{
                      width: '100%',
                      aspectRatio: '3/4',
                      objectFit: 'cover',
                      borderRadius: 10,
                    }}
                    priority={idx === 0}
                    loading={idx === 0 ? undefined : 'lazy'}
                    width={1200}
                    height={675}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      background: '#27ae60',
                      color: '#fff',
                      padding: '3px 8px',
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  >
                    ✅ 已驗證
                  </span>
                </div>
                <h3 style={{ marginTop: 10 }}>{g.displayName}</h3>
                <p>
                  ⭐ {g.ratingAvg?.toFixed(1) || '5.0'}（{g.reviewCount || 0} 則評價）
                </p>
                <p>📍 {g.region}</p>
                {g.languages?.length > 0 && (
                  <p>🌍 {g.languages.slice(0, 3).join('、')}</p>
                )}
                {g.specialties?.length > 0 && (
                  <p style={{ fontSize: 13 }}>{g.specialties.slice(0, 3).join(' · ')}</p>
                )}
                {g.headline && (
                  <p
                    style={{
                      fontSize: 13,
                      color: 'var(--tp-muted)',
                      fontStyle: 'italic',
                      margin: '6px 0',
                    }}
                  >
                    「{g.headline.length > 40 ? g.headline.slice(0, 40) + '...' : g.headline}」
                  </p>
                )}
                <p style={{ fontSize: 13, color: 'var(--tp-muted)' }}>
                  {g.serviceCount || 0} 次服務
                </p>
                <Link className="tp-link" href={`/guides/${g.slug}`}>
                  查看導遊簡介 →
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
