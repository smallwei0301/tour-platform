import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '山野秘境行程 | Midao 祕島',
  description: '百岳秘徑、森林浴與稜線上的台灣壯景，跟著懂山的在地嚮導用雙腳走進山林深處。小團登山健行，安全認證帶路。',
  openGraph: {
    title: '山野秘境 — 走進台灣的山林深處 | Midao 祕島',
    description: '不靠纜車、不靠觀光車，靠雙腳和懂山的人，走進地圖上找不到的台灣山徑。',
    images: [{ url: 'https://images.pexels.com/photos/618833/pexels-photo-618833.jpeg?auto=compress&cs=tinysrgb&w=1200', width: 1200, height: 630, alt: '山野秘境 | Midao 祕島' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '山野秘境 — 走進台灣的山林深處 | Midao 祕島',
    description: '不靠纜車、不靠觀光車，靠雙腳和懂山的人，走進地圖上找不到的台灣山徑。',
    images: ['https://images.pexels.com/photos/618833/pexels-photo-618833.jpeg?auto=compress&cs=tinysrgb&w=1200'],
  },
};

const wildernessTours = [
  {
    title: '柴山稜線健行與地形秘境',
    slug: 'kaohsiung-chaishan-cave-experience',
    region: 'kaohsiung',
    meta: '🏔️ 入門 · 👥 4~12人 · NT$2,000',
    imageUrl: '/images/activities/chaishan/main.jpg',
  },
  {
    title: '中級山森林浴一日健行',
    slug: 'kaohsiung-chaishan-cave-experience',
    region: 'kaohsiung',
    meta: '🏔️ 進階 · 👥 4~8人 · NT$2,800',
    imageUrl: 'https://images.pexels.com/photos/618833/pexels-photo-618833.jpeg?auto=compress&cs=tinysrgb&w=1200',
  },
  {
    title: '百岳秘徑稜線縱走體驗',
    slug: 'kaohsiung-chaishan-cave-experience',
    region: 'kaohsiung',
    meta: '🏔️ 挑戰 · 👥 4~6人 · NT$4,500',
    imageUrl: 'https://images.pexels.com/photos/733162/pexels-photo-733162.jpeg?auto=compress&cs=tinysrgb&w=1200',
  },
];

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';

const wildernessJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首頁', item: baseUrl },
        { '@type': 'ListItem', position: 2, name: '探索行程', item: `${baseUrl}/activities` },
        { '@type': 'ListItem', position: 3, name: '山野秘境', item: `${baseUrl}/theme/mountain-wilderness` },
      ],
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: '沒有登山經驗可以參加嗎？',
          acceptedAnswer: { '@type': 'Answer', text: '可以，入門路線以平緩步道為主，導遊會先做行前說明與裝備檢查。' },
        },
        {
          '@type': 'Question',
          name: '需要自己準備裝備嗎？',
          acceptedAnswer: { '@type': 'Answer', text: '建議自備登山鞋、飲水與雨具，部分行程提供登山杖等裝備，詳見行程頁面。' },
        },
        {
          '@type': 'Question',
          name: '遇到下雨會出團嗎？',
          acceptedAnswer: { '@type': 'Answer', text: '以當日天氣與山況安全為準，導遊會評估是否調整路線或改期。' },
        },
      ],
    },
  ],
};

export default function MountainWildernessPage() {
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(wildernessJsonLd) }} />
      <div className="tp-container">
        <div className="tp-breadcrumb" style={{ paddingTop: 16 }}>
          <Link href="/">首頁</Link> &gt; <Link href="/activities">探索行程</Link> &gt; 山野秘境
        </div>
      </div>
      <section className="tp-theme-hero tp-theme-wilderness-hero">
        <div className="tp-container">
          <h1>走進台灣的山林深處</h1>
          <p>百岳秘徑、森林浴與稜線上的壯景。不靠纜車、不靠觀光車，靠雙腳和懂山的人，走進地圖上找不到的台灣。</p>
          <Link className="tp-btn tp-btn-primary" href={`/activities?type=${encodeURIComponent('山野秘境')}`}>探索山野行程</Link>
        </div>
      </section>

      <section className="tp-section">
        <div className="tp-container tp-feature-3col">
          <article>🥾 難度分級<br/>從平緩步道到稜線縱走，依體能挑選</article>
          <article>🌲 森林與生態<br/>導遊帶你認識沿途植被與山林故事</article>
          <article>✅ 安全認證嚮導<br/>具登山嚮導與戶外安全相關認證</article>
        </div>
      </section>

      <section className="tp-section">
        <div className="tp-container">
          <h2>山野秘境精選行程</h2>
          <div className="tp-card-grid tp-card-grid-activities">
            {wildernessTours.map((t) => (
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
          <h2>登山健行常見問題</h2>
          <div className="tp-faq-list">
            <details open><summary>沒有登山經驗可以參加嗎？</summary><p>可以，入門路線以平緩步道為主，導遊會先做行前說明與裝備檢查。</p></details>
            <details><summary>需要自己準備裝備嗎？</summary><p>建議自備登山鞋、飲水與雨具，部分行程提供登山杖等裝備，詳見行程頁面。</p></details>
            <details><summary>遇到下雨會出團嗎？</summary><p>以當日天氣與山況安全為準，導遊會評估是否調整路線或改期。</p></details>
          </div>
        </div>
      </section>
    </main>
  );
}
