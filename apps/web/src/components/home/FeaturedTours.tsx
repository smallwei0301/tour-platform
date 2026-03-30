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

async function fetchFeaturedExperiences(): Promise<{ data: FeaturedExperience[]; error?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) return { data: [] };

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const mapRows = (rows: any[]) =>
    (rows || []).map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      imageUrl: row.image_url ?? row.imageUrl ?? null,
      region: row.region ?? null,
      regionSlug: row.region_slug ?? row.regionSlug ?? null,
      priceLabel: row.price_label ?? row.priceLabel ?? null,
      priceTwd: row.price_twd ?? row.priceTwd ?? null,
      durationDisplay: row.duration_display ?? row.durationDisplay ?? null,
      durationMinutes: row.duration_minutes ?? row.durationMinutes ?? null,
      minParticipants: row.min_participants ?? row.minParticipants ?? null,
      maxParticipants: row.max_participants ?? row.maxParticipants ?? null,
      transportMode: row.transport_mode ?? row.transportMode ?? null
    }));

  const runQuery = async (query) => {
    let result = await query.order('created_at', { ascending: false }).limit(4);
    if (result.error) {
      result = await query.order('id', { ascending: false }).limit(4);
    }
    return result;
  };

  const runFeatured = async (column: string) =>
    runQuery(supabase.from('experiences').select('*').eq(column, true));

  let result = await runFeatured('is_featured');
  if (result.error) {
    result = await runFeatured('featured');
  }

  if (!result.error && (result.data || []).length === 0) {
    result = await runQuery(supabase.from('experiences').select('*'));
  }

  if (result.error) {
    return { data: [], error: result.error.message };
  }

  return { data: mapRows(result.data || []) };
}

export async function FeaturedTours() {
  const { data: featured, error } = await fetchFeaturedExperiences();
  const hasData = featured.length > 0;

  return (
    <section className="tp-section">
      <div className="tp-container">
        <div className="tp-section-head">
          <h2>精選行程</h2>
          <Link href="/activities" className="tp-link">查看全部 →</Link>
        </div>
        <div className="tp-card-grid">
          {!hasData ? (
            <div style={{ gridColumn: '1 / -1', color: 'var(--tp-muted)' }}>
              {error ? '精選行程暫時無法載入，請稍後再試。' : '目前沒有精選行程，先看看最新行程吧。'}
            </div>
          ) : (
            featured.map((a) => {
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
            })
          )}
        </div>
      </div>
    </section>
  );
}
