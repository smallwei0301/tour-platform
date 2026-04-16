import Link from 'next/link';
import type { Activity } from '../../fixtures/data';
import { buildActivityHref } from '../../lib/activity-url';

interface ActivityCardProps {
  activity: Activity;
  rating?: number;
  reviewCount?: number;
}

export function ActivityCard({
  activity,
  rating = 5.0,
  reviewCount = 0,
}: ActivityCardProps) {
  const originalPrice = Math.round(activity.price * 1.25);

  return (
    <article className="tp-card tp-activity-card">
      <div style={{ position: 'relative' }}>
        <img
          src={activity.imageUrl}
          alt={activity.title}
          className="tp-card-img"
          loading="lazy"
        />
        <button className="tp-fav-btn" aria-label="收藏">
          ♡
        </button>
        <span className="tp-card-region-badge">{activity.region}</span>
      </div>
      <div style={{ padding: '4px 2px' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16, lineHeight: 1.4 }}>
          {activity.title}
        </h3>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 6,
          }}
        >
          <span style={{ color: '#f5a623', fontSize: 13 }}>
            ★ {rating.toFixed(1)}
          </span>
          {reviewCount > 0 && (
            <span style={{ color: 'var(--tp-muted)', fontSize: 12 }}>
              （{reviewCount} 則評價）
            </span>
          )}
        </div>
        <p style={{ margin: '0 0 8px', color: 'var(--tp-muted)', fontSize: 13 }}>
          🕐 {activity.durationDisplay} · 👥 {activity.minParticipants}~
          {activity.maxParticipants} 人
        </p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span
            style={{
              color: 'var(--tp-muted)',
              textDecoration: 'line-through',
              fontSize: 13,
            }}
          >
            NT${originalPrice.toLocaleString()}
          </span>
          <strong style={{ color: 'var(--tp-primary)', fontSize: 16 }}>
            起 {activity.priceLabel}
          </strong>
        </div>
        {/* Overlay link covers the whole card */}
        <Link
          href={buildActivityHref({ slug: activity.slug, region: activity.region, regionSlug: activity.regionSlug })}
          prefetch
          className="tp-card-link-overlay"
          aria-label={activity.title}
        />
      </div>
    </article>
  );
}
