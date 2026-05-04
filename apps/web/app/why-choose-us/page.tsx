import Link from 'next/link';

const promises = [
  ['實名認證', '每位導遊都經過平台審核與身份驗證。'],
  ['退款保障', '把取消與退款規則清楚寫進流程裡。'],
  ['即時協助', '活動前後與當天狀況，都有明確聯絡窗口。'],
  ['客製體驗', '比起固定團，我們更適合需要彈性的旅客。'],
];

const comparisons = [
  ['同行人數', '小團或私人節奏', '10-40 人團'],
  ['行程彈性', '可依需求調整', '固定時間表'],
  ['導遊注意力', '聚焦在你的團', '需分散照顧整車'],
  ['體驗深度', '在地故事與路感', '觀光式走點'],
];

export default function WhyChooseUsPage() {
  return (
    <main className="tp-container tp-editorial-page">
      <section className="tp-editorial-hero">
        <p className="tp-editorial-kicker">why midao</p>
        <h1>不是比較便宜，而是比較值得。</h1>
        <p className="tp-editorial-lead">
          找私人在地導遊的價值，不只是有人帶路，而是整段旅程會更像為你設計，而不是你去配合一個既定的團。
        </p>
      </section>

      <section className="tp-editorial-section tp-editorial-grid-three">
        {promises.map(([title, desc]) => (
          <article key={title} className="tp-editorial-card-soft">
            <h3>{title}</h3>
            <p>{desc}</p>
          </article>
        ))}
      </section>

      <section className="tp-editorial-section tp-editorial-grid-two">
        <article className="tp-editorial-card">
          <h2>平台 vs 一般跟團</h2>
          <div className="tp-editorial-grid">
            {comparisons.map(([label, us, them]) => (
              <div key={label} className="tp-member-info-row">
                <span>{label}</span>
                <span>{us} / {them}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="tp-editorial-prose">
          <h2>旅客實際在意的是什麼？</h2>
          <p>多數人真正想買的，不是更多景點，而是更少摩擦：好不好約、能不能改、遇到問題有沒有人處理。</p>
          <p>所以我們把 UI、導遊端工作台、訂單頁與 legal 說明都收斂成同一個系統，讓「看起來可信」和「流程真的清楚」同時成立。</p>
        </article>
      </section>

      <section className="tp-editorial-section tp-editorial-card">
        <h2>準備好了嗎？</h2>
        <p>如果你想用自己的節奏認識台灣，現在就去找一條真的想走的路。</p>
        <div className="tp-member-actions-row" style={{ marginTop: 12 }}>
          <Link href="/activities" className="tp-btn tp-btn-primary">探索行程</Link>
        </div>
      </section>
    </main>
  );
}
