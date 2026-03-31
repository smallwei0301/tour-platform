import Link from 'next/link';
import { activities, guides, getReviewsByActivity } from '../../../../src/fixtures/data';
import { notFound } from 'next/navigation';
import { listExperiencesDb } from '../../../../src/lib/db.mjs';
import { ActivityTabs } from '../../../../src/components/activity/ActivityTabs';
import { ActivityBottomBar } from '../../../../src/components/activity/ActivityBottomBar';

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
  const runtimeSchedules = Array.isArray(expMatch?.schedules)
    ? expMatch.schedules
    : [];
  const displayedSchedules =
    runtimeSchedules.length > 0 ? runtimeSchedules : activity.schedules;

  const originalPrice = Math.round(activity.price * 1.25);

  return (
    <main className="tp-container tp-detail" style={{ paddingBottom: 100 }}>
      {/* Breadcrumb */}
      <div className="tp-breadcrumb">
        首頁 &gt; <Link href="/activities">全部行程</Link> &gt; {activity.region}{' '}
        &gt; {activity.title}
      </div>

      {/* Detail layout */}
      <section
        className="tp-activity-detail-layout"
        style={{ display: 'grid', gap: 24, marginTop: 12 }}
      >
        {/* Main */}
        <article>
          {/* Gallery */}
          <div
            className="tp-activity-gallery-layout"
            style={{ display: 'grid', gap: 8 }}
          >
            <img
              src={activity.galleryUrls[0] || activity.imageUrl}
              alt={activity.title}
              style={{
                width: '100%',
                aspectRatio: '4/3',
                objectFit: 'cover',
                borderRadius: 12,
              }}
            />
            <div style={{ display: 'grid', gap: 8 }}>
              {activity.galleryUrls.slice(1, 4).map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`${activity.title} ${i + 2}`}
                  style={{
                    width: '100%',
                    aspectRatio: '4/3',
                    objectFit: 'cover',
                    borderRadius: 10,
                  }}
                  loading="lazy"
                />
              ))}
            </div>
          </div>

          {/* Title + meta */}
          <div style={{ marginTop: 18 }}>
            <h1 style={{ margin: '0 0 8px' }}>{activity.title}</h1>

            {/* Rating + policy row */}
            <div className="tp-detail-meta-row">
              <span className="tp-detail-rating">
                ★ 5.0
                <span style={{ color: 'var(--tp-muted)', fontWeight: 400, marginLeft: 4 }}>
                  （{actReviews.length} 則評價）
                </span>
              </span>
              <span style={{ color: 'var(--tp-muted)' }}>·</span>
              <span style={{ color: 'var(--tp-muted)', fontSize: 14 }}>
                📍 {activity.region}
              </span>
            </div>

            {/* Price row */}
            <div className="tp-detail-price-row">
              <span className="tp-detail-original-price">
                NT${originalPrice.toLocaleString()}
              </span>
              <span className="tp-detail-price">
                NT${activity.price.toLocaleString()} 起
              </span>
            </div>

            {/* Policy icons */}
            <div className="tp-detail-policy-row">
              <span className="tp-detail-policy-item">📋 最晚出發前3天確認</span>
              <span className="tp-detail-policy-item">📱 電子憑證</span>
              <span className="tp-detail-policy-item">🔒 安全付款</span>
            </div>
          </div>

          {/* Badges */}
          <div
            className="tp-badges"
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}
          >
            <span
              style={{
                background: '#e6f4ed',
                color: 'var(--tp-primary)',
                padding: '5px 12px',
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              ✅ 認證導遊
            </span>
            <span
              style={{
                background: '#e6f4ed',
                color: 'var(--tp-primary)',
                padding: '5px 12px',
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              🕐 {activity.durationDisplay}
            </span>
            <span
              style={{
                background: '#e6f4ed',
                color: 'var(--tp-primary)',
                padding: '5px 12px',
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              {activity.transportMode === '步行' ? '🚶' : '🚐'}{' '}
              {activity.transportMode}
            </span>
            <span
              style={{
                background: '#e6f4ed',
                color: 'var(--tp-primary)',
                padding: '5px 12px',
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              👥 {activity.minParticipants}~{activity.maxParticipants} 人
            </span>
          </div>

          {/* Short description */}
          <p style={{ lineHeight: 1.8, color: 'var(--tp-muted)', marginBottom: 24 }}>
            {activity.shortDescription}
          </p>

          {/* KKday-style Tabs: 方案/評價/商品說明/購買須知 */}
          <ActivityTabs
            activity={activity}
            reviews={actReviews}
            schedules={displayedSchedules}
          />

          {/* Guide */}
          {guide && (
            <section className="tp-detail-block" style={{ marginBottom: 24, marginTop: 24 }}>
              <h2>關於你的導遊</h2>
              <div
                className="tp-activity-guide-block"
                style={{ display: 'flex', gap: 14, alignItems: 'center' }}
              >
                <img
                  src={guide.avatarUrl}
                  alt={guide.displayName}
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    objectFit: 'cover',
                  }}
                />
                <div>
                  <strong>{guide.displayName}</strong> · ✅ 實名已驗證
                  <p style={{ margin: '4px 0', color: 'var(--tp-muted)', fontSize: 14 }}>
                    ⭐ {guide.rating}（{guide.serviceCount} 次服務） · 📍{' '}
                    {guide.region} · 🌍 {guide.languages.slice(0, 3).join('、')}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontStyle: 'italic',
                      color: 'var(--tp-muted)',
                      fontSize: 14,
                    }}
                  >
                    「{guide.headline}」
                  </p>
                  <Link
                    className="tp-link"
                    href={`/guides/${guide.slug}`}
                    style={{ fontSize: 14 }}
                  >
                    查看完整導遊簡介 →
                  </Link>
                </div>
              </div>
            </section>
          )}

          {/* FAQ */}
          <section className="tp-detail-block" style={{ marginBottom: 24 }}>
            <h2>常見問題</h2>
            <div style={{ display: 'grid', gap: 8 }}>
              {activity.faq.map((item, i) => (
                <details
                  key={i}
                  style={{
                    background: '#fff',
                    border: '1px solid var(--tp-border)',
                    borderRadius: 10,
                    padding: '10px 14px',
                  }}
                >
                  <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
                    {item.question}
                  </summary>
                  <p
                    style={{
                      marginTop: 8,
                      color: 'var(--tp-muted)',
                      lineHeight: 1.6,
                    }}
                  >
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          </section>
        </article>

        {/* Booking sidebar (desktop only) */}
        <aside
          className="tp-activity-booking-side"
          style={{ position: 'sticky', top: 80, height: 'fit-content' }}
        >
          <div
            style={{
              border: '1px solid var(--tp-border)',
              borderRadius: 12,
              padding: 20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span style={{ color: 'var(--tp-muted)', textDecoration: 'line-through', fontSize: 14 }}>
                NT${originalPrice.toLocaleString()}
              </span>
              <p style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
                起價 {activity.priceLabel}
              </p>
            </div>

            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                近期可預約場次：
              </p>
              {displayedSchedules.map((s: any, i: number) => {
                const startAt = s.startAt || s.start_at;
                const capacity = Number(s.capacity || 0);
                const bookedCount = Number(
                  s.bookedCount ?? s.booked_count ?? 0
                );
                const status =
                  s.status || (bookedCount >= capacity ? 'full' : 'open');
                const d = new Date(startAt);
                const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
                const remaining = capacity - bookedCount;
                return (
                  <div
                    key={s.id || i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 13,
                      padding: '4px 0',
                      borderBottom: '1px solid #f0f0f0',
                    }}
                  >
                    <span>
                      {dateStr}（
                      {['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}）
                    </span>
                    {status === 'full' ? (
                      <span style={{ color: '#e53e3e', fontWeight: 700 }}>
                        已額滿
                      </span>
                    ) : (
                      <span style={{ color: 'var(--tp-primary)' }}>
                        剩 {remaining} 位
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <Link
              href={`/booking/${activity.slug}`}
              className="tp-btn tp-btn-primary"
              style={{
                width: '100%',
                display: 'block',
                textAlign: 'center',
                marginTop: 16,
                fontSize: 16,
                padding: '14px 0',
              }}
            >
              選擇方案
            </Link>
            <button
              className="tp-btn tp-btn-ghost"
              style={{ width: '100%', marginTop: 8 }}
            >
              ✉️ 詢問導遊
            </button>

            <div
              style={{
                marginTop: 16,
                fontSize: 13,
                color: 'var(--tp-muted)',
                lineHeight: 1.8,
              }}
            >
              <p>🔒 安全付款（ECPay / LINE Pay）</p>
              <p>✅ 免費取消（依各行程政策）</p>
              <p>📞 緊急熱線 30 分鐘回應</p>
              <p>✅ 實名認證導遊</p>
            </div>
          </div>
        </aside>
      </section>

      {/* Mobile sticky bottom bar */}
      <ActivityBottomBar
        activitySlug={activity.slug}
        priceLabel={activity.priceLabel}
        price={activity.price}
      />
    </main>
  );
}
