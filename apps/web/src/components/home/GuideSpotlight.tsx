import Image from 'next/image';
import Link from 'next/link';
import { guides, getActivitiesByGuide } from '../../fixtures/data';
import { buildActivityHref } from '../../lib/activity-url';

export function GuideSpotlight() {
  const andy = guides.find((g) => g.slug === 'andy-lee');
  if (!andy) return null;
  const andyActivities = getActivitiesByGuide('andy-lee');

  return (
    <section className="tp-section" style={{ background: 'var(--tp-bg-soft)' }}>
      <div className="tp-container">
        <div className="tp-section-head">
          <h2>🔦 焦點導遊</h2>
        </div>
        <div className="tp-guide-spotlight-layout" style={{ display: 'grid', gap: 24, alignItems: 'start' }}>
          <div style={{ textAlign: 'center' }}>
            <Image
              src={andy.avatarUrl}
              alt={andy.displayName}
              loading="lazy"
              style={{ width: 160, height: 160, borderRadius: '50%', objectFit: 'cover', border: '4px solid var(--tp-primary)' }} width={160} height={160} />
            <h3 style={{ marginTop: 12 }}>{andy.displayName}</h3>
            <p style={{ color: 'var(--tp-muted)', fontSize: 14 }}>⭐ {andy.rating} · {andy.reviewCount} 則評價</p>
            <p style={{ fontSize: 13, color: 'var(--tp-muted)' }}>📍 {andy.region} · 🌍 {andy.languages.slice(0, 3).join('、')}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 8 }}>
              {andy.specialties.map((s) => (
                <span key={s} style={{ background: 'var(--tp-primary)', color: '#fff', padding: '3px 10px', borderRadius: 12, fontSize: 12 }}>{s}</span>
              ))}
            </div>
            <Link href={`/guides/${andy.slug}`} className="tp-btn tp-btn-primary" style={{ marginTop: 14, display: 'inline-block' }}>
              查看完整簡介
            </Link>
          </div>
          <div>
            <p style={{ fontSize: 16, lineHeight: 1.7, marginBottom: 16 }}>{andy.shortBio}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {andy.verificationBadges.map((b) => (
                <span key={b} style={{ background: '#e6f4ed', color: 'var(--tp-primary)', padding: '4px 12px', borderRadius: 8, fontSize: 13 }}>✅ {b}</span>
              ))}
            </div>
            <h4 style={{ marginBottom: 8 }}>Andy 的行程</h4>
            <div className="tp-card-grid" style={{ gridTemplateColumns: '1fr' }}>
              {andyActivities.map((a) => (
                <article className="tp-card tp-guide-spotlight-activity" key={a.slug} style={{ display: 'grid', gap: 14, padding: 12 }}>
                  <Image src={a.imageUrl} alt={a.title} style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 10 }} loading="lazy" width={1200} height={675} />
                  <div>
                    <h3 style={{ fontSize: 16, margin: '0 0 6px' }}>{a.title}</h3>
                    <p style={{ margin: '0 0 4px', fontSize: 14, color: 'var(--tp-muted)' }}>🕐 {a.durationDisplay} · {a.transportMode} · 👥 {a.minParticipants}~{a.maxParticipants} 人</p>
                    <strong style={{ color: 'var(--tp-primary)' }}>{a.priceLabel}</strong>
                    <br />
                    <Link className="tp-link" href={buildActivityHref({ slug: a.slug, region: a.region, regionSlug: a.regionSlug })} style={{ fontSize: 14 }}>查看行程 →</Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
