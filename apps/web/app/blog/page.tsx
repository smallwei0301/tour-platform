import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '旅遊指南 | Tour Platform',
  description: '台灣各地旅遊攻略、導遊推薦、活動體驗分享。從柴山探洞到花蓮溯溪，讓我們帶你深度認識台灣。',
  openGraph: {
    title: '旅遊指南 | Tour Platform',
    description: '台灣各地旅遊攻略與在地體驗分享。',
  },
};

const posts = [
  {
    slug: 'why-private-guide',
    title: '為什麼在台灣旅行要找私人導遊，而不是跟團？',
    excerpt: '從效率到深度體驗，兩種旅行方式的根本差距。當你不再被行程表綁架，才能真正認識一個地方。',
    category: '台灣旅遊',
    date: '2026-03-20',
    readTime: '5 分鐘',
    imageUrl: 'https://images.unsplash.com/photo-1528164344705-47542687000d?w=800&q=80',
    featured: true,
  },
  {
    slug: 'chaishan-cave-guide',
    title: '高雄柴山探洞完全攻略：第一次就上手',
    excerpt: '裝備怎麼準備？路線怎麼選？帶小孩可以嗎？一篇搞懂柴山探洞的所有眉角。',
    category: '戶外冒險',
    date: '2026-03-15',
    readTime: '7 分鐘',
    imageUrl: 'https://images.unsplash.com/photo-1504699439244-a9a8618cafc6?w=800&q=80',
    featured: false,
  },
  {
    slug: 'dadaocheng-food-map',
    title: '大稻埕在地美食地圖：只有導遊知道的隱藏版',
    excerpt: '迪化街不只有南北貨，還有你在旅遊書上找不到的碗粿和百年老店。',
    category: '美食體驗',
    date: '2026-03-10',
    readTime: '4 分鐘',
    imageUrl: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80',
    featured: false,
  },
  {
    slug: 'hualien-river-trekking-tips',
    title: '花蓮溯溪新手指南：你需要知道的 10 件事',
    excerpt: '不會游泳可以去嗎？幾月最適合？裝備要自己帶嗎？溯溪前必讀。',
    category: '戶外冒險',
    date: '2026-03-05',
    readTime: '6 分鐘',
    imageUrl: 'https://images.unsplash.com/photo-1504858700536-882c978a3464?w=800&q=80',
    featured: false,
  },
];

export default function BlogPage() {
  const featured = posts.find((p) => p.featured);
  const rest = posts.filter((p) => !p.featured);

  return (
    <main className="tp-container" style={{ paddingBottom: 40 }}>
      <div className="tp-breadcrumb" style={{ marginTop: 18 }}>首頁 &gt; 旅遊指南</div>
      <h1>旅遊指南</h1>

      {/* Featured */}
      {featured && (
        <Link href={`/blog/${featured.slug}`} style={{ display: 'block', marginBottom: 30 }}>
          <article style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, border: '1px solid var(--tp-border)', borderRadius: 14, overflow: 'hidden' }}>
            <img src={featured.imageUrl} alt={featured.title} style={{ width: '100%', height: '100%', minHeight: 240, objectFit: 'cover' }} />
            <div style={{ padding: '24px 20px 24px 0' }}>
              <span style={{ background: 'var(--tp-accent)', color: '#fff', padding: '3px 10px', borderRadius: 6, fontSize: 12 }}>{featured.category}</span>
              <h2 style={{ margin: '12px 0 8px' }}>{featured.title}</h2>
              <p style={{ color: 'var(--tp-muted)', lineHeight: 1.7 }}>{featured.excerpt}</p>
              <p style={{ color: 'var(--tp-muted)', fontSize: 13 }}>{featured.date} · 閱讀約 {featured.readTime}</p>
            </div>
          </article>
        </Link>
      )}

      {/* Grid */}
      <div className="tp-card-grid">
        {rest.map((p) => (
          <Link href={`/blog/${p.slug}`} key={p.slug} style={{ display: 'block' }}>
            <article className="tp-card">
              <img src={p.imageUrl} alt={p.title} className="tp-card-img" style={{ background: 'none' }} loading="lazy" />
              <span style={{ background: 'var(--tp-accent)', color: '#fff', padding: '2px 8px', borderRadius: 6, fontSize: 11, display: 'inline-block', marginBottom: 6 }}>{p.category}</span>
              <h3>{p.title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.6 }}>{p.excerpt}</p>
              <p style={{ fontSize: 13, color: 'var(--tp-muted)' }}>{p.date} · {p.readTime}</p>
            </article>
          </Link>
        ))}
      </div>
    </main>
  );
}
