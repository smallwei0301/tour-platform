import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

const articles: Record<string, { title: string; category: string; date: string; readTime: string; imageUrl: string; content: string }> = {
  'why-private-guide': {
    title: '為什麼在台灣旅行要找私人導遊，而不是跟團？',
    category: '台灣旅遊',
    date: '2026-03-20',
    readTime: '5 分鐘',
    imageUrl: 'https://images.unsplash.com/photo-1528164344705-47542687000d?w=1200&q=80',
    content: `大多數人對旅行團的印象，就是一台遊覽車載著 30 個人趕景點，拍照打卡然後上車。但在台灣這樣一個文化細節豐富、巷弄比大路有趣的地方，跟團真的是最好的選擇嗎？

## 私人導遊帶來的改變

### 你掌控節奏
跟團行程是固定的：幾點到哪、停幾分鐘、幾點離開。私人導遊的行程完全跟著你走——在寧夏夜市某攤排隊排久了？沒關係，後面的行程調整一下就好。

### 你聽到的是故事，不是背稿
一般導遊要照顧 30 個人，解說只能大聲喊、快速帶過。私人導遊可以跟你聊天、回答問題，甚至帶你走進一般團客不會進去的小巷子、老屋二樓。

### 你得到的是記憶，不是清單
我們平台上的導遊，很多是在地長大的人。他們帶你走的不是「旅遊景點」，而是「他們的生活」。大稻埕的布行怎麼在現代轉型、柴山的洞穴裡住著什麼生物、花蓮的溪水為什麼這麼清——這些是你在旅遊書上看不到的。

## 什麼時候適合找私人導遊？

- 你是第一次來台灣，想有效率地深入了解
- 你帶著家人或小孩，需要彈性行程
- 你對某個主題特別有興趣（美食、歷史、戶外探險）
- 你不想跟一群陌生人擠在同一台車上

## 我們的平台怎麼幫你

每一位導遊都經過實名認證，行程價格透明、退款政策明確。你可以在預約前看到導遊的真實評價、行程包含什麼、以及其他旅客的回饋。

不確定？先瀏覽看看，找到有興趣的行程再決定。`,
  },
  'chaishan-cave-guide': {
    title: '高雄柴山探洞完全攻略：第一次就上手',
    category: '戶外冒險',
    date: '2026-03-15',
    readTime: '7 分鐘',
    imageUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=80',
    content: `高雄柴山（壽山）隱藏著數十個石灰岩洞穴，是台灣少數可以在城市邊緣就體驗探洞的地方。這篇文章整理了第一次探洞需要知道的所有資訊。

## 基本裝備

探洞需要的裝備包括：
- **頭燈**（必備，洞內完全無光）
- **安全帽**（石灰岩洞穴頂部不規則）
- **手套**（抓岩壁用）
- **止滑鞋或運動鞋**（洞內潮濕）
- **長袖長褲**（防蚊蟲與擦傷）

如果你參加 Andy Lee 的行程，基本裝備都會提供。

## 適合誰？

柴山探洞適合 6 歲以上、有基本體能的人。不需要攀岩經驗，但需要能蹲、彎腰、偶爾側身通過窄道。如果你有嚴重幽閉恐懼症，建議先評估。

## 最佳季節

全年都可以探洞，但 10 月到隔年 4 月最舒適（較涼爽、少蚊蟲）。雨季（6-8 月）部分洞穴可能積水，導遊會依狀況調整路線。

## 安全注意事項

- 絕對不要自己進洞穴——迷路風險極高
- 全程跟隨導遊指示
- 洞內不要觸摸鐘乳石（數萬年形成，一碰就壞）
- 注意腳下、頭頂

## 推薦行程

我們平台上 Andy Lee（李衍錫）是柴山探洞的專家，他是壽山國家自然公園巡守員，帶過數百團旅客。行程約 3-4 小時，NT$2,000/人。`,
  },
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(articles).map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const article = articles[slug];
  if (!article) {
    notFound();
  }
  return {
    title: `${article.title} | Midao 祕島`,
    description: article.content.slice(0, 120).replace(/\n/g, ' '),
    openGraph: {
      title: `${article.title} | Midao 祕島`,
      description: article.content.slice(0, 120).replace(/\n/g, ' '),
      images: article.imageUrl ? [{ url: article.imageUrl, width: 1200, height: 630, alt: `${article.title} — 旅遊指南封面圖` }] : [],
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${article.title} | Midao 祕島`,
      description: article.content.slice(0, 120).replace(/\n/g, ' '),
      ...(article.imageUrl ? { images: [article.imageUrl] } : {}),
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = articles[slug];

  if (!article) {
    notFound();
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: article.title,
        description: article.content.slice(0, 160).replace(/\n/g, ' '),
        image: article.imageUrl,
        datePublished: article.date,
        dateModified: article.date,
        author: { '@type': 'Organization', name: 'Midao 祕島', url: baseUrl },
        publisher: { '@type': 'Organization', name: 'Midao 祕島', url: baseUrl },
        url: `${baseUrl}/blog/${slug}`,
        inLanguage: 'zh-TW',
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首頁', item: baseUrl },
          { '@type': 'ListItem', position: 2, name: '旅遊指南', item: `${baseUrl}/blog` },
          { '@type': 'ListItem', position: 3, name: article.title },
        ],
      },
    ],
  };

  return (
    <main className="tp-container" style={{ paddingBottom: 40, maxWidth: 780, margin: '0 auto' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <div className="tp-breadcrumb" style={{ marginTop: 18 }}>
        <Link href="/">首頁</Link> &gt; <Link href="/blog">旅遊指南</Link> &gt; {article.title}
      </div>

      <Image src={article.imageUrl} alt={article.title} priority style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 14, marginTop: 12 }} width={1200} height={675} />

      <span style={{ background: 'var(--tp-accent)', color: '#fff', padding: '3px 10px', borderRadius: 6, fontSize: 12, display: 'inline-block', marginTop: 16 }}>{article.category}</span>
      <h1 style={{ margin: '12px 0 6px' }}>{article.title}</h1>
      <p style={{ color: 'var(--tp-muted)', fontSize: 14, marginBottom: 24 }}>{article.date} · 閱讀約 {article.readTime}</p>

      <div style={{ lineHeight: 1.9, fontSize: 16, color: 'var(--tp-text)' }}>
        {article.content.split('\n\n').map((para, i) => {
          if (para.startsWith('## ')) return <h2 key={i} style={{ marginTop: 28, marginBottom: 8 }}>{para.replace('## ', '')}</h2>;
          if (para.startsWith('### ')) return <h3 key={i} style={{ marginTop: 20, marginBottom: 6 }}>{para.replace('### ', '')}</h3>;
          if (para.startsWith('- ')) {
            return (
              <ul key={i} style={{ paddingLeft: 20, marginBottom: 12 }}>
                {para.split('\n').map((line, j) => <li key={j}>{line.replace('- ', '')}</li>)}
              </ul>
            );
          }
          return <p key={i} style={{ marginBottom: 12 }}>{para}</p>;
        })}
      </div>

      {/* CTA */}
      <div style={{ background: 'var(--tp-bg-soft)', border: '1px solid var(--tp-border)', borderRadius: 12, padding: 20, marginTop: 32, textAlign: 'center' }}>
        <p style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>🗺️ 準備好出發了嗎？</p>
        <Link href="/activities" className="tp-btn tp-btn-primary" style={{ padding: '10px 24px' }}>探索行程 →</Link>
      </div>
    </main>
  );
}
