import Link from 'next/link';

const stats = [
  { value: '3+', label: '合作導遊', note: '持續擴編中' },
  { value: '4+', label: '精選路線', note: '從洞穴到老街' },
  { value: '22', label: '目標縣市', note: '逐步拓展全台' },
  { value: '15%', label: '平台抽成', note: '透明且固定' },
];

const principles = [
  {
    title: '不是帶你打卡，是帶你進場景',
    body: '我們希望旅客看到的不是一串景點清單，而是一個地方真正的節奏、人物與故事。',
  },
  {
    title: '讓好的在地導遊被看見',
    body: '很多優秀導遊沒有自己的品牌與後台，平台要做的是把他們的專業與可信度清楚呈現出來。',
  },
  {
    title: '把預約、付款、售後做成安心流程',
    body: '從下單、確認、取消到退款，我們把原本混亂的旅遊溝通，整理成可以信任的標準流程。',
  },
];

export default function AboutPage() {
  return (
    <main className="tp-container tp-editorial-page">
      <section className="tp-editorial-hero">
        <p className="tp-editorial-kicker">about midao</p>
        <h1>我們想讓台灣在地導覽，看起來像一種值得被正式對待的體驗品牌。</h1>
        <p className="tp-editorial-lead">
          不只是上架行程，而是把導遊、旅客、付款與服務細節，整理成一個有溫度又可信任的旅程系統。
        </p>
        <div className="tp-editorial-chip-row">
          <span className="tp-editorial-chip">在地導遊</span>
          <span className="tp-editorial-chip">深度體驗</span>
          <span className="tp-editorial-chip">透明預約</span>
        </div>
      </section>

      <section className="tp-editorial-section tp-editorial-grid-two">
        <article className="tp-editorial-prose">
          <h2>為什麼做這件事？</h2>
          <p>
            台灣有很多很會帶路的人，知道什麼時間看山最好、哪一段老街該慢慢走、哪個洞口該先彎腰再前進。
            但旅客很難找到他們，導遊也缺乏一個能好好展示專業的平台。
          </p>
          <p>
            MIDAO 想做的，就是把「找導遊」這件事從零散私訊、口耳相傳，變成一個清楚、可信、可以安心付款與回頭的體驗流程。
          </p>
        </article>
        <article className="tp-editorial-card-soft">
          <h2>我們現在的路線</h2>
          <ul className="tp-editorial-list">
            <li>從最有辨識度的在地體驗開始，例如柴山探洞、老街走讀、戶外溪谷。</li>
            <li>優先整理導遊端工作流，讓申請、排班、預約、退款都能被清楚管理。</li>
            <li>把封面風格延伸到全站，讓每個頁面都像同一本 field guide 的不同章節。</li>
          </ul>
        </article>
      </section>

      <section className="tp-editorial-section tp-editorial-grid-three">
        {stats.map((item) => (
          <article key={item.label} className="tp-editorial-card">
            <div className="tp-editorial-stat">
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
            <p>{item.note}</p>
          </article>
        ))}
      </section>

      <section className="tp-editorial-section tp-editorial-grid-three">
        {principles.map((item) => (
          <article key={item.title} className="tp-editorial-card-soft">
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </section>

      <section className="tp-editorial-section tp-editorial-card">
        <h2>下一步</h2>
        <p>
          如果你是旅客，就去找一條你想真的走進去的路；如果你是導遊，就把你的 field note 帶進來，讓更多人看見。
        </p>
        <div className="tp-member-actions-row" style={{ marginTop: 12 }}>
          <Link href="/activities" className="tp-btn tp-btn-primary">探索行程</Link>
          <Link href="/guide/apply" className="tp-btn tp-btn-ghost">成為導遊</Link>
        </div>
      </section>
    </main>
  );
}
