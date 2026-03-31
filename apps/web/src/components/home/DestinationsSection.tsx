import Link from 'next/link';

const DESTINATIONS = [
  {
    name: '台北',
    slug: '台北',
    image:
      'https://images.unsplash.com/photo-1470004914212-05527e49370b?w=400&q=80',
    count: '120+ 行程',
  },
  {
    name: '花蓮',
    slug: '花蓮',
    image:
      'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=400&q=80',
    count: '85+ 行程',
  },
  {
    name: '高雄',
    slug: '高雄',
    image:
      'https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?w=400&q=80',
    count: '72+ 行程',
  },
  {
    name: '台南',
    slug: '台南',
    image:
      'https://images.unsplash.com/photo-1528164344705-47542687000d?w=400&q=80',
    count: '96+ 行程',
  },
  {
    name: '墾丁',
    slug: '屏東',
    image:
      'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&q=80',
    count: '44+ 行程',
  },
  {
    name: '台中',
    slug: '台中',
    image:
      'https://images.unsplash.com/photo-1523731407965-2430cd12f5e4?w=400&q=80',
    count: '58+ 行程',
  },
  {
    name: '宜蘭',
    slug: '宜蘭',
    image:
      'https://images.unsplash.com/photo-1504652517000-ae1068478c59?w=400&q=80',
    count: '37+ 行程',
  },
  {
    name: '澎湖',
    slug: '澎湖',
    image:
      'https://images.unsplash.com/photo-1559128010-7c1ad6e1b6a5?w=400&q=80',
    count: '29+ 行程',
  },
];

export function DestinationsSection() {
  return (
    <section className="tp-section" style={{ background: 'var(--tp-bg-soft)', padding: '48px 0' }}>
      <div className="tp-container">
        <div className="tp-section-head">
          <h2>熱門目的地</h2>
          <Link href="/activities" className="tp-link">
            查看全部地區 →
          </Link>
        </div>
        <div className="tp-destinations-scroll">
          {DESTINATIONS.map((d) => (
            <Link
              key={d.slug}
              href={`/activities?region=${encodeURIComponent(d.slug)}`}
              className="tp-destination-card"
            >
              <div className="tp-destination-img-wrap">
                <img src={d.image} alt={d.name} className="tp-destination-img" loading="lazy" />
                <div className="tp-destination-overlay" />
              </div>
              <div className="tp-destination-label">
                <span className="tp-destination-name">{d.name}</span>
                <span className="tp-destination-count">{d.count}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
