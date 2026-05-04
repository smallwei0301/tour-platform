import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '旅遊指南 | Tour Platform',
  description: '台灣各地旅遊攻略、導遊推薦與在地體驗筆記。',
};

const posts = [
  {
    slug: 'why-private-guide',
    title: '為什麼在台灣旅行要找私人導遊，而不是跟團？',
    excerpt: '從節奏、故事到路線彈性，私人導遊真正改變的是你和地方的關係。',
    category: '台灣旅遊',
    date: '2026-03-20',
    readTime: '5 分鐘',
  },
  {
    slug: 'chaishan-cave-guide',
    title: '高雄柴山探洞完全攻略：第一次就上手',
    excerpt: '第一次探洞該準備什麼、怕不怕、適不適合親子，這篇一次講清楚。',
    category: '戶外冒險',
    date: '2026-03-15',
    readTime: '7 分鐘',
  },
  {
    slug: 'dadaocheng-food-map',
    title: '大稻埕在地美食地圖：只有導遊知道的隱藏版',
    excerpt: '把旅遊書上不會出現的口袋名單，整理成可讀的散步路線。',
    category: '美食體驗',
    date: '2026-03-10',
    readTime: '4 分鐘',
  },
  {
    slug: 'hualien-river-trekking-tips',
    title: '花蓮溯溪新手指南：你需要知道的 10 件事',
    excerpt: '如果你想第一次就玩得安心，先把這篇讀完。',
    category: '戶外冒險',
    date: '2026-03-05',
    readTime: '6 分鐘',
  },
];

export default function BlogPage() {
  const [featured, ...rest] = posts;

  return (
    <main className="tp-container tp-editorial-page">
      <section className="tp-editorial-hero">
        <p className="tp-editorial-kicker">journal</p>
        <h1>旅遊指南與 field notes。</h1>
        <p className="tp-editorial-lead">把導遊經驗、旅遊觀察與實際路線整理成可閱讀、可收藏、可轉化成預約的內容頁。</p>
      </section>

      <section className="tp-editorial-section">
        <Link href={`/blog/${featured.slug}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
          <article className="tp-editorial-card-soft">
            <p className="tp-editorial-kicker" style={{ color: 'var(--tp-primary)' }}>{featured.category}</p>
            <h2>{featured.title}</h2>
            <p>{featured.excerpt}</p>
            <div className="tp-editorial-meta-row">
              <span className="tp-member-chip">{featured.date}</span>
              <span className="tp-member-chip">{featured.readTime}</span>
            </div>
          </article>
        </Link>
      </section>

      <section className="tp-editorial-section tp-editorial-card-grid">
        {rest.map((post) => (
          <Link key={post.slug} href={`/blog/${post.slug}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
            <article className="tp-editorial-card">
              <p className="tp-editorial-kicker" style={{ color: 'var(--tp-primary)' }}>{post.category}</p>
              <h3>{post.title}</h3>
              <p>{post.excerpt}</p>
              <div className="tp-editorial-meta-row">
                <span className="tp-member-chip">{post.date}</span>
                <span className="tp-member-chip">{post.readTime}</span>
              </div>
            </article>
          </Link>
        ))}
      </section>
    </main>
  );
}
