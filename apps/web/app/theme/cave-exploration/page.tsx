import Link from 'next/link';

const caveTours = [
  {
    title: '高雄柴山自然公園探洞半日遊',
    slug: 'kaohsiung-chaishan-cave-experience',
    meta: '🕐 3-4小時 · 👥 4~12人 · NT$2,000',
    imageUrl: '/images/activities/chaishan/main.jpg',
  },
  {
    title: '柴山石灰岩洞穴地質探索',
    slug: 'kaohsiung-chaishan-cave-experience',
    meta: '🕐 3小時 · 👥 4~10人 · NT$2,200',
    imageUrl: 'https://images.pexels.com/photos/1496373/pexels-photo-1496373.jpeg?auto=compress&cs=tinysrgb&w=1200',
  },
  {
    title: '柴山親子安全探洞體驗',
    slug: 'kaohsiung-chaishan-cave-experience',
    meta: '🕐 2.5小時 · 👥 4~8人 · NT$1,800',
    imageUrl: 'https://images.pexels.com/photos/3763814/pexels-photo-3763814.jpeg?auto=compress&cs=tinysrgb&w=1200',
  },
];

export default function CaveExplorationPage() {
  return (
    <main>
      <section className="tp-theme-hero tp-theme-cave">
        <div className="tp-container">
          <h1>鑽進高雄的秘密地下世界</h1>
          <p>柴山的石灰岩洞穴藏著億萬年的地質故事，讓在地導遊帶你安全深入探索。</p>
          <Link className="tp-btn tp-btn-primary" href="/activities?theme=cave-exploration">探索柴山行程</Link>
        </div>
      </section>

      <section className="tp-section">
        <div className="tp-container tp-feature-3col">
          <article>🔦 裝備全包<br/>頭燈、安全帽、手套完整配發</article>
          <article>🦎 生態解說<br/>導遊帶你認識洞穴生態與地形</article>
          <article>✅ 安全認證嚮導<br/>具山林與戶外安全相關認證</article>
        </div>
      </section>

      <section className="tp-section">
        <div className="tp-container">
          <h2>柴山探洞精選行程</h2>
          <div className="tp-card-grid tp-card-grid-activities">
            {caveTours.map((t) => (
              <article className="tp-card" key={t.slug + t.title}>
                <img src={t.imageUrl} alt={t.title} className="tp-card-img" loading="lazy" />
                <h3>{t.title}</h3>
                <p>{t.meta}</p>
                <Link className="tp-link" href={`/checkout?slug=${encodeURIComponent(t.slug)}`}>查看行程 →</Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="tp-section tp-faq">
        <div className="tp-container">
          <h2>探洞前你需要知道</h2>
          <div className="tp-faq-list">
            <details open><summary>需要有攀岩經驗嗎？</summary><p>不需要，MVP 路線以初中階安全探索為主。</p></details>
            <details><summary>適合幾歲的人參加？</summary><p>建議 10 歲以上，實際依行程標示與導遊評估。</p></details>
            <details><summary>當天要穿什麼？</summary><p>建議防滑鞋、長褲、可活動上衣，避免拖鞋。</p></details>
          </div>
        </div>
      </section>
    </main>
  );
}
