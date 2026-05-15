import Image from 'next/image';
import Link from 'next/link';

const riverTours = [
  {
    title: '花蓮秀姑巒溪溯溪全日冒險',
    slug: 'hualien-river-trekking',
    meta: '🌊 Level 2 · 👥 4~8人 · NT$3,200',
    imageUrl: 'https://images.pexels.com/photos/2325446/pexels-photo-2325446.jpeg?auto=compress&cs=tinysrgb&w=1200',
  },
  {
    title: '南澳野溪溯溪入門路線',
    slug: 'hualien-river-trekking',
    meta: '🌊 Level 1 · 👥 4~8人 · NT$2,400',
    imageUrl: 'https://images.pexels.com/photos/210186/pexels-photo-210186.jpeg?auto=compress&cs=tinysrgb&w=1200',
  },
  {
    title: '台東山谷溪降挑戰',
    slug: 'hualien-river-trekking',
    meta: '🌊 Level 3 · 👥 4~6人 · NT$4,200',
    imageUrl: 'https://images.pexels.com/photos/125510/pexels-photo-125510.jpeg?auto=compress&cs=tinysrgb&w=1200',
  },
];

export default function RiverTrekkingPage() {
  return (
    <main>
      <section className="tp-theme-hero tp-theme-river-hero">
        <div className="tp-container">
          <h1>走進台灣最純淨的野溪</h1>
          <p>不靠纜車、不靠觀光車，靠雙腳和懂山的人，體驗台灣最真實的水路風景。</p>
          <Link className="tp-btn tp-btn-primary" href="/activities?theme=river-trekking">探索溯溪行程</Link>
        </div>
      </section>

      <section className="tp-section">
        <div className="tp-container tp-feature-3col">
          <article>🪨 裝備租借<br/>安全鞋、頭盔、防護裝備齊全</article>
          <article>🌊 難度分三級<br/>Level 1 初階到 Level 3 進階</article>
          <article>✅ 嚮導認證<br/>具戶外教學與安全訓練背景</article>
        </div>
      </section>

      <section className="tp-section">
        <div className="tp-container">
          <h2>野外溯溪精選行程</h2>
          <div className="tp-card-grid tp-card-grid-activities">
            {riverTours.map((t) => (
              <article className="tp-card" key={t.slug + t.title}>
                <Image src={t.imageUrl} alt={t.title} className="tp-card-img" loading="lazy" width={1200} height={675} />
                <h3>{t.title}</h3>
                <p>{t.meta}</p>
                <Link className="tp-link" href={`/activities/hualien/${encodeURIComponent(t.slug)}`}>查看行程 →</Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="tp-section tp-faq">
        <div className="tp-container">
          <h2>溯溪常見問題</h2>
          <div className="tp-faq-list">
            <details open><summary>不會游泳可以參加嗎？</summary><p>可參加 Level 1 路線，導遊會先做安全說明與裝備檢查。</p></details>
            <details><summary>幾月份最適合溯溪？</summary><p>春末到秋季較穩定，但仍以當日水況與安全為準。</p></details>
            <details><summary>Level 1 與 Level 3 差在哪？</summary><p>主要差在地形難度、體能需求與通過技術。</p></details>
          </div>
        </div>
      </section>
    </main>
  );
}
