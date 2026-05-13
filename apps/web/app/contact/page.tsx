export default function ContactPage() {
  const contactCards = [
    {
      title: '客服信箱',
      value: 'hello@tourplatform.tw',
      icon: '/images/midao-style/icon-verified.png',
    },
    {
      title: '客服熱線',
      value: '0800-XXX-XXX（平日 9:00-18:00）',
      icon: '/images/midao-style/icon-hotline.png',
    },
    {
      title: '回覆時間',
      value: '一般詢問：1-2 個工作天｜緊急問題（活動當天）：30 分鐘內',
      icon: '/images/midao-style/icon-custom.png',
    },
  ];

  return (
    <main className="tp-container tp-editorial-page">
      <div className="tp-breadcrumb tp-editorial-breadcrumb">首頁 &gt; 聯絡我們</div>

      <section className="tp-contact-grid">
        <div>
          <h1>聯絡我們</h1>
          <p className="tp-editorial-muted">
            有任何問題、合作提案或回饋？歡迎透過以下表單與我們聯繫。我們會在 1-2 個工作天內回覆。
          </p>

          <form className="tp-contact-form">
            <label>
              <span>姓名 *</span>
              <input type="text" placeholder="您的姓名" />
            </label>
            <label>
              <span>電子信箱 *</span>
              <input type="email" placeholder="you@example.com" />
            </label>
            <label>
              <span>主題</span>
              <select>
                <option>一般詢問</option>
                <option>訂單問題</option>
                <option>導遊合作</option>
                <option>企業包團</option>
                <option>媒體合作</option>
                <option>其他</option>
              </select>
            </label>
            <label>
              <span>訊息 *</span>
              <textarea rows={5} placeholder="請輸入您的訊息⋯" />
            </label>
            <button type="submit" className="tp-btn tp-btn-primary tp-contact-submit">
              送出訊息
            </button>
          </form>
        </div>

        <div className="tp-contact-side">
          {contactCards.map((card) => (
            <article key={card.title} className="tp-contact-info-card">
              <img src={card.icon} alt="" aria-hidden="true" className="tp-contact-info-icon" />
              <div>
                <h3>{card.title}</h3>
                <p>{card.value}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
