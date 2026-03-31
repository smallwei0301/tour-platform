import Link from 'next/link';
import { activities, getReviewsByActivity } from '../../fixtures/data';
import { ActivityCard } from './ActivityCard';

export function FeaturedTours() {
  const featured = activities.slice(0, 4);

  return (
    <section className="tp-section">
      <div className="tp-container">
        <div className="tp-section-head">
          <h2>精選行程</h2>
          <Link href="/activities" className="tp-link">
            查看全部 →
          </Link>
        </div>
        <div className="tp-card-grid">
          {featured.map((a) => {
            const actReviews = getReviewsByActivity(a.slug);
            return (
              <ActivityCard
                key={a.slug}
                activity={a}
                rating={5.0}
                reviewCount={actReviews.length}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
