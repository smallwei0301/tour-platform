import Link from 'next/link';

const articles: Record<string, { title: string; category: string; date: string; readTime: string; imageUrl: string; content: string }> = {
  'why-private-guide': {
    title: '為什麼在台灣旅行要找私人導遊，而不是跟團？',
    category: '台灣旅遊',
    date: '2026-03-20',
    readTime: '5 分鐘',
    imageUrl: 'https://images.unsplash.com/photo-1528164344705-47542687000d?w=1200&q=80',
    content: `大多數人對旅行團的印象，就是一台遊覽車載著一群人趕景點。但在台灣這樣一個文化細節很密、巷弄比大道更有趣的地方，跟團往往不是最有記憶點的方式。

## 私人導遊真正改變了什麼？

### 節奏由你決定
你不需要為了配合整團而縮短停留，也不用擔心自己想問的問題被略過。

### 你聽到的是故事，不是背稿
私人導遊可以把地方經驗轉成對話，而不是一段制式口白。

### 你帶走的是記憶，不是清單
最好的旅程不是看了多少點，而是你記住了什麼人、什麼味道、什麼路感。

## 什麼情況最適合找私人導遊？

- 第一次來台灣，想快速建立理解
- 帶家人、小孩，行程需要彈性
- 對某一種主題特別有興趣
- 不想把旅行交給一個固定 timetable

## 平台怎麼幫你？

我們把導遊資訊、預約流程、退款規則與後續聯繫，整理成更可信的體驗流程，讓你在出發前就知道自己買到的是什麼。`,
  },
  'chaishan-cave-guide': {
    title: '高雄柴山探洞完全攻略：第一次就上手',
    category: '戶外冒險',
    date: '2026-03-15',
    readTime: '7 分鐘',
    imageUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=80',
    content: `柴山探洞最迷人的地方，在於它明明靠近城市，卻能讓你快速切換到另一種感官狀態。

## 先準備這些基本裝備

- 頭燈
- 安全帽
- 手套
- 止滑鞋
- 長袖長褲

## 誰適合第一次去？

只要有基本體能，願意彎腰、蹲低、接受潮濕與狹窄環境，大多都能體驗。

## 安全最重要的三件事

### 不要自己進洞
洞穴判斷與方向感都不適合新手獨自處理。

### 全程跟導遊節奏
柴山探洞好玩的前提，是有人幫你掌握安全線。

### 尊重環境
洞內地形與自然痕跡很脆弱，不要為了拍照去破壞它。`,
  },
};

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = articles[slug];

  if (!article) {
    return (
      <main className="tp-container tp-editorial-page">
        <section className="tp-editorial-card" style={{ textAlign: 'center' }}>
          <h1>文章不存在</h1>
          <Link href="/blog" className="tp-btn tp-btn-ghost">返回旅遊指南</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="tp-container tp-editorial-page" style={{ maxWidth: 880 }}>
      <section className="tp-editorial-hero">
        <p className="tp-editorial-kicker">{article.category}</p>
        <h1>{article.title}</h1>
        <div className="tp-editorial-meta-row">
          <span className="tp-editorial-chip">{article.date}</span>
          <span className="tp-editorial-chip">閱讀約 {article.readTime}</span>
        </div>
      </section>

      <section className="tp-editorial-section">
        <img className="tp-article-cover" src={article.imageUrl} alt={article.title} />
      </section>

      <section className="tp-editorial-section tp-editorial-prose">
        <div className="tp-article-content">
          {article.content.split('\n\n').map((para, i) => {
            if (para.startsWith('## ')) return <h2 key={i}>{para.replace('## ', '')}</h2>;
            if (para.startsWith('### ')) return <h3 key={i}>{para.replace('### ', '')}</h3>;
            if (para.startsWith('- ')) {
              return (
                <ul key={i} className="tp-editorial-list">
                  {para.split('\n').map((line, j) => <li key={j}>{line.replace('- ', '')}</li>)}
                </ul>
              );
            }
            return <p key={i}>{para}</p>;
          })}
        </div>
      </section>

      <section className="tp-editorial-section tp-editorial-card-soft">
        <h2>準備把文章變成實際旅程？</h2>
        <p>如果你已經知道自己想走哪條路，下一步就去看對應的行程與導遊。</p>
        <div className="tp-member-actions-row" style={{ marginTop: 12 }}>
          <Link href="/activities" className="tp-btn tp-btn-primary">探索行程</Link>
          <Link href="/blog" className="tp-btn tp-btn-ghost">回到文章列表</Link>
        </div>
      </section>
    </main>
  );
}
