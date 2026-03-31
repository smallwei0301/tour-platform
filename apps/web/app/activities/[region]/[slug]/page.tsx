import Link from 'next/link';
import { activities, guides, getReviewsByActivity } from '../../../../src/fixtures/data';
import { notFound } from 'next/navigation';
import { listExperiencesDb } from '../../../../src/lib/db.mjs';
import { DatePlanSection } from '../../../../src/components/activity/DatePlanSection';
import { ActivityBottomBar } from '../../../../src/components/activity/ActivityBottomBar';
import { SectionAnchorNav } from '../../../../src/components/activity/SectionAnchorNav';

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ region: string; slug: string }>;
}) {
  const { slug } = await params;
  const activity = activities.find((a) => a.slug === slug);
  if (!activity) return notFound();

  const guide = guides.find((g) => g.slug === activity.guideSlug);
  const actReviews = getReviewsByActivity(slug);

  const experienceList = await listExperiencesDb().catch(() => []);
  const expMatch = (experienceList || []).find(
    (e: any) =>
      e.slug === activity.slug ||
      (Array.isArray(e.aliases) && e.aliases.includes(activity.slug))
  );
  const runtimeSchedules = Array.isArray(expMatch?.schedules) ? expMatch.schedules : [];
  const displayedSchedules =
    runtimeSchedules.length > 0 ? runtimeSchedules : activity.schedules;

  const originalPrice = Math.round(activity.price * 1.25);

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
      <div className="tp-container">
        <div className="kkd-gallery">
          <img
            src={activity.galleryUrls[0] || activity.imageUrl}
            alt={activity.title}
            className="kkd-gallery-main"
          />
          <div className="kkd-gallery-grid">
            {activity.galleryUrls.slice(1, 4).map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`${activity.title} ${i + 2}`}
                className="kkd-gallery-thumb"
                loading="lazy"
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Title block ── */}
      <div className="tp-container">
        <div className="kkd-title-block">
          <h1 className="kkd-title">{activity.title}</h1>

          {/* Rating + location */}
          <div className="kkd-meta-row">
            <span className="kkd-rating">
              ★ 5.0
              <span className="kkd-review-count">（{actReviews.length} 則評價）</span>
            </span>
            <span className="kkd-dot">·</span>
            <span className="kkd-location">📍 {activity.region}</span>
          </div>

          {/* Price */}
          <div className="kkd-price-row">
            <span className="kkd-orig-price">NT${originalPrice.toLocaleString()}</span>
            <strong className="kkd-price">NT${activity.price.toLocaleString()}</strong>
            <span className="kkd-price-unit">起 / 人</span>
          </div>

          {/* Policy + activity info row — all transparent bg, black SVG icons */}
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
              {activity.transportMode}
            </span>
            <span className="kkd-policy-item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              {activity.minParticipants}~{activity.maxParticipants} 人
            </span>
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
          <p className="kkd-short-desc">{activity.shortDescription}</p>
        </div>
      </div>

      {/* ── Anchor nav (sticky) ── */}
      <div className="kkd-anchor-wrap">
        <div className="tp-container">
          <SectionAnchorNav />
        </div>
      </div>

      {/* ── Scroll sections ── */}
      <div className="tp-container">
        <div className="kkd-scroll-layout">
          {/* Main content */}
          <div className="kkd-scroll-main">

            {/* SECTION 1: 方案 */}
            <section id="section-plan" className="kkd-scroll-section">
              <h2 className="kkd-section-title">🗓 選擇方案</h2>
              <DatePlanSection
                activity={activity}
                schedules={displayedSchedules}
              />
            </section>

            {/* SECTION 2: 評價 */}
            <section id="section-reviews" className="kkd-scroll-section">
              <h2 className="kkd-section-title">⭐ 旅客評價</h2>
              <div className="kkd-reviews-summary">
                <span className="kkd-reviews-score">★ 5.0</span>
                <span className="kkd-reviews-total">共 {actReviews.length} 則評價</span>
              </div>

              {activity.socialProofQuotes.length > 0 && (
                <div className="kkd-quote-chips">
                  {activity.socialProofQuotes.map((q, i) => (
                    <span key={i} className="kkd-quote-chip">💬 {q}</span>
                  ))}
                </div>
              )}

              <div className="kkd-review-list">
                {actReviews.map((r) => (
                  <div key={r.id} className="kkd-review-card">
                    <div className="kkd-review-header">
                      <strong className="kkd-reviewer">{r.author}（{r.city}）</strong>
                      <span className="kkd-review-date">{r.date}</span>
                    </div>
                    <div className="kkd-stars">{'★'.repeat(r.rating)}</div>
                    <p className="kkd-review-text">{r.text}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* SECTION 3: 商品說明 */}
            <section id="section-details" className="kkd-scroll-section">
              <h2 className="kkd-section-title">📋 商品說明</h2>

              <div className="kkd-detail-block">
                <h3 className="kkd-detail-subtitle">行程包含</h3>
                <ul className="kkd-checklist">
                  {activity.inclusions.map((item, i) => (
                    <li key={i}><span className="kkd-check">✅</span>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="kkd-detail-block">
                <h3 className="kkd-detail-subtitle">行程不含</h3>
                <ul className="kkd-checklist">
                  {activity.exclusions.map((item, i) => (
                    <li key={i}><span className="kkd-check">❌</span>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="kkd-detail-block">
                <h3 className="kkd-detail-subtitle">適合對象</h3>
                <ul className="kkd-checklist">
                  {activity.goodFor.map((item, i) => (
                    <li key={i}><span className="kkd-check">👍</span>{item}</li>
                  ))}
                </ul>
              </div>
            </section>

            {/* SECTION 4: 購買須知 */}
            <section id="section-policy" className="kkd-scroll-section">
              <h2 className="kkd-section-title">📌 購買須知</h2>

              <div className="kkd-detail-block">
                <h3 className="kkd-detail-subtitle">注意事項</h3>
                <ul className="kkd-notice-list">
                  {activity.notices.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>

              <div className="kkd-detail-block">
                <h3 className="kkd-detail-subtitle">取消與退款政策</h3>
                <ul className="kkd-notice-list">
                  {activity.refundRules.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>

              <div className="kkd-detail-block">
                <h3 className="kkd-detail-subtitle">安全說明</h3>
                <p className="kkd-notice-text">{activity.safetyNotice}</p>
              </div>
            </section>

            {/* Guide */}
            {guide && (
              <section className="kkd-scroll-section">
                <h2 className="kkd-section-title">🧑‍🦯 關於你的導遊</h2>
                <div className="kkd-guide-card">
                  <img
                    src={guide.avatarUrl}
                    alt={guide.displayName}
                    className="kkd-guide-avatar"
                  />
                  <div className="kkd-guide-info">
                    <strong className="kkd-guide-name">{guide.displayName}</strong>
                    <span className="kkd-guide-verified">✅ 實名已驗證</span>
                    <p className="kkd-guide-meta">
                      ⭐ {guide.rating}（{guide.serviceCount} 次服務）&nbsp;·&nbsp;
                      📍 {guide.region}&nbsp;·&nbsp;
                      🌍 {guide.languages.slice(0, 3).join('、')}
                    </p>
                    <p className="kkd-guide-headline">「{guide.headline}」</p>
                    <Link href={`/guides/${guide.slug}`} className="kkd-link-sm">
                      查看完整導遊簡介 →
                    </Link>
                  </div>
                </div>
              </section>
            )}

            {/* FAQ */}
            <section className="kkd-scroll-section">
              <h2 className="kkd-section-title">❓ 常見問題</h2>
              <div className="kkd-faq-list">
                {activity.faq.map((item, i) => (
                  <details key={i} className="kkd-faq-item">
                    <summary className="kkd-faq-q">{item.question}</summary>
                    <p className="kkd-faq-a">{item.answer}</p>
                  </details>
                ))}
              </div>
            </section>

          </div>

          {/* Sidebar (desktop only) */}
          <aside className="kkd-booking-side">
            <div className="kkd-booking-card">
              <div className="kkd-booking-price-block">
                <span className="kkd-booking-orig">NT${originalPrice.toLocaleString()}</span>
                <strong className="kkd-booking-price">
                  NT${activity.price.toLocaleString()} <span style={{ fontSize: 14, fontWeight: 400 }}>起 / 人</span>
                </strong>
              </div>

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

              <Link
                href={`/booking/${activity.slug}`}
                className="tp-btn tp-btn-primary"
                style={{ width: '100%', display: 'block', textAlign: 'center', padding: '14px 0', fontSize: 16, marginTop: 16 }}
              >
                立即預約
              </Link>
              <button
                className="tp-btn tp-btn-ghost"
                style={{ width: '100%', marginTop: 8 }}
              >
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

      {/* Mobile sticky bottom bar */}
      <ActivityBottomBar
        activitySlug={activity.slug}
        priceLabel={activity.priceLabel}
        price={activity.price}
      />
    </main>
  );
}
