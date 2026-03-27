import Link from 'next/link';

const posts = [
  { slug: 'why-private-guide-taiwan', tag: '台灣旅遊', title: '為什麼台灣要找私人導遊，不是加入跟團？', excerpt: '從效率到深度，兩種旅行方式的差異不只是人數，而是體驗密度。', date: '2026-03-20' },
  { slug: 'chaishan-cave-guide', tag: '戶外冒險', title: '高雄柴山探洞全攻略：需要帶什麼、怎麼走才安全', excerpt: '在地嚮導整理探洞裝備、安全提醒與路線難度。', date: '2026-03-22' },
  { slug: 'river-level-guide', tag: '戶外冒險', title: '花蓮溯溪入門：Level 1 和 Level 3 差在哪？', excerpt: '從體能、地形、裝備門檻，快速搞懂溯溪難度分級。', date: '2026-03-24' }
];

export default function BlogPage() {
  return (
    <main className="tp-container tp-static-page">
      <h1>旅遊指南</h1>
      <article className="tp-blog-featured">
        <div className="tp-card-img" />
        <p className="tp-guide-badge">精選文章</p>
        <h2>為什麼台灣要找私人導遊，不是加入跟團？</h2>
        <p>私人導遊的價值不是「多一個帶路的人」，而是把行程轉為真正以你為中心的體驗。</p>
        <Link className="tp-link" href="/blog/why-private-guide-taiwan">閱讀全文 →</Link>
      </article>
      <div className="tp-card-grid tp-card-grid-activities">
        {posts.map((p) => (
          <article key={p.slug} className="tp-card">
            <div className="tp-card-img" />
            <p className="tp-guide-badge">{p.tag}</p>
            <h3>{p.title}</h3>
            <p>{p.excerpt}</p>
            <p>{p.date}</p>
            <Link className="tp-link" href={`/blog/${p.slug}`}>閱讀文章 →</Link>
          </article>
        ))}
      </div>
    </main>
  );
}
