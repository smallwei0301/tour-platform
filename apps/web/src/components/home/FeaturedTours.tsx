import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

type FeaturedExperience = {
  id?: string;
  slug: string;
  title: string;
  imageUrl?: string | null;
  region?: string | null;
  regionSlug?: string | null;
  priceLabel?: string | null;
  priceTwd?: number | null;
  durationDisplay?: string | null;
  durationMinutes?: number | null;
  minParticipants?: number | null;
  maxParticipants?: number | null;
  transportMode?: string | null;
};

async function fetchFeaturedExperiences(): Promise<FeaturedExperience[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) return [];

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const selectFields = [
    'id',
    'slug',
    'title',
    'image_url',
    'region',
    'region_slug',
    'price_twd',
    'price_label',
    'duration_display',
    'duration_minutes',
    'min_participants',
    'max_participants',
    'transport_mode',
    'featured',
    'created_at'
  ].join(', ');

  let { data, error } = await supabase
    .from('experiences')
    .select(selectFields)
    .eq('featured', true)
    .order('created_at', { ascending: false })
    .limit(4);

  if (error) {
    const fallback = await supabase
      .from('experiences')
      .select(selectFields)
      .order('created_at', { ascending: false })
      .limit(4);
    data = fallback.data || [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    imageUrl: row.image_url,
    region: row.region,
    regionSlug: row.region_slug,
    priceLabel: row.price_label,
    priceTwd: row.price_twd,
    durationDisplay: row.duration_display,
    durationMinutes: row.duration_minutes,
    minParticipants: row.min_participants,
    maxParticipants: row.max_participants,
    transportMode: row.transport_mode
  }));
}

export async function FeaturedTours() {
  const featured = await fetchFeaturedExperiences();

  return (
    <section className="tp-section">
      <div className="tp-container">
        <div className="tp-section-head">
          <h2>精選行程</h2>
          <Link href="/activities" className="tp-link">查看全部 →</Link>
        </div>
        <div className="tp-card-grid">
          {featured.map((a) => {
            const priceLabel = a.priceLabel || (a.priceTwd ? `NT$${Number(a.priceTwd).toLocaleString('en-US')} / 人` : '價格待定');
            const durationLabel = a.durationDisplay || (a.durationMinutes ? `${Math.round(Number(a.durationMinutes) / 60)} 小時` : '—');
            const regionSlug = a.regionSlug || 'all';

            return (
              <article className="tp-card" key={a.id || a.slug}>
                <div style={{ position: 'relative' }}>
                  <img
                    src={a.imageUrl || ''}
                    alt={a.title}
                    className="tp-card-img"
                    style={{ background: 'none' }}
                    loading="lazy"
                  />
                  <button className="tp-fav-btn" aria-label="收藏">❤️</button>
                </div>
                <h3>{a.title}</h3>
                <p>⭐ 5.0</p>
                <p>🕐 {durationLabel} · {a.transportMode || '—'} · 👥 {a.minParticipants ?? '—'}~{a.maxParticipants ?? '—'} 人</p>
                <p>📍 {a.region || '—'}</p>
                <strong style={{ color: 'var(--tp-primary)' }}>起價 {priceLabel}</strong>
                <Link className="tp-link" href={`/activities/${regionSlug}/${a.slug}`}>查看行程 →</Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
