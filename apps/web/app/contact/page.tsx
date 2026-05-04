import Link from 'next/link';

const contactCards = [
  { title: 'Email', value: 'hello@tourplatform.tw', note: '一般詢問 / 合作提案 / 媒體聯繫' },
  { title: '客服時段', value: '平日 09:00 - 18:00', note: '活動當天緊急問題優先處理' },
  { title: '回覆節奏', value: '1-2 個工作天', note: '急件請在訊息中註明活動日期與訂單資訊' },
];

export default function ContactPage() {
  return (
    <main className="tp-container tp-editorial-page">
      <section className="tp-editorial-hero">
        <p className="tp-editorial-kicker">contact</p>
        <h1>需要協助、合作、包團，或只是想先問清楚，都可以直接來找我們。</h1>
        <p className="tp-editorial-lead">
          我們保留聯絡頁的原始用途，但把它整理成更像 concierge desk 的感覺：該找誰、多久回、要附什麼資訊，一眼看懂。
        </p>
      </section>

      <section className="tp-editorial-section tp-editorial-grid-two">
        <article className="tp-editorial-card">
          <h2>留下訊息</h2>
          <form className="tp-auth-form">
            <div className="tp-auth-field">
              <label htmlFor="name">姓名 *</label>
              <input id="name" className="tp-auth-input" type="text" placeholder="你的名字" />
            </div>
            <div className="tp-auth-field">
              <label htmlFor="email">電子信箱 *</label>
              <input id="email" className="tp-auth-input" type="email" placeholder="you@example.com" />
            </div>
            <div className="tp-auth-field">
              <label htmlFor="topic">主題</label>
              <input id="topic" className="tp-auth-input" type="text" placeholder="例如：訂單問題 / 企業包團 / 媒體合作" />
            </div>
            <div className="tp-auth-field">
              <label htmlFor="message">訊息 *</label>
              <textarea id="message" className="tp-auth-textarea" placeholder="請描述你的需求、活動日期、預計人數或訂單編號…" />
            </div>
            <button type="submit" className="tp-btn tp-btn-primary">送出訊息</button>
            <p className="tp-auth-footnote">目前此頁先統一成 MIDAO UI，送出邏輯維持後續串接空間。</p>
          </form>
        </article>

        <div className="tp-editorial-grid">
          {contactCards.map((card) => (
            <article key={card.title} className="tp-editorial-card-soft">
              <h3>{card.title}</h3>
              <p style={{ color: 'var(--tp-text)', fontWeight: 700 }}>{card.value}</p>
              <p>{card.note}</p>
            </article>
          ))}
          <article className="tp-editorial-card">
            <h3>常見捷徑</h3>
            <div className="tp-member-actions-row" style={{ marginTop: 12 }}>
              <Link href="/faq" className="tp-btn tp-btn-ghost">先看 FAQ</Link>
              <Link href="/guide/apply" className="tp-btn tp-btn-ghost">導遊申請</Link>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
