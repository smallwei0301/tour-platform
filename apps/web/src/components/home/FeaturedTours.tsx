import Link from 'next/link';
import { activities, guides } from '../../fixtures/data';
import { buildActivityHref } from '../../lib/activity-url';

export function FeaturedTours() {
  // 取前 6 筆 mock 活動作為精選
  const featured = activities.slice(0, 6);

  return (
    <section className="tp-section">
      <div className="tp-container">
        <div className="tp-section-head">
          <h2>精選行程</h2>
          <Link href="/activities" className="tp-link">查看全部 →</Link>
        </div>
        <div className="tp-card-grid tp-card-grid-featured">
          {featured.map((a) => {
            const guide = guides.find((g) => g.slug === a.guideSlug);
            return (
              <article className="tp-card" key={a.slug}>
                <div style={{ position: 'relative' }}>
                  <img
                    src={a.imageUrl}
                    alt={a.title}
                    className="tp-card-img"
                    style={{ background: 'none' }}
                    loading="lazy"
                  />
                  <button className="tp-fav-btn" aria-label="收藏">❤️</button>
                  <span style={{
                    position: 'absolute', top: 10, left: 10,
                    background: 'var(--tp-accent)', color: '#fff',
                    fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                  }}>{a.category}</span>
                </div>
                {guide && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 4px' }}>
                    <img src={guide.avatarUrl} alt={guide.displayName}
                      style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} />
                    <span style={{ fontSize: 12, color: 'var(--tp-muted)' }}>{guide.displayName} ✅</span>
                  </div>
                )}
                <h3 style={{ fontSize: 15, margin: '4px 0 6px', lineHeight: 1.4 }}>{a.title}</h3>
                <p style={{ margin: '0 0 2px', fontSize: 13, color: 'var(--tp-muted)' }}>⭐ 5.0 · 📍 {a.region}</p>
                <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--tp-muted)' }}>🕐 {a.durationDisplay} · 👥 {a.minParticipants}~{a.maxParticipants} 人</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                  <strong style={{ color: 'var(--tp-primary)', fontSize: 15 }}>{a.priceLabel}</strong>
                  <Link className="tp-btn tp-btn-primary" href={buildActivityHref({ slug: a.slug, region: a.region, regionSlug: a.regionSlug })}
                    style={{ fontSize: 13, padding: '6px 14px' }}>
                    查看行程
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
