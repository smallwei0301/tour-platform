import Image from 'next/image';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '旅遊指南 | Midao 祕島',
  description: '台灣各地旅遊攻略、導遊推薦、活動體驗分享。從柴山探洞到花蓮溯溪，讓我們帶你深度認識台灣。',
  openGraph: {
    title: '旅遊指南 | Midao 祕島',
    description: '台灣各地旅遊攻略與在地體驗分享。',
    images: [{ url: 'https://images.unsplash.com/photo-1528164344705-47542687000d?w=1200&q=80', width: 1200, height: 630, alt: '台灣旅遊指南 | Midao 祕島' }],
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
];

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';

const blogJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: '旅遊指南 | Midao 祕島',
  url: `${baseUrl}/blog`,
  itemListElement: posts.map((p, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': 'Article',
      headline: p.title,
      url: `${baseUrl}/blog/${p.slug}`,
      datePublished: p.date,
      image: p.imageUrl,
    },
  })),
};

export default function BlogPage() {
  const featured = posts.find((p) => p.featured);
  const rest = posts.filter((p) => !p.featured);

  return (
    <main className="tp-container" style={{ paddingBottom: 40 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogJsonLd) }} />
      <div className="tp-breadcrumb" style={{ marginTop: 18 }}><Link href="/">首頁</Link> &gt; 旅遊指南</div>
      <h1>旅遊指南</h1>

      {/* Featured */}
      {featured && (
        <Link href={`/blog/${featured.slug}`} style={{ display: 'block', marginBottom: 30 }}>
          <article style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, border: '1px solid var(--tp-border)', borderRadius: 14, overflow: 'hidden' }}>
            <Image src={featured.imageUrl} alt={featured.title} style={{ width: '100%', height: '100%', minHeight: 240, objectFit: 'cover' }} width={1200} height={675} />
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
              <Image src={p.imageUrl} alt={p.title} className="tp-card-img" style={{ background: 'none' }} loading="lazy" width={1200} height={675} />
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
