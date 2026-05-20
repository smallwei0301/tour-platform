import Link from 'next/link';
import { reviews, guides, getActivityBySlug } from '../../fixtures/data';
import { buildActivityHref } from '../../lib/activity-url';

const selectedReviews = Array.from(
  new Map(reviews.map((review) => [review.activitySlug, review])).values(),
).slice(0, 3);

const stories = selectedReviews
  .map((review) => {
    const activity = getActivityBySlug(review.activitySlug);
    const guide = guides.find((item) => item.slug === review.guideSlug);
    if (!activity) return null;

    return {
      id: review.id,
      quote: review.text,
      author: review.author,
      city: review.city,
      rating: review.rating,
      activityTitle: activity.title,
      guideName: guide?.displayName ?? '在地導遊',
      href: buildActivityHref({
        slug: activity.slug,
        region: activity.region,
        regionSlug: activity.regionSlug,
      }),
    };
  })
  .filter((story): story is NonNullable<typeof story> => story !== null);

function renderRatingStars(rating: number) {
  return '★'.repeat(Math.max(1, Math.min(5, Math.round(rating))));
}

export function StoryProofSection() {
  return (
    <section className="tp-section" style={{ paddingTop: 0 }}>
      <div className="tp-container">
        <div className="tp-section-head" style={{ marginBottom: 18 }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>旅客真實回饋</h2>
            <p style={{ margin: 0, color: 'var(--tp-muted)', fontSize: 14 }}>
              每一則都來自真實旅客評價，幫你快速感受行程風格與導遊帶團節奏。
            </p>
          </div>
          <Link href="/activities" className="tp-link">看更多行程 →</Link>
        </div>

        <div className="tp-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {stories.map((story) => (
            <article
              key={story.id}
              className="tp-card"
              style={{
                display: 'grid',
                gap: 12,
                borderRadius: 14,
                border: '1px solid var(--tp-border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: 'rgba(27,107,74,0.1)',
                    color: 'var(--tp-primary)',
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 0.2,
                  }}
                >
                  {renderRatingStars(story.rating)} {story.rating.toFixed(1)}
                </span>
                <span style={{ color: '#d1d5db', fontSize: 24, lineHeight: 1 }}>“</span>
              </div>

              <p style={{ margin: 0, fontSize: 23, lineHeight: 1.6, color: '#1f2937', fontWeight: 700 }}>
                「{story.quote}」
              </p>

              <div style={{ marginTop: 2 }}>
                <p style={{ margin: '0 0 4px', fontSize: 14, color: '#374151', fontWeight: 600 }}>
                  {story.author}（{story.city}）
                </p>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--tp-muted)', lineHeight: 1.6 }}>
                  參加 {story.activityTitle}，由 {story.guideName} 帶領。
                </p>
              </div>

              <div style={{ marginTop: 2 }}>
                <Link
                  href={story.href}
                  className="tp-link"
                  style={{ fontSize: 14, fontWeight: 700 }}
                >
                  看這條行程 →
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
