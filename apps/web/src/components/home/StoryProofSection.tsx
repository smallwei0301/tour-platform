import Link from 'next/link';
import { reviews, getActivityBySlug } from '../../fixtures/data';

const selectedReviews = Array.from(
  new Map(reviews.map((review) => [review.activitySlug, review])).values(),
).slice(0, 3);

const stories = selectedReviews.map((review) => {
  const activity = getActivityBySlug(review.activitySlug);
  return {
    title: `「${review.text}」`,
    body: `${review.author}（${review.city}）在 ${activity?.title ?? '該行程'} 的回饋。`,
  };
});

export function StoryProofSection() {
  return (
    <section className="tp-section" style={{ paddingTop: 0 }}>
      <div className="tp-container">
        <div className="tp-section-head" style={{ marginBottom: 18 }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>旅客真實回饋</h2>
            <p style={{ margin: 0, color: 'var(--tp-muted)', fontSize: 14 }}>
              以下內容直接引用目前 fixture reviews，並且各自對應不同的首頁精選行程，不額外改寫內容，只補上對應行程資訊。
            </p>
          </div>
          <Link href="/activities" className="tp-link">看更多行程 →</Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          {stories.map((story) => (
            <article
              key={story.title}
              style={{
                border: '1px solid var(--tp-border)',
                borderRadius: 14,
                padding: 16,
                background: '#fff',
              }}
            >
              <p style={{ margin: '0 0 10px', fontWeight: 700, lineHeight: 1.5 }}>{story.title}</p>
              <p style={{ margin: 0, color: 'var(--tp-muted)', fontSize: 14, lineHeight: 1.65 }}>{story.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
