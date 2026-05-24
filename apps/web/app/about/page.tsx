import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '關於我們 | Midao 祕島',
  description: '祕島不是發明的地方。是已經在那裡，只是還沒被你看見的台灣。認識 Midao 祕島的故事與理念。',
  openGraph: {
    title: '關於我們 | Midao 祕島',
    description: '真正在山林裡走過的在地人，帶你走進台灣最有故事的地方。',
    images: [{ url: 'https://images.unsplash.com/photo-1528164344705-47542687000d?w=1200&q=80', width: 1200, height: 630, alt: '關於 Midao 祕島' }],
  },
};

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';

const aboutJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: 'Midao 祕島',
      url: baseUrl,
      description: '台灣在地導遊預約平台 — 連結旅客與在地導遊，提供深度文化體驗。',
      sameAs: [`${baseUrl}/about`],
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首頁', item: baseUrl },
        { '@type': 'ListItem', position: 2, name: '關於我們', item: `${baseUrl}/about` },
      ],
    },
  ],
};

export default function AboutPage() {
  return (
    <main className="tp-container" style={{ paddingBottom: 40 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutJsonLd) }} />
      <link rel="preload" as="image" href="https://images.unsplash.com/photo-1528164344705-47542687000d?w=1400&q=80" fetchPriority="high" />
      <div className="tp-breadcrumb" style={{ marginTop: 18 }}>
        <Link href="/">首頁</Link> &gt; 關於我們
      </div>
      {/* Hero */}
      <section style={{
        backgroundImage: 'linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.5)), url(https://images.unsplash.com/photo-1528164344705-47542687000d?w=1400&q=80)',
        backgroundSize: 'cover', backgroundPosition: 'center',
        borderRadius: 14, padding: '60px 40px', marginTop: 18, color: '#fff',
      }}>
        <h1 style={{ fontSize: 36, marginBottom: 12 }}>關於我們</h1>
        <p style={{ fontSize: 18, maxWidth: 600, lineHeight: 1.7, opacity: 0.95 }}>
          我們相信，最好的旅行不是跟團趕景點，而是找到一個懂路的人，帶你走進真正有故事的地方。
        </p>
      </section>

      {/* Story */}
      <section style={{ marginTop: 40, maxWidth: 720 }}>
        <h2>祕島是什麼？</h2>
        <p style={{ lineHeight: 1.8, color: 'var(--tp-muted)', marginBottom: 16 }}>
          祕島不是發明的地方。是已經在那裡，只是還沒被你看見的台灣。
        </p>
        <p style={{ lineHeight: 1.8, color: 'var(--tp-muted)', marginBottom: 16 }}>
          這裡有真正在山林裡走過的在地人。他們不講套路、不趕路線，只把自己最熟悉的那條徑、那座峰、那片溪谷，帶你去看一次。<strong>我們相信，旅行的價值不在於去過多少地方，而在於是不是真的進去過。</strong>
        </p>
        <p style={{ lineHeight: 1.8, color: 'var(--tp-muted)' }}>
          祕島做的事很簡單：讓好的在地導遊被看見，讓旅客可以直接預約、安心付款、享受一段有品質的體驗。我們先從高雄柴山探洞、台北老街、花蓮溯溪這些最有特色的行程開始，再逐步拓展到全台灣。
        </p>
      </section>

      {/* Numbers */}
      <section style={{ marginTop: 40, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}
        className="about-numbers">
        <style>{`@media (min-width: 640px) { .about-numbers { grid-template-columns: repeat(4, 1fr) !important; } }`}</style>
        {[
          { num: '3+', label: '合作導遊' },
          { num: '4+', label: '精選行程' },
          { num: '22', label: '涵蓋縣市（目標）' },
          { num: '15%', label: '平台抽成（業界最低）' },
        ].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', padding: 20, border: '1px solid var(--tp-border)', borderRadius: 12 }}>
            <p style={{ fontSize: 32, fontWeight: 800, color: 'var(--tp-primary)', margin: 0 }}>{d.num}</p>
            <p style={{ color: 'var(--tp-muted)', margin: '4px 0 0', fontSize: 14 }}>{d.label}</p>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section style={{ marginTop: 40, textAlign: 'center', padding: '40px 0' }}>
        <h2>一起讓台灣的好導遊被看見</h2>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 16 }}>
          <Link href="/guide/apply" className="tp-btn tp-btn-primary" style={{ padding: '12px 28px' }}>成為導遊</Link>
          <Link href="/activities" className="tp-btn tp-btn-ghost" style={{ padding: '12px 28px' }}>探索行程</Link>
        </div>
      </section>
    </main>
  );
}
