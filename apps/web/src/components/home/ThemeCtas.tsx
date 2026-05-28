import Link from 'next/link';

const THEMES = [
  {
    label: '🔦 柴山探洞',
    desc: '鑽進高雄的秘密地下世界，探索億萬年石灰岩洞穴',
    href: '/theme/cave-exploration',
    image:
      'https://images.unsplash.com/photo-1504699439244-a9a8618cafc6?w=800&q=80',
    color: 'rgba(74,92,58,0.75)',
  },
  {
    label: '🌊 野外溯溪',
    desc: '走進台灣最純淨的野溪，用雙腳感受花蓮的力量',
    href: '/theme/river-trekking',
    image:
      'https://images.unsplash.com/photo-1504858700536-882c978a3464?w=800&q=80',
    color: 'rgba(26,74,107,0.75)',
  },
  {
    label: '🏙️ 老街漫遊',
    desc: '跟著在地人，穿梭大稻埕、鹽埕、神農街的巷弄記憶',
    href: '/activities?category=old-street',
    image:
      'https://images.unsplash.com/photo-1528164344705-47542687000d?w=800&q=80',
    color: 'rgba(120,80,30,0.75)',
  },
  {
    label: '🌺 原住民文化',
    desc: '深入部落，體驗獵人精神、樂舞與傳統手工藝',
    href: '/activities?category=indigenous',
    image:
      'https://images.unsplash.com/photo-1559128010-7c1ad6e1b6a5?w=800&q=80',
    color: 'rgba(100,50,80,0.75)',
  },
  {
    label: '🍜 美食導覽',
    desc: '跟著懂吃的導遊，找到真正的在地味道',
    href: '/activities?category=food',
    image:
      'https://images.unsplash.com/photo-1567306226416-28f0efdc88ce?w=800&q=80',
    color: 'rgba(160,60,30,0.75)',
  },
  {
    label: '🏔️ 登山健行',
    desc: '百岳秘徑、森林浴、稜線上的台灣壯景',
    href: '/activities?category=hiking',
    image:
      'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800&q=80',
    color: 'rgba(40,80,60,0.75)',
  },
];

export function ThemeCtas() {
  return (
    <section className="tp-section" style={{ paddingTop: 0 }}>
      <div className="tp-container">
        <div className="tp-section-head">
          <h2>🏷️ 特色主題</h2>
          <Link href="/activities" className="tp-link">
            全部主題 →
          </Link>
        </div>
        <div className="tp-theme-grid">
          {THEMES.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="tp-theme-card"
              style={{
                backgroundImage: `linear-gradient(${t.color}, ${t.color.replace('0.75', '0.88')}), url(${t.image})`,
              }}
            >
              <div className="tp-theme-card-body">
                <h3>{t.label}</h3>
                <p>{t.desc}</p>
                <span className="tp-theme-card-link">探索 →</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
