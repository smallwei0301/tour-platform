import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '美食導覽行程 | Midao 祕島',
  description: '跟著懂吃的在地導遊鑽進夜市與巷弄攤位，找到真正的在地味道。小團美食走讀，不只吃，還要懂為什麼好吃。',
  openGraph: {
    title: '美食導覽 — 跟著在地人吃懂台灣 | Midao 祕島',
    description: '不只吃，還要懂為什麼好吃。跟著懂吃的導遊，一口一口讀懂一座城市。',
    images: [{ url: 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=1200', width: 1200, height: 630, alt: '美食導覽 | Midao 祕島' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '美食導覽 — 跟著在地人吃懂台灣 | Midao 祕島',
    description: '不只吃，還要懂為什麼好吃。跟著懂吃的導遊，一口一口讀懂一座城市。',
    images: ['https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=1200'],
  },
};

const foodTours = [
  {
    title: '台北夜市美食文化探索',
    slug: 'taipei-night-market-food-tour',
    region: 'taipei',
    meta: '🕐 3小時 · 👥 2~8人 · NT$1,800',
    imageUrl: 'https://images.unsplash.com/photo-1567306226416-28f0efdc88ce?w=1200&q=80',
  },
  {
    title: '台南巷弄小吃深度走讀',
    slug: 'taipei-night-market-food-tour',
    region: 'taipei',
    meta: '🕐 3.5小時 · 👥 2~8人 · NT$1,900',
    imageUrl: 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=1200',
  },
  {
    title: '在地市場早餐與食材導覽',
    slug: 'taipei-night-market-food-tour',
    region: 'taipei',
    meta: '🕐 2.5小時 · 👥 2~10人 · NT$1,500',
    imageUrl: 'https://images.pexels.com/photos/2253643/pexels-photo-2253643.jpeg?auto=compress&cs=tinysrgb&w=1200',
  },
];

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';

const foodJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首頁', item: baseUrl },
        { '@type': 'ListItem', position: 2, name: '探索行程', item: `${baseUrl}/activities` },
        { '@type': 'ListItem', position: 3, name: '美食導覽', item: `${baseUrl}/theme/food-tour` },
      ],
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: '會吃到很飽嗎？',
          acceptedAnswer: { '@type': 'Answer', text: '行程安排多攤少量，讓你嘗到更多種類又不會太撐，建議出發前留點胃口。' },
        },
        {
          '@type': 'Question',
          name: '有素食或飲食限制可以參加嗎？',
          acceptedAnswer: { '@type': 'Answer', text: '可以，預約時先告知，導遊會調整攤位與品項。' },
        },
        {
          '@type': 'Question',
          name: '餐費包含在費用裡嗎？',
          acceptedAnswer: { '@type': 'Answer', text: '依行程標示為準，部分含品嘗費用、部分另計，請見各行程頁面。' },
        },
      ],
    },
  ],
};

export default function FoodTourPage() {
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(foodJsonLd) }} />
      <div className="tp-container">
        <div className="tp-breadcrumb" style={{ paddingTop: 16 }}>
          <Link href="/">首頁</Link> &gt; <Link href="/activities">探索行程</Link> &gt; 美食導覽
        </div>
      </div>
      <section className="tp-theme-hero tp-theme-food-hero">
        <div className="tp-container">
          <h1>跟著在地人，吃懂一座城市</h1>
          <p>不只吃，還要懂為什麼好吃。跟著懂吃的導遊鑽進夜市與巷弄攤位，一口一口讀懂台灣的味道。</p>
          <Link className="tp-btn tp-btn-primary" href={`/activities?type=${encodeURIComponent('美食導覽')}`}>探索美食行程</Link>
        </div>
      </section>

      <section className="tp-section">
        <div className="tp-container tp-feature-3col">
          <article>🍜 多攤少量<br/>一次嘗到更多在地味道</article>
          <article>🗺️ 巷弄門路<br/>導遊帶你避開觀光攤、找到真正好吃的</article>
          <article>✅ 懂吃的在地人<br/>熟悉地方飲食文化與食材故事</article>
        </div>
      </section>

      <section className="tp-section">
        <div className="tp-container">
          <h2>美食導覽精選行程</h2>
          <div className="tp-card-grid tp-card-grid-activities">
            {foodTours.map((t) => (
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
          <h2>美食走讀常見問題</h2>
          <div className="tp-faq-list">
            <details open><summary>會吃到很飽嗎？</summary><p>行程安排多攤少量，讓你嘗到更多種類又不會太撐，建議出發前留點胃口。</p></details>
            <details><summary>有素食或飲食限制可以參加嗎？</summary><p>可以，預約時先告知，導遊會調整攤位與品項。</p></details>
            <details><summary>餐費包含在費用裡嗎？</summary><p>依行程標示為準，部分含品嘗費用、部分另計，請見各行程頁面。</p></details>
          </div>
        </div>
      </section>
    </main>
  );
}
