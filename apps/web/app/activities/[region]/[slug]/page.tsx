import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { unstable_cache } from 'next/cache';
import { getActivityBySlugDb } from '../../../../src/lib/db.mjs';
import { DatePlanSection } from '../../../../src/components/activity/DatePlanSection';
import { ActivityBottomBar } from '../../../../src/components/activity/ActivityBottomBar';
import { SectionAnchorNav } from '../../../../src/components/activity/SectionAnchorNav';
import { ImageCarousel } from '../../../../src/components/activity/ImageCarousel';
import { isBookingV2Enabled } from '../../../../src/config/feature-flags.mjs';
import { resolveBookingEntryHref } from '../../../../src/lib/booking-entry.mjs';
import { ActivityQASection } from '../../../../src/components/activity/ActivityQASection';

// Issue #84 strategy: page shell/content stay on ISR; volatile availability moves to client intent fetch.
export const dynamic = 'force-static';
export const revalidate = 300;

export async function generateMetadata(
  { params }: { params: Promise<{ region: string; slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug} | Tour Platform`,
    description: '探索台灣在地導遊行程',
  };
}

async function getCachedActivityBySlug(slug: string) {
  return unstable_cache(
    async () => getActivityBySlugDb(slug, { preferFixtureFirst: true }),
    ['activity-detail', slug],
    { revalidate: 60, tags: [`activity:${slug}`] }
  )();
}

export default async function ActivityDetailPage({ params }: { params: Promise<{ region: string; slug: string }> }) {
  const { slug } = await params;
  const activity = await getCachedActivityBySlug(slug).catch((): null => null);
  if (!activity) return notFound();

  const activityData = activity as typeof activity & {
    ratingAvg?: number | null;
    reviewCount?: number;
    itinerary?: Array<{ icon?: string; title?: string; duration?: string; description?: string }>;
    socialProofQuotes?: string[];
    goodFor?: string[];
  };
  const guide = activity.guide;
  const actReviews = activity.reviews || [];
  const displayedSchedules = activity.schedules || [];
  const useBookingV2 = isBookingV2Enabled();

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

      {/* ── Gallery ── */}
      {imageUrls.length > 0 && (
        <div className="tp-container">
          <ImageCarousel images={imageUrls} alt={activity.title} />
        </div>
      )}

      {/* ── Title block ── */}
      <div className="tp-container">
        <div className="kkd-title-block">
          <h1 className="kkd-title" data-testid="activity-detail-title">{activity.title}</h1>
          {activity.tagline && (
            <p className="kkd-tagline">{activity.tagline}</p>
          )}

          <div className="kkd-meta-row">
            <span className="kkd-rating" data-testid="activity-detail-rating">
              {activityData.ratingAvg != null ? (
                <>★ {activityData.ratingAvg.toFixed(1)}<span className="kkd-review-count">（{activityData.reviewCount ?? 0} 則評價）</span></>
              ) : (
                <span style={{ color: 'var(--tp-muted)', fontSize: 13 }}>尚無評價</span>
              )}
            </span>
            <span className="kkd-dot">·</span>
            <span className="kkd-location">📍 {activity.region}</span>
          </div>

          <div className="kkd-price-row">
            <span className="kkd-orig-price">NT${originalPrice.toLocaleString()}</span>
            <strong className="kkd-price">NT${activity.priceTwd.toLocaleString()}</strong>
            <span className="kkd-price-unit">起 / 人</span>
          </div>

          {/* Policy + activity info row */}
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
              {(activity as {transportMode?: string}).transportMode || '步行'}
            </span>
            <span className="kkd-policy-item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              {activity.minParticipants}~{activity.maxParticipants} 人
            </span>
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
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              安全付款
            </span>
          </div>

          {/* Short description */}
          {activity.shortDescription && (
            <p className="kkd-short-desc">{activity.shortDescription}</p>
          )}
        </div>
      </div>

      {/* ── Anchor nav (sticky) ── */}
      <div className="kkd-anchor-wrap">
        <div className="tp-container">
          <SectionAnchorNav sections={[
            { id: 'section-plan', label: '方案' },
            { id: 'section-itinerary', label: '行程' },
            { id: 'section-reviews', label: '評價' },
            { id: 'section-details', label: '商品說明' },
            { id: 'section-policy', label: '購買須知' },
            { id: 'section-qa', label: '問答' },
          ]} />
        </div>
      </div>

      {/* ── Two-column layout: main + sidebar ── */}
      <div className="tp-container">
        <div className="kkd-scroll-layout">

          {/* ── Main content ── */}
          <div className="kkd-scroll-main">

            {/* SECTION 1: 方案 (DatePlanSection) */}
            <section id="section-plan" className="kkd-scroll-section">
              <h2 className="kkd-section-title">🗓 選擇方案</h2>
              <DatePlanSection activity={activity} schedules={displayedSchedules} useBookingV2={useBookingV2} />
            </section>

            {/* SECTION 1.5: 詳細行程時間表 */}
            {activityData.itinerary && activityData.itinerary.length > 0 && (
              <section id="section-itinerary" className="kkd-scroll-section">
                <h2 className="kkd-section-title">🗺 詳細行程</h2>
                <div className="kkd-itinerary">
                  {activityData.itinerary.map((step: { icon?: string; title?: string; duration?: string; description?: string }, i: number) => (
                    <div key={i} className="kkd-itinerary-step">
                      <div className="kkd-itinerary-icon">{step.icon || '📍'}</div>
                      <div className="kkd-itinerary-content">
                        <div className="kkd-itinerary-header">
                          <strong className="kkd-itinerary-title">{step.title}</strong>
                          {step.duration && <span className="kkd-itinerary-duration">{step.duration}</span>}
                        </div>
                        {step.description && <p className="kkd-itinerary-desc">{step.description}</p>}
                      </div>
                      {i < activityData.itinerary!.length - 1 && <div className="kkd-itinerary-connector" />}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* SECTION 2: 旅客評價 */}
            <section id="section-reviews" className="kkd-scroll-section">
              <h2 className="kkd-section-title">⭐ 旅客評價</h2>
              <div className="kkd-reviews-summary">
                <span className="kkd-reviews-score">★ {activityData.ratingAvg != null ? activityData.ratingAvg.toFixed(1) : (guide?.ratingAvg?.toFixed(1) || '5.0')}</span>
                <span className="kkd-reviews-total">共 {actReviews.length} 則評價</span>
              </div>

              {/* Social proof quote chips */}
              {activityData.socialProofQuotes && activityData.socialProofQuotes.length > 0 && (
                <div className="kkd-quote-chips">
                  {activityData.socialProofQuotes.map((q: string, i: number) => (
                    <span key={i} className="kkd-quote-chip">💬 {q}</span>
                  ))}
                </div>
              )}

              <div className="kkd-review-list">
                {actReviews.map((r: any) => (
                  <div key={r.id} className="kkd-review-card">
                    <div className="kkd-review-header">
                      <strong className="kkd-reviewer">{r.author}（{r.city || 'TW'}）</strong>
                      <span className="kkd-review-date">{r.date || new Date().toLocaleDateString('zh-TW')}</span>
                    </div>
                    {r.rating && (
                      <div className="kkd-stars">{'★'.repeat(r.rating)}</div>
                    )}
                    <p className="kkd-review-text">{r.text}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* SECTION 3: 商品說明 */}
            <section id="section-details" className="kkd-scroll-section">
              <h2 className="kkd-section-title">📋 商品說明</h2>

              {activity.inclusions && activity.inclusions.length > 0 && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">行程包含</h3>
                  <ul className="kkd-checklist">
                    {activity.inclusions.map((item: string, i: number) => (
                      <li key={i}><span className="kkd-check">✅</span>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {activity.exclusions && activity.exclusions.length > 0 && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">行程不含</h3>
                  <ul className="kkd-checklist">
                    {activity.exclusions.map((item: string, i: number) => (
                      <li key={i}><span className="kkd-check">❌</span>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {activityData.goodFor && activityData.goodFor.length > 0 && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">適合對象</h3>
                  <ul className="kkd-checklist">
                    {activityData.goodFor.map((item: string, i: number) => (
                      <li key={i}><span className="kkd-check">👍</span>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {activity.description && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">行程描述</h3>
                  <p style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{activity.description}</p>
                </div>
              )}
            </section>

            {/* SECTION 4: 購買須知 */}
            <section id="section-policy" className="kkd-scroll-section">
              <h2 className="kkd-section-title">📌 購買須知</h2>

              {activity.notices && activity.notices.length > 0 && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">注意事項</h3>
                  <ul className="kkd-notice-list">
                    {activity.notices.map((n: string, i: number) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}

              {activity.refundRules && activity.refundRules.length > 0 && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">取消與退款政策</h3>
                  <ul className="kkd-notice-list">
                    {activity.refundRules.map((r: string, i: number) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {activity.safetyNotice && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">安全說明</h3>
                  <p className="kkd-notice-text">{activity.safetyNotice}</p>
                </div>
              )}
            </section>

            {/* 導遊介紹 */}
            {guide && (
              <section className="kkd-scroll-section">
                <h2 className="kkd-section-title">🧑‍🦯 關於你的導遊</h2>
                <div className="kkd-guide-card">
                  <img
                    src={guide.profilePhotoUrl || (guide as {avatarUrl?: string}).avatarUrl || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&q=80'}
                    alt={guide.displayName}
                    className="kkd-guide-avatar"
                  />
                  <div className="kkd-guide-info">
                    <strong className="kkd-guide-name">{guide.displayName}</strong>
                    <span className="kkd-guide-verified">✅ 實名已驗證</span>
                    <p className="kkd-guide-meta">
                      ⭐ {guide.ratingAvg?.toFixed(1) || '5.0'}（{guide.reviewCount || (guide as {serviceCount?: number}).serviceCount || 0} 次服務）&nbsp;·&nbsp;
                      📍 {guide.region}
                      {guide.languages && guide.languages.length > 0 && (
                        <>&nbsp;·&nbsp;🌍 {guide.languages.slice(0, 3).join('、')}</>
                      )}
                    </p>
                    {(guide.headline || guide.bio) && (
                      <p className="kkd-guide-headline">「{guide.headline || guide.bio}」</p>
                    )}
                    <Link href={`/guides/${guide.slug}`} className="kkd-link-sm">
                      查看完整導遊簡介 →
                    </Link>
                  </div>
                </div>
              </section>
            )}

            {/* FAQ */}
            {activity.faq && activity.faq.length > 0 && (
              <section className="kkd-scroll-section">
                <h2 className="kkd-section-title">❓ 常見問題</h2>
                <div className="kkd-faq-list">
                  {activity.faq.map((item: any, i: number) => (
                    <details key={i} className="kkd-faq-item">
                      <summary className="kkd-faq-q">{item.question || item.q}</summary>
                      <p className="kkd-faq-a">{item.answer || item.a}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}

            {/* Q&A section — ActivityQASection (client component) */}
            <ActivityQASection activityId={activity.id} />

          </div>

          {/* ── Sidebar (desktop only) ── */}
          <aside className="kkd-booking-side">
            <div className="kkd-booking-card">
              <div className="kkd-booking-price-block">
                <span className="kkd-booking-orig">NT${originalPrice.toLocaleString()}</span>
                <strong className="kkd-booking-price">
                  NT${activity.priceTwd.toLocaleString()} <span style={{ fontSize: 14, fontWeight: 400 }}>起 / 人</span>
                </strong>
              </div>

              {displayedSchedules.length > 0 && (
                <div className="kkd-booking-schedules">
                  <p className="kkd-booking-schedule-title">近期可預約場次</p>
                  {displayedSchedules.map((s: any, i: number) => {
                    const startAt = s.startAt || s.start_at;
                    const capacity = Number(s.capacity || 0);
                    const bookedCount = Number(s.bookedCount ?? s.booked_count ?? 0);
                    const status = s.status || (bookedCount >= capacity ? 'full' : 'open');
                    const d = new Date(startAt);
                    const label = `${d.getMonth() + 1}/${d.getDate()}（${['日','一','二','三','四','五','六'][d.getDay()]}）`;
                    const remaining = capacity - bookedCount;
                    return (
                      <div key={s.id || i} className="kkd-booking-schedule-row">
                        <span>{label}</span>
                        {status === 'full' ? (
                          <span className="kkd-full-label">已額滿</span>
                        ) : (
                          <span className="kkd-avail-label">剩 {remaining} 位</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <Link
                href={resolveBookingEntryHref({ activitySlug: activity.slug, useBookingV2 })}
                className="tp-btn tp-btn-primary"
                data-testid="begin-checkout-btn"
                style={{ width: '100%', display: 'block', textAlign: 'center', padding: '14px 0', fontSize: 16, marginTop: 16 }}
              >
                立即預約
              </Link>
              <button className="tp-btn tp-btn-ghost" style={{ width: '100%', marginTop: 8 }}>
                ✉️ 詢問導遊
              </button>

              <div className="kkd-booking-trust">
                <p>🔒 安全付款（ECPay / LINE Pay）</p>
                <p>✅ 免費取消（依各行程政策）</p>
                <p>📞 緊急熱線 30 分鐘回應</p>
                <p>✅ 實名認證導遊</p>
              </div>
            </div>
          </aside>

        </div>
      </div>

      {/* ── Mobile bottom bar ── */}
      <ActivityBottomBar
        activitySlug={activity.slug}
        activityId={activity.id}
        priceLabel={`NT$${activity.priceTwd?.toLocaleString()} / 人`}
        price={activity.priceTwd || 0}
        useBookingV2={useBookingV2}
      />
    </main>
  );
}
