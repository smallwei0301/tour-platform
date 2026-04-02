import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getGuideBySlugDb } from '../../../src/lib/db.mjs';

export default async function GuideProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = await getGuideBySlugDb(slug).catch(() => null);
  if (!guide) return notFound();

  const guideActivities = guide.activities || [];
  const guideReviews = guide.reviews || [];

  return (
    <main className="tp-container tp-guide-detail" style={{ paddingBottom: 40 }}>
      {/* Hero cover */}
      {guide.heroImageUrl && (
        <div style={{ width: '100%', height: 300, borderRadius: 14, overflow: 'hidden', marginTop: 18, position: 'relative' }}>
          <img
            src={guide.heroImageUrl}
            alt={`${guide.displayName} 導覽封面`}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            loading="eager"
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.35))' }} />
        </div>
      )}

      <section className="tp-guide-profile-layout" style={{ display: 'grid', gap: 24, marginTop: 20 }}>
        {/* Main content */}
        <article>
          {/* Head card */}
          <div className="tp-guide-profile-head" style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24 }}>
            {guide.profilePhotoUrl && (
              <img src={guide.profilePhotoUrl} alt={guide.displayName} style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--tp-primary)' }} />
            )}
            <div>
              <h1 style={{ margin: 0 }}>{guide.displayName}</h1>
              <p style={{ margin: '4px 0', color: 'var(--tp-muted)' }}>
                ✅ 已驗證 · ⭐ {guide.ratingAvg?.toFixed(1) || '5.0'}（{guideReviews.length} 則評價，{guide.serviceCount || 0} 次服務） · 📍 {guide.region}
                {guide.languages?.length > 0 && ` · 🌍 ${guide.languages.slice(0, 4).join('、')}`}
              </p>
              {guide.specialties?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {guide.specialties.map((s: string) => (
                    <span key={s} style={{ background: '#e6f4ed', color: 'var(--tp-primary)', padding: '3px 10px', borderRadius: 10, fontSize: 12 }}>{s}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* About */}
          <section className="tp-detail-block" style={{ marginBottom: 28 }}>
            <h2>關於我</h2>
            <p style={{ lineHeight: 1.8, whiteSpace: 'pre-line' }}>{guide.bio}</p>
          </section>

          {/* Verification badges */}
          {guide.verificationBadges?.length > 0 && (
            <section className="tp-detail-block" style={{ marginBottom: 28 }}>
              <h2>認證與資歷</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {guide.verificationBadges.map((b: string) => (
                  <span key={b} style={{ background: '#e6f4ed', color: 'var(--tp-primary)', padding: '6px 14px', borderRadius: 10, fontSize: 13 }}>✅ {b}</span>
                ))}
              </div>
            </section>
          )}

          {/* Gallery */}
          {guide.galleryUrls?.length > 0 && (
            <section className="tp-detail-block" style={{ marginBottom: 28 }}>
              <h2>照片集</h2>
              <div className="tp-guide-profile-gallery" style={{ display: 'grid', gap: 8 }}>
                {guide.galleryUrls.map((url: string, i: number) => (
                  <img key={i} src={url} alt={`${guide.displayName} 照片 ${i + 1}`} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 10 }} loading="lazy" />
                ))}
              </div>
            </section>
          )}

          {/* Activities */}
          {guideActivities.length > 0 && (
            <section className="tp-detail-block" style={{ marginBottom: 28 }}>
              <h2>我的行程</h2>
              <div className="tp-card-grid tp-card-grid-activities">
                {guideActivities.map((a: any) => (
                  <article className="tp-card" key={a.slug}>
                    {a.coverImageUrl && (
                      <img src={a.coverImageUrl} alt={a.title} className="tp-card-img" style={{ background: 'none' }} loading="lazy" />
                    )}
                    <h3>{a.title}</h3>
                    <p>📍 {a.region}</p>
                    <strong style={{ color: 'var(--tp-primary)' }}>起價 NT${a.priceTwd?.toLocaleString()} / 人</strong>
                    <Link className="tp-link" href={`/activities/${a.region?.toLowerCase().replace(/[^\w]/g, '-') || 'taiwan'}/${a.slug}`}>查看行程 →</Link>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Reviews */}
          {guideReviews.length > 0 && (
            <section className="tp-detail-block">
              <h2>旅客評價</h2>
              <p style={{ marginBottom: 14 }}>⭐ {guide.ratingAvg?.toFixed(1) || '5.0'} · 共 {guideReviews.length} 則評價</p>
              <div style={{ display: 'grid', gap: 12 }}>
                {guideReviews.map((r: any) => (
                  <div key={r.id} style={{ background: 'var(--tp-bg-soft)', border: '1px solid var(--tp-border)', borderRadius: 10, padding: 14 }}>
                    <div className="tp-guide-review-head" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <strong>{r.author}{r.city ? `（${r.city}）` : ''}</strong>
                      <span style={{ color: 'var(--tp-muted)', fontSize: 13 }}>{r.date || r.createdAt?.slice(0, 10)}</span>
                    </div>
                    <p style={{ color: '#f5a623', margin: '0 0 6px' }}>{'★'.repeat(r.rating)}</p>
                    <p style={{ margin: 0, lineHeight: 1.6 }}>{r.text || r.comment}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </article>

        {/* Sidebar */}
        <aside className="tp-guide-profile-side" style={{ position: 'sticky', top: 80, height: 'fit-content' }}>
          <div className="tp-booking-card" style={{ border: '1px solid var(--tp-border)', borderRadius: 12, padding: 20, textAlign: 'center' }}>
            {guide.profilePhotoUrl && (
              <img src={guide.profilePhotoUrl} alt={guide.displayName} style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover' }} />
            )}
            <p style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>{guide.displayName}</p>
            <p style={{ color: 'var(--tp-muted)' }}>⭐ {guide.ratingAvg?.toFixed(1) || '5.0'}（{guideReviews.length} 則）</p>
            <button className="tp-btn tp-btn-primary" style={{ width: '100%', marginTop: 12 }}>傳訊息給導遊</button>
            <Link className="tp-btn tp-btn-ghost" href="/activities" style={{ width: '100%', display: 'block', marginTop: 8 }}>查看行程</Link>
          </div>
        </aside>
      </section>
    </main>
  );
}
