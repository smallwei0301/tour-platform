import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActivityBySlugDb } from '../../../../src/lib/db.mjs';
import { DatePlanSection } from '../../../../src/components/activity/DatePlanSection';
import { ActivityBottomBar } from '../../../../src/components/activity/ActivityBottomBar';
import { SectionAnchorNav } from '../../../../src/components/activity/SectionAnchorNav';
import { ImageCarousel } from '../../../../src/components/activity/ImageCarousel';

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
  const imageUrls: string[] = activity.imageUrls?.length
    ? activity.imageUrls
    : activity.coverImageUrl ? [activity.coverImageUrl] : [];
  const originalPrice = Math.round(activity.priceTwd * 1.25);
  const ratingScore = guide?.ratingAvg?.toFixed(1) || '5.0';
  const ratingLabel = Number(ratingScore) >= 4.5 ? '非常好' : Number(ratingScore) >= 4.0 ? '很好' : '良好';

  return (
    <main className="kkd-detail-page" style={{ paddingBottom: 100 }}>

      {/* ── Breadcrumb ── */}
      <div className="tp-container">
        <div className="tp-breadcrumb">
          <Link href="/">首頁</Link> &gt;{' '}
          <Link href="/activities">全部行程</Link> &gt;{' '}
          <Link href={`/activities/${activity.regionSlug || activity.region}`}>{activity.region}</Link> &gt;{' '}
          {activity.title}
        </div>
      </div>

      {/* ── Hero Gallery ── */}
      {imageUrls.length > 0 && (
        <div className="tp-container">
          <ImageCarousel images={imageUrls} alt={activity.title} />
        </div>
      )}

      {/* ── Title Block ── */}
      <div className="tp-container">
        <div className="kkd-title-block">
          {/* Category tag */}
          {activity.category && (
            <div className="kkd-tag-row">
              <span className="kkd-tag">{activity.category}</span>
              {activity.durationDisplay && <span className="kkd-tag kkd-tag-gray">{activity.durationDisplay}</span>}
            </div>
          )}

          <h1 className="kkd-title">{activity.title}</h1>

          {/* Rating row */}
          <div className="kkd-meta-row">
            <span className="kkd-star-score">★ {ratingScore}</span>
            <span className="kkd-rating-label">{ratingLabel}</span>
            {actReviews.length > 0 && (
              <span className="kkd-review-count">（{actReviews.length} 則評價）</span>
            )}
            <span className="kkd-dot">·</span>
            <span className="kkd-location">📍 {activity.region}</span>
          </div>

          {/* Price */}
          <div className="kkd-price-row">
            <span className="kkd-price-from">起</span>
            <strong className="kkd-price">NT${activity.priceTwd.toLocaleString()}</strong>
            <span className="kkd-orig-price">NT${originalPrice.toLocaleString()}</span>
            <span className="kkd-price-unit">/ 人</span>
          </div>

          {/* Quick-info chips */}
          <div className="kkd-info-chips">
            <span className="kkd-chip">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              認證導遊
            </span>
            {activity.durationDisplay && (
              <span className="kkd-chip">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {activity.durationDisplay}
              </span>
            )}
            <span className="kkd-chip">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              {activity.minParticipants}~{activity.maxParticipants} 人
            </span>
            <span className="kkd-chip">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              出發前 3 天確認
            </span>
            <span className="kkd-chip">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              安全付款
            </span>
          </div>

          {/* Short description / highlights */}
          {(activity.shortDescription || (activity.socialProofQuotes && activity.socialProofQuotes.length > 0)) && (
            <div className="kkd-highlights">
              {activity.shortDescription && (
                <p className="kkd-short-desc">{activity.shortDescription}</p>
              )}
              {activity.socialProofQuotes && activity.socialProofQuotes.length > 0 && (
                <div className="kkd-quote-chips">
                  {activity.socialProofQuotes.map((q: string, i: number) => (
                    <span key={i} className="kkd-quote-chip">💬 {q}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Anchor nav (sticky) — KKday 順序 ── */}
      <div className="kkd-anchor-wrap">
        <div className="tp-container">
          <SectionAnchorNav sections={[
            { id: 'section-plan',       label: '方案' },
            { id: 'section-reviews',    label: '評價' },
            { id: 'section-itinerary',  label: '觀光行程' },
            { id: 'section-details',    label: '商品說明' },
            { id: 'section-policy',     label: '購買須知' },
          ]} />
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="tp-container">
        <div className="kkd-scroll-layout">

          {/* ── Main ── */}
          <div className="kkd-scroll-main">

            {/* ═══ SECTION 1：方案 ═══ */}
            <section id="section-plan" className="kkd-scroll-section">
              <h2 className="kkd-section-title">方案</h2>
              <DatePlanSection activity={activity} schedules={displayedSchedules} />
            </section>

            {/* ═══ SECTION 2：評價 ═══ */}
            <section id="section-reviews" className="kkd-scroll-section">
              <h2 className="kkd-section-title">評價</h2>

              {/* Rating summary */}
              <div className="kkd-rating-summary">
                <div className="kkd-rating-big">
                  <span className="kkd-rating-score">{ratingScore}</span>
                  <span className="kkd-rating-word">{ratingLabel}</span>
                  <div className="kkd-stars-row">
                    {[1,2,3,4,5].map(s => (
                      <span key={s} className={s <= Math.round(Number(ratingScore)) ? 'kkd-star-on' : 'kkd-star-off'}>★</span>
                    ))}
                  </div>
                  <span className="kkd-rating-total">{actReviews.length} 則評價</span>
                </div>
                <div className="kkd-rating-bars">
                  {[
                    { label: '豐富度', score: Number(ratingScore) },
                    { label: '服務',   score: Math.min(5, Number(ratingScore) + 0.2) },
                    { label: '性價比', score: Math.max(3, Number(ratingScore) - 0.1) },
                    { label: '交通',   score: Math.max(3, Number(ratingScore) - 0.3) },
                  ].map(({ label, score }) => (
                    <div key={label} className="kkd-rating-bar-row">
                      <span className="kkd-rating-bar-label">{label}</span>
                      <div className="kkd-rating-bar-track">
                        <div className="kkd-rating-bar-fill" style={{ width: `${(score / 5) * 100}%` }} />
                      </div>
                      <span className="kkd-rating-bar-score">{score.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Review list */}
              {actReviews.length > 0 ? (
                <div className="kkd-review-list">
                  {actReviews.slice(0, 3).map((r: any) => (
                    <div key={r.id} className="kkd-review-card">
                      <div className="kkd-review-header">
                        <div className="kkd-reviewer-avatar">{(r.author || 'K')[0]}</div>
                        <div>
                          <strong className="kkd-reviewer">{r.author}（{r.city || 'TW'}）</strong>
                          <div className="kkd-review-meta">
                            <span className="kkd-stars-sm">{'★'.repeat(r.rating || 5)}</span>
                            <span className="kkd-review-date">{r.date || ''}</span>
                          </div>
                        </div>
                      </div>
                      <p className="kkd-review-text">{r.text}</p>
                    </div>
                  ))}
                  {actReviews.length > 3 && (
                    <button className="kkd-more-btn">查看更多評價 ∨</button>
                  )}
                </div>
              ) : (
                <p className="kkd-empty-reviews">尚無評價，快成為第一位評價者！</p>
              )}
            </section>

            {/* ═══ SECTION 3：觀光行程 ═══ */}
            {activity.itinerary && activity.itinerary.length > 0 && (
              <section id="section-itinerary" className="kkd-scroll-section">
                <h2 className="kkd-section-title">觀光行程</h2>
                <div className="kkd-itinerary">
                  {activity.itinerary.map((step: any, i: number) => (
                    <div key={i} className="kkd-itinerary-step">
                      <div className="kkd-itinerary-icon">{step.icon || '📍'}</div>
                      <div className="kkd-itinerary-content">
                        <div className="kkd-itinerary-header">
                          <strong className="kkd-itinerary-title">{step.title}</strong>
                          {step.duration && <span className="kkd-itinerary-duration">{step.duration}</span>}
                        </div>
                        {step.description && <p className="kkd-itinerary-desc">{step.description}</p>}
                      </div>
                      {i < activity.itinerary.length - 1 && <div className="kkd-itinerary-connector" />}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ═══ SECTION 4：商品說明 ═══ */}
            <section id="section-details" className="kkd-scroll-section">
              <h2 className="kkd-section-title">商品說明</h2>

              {activity.inclusions && activity.inclusions.length > 0 && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">費用包含</h3>
                  <ul className="kkd-checklist">
                    {activity.inclusions.map((item: string, i: number) => (
                      <li key={i}><span className="kkd-check-icon kkd-check-yes">✓</span>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {activity.exclusions && activity.exclusions.length > 0 && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">費用不含</h3>
                  <ul className="kkd-checklist">
                    {activity.exclusions.map((item: string, i: number) => (
                      <li key={i}><span className="kkd-check-icon kkd-check-no">✕</span>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {activity.goodFor && activity.goodFor.length > 0 && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">適合對象</h3>
                  <div className="kkd-tag-list">
                    {activity.goodFor.map((item: string, i: number) => (
                      <span key={i} className="kkd-tag kkd-tag-green">👍 {item}</span>
                    ))}
                  </div>
                </div>
              )}

              {activity.description && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">行程描述</h3>
                  <div className="kkd-collapsible">
                    <p className="kkd-desc-text">{activity.description}</p>
                  </div>
                </div>
              )}

              {/* Guide card inside 商品說明 */}
              {guide && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">關於你的導遊</h3>
                  <div className="kkd-guide-card">
                    <img
                      src={guide.profilePhotoUrl || guide.avatarUrl || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&q=80'}
                      alt={guide.displayName}
                      className="kkd-guide-avatar"
                    />
                    <div className="kkd-guide-info">
                      <strong className="kkd-guide-name">{guide.displayName}</strong>
                      <span className="kkd-guide-verified">✅ 實名已驗證</span>
                      <p className="kkd-guide-meta">
                        ★ {guide.ratingAvg?.toFixed(1) || '5.0'}
                        （{guide.reviewCount || guide.serviceCount || 0} 次服務）
                        &nbsp;·&nbsp;📍 {guide.region}
                        {guide.languages && guide.languages.length > 0 && (
                          <>&nbsp;·&nbsp;{guide.languages.slice(0, 3).join('、')}</>
                        )}
                      </p>
                      {(guide.headline || guide.bio) && (
                        <p className="kkd-guide-headline">「{guide.headline || guide.bio}」</p>
                      )}
                      <Link href={`/guides/${guide.slug}`} className="kkd-link-sm">查看完整導遊簡介 →</Link>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* ═══ SECTION 5：購買須知 ═══ */}
            <section id="section-policy" className="kkd-scroll-section">
              <h2 className="kkd-section-title">購買須知</h2>

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

              {/* 使用說明 */}
              <div className="kkd-detail-block">
                <h3 className="kkd-detail-subtitle">使用說明</h3>
                <ul className="kkd-notice-list">
                  <li>預約成功後將收到確認 Email，請保留憑證</li>
                  <li>出發當天出示電子憑證即可</li>
                  <li>如有臨時變更，請提前聯繫導遊</li>
                </ul>
              </div>

              {activity.safetyNotice && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">安全說明</h3>
                  <p className="kkd-notice-text">{activity.safetyNotice}</p>
                </div>
              )}
            </section>

            {/* ═══ SECTION 6：取消條款 ═══ */}
            {activity.refundRules && activity.refundRules.length > 0 && (
              <section className="kkd-scroll-section">
                <h2 className="kkd-section-title">取消條款</h2>
                <ul className="kkd-notice-list">
                  {activity.refundRules.map((r: string, i: number) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* ═══ SECTION 7：常見問題 ═══ */}
            {activity.faq && activity.faq.length > 0 && (
              <section className="kkd-scroll-section">
                <h2 className="kkd-section-title">常見問題</h2>
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

          </div>

          {/* ── Sidebar (desktop only) ── */}
          <aside className="kkd-booking-side">
            <div className="kkd-booking-card">
              <div className="kkd-booking-price-block">
                <span className="kkd-booking-orig">NT${originalPrice.toLocaleString()}</span>
                <strong className="kkd-booking-price">
                  NT${activity.priceTwd.toLocaleString()}
                  <span style={{ fontSize: 13, fontWeight: 400 }}> 起 / 人</span>
                </strong>
              </div>

              {displayedSchedules.length > 0 && (
                <div className="kkd-booking-schedules">
                  <p className="kkd-booking-schedule-title">近期可預約場次</p>
                  {displayedSchedules.slice(0, 4).map((s: any, i: number) => {
                    const startAt = s.startAt || s.start_at;
                    const capacity = Number(s.capacity || 0);
                    const bookedCount = Number(s.bookedCount ?? s.booked_count ?? 0);
                    const status = s.status || (bookedCount >= capacity ? 'full' : 'open');
                    const d = new Date(startAt);
                    const label = `${d.getMonth()+1}/${d.getDate()}（${['日','一','二','三','四','五','六'][d.getDay()]}）`;
                    const remaining = capacity - bookedCount;
                    return (
                      <div key={s.id || i} className="kkd-booking-schedule-row">
                        <span>{label}</span>
                        {status === 'full'
                          ? <span className="kkd-full-label">已額滿</span>
                          : <span className="kkd-avail-label">剩 {remaining} 位</span>
                        }
                      </div>
                    );
                  })}
                </div>
              )}

              <Link href={`/booking/${activity.slug}`} className="tp-btn tp-btn-primary"
                style={{ width:'100%', display:'block', textAlign:'center', padding:'14px 0', fontSize:16, marginTop:16 }}>
                查看方案
              </Link>
              <button className="tp-btn tp-btn-ghost" style={{ width:'100%', marginTop:8 }}>
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
        priceLabel={`NT$${activity.priceTwd?.toLocaleString()} 起`}
        price={activity.priceTwd || 0}
      />
    </main>
  );
}
