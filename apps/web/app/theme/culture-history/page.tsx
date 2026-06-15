import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '文化歷史行程 | Midao 祕島',
  description: '走進台灣的老街、廟埕與部落，跟著在地導遊把街區與族群背後的故事走成記憶。小團深度文化體驗，實名認證導遊帶路。',
  openGraph: {
    title: '文化歷史 — 台灣街區與部落的故事 | Midao 祕島',
    description: '不是走馬看花。跟著懂故事的人，認識一個活了百年的街區與它的人。',
    images: [{ url: 'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=1200', width: 1200, height: 630, alt: '文化歷史 | Midao 祕島' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '文化歷史 — 台灣街區與部落的故事 | Midao 祕島',
    description: '不是走馬看花。跟著懂故事的人，認識一個活了百年的街區與它的人。',
    images: ['https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=1200'],
  },
};

const cultureTours = [
  {
    title: '大稻埕百年老街深度漫步',
    slug: 'dadadaocheng-walk',
    region: 'taipei',
    meta: '🕐 3小時 · 👥 1~8人 · NT$1,500',
    imageUrl: 'https://images.unsplash.com/photo-1470004914212-05527e49370b?w=1200&q=80',
  },
  {
    title: '鹿港古蹟與信仰文化導覽',
    slug: 'dadadaocheng-walk',
    region: 'taipei',
    meta: '🕐 3.5小時 · 👥 2~10人 · NT$1,600',
    imageUrl: 'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=1200',
  },
  {
    title: '部落文化與傳統工藝半日體驗',
    slug: 'dadadaocheng-walk',
    region: 'taipei',
    meta: '🕐 4小時 · 👥 2~8人 · NT$1,900',
    imageUrl: 'https://images.pexels.com/photos/3214958/pexels-photo-3214958.jpeg?auto=compress&cs=tinysrgb&w=1200',
  },
];

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';

const cultureJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首頁', item: baseUrl },
        { '@type': 'ListItem', position: 2, name: '探索行程', item: `${baseUrl}/activities` },
        { '@type': 'ListItem', position: 3, name: '文化歷史', item: `${baseUrl}/theme/culture-history` },
      ],
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: '需要先做功課才聽得懂嗎？',
          acceptedAnswer: { '@type': 'Answer', text: '不需要，導遊會從生活與人的角度帶你進入歷史，沒有背景也能投入。' },
        },
        {
          '@type': 'Question',
          name: '會走很多路嗎？',
          acceptedAnswer: { '@type': 'Answer', text: '以慢步走讀為主，沿途有停留與休息，適合多數體能。' },
        },
        {
          '@type': 'Question',
          name: '適合長輩與小孩一起參加嗎？',
          acceptedAnswer: { '@type': 'Answer', text: '適合，節奏緩和、互動性高，是親子與三代同遊的好選擇。' },
        },
      ],
    },
  ],
};

export default function CultureHistoryPage() {
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(cultureJsonLd) }} />
      <div className="tp-container">
        <div className="tp-breadcrumb" style={{ paddingTop: 16 }}>
          <Link href="/">首頁</Link> &gt; <Link href="/activities">探索行程</Link> &gt; 文化歷史
        </div>
      </div>
      <section className="tp-theme-hero tp-theme-culture-hero">
        <div className="tp-container">
          <h1>走進活了百年的街區與部落</h1>
          <p>不是打卡式走馬看花，而是跟著懂故事的在地人，把老街、廟埕與族群背後的人與歷史走成真正可感受的記憶。</p>
          <Link className="tp-btn tp-btn-primary" href={`/activities?type=${encodeURIComponent('文化歷史')}`}>探索文化行程</Link>
        </div>
      </section>

      <section className="tp-section">
        <div className="tp-container tp-feature-3col">
          <article>📖 在地觀點<br/>由生活在這裡的人帶你讀懂地方</article>
          <article>🏮 慢步走讀<br/>節奏緩和，適合親子與三代同遊</article>
          <article>✅ 文史背景嚮導<br/>具地方文史或導覽解說專業</article>
        </div>
      </section>

      <section className="tp-section">
        <div className="tp-container">
          <h2>文化歷史精選行程</h2>
          <div className="tp-card-grid tp-card-grid-activities">
            {cultureTours.map((t) => (
              <article className="tp-card" key={t.slug + t.title}>
                <Image src={t.imageUrl} alt={t.title} className="tp-card-img" loading="lazy" width={1200} height={675} />
                <h3>{t.title}</h3>
                <p>{t.meta}</p>
                <Link className="tp-link" href={`/activities/${t.region}/${encodeURIComponent(t.slug)}`}>查看行程 →</Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="tp-section tp-faq">
        <div className="tp-container">
          <h2>文化走讀常見問題</h2>
          <div className="tp-faq-list">
            <details open><summary>需要先做功課才聽得懂嗎？</summary><p>不需要，導遊會從生活與人的角度帶你進入歷史，沒有背景也能投入。</p></details>
            <details><summary>會走很多路嗎？</summary><p>以慢步走讀為主，沿途有停留與休息，適合多數體能。</p></details>
            <details><summary>適合長輩與小孩一起參加嗎？</summary><p>適合，節奏緩和、互動性高，是親子與三代同遊的好選擇。</p></details>
          </div>
        </div>
      </section>
    </main>
  );
}
