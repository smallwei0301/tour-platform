import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActivityBySlugDb } from '../../../../src/lib/db.mjs';
import { DatePlanSection } from '../../../../src/components/activity/DatePlanSection';
import { ActivityBottomBar } from '../../../../src/components/activity/ActivityBottomBar';
import { SectionAnchorNav } from '../../../../src/components/activity/SectionAnchorNav';

export async function generateMetadata(
  { params }: { params: Promise<{ region: string; slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const activity = await getActivityBySlugDb(slug).catch(() => null);
  if (!activity) return { title: '行程不存在 | Tour Platform' };
  return {
    title: `${activity.title} | Tour Platform`,
    description: activity.shortDescription || activity.tagline,
    openGraph: {
      title: activity.title,
      description: activity.shortDescription || activity.tagline,
      images: activity.coverImageUrl ? [{ url: activity.coverImageUrl }] : [],
    },
  };
}

export default async function ActivityDetailPage({ params }: { params: Promise<{ region: string; slug: string }> }) {
  const { slug } = await params;
  const activity = await getActivityBySlugDb(slug).catch(() => null);
  if (!activity) return notFound();

  const guide = activity.guide;
  const actReviews = activity.reviews || [];
  const displayedSchedules = activity.schedules || [];

  const imageUrls: string[] = activity.imageUrls?.length ? activity.imageUrls : (activity.coverImageUrl ? [activity.coverImageUrl] : []);
  const originalPrice = Math.round(activity.priceTwd * 1.25);

  return (
    <main className="kkd-detail-page" style={{ paddingBottom: 100 }}>
      {/* ── Breadcrumb ── */}
      <div className="tp-container">
        <div className="tp-breadcrumb">
          <Link href="/">首頁</Link> &gt;{' '}
          <Link href="/activities">全部行程</Link> &gt;{' '}
          {activity.region} &gt; {activity.title}
        </div>
      </div>

      {/* ── Gallery (KKday style: 3fr:1fr layout) ── */}
      {imageUrls.length > 0 && (
        <div className="tp-container">
          <div className="kkd-gallery">
            <img
              src={imageUrls[0]}
              alt={activity.title}
              className="kkd-gallery-main"
            />
            {imageUrls.length > 1 && (
              <div className="kkd-gallery-grid">
                {imageUrls.slice(1, 4).map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`${activity.title} ${i + 2}`}
                    className="kkd-gallery-thumb"
                    loading="lazy"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Title block (KKday style) ── */}
      <div className="tp-container">
        <div className="kkd-title-block">
          <h1 className="kkd-title">{activity.title}</h1>

          {/* Rating + location */}
          <div className="kkd-meta-row">
            <span className="kkd-rating">
              ★ {guide?.ratingAvg?.toFixed(1) || '5.0'}
              <span className="kkd-review-count">（{actReviews.length} 則評價）</span>
            </span>
            <span className="kkd-dot">·</span>
            <span className="kkd-location">📍 {activity.region}</span>
          </div>

          {/* Price (KKday style: original + discount) */}
          <div className="kkd-price-row">
            <span className="kkd-orig-price">NT${originalPrice.toLocaleString()}</span>
            <strong className="kkd-price">NT${activity.priceTwd.toLocaleString()}</strong>
            <span className="kkd-price-unit">起 / 人</span>
          </div>

          {/* Policy + activity info row — black SVG icons */}
          <div className="kkd-policy-row">
            <span className="kkd-policy-item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              認證導遊
            </span>
            <span className="kkd-policy-item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              {activity.durationDisplay}
            </span>
            <span className="kkd-policy-item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="2"/><path d="M12 7v8"/><path d="M9 10h6"/><path d="M9 19l3-4 3 4"/></svg>
              {activity.transportMode || '步行'}
            </span>
            <span className="kkd-policy-item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              {activity.minParticipants}~{activity.maxParticipants} 人
            </span>
            {/* Divider: push policy items to next row */}
            <span className="kkd-policy-divider" />
            <span className="kkd-policy-item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              最晚出發前 3 天確認
            </span>
            <span className="kkd-policy-item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
              電子憑證
            </span>
            <span className="kkd-policy-item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><polyline points="12 6 12 12 16 14"/></svg>
              {activity.durationDisplay}
            </span>
          </div>

          {/* Cancellation Policy */}
          {activity.refundRules && activity.refundRules.length > 0 && (
            <div style={{ marginTop: 16, padding: 12, background: '#f8fafc', borderRadius: 8 }}>
              <p style={{ fontWeight: 600, marginBottom: 6 }}>取消政策</p>
              {activity.refundRules.map((rule, i) => (
                <p key={i} style={{ fontSize: 14, color: 'var(--tp-muted)', margin: '4px 0' }}>
                  {rule}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Section Anchor Nav ── */}
      <SectionAnchorNav sections={[
        { id: 'section-description', label: '行程詳情' },
        { id: 'section-dates', label: '選擇日期' },
        { id: 'section-guide', label: '認識導遊' },
        { id: 'section-reviews', label: '旅客評價' },
      ]} />

      {/* ── SECTION 1: Description ── */}
      <section id="section-description" className="kkd-scroll-section">
        <div className="tp-container">
          <h2 className="kkd-section-title">行程詳情</h2>
          <div style={{ color: 'var(--tp-text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {activity.description}
          </div>

          {/* Inclusions / Exclusions */}
          <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {activity.inclusions && activity.inclusions.length > 0 && (
              <div>
                <h3 style={{ fontWeight: 600, marginBottom: 8 }}>✅ 費用包含</h3>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {activity.inclusions.map((item, i) => (
                    <li key={i} style={{ margin: '4px 0', fontSize: 14 }}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {activity.exclusions && activity.exclusions.length > 0 && (
              <div>
                <h3 style={{ fontWeight: 600, marginBottom: 8 }}>❌ 費用不含</h3>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {activity.exclusions.map((item, i) => (
                    <li key={i} style={{ margin: '4px 0', fontSize: 14 }}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Notices / FAQ */}
          {activity.notices && activity.notices.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontWeight: 600, marginBottom: 8 }}>⚠️ 重要注意事項</h3>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {activity.notices.map((notice, i) => (
                  <li key={i} style={{ margin: '4px 0', fontSize: 14 }}>
                    {notice}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* ── SECTION 2: Date Plan ── */}
      <section id="section-dates" className="kkd-scroll-section">
        <div className="tp-container">
          <h2 className="kkd-section-title">選擇日期</h2>
          <DatePlanSection activity={activity} schedules={displayedSchedules} />
        </div>
      </section>

      {/* ── SECTION 3: Guide ── */}
      {guide && (
        <section id="section-guide" className="kkd-scroll-section">
          <div className="tp-container">
            <h2 className="kkd-section-title">認識導遊</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16, alignItems: 'start' }}>
              {guide.profilePhotoUrl && (
                <img
                  src={guide.profilePhotoUrl}
                  alt={guide.displayName}
                  style={{ width: 120, height: 120, borderRadius: 8, objectFit: 'cover' }}
                />
              )}
              <div>
                <h3 style={{ margin: '0 0 4px' }}>{guide.displayName}</h3>
                <p style={{ margin: '0 0 8px', color: 'var(--tp-muted)', fontSize: 14 }}>
                  ⭐ {guide.ratingAvg?.toFixed(1) || '5.0'}（{guide.reviewCount || 0} 則評價） · 📍 {guide.region}
                </p>
                <p style={{ margin: 0, color: 'var(--tp-text)', fontSize: 14, lineHeight: 1.6 }}>
                  {guide.bio}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── SECTION 4: Reviews (KKday style) ── */}
      {actReviews.length > 0 && (
        <section id="section-reviews" className="kkd-scroll-section">
          <div className="tp-container">
            <h2 className="kkd-section-title">⭐ 旅客評價</h2>
            <div className="kkd-reviews-summary">
              <span className="kkd-reviews-score">★ {guide?.ratingAvg?.toFixed(1) || '5.0'}</span>
              <span className="kkd-reviews-total">共 {actReviews.length} 則評價</span>
            </div>
            <div className="kkd-review-list">
              {actReviews.map((r: any) => (
                <div key={r.id} className="kkd-review-card">
                  <div className="kkd-review-header">
                    <strong className="kkd-reviewer">{r.author}（{r.city || 'TW'}）</strong>
                    <span className="kkd-review-date">{r.date || new Date().toLocaleDateString('zh-TW')}</span>
                  </div>
                  <p className="kkd-review-text">{r.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Safety & FAQ ── */}
      {activity.safetyNotice && (
        <section className="kkd-scroll-section">
          <div className="tp-container">
            <h2 className="kkd-section-title">🛡️ 安全提醒</h2>
            <p style={{ color: 'var(--tp-text)', lineHeight: 1.7 }}>{activity.safetyNotice}</p>
          </div>
        </section>
      )}

      {activity.faq && activity.faq.length > 0 && (
        <section className="kkd-scroll-section">
          <div className="tp-container">
            <h2 className="kkd-section-title">常見問題</h2>
            <div style={{ display: 'grid', gap: 12 }}>
              {activity.faq.map((item: any, i: number) => (
                <details key={i} style={{ border: '1px solid var(--tp-border)', borderRadius: 8, padding: 12 }}>
                  <summary style={{ fontWeight: 600, cursor: 'pointer' }}>
                    {item.q}
                  </summary>
                  <p style={{ margin: '8px 0 0', color: 'var(--tp-muted)' }}>
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Bottom CTA Bar ── */}
      <ActivityBottomBar activity={activity} />
    </main>
  );
}
