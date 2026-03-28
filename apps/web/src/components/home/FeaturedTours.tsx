import Link from 'next/link';
import { activities } from '../../fixtures/data';

export function FeaturedTours() {
  const featured = activities.slice(0, 4);

  return (
    <section className="tp-section">
      <div className="tp-container">
        <div className="tp-section-head">
          <h2>精選行程</h2>
          <Link href="/activities" className="tp-link">查看全部 →</Link>
        </div>
        <div className="tp-card-grid">
          {featured.map((a) => (
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
              </div>
              <h3>{a.title}</h3>
              <p>⭐ {activities.find(x => x.slug === a.slug) ? '5.0' : '—'}</p>
              <p>🕐 {a.durationDisplay} · {a.transportMode} · 👥 {a.minParticipants}~{a.maxParticipants} 人</p>
              <p>📍 {a.region}</p>
              <strong style={{ color: 'var(--tp-primary)' }}>起價 {a.priceLabel}</strong>
              <Link className="tp-link" href={`/activities/${a.regionSlug}/${a.slug}`}>查看行程 →</Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
