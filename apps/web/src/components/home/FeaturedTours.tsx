import Link from 'next/link';
import { activities, guides } from '../../fixtures/data';
import { buildActivityHref } from '../../lib/activity-url';

export function FeaturedTours() {
  const featured = activities.slice(0, 1);
  const [primary] = featured;

  return (
    <section style={{ backgroundColor: '#fff', padding: '40px 0' }}>
      <div className="tp-container">
        {/* Section Header */}
        <div style={{ marginBottom: '32px' }}>
          <h2
            style={{
              fontSize: '20px',
              fontWeight: '700',
              color: '#1A2E1F',
              margin: '0 0 8px 0',
              fontFamily: "'Noto Serif TC', serif",
            }}
          >
            本月祕境檔案
          </h2>
          <p
            style={{
              fontSize: '14px',
              color: '#5E7A4F',
              margin: '0',
              fontFamily: "'Noto Sans TC', sans-serif",
            }}
          >
            每月精選最值得深入的路線
          </p>
        </div>

        {primary && (
          <article
            style={{
              border: '2px solid #5E7A4F',
              borderRadius: '14px',
              overflow: 'hidden',
              backgroundColor: '#fff',
              marginBottom: '24px',
            }}
          >
            {/* Card Image */}
            <div style={{ position: 'relative', height: '280px', overflow: 'hidden' }}>
              <img
                src={primary.imageUrl}
                alt={primary.title}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />

              {/* Badge: 精選行程 */}
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  backgroundColor: '#1A2E1F',
                  color: '#fff',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '700',
                  fontFamily: "'Noto Sans TC', sans-serif",
                }}
              >
                ⭐ 精選行程
              </div>
            </div>

            {/* Card Content */}
            <div style={{ padding: '18px' }}>
              <h3
                style={{
                  fontSize: '20px',
                  fontWeight: '700',
                  color: '#1A2E1F',
                  margin: '0 0 12px 0',
                  fontFamily: "'Noto Serif TC', serif",
                }}
              >
                {primary.title}
              </h3>

              {/* Meta Info: Location, Rating, Price */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  gap: '16px',
                  alignItems: 'center',
                  fontSize: '14px',
                  color: '#5E7A4F',
                  marginBottom: '14px',
                  paddingBottom: '14px',
                  borderBottom: '1px solid #E6DCC8',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>📍</span>
                  <span>{primary.region}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>⭐ 5.0</span>
                </div>
                <div style={{ fontWeight: '700', color: '#D97836' }}>
                  NT${primary.basePrice} / 人
                </div>
              </div>

              {/* Guide Info */}
              {guides.find((g) => g.slug === primary.guideSlug) && (
                <p
                  style={{
                    fontSize: '13px',
                    color: '#5E7A4F',
                    margin: '0 0 12px 0',
                    fontFamily: "'Noto Sans TC', sans-serif",
                  }}
                >
                  導遊：{guides.find((g) => g.slug === primary.guideSlug)?.displayName}
                </p>
              )}

              {/* CTA Button */}
              <Link
                href={buildActivityHref({
                  slug: primary.slug,
                  region: primary.region,
                  regionSlug: primary.regionSlug,
                })}
                style={{
                  display: 'inline-block',
                  backgroundColor: '#D97836',
                  color: '#fff',
                  padding: '12px 24px',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontSize: '14px',
                  fontWeight: '700',
                  fontFamily: "'Noto Sans TC', sans-serif",
                  transition: 'background 0.2s',
                }}
              >
                查看行程詳情
              </Link>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}
