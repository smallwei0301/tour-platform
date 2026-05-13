import Link from 'next/link';

const promises = [
  {
    icon: '/images/midao-style/icon-verified.png',
    title: '實名認證',
    desc: '每位導遊都經過 KYC 身分驗證與審核',
  },
  {
    icon: '/images/midao-style/icon-wallet.png',
    title: '退款保障',
    desc: '明確退款政策，依規定時間內全額退款',
  },
  {
    icon: '/images/midao-style/icon-hotline.png',
    title: '緊急熱線',
    desc: '活動當天有問題，30 分鐘內回應',
  },
  {
    icon: '/images/midao-style/icon-custom.png',
    title: '客製行程',
    desc: '可依需求客製化，包團、親子、企業都行',
  },
];

export default function WhyChooseUsPage() {
  return (
    <main className="tp-container tp-editorial-page">
      <section
        className="tp-editorial-hero"
        style={{
          backgroundImage:
            'linear-gradient(rgba(12, 24, 18, 0.36), rgba(12, 24, 18, 0.5)), url(/images/midao-style/why-hero.png)',
        }}
      >
        <h1>為什麼選擇私人在地導遊？</h1>
        <p>跟團趕行程，還是找一個真正懂路的人帶你慢慢走？</p>
      </section>

      <section className="tp-why-promise-grid">
        {promises.map((p) => (
          <article key={p.title} className="tp-why-promise-card">
            <img src={p.icon} alt="" aria-hidden="true" className="tp-why-promise-icon" />
            <h4>{p.title}</h4>
            <p>{p.desc}</p>
          </article>
        ))}
      </section>

      <section className="tp-why-compare">
        <h2>我們的平台 vs 一般跟團</h2>
        <div className="tp-why-compare-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th className="tp-why-col-us">祕島平台</th>
                <th className="tp-why-col-them">一般跟團</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['同行人數', '只有你（或你的小團）', '10~40 人'],
                ['行程彈性', '完全客製', '固定路線'],
                ['導遊注意力', '全程專注你', '分散給全團'],
                ['退款保障', '明確政策，48hr 前全退', '不一定'],
                ['導遊實名認證', '全員認證', '不一定'],
                ['緊急聯繫', '30 分鐘回應', '不提供'],
                ['深度體驗', '在地秘境 + 故事', '觀光景點打卡'],
              ].map(([label, us, them]) => (
                <tr key={label}>
                  <td className="tp-why-label">{label}</td>
                  <td className="tp-why-us">{us}</td>
                  <td className="tp-why-them">{them}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="tp-why-testimonials">
        <h2>旅客怎麼說</h2>
        <div className="tp-why-testimonial-grid">
          {[
            {
              author: '小美（台北）',
              text: '大人小人都開心，路線比想像中刺激但又很安全！',
              activity: '柴山探洞',
            },
            {
              author: 'Vivian C.（台北）',
              text: '比任何旅遊書都精彩，真的像被在地朋友帶著走。',
              activity: '大稻埕老街',
            },
            {
              author: '小琪（新竹）',
              text: '人生清單打勾，全程很安心，是花蓮最棒的體驗。',
              activity: '花蓮溯溪',
            },
          ].map((t) => (
            <article key={t.author} className="tp-why-testimonial-card">
              <p className="tp-why-stars">★★★★★</p>
              <p className="tp-why-quote">「{t.text}」</p>
              <p className="tp-why-meta">
                — {t.author} · {t.activity}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="tp-editorial-cta">
        <h2>準備好了嗎？</h2>
        <p className="tp-editorial-muted">找到懂路的人，用你的節奏認識台灣。</p>
        <Link href="/activities" className="tp-btn tp-btn-primary">
          立即探索行程
        </Link>
      </section>
    </main>
  );
}
