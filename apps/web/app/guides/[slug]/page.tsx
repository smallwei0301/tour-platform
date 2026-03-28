import Link from 'next/link';
import { guides, getActivitiesByGuide, getReviewsByGuide } from '../../../src/fixtures/data';
import { notFound } from 'next/navigation';

export default async function GuideProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = guides.find((g) => g.slug === slug);
  if (!guide) return notFound();

  const guideActivities = getActivitiesByGuide(slug);
  const guideReviews = getReviewsByGuide(slug);

  return (
    <main className="tp-container tp-guide-detail" style={{ paddingBottom: 40 }}>
      {/* Hero cover */}
      <div style={{ width: '100%', height: 300, borderRadius: 14, overflow: 'hidden', marginTop: 18, position: 'relative' }}>
        <img
          src={guide.heroImageUrl}
          alt={`${guide.displayName} 導覽封面`}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          loading="eager"
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.35))' }} />
      </div>

      <section className="tp-guide-profile-layout" style={{ display: 'grid', gap: 24, marginTop: 20 }}>
        {/* Main content */}
        <article>
          {/* Head card */}
          <div className="tp-guide-profile-head" style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24 }}>
            <img src={guide.avatarUrl} alt={guide.displayName} style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--tp-primary)' }} />
            <div>
              <h1 style={{ margin: 0 }}>{guide.displayName}</h1>
              <p style={{ margin: '4px 0', color: 'var(--tp-muted)' }}>
                ✅ 已驗證 · ⭐ {guide.rating}（{guideReviews.length} 則評價，{guide.serviceCount} 次服務） · 📍 {guide.region} · 🌍 {guide.languages.slice(0, 4).join('、')}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {guide.specialties.map((s) => (
                  <span key={s} style={{ background: '#e6f4ed', color: 'var(--tp-primary)', padding: '3px 10px', borderRadius: 10, fontSize: 12 }}>{s}</span>
                ))}
              </div>
            </div>
          </div>

          {/* About */}
          <section className="tp-detail-block" style={{ marginBottom: 28 }}>
            <h2>關於我</h2>
            <p style={{ lineHeight: 1.8, whiteSpace: 'pre-line' }}>{guide.longBio}</p>
          </section>

          {/* Verification badges */}
          <section className="tp-detail-block" style={{ marginBottom: 28 }}>
            <h2>認證與資歷</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {guide.verificationBadges.map((b) => (
                <span key={b} style={{ background: '#e6f4ed', color: 'var(--tp-primary)', padding: '6px 14px', borderRadius: 10, fontSize: 13 }}>✅ {b}</span>
              ))}
            </div>
          </section>

          {/* Gallery */}
          {guide.galleryUrls.length > 0 && (
            <section className="tp-detail-block" style={{ marginBottom: 28 }}>
              <h2>照片集</h2>
              <div className="tp-guide-profile-gallery" style={{ display: 'grid', gap: 8 }}>
                {guide.galleryUrls.map((url, i) => (
                  <img key={i} src={url} alt={`${guide.displayName} 照片 ${i + 1}`} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 10 }} loading="lazy" />
                ))}
              </div>
            </section>
          )}

          {/* Activities */}
          <section className="tp-detail-block" style={{ marginBottom: 28 }}>
            <h2>我的行程</h2>
            <div className="tp-card-grid tp-card-grid-activities">
              {guideActivities.map((a) => (
                <article className="tp-card" key={a.slug}>
                  <img src={a.imageUrl} alt={a.title} className="tp-card-img" style={{ background: 'none' }} loading="lazy" />
                  <h3>{a.title}</h3>
                  <p>🕐 {a.durationDisplay} · 👥 {a.minParticipants}~{a.maxParticipants}</p>
                  <strong style={{ color: 'var(--tp-primary)' }}>起價 {a.priceLabel}</strong>
                  <Link className="tp-link" href={`/activities/${a.regionSlug}/${a.slug}`}>查看行程 →</Link>
                </article>
              ))}
            </div>
          </section>

          {/* Reviews */}
          <section className="tp-detail-block">
            <h2>旅客評價</h2>
            <p style={{ marginBottom: 14 }}>⭐ {guide.rating} · 共 {guideReviews.length} 則評價</p>
            <div style={{ display: 'grid', gap: 12 }}>
              {guideReviews.map((r) => (
                <div key={r.id} style={{ background: 'var(--tp-bg-soft)', border: '1px solid var(--tp-border)', borderRadius: 10, padding: 14 }}>
                  <div className="tp-guide-review-head" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <strong>{r.author}（{r.city}）</strong>
                    <span style={{ color: 'var(--tp-muted)', fontSize: 13 }}>{r.date}</span>
                  </div>
                  <p style={{ color: '#f5a623', margin: '0 0 6px' }}>{'★'.repeat(r.rating)}</p>
                  <p style={{ margin: 0, lineHeight: 1.6 }}>{r.text}</p>
                </div>
              ))}
            </div>
          </section>
        </article>

        {/* Sidebar */}
        <aside className="tp-guide-profile-side" style={{ position: 'sticky', top: 80, height: 'fit-content' }}>
          <div className="tp-booking-card" style={{ border: '1px solid var(--tp-border)', borderRadius: 12, padding: 20, textAlign: 'center' }}>
            <img src={guide.avatarUrl} alt={guide.displayName} style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover' }} />
            <p style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>{guide.displayName}</p>
            <p style={{ color: 'var(--tp-muted)' }}>⭐ {guide.rating}（{guideReviews.length} 則）</p>
            <button className="tp-btn tp-btn-primary" style={{ width: '100%', marginTop: 12 }}>傳訊息給導遊</button>
            <Link className="tp-btn tp-btn-ghost" href="/activities" style={{ width: '100%', display: 'block', marginTop: 8 }}>查看行程</Link>
          </div>
        </aside>
      </section>
    </main>
  );
}
