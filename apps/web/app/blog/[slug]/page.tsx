import Link from 'next/link';

export default async function BlogDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <main className="tp-container tp-blog-detail">
      <div className="tp-breadcrumb">首頁 &gt; 旅遊指南 &gt; {decodeURIComponent(slug)}</div>
      <div className="tp-blog-layout">
        <article>
          <div className="tp-card-img" />
          <h1>為什麼台灣要找私人導遊，不是加入跟團？</h1>
          <p className="tp-detail-meta">作者：Tour Platform 編輯室 · 2026-03-20 · 閱讀 5 分鐘</p>
          <section className="tp-step-card">
            <p>一般跟團追求的是「效率地看很多點」，私人導遊追求的是「在有限時間內得到更深的理解」。</p>
            <p>在我們的平台裡，你可先看到導遊評價、專長與語言，再決定是否預約，降低資訊不對稱。</p>
          </section>
          <section className="tp-step-card">
            <h2>延伸閱讀</h2>
            <ul>
              <li><Link className="tp-link" href="/theme/cave-exploration">柴山探洞主題頁</Link></li>
              <li><Link className="tp-link" href="/theme/river-trekking">野外溯溪主題頁</Link></li>
            </ul>
          </section>
        </article>
        <aside className="tp-booking-side">
          <div className="tp-booking-card">
            <h3>文章目錄</h3>
            <ul>
              <li>私人導遊 vs 跟團</li>
              <li>適合哪些旅客</li>
              <li>預約前檢查清單</li>
            </ul>
            <Link className="tp-btn tp-btn-primary tp-full" href="/activities">查看行程</Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
