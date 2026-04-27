'use client';

export function HotTopicsSection() {
  const topics = [
    { icon: '🏔️', label: '柴山探洞', slug: 'cave-exploration' },
    { icon: '🏮', label: '老街漫遊', slug: 'old-street' },
    { icon: '🍜', label: '美食饗宴', slug: 'food-tour' },
    { icon: '🌊', label: '野外湖漫', slug: 'outdoor-lake' },
  ];

  return (
    <section style={{ backgroundColor: '#fff', padding: '32px 0' }}>
      <div className="tp-container">
        {/* Section Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <span style={{ fontSize: '24px' }}>🔥</span>
          <h2
            style={{
              fontSize: '18px',
              fontWeight: '700',
              color: '#1A2E1F',
              margin: '0',
              fontFamily: "'Noto Serif TC', serif",
            }}
          >
            熱門主題
          </h2>
        </div>

        {/* Topics Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px',
          }}
        >
          {topics.map((topic) => (
            <a
              key={topic.slug}
              href={`/activities?theme=${topic.slug}`}
              style={{
                backgroundColor: '#F4ECD8',
                color: '#1A2E1F',
                padding: '12px 16px',
                borderRadius: '20px',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                fontWeight: '600',
                fontFamily: "'Noto Sans TC', sans-serif",
                transition: 'background 0.2s',
                border: '1px solid #E6DCC8',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#EBE1C7';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#F4ECD8';
              }}
            >
              <span>{topic.icon}</span>
              <span>{topic.label}</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
